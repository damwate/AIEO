// AIEO Phase 0 返工 R9 — 共享 ChatGPT 会话跨进程独占锁 v5（票据 fail-closed + 严格 schema + 受控屏障钩子）
//
// 回应第八轮审查双 MAJOR（v3 的 rename 换出不是 CAS）：
//   竞态：A 读到 stale S 后暂停；B 换出 S 并创建新锁 N 持锁；A 恢复后 rename 会把 N 整体
//   移走——世代验证只能"发现"破坏不能"撤销"，N 离开锁路径后 C 可创建 → B、C 双重持锁。
//
// v4 协议（tombstone 确定性票据 + unlink 前世代复核）：
//   - 回收权绑定唯一票据：`tomb-<S.rand>.json`（名字由目标世代内容唯一决定，wx 原子创建）
//     → 同一世代**全协议最多一个存活回收者**；
//   - 票据持有者 unlink 锁路径**之前**必须重读并校验锁内容仍是 S（rand+pid+born_at 全等）；
//     世代已变（他人已完成回收并可能持锁）→ 放弃回收（收敛分支），绝不 unlink；
//   - 协议内安全性论证：S 存在于锁路径期间，任何进程的 wx 创建必然 EEXIST（创建不可能
//     发生），故唯一回收者 unlink 时锁路径上仍是 S——"身份检查与移除"由
//     「原子票据 + 复核 + 协议内无并发创建」三重绑定；
//   - 外部违反协议（人工/越权进程在 S 存在时强行写锁）：复核检测到世代变化并放弃 unlink
//     （屏障测试覆盖）；复核与 unlink 之间的微秒窗口属无 CAS-delete 原语的理论边界，
//     如实声明（彻底消除需 OS 级字节锁，列 Phase 1 评估）。
//   - 空/损坏锁 fail-closed 保留；unlink 仅发生于 (a) 持有者 release（校验 pid+rand）、
//     (b) 票据持有者对"复核后仍确认为目标世代"的锁、(c) 死亡票据的重建清理。
//
// R9 追加修复（回应第九轮审查）：
//   1. 票据初始化窗口 fail-closed：票据文件为空/损坏/缺字段时，竞争者**视为状态不明**，
//      抛 SESSION_LOCK_CONFLICT 拒绝执行，绝不按"死票据"删除（v4 曾误删）；
//   2. 严格 schema：锁文件必须有 pid(number)+rand(string)+born_at(string)，
//      票据必须有 pid(number)+target_generation(string)；缺字段/类型错 → 状态不明 fail-closed，
//      杜绝 tomb-undefined 类票据；
//   3. 受控屏障钩子：createExclusiveWithContent 在 wx 创建与 writeSync 之间可选暂停
//      （仅当环境变量 AIEO_LOCK_PAUSE_FILE 指向的文件存在时；生产不设置该变量=零影响），
//      用于以真实多进程测试复现并验证初始化窗口的 fail-closed 语义。

import { openSync, writeSync, closeSync, readFileSync, unlinkSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const LOCK_PATH_DEFAULT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "runtime", "locks", "gpt-session.lock");
const MAX_ATTEMPTS = 5;
const CORRUPT_RETRY_MS = 150;
const TICKET_RETRY = 3;

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

/**
 * wx 原子创建并经同一 fd 写入完整内容。
 * 受控屏障钩子：AIEO_LOCK_PAUSE_FILE 指向的文件存在时，在创建与写入之间同步等待
 * （上限 30s），用于多进程测试复现"文件已存在但内容未写"的初始化窗口并验证
 * 竞争者的 fail-closed 语义。生产环境不设置该变量 = 零影响。
 */
function createExclusiveWithContent(path, content) {
  const fd = openSync(path, "wx");
  try {
    const pauseFile = process.env.AIEO_LOCK_PAUSE_FILE;
    if (pauseFile) {
      for (let i = 0; i < 3000 && !existsSync(pauseFile); i++) {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10); // 10ms 同步等待
      }
    }
    writeSync(fd, content);
  } finally {
    closeSync(fd);
  }
}

/**
 * 严格 schema 读取（R9）：字段缺失/类型错误一律返回 null（= 状态不明，调用方必须 fail-closed）。
 * 锁文件：pid(number) + rand(string) + born_at(string)；票据：pid(number) + target_generation(string)。
 */
