// AIEO Phase 0 - POC-01: 最小 AIEO MCP Server（stdio 传输）
//
// 仅提供三个无破坏性工具（不开放文件读写、Shell、Git 等高权限能力）：
//   aieo_poc_ping()                          -> 服务状态与版本
//   aieo_poc_get_test_task()                 -> 返回固定模拟任务
//   aieo_poc_submit_result(task_id, result, summary) -> 接收并保存模拟结果
//
// 所有调用追加写入 phase0/logs/mcp-call-records.json（AIEO 测试端读取）。
// 提交结果写入 phase0/logs/mcp-submitted-results.json。
// 日志写入失败不影响工具返回（不因磁盘问题伪造/中断结果）。

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_DIR = join(__dirname, "..", "logs");
const CALL_RECORDS = join(LOG_DIR, "mcp-call-records.json");
const SUBMITTED = join(LOG_DIR, "mcp-submitted-results.json");

const SERVER_NAME = "aieo-poc";
const SERVER_VERSION = "0.1.0";
const STARTED_AT = new Date().toISOString();

// ---- 固定模拟任务（后续 POC-05 端到端演示复用） ----
const MOCK_TASK = {
  schema_version: "1.0",
  task_id: "T-POC-001",
  project_id: "AIEO-PHASE0",
  batch_id: "BATCH-POC-0",
  title: "实现 greet(name) 函数并通过自测",
  description:
    "在指定目录创建 greet.js：导出 greet(name) 返回 'Hello, <name>!'；创建 test_greet.js 断言 greet('AIEO') === 'Hello, AIEO!' 并用 node 执行自测。",
  files_scope: ["phase0/e2e-poc/src/greet.js", "phase0/e2e-poc/test_greet.js"],
  forbidden_paths: ["docs/", "phase0/reports/"],
  branch_naming: "feature/AIEO-POC-001",
  test_command: "node test_greet.js",
  acceptance_criteria: [
    "greet.js 存在且导出 greet 函数",
    "test_greet.js 执行 exit code 0",
    "改动不超出 files_scope"
  ]
};

// ---- 调用记录（append；写失败不抛出） ----
function appendRecord(file, record) {
  try {
    if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
    let list = [];
    if (existsSync(file)) {
      try {
        list = JSON.parse(readFileSync(file, "utf8"));
        if (!Array.isArray(list)) list = [];
      } catch {
        list = [];
      }
    }
    list.push(record);
    writeFileSync(file, JSON.stringify(list, null, 2), "utf8");
    return true;
  } catch (err) {
    process.stderr.write(`[aieo-mcp-poc] 写记录失败: ${err.message}\n`);
    return false;
  }
}

function record(toolName, args, result) {
  return appendRecord(CALL_RECORDS, {
    ts: new Date().toISOString(),
    server: SERVER_NAME,
    server_pid: process.pid,
    tool: toolName,
    arguments: args ?? null,
    result
  });
}

// ---- Server ----
const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

server.registerTool(
  "aieo_poc_ping",
  {
    title: "AIEO POC Ping",
    description: "返回 AIEO MCP Server 状态、版本与时间，用于连通性验证。",
    inputSchema: {}
  },
  async () => {
    const payload = {
      status: "ok",
      server: SERVER_NAME,
      version: SERVER_VERSION,
      started_at: STARTED_AT,
      now: new Date().toISOString(),
      pid: process.pid
    };
    record("aieo_poc_ping", {}, payload);
    return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
  }
);

server.registerTool(
  "aieo_poc_get_test_task",
  {
    title: "AIEO POC 获取测试任务",
    description: "返回固定的模拟开发任务 T-POC-001（无副作用）。",
    inputSchema: {}
  },
  async () => {
    record("aieo_poc_get_test_task", {}, { task_id: MOCK_TASK.task_id });
    return {
      content: [{ type: "text", text: JSON.stringify(MOCK_TASK, null, 2) }]
    };
  }
);

server.registerTool(
  "aieo_poc_submit_result",
  {
    title: "AIEO POC 提交结果",
    description: "提交模拟任务结果（task_id + result + summary），保存到 AIEO 测试端记录文件。",
    inputSchema: {
      task_id: z.string().min(1).describe("任务 ID，应为 T-POC-001"),
      result: z.enum(["SUCCESS", "FAILED", "BLOCKED"]).describe("执行结果"),
      summary: z.string().min(1).describe("一句话总结")
    }
  },
  async ({ task_id, result, summary }) => {
    if (task_id !== MOCK_TASK.task_id) {
      const err = { accepted: false, reason: `未知 task_id: ${task_id}，当前只接受 ${MOCK_TASK.task_id}` };
      record("aieo_poc_submit_result", { task_id, result, summary }, err);
      return { content: [{ type: "text", text: JSON.stringify(err, null, 2) }], isError: true };
    }
    const recordId = `REC-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
    const payload = {
      accepted: true,
      record_id: recordId,
      task_id,
      result,
      summary,
      received_at: new Date().toISOString()
    };
    const saved = appendRecord(SUBMITTED, payload);
    payload.persisted = saved;
    record("aieo_poc_submit_result", { task_id, result, summary }, payload);
    return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
  }
);

// ---- 启动（stdio） ----
const transport = new StdioServerTransport();
await server.connect(transport);
process.stderr.write(`[aieo-mcp-poc] ${SERVER_NAME}@${SERVER_VERSION} ready on stdio (pid=${process.pid})\n`);
