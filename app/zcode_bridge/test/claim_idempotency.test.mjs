// 测试 ②：claim_task 幂等 / 重复领取拒绝
//
// 路径：SDK InMemoryTransport 直连 createAieoMcpServer（无 stdio，纯进程内），
// M1 用 FileBackedFakeM1Client（两服务实例共享同一状态文件，模拟跨会话并发）。

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { createAieoMcpServer } from "../src/mcp_server.mjs";
import { FileBackedFakeM1Client } from "../src/fake_m1_client.mjs";
import { makeTempDir, seedTaskPackage, makeTestLogger, parseToolText } from "./helpers.mjs";

let statePath;
let m1;
const loggers = [];

before(async () => {
  statePath = join(makeTempDir("aieo-zb-claim-"), "state.json");
  m1 = new FileBackedFakeM1Client({ statePath });
});

after(() => {
  for (const { logger } of loggers) logger.close();
});

/** 组装一个已连接的（server + client）对，sessionId 可指定以模拟不同会话。 */
async function makeSession(sessionId) {
  const { logger, sink } = makeTestLogger("test");
  loggers.push({ logger, sink });
  const server = createAieoMcpServer(
    { m1Client: m1, logger },
    { sessionId }
  );
  const client = new Client({ name: "test-client", version: "0.1.0" });
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await server.connect(serverT);
  await client.connect(clientT);
  return { client, sink, server };
}

async function call(client, name, args) {
  return client.callTool({ name, arguments: args });
}

test("②-1 正常领取：READY 任务可领取，返回租约", async () => {
  m1.seedTask(seedTaskPackage({ task_id: "T-P1-101" }));
  const s = await makeSession("SES-A");
  const res = await call(s.client, "claim_task", { task_id: "T-P1-101", correlation_id: "CORR-101" });
  const payload = parseToolText(res);
  assert.equal(payload.accepted, true);
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  assert.equal(state.claims["T-P1-101"].session_id, "SES-A");
  await s.client.close();
});

test("②-2 同会话重复领取：TASK-0003 拒绝（单会话单任务 fail-closed）", async () => {
  m1.seedTask(seedTaskPackage({ task_id: "T-P1-102" }));
  const s = await makeSession("SES-B");
  const first = await call(s.client, "claim_task", { task_id: "T-P1-102", correlation_id: "CORR-102" });
  assert.equal(parseToolText(first).accepted, true);

  const second = await call(s.client, "claim_task", { task_id: "T-P1-102", correlation_id: "CORR-102" });
  assert.equal(second.isError, true, "重复领取必须返回 isError");
  const err = parseToolText(second);
  assert.equal(err.code, "TASK-0003");
  assert.match(err.message, /TASK_ALREADY_CLAIMED|已领取/);
  assert.equal(err.retryable, false);
  // 假 M1 侧租约未变（仍为第一次领取）
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  assert.equal(state.claims["T-P1-102"].session_id, "SES-B");
  await s.client.close();
});

test("②-3 跨会话重复领取：TASK-0003 拒绝（独占租约）", async () => {
  m1.seedTask(seedTaskPackage({ task_id: "T-P1-103" }));
  const s1 = await makeSession("SES-C1");
  const ok = await call(s1.client, "claim_task", { task_id: "T-P1-103", correlation_id: "CORR-103" });
  assert.equal(parseToolText(ok).accepted, true);

  const s2 = await makeSession("SES-C2");
  const dup = await call(s2.client, "claim_task", { task_id: "T-P1-103", correlation_id: "CORR-103" });
  assert.equal(dup.isError, true);
  assert.equal(parseToolText(dup).code, "TASK-0003");
  await s1.client.close();
  await s2.client.close();
});

test("②-4 submit_result 结束任务后，同会话可再次领取（幂等生命周期闭环）", async () => {
  m1.seedTask(seedTaskPackage({ task_id: "T-P1-104" }));
  m1.seedTask(seedTaskPackage({ task_id: "T-P1-105" }));
  const s = await makeSession("SES-D");
  const c1 = await call(s.client, "claim_task", { task_id: "T-P1-104", correlation_id: "CORR-104" });
  assert.equal(parseToolText(c1).accepted, true);

  const rep = validReport("T-P1-104", "EXEC-104");
  const sub = await call(s.client, "submit_result", { report: rep });
  assert.equal(parseToolText(sub).accepted, true);

  const c2 = await call(s.client, "claim_task", { task_id: "T-P1-105", correlation_id: "CORR-105" });
  const p2 = parseToolText(c2);
  assert.equal(p2.accepted, true, "任务结束后应允许领取下一任务");
  assert.equal(p2.task.task_id, "T-P1-105");
  await s.client.close();
});

test("②-5 未知任务：RES-0001；任务 ID 格式非法：REQ-0001", async () => {
  const s = await makeSession("SES-E");
  const unknown = await call(s.client, "claim_task", { task_id: "T-P1-999", correlation_id: "CORR-106" });
  assert.equal(unknown.isError, true);
  assert.equal(parseToolText(unknown).code, "RES-0001");

  const badFormat = await call(s.client, "claim_task", { task_id: "not-a-task", correlation_id: "CORR-107" });
  assert.equal(badFormat.isError, true);
  assert.equal(parseToolText(badFormat).code, "REQ-0001");
  await s.client.close();
});

test("②-6 失败调用写入 C3 错误日志（error_code=TASK-0003）", async () => {
  m1.seedTask(seedTaskPackage({ task_id: "T-P1-106" }));
  const s = await makeSession("SES-F");
  await call(s.client, "claim_task", { task_id: "T-P1-106", correlation_id: "CORR-108" });
  await call(s.client, "claim_task", { task_id: "T-P1-106", correlation_id: "CORR-109" });
  const failureRows = s.sink.records().filter((r) => r.event === "mcp.tool.call" && r.result === "FAILURE");
  assert.equal(failureRows.length, 1);
  assert.equal(failureRows[0].error_code, "TASK-0003");
  assert.equal(failureRows[0].retryable, false);
  assert.equal(failureRows[0].correlation_id, "CORR-109");
  await s.client.close();
});

function validReport(taskId, execId) {
  return {
    task_id: taskId,
    execution_id: execId,
    status: "COMPLETED",
    implementation_summary: "完成",
    git: {
      repository: "AI-IMAGE-SERVICE",
      branch: "feature/x",
      base_commit: "a".repeat(40),
      commit_sha: "b".repeat(40),
      changed_files: ["src/providers/base.py"],
    },
    tests: { executed: true, commands: ["pytest -q"], passed: 3, failed: 0 },
    known_issues: [],
    knowledge_updates_required: false,
    self_assessment: "自评完成",
    correlation_id: "CORR-104",
    batch_id: "BATCH-001",
  };
}
