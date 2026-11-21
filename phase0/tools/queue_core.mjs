// Queue Service Phase B 骨架核心（DEC-141 授权，设计=parallel_queue_design_r1.md R6 终验版）。
// 职责：TaskQueue 权威账本 + InstancePool + Execution 记录 + 原子认领 + C9_CHECKING 调用 +
//       崩溃恢复窗口表（W0-A/W0-B/W1/W2）。四域边界：队列管任务、实例池管窗口、
//       C9 调用既有 accountGateCheck（零重写）、C6 字段随 Execution 落盘。
// 零浏览器代码：本模块不 import playwright、不触 ChatGPT（Phase B 影子语义——EXECUTING 由外部派单驱动）。
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  accountStatePath, evaluateAccountGate, normalizeAccountState,
  readAccountStateFile, resolveAccountLockTimeoutMs,
} from "./dispatch_options.mjs";
import { acquireSessionLock } from "../e2e-poc/session_lock.mjs";

export const TASK_STATUSES = Object.freeze([
  "READY", "CLAIMED", "C9_CHECKING", "EXECUTING", "REPORTED",
  "VERIFIED", "VERIFIED_FAIL", "BLOCKED", "DEFERRED",
]);
export const SEND_STATES = Object.freeze(["NOT_SENT", "SEND_ATTEMPTED", "SEND_CONFIRMED"]);
export const RECOVERY_STATES = Object.freeze(["NONE", "PENDING_VERIFY", "RECOVERED", "MANUAL_REQUIRED"]);
export const CHECKPOINTS = Object.freeze(["CLAIMED", "C9_PASS", "SENT", "GENERATING", "COLLECTING"]);
export const INSTANCE_STATUSES = Object.freeze(["IDLE", "BUSY", "ERROR", "OFFLINE", "PAUSED"]);
export const ACCOUNT_GATES = Object.freeze(["ALLOWED", "BACKOFF", "VERIFICATION_HOLD"]);
// R6 §⑤：VerificationState（判定器/c6）→ AccountGateState（池门）映射（P1-3）
export const VERIFICATION_STATES = Object.freeze([
  "VERIFICATION_NORMAL", "VERIFICATION_SUSPECTED", "VERIFICATION_REQUIRED", "VERIFICATION_UNKNOWN_BLOCK",
]);
export function verificationToGate(vs) {
  // 映射表（DEC-137 R3 P1-3 裁定）：NORMAL→ALLOWED 还须满足其他门禁条件（BACKOFF 独立判定）
  if (vs === "VERIFICATION_NORMAL") return "ALLOWED";
  if (vs === "VERIFICATION_SUSPECTED" || vs === "VERIFICATION_REQUIRED" || vs === "VERIFICATION_UNKNOWN_BLOCK") {
    return "VERIFICATION_HOLD";
  }
  throw Object.assign(new Error(`ACCOUNT_STATE_INVALID: 未知 VerificationState: ${vs}`), { code: "ACCOUNT_STATE_INVALID" });
}

function queueError(code, message, details = undefined) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  if (details !== undefined) error.details = details;
  return error;
}

// ---------- 路径（root 可注入供测试隔离；生产=AIEO_ROOT） ----------
export function queuePaths(aieoRoot) {
  const dir = join(aieoRoot, "runtime", "queue");
  return {
    dir,
    ledger: join(dir, "task-ledger.json"),
    executions: join(dir, "executions.json"),
    pool: join(dir, "instance-pool.json"),
  };
}

