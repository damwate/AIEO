// 测试 ④：CLI 适配器干跑（不真实调用 ZCode CLI、不联网）
//
// mock 可执行文件：node 脚本模拟 zcode --prompt/--cwd/--mode/--json 行为：
//   - variant normal   ：先输出一行噪声日志，再输出 POC-02 形态的最终 JSON，exit 0；
//   - variant obey     ：轮询取消标记文件，发现后立即输出 JSON 并 exit 0（软取消被响应）；
//   - variant stubborn ：无视取消标记，长睡 120s（宽限期满后被进程树终止，无输出）。
// mock 将收到的 argv 关键参数写入 <cwd>/_observed-args.json 供断言参数拼装。

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { writeFileSync, readFileSync, rmSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { ZcodeCliAdapter, mapRiskToMode, cancelMarkerPathFor } from "../src/cli_adapter.mjs";
import { ZCODE_MODE_WHITELIST } from "../src/config.mjs"; // 白名单单一来源（config.mjs）
import { InMemoryWorkspaceLock } from "../src/workspace_lock.mjs";
import { makeTempDir, seedTaskPackage, makeTestLogger } from "./helpers.mjs";

let tmpRoot;
let mockScriptPath;

before(() => {
  tmpRoot = makeTempDir("aieo-zb-cli-");
  mockScriptPath = join(tmpRoot, "mock-zcode.mjs");
  writeFileSync(mockScriptPath, MOCK_SCRIPT(), "utf8");
  mkdirSync(join(tmpRoot, "workspace-A"), { recursive: true });
  mkdirSync(join(tmpRoot, "workspace-B"), { recursive: true });
});

after(() => {
  try { rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* 保留现场 */ }
});

// 注意：node:test 根级 before() 钩子在注册时即执行（早于模块尾部 const 初始化），
// 因此 mock 脚本内容用函数声明（整体提升）包装，调用时机在钩子执行期，避开 TDZ。
function MOCK_SCRIPT() {
  return `// mock-zcode：模拟 ZCode CLI --json 行为（测试夹具）
import { writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
const [,, variant, delayMs, ...argv] = process.argv;
const out = (o) => process.stdout.write(JSON.stringify(o) + "\\n");
const observed = {};
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--prompt" || argv[i] === "--cwd" || argv[i] === "--mode") observed[argv[i].slice(2)] = argv[i + 1];
  if (argv[i] === "--json") observed.json = true;
}
writeFileSync(join(observed.cwd, "_observed-args.json"), JSON.stringify(observed, null, 2), "utf8");
process.stdout.write("[mock-zcode] starting task...\\n"); // 噪声行（验证 stdout 容忍非 JSON 行）
const finalJson = {
  sessionId: "sess_mock-1234",
  traceId: "trace-mock-5678",
  turnId: "turn_mock",
  response: "- mock 任务完成，测试 PASS",
  usage: { modelRequestCount: 2, inputTokens: 1000, outputTokens: 200 },
  projection: { status: "idle", turnCount: 1 },
};
if (variant === "normal") {
  if (Number(delayMs) > 0) { const { setTimeout: s } = await import("node:timers/promises"); await s(Number(delayMs)); }
  out(finalJson);
  process.exit(0);
}
if (variant === "obey") {
  // 软取消协议：每 50ms 检查 --prompt 中的取消标记路径
  const marker = observed.prompt.split("路径：")[1]?.split("）")[0];
  for (;;) {
    if (marker && existsSync(marker)) {
      out(finalJson);
      process.exit(0);
    }
    const { setTimeout: s } = await import("node:timers/promises");
    await s(50);
  }
}
if (variant === "stubborn") {
  // 无视取消标记长睡（进程树终止兜底路径）
  const { setTimeout: s } = await import("node:timers/promises");
  await s(120_000);
  out(finalJson);
  process.exit(0);
}
`;
}

function adapterConfig(overrides = {}) {
  return {
    zcodeCliPath: process.execPath,
    cancelDir: join(tmpRoot, "cancel"),
    taskTimeoutMs: 10_000,
    cancelGraceMs: 500,
    allowedModes: ZCODE_MODE_WHITELIST,
    ...overrides,
  };
}

function makeAdapter(opts = {}, lockService = null) {
  const lg = makeTestLogger("test");
  const adapter = new ZcodeCliAdapter(adapterConfig(opts.config ?? {}), {
    lockService,
    logger: lg.logger,
    // spawn 包装：node <mockScriptPath> <variant> <delayMs> <真实参数...>
    spawnImpl: (cmd, args, spawnOpts) =>
      spawn(cmd, [mockScriptPath, opts.variant ?? "normal", String(opts.delayMs ?? 0), ...args], spawnOpts),
  });
  return { adapter, sink: lg.sink, logger: lg.logger };
}

const WS = join(tmpRoot, "workspace-A");
const PKG = () => seedTaskPackage({ workspace_path: WS });

test("④-1 参数拼装与 --json 解析：prompt/cwd/mode 按 POC-02 形态交付", async () => {
  const { adapter } = makeAdapter({ variant: "normal" });
  const result = await adapter.trigger(PKG(), { correlationId: "CORR-301", risk: "MEDIUM" });
  // 返回结构 {session_id, trace_id, response, usage}
  assert.equal(result.session_id, "sess_mock-1234");
  assert.equal(result.trace_id, "trace-mock-5678");
  assert.equal(result.response, "- mock 任务完成，测试 PASS");
  assert.deepEqual(result.usage, { modelRequestCount: 2, inputTokens: 1000, outputTokens: 200 });
  assert.equal(result.cancelled, false);
  assert.equal(result.exit_code, 0);
  // 参数拼装核验（mock 落盘的观测文件）
  const observed = JSON.parse(readFileSync(join(WS, "_observed-args.json"), "utf8"));
  assert.equal(observed.json, true, "必须带 --json");
  assert.equal(observed.mode, "edit", "MEDIUM 风险映射 edit（MINOR-004）");
  assert.equal(observed.cwd, WS);
  const pkg = JSON.parse(observed.prompt.split("\n")[1]); // 第 0 行说明，第 1 行任务包 JSON
  assert.equal(pkg.task_id, "T-P1-014");
  assert.match(observed.prompt, /取消标记文件/, "提示词内嵌软取消协议（DEC-006）");
});

test("④-2 噪声容忍：stdout 混入非 JSON 行仍能提取最终结构", async () => {
  // ④-1 的 mock 已输出噪声行，此处直接再跑一次并断言成功（噪声行不破坏解析）
  const { adapter } = makeAdapter({ variant: "normal" });
  const result = await adapter.trigger(PKG(), { correlationId: "CORR-302", risk: "LOW" });
  assert.equal(result.session_id, "sess_mock-1234");
  assert.equal(result.mode, "build");
});

test("④-3 MINOR-004 风险→mode 映射与白名单（纯函数，无进程）", () => {
  assert.equal(mapRiskToMode("LOW"), "build");
  assert.equal(mapRiskToMode("MEDIUM"), "edit");
  assert.equal(mapRiskToMode("HIGH"), "guarded");
  assert.equal(mapRiskToMode("CRITICAL"), "guarded");
  assert.equal(mapRiskToMode(null), "guarded", "未声明风险 → 最严格模式（fail-closed）");
  assert.equal(mapRiskToMode("medium"), "edit", "大小写归一");
  // 白名单外 / yolo / 请求与映射不一致 → 拒绝
  for (const bad of ["yolo", "full", "DANGEROUS"]) {
    assert.throws(() => mapRiskToMode("LOW", { requestedMode: bad }), /不在白名单|未知任务风险/);
  }
  assert.throws(() => mapRiskToMode("LOW", { requestedMode: "guarded" }), /与风险映射结果.*不一致/);
  assert.throws(() => mapRiskToMode("EXTREME"), /未知任务风险级别/);
});

test("④-4 超时 → 软取消标记文件 → 宽限期 → 进程树终止兜底（DEC-006 全链路）", async () => {
  const lock = new InMemoryWorkspaceLock();
  const { adapter, sink } = makeAdapter({ variant: "stubborn" }, lock);
  const marker = cancelMarkerPathFor(adapterConfig().cancelDir, "T-P1-014");
  const t0 = Date.now();
  await assert.rejects(
    () => adapter.trigger(PKG(), { correlationId: "CORR-303", risk: "MEDIUM", timeoutMs: 400, cancelGraceMs: 400 }),
    (err) => {
      assert.equal(err.c3?.code, "PROVIDER-0001", "超时取消按 PROVIDER-0001（超时 ≠ 任务失败）");
      assert.match(err.message, /PROVIDER_TIMEOUT/);
      return true;
    }
  );
  const elapsed = Date.now() - t0;
  // 软取消标记文件真实写入
  assert.ok(existsSync(marker), "软取消标记文件必须存在");
  const markerPayload = JSON.parse(readFileSync(marker, "utf8"));
  assert.equal(markerPayload.cancel, true);
  assert.equal(markerPayload.task_id, "T-P1-014");
  // 进程树终止发生（宽限期 400ms + 超时 400ms 量级，远小于 stubborn 的 120s）
  assert.ok(elapsed < 60_000, `应在取消链路后及时返回，实际 ${elapsed}ms`);
  const killRows = sink.records().filter((r) => r.event === "cli.tree_kill");
  assert.equal(killRows.length, 1, "应有进程树终止记录");
  assert.equal(killRows[0].result, "SUCCESS", "taskkill /T /F 成功终止");
  // 锁同步释放（module-boundaries §6：进程树终止兜底时同步释放）
  assert.equal(lock.holderOf(WS), null, "兜底终止后工作区锁必须已释放");
}, { timeout: 90_000 });

test("④-5 软取消被 Agent 响应：宽限期内自行收尾退出 → 返回结果且 cancelled=true", async () => {
  const { adapter } = makeAdapter({ variant: "obey" });
  const marker = cancelMarkerPathFor(adapterConfig().cancelDir, "T-P1-014");
  if (existsSync(marker)) rmSync(marker, { force: true });
  const result = await adapter.trigger(PKG(), { correlationId: "CORR-304", risk: "HIGH", timeoutMs: 300, cancelGraceMs: 8000 });
  assert.equal(result.cancelled, true, "经软取消结束的运行必须标记 cancelled");
  assert.equal(result.session_id, "sess_mock-1234", "Agent 收尾输出仍有效");
  assert.ok(existsSync(marker));
  assert.ok(result.cancel_phases.some((p) => p.phase === "graceful_exit"), "取消链路记录 graceful_exit（保存现场路径）");
}, { timeout: 30_000 });

test("④-6 工作区写锁（可注入）：运行期间持锁，结束后释放；锁被占时 fail-closed 拒绝", async () => {
  const lock = new InMemoryWorkspaceLock();
  const { adapter } = makeAdapter({ variant: "normal" }, lock);
  const result = await adapter.trigger(PKG(), { correlationId: "CORR-305", risk: "LOW" });
  assert.equal(result.session_id, "sess_mock-1234");
  assert.equal(lock.holderOf(WS), null, "运行结束锁已释放");

  // 锁被占：先手动持有（独立工作区 B，避免与 ④-1 的观测文件混淆），trigger 必须拒绝且不启动进程
  const wsB = join(tmpRoot, "workspace-B");
  const pkgB = seedTaskPackage({ workspace_path: wsB });
  const handle = await lock.acquire({ workspacePath: wsB, taskId: "T-P1-999", sessionId: "SES-OTHER" });
  await assert.rejects(
    () => adapter.trigger(pkgB, { correlationId: "CORR-306", risk: "LOW" }),
    (err) => {
      assert.equal(err.c3?.code, "RES-0002");
      assert.match(err.message, /工作区写锁被其他任务持有/);
      return true;
    }
  );
  assert.equal(existsSync(join(wsB, "_observed-args.json")), false, "被拒后不得启动 CLI 进程");
  await handle.release();
});

test("④-7 缺少 correlationId / 任务包缺字段：REQ-0001", async () => {
  const { adapter } = makeAdapter({ variant: "normal" });
  await assert.rejects(
    () => adapter.trigger(PKG(), { risk: "LOW" }),
    (err) => { assert.equal(err.c3?.code, "REQ-0001"); return true; }
  );
  const bad = seedTaskPackage({ workspace_path: WS });
  delete bad.acceptance_criteria;
  await assert.rejects(
    () => adapter.trigger(bad, { correlationId: "CORR-307", risk: "LOW" }),
    (err) => {
      assert.equal(err.c3?.code, "REQ-0001");
      assert.deepEqual(err.c3.details.missing_fields, ["acceptance_criteria"]);
      return true;
    }
  );
});
