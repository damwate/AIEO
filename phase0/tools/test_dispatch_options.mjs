// 三 ID + Schema 强制绑定及通用非登记派单测试；日志与 JSON 由同一 results 生成。
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseDispatchOptions } from "./dispatch_options.mjs";

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
