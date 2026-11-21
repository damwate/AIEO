// Queue Service Phase B 五项测试（DEC-137 §⑧ 机器化标准；DEC-141 授权范围）。
// 测试 1 双入口并发认领（真实子进程）/测试 2 崩溃恢复五点/测试 3 C9 BLOCKED 零浏览器/测试 4 C6 四方追溯/测试 5 回滚演练。
// 全部使用临时 root（AIEO_QUEUE_ROOT 注入），零运行态影响。
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  queuePaths, createTask, claimTask, c9CheckAndStart, mirrorSendState,
  completeExecution, recoverExecutions, auditLedger, seedInstance,
} from "./queue_core.mjs";

import { fileURLToPath } from "node:url";
import { dirname as pdirname } from "node:path";
const toolsDir = pdirname(fileURLToPath(import.meta.url));
const AIEO_ROOT = "D:/AIEO";
const logDir = join(AIEO_ROOT, "phase0", "logs");
mkdirSync(logDir, { recursive: true });
const startedAt = new Date().toISOString();
const results = [];

// 每个测试组独立临时 root（AIEO_QUEUE_ROOT 注入隔离）
const tmpBase = mkdtempSync(join(tmpdir(), "queue-phaseb-test-"));
function freshRoot(tag) {
  const root = join(tmpBase, tag);
  mkdirSync(join(root, "runtime", "queue"), { recursive: true });
  mkdirSync(join(root, "runtime", "locks"), { recursive: true });
  return root;
}
function writeBackoff(root) {
  writeFileSync(join(root, "runtime", "locks", "account-risk-state.json"), JSON.stringify({
    version: 1, state: "BACKOFF", backoff_until: "2026-12-31T00:00:00.000Z",
    reason: "test-backoff", observed_by: "test", observed_at: new Date().toISOString(),
  }, null, 2), "utf8");
}
function runCli(root, args) {
  const r = spawnSync(process.execPath, [join(toolsDir, "queue_service.mjs"), ...args],
    { cwd: toolsDir, encoding: "utf8", env: { ...process.env, AIEO_QUEUE_ROOT: root }, timeout: 120000 });
  return { code: r.status, out: r.stdout || "", err: r.stderr || "" };
}

