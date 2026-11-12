// 测试 ⑦：消息信封构造与校验（C1 §2.2 逐字段冻结规则）——M3 出站消息的契约面

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildEnvelope, validateEnvelope, MESSAGE_TYPES } from "../src/message_builder.mjs";

const BASE = {
  message_type: "PROGRESS_UPDATED",
  project_id: "AI-IMAGE-SERVICE",
  batch_id: "BATCH-001",
  task_id: "T-P1-014",
  correlation_id: "CORR-001",
  source: { agent_id: "ZCODE-01", agent_type: "developer" },
  target: { agent_id: "AIEO-ORCHESTRATOR", agent_type: "system" },
  payload: { stage: "implementing" },
};

test("⑦-1 合法信封：格式字段全部落位（message_id/created_at/schema_version）", () => {
  const env = buildEnvelope(BASE);
  assert.match(env.message_id, /^MSG-\d{8}-\d{6}$/);
  assert.equal(env.schema_version, "1.0");
  assert.match(env.created_at, /^.*Z$/);
  assert.deepEqual(validateEnvelope(env), [], "构造产物必须零错误");
});

test("⑦-2 message_type 必须在 03-协议 §3 的 16 种之内", () => {
  assert.equal(MESSAGE_TYPES.length, 16);
  assert.throws(() => buildEnvelope({ ...BASE, message_type: "NEW_FANCY_TYPE" }), /16 种类型/);
});

test("⑦-3 主版本不匹配：REQ-0002 语义拒绝（发送端固定 1.0，不得改动）", () => {
  const env = { ...buildEnvelope(BASE), schema_version: "2.0" };
  const errs = validateEnvelope(env);
  assert.ok(errs.some((e) => e.field === "schema_version" && /主版本/.test(e.reason)));
});

test("⑦-4 任务级消息 batch_id/task_id 条件必填（缺失 → 字段错误）", () => {
  const env = { ...buildEnvelope(BASE), batch_id: null, task_id: "" };
  const errs = validateEnvelope(env);
  const fields = errs.map((e) => e.field);
  assert.ok(fields.includes("batch_id"));
  assert.ok(fields.includes("task_id"));
});

test("⑦-5 ID 格式负例：project/batch/task/message/correlation", () => {
  const bad = (over) => validateEnvelope({ ...buildEnvelope(BASE), ...over });
  assert.ok(bad({ project_id: "lower-case" }).some((e) => e.field === "project_id"));
  assert.ok(bad({ batch_id: "BATCH-1" }).some((e) => e.field === "batch_id"), "BATCH-<3位以上序号>");
  assert.ok(bad({ task_id: "T-01" }).some((e) => e.field === "task_id"), "T-<3位以上序号>");
  assert.ok(bad({ task_id: "T-P9-014" }).length === 0, "Phase 1 形态 T-P1-xxx 合法");
  assert.ok(bad({ correlation_id: "corr-1" }).some((e) => e.field === "correlation_id"), "CORR-<序号> 或 UUIDv4，大小写敏感");
  assert.ok(bad({ correlation_id: "0e6b2a11-8c86-4a11-9b8e-3f1a2b3c4d5f" }).length === 0, "UUIDv4 合法");
  assert.ok(bad({ message_id: "MSG-2026111-000001" }).some((e) => e.field === "message_id"));
});

test("⑦-6 payload 内不得重复携带 schema_version（C1 §2.2-5）", () => {
  const raw = { ...BASE, payload: { stage: "x", schema_version: "1.0" } };
  assert.throws(() => buildEnvelope(raw), /schema_version/);
  // validate 层直接核验同一规则
  const env = buildEnvelope(BASE);
  assert.ok(validateEnvelope({ ...env, payload: { ...env.payload, schema_version: "1.0" } }).some((e) => e.field === "payload"));
});

test("⑦-7 correlation_id ≤64 字符与 agent_type 枚举", () => {
  assert.ok(validateEnvelope({ ...buildEnvelope(BASE), correlation_id: "CORR-" + "A".repeat(60) }).some((e) => e.field === "correlation_id"));
  const env = { ...buildEnvelope(BASE), source: { agent_id: "ZCODE-01", agent_type: "robot" } };
  assert.ok(validateEnvelope(env).some((e) => e.field === "source.agent_type"));
});
