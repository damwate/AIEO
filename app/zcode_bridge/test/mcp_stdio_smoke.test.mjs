// 测试 ①：MCP stdio 冒烟（POC-01 同型：真实 server 子进程 + JSON-RPC 握手 + 三工具调用）
//
// M1 用 FileBackedFakeM1Client（内存假实现语义 + 状态落盘，测试进程可核验），
// 不访问任何真实 HTTP 服务；日志为真实文件 NDJSON，落 runtime/logs/zcode_bridge/<用例目录>/。

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { StdioMcpClient, seedTaskPackage, parseToolText } from "./helpers.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const BIN = join(__dirname, "..", "bin", "aieo-zcode-mcp.mjs");

let tmpRoot;       // 用例临时根（M1 假状态 + 日志目录）
let client;
let statePath;
let logDir;
const workspace = "D:/AIEO/workspaces/demo";

before(async () => {
  const { makeTempDir } = await import("./helpers.mjs");
  tmpRoot = makeTempDir("aieo-zb-smoke-");
  statePath = join(tmpRoot, "fake-m1-state.json");
  logDir = join(tmpRoot, "logs");
  const fake = await import("../src/fake_m1_client.mjs");
  const m1 = new fake.FileBackedFakeM1Client({ statePath });
  m1.seedTask(seedTaskPackage({ workspace_path: workspace }));
  client = new StdioMcpClient(BIN, {
    AIEO_ENV: "test",
    AIEO_ZCODE_BRIDGE_M1_MODE: "fake-file",
    AIEO_ZCODE_BRIDGE_M1_FAKE_STATE: statePath,
    AIEO_ZCODE_BRIDGE_LOG_DIR: logDir,
  });
});

after(async () => {
  await client?.close();
  try { (await import("node:fs")).rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* 保留现场 */ }
});

test("①-1 initialize 握手：serverInfo 为 aieo-zcode-bridge", async () => {
  const resp = await client.initialize();
  assert.equal(resp.result.serverInfo.name, "aieo-zcode-bridge");
  assert.equal(resp.result.protocolVersion, "2025-06-18");
});

test("①-2 tools/list：恰好暴露受控三工具，无高权限能力", async () => {
  const resp = await client.rpc("tools/list");
  const names = resp.result.tools.map((t) => t.name).sort();
  assert.deepEqual(names, ["claim_task", "report_progress", "submit_result"]);
});

test("①-3 claim_task：领取预置任务，返回任务包与租约会话", async () => {
  const res = await client.callTool("claim_task", { task_id: "T-P1-014", correlation_id: "CORR-001", base_commit: "a".repeat(40) });
  assert.equal(res.isError, undefined);
  const payload = parseToolText(res);
  assert.equal(payload.accepted, true);
  assert.match(payload.session_id, /^SES-/);
  assert.equal(payload.task.task_id, "T-P1-014");
  assert.equal(payload.task.project_id, "AI-IMAGE-SERVICE");
  assert.ok(payload.task.claim.agent_id);
});

test("①-4 report_progress：进度消息投递入假 M1 Inbox", async () => {
  const res = await client.callTool("report_progress", {
    task_id: "T-P1-014", correlation_id: "CORR-001", stage: "implementing", detail: "编码中", progress_percent: 40,
  });
  const payload = parseToolText(res);
  assert.equal(payload.delivered, true);
  assert.match(payload.message_id, /^MSG-\d{8}-\d{6}$/);
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  const stored = Object.values(state.messages).find((m) => m.envelope.message_id === payload.message_id);
  assert.ok(stored, "消息未落到假 M1 状态");
  assert.equal(stored.envelope.message_type, "PROGRESS_UPDATED");
  assert.equal(stored.envelope.task_id, "T-P1-014");
  assert.equal(stored.envelope.payload.stage, "implementing");
});