function readJsonFile(path, kind = "lock") {
  try {
    const raw = readFileSync(path, "utf8");
    if (!raw.trim()) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.pid !== "number") return null;
    if (kind === "lock") {
      if (typeof parsed.rand !== "string" || !parsed.rand) return null;
      if (typeof parsed.born_at !== "string" || !parsed.born_at) return null;
    } else {
      if (typeof parsed.target_generation !== "string" || !parsed.target_generation) return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function tombstonePathFor(lockPath, staleGen) {
  return join(dirname(lockPath), `tomb-${staleGen.rand}.json`); // 由目标世代内容唯一决定
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 回收第 1 步：原子创建目标世代 S 的唯一票据。
 * @returns {{ticketPath: string, ticket: object}}
 * @throws SESSION_LOCK_CONFLICT（票据被存活进程持有 / 重建竞争超限）
 */
export function createReapTicket(lockPath, staleGen) {
  const ticketPath = tombstonePathFor(lockPath, staleGen);
  const ticket = { pid: process.pid, holder: "reaper", target_generation: staleGen.rand, born_at: new Date().toISOString() };
  for (let attempt = 1; attempt <= TICKET_RETRY; attempt++) {
    try {
      createExclusiveWithContent(ticketPath, JSON.stringify(ticket, null, 2));
      return { ticketPath, ticket };
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
      // R9：票据状态三分类——null（空/损坏/初始化中）一律 fail-closed，绝不按"死票据"删除
      // （第九轮审查 MAJOR-1：初始化窗口内的空票据曾被误判并删除，导致双回收者）
      const cur = readJsonFile(ticketPath, "ticket");
      if (!cur) {
        const err = new Error(
          `SESSION_LOCK_CONFLICT: 回收票据状态不明（为空/损坏/初始化中，pid 未知）。按 fail-closed 原则拒绝执行，未删除任何文件，请稍后重试或人工处理。`
        );
        err.code = "SESSION_LOCK_CONFLICT";
        err.reason = "TICKET_STATE_UNKNOWN";
        throw err;
      }
      if (pidAlive(cur.pid)) {
        const err = new Error(
          `SESSION_LOCK_CONFLICT: stale 世代 ${staleGen.rand} 的回收票据被存活进程持有 pid=${cur.pid}。本次拒绝执行。`
        );
        err.code = "SESSION_LOCK_CONFLICT";
        err.holder = cur;
        throw err;
      }
      // 仅"完整解析且持有者已死亡"的票据可清理重建（死亡票据不赋予任何存活进程权利）
      try { unlinkSync(ticketPath); } catch { /* 他人已清理 → 下轮 wx 重建 */ }
    }
  }
  const err = new Error(`SESSION_LOCK_CONFLICT: 回收票据竞争超限（世代 ${staleGen.rand}）。`);
  err.code = "SESSION_LOCK_CONFLICT";
  throw err;
}

/**
 * 回收第 2 步：unlink 前世代复核。
 * @returns {{outcome: "reaped"|"vanished"|"changed", lockNow?: object}}
 *   reaped   — 复核通过并已 unlink 目标世代；
 *   vanished — 锁文件已消失（他人已回收/释放），未做任何改动；
 *   changed  — 锁内容已非目标世代（他人已完成回收并可能持新锁）——**绝不 unlink**。
 */
export function completeReap(lockPath, staleGen, ticketPath) {
  const cur = readJsonFile(lockPath, "lock");
  if (!cur) {
    try { unlinkSync(ticketPath); } catch { /* 清理自己的票据 */ }
    return { outcome: "vanished" };
  }
  const sameGeneration = cur.rand === staleGen.rand && cur.pid === staleGen.pid && cur.born_at === staleGen.born_at;
  if (!sameGeneration) {
    // 世代已变：放弃回收；票据仅对本世代有效，清理之
    try { unlinkSync(ticketPath); } catch { /* 已清理 */ }
    return { outcome: "changed", lockNow: cur };
  }
  unlinkSync(lockPath); // 复核通过：移除目标世代
  try { unlinkSync(ticketPath); } catch { /* 已清理 */ }
  return { outcome: "reaped" };
}

/**
 * 获取会话独占锁（v4）。
 * @returns {{lockPath: string, info: object, release: () => void}}
 * @throws Error(code=SESSION_LOCK_CONFLICT | LOCK_CORRUPT_OR_INITIALIZING)
 */
export function acquireSessionLock(opts = {}) {
  const lockPath = opts.lockPath ?? LOCK_PATH_DEFAULT;
  mkdirSync(dirname(lockPath), { recursive: true });

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const info = { pid: process.pid, holder: opts.holder ?? "unknown", born_at: new Date().toISOString(), rand: randTag() };

    // ---- 第 1 步：wx 原子创建（唯一持锁裁决点） ----
    try {
      createExclusiveWithContent(lockPath, JSON.stringify(info, null, 2));
      return {
        lockPath,
        info,
        release() {
          try {
            const cur = readJsonFile(lockPath, "lock");
            if (cur && cur.pid === process.pid && cur.rand === info.rand) unlinkSync(lockPath);
          } catch {
            try { unlinkSync(lockPath); } catch { /* 已不存在 */ }
          }
        },
      };
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
    }

    // ---- 第 2 步：锁被占——读取并裁决 ----
    let cur = null;
    let corruptStrikes = 0;
    while (!(cur = readJsonFile(lockPath, "lock"))) {
      corruptStrikes++;
      if (corruptStrikes >= 3) {
        const err = new Error(
          `LOCK_CORRUPT_OR_INITIALIZING: 锁文件为空或损坏（可能正被其他进程初始化，或遭外部破坏）。按 fail-closed 原则拒绝执行，未删除任何文件。`
        );
        err.code = "LOCK_CORRUPT_OR_INITIALIZING";
        throw err;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, CORRUPT_RETRY_MS);
    }
    // R9：schema 不完整（如只有 pid 缺 rand/born_at）的锁 → 世代标识无效，拒绝回收并保留现场
    if (typeof cur.rand !== "string" || !cur.rand || typeof cur.born_at !== "string" || !cur.born_at) {
      const err = new Error(
        `LOCK_CORRUPT_OR_INITIALIZING: 锁文件缺少世代标识（rand/born_at 缺失或类型错误）。按 fail-closed 原则拒绝回收并保留现场。`
      );
      err.code = "LOCK_CORRUPT_OR_INITIALIZING";
      err.holder = cur;
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

    // ---- 第 3 步：stale（PID 已死）→ 票据回收 ----
    const { ticketPath } = createReapTicket(lockPath, cur);
    completeReap(lockPath, cur, ticketPath);
    // reaped / vanished / changed 均回到第 1 步（changed 时他人可能持锁，下轮读取裁决）
  }

  const err = new Error(`SESSION_LOCK_CONFLICT: ${MAX_ATTEMPTS} 次尝试未能获取会话锁，本次拒绝执行。`);
  err.code = "SESSION_LOCK_CONFLICT";
  throw err;
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
