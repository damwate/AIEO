// 三 ID + Schema 强制绑定及通用非登记派单测试；日志与 JSON 由同一 results 生成。
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseDispatchOptions, shouldUpdateReviewerPointer, sessionIdIsAttributable, extractSessionId, extractBriefMarker } from "./dispatch_options.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const logDir = join(__dirname, "..", "logs");
mkdirSync(logDir, { recursive: true });
const jsonPath = join(logDir, "dispatch-binding-tests.json");
const logPath = join(logDir, "dispatch-binding-tests.log");
const startedAt = new Date().toISOString();
const results = [];
const fullIds = ["--task-id", "T-P1-921", "--execution-id", "EXEC-921", "--correlation-id", "CORR-921"];
const base = ["--message", "binding test"];

function expectCode(code, fn) {
  assert.throws(fn, (error) => error?.code === code && error?.exitCode === 2);
}

const tests = [
  ["三 ID 与 Schema 完整时请求 M1 登记", () => {
    const parsed = parseDispatchOptions([...base, ...fullIds, "--schema", "contract.json"]);
    assert.equal(parsed.m1RegistrationRequested, true);
    assert.equal(parsed.m1RegistrationStatus, "REQUESTED");
    assert.equal(parsed.ids.task_id, "T-P1-921");
    assert.equal(parsed.schemaPath, "contract.json");
  }],
  ["显式 --register-m1 与完整三 ID/Schema 通过", () => {
    const parsed = parseDispatchOptions([...base, "--register-m1", ...fullIds, "--schema", "contract.json"]);
    assert.equal(parsed.m1RegistrationRequested, true);
  }],
  ["三 ID 均未提供时允许通用非登记派单", () => {
    const parsed = parseDispatchOptions(base);
    assert.equal(parsed.m1RegistrationRequested, false);
    assert.equal(parsed.m1RegistrationStatus, "NOT_REQUESTED");
    assert.deepEqual(parsed.ids, { task_id: null, execution_id: null, correlation_id: null });
  }],
  ["DEC-094 #4：--no-update-pointer 默认关闭，显式给出才开启", () => {
    assert.equal(parseDispatchOptions([...base, "--new-session"]).noUpdatePointer, false,
      "默认必须更新 reviewer 指针（审查会话迁移既有语义不变）");
    assert.equal(parseDispatchOptions([...base, "--new-session", "--no-update-pointer"]).noUpdatePointer, true,
      "任务腿显式跳过指针写盘，避免误覆盖");
    assert.equal(parseDispatchOptions(base).noUpdatePointer, false,
      "非新会话派单默认也不开启（纯增量）");
    // 写盘决策纯函数：默认写、显式 flag 跳过、缺省 options 容错
    assert.equal(shouldUpdateReviewerPointer(parseDispatchOptions([...base, "--new-session"])), true);
    assert.equal(shouldUpdateReviewerPointer(parseDispatchOptions([...base, "--new-session", "--no-update-pointer"])), false);
    assert.equal(shouldUpdateReviewerPointer({}), true);
  }],
  ["DEC-094 规划复审：归属校验确认目标页确属本次会话，失败 fail-closed", () => {
    const A = "6afbc6a9-b26c-83ee-9c27-b6c6e6f75664";
    const B = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    // 新会话：捕获 UUID 不在 attach 既有集合 → 归属 PASS；命中既有 UUID → FAIL（wrong-session 事故形态）
    assert.equal(sessionIdIsAttributable({ newSession: true, sessionId: A, preexistingSessionIds: [] }), true);
    assert.equal(sessionIdIsAttributable({ newSession: true, sessionId: A, preexistingSessionIds: [A] }), false,
      "新会话不得捕获到既有会话 UUID");
    assert.equal(sessionIdIsAttributable({ newSession: true, sessionId: A, preexistingSessionIds: [B] }), true);
    // 既有会话：捕获 UUID 必须等于目标 UUID
    assert.equal(sessionIdIsAttributable({ newSession: false, sessionId: A, targetSessionId: A }), true);
    assert.equal(sessionIdIsAttributable({ newSession: false, sessionId: A, targetSessionId: B }), false,
      "既有会话派单不得捕获到非目标 UUID");
    // 非法/缺失 UUID → fail-closed
    assert.equal(sessionIdIsAttributable({ newSession: true, sessionId: "bad", preexistingSessionIds: [] }), false);
    assert.equal(sessionIdIsAttributable({ newSession: true, sessionId: null, preexistingSessionIds: [] }), false);
    // URL 提取
    assert.equal(extractSessionId(`https://chatgpt.com/c/${A}`), A);
    assert.equal(extractSessionId("https://chatgpt.com/"), null);
  }],
  ["DEC-094 #3：简报标记提取（首行 [TAG|...]，无标记回退 null）", () => {
    assert.equal(extractBriefMarker("[PLAN-RELIABILITY|20261117] 承接...\n第二行"), "[PLAN-RELIABILITY|20261117]");
    assert.equal(extractBriefMarker("[DEC026-续行会商|20261117] 请拍板"), "[DEC026-续行会商|20261117]");
    assert.equal(extractBriefMarker("无标记正文\n[不该提取]"), null, "标记只在首行生效");
    assert.equal(extractBriefMarker(""), null);
  }],
  ["仅 Schema 可做通用校验但不触发 M1 登记", () => {
    const parsed = parseDispatchOptions([...base, "--schema", "contract.json"]);
    assert.equal(parsed.m1RegistrationRequested, false);
    assert.equal(parsed.schemaPath, "contract.json");
  }],
  ["只给 task_id 在派单前拒绝", () => {
    expectCode("DISPATCH_M1_BINDING_INCOMPLETE", () => parseDispatchOptions([...base, "--task-id", "T-P1-921"]));
  }],
  ["只给 execution_id 在派单前拒绝", () => {
    expectCode("DISPATCH_M1_BINDING_INCOMPLETE", () => parseDispatchOptions([...base, "--execution-id", "EXEC-921"]));
  }],
  ["只给 correlation_id 在派单前拒绝", () => {
    expectCode("DISPATCH_M1_BINDING_INCOMPLETE", () => parseDispatchOptions([...base, "--correlation-id", "CORR-921"]));
  }],
  ["三 ID 齐全但缺 Schema 仍拒绝", () => {
    expectCode("DISPATCH_M1_BINDING_INCOMPLETE", () => parseDispatchOptions([...base, ...fullIds]));
  }],
  ["显式请求 M1 但没有任何 ID 时拒绝", () => {
    expectCode("DISPATCH_M1_BINDING_INCOMPLETE", () => parseDispatchOptions([...base, "--register-m1", "--schema", "contract.json"]));
  }],
  ["三 ID 缺任一均拒绝", () => {
    for (const missing of ["--task-id", "--execution-id", "--correlation-id"]) {
      const args = [...base];
      for (let index = 0; index < fullIds.length; index += 2) {
        if (fullIds[index] !== missing) args.push(fullIds[index], fullIds[index + 1]);
      }
      args.push("--schema", "contract.json");
      expectCode("DISPATCH_M1_BINDING_INCOMPLETE", () => parseDispatchOptions(args));
    }
  }],
  ["ID 格式错误不会被成组校验吞没", () => {
    expectCode("DISPATCH_ID_INVALID", () => parseDispatchOptions([...base, "--task-id", "TASK-1"]));
  }],
  ["真实 gpt_dispatch CLI 只给 task_id 退出 2 且不进入浏览器", () => {
    const child = spawnSync(process.execPath, [join(__dirname, "gpt_dispatch.mjs"), ...base, "--task-id", "T-P1-921"], {
      cwd: __dirname,
      encoding: "utf8",
      timeout: 15000,
      windowsHide: true,
    });
    assert.equal(child.status, 2, `${child.stdout}\n${child.stderr}`);
    assert.match(child.stderr, /DISPATCH_M1_BINDING_INCOMPLETE/);
    assert.doesNotMatch(child.stdout, /会话锁已获取|GPT 派单/);
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
const failed = results.filter((result) => result.result === "FAIL").length;
const report = {
  started_at: startedAt,
  finished_at: new Date().toISOString(),
  node: process.version,
  total: results.length,
  passed: results.length - failed,
  failed,
  tests: results,
};
const lines = [
  `[${startedAt}] GPT 派单三 ID 绑定测试开始 node=${process.version}`,
  ...results.map((result) => `[${new Date().toISOString()}] ${result.result} ${result.name}${result.error ? `: ${result.error}` : ""}`),
  `[${report.finished_at}] SUMMARY total=${report.total} passed=${report.passed} failed=${failed}`,
];
writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
writeFileSync(logPath, `${lines.join("\n")}\n`, "utf8");
console.log(lines.join("\n"));
console.log(`测试报告: ${jsonPath}`);
if (failed > 0) process.exitCode = 1;