test("①-5 submit_result：03-协议 §6 报告登记 + DEVELOPMENT_COMPLETED 入 Inbox", async () => {
  const report = {
    task_id: "T-P1-014",
    execution_id: "EXEC-001",
    status: "COMPLETED",
    implementation_summary: "完成供应商接口适配器",
    git: {
      repository: "AI-IMAGE-SERVICE",
      branch: "feature/T-P1-014-provider-adapter",
      base_commit: "a".repeat(40),
      commit_sha: "b".repeat(40),
      changed_files: ["src/providers/base.py"],
    },
    tests: { executed: true, commands: ["pytest tests/providers -q"], passed: 25, failed: 0, log_artifact_id: "ART-TEST-001" },
    known_issues: [],
    knowledge_updates_required: true,
    self_assessment: "实现完成，等待独立审查",
    correlation_id: "CORR-001",
    batch_id: "BATCH-001",
  };
  const res = await client.callTool("submit_result", { report });
  const payload = parseToolText(res);
  assert.equal(payload.accepted, true);
  assert.equal(payload.report_registry.duplicate, false);
  assert.ok(payload.report_registry.dev_report_id);
  assert.match(payload.message_ack.message_id, /^MSG-\d{8}-\d{6}$/);
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  assert.ok(state.dev_reports["EXEC-001"], "开发报告未登记");
  const msg = Object.values(state.messages).find((m) => m.envelope.message_id === payload.message_ack.message_id);
  assert.equal(msg.envelope.message_type, "DEVELOPMENT_COMPLETED");
  assert.equal(msg.envelope.payload.task_id, "T-P1-014");
});

test("①-5b report_progress 无领取缓存：project_id/batch_id 必须经参数传入（T-P1-902 集成缝隙回归）", async () => {
  // ①-5 submit_result 已清位，本会话无 activeClaim；且真实 M1 claim 响应的任务视图
  // 不含 project_id（tasks 表无该列）。若 project_id/batch_id 未在 inputSchema 声明，
  // MCP SDK 会剥离未声明参数 → REQ-0001。此用例锁定参数补充路径。
  const res = await client.callTool("report_progress", {
    task_id: "T-P1-014", correlation_id: "CORR-002", stage: "testing", detail: "回归验证",
    project_id: "AI-IMAGE-SERVICE", batch_id: "BATCH-001",
  });
  const payload = parseToolText(res);
  assert.equal(payload.delivered, true);
  assert.match(payload.message_id, /^MSG-\d{8}-\d{6}$/);
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  const stored = Object.values(state.messages).find((m) => m.envelope.message_id === payload.message_id);
  assert.ok(stored, "消息未落到假 M1 状态");
  assert.equal(stored.envelope.project_id, "AI-IMAGE-SERVICE");
  assert.equal(stored.envelope.batch_id, "BATCH-001");
});

test("①-6 MINOR-003：server 子进程落盘 C4 NDJSON，包含 mcp.tool.call 调用记录", async () => {
  // 优雅退出后核验日志文件
  await client.close();
  assert.ok(existsSync(logDir), `日志目录不存在: ${logDir}`);
  const files = readdirSync(logDir).filter((f) => /^bridge-\d{4}-\d{2}-\d{2}\.ndjson$/.test(f));
  assert.ok(files.length >= 1, "无按日期轮转的 bridge-*.ndjson 文件");
  const lines = readFileSync(join(logDir, files[0]), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const toolCalls = lines.filter((r) => r.event === "mcp.tool.call");
  assert.equal(toolCalls.length, 4, `期望 4 条工具调用记录（claim/progress×2/submit），实际 ${toolCalls.length}`);
  const ops = toolCalls.map((r) => r.operation).sort();
  assert.deepEqual(ops, ["claim_task", "report_progress", "report_progress", "submit_result"]);
  for (const row of toolCalls) {
    for (const f of ["timestamp", "level", "service", "module", "event", "message", "env", "operation", "result", "duration_ms"]) {
      assert.notEqual(row[f], undefined, `mcp.tool.call 缺少 C4 字段 ${f}`);
    }
    assert.equal(row.service, "zcode_bridge");
    assert.equal(row.module, "M3");
    assert.equal(row.result, "SUCCESS");
  }
});
