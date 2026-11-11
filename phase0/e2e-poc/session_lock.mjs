// AIEO Phase 0 返工 R6 — 共享 ChatGPT 会话跨进程独占锁 v2
//
// 回应第六轮审查 MAJOR（v1 的两个竞态）：
//   竞态1（初始化窗口）：v1 先 wx 建空文件、再按"路径"写内容——窗口内他人读到空文件
//          会误判 stale 并 unlink，导致双重持锁。
//   → v2 修复：内容**先在内存组装**，openSync(wx) 后立即经**同一 fd writeSync 写入**再关闭；
//          极小残留窗口内的空/损坏锁对竞争者 **fail-closed**（LOCK_CORRUPT_OR_INITIALIZING），
//          绝不删除（按审查要求）。
//   竞态2（stale 回收）：v1 "读 PID→unlink" 非原子，多个回收者可删掉他人新建的锁。
//   → v2 修复：意图票据（intent ticket）仲裁——回收候选者先原子创建自己的 intent 文件
//          （wx），仅当不存在"更早创建且进程仍存活"的其他 intent 时才成为唯一回收者；
//          回收者在 unlink 前**重读锁内容并二次验证 PID 仍死亡**；非回收者一律 fail-closed
//          拒绝。最终持锁只能由 wx 原子创建决定——两个进程不可能同时进入临界区。
//
// 失败语义（fail-closed 优先）：任何无法证明安全的情形都抛错拒绝执行，绝不删除可疑锁。
// 边界：本锁保证自动化实例间互斥；人工在共享窗口的并发操作由结构性判定兜底（如实声明）。

import { openSync, writeSync, closeSync, readFileSync, writeFileSync, unlinkSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const LOCK_PATH_DEFAULT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "runtime", "locks", "gpt-session.lock");

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
}

function randTag() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 通过 wx 句柄原子创建并经同一 fd 写入完整内容（消除初始化窗口的主要内容竞争） */
function createExclusiveWithContent(path, content) {
  const fd = openSync(path, "wx"); // EEXIST → 他人抢先（原子裁决点）
  try {
    writeSync(fd, content);
  } finally {
    closeSync(fd);
  }
}

/** 读取并解析锁文件；空/损坏返回 null（调用方必须 fail-closed） */
function readLockFile(path) {
  try {
    const raw = readFileSync(path, "utf8");
    if (!raw.trim()) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.pid !== "number") return null;
    return parsed;
  } catch {
    return null; // 读取中消失/损坏
  }
}

function intentDirOf(lockPath) {
  return join(dirname(lockPath), "intents");
}

/** 列出当前所有 intent（文件名含随机数避免覆盖），解析失败的忽略 */
function listIntents(lockPath) {
  const dir = intentDirOf(lockPath);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.startsWith("intent-") && f.endsWith(".json"))
    .map((f) => {
      try {
        const j = JSON.parse(readFileSync(join(dir, f), "utf8"));
        return { file: f, ...j };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function isLowerOrder(a, b) {
  // 越早创建越优先；同刻比 PID，保证全序
  if (a.born_at !== b.born_at) return a.born_at < b.born_at;
  return a.pid < b.pid;
}

/**
 * 获取会话独占锁（v2 协议）。
 * @returns {{lockPath: string, info: object, release: () => void}}
 * @throws Error(code=SESSION_LOCK_CONFLICT | LOCK_CORRUPT_OR_INITIALIZING) —— 均为 fail-closed，调用方必须拒绝执行
 */
export function acquireSessionLock(opts = {}) {
  const lockPath = opts.lockPath ?? LOCK_PATH_DEFAULT;
  mkdirSync(dirname(lockPath), { recursive: true });
  const MAX_ATTEMPTS = 3;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // ---- 第 1 步：wx 原子创建（唯一持锁裁决点），内容经同一 fd 写入 ----
    const info = { pid: process.pid, holder: opts.holder ?? "unknown", born_at: new Date().toISOString(), rand: randTag() };
    try {
      createExclusiveWithContent(lockPath, JSON.stringify(info, null, 2));
      return {
        lockPath,
        info,
        release() {
          try {
            const cur = readLockFile(lockPath);
            if (cur && cur.pid === process.pid && cur.rand === info.rand) unlinkSync(lockPath); // 只释放自己
          } catch {
            try { unlinkSync(lockPath); } catch { /* 已不存在 */ }
          }
        },
      };
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
    }

    // ---- 第 2 步：锁已被占——读取并裁决（空/损坏 → fail-closed，绝不删除） ----
    const cur = readLockFile(lockPath);
    if (!cur) {
      const err = new Error(
        `LOCK_CORRUPT_OR_INITIALIZING: 锁文件为空或损坏（可能正被其他进程初始化，或遭外部破坏）。按 fail-closed 原则拒绝执行，未删除任何文件。`
      );
      err.code = "LOCK_CORRUPT_OR_INITIALIZING";
      throw err;
    }
    if (pidAlive(cur.pid)) {
      const err = new Error(
        `SESSION_LOCK_CONFLICT: 会话锁被存活进程持有 pid=${cur.pid} holder=${cur.holder || "?"} born_at=${cur.born_at}。同一 ChatGPT 会话同一时刻只允许一个在途任务，本次拒绝执行。`
      );
      err.code = "SESSION_LOCK_CONFLICT";
      err.holder = cur;
      throw err;
    }

    // ---- 第 3 步：stale 锁（PID 已死）→ 意图票据仲裁，仅唯一回收者可行动 ----
    mkdirSync(intentDirOf(lockPath), { recursive: true });
    const myIntent = { pid: process.pid, born_at: new Date().toISOString(), rand: randTag(), holder: opts.holder ?? "unknown" };
    const myIntentFile = join(intentDirOf(lockPath), `intent-${process.pid}-${info.rand}-${attempt}.json`);
    createExclusiveWithContent(myIntentFile, JSON.stringify(myIntent, null, 2)); // 原子登记
    try {
      const rivals = listIntents(lockPath).filter((i) => i.pid !== process.pid && pidAlive(i.pid));
      const lower = rivals.find((i) => isLowerOrder(i, myIntent));
      if (lower) {
        const err = new Error(
          `SESSION_LOCK_CONFLICT: 检测到 stale 锁，且回收权归属更早的存活竞争者 pid=${lower.pid}。本次拒绝执行（fail-closed）。`
        );
        err.code = "SESSION_LOCK_CONFLICT";
        err.holder = lower;
        throw err;
      }
      // 我是唯一回收者：unlink 前重读锁，二次验证 PID 仍死亡
      const again = readLockFile(lockPath);
      if (!again || pidAlive(again.pid)) {
        // 锁已消失或被存活者重建：回到第 1 步重试（有限次）
        continue;
      }
      try { unlinkSync(lockPath); } catch { /* 已消失，进入重试 */ }
      // 清理死进程遗留的 intent（含本次目标）
      for (const i of listIntents(lockPath)) {
        if (!pidAlive(i.pid)) {
          try { unlinkSync(join(intentDirOf(lockPath), i.file)); } catch { /* 竞争删除无碍 */ }
        }
      }
      // 回到循环第 1 步：wx 创建成为唯一持锁裁决
    } finally {
      // 无论结果如何，清理自己的 intent（若有）
      try { unlinkSync(myIntentFile); } catch { /* 已被回收或不存在 */ }
    }
  }

  const err = new Error(`SESSION_LOCK_CONFLICT: ${MAX_ATTEMPTS} 次尝试未能获取会话锁（持续竞争/异常状态），本次拒绝执行。`);
  err.code = "SESSION_LOCK_CONFLICT";
  throw err;
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
