// 实例域（DEC-123 PARA-R1）纯函数回归：ID 校验/路径派生/C7 默认兼容/端口分配/指针守卫/进程归属。
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  normalizeInstanceId, deriveInstancePaths, allocateInstancePort, assertPointerWriterAllowed,
  matchesProfileOwnership, buildKillProfileScript, parseDispatchOptions,
} from "./dispatch_options.mjs";
import { acquireSessionLock } from "../e2e-poc/session_lock.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const logDir = join(__dirname, "..", "logs");
mkdirSync(logDir, { recursive: true });
const jsonPath = join(logDir, "instance-config-tests.json");
const logPath = join(logDir, "instance-config-tests.log");
const startedAt = new Date().toISOString();
const results = [];
const AIEO_ROOT = join(__dirname, "..", "..");
const PROFILES = join(AIEO_ROOT, "runtime", "chrome_profiles");
const LOCKS = join(AIEO_ROOT, "runtime", "locks");

function expectCode(code, fn) {
  assert.throws(fn, (error) => error?.code === code && error?.exitCode === 2);
}

const tests = [
  ["C7 默认实例=既有常量逐字节", () => {
    const d = deriveInstancePaths({ aieoRoot: AIEO_ROOT });
    assert.equal(d.instanceId, "default");
    assert.equal(d.isDefault, true);
    assert.equal(d.lockPath, join(LOCKS, "gpt-session.lockfile"));
    assert.equal(d.profileDir, join(PROFILES, "gpt-poc"));
    assert.equal(d.defaultPort, 9222);
  }],
  ["C7 不传 --instance 时 parseDispatchOptions 仍为 default", () => {
    const parsed = parseDispatchOptions(["--message", "x"]);
    assert.equal(parsed.instanceId, "default");
  }],
  ["命名实例派生独立锁与 profile", () => {
    const a = deriveInstancePaths({ instanceId: "Agent-A", aieoRoot: AIEO_ROOT });
    assert.equal(a.instanceId, "agent-a"); // 大小写规范化
    assert.equal(a.isDefault, false);
    assert.equal(a.lockPath, join(LOCKS, "gpt-session-agent-a.lockfile"));
    assert.equal(a.profileDir, join(PROFILES, "gpt-poc-agent-a"));
    assert.equal(a.portRegistryPath, join(LOCKS, "instance-ports.json"));
  }],
  ["instance ID 严格校验：路径穿越/特殊字符/空段拒绝", () => {
    expectCode("DISPATCH_INSTANCE_INVALID", () => normalizeInstanceId("../evil"));
    expectCode("DISPATCH_INSTANCE_INVALID", () => normalizeInstanceId("a_b"));
    expectCode("DISPATCH_INSTANCE_INVALID", () => normalizeInstanceId("-lead"));
    expectCode("DISPATCH_INSTANCE_INVALID", () => normalizeInstanceId("a".repeat(33)));
    expectCode("DISPATCH_INSTANCE_INVALID", () => normalizeInstanceId("a b"));
    expectCode("DISPATCH_INSTANCE_INVALID", () => normalizeInstanceId("."));
    assert.equal(normalizeInstanceId(null), "default");
    assert.equal(normalizeInstanceId(undefined), "default");
    assert.equal(normalizeInstanceId("B-2"), "b-2");
    assert.equal(normalizeInstanceId("  ok1  "), "ok1");
  }],
  ["parseDispatchOptions --instance 解析与负例", () => {
    const parsed = parseDispatchOptions(["--message", "x", "--instance", "Leg-1"]);
    assert.equal(parsed.instanceId, "leg-1");
    expectCode("DISPATCH_OPTION_VALUE_MISSING", () => parseDispatchOptions(["--message", "x", "--instance"]));
    expectCode("DISPATCH_OPTION_DUPLICATE", () => parseDispatchOptions(["--message", "x", "--instance", "a", "--instance", "b"]));
  }],
  ["端口分配：新实例从候选下界开始", () => {
    const { port, allocated } = allocateInstancePort({ instanceId: "a", registry: {}, candidates: { min: 9300, max: 9305 } });
    assert.deepEqual({ port, allocated }, { port: 9300, allocated: true });
  }],
  ["端口分配：跳过他实例已登记端口", () => {
    const r = allocateInstancePort({ instanceId: "b", registry: { a: 9300 }, candidates: { min: 9300, max: 9305 } });
    assert.equal(r.port, 9301);
  }],
  ["端口分配：探测占用跳过且不落入登记端口", () => {
    const r = allocateInstancePort({
      instanceId: "c", registry: { a: 9300 }, isPortBusy: (p) => p === 9301 || p === 9302,
      candidates: { min: 9300, max: 9305 },
    });
    assert.equal(r.port, 9303);
  }],
  ["端口分配：已登记实例稳定返回原端口（不重分配）", () => {
    const r = allocateInstancePort({ instanceId: "a", registry: { a: 9377 }, candidates: { min: 9300, max: 9305 } });
    assert.deepEqual(r, { port: 9377, allocated: false });
  }],
  ["端口分配：候选耗尽 fail-closed", () => {
    assert.throws(
      () => allocateInstancePort({ instanceId: "z", registry: { a: 9300, b: 9301, c: 9302, d: 9303, e: 9304, f: 9305 }, candidates: { min: 9300, max: 9305 } }),
      (error) => error?.code === "INSTANCE_PORT_EXHAUSTED",
    );
  }],
  ["指针单写者守卫：default 可写；命名实例未绑定 fail-closed", () => {
    assertPointerWriterAllowed({ instanceId: "default", options: {} });
    expectCode("POINTER_SINGLE_WRITER_VIOLATION", () => assertPointerWriterAllowed({ instanceId: "agent-a", options: {} }));
    assert.doesNotThrow(() => assertPointerWriterAllowed({ instanceId: "agent-a", options: { noUpdatePointer: true } }));
    assert.doesNotThrow(() => assertPointerWriterAllowed({ instanceId: "agent-a", options: { sessionResult: "r.json" } }));
  }],
  ["进程归属：完整启动参数精确 token 匹配", () => {
    const own = join(PROFILES, "gpt-poc-a");
    assert.equal(matchesProfileOwnership(`"C:\\Program Files\\...\\chrome.exe" --remote-debugging-port=9300 --user-data-dir=${own} --x`, own), true);
    assert.equal(matchesProfileOwnership(`chrome.exe --user-data-dir="${own}" --x`, own), true); // 引号包裹
    assert.equal(matchesProfileOwnership(`chrome.exe --user-data-dir=${own.toUpperCase()} --x`, own), true); // Windows 大小写不敏感
  }],
  ["进程归属负例：前缀碰撞/他 profile/无 user-data-dir/空串", () => {
    const own = join(PROFILES, "gpt-poc-a");
    assert.equal(matchesProfileOwnership(`chrome.exe --user-data-dir=${join(PROFILES, "gpt-poc-a2")}`, own), false); // 前缀碰撞不得误判
    assert.equal(matchesProfileOwnership(`chrome.exe --user-data-dir=${join(PROFILES, "gpt-poc-b")}`, own), false);
    assert.equal(matchesProfileOwnership("chrome.exe --flag", own), false);
    assert.equal(matchesProfileOwnership("", own), false);
    assert.equal(matchesProfileOwnership("chrome.exe --user-data-dir=", own), false);
  }],
  ["清理脚本生成：精确归属+禁子串通配+归属不明计数", () => {
    const own = join(PROFILES, "gpt-poc-a");
    const script = buildKillProfileScript(own);
    assert.ok(script.includes("Stop-Process"));
    assert.ok(script.includes(own.replace(/'/g, "''")));
    assert.ok(!script.includes(`-like '*${own}'`)); // 禁子串通配匹配
    assert.ok(!/-like\s+'\*gpt-poc\*'/.test(script));
    assert.ok(script.includes("$foreign")); // 归属不明/他实例只计数不杀
    assert.ok(script.includes("$remaining")); // 清理后核对
  }],
  ["实例锁域隔离：不同 lockPath 各自获取互不干扰（C8 负例补强）", () => {
    const lockA = join(LOCKS, "test-instance-a.lockfile");
    const lockB = join(LOCKS, "test-instance-b.lockfile");
    const a = acquireSessionLock({ holder: "test-a", lockPath: lockA });
    const b = acquireSessionLock({ holder: "test-b", lockPath: lockB });
    assert.equal(a.release instanceof Function, true);
    assert.equal(b.release instanceof Function, true);
    a.release();
    b.release();
  }],
  ["实例锁互斥保持：同 lockPath 二次获取 fail-closed（互斥语义不因实例化松动）", () => {
    const lockC = join(LOCKS, "test-instance-c.lockfile");
    const first = acquireSessionLock({ holder: "test-c1", lockPath: lockC });
    assert.throws(
      () => acquireSessionLock({ holder: "test-c2", lockPath: lockC }),
      (error) => error?.code === "SESSION_LOCK_CONFLICT",
    );
    first.release();
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
  `[${startedAt}] 实例域配置测试开始 node=${process.version}`,
  ...results.map((result) => `[${new Date().toISOString()}] ${result.result} ${result.name}${result.error ? `: ${result.error}` : ""}`),
  `[${report.finished_at}] SUMMARY total=${report.total} passed=${report.passed} failed=${failed}`,
];
writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
writeFileSync(logPath, `${lines.join("\n")}\n`, "utf8");
console.log(lines.join("\n"));
console.log(`测试报告: ${jsonPath}`);
if (failed > 0) process.exitCode = 1;
