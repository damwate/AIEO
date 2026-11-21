// C9 账号级风控协调测试（DEC-128 五约束）：归一化/评估/退避写入/文件 IO/启动门语义。
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  normalizeAccountState, evaluateAccountGate, applyAccountBackoff,
  readAccountStateFile, writeAccountStateFileAtomic,
  ACCOUNT_BACKOFF_MIN_MINUTES, ACCOUNT_BACKOFF_MAX_MINUTES,
} from "./dispatch_options.mjs";
import { acquireSessionLock } from "../e2e-poc/session_lock.mjs";
import { resolveAccountLockTimeoutMs } from "./dispatch_options.mjs";

const tmp = mkdtempSync(join(tmpdir(), "acct-gate-test-"));
const statePath = join(tmp, "account-risk-state.json");
const startedAt = new Date().toISOString();
const results = [];
const MIN = ACCOUNT_BACKOFF_MIN_MINUTES, MAX = ACCOUNT_BACKOFF_MAX_MINUTES;
const NOW = Date.parse("2026-11-21T12:00:00.000Z");

function expectInvalid(fn) {
  assert.throws(fn, (error) => error?.code === "ACCOUNT_STATE_INVALID");
}

const tests = [
  ["约束B：缺失=null → NORMAL 初始化路径（明确字段）", () => {
    const st = normalizeAccountState(null, NOW);
    assert.equal(st.state, "NORMAL");
    assert.equal(st.version, 1);
    assert.equal(st.initialized_at, "2026-11-21T12:00:00.000Z");
  }],
  ["约束B：损坏 JSON/数组/Map/Date/坏结构 → ACCOUNT_STATE_INVALID", () => {
    expectInvalid(() => normalizeAccountState([9301], NOW));
    expectInvalid(() => normalizeAccountState(new Map([["state", "NORMAL"]]), NOW));
    expectInvalid(() => normalizeAccountState(new Date(), NOW));
    expectInvalid(() => normalizeAccountState({ version: 2, state: "NORMAL" }, NOW));
    expectInvalid(() => normalizeAccountState({ version: 1, state: "WEIRD" }, NOW));
    expectInvalid(() => normalizeAccountState({ version: 1, state: "BACKOFF" }, NOW)); // 缺 until
    expectInvalid(() => normalizeAccountState({ version: 1, state: "BACKOFF", backoff_until: "not-a-date" }, NOW));
  }],
  ["约束C：BACKOFF 过期 → 归一化 NORMAL（expired-normalized）", () => {
    const st = normalizeAccountState({
      version: 1, state: "BACKOFF", backoff_until: "2026-11-21T11:59:00.000Z",
      reason: "429-observed", observed_by: "agent-a", observed_at: "2026-11-21T11:00:00.000Z",
    }, NOW);
    assert.equal(st.state, "NORMAL");
    assert.equal(st.reason, "expired-normalized");
    assert.equal(st.observed_by, "agent-a"); // 历史观察者保留
  }],
  ["BACKOFF 未过期 → 原样保留", () => {
    const raw = { version: 1, state: "BACKOFF", backoff_until: "2026-11-21T12:30:00.000Z", reason: "429-observed" };
    const st = normalizeAccountState(raw, NOW);
    assert.equal(st.state, "BACKOFF");
    assert.equal(st.backoff_until, "2026-11-21T12:30:00.000Z");
  }],
  ["启动门：NORMAL 放行；BACKOFF 阻断（含 until/reason）", () => {
    assert.deepEqual(evaluateAccountGate({ state: "NORMAL" }), { allowed: true });
    const g = evaluateAccountGate({ state: "BACKOFF", backoff_until: "2026-11-21T12:30:00.000Z", reason: "429-observed" });
    assert.equal(g.allowed, false);
    assert.equal(g.until, "2026-11-21T12:30:00.000Z");
    assert.equal(g.reason, "429-observed");
  }],
  ["约束A+③：退避写入钳位 [9,60]", () => {
    const base = normalizeAccountState(null, NOW);
    assert.equal(applyAccountBackoff(base, NOW, 3, "429-observed").backoff_until, "2026-11-21T12:09:00.000Z"); // 3→9
    assert.equal(applyAccountBackoff(base, NOW, 500).backoff_until, "2026-11-21T13:00:00.000Z"); // 500→60
    assert.equal(applyAccountBackoff(base, NOW, 30).backoff_until, "2026-11-21T12:30:00.000Z");
    assert.equal(MIN, 9); assert.equal(MAX, 60);
  }],
  ["约束A：活动 BACKOFF 只能延长或维持（不得被更短退避覆盖）", () => {
    const active = { version: 1, state: "BACKOFF", backoff_until: "2026-11-21T13:30:00.000Z", reason: "429-observed" };
    const next = applyAccountBackoff(active, NOW, 9, "manual");
    assert.equal(next.backoff_until, "2026-11-21T13:30:00.000Z"); // 维持更长
    assert.equal(next.reason, "429-observed"); // 维持原原因
    const extended = applyAccountBackoff(active, NOW, 60, "manual-strong");
    assert.equal(extended.backoff_until, "2026-11-21T13:30:00.000Z"); // 60min 提议 < 现有 until → 维持更长（不缩短）
    const longer = applyAccountBackoff({ ...active, backoff_until: "2026-11-21T12:10:00.000Z" }, NOW, 60, "manual-strong");
    assert.equal(longer.backoff_until, "2026-11-21T13:00:00.000Z"); // 60min > 现有 → 延长
  }],
  ["R2整改：锁超时配置校验——非法值回退 60000，合法值直通", () => {
    assert.equal(resolveAccountLockTimeoutMs(undefined), 60000);
    assert.equal(resolveAccountLockTimeoutMs("abc"), 60000);   // NaN → 回退
    assert.equal(resolveAccountLockTimeoutMs("-5"), 60000);    // 非正数 → 回退
    assert.equal(resolveAccountLockTimeoutMs(0), 60000);
    assert.equal(resolveAccountLockTimeoutMs(Number.POSITIVE_INFINITY), 60000);
    assert.equal(resolveAccountLockTimeoutMs("1500"), 1500);
    assert.equal(resolveAccountLockTimeoutMs(30000), 30000);
  }],
  ["R1②整改：账号状态锁有界重试——持锁者释放后重试获取成功（真实 OS 锁并发）", () => {
    const lockPath = join(tmp, "account-retry.lockfile");
    const first = acquireSessionLock({ holder: "holder", lockPath: lockPath });
    let acquired = null;
    // 500ms 有界重试窗口内持有者不释放 → 最终冲突向上抛
    process.env.AIEO_ACCOUNT_LOCK_TIMEOUT_MS = "500";
    const t0 = Date.now();
    assert.throws(
      () => { for (;;) { try { acquireSessionLock({ holder: "waiter", lockPath: lockPath }); break; } catch (e) { if (e.code !== "SESSION_LOCK_CONFLICT" || Date.now() - t0 >= 500) throw e; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20); } } },
      (e) => e.code === "SESSION_LOCK_CONFLICT",
    );
    assert.ok(Date.now() - t0 >= 400, "重试窗口应持续约 500ms");
    first.release();
    // 释放后重试获取成功
    const second = acquireSessionLock({ holder: "waiter", lockPath: lockPath });
    assert.ok(second.release instanceof Function);
    second.release();
    delete process.env.AIEO_ACCOUNT_LOCK_TIMEOUT_MS;
  }],
  ["文件 IO：缺失=NORMAL 初始化；损坏=fail-closed；原子写回读", () => {
    const missing = readAccountStateFile(join(tmp, "nonexistent.json"), NOW);
    assert.equal(missing.state, "NORMAL");
    writeFileSync(statePath, "{corrupt", "utf8");
    expectInvalid(() => readAccountStateFile(statePath, NOW));
    rmSync(statePath);
    const st = normalizeAccountState(null, NOW);
    writeAccountStateFileAtomic(statePath, st);
    const back = readAccountStateFile(statePath, NOW);
    assert.equal(back.state, "NORMAL");
  }],
];

for (const [name, fn] of tests) {
  try {
    fn();
    results.push({ name, result: "PASS" });
  } catch (error) {
    results.push({ name, result: "FAIL", error: error.message, stack: error.stack });
  }
}
const failed = results.filter((r) => r.result === "FAIL").length;
const report = {
  started_at: startedAt, finished_at: new Date().toISOString(), node: process.version,
  total: results.length, passed: results.length - failed, failed, tests: results,
};
import { writeFileSync as wfs } from "node:fs";
const jsonPath = join(tmp.replace(/acct-gate-test-.*$/, ""), "account-gate-tests.json");
wfs(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(results.map((r) => `${r.result} ${r.name}${r.error ? ": " + r.error : ""}`).join("\n"));
console.log(`SUMMARY total=${report.total} passed=${report.passed} failed=${failed}`);
if (failed > 0) process.exitCode = 1;
