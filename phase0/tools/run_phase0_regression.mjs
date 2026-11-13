// 第三轮统一回归入口：顺序执行当前工具测试与仍适用的 Phase0 基线测试，记录真实退出码。
// 历史 session_lock v1-v5 测试针对已废弃的内容锁 API，不属于当前 v7/OS 句柄实现；仅运行当前 v6 测试。
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const phase0 = join(__dirname, "..");
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const evidenceDir = join(phase0, "logs", `third-round-regression-${stamp}`);
mkdirSync(evidenceDir, { recursive: true });
const startedAt = new Date().toISOString();
const tests = [
  { name: "schemas", script: join(__dirname, "test_schemas.mjs"), timeout_ms: 120000 },
  { name: "inbound-reply", script: join(__dirname, "test_inbound_reply.mjs"), timeout_ms: 120000 },
  { name: "dispatch-binding", script: join(__dirname, "test_dispatch_options.mjs"), timeout_ms: 120000 },
  { name: "m1-registry", script: join(__dirname, "test_m1_artifact_registry.mjs"), timeout_ms: 180000 },
  { name: "m1-concurrency", script: join(__dirname, "test_m1_concurrency.mjs"), timeout_ms: 300000 },
  { name: "browser-virtual-list-simulation", script: join(__dirname, "test_browser_virtual_list.mjs"), timeout_ms: 180000 },
  { name: "git-pointer-local", script: join(__dirname, "test_git_pointer.mjs"), timeout_ms: 180000 },
  { name: "baseline-completion-judge", script: join(phase0, "e2e-poc", "test_completion_judge.mjs"), timeout_ms: 120000 },
  { name: "baseline-greet", script: join(phase0, "e2e-poc", "test_greet.js"), timeout_ms: 120000 },
  { name: "baseline-current-os-session-lock", script: join(phase0, "e2e-poc", "test_session_lock_v6.mjs"), timeout_ms: 180000 },
];

function run(test) {
  return new Promise((resolve) => {
    const started = new Date().toISOString();
    const startedMs = Date.now();
    const child = spawn(process.execPath, [test.script], {
      cwd: dirname(test.script),
      env: process.env,
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, test.timeout_ms);
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ ...test, started_at: started, finished_at: new Date().toISOString(), duration_ms: Date.now() - startedMs, exit_code: null, signal: null, timed_out: timedOut, stdout, stderr: `${stderr}${error.message}` });
    });
    child.on("close", (exit_code, signal) => {
      clearTimeout(timer);
      resolve({ ...test, started_at: started, finished_at: new Date().toISOString(), duration_ms: Date.now() - startedMs, exit_code, signal, timed_out: timedOut, stdout, stderr });
    });
  });
}

const results = [];
for (const test of tests) {
  const result = await run(test);
  result.command = `${process.execPath} ${test.script}`;
  result.output_path = join(evidenceDir, `${result.name}.log`);
  const output = [
    `$ ${result.command}`,
    `[${result.started_at}] START`,
    result.stdout,
    result.stderr,
    `[${result.finished_at}] EXIT code=${result.exit_code} signal=${result.signal} timed_out=${result.timed_out}`,
  ].filter(Boolean).join("\n");
  writeFileSync(result.output_path, `${output}\n`, "utf8");
  delete result.stdout;
  delete result.stderr;
  results.push(result);
  console.log(`${result.exit_code === 0 && !result.timed_out ? "PASS" : "FAIL"} ${result.name} exit=${result.exit_code} duration_ms=${result.duration_ms}`);
}
const failed = results.filter((result) => result.exit_code !== 0 || result.timed_out).length;
const report = {
  started_at: startedAt,
  finished_at: new Date().toISOString(),
  node: process.version,
  total: results.length,
  passed: results.length - failed,
  failed,
  excluded_historical_tests: "test_session_lock.mjs/v2/v3/v4/v5 针对已删除的内容锁 API；当前 OS 句柄锁由 v6 与 M1 并发测试覆盖",
  real_chatgpt_multi_unit: false,
  real_remote_git_pointer: false,
  git_commit_or_push_performed: false,
  tests: results,
};
const jsonPath = join(evidenceDir, "result.json");
const logPath = join(evidenceDir, "run.log");
const lines = [
  `[${startedAt}] 第三轮统一回归开始 node=${process.version}`,
  ...results.map((result) => `[${result.finished_at}] ${result.exit_code === 0 && !result.timed_out ? "PASS" : "FAIL"} ${result.name} exit=${result.exit_code} signal=${result.signal} timed_out=${result.timed_out} log=${result.output_path}`),
  `[${report.finished_at}] SUMMARY total=${report.total} passed=${report.passed} failed=${failed}`,
];
writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
writeFileSync(logPath, `${lines.join("\n")}\n`, "utf8");
console.log(lines.at(-1));
console.log(`统一回归结果: ${jsonPath}`);
if (failed > 0) process.exitCode = 1;
