// 测试 ③：submit_result 报告结构校验（03-协议 §6）+ 登记幂等（RES-0003）

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { createAieoMcpServer } from "../src/mcp_server.mjs";
import { FileBackedFakeM1Client } from "../src/fake_m1_client.mjs";
import { makeTempDir, makeTestLogger, parseToolText, validDevReport } from "./helpers.mjs";

let statePath;
let m1;
let session;
let client;
let sink;

before(async () => {
  statePath = join(makeTempDir("aieo-zb-report-"), "state.json");
  m1 = new FileBackedFakeM1Client({ statePath });
  const lg = makeTestLogger("test");
  sink = lg.sink;
  const server = createAieoMcpServer({ m1Client: m1, logger: lg.logger }, { sessionId: "SES-RPT" });
  client = new Client({ name: "test-client", version: "0.1.0" });
  const [c, s] = InMemoryTransport.createLinkedPair();
  await server.connect(s);
  await client.connect(c);
});

after(async () => {
  await client.close();
});

async function submit(report) {
  return client.callTool({ name: "submit_result", arguments: { report } });
}

function readState() {
  return JSON.parse(readFileSync(statePath, "utf8"));
}

test("③-1 合法报告（03-协议 §6 示例同构）登记成功并投递 DEVELOPMENT_COMPLETED", async () => {
  const res = await submit(validDevReport());
  assert.equal(res.isError, undefined);
  const payload = parseToolText(res);
  assert.equal(payload.accepted, true);
  assert.equal(payload.report_registry.registered, true);
  assert.match(payload.message_ack.message_id, /^MSG-\d{8}-\d{6}$/);
  const state = readState();
  assert.ok(state.dev_reports["EXEC-001"]);
});

test("③-2 缺失必填字段：REQ-0002 + 字段级明细", async () => {
  const bad = validDevReport();
  delete bad.implementation_summary;
  delete bad.git;
  delete bad.tests;
  const res = await submit(bad);
  assert.equal(res.isError, true);
  const err = parseToolText(res);
  assert.equal(err.code, "REQ-0002");
  const fields = err.details.field_errors.map((f) => f.field);
  assert.ok(fields.includes("implementation_summary"), "缺 implementation_summary 明细");
  assert.ok(fields.includes("git"), "缺 git 明细");
  assert.ok(fields.includes("tests"), "缺 tests 明细");
});

test("③-3 commit_sha 非完整 40 位 SHA：REQ-0002（禁止短 SHA）", async () => {
  const bad = validDevReport({ git: { ...validDevReport().git, commit_sha: "abc123" } });
  const res = await submit(bad);
  const err = parseToolText(res);
  assert.equal(err.code, "REQ-0002");
  assert.deepEqual(err.details.field_errors.map((f) => f.field), ["git.commit_sha"]);
});

test("③-4 status 枚举外取值：REQ-0002", async () => {
  const bad = validDevReport({ status: "DONE" });
  const res = await submit(bad);
  const err = parseToolText(res);
  assert.equal(err.code, "REQ-0002");
  assert.ok(err.details.field_errors.some((f) => f.field === "status"));
});

test("③-5 status=BLOCKED 且 known_issues 为空：REQ-0002（阻塞必须记录原因）", async () => {
  const bad = validDevReport({ status: "BLOCKED" }); // known_issues=[]
  const res = await submit(bad);
  const err = parseToolText(res);
  assert.equal(err.code, "REQ-0002");
  assert.ok(err.details.field_errors.some((f) => f.field === "known_issues"));
});

test("③-6 同一报告重复提交：幂等返回原登记结果（duplicate=true），不重复执行副作用", async () => {
  const rep = validDevReport({ task_id: "T-P1-200", execution_id: "EXEC-200" });
  const first = await submit(rep);
  assert.equal(parseToolText(first).accepted, true);
  const second = await submit(rep);
  const payload = parseToolText(second);
  assert.equal(payload.accepted, true, "重复提交按幂等返回原结果");
  assert.equal(payload.report_registry.duplicate, true);
  assert.equal(payload.message_ack.skipped, true, "重复登记不产生第二条 DEVELOPMENT_COMPLETED 消息");
  const state = readState();
  const sameMsgs = Object.values(state.messages).filter((m) => m.envelope.message_type === "DEVELOPMENT_COMPLETED" && m.envelope.payload.execution_id === "EXEC-200");
  assert.equal(sameMsgs.length, 1, "DEVELOPMENT_COMPLETED 消息只应投递一次（重复消息不重复处理，03-协议 §9-1）");
});

test("③-7 同 execution_id 不同内容：RES-0003 拒绝覆盖（历史保留，不覆盖旧记录）", async () => {
  const rep = validDevReport({ task_id: "T-P1-201", execution_id: "EXEC-201", implementation_summary: "第一版" });
  const first = await submit(rep);
  assert.equal(parseToolText(first).accepted, true);
  const tampered = validDevReport({ task_id: "T-P1-201", execution_id: "EXEC-201", implementation_summary: "篡改版" });
  const second = await submit(tampered);
  assert.equal(second.isError, true);
  const err = parseToolText(second);
  assert.equal(err.code, "RES-0003");
});

test("③-8 跨任务提交：本会话在途任务不一致 → RES-0002（单会话单任务）", async () => {
  // 当前会话在途任务为 T-P1-201（③-7 成功提交后已清除），先领取 T-P1-202 再提交 T-P1-203
  m1.seedTask({ ...validDevReport(), task_id: "T-P1-202", project_id: "AI-IMAGE-SERVICE", batch_id: "BATCH-001" });
  const claim = await client.callTool({ name: "claim_task", arguments: { task_id: "T-P1-202", correlation_id: "CORR-202", base_commit: "a".repeat(40) } });
  assert.equal(parseToolText(claim).accepted, true);
  const rep = validDevReport({ task_id: "T-P1-203", execution_id: "EXEC-203" });
  const res = await submit(rep);
  assert.equal(res.isError, true);
  assert.equal(parseToolText(res).code, "RES-0002");
});

test("③-9 changed_files=[] 合法（BLOCKED 报告无实现变更；T-P1-902 集成缝隙回归）", async () => {
  // 此前校验器把 length===0 一并拒绝，与文案"允许为 []"矛盾——BLOCKED 报告本无实现变更，
  // 强制伪造 changed_files 不合理。锁定 [] 通过、非字符串元素仍被拒两个语义。
  // 注意 validDevReport 的 overrides 只做顶层展开，git 子对象需整体替换。
  const gitBase = { repository: "AI-IMAGE-SERVICE", branch: "feature/T-P1-202-blocked",
                    base_commit: "a".repeat(40), commit_sha: "b".repeat(40) };
  const rep = validDevReport({
    task_id: "T-P1-202", execution_id: "EXEC-204", status: "BLOCKED",
    blocked_reason: "依赖缺失", blocked_owner: "OWNER", unblock_condition: "依赖就绪",
    known_issues: ["阻断：上游依赖未就绪"],
    git: { ...gitBase, changed_files: [] },
  });
  const res = await submit(rep);
  const payload = parseToolText(res);
  assert.equal(payload.accepted, true, "BLOCKED + changed_files=[] 应通过校验并登记");
  assert.equal(payload.report_registry.registered, true);
  const bad = validDevReport({
    task_id: "T-P1-202", execution_id: "EXEC-205",
    git: { ...gitBase, changed_files: ["ok.py", 42] },
  });
  const res2 = await submit(bad);
  assert.equal(res2.isError, true);
  assert.ok(parseToolText(res2).details.field_errors.some((f) => f.field === "git.changed_files"));
});
