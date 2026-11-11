// AIEO Phase 0 返工 R5 — 共享 ChatGPT 会话的跨进程独占锁
//
// 回应第五轮审查 MAJOR：pre-send 生成门依赖"同一会话同一时刻仅一个在途任务"，
// 但该纪律此前未被代码强制——两个自动化实例可同时通过 pre-send 检查并各自发送。
//
// 机制：
//   - 锁文件 runtime/locks/gpt-session.lock，O_EXCL（wx）原子创建；
//   - 内容 JSON：{ pid, holder, acquired_at }；
//   - 冲突判定：锁存在且其 pid 仍存活 → SESSION_LOCK_CONFLICT，**拒绝执行**（不等待、不抢占）；
//   - 死进程残留锁（pid 已不存在）→ 视为 stale，安全回收并留痕；
//   - 获取时机：连接/操作共享 Chrome 之前；持有覆盖 pre-send 检查、发送、完整回复收集；finally 释放。
//
// 边界（如实声明）：本锁只保证"自动化实例之间"互斥。人工在共享浏览器窗口上的并发操作
// 不受锁保护，仍依赖结构性判定（pre-send 生成门、完成 6 项判定）兜底并可能触发 fail-safe。

import { openSync, closeSync, readFileSync, writeFileSync, unlinkSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// 默认锁路径：由本模块位置推导（AIEO 根/runtime/locks/），不依赖调用方 cwd
export const LOCK_PATH_DEFAULT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "runtime", "locks", "gpt-session.lock");

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM"; // 存在但无权限 → 视为存活
  }
}

/**
 * 获取会话独占锁。
 * @param {{lockPath?: string, holder?: string}} opts
 * @returns {{lockPath: string, info: object, release: () => void}}
 * @throws Error(code=SESSION_LOCK_CONFLICT) 当锁被存活进程持有时（必须拒绝执行）
 */
export function acquireSessionLock(opts = {}) {
  const lockPath = opts.lockPath ?? LOCK_PATH_DEFAULT;
  mkdirSync(dirname(lockPath), { recursive: true });

  if (existsSync(lockPath)) {
    let info = null;
    try {
      info = JSON.parse(readFileSync(lockPath, "utf8"));
    } catch {
      info = null; // 内容损坏也按 stale 处理（无法证明持有者存活）
    }
    if (info && typeof info.pid === "number" && pidAlive(info.pid)) {
      const err = new Error(
        `SESSION_LOCK_CONFLICT: 会话锁被存活进程持有 pid=${info.pid} holder=${info.holder || "?"} acquired_at=${info.acquired_at}。同一 ChatGPT 会话同一时刻只允许一个在途任务，本次拒绝执行。`
      );
      err.code = "SESSION_LOCK_CONFLICT";
      err.holder = info;
      throw err;
    }
    // stale：持锁进程已死亡（或锁内容损坏）→ 回收
    try { unlinkSync(lockPath); } catch { /* 下一步 wx 创建会给出真实结果 */ }
  }

  const info = {
    pid: process.pid,
    holder: opts.holder ?? "unknown",
    acquired_at: new Date().toISOString(),
  };
  let fd;
  try {
    fd = openSync(lockPath, "wx"); // O_EXCL：已存在则抛 EEXIST（与其他进程竞争的原子裁决点）
  } catch (e) {
    if (e.code === "EEXIST") {
      // 极小窗口内被他人抢先：按冲突处理（读取其 pid 再次裁决，存活则拒）
      try {
        const other = JSON.parse(readFileSync(lockPath, "utf8"));
        if (other && typeof other.pid === "number" && pidAlive(other.pid)) {
          const err = new Error(`SESSION_LOCK_CONFLICT: 会话锁被存活进程持有 pid=${other.pid} holder=${other.holder || "?"}。本次拒绝执行。`);
          err.code = "SESSION_LOCK_CONFLICT";
          err.holder = other;
          throw err;
        }
        // 抢到 stale 锁的进程已死 → 回收后由调用方重试一次
        const err = new Error("SESSION_LOCK_STALE_RACE: 竞争到 stale 锁，请重试获取");
        err.code = "SESSION_LOCK_STALE_RACE";
        throw err;
      } catch (inner) {
        if (inner.code === "SESSION_LOCK_CONFLICT" || inner.code === "SESSION_LOCK_STALE_RACE") throw inner;
        const err = new Error("SESSION_LOCK_STALE_RACE: 竞争到无法解析的锁，请重试获取");
        err.code = "SESSION_LOCK_STALE_RACE";
        throw err;
      }
    }
    throw e;
  }
  writeFileSync(lockPath, JSON.stringify(info, null, 2), "utf8");
  if (fd !== undefined) { try { closeSync(fd); } catch { /* 已写完即关闭失败无碍 */ } }

  let released = false;
  return {
    lockPath,
    info,
    release() {
      if (released) return;
      released = true;
      try {
        const cur = JSON.parse(readFileSync(lockPath, "utf8"));
        if (cur.pid === process.pid) unlinkSync(lockPath); // 只释放自己的锁
      } catch {
        try { unlinkSync(lockPath); } catch { /* 已不存在 */ }
      }
    },
  };
}

/** 便捷封装：withSessionLock(async () => {...})，finally 自动释放。 */
export async function withSessionLock(fn, opts = {}) {
  const lock = acquireSessionLock(opts);
  try {
    return await fn(lock);
  } finally {
    lock.release();
  }
}