const tests = [
  // ── 测试 1：双入口并发认领（Q-04：同 task_id 恰一个执行者；真实子进程并发）──
  ["测试1 双入口并发认领：4 子进程同任务恰 1 成功", async () => {
    const root = freshRoot("t1");
    const paths = queuePaths(root);
    mkdirSync(paths.dir, { recursive: true });
    const now = new Date().toISOString();
    writeFileSync(join(paths.dir, "task-ledger.json"), JSON.stringify({ version: 1, tasks: {
      "T-101": { task_id: "T-101", title: "t", kind: "code", payload_ref: "", branch: null, priority: 0,
        deps: [], status: "READY", claimed_by: null, claim_token: null, attempts: 0, rework_of: null,
        created_at: now, updated_at: now } } }, null, 2));
    const insts = {};
    for (let w = 0; w < 4; w++) insts[`agent-${w}`] = { instance_id: `agent-${w}`, profile_dir: `p-${w}`,
      debug_port: 9300 + w, lock_path: `l-${w}`, status: "IDLE", pause_reason: null,
      login_validated: true, last_health_check: "", consecutive_fail: 0 };
    writeFileSync(join(paths.dir, "instance-pool.json"), JSON.stringify({ version: 1, instances: insts }, null, 2));
    // 4 个真实子进程并发认领同一任务
    const procs = [];
    for (let w = 0; w < 4; w++) {
      procs.push(spawn(process.execPath, [join(toolsDir, "queue_service.mjs"), "claim",
        "--task-id", "T-101", "--instance", `agent-${w}`],
        { cwd: toolsDir, encoding: "utf8", env: { ...process.env, AIEO_QUEUE_ROOT: root }, windowsHide: true }));
    }
    const outs = await Promise.all(procs.map((p) => new Promise((res) => {
      let o = ""; p.stdout.on("data", (c) => { o += c; }); p.stderr.on("data", (c) => { o += c; });
      p.on("close", (code) => res({ code, out: o }));
    })));
    const okCount = outs.filter((o) => o.out.includes('"claimed":true')).length;  // JSON.stringify 紧凑输出无空格
    assert.equal(okCount, 1, `恰 1 个认领成功，实际 ${okCount}\n${outs.map((o) => o.out.slice(0, 120)).join("\n")}`);
    const ledger = JSON.parse(readFileSync(join(paths.dir, "task-ledger.json"), "utf8"));
    assert.equal(ledger.tasks["T-101"].status, "CLAIMED");
    assert.ok(ledger.tasks["T-101"].claim_token, "claim_token 应已写入");
    assert.ok(ledger.tasks["T-101"].claimed_by.startsWith("agent-"), "claimed_by 应为实例 id");
  }],

  // ── 测试 2：崩溃恢复五点（W0-A/W0-B/W1/W2/认领前）──
  ["测试2 崩溃恢复五点：窗口表逐点语义", () => {
    const root = freshRoot("t2");
    seedInstance({ aieoRoot: root, instanceId: "agent-a", profileDir: "p", debugPort: 9300, lockPath: "l", loginValidated: true });
    const paths = queuePaths(root);
    mkdirSync(paths.dir, { recursive: true });
    createTask({ aieoRoot: root, taskId: "T-201", title: "认领前" });
    createTask({ aieoRoot: root, taskId: "T-202", title: "W0-A" });
    claimTask({ aieoRoot: root, taskId: "T-202", instanceId: "agent-a", token: "tok-202" });
    createTask({ aieoRoot: root, taskId: "T-203", title: "W0-B" });
    claimTask({ aieoRoot: root, taskId: "T-203", instanceId: "agent-a", token: "tok-203" });
    c9CheckAndStart({ aieoRoot: root, taskId: "T-203", instanceId: "agent-a", claimToken: "tok-203" });
    createTask({ aieoRoot: root, taskId: "T-204", title: "W1" });
    claimTask({ aieoRoot: root, taskId: "T-204", instanceId: "agent-a", token: "tok-204" });
    c9CheckAndStart({ aieoRoot: root, taskId: "T-204", instanceId: "agent-a", claimToken: "tok-204" });
    mirrorSendState({ aieoRoot: root, taskId: "T-204", sendState: "SEND_ATTEMPTED", checkpoint: "SENT" });
    createTask({ aieoRoot: root, taskId: "T-205", title: "W2" });
    claimTask({ aieoRoot: root, taskId: "T-205", instanceId: "agent-a", token: "tok-205" });
    c9CheckAndStart({ aieoRoot: root, taskId: "T-205", instanceId: "agent-a", claimToken: "tok-205" });
    mirrorSendState({ aieoRoot: root, taskId: "T-205", sendState: "SEND_CONFIRMED", checkpoint: "COLLECTING" });
    const results = recoverExecutions({ aieoRoot: root });
    const byTask = Object.fromEntries(results.map((r) => [r.task_id, r.action]));
    const ledger = JSON.parse(readFileSync(join(paths.dir, "task-ledger.json"), "utf8"));
    assert.ok(String(byTask["T-202"]).startsWith("W0-A→READY"), `T-202 应 W0-A→READY，实得 ${byTask["T-202"]}`);
    assert.equal(ledger.tasks["T-202"].status, "READY");
    assert.equal(ledger.tasks["T-202"].claim_token, null);
    assert.equal(byTask["T-203"], "W0-B→MANUAL_REQUIRED", `T-203 应 W0-B，实得 ${byTask["T-203"]}`);
    assert.equal(ledger.tasks["T-203"].status, "BLOCKED");
    assert.equal(byTask["T-204"], "W1→PENDING_VERIFY", `T-204 应 W1，实得 ${byTask["T-204"]}`);
    assert.equal(ledger.tasks["T-204"].status, "BLOCKED");
    assert.equal(byTask["T-205"], "W2→PENDING_VERIFY(补采)", `T-205 应 W2，实得 ${byTask["T-205"]}`);
    assert.equal(ledger.tasks["T-205"].status, "BLOCKED");
    assert.equal(ledger.tasks["T-201"].status, "READY");
    assert.ok(!("T-201" in byTask), "认领前任务不应出现在恢复结果中");
  }],

  // ── 测试 3：C9 BLOCKED 零浏览器操作 ──
  ["测试3 C9 BLOCKED：门禁阻断零浏览器操作+任务回 READY+归一化放行", () => {
    const root = freshRoot("t3");
    seedInstance({ aieoRoot: root, instanceId: "agent-a", profileDir: "p", debugPort: 9300, lockPath: "l", loginValidated: true });
    const paths = queuePaths(root);
    mkdirSync(paths.dir, { recursive: true });
    writeBackoff(root);
    createTask({ aieoRoot: root, taskId: "T-301", title: "c9-blocked" });
    claimTask({ aieoRoot: root, taskId: "T-301", instanceId: "agent-a", token: "tok-301" });
    const r = c9CheckAndStart({ aieoRoot: root, taskId: "T-301", instanceId: "agent-a", claimToken: "tok-301" });
    assert.equal(r.allowed, false, "BACKOFF 态必须阻断");
    assert.ok(r.until, "BLOCKED 应携带 until");
    const ledger = JSON.parse(readFileSync(join(paths.dir, "task-ledger.json"), "utf8"));
    assert.equal(ledger.tasks["T-301"].status, "READY", "阻断后任务应回 READY（零浏览器操作）");
    assert.equal(ledger.tasks["T-301"].claim_token, null, "阻断后 token 应回收");
    // 零浏览器操作机器断言：queue_core 零浏览器依赖（静态）
    const src = readFileSync(join(toolsDir, "queue_core.mjs"), "utf8");
    const codeOnly = src.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    assert.ok(!/playwright|chromium|connectOverCDP/i.test(codeOnly), "队列核心禁浏览器依赖（剥注释后）");
    // 对照：删除状态文件（缺失=NORMAL 初始化）→ BLOCKED 后任务回 READY，重试须重新认领（fencing：旧 token 已回收，新 claim 新 token）再过门
    rmSync(join(root, "runtime", "locks", "account-risk-state.json"));
    claimTask({ aieoRoot: root, taskId: "T-301", instanceId: "agent-a", token: "tok-301-retry" });
    const r2 = c9CheckAndStart({ aieoRoot: root, taskId: "T-301", instanceId: "agent-a", claimToken: "tok-301-retry" });
    assert.equal(r2.allowed, true, "门禁恢复后应放行");
  }],

  // ── 测试 4：C6 证据完整性（四方追溯）──
  ["测试4 C6 四方追溯：Task↔Instance↔Execution↔dispatch 归档", () => {
    const root = freshRoot("t4");
    const paths = queuePaths(root);
    mkdirSync(paths.dir, { recursive: true });
    seedInstance({ aieoRoot: root, instanceId: "agent-a", profileDir: "p", debugPort: 9300, lockPath: "l", loginValidated: true });
    createTask({ aieoRoot: root, taskId: "T-401", title: "t4" });
    claimTask({ aieoRoot: root, taskId: "T-401", instanceId: "agent-a", token: "tok-401" });
    c9CheckAndStart({ aieoRoot: root, taskId: "T-401", instanceId: "agent-a", claimToken: "tok-401" });
    const dispatchDir = join(root, "phase0", "logs", "dispatch-test-401");
    mkdirSync(dispatchDir, { recursive: true });
    writeFileSync(join(dispatchDir, "send-state.json"), JSON.stringify({ state: "SEND_CONFIRMED", session_id: "11111111-2222-4333-8444-555555555555" }));
    writeFileSync(join(dispatchDir, "result.json"), JSON.stringify({ session_id: "11111111-2222-4333-8444-555555555555", artifact_sha256: "a".repeat(64) }));
    mirrorSendState({ aieoRoot: root, taskId: "T-401", sendState: "SEND_CONFIRMED", dispatchDir: "phase0/logs/dispatch-test-401", checkpoint: "COLLECTING" });
    completeExecution({ aieoRoot: root, taskId: "T-401", replySha256: "b".repeat(64) });
    const execs = JSON.parse(readFileSync(join(paths.dir, "executions.json"), "utf8"));
    const e = execs.executions.find((x) => x.task_id === "T-401");
    assert.ok(e, "Execution 记录存在");
    const ledger = JSON.parse(readFileSync(join(paths.dir, "task-ledger.json"), "utf8"));
    assert.equal(ledger.tasks["T-401"].status, "REPORTED");
    assert.ok(e.dispatch_id.includes("dispatch-test-401"), "dispatch_id 已登记");
    const archived = JSON.parse(readFileSync(join(dispatchDir, "result.json"), "utf8"));
    assert.equal(archived.session_id, "11111111-2222-4333-8444-555555555555");
    assert.equal(e.reply_sha256, "b".repeat(64));
    assert.ok(e.c6.throughput.completed_at, "C6 吞吐 completed_at 已采集");
    assert.equal(e.send_state, "SEND_CONFIRMED");
  }],

  // ── 测试 5：回滚演练（幂等唯一+无孤儿+任务无丢失）──
  ["测试5 回滚演练：幂等唯一/无孤儿/任务无丢失", () => {
    const root = freshRoot("t5");
    seedInstance({ aieoRoot: root, instanceId: "agent-a", profileDir: "p", debugPort: 9300, lockPath: "l", loginValidated: true });
    const paths = queuePaths(root);
    mkdirSync(paths.dir, { recursive: true });
    createTask({ aieoRoot: root, taskId: "T-501", title: "verified" });
    createTask({ aieoRoot: root, taskId: "T-502", title: "blocked" });
    createTask({ aieoRoot: root, taskId: "T-503", title: "ready" });
    claimTask({ aieoRoot: root, taskId: "T-501", instanceId: "agent-a", token: "tok-501" });
    c9CheckAndStart({ aieoRoot: root, taskId: "T-501", instanceId: "agent-a", claimToken: "tok-501" });
    mirrorSendState({ aieoRoot: root, taskId: "T-501", sendState: "SEND_CONFIRMED", checkpoint: "COLLECTING" });
    completeExecution({ aieoRoot: root, taskId: "T-501", replySha256: "c".repeat(64) });
    claimTask({ aieoRoot: root, taskId: "T-502", instanceId: "agent-a", token: "tok-502" });
    c9CheckAndStart({ aieoRoot: root, taskId: "T-502", instanceId: "agent-a", claimToken: "tok-502" });
    mirrorSendState({ aieoRoot: root, taskId: "T-502", sendState: "SEND_ATTEMPTED", checkpoint: "SENT" });
    const recovered = recoverExecutions({ aieoRoot: root });
    assert.ok(recovered.some((r) => r.task_id === "T-502"), "T-502 应被恢复收口");
    const audit = auditLedger({ aieoRoot: root });
    assert.equal(audit.duplicate_idempotency_keys, 0, "幂等键零重复");
    assert.equal(audit.orphan_executions.length, 0, "零孤儿 Execution");
    assert.equal(audit.task_count, 3, "任务无丢失（3 任务全在账）");
    assert.equal(audit.execution_count, 2, "Execution 数=2（501+502 各一条）");
    const ledger = JSON.parse(readFileSync(join(paths.dir, "task-ledger.json"), "utf8"));
    assert.equal(ledger.tasks["T-501"].status, "REPORTED");
    assert.equal(ledger.tasks["T-502"].status, "BLOCKED");
    assert.equal(ledger.tasks["T-503"].status, "READY");
  }],
];

for (const [name, fn] of tests) {
  try {
    await fn();
    results.push({ name, result: "PASS" });
  } catch (error) {
    results.push({ name, result: "FAIL", error: error.message, stack: error.stack });
  }
}
rmSync(tmpBase, { recursive: true, force: true });
const failed = results.filter((r) => r.result === "FAIL").length;
const report = {
  started_at: startedAt, finished_at: new Date().toISOString(), node: process.version,
  total: results.length, passed: results.length - failed, failed, tests: results,
};
const lines = [
  `[${startedAt}] Queue Phase B 五项测试开始 node=${process.version}`,
  ...results.map((r) => `[${new Date().toISOString()}] ${r.result} ${r.name}${r.error ? ": " + r.error : ""}`),
  `[${report.finished_at}] SUMMARY total=${report.total} passed=${report.passed} failed=${failed}`,
];
writeFileSync(join(logDir, "queue-phaseb-tests.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
writeFileSync(join(logDir, "queue-phaseb-tests.log"), `${lines.join("\n")}\n`, "utf8");
console.log(lines.join("\n"));
if (failed > 0) process.exitCode = 1;
