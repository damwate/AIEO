// AIEO Phase 0 返工 R7 — 共享 ChatGPT 会话跨进程独占锁 v3
//
// 回应第七轮审查 MAJOR（v2 残留两竞态）：
//   竞态1：intent 文件自身有"wx 建空文件→writeSync"窗口，listIntents 遇解析失败静默忽略
//          → 双回收者。→ v3 **彻底取消 intent/选举机制**。
//   竞态2："重读→unlink" TOCTOU：二次验证与 unlink 之间他人可建新锁，迟到回收者按路径
//          unlink 会删除新锁。→ v3 **回收不再对锁路径执行 unlink**，改为 rename 原子换出。
//
// v3 回收协议（rename 换出 + 世代验证）：
//   1. 读锁内容 S（含创建时唯一 rand）→ PID 已死才进入回收；
//   2. renameSync(lockPath → quarantine-<S.rand>-<myRand>.tmp)：原子；
//      - 成功：锁路径上"我读到的那个世代"被整体移走（不是按内容删，是按路径整体迁移）；
//      - ENOENT：他人已换出/释放 → 重试循环；
//   3. 验证 quarantine 内容 === S（世代校验）。协议内不可能不匹配（锁内容从不原地修改，
//      只能被整体换出）——若不匹配即外部篡改，fail-closed 报 LOCK_QUARANTINE_MISMATCH；
//   4. 回到 wx 原子创建（唯一持锁裁决点，两进程不可能同时进入临界区）。
//
// 不变量：unlink 只发生在 (a) 持有者 release（校验 pid+rand 归属）、(b) 持有者对"自己换出的
// quarantine 文件"的清理。任何进程都不会对"锁路径"执行无条件 unlink——迟到回收者面对的
// 要么是 ENOENT（旧锁已走），要么是 LIVE 内容（冲突拒绝），不可能删除新锁。
//
// 失败语义：空/损坏锁 fail-closed（LOCK_CORRUPT_OR_INITIALIZING，有限内重试后仍失败则抛出，
// 绝不删除）；世代不匹配 fail-closed（LOCK_QUARANTINE_MISMATCH）。
// 边界：本锁保证自动化实例间互斥；人工在共享窗口的并发操作由结构性判定兜底（如实声明）。

import { openSync, writeSync, closeSync, readFileSync, unlinkSync, mkdirSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const LOCK_PATH_DEFAULT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "runtime", "locks", "gpt-session.lock");
const QUARANTINE_PREFIX = "quarantine-";
const MAX_ATTEMPTS = 5;
const CORRUPT_RETRY_MS = 150;

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

/** wx 原子创建并经同一 fd 写入完整内容 */
function createExclusiveWithContent(path, content) {
  const fd = openSync(path, "wx");
  try {
    writeSync(fd, content);
  } finally {
    closeSync(fd);
  }
}

/** 读取并解析锁文件；空/损坏返回 null */
function readLockFile(path) {
  try {
    const raw = readFileSync(path, "utf8");
    if (!raw.trim()) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.pid !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 获取会话独占锁（v3）。
 * @returns {{lockPath: string, info: object, release: () => void}}
 * @throws Error(code=SESSION_LOCK_CONFLICT | LOCK_CORRUPT_OR_INITIALIZING | LOCK_QUARANTINE_MISMATCH)
 */
export function acquireSessionLock(opts = {}) {
  const lockPath = opts.lockPath ?? LOCK_PATH_DEFAULT;
  mkdirSync(dirname(lockPath), { recursive: true });

  let myQuarantine = null; // 本进程换出的 stale 世代隔离文件（成功持锁后清理）
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const info = { pid: process.pid, holder: opts.holder ?? "unknown", born_at: new Date().toISOString(), rand: randTag() };

    // ---- 第 1 步：wx 原子创建（唯一持锁裁决点），内容经同一 fd 写入 ----
    try {
      createExclusiveWithContent(lockPath, JSON.stringify(info, null, 2));
      // 成功持锁：清理本进程换出的隔离文件（名字含唯一 myRand，仅本进程会触碰）
      if (myQuarantine) {
        try { unlinkSync(myQuarantine); } catch { /* 已不存在 */ }
        myQuarantine = null;
      }
      return {
        lockPath,
        info,
        release() {
          try {
            const cur = readLockFile(lockPath);
            if (cur && cur.pid === process.pid && cur.rand === info.rand) unlinkSync(lockPath);
          } catch {
            try { unlinkSync(lockPath); } catch { /* 已不存在 */ }
          }
        },
      };
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
    }

    // ---- 第 2 步：读取并裁决。空/损坏 → 有限重试后 fail-closed，绝不删除 ----
    let cur = null;
    let corruptStrikes = 0;
    while (!(cur = readLockFile(lockPath))) {
      corruptStrikes++;
      if (corruptStrikes >= 3) {
        const err = new Error(
          `LOCK_CORRUPT_OR_INITIALIZING: 锁文件为空或损坏（可能正被其他进程初始化，或遭外部破坏）。按 fail-closed 原则拒绝执行，未删除任何文件。`
        );
        err.code = "LOCK_CORRUPT_OR_INITIALIZING";
        throw err;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, CORRUPT_RETRY_MS); // 同步等待
    }

    // ---- 第 3 步：存活持有者 → 冲突拒绝 ----
    if (pidAlive(cur.pid)) {
      const err = new Error(
        `SESSION_LOCK_CONFLICT: 会话锁被存活进程持有 pid=${cur.pid} holder=${cur.holder || "?"} born_at=${cur.born_at}。同一 ChatGPT 会话同一时刻只允许一个在途任务，本次拒绝执行。`
      );
      err.code = "SESSION_LOCK_CONFLICT";
      err.holder = cur;
      throw err;
    }

    // ---- 第 4 步：stale → rename 原子换出 + 世代验证（不对锁路径 unlink） ----
    const myRand = randTag();
    const quarantinePath = join(dirname(lockPath), `${QUARANTINE_PREFIX}${cur.rand}-${myRand}.tmp`);
    myQuarantine = quarantinePath;
    try {
      renameSyncAtomic(lockPath, quarantinePath); // ENOENT → 他人已换出/释放
    } catch (e) {
      if (e.code === "ENOENT") continue; // 锁已消失，重试
      throw e;
    }
    // 世代校验：换出的必须是我读到的那个世代（协议内必然成立；不匹配=外部篡改）
    const moved = readLockFile(quarantinePath);
    if (!moved || moved.rand !== cur.rand || moved.pid !== cur.pid) {
      const err = new Error(
        `LOCK_QUARANTINE_MISMATCH: 换出的锁内容与验证世代不一致（疑似外部篡改或协议外写入）。已保留现场 quarantine=${quarantinePath}，拒绝继续。`
      );
      err.code = "LOCK_QUARANTINE_MISMATCH";
      err.quarantine = quarantinePath;
      throw err;
    }
    // 换出成功 → lockPath 已不存在 → 回到第 1 步（与其他进程公平竞争 wx 创建）
  }

  const err = new Error(`SESSION_LOCK_CONFLICT: ${MAX_ATTEMPTS} 次尝试未能获取会话锁，本次拒绝执行。`);
  err.code = "SESSION_LOCK_CONFLICT";
  throw err;
}

/** 同目录原子 rename（同卷保证原子；目标名含唯一随机数，绝不覆盖他人文件） */
function renameSyncAtomic(from, to) {
  renameSync(from, to);
}

/** 便捷封装 */
export async function withSessionLock(fn, opts = {}) {
  const lock = acquireSessionLock(opts);
  try {
    return await fn(lock);
  } finally {
    lock.release();
  }
}
