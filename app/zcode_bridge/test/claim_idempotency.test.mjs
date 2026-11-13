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

// M1 ClaimRequest.base_commit 必填（T-P1-902 集成缝隙修复）：40 位十六进制 Git SHA。
const BASE_COMMIT = "a".repeat(40);

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
  const res = await call(s.client, "claim_task", { task_id: "T-P1-101", correlation_id: "CORR-101", base_commit: BASE_COMMIT });
  const payload = parseToolText(res);
  assert.equal(payload.accepted, true);
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  assert.equal(state.claims["T-P1-101"].session_id, "SES-A");
  await s.client.close();
});

test("②-2 同会话重复领取：TASK-0003 拒绝（单会话单任务 fail-closed）", async () => {
  m1.seedTask(seedTaskPackage({ task_id: "T-P1-102" }));
  const s = await makeSession("SES-B");
  const first = await call(s.client, "claim_task", { task_id: "T-P1-102", correlation_id: "CORR-102", base_commit: BASE_COMMIT });
  assert.equal(parseToolText(first).accepted, true);

  const second = await call(s.client, "claim_task", { task_id: "T-P1-102", correlation_id: "CORR-102", base_commit: BASE_COMMIT });
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
  const ok = await call(s1.client, "claim_task", { task_id: "T-P1-103", correlation_id: "CORR-103", base_commit: BASE_COMMIT });
  assert.equal(parseToolText(ok).accepted, true);

  const s2 = await makeSession("SES-C2");
  const dup = await call(s2.client, "claim_task", { task_id: "T-P1-103", correlation_id: "CORR-103", base_commit: BASE_COMMIT });
  assert.equal(dup.isError, true);
  assert.equal(parseToolText(dup).code, "TASK-0003");
  await s1.client.close();
  await s2.client.close();
});

test("②-4 submit_result 结束任务后，同会话可再次领取（幂等生命周期闭环）", async () => {
  m1.seedTask(seedTaskPackage({ task_id: "T-P1-104" }));
  m1.seedTask(seedTaskPackage({ task_id: "T-P1-105" }));
  const s = await makeSession("SES-D");
  const c1 = await call(s.client, "claim_task", { task_id: "T-P1-104", correlation_id: "CORR-104", base_commit: BASE_COMMIT });
  assert.equal(parseToolText(c1).accepted, true);

  const rep = validReport("T-P1-104", "EXEC-104");
  const sub = await call(s.client, "submit_result", { report: rep });
  assert.equal(parseToolText(sub).accepted, true);

  const c2 = await call(s.client, "claim_task", { task_id: "T-P1-105", correlation_id: "CORR-105", base_commit: BASE_COMMIT });
  const p2 = parseToolText(c2);
  assert.equal(p2.accepted, true, "任务结束后应允许领取下一任务");
  assert.equal(p2.task.task_id, "T-P1-105");
  await s.client.close();
});

test("②-5 未知任务：RES-0001；任务 ID 格式非法：REQ-0001", async () => {
  const s = await makeSession("SES-E");
  const unknown = await call(s.client, "claim_task", { task_id: "T-P1-999", correlation_id: "CORR-106", base_commit: BASE_COMMIT });
  assert.equal(unknown.isError, true);
  assert.equal(parseToolText(unknown).code, "RES-0001");

  const badFormat = await call(s.client, "claim_task", { task_id: "not-a-task", correlation_id: "CORR-107", base_commit: BASE_COMMIT });
  assert.equal(badFormat.isError, true);
  assert.equal(parseToolText(badFormat).code, "REQ-0001");
  await s.client.close();
});

test("②-6 失败调用写入 C3 错误日志（error_code=TASK-0003）", async () => {
  m1.seedTask(seedTaskPackage({ task_id: "T-P1-106" }));
  const s = await makeSession("SES-F");
  await call(s.client, "claim_task", { task_id: "T-P1-106", correlation_id: "CORR-108", base_commit: BASE_COMMIT });
  await call(s.client, "claim_task", { task_id: "T-P1-106", correlation_id: "CORR-109", base_commit: BASE_COMMIT });
  const failureRows = s.sink.records().filter((r) => r.event === "mcp.tool.call" && r.result === "FAILURE");
  assert.equal(failureRows.length, 1);
  assert.equal(failureRows[0].error_code, "TASK-0003");
  assert.equal(failureRows[0].retryable, false);
  assert.equal(failureRows[0].correlation_id, "CORR-109");
  await s.client.close();
});

test("②-7 claim 缺少 base_commit：REQ-0001 fail-closed，不触达 M1", async () => {
  const s = await makeSession("SES-G");
  const res = await call(s.client, "claim_task", { task_id: "T-P1-107", correlation_id: "CORR-110" });
  assert.equal(res.isError, true);
  const err = parseToolText(res);
  assert.equal(err.code, "REQ-0001");
  assert.match(err.message, /base_commit/);
  // M1 侧无租约产生（未触达）
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  assert.equal(state.claims?.["T-P1-107"] ?? null, null);
  await s.client.close();
});

test("②-8 base_commit 透传 M1 claim 请求（非法格式 fail-closed）", async () => {
  const s = await makeSession("SES-H");
  // 非法格式：39 位 / 非 hex → REQ-0001，M1 不触达
  for (const bad of ["a".repeat(39), "z".repeat(40)]) {
    const res = await call(s.client, "claim_task", { task_id: "T-P1-108", correlation_id: "CORR-111", base_commit: bad });
    assert.equal(res.isError, true, `base_commit=${bad} 必须被拒`);
    assert.equal(parseToolText(res).code, "REQ-0001");
  }
  // 合法格式透传：捕获 HttpM1Client 形态请求（直接断言 m1Client 接口入参）
  const captured = [];
  const { logger, sink } = makeTestLogger("test");
  loggers.push({ logger, sink });
  const server = createAieoMcpServer(
    {
      m1Client: {
        async claimTask(req) { captured.push(req); return { task_id: req.task_id, execution_id: "EXEC-X", project_id: "P", batch_id: "BATCH-001" }; },
        async submitMessage() { return { message_id: "MSG-20260101-000001", status: "PENDING" }; },
        async registerDevReport() { return { registered: true, duplicate: false, dev_report_id: "DEV-1" }; },
      },
      logger,
    },
    { sessionId: "SES-H2" }
  );
  const client = new Client({ name: "test-client", version: "0.1.0" });
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await server.connect(serverT);
  await client.connect(clientT);
  const ok = await client.callTool({ name: "claim_task", arguments: { task_id: "T-P1-108", correlation_id: "CORR-112", base_commit: BASE_COMMIT } });
  assert.equal(parseToolText(ok).accepted, true);
  assert.equal(captured.length, 1);
  assert.equal(captured[0].base_commit, BASE_COMMIT);
  await client.close();
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