// ---------- 原子读写（M1/端口注册表同模式：tmp+rename+回读） ----------
function readJsonFile(path, { allowMissing = true, defaultValue = undefined } = {}) {
  if (!existsSync(path)) {
    if (allowMissing) return defaultValue;
    throw queueError("QUEUE_FILE_MISSING", `队列状态文件缺失且不允许缺省: ${path}`);
  }
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw queueError("QUEUE_FILE_INVALID", `队列状态文件读取/解析失败，禁静默当作空: ${path} ${error.message}`);
  }
}
function writeJsonFileAtomic(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.${Date.now()}.tmp`;
  try {
    writeFileSync(temp, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    const readback = JSON.parse(readFileSync(temp, "utf8"));
    if (JSON.stringify(readback) !== JSON.stringify(data)) throw new Error("readback mismatch");
    renameSync(temp, path);
  } catch (error) {
    try { renameSync(temp, `${temp}.orphan`); } catch {}
    throw queueError("QUEUE_WRITE_FAILED", `队列状态文件原子写入失败: ${path} ${error.message}`);
  }
}
// 有界重试锁（C9 验收 R1 ②同模式：60s 上限+50-100ms 随机退避；最终冲突向上抛由调用方降级）
function acquireLockWithRetry(lockPath, holder, timeoutRaw) {
  const timeoutMs = resolveAccountLockTimeoutMs(timeoutRaw);
  const startedAt = Date.now();
  for (;;) {
    if (Date.now() - startedAt >= timeoutMs) {
      const err = new Error(`SESSION_LOCK_CONFLICT: 队列锁重试窗口（${timeoutMs}ms）耗尽: ${lockPath}`);
      err.code = "SESSION_LOCK_CONFLICT";
      throw err;
    }
    try {
      return acquireSessionLock({ holder, lockPath });
    } catch (error) {
      if (error.code !== "SESSION_LOCK_CONFLICT") throw error;
      const remain = timeoutMs - (Date.now() - startedAt);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Math.min(remain, 50 + Math.floor(Math.random() * 50)));
    }
  }
}

// ---------- 账本结构校验（Q-01 状态归属分离：Task 生命周期/Execution 过程/Instance 健康/Pool 门禁分实体） ----------
function validateLedgerShape(l) {
  if (l?.version !== 1 || typeof l?.tasks !== "object" || l?.tasks === null || Array.isArray(l.tasks)) {
    throw queueError("QUEUE_FILE_INVALID", "任务账本结构无效");
  }
}
function validateExecutionsShape(e) {
  if (e?.version !== 1 || !Array.isArray(e?.executions)) throw queueError("QUEUE_FILE_INVALID", "Execution 账本结构无效");
}
function validatePoolShape(p) {
  if (p?.version !== 1 || typeof p?.instances !== "object" || p?.instances === null || Array.isArray(p.instances)) {
    throw queueError("QUEUE_FILE_INVALID", "实例池结构无效");
  }
}

// ---------- InstancePool ----------
export function seedInstance({ aieoRoot, instanceId, profileDir, debugPort, lockPath, loginValidated = false }) {
  const paths = queuePaths(aieoRoot);
  const lock = acquireLockWithRetry(`${paths.pool}.lockfile`, `queue-seed:${instanceId}`);
  try {
    const pool = readJsonFile(paths.pool, { defaultValue: { version: 1, instances: {} } });
    validatePoolShape(pool);
    const now = new Date().toISOString();
    const prev = pool.instances[instanceId];
    pool.instances[instanceId] = {
      instance_id: instanceId, profile_dir: profileDir, debug_port: debugPort, lock_path: lockPath,
      status: "IDLE", pause_reason: null,
      login_validated: loginValidated || (prev?.login_validated === true),
      last_health_check: now, consecutive_fail: 0,
      seeded_at: prev?.seeded_at ?? now,
    };
    writeJsonFileAtomic(paths.pool, pool);
    return pool.instances[instanceId];
  } finally {
    lock.release();
  }
}

// ---------- Task ----------
export function createTask({ aieoRoot, taskId, title = "", kind = "code", payloadRef = "", branch = null, priority = 0, deps = [] }) {
  const paths = queuePaths(aieoRoot);
  const lock = acquireLockWithRetry(`${paths.ledger}.lockfile`, `queue-create:${taskId}`);
  try {
    const ledger = readJsonFile(paths.ledger, { defaultValue: { version: 1, tasks: {} } });
    validateLedgerShape(ledger);
    if (ledger.tasks[taskId]) throw queueError("TASK_ALREADY_EXISTS", `任务已存在: ${taskId}`);
    if (deps.some((d) => !ledger.tasks[d])) throw queueError("TASK_DEP_UNKNOWN", `依赖任务不存在: ${deps.join(",")}`);
    const now = new Date().toISOString();
    ledger.tasks[taskId] = {
      task_id: taskId, title, kind, payload_ref: payloadRef, branch,
      priority, deps: [...deps], status: "READY", claimed_by: null, claim_token: null,
      attempts: 0, rework_of: null, created_at: now, updated_at: now,
    };
    writeJsonFileAtomic(paths.ledger, ledger);
    return ledger.tasks[taskId];
  } finally {
    lock.release();
  }
}

/**
 * 原子认领（Q-04：单一账本+原子唯一认领；双入口同接口）。
 * 前置：任务 READY、deps 全 VERIFIED、实例 IDLE 且 login_validated、idempotency_key 无在途。
 * 成功=账本写 CLAIMED+claim_token（uuid）+claimed_by；写失败禁派发（异常向上抛）。
 */
export function claimTask({ aieoRoot, taskId, instanceId, token = null }) {
  const paths = queuePaths(aieoRoot);
  const claimToken = token ?? crypto.randomUUID();
  const lock = acquireLockWithRetry(`${paths.ledger}.lockfile`, `queue-claim:${taskId}:${instanceId}`);
  try {
    const ledger = readJsonFile(paths.ledger, { defaultValue: { version: 1, tasks: {} } });
    validateLedgerShape(ledger);
    const task = ledger.tasks[taskId];
    if (!task) throw queueError("TASK_NOT_FOUND", `任务不存在: ${taskId}`);
    if (task.status !== "READY") throw queueError("TASK_NOT_READY", `任务非 READY（${task.status}），禁认领: ${taskId}`);
    const unmet = (task.deps || []).filter((d) => ledger.tasks[d]?.status !== "VERIFIED");
    if (unmet.length > 0) throw queueError("TASK_DEPS_UNMET", `依赖未验收: ${unmet.join(",")}`);
    const pool = readJsonFile(paths.pool, { defaultValue: { version: 1, instances: {} } });
    validatePoolShape(pool);
    const inst = pool.instances[instanceId];
    if (!inst) throw queueError("INSTANCE_UNKNOWN", `实例未入池: ${instanceId}`);
    if (inst.status !== "IDLE") throw queueError("INSTANCE_NOT_IDLE", `实例非空闲（${inst.status}）: ${instanceId}`);
    if (inst.login_validated !== true) throw queueError("INSTANCE_LOGIN_UNVALIDATED", `实例登录态未验收: ${instanceId}`);
    // 幂等：同 task 有效 EXECUTING 在途→禁重复派发（Q-04 防双执行）
    const execs = readJsonFile(paths.executions, { defaultValue: { version: 1, executions: [] } });
    validateExecutionsShape(execs);
    const idemKey = `${taskId}:${instanceId}`;
    if (execs.executions.some((e) => e.task_id === taskId && e.recovery_state !== "MANUAL_REQUIRED" && ["EXECUTING", "COLLECTING"].includes(e.last_checkpoint))) {
      throw queueError("TASK_IN_FLIGHT", `任务在途（Execution 未收口），禁重复派发: ${taskId}`);
    }
    task.status = "CLAIMED";
    task.claimed_by = instanceId;
    task.claim_token = claimToken;
    task.attempts += 1;
    task.updated_at = new Date().toISOString();
    writeJsonFileAtomic(paths.ledger, ledger);
    return { task_id: taskId, instance_id: instanceId, claim_token: claimToken, idempotency_key: idemKey };
  } finally {
    lock.release();
  }
}
import crypto from "node:crypto";

/**
 * C9_CHECKING（Q-02：CLAIM 后、浏览器操作前的唯一门禁状态；BLOCKED=零浏览器操作已发生）。
 * ALLOWED → 任务 EXECUTING + Execution 记录创建（checkpoint=C9_PASS）。
 * BLOCKED → 任务回 READY、实例 IDLE（不消耗执行），返回 { allowed:false }。
 */
export function c9CheckAndStart({ aieoRoot, taskId, instanceId, claimToken, dispatchDir = null }) {
  const paths = queuePaths(aieoRoot);
  const lock = acquireLockWithRetry(`${paths.ledger}.lockfile`, `queue-c9:${taskId}`);
  try {
    const ledger = readJsonFile(paths.ledger, { defaultValue: { version: 1, tasks: {} } });
    validateLedgerShape(ledger);
    const task = ledger.tasks[taskId];
    if (!task || task.claim_token !== claimToken) {
      throw queueError("CLAIM_TOKEN_INVALID", "claim_token 不匹配（fencing：旧 token 禁提交）");
    }
    if (task.status !== "CLAIMED") throw queueError("TASK_NOT_CLAIMED", `任务非 CLAIMED: ${taskId} (${task.status})`);
    const gateState = readAccountStateFile(accountStatePath(aieoRoot), Date.now());
    const gate = evaluateAccountGate(gateState);
    const now = new Date().toISOString();
    if (!gate.allowed) {
      // C9 BLOCKED：任务回 READY（零浏览器操作），实例 IDLE
      task.status = "READY";
      task.claimed_by = null;
      task.claim_token = null;
      task.updated_at = now;
      writeJsonFileAtomic(paths.ledger, ledger);
      return { allowed: false, until: gate.until, reason: gate.reason };
    }
    task.status = "EXECUTING";
    task.updated_at = now;
    const execs = readJsonFile(paths.executions, { defaultValue: { version: 1, executions: [] } });
    validateExecutionsShape(execs);
    const execution = {
      execution_id: crypto.randomUUID(),
      attempt_id: task.attempts,
      dispatch_id: dispatchDir ?? null,
      task_id: taskId, instance_id: instanceId,
      idempotency_key: `${taskId}:${instanceId}:${task.attempts}`,
      send_state: "NOT_SENT", recovery_state: "NONE",
      last_checkpoint: "C9_PASS", failure_code: null,
      reply_sha256: null, verdict: null,
      started_at: now, finished_at: null,
      c6: {
        throughput: { claimed_at: now, sent_at: null, completed_at: null, exec_ms: null, queue_wait_ms: null },
        quota: { observed: false, note: "官方无精确余量数字时只记可观测信息，禁自算虚假配额" },
        rate_limit: { observed: false, events: [], state: "NOT_OBSERVED" },
        verification: { state: "VERIFICATION_NORMAL", events: [], human_resolved_at: null },
        isolation: { lock_conflicts: 0, cross_talk: false, foreign_kill: 0 },
        resource: { chrome_procs: null, mem_mb: null, cpu_pct: null },
      },
    };
    execs.executions.push(execution);
    writeJsonFileAtomic(paths.executions, execs);
    writeJsonFileAtomic(paths.ledger, ledger);
    return { allowed: true, execution_id: execution.execution_id };
  } finally {
    lock.release();
  }
}

// ---------- send_state 镜像（权威源=dispatch 归档 send-state.json；不一致以归档为准并登记） ----------
export function mirrorSendState({ aieoRoot, taskId, sendState, dispatchDir = null, checkpoint = "SENT" }) {
  if (!SEND_STATES.includes(sendState)) throw queueError("QUEUE_FILE_INVALID", `send_state 非法: ${sendState}`);
  if (!CHECKPOINTS.includes(checkpoint)) throw queueError("QUEUE_FILE_INVALID", `checkpoint 非法: ${checkpoint}`);
  const paths = queuePaths(aieoRoot);
  const lock = acquireLockWithRetry(`${paths.executions}.lockfile`, `queue-mirror:${taskId}`);
  try {
    const execs = readJsonFile(paths.executions, { defaultValue: { version: 1, executions: [] } });
    validateExecutionsShape(execs);
    const list = execs.executions.filter((e) => e.task_id === taskId);
    const latest = list[list.length - 1];
    if (!latest) throw queueError("EXECUTION_NOT_FOUND", `任务无 Execution 记录: ${taskId}`);
    latest.send_state = sendState;
    latest.last_checkpoint = checkpoint;
    if (dispatchDir) latest.dispatch_id = dispatchDir;
    if (sendState === "SEND_CONFIRMED" && !latest.c6.throughput.sent_at) latest.c6.throughput.sent_at = new Date().toISOString();
    writeJsonFileAtomic(paths.executions, execs);
    return latest;
  } finally {
    lock.release();
  }
}

// ---------- 崩溃恢复（§③ 窗口表：W0-A/W0-B/W1/W2；认领前=账本无痕无需恢复） ----------
/**
 * 扫描 EXECUTING/异常 Execution，按窗口表恢复：
 *   checkpoint=CLAIMED                          → W0-A：任务回 READY（安全释放认领）
 *   checkpoint=C9_PASS 且 send_state≠CONFIRMED   → W0-B：保留现场核实（recovery=MANUAL_REQUIRED，任务 BLOCKED）
 *   send_state=SEND_ATTEMPTED                    → W1：recovery=PENDING_VERIFY（禁自动重发），任务 BLOCKED
 *   send_state=SEND_CONFIRMED 且未 REPORTED      → W2：recovery=PENDING_VERIFY（L-018 补采标记），任务 BLOCKED
 */
export function recoverExecutions({ aieoRoot }) {
  const paths = queuePaths(aieoRoot);
  const results = [];
  const ledgerLock = acquireLockWithRetry(`${paths.ledger}.lockfile`, "queue-recover:ledger");
  try {
    const ledger = readJsonFile(paths.ledger, { defaultValue: { version: 1, tasks: {} } });
    validateLedgerShape(ledger);
    const lockExec = acquireLockWithRetry(`${paths.executions}.lockfile`, "queue-recover:exec");
    try {
      const execs = readJsonFile(paths.executions, { defaultValue: { version: 1, executions: [] } });
      validateExecutionsShape(execs);
      const now = new Date().toISOString();
      // W0-A 账本直扫：CLAIMED 且无 Execution 记录（认领后 C9 前崩溃）→ 回 READY
      for (const [tid, task] of Object.entries(ledger.tasks)) {
        if (task.status === "CLAIMED" && !execs.executions.some((e) => e.task_id === tid)) {
          task.status = "READY"; task.claimed_by = null; task.claim_token = null; task.updated_at = now;
          results.push({ task_id: tid, action: "W0-A→READY(ledger)", send_state: "NOT_SENT", checkpoint: "CLAIMED" });
        }
      }
      for (const e of execs.executions) {
        if (e.recovery_state === "RECOVERED" || e.recovery_state === "MANUAL_REQUIRED") continue;
        if (e.last_checkpoint === "REPORTED") continue;
        const task = ledger.tasks[e.task_id];
        if (!task) continue;
        let action = null;
        if (e.last_checkpoint === "CLAIMED") {
          // W0-A：安全释放认领
          task.status = "READY"; task.claimed_by = null; task.claim_token = null; task.updated_at = now;
          e.recovery_state = "RECOVERED";
          action = "W0-A→READY";
        } else if (e.last_checkpoint === "C9_PASS" && e.send_state !== "SEND_CONFIRMED") {
          // W0-B：浏览器已操作未 SEND_ATTEMPTED → 保留现场核实
          e.recovery_state = "MANUAL_REQUIRED"; e.failure_code = "W0-B_UNVERIFIED_BROWSER_STATE";
          task.status = "BLOCKED"; task.updated_at = now;
          action = "W0-B→MANUAL_REQUIRED";
        } else if (e.send_state === "SEND_ATTEMPTED") {
          // W1：PENDING_VERIFY（禁视为未发送、禁自动重发）
          e.recovery_state = "PENDING_VERIFY"; e.failure_code = "W1_SEND_UNVERIFIED";
          task.status = "BLOCKED"; task.updated_at = now;
          action = "W1→PENDING_VERIFY";
        } else if (e.send_state === "SEND_CONFIRMED" && e.last_checkpoint !== "REPORTED") {
          // W2：L-018 补采标记
          e.recovery_state = "PENDING_VERIFY"; e.failure_code = "W2_COLLECT_INCOMPLETE";
          task.status = "BLOCKED"; task.updated_at = now;
          action = "W2→PENDING_VERIFY(补采)";
        }
        if (action) {
          results.push({ execution_id: e.execution_id, task_id: e.task_id, action, send_state: e.send_state, checkpoint: e.last_checkpoint });
          e.finished_at = e.finished_at ?? now;
        }
      }
      if (results.length > 0) {
        writeJsonFileAtomic(paths.executions, execs);
        writeJsonFileAtomic(paths.ledger, ledger);
      }
    } finally {
      lockExec.release();
    }
  } finally {
    ledgerLock.release();
  }
  return results;
}

// ---------- 汇总/验收 ----------
export function completeExecution({ aieoRoot, taskId, replySha256 = null, verdict = null }) {
  const paths = queuePaths(aieoRoot);
  const lock = acquireLockWithRetry(`${paths.executions}.lockfile`, `queue-complete:${taskId}`);
  try {
    const execs = readJsonFile(paths.executions, { defaultValue: { version: 1, executions: [] } });
    validateExecutionsShape(execs);
    const list = execs.executions.filter((e) => e.task_id === taskId);
    const latest = list[list.length - 1];
    if (!latest) throw queueError("EXECUTION_NOT_FOUND", `任务无 Execution 记录: ${taskId}`);
    latest.reply_sha256 = replySha256 ?? latest.reply_sha256;
    latest.finished_at = new Date().toISOString();
    latest.last_checkpoint = "REPORTED";
    latest.c6.throughput.completed_at = latest.finished_at;
    if (latest.started_at) latest.c6.throughput.exec_ms = Date.parse(latest.finished_at) - Date.parse(latest.started_at);
    const ledgerLock = acquireLockWithRetry(`${paths.ledger}.lockfile`, `queue-complete-ledger:${taskId}`);
    try {
      const ledger = readJsonFile(paths.ledger, { defaultValue: { version: 1, tasks: {} } });
      validateLedgerShape(ledger);
      const task = ledger.tasks[taskId];
      if (task) {
        task.status = "REPORTED";
        task.claim_token = null; // 执行权核销（REPORTED=执行权交回；验收另走 ChatGPT）
        task.updated_at = now();
      }
      writeJsonFileAtomic(paths.ledger, ledger);
    } finally {
      ledgerLock.release();
    }
    writeJsonFileAtomic(paths.executions, execs);
    return latest;
  } finally {
    lock.release();
  }
}
function now() { return new Date().toISOString(); }

// ---------- 回滚演练支持（§⑧ 测试 5：幂等唯一+孤儿检测+任务无丢失） ----------
export function auditLedger({ aieoRoot }) {
  const paths = queuePaths(aieoRoot);
  const ledger = readJsonFile(paths.ledger, { defaultValue: { version: 1, tasks: {} } });
  validateLedgerShape(ledger);
  const execs = readJsonFile(paths.executions, { defaultValue: { version: 1, executions: [] } });
  validateExecutionsShape(execs);
  const seen = new Map();
  let duplicates = 0;
  for (const e of execs.executions) {
    if (seen.has(e.idempotency_key)) duplicates += 1;
    seen.set(e.idempotency_key, e.execution_id);
  }
  const orphanExecs = execs.executions.filter((e) => !ledger.tasks[e.task_id]).map((e) => e.execution_id);
  return { duplicate_idempotency_keys: duplicates, orphan_executions: orphanExecs, task_count: Object.keys(ledger.tasks).length, execution_count: execs.executions.length };
}
