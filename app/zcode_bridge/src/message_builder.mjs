// AIEO Phase 1 M3 ZCode Bridge — 消息信封构造与校验（C1 §2.2 逐字段冻结规则）
//
// M3 作为发送方产生的 message_type（03-协议 §3）：
//   TASK_ACCEPTED（领取确认）、PROGRESS_UPDATED（进度）、DEVELOPMENT_COMPLETED（开发完成报告）、
//   BLOCKER_REPORTED（阻塞上报）。
// 校验失败统一抛 REQ-0001/REQ-0002（C3），字段级明细进 details.field_errors。

import { aieoError } from "./errors.mjs";

export const PROTOCOL_SCHEMA_VERSION = "1.0";

/** 03-协议 §3 的 16 种消息类型（不得扩展新值，C1 §2.2）。 */
export const MESSAGE_TYPES = [
  "TASK_PLAN_REQUEST", "TASK_PLAN_SUBMITTED", "ARCH_REVIEW_REQUEST", "ARCH_REVIEW_SUBMITTED",
  "TASK_ASSIGNED", "TASK_ACCEPTED", "PROGRESS_UPDATED", "BLOCKER_REPORTED",
  "DEVELOPMENT_COMPLETED", "CODE_REVIEW_REQUEST", "CODE_REVIEW_SUBMITTED",
  "TEST_ACCEPTANCE_REQUEST", "TEST_ACCEPTANCE_SUBMITTED",
  "AUDIT_REQUEST", "AUDIT_SUBMITTED", "APPROVAL_REQUIRED",
].map(Object.freeze);

const AGENT_TYPES = ["system", "developer", "reviewer", "tester", "auditor", "user"];

/** 任务级消息类型（batch_id / task_id 条件必填 → 必填）。 */
const TASK_LEVEL_TYPES = new Set([
  "TASK_ASSIGNED", "TASK_ACCEPTED", "PROGRESS_UPDATED", "BLOCKER_REPORTED",
  "DEVELOPMENT_COMPLETED", "CODE_REVIEW_REQUEST", "CODE_REVIEW_SUBMITTED",
  "TEST_ACCEPTANCE_REQUEST", "TEST_ACCEPTANCE_SUBMITTED",
]);

const RE_MESSAGE_ID = /^MSG-\d{8}-\d{6}$/;
const RE_ID_CHARSET = /^[A-Z0-9-]{1,64}$/;
const RE_AGENT_ID = /^[A-Z0-9-]{1,32}$/;
const RE_PROJECT_ID = /^[A-Z0-9-]{1,32}$/;
const RE_BATCH_ID = /^BATCH-\d{3,}$/;
const RE_TASK_ID = /^T-(P\d+-)?\d{3,}$/;
// CORR- 前缀大小写敏感（与 MSG-/BATCH-/T- 大写约定一致）；UUIDv4 十六进制部分按 RFC 4122 惯例大小写均可
const RE_CORRELATION = /^(CORR-[A-Z0-9]+|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})$/;
const RE_SCHEMA_VERSION = /^\d{1,2}\.\d{1,2}$/;

function isoWithTimezone(s) {
  if (typeof s !== "string" || s.length === 0) return false;
  // ISO 8601 带时区：...Z 或 ...±HH:MM / ±HHMM
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return false;
  return /(Z|[+-]\d{2}:?\d{2})$/.test(s);
}

/**
 * 构造 M3 → M1 消息信封并立即校验（构造即合法，非法直接抛错）。
 * @param {{message_type: string, project_id: string, batch_id: string, task_id: string,
 *          correlation_id: string, source: {agent_id, agent_type}, target: {agent_id, agent_type},
 *          payload: object, messageIdSeq: number}} spec
 */
export function buildEnvelope(spec) {
  const now = new Date();
  const ymd = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}`;
  // message_id 唯一性最终由 M1 主键约束保证；M3 生成器进程内秒级单调（见模块头注释边界）
  const seq = spec.messageIdSeq ?? Math.floor((now.getTime() / 1000) % 86_400) * 10 + (spec.seqSuffix ?? 0);
  const envelope = {
    schema_version: PROTOCOL_SCHEMA_VERSION,
    message_id: `MSG-${ymd}-${String(seq).padStart(6, "0").slice(-6)}`,
    message_type: spec.message_type,
    created_at: now.toISOString(),
    source: spec.source,
    target: spec.target,
    project_id: spec.project_id,
    batch_id: spec.batch_id,
    task_id: spec.task_id,
    correlation_id: spec.correlation_id,
    payload: spec.payload ?? {},
  };
  const errors = validateEnvelope(envelope);
  if (errors.length > 0) {
    // 字段级明细同时进 message 与 details（C3 §4.2：调用方可直接检索失败字段，不必解析 details）
    const detail = errors.map((e) => `${e.field}: ${e.reason}`).join("; ");
    throw aieoError("REQ-0002", `SCHEMA_VALIDATION_FAILED: 消息信封校验失败（${errors.length} 项）: ${detail}`, {
      details: { field_errors: errors },
    });
  }
  return envelope;
}

/**
 * C1 §2.2 信封校验。返回字段级错误数组（[{field, reason}]），空数组 = 合法。
 * 未知顶层字段按兼容规则忽略（接收端行为），此处只校验已知字段。
 */
export function validateEnvelope(env) {
  const errors = [];
  const add = (field, reason) => errors.push({ field, reason });

  if (typeof env !== "object" || env === null) {
    add("$", "信封必须是对象");
    return errors;
  }
  // schema_version：格式 MAJOR.MINOR；主版本校验（C8 §9.3：主版本不匹配 → REQ-0003 由接收端判，
  // 发送端固定为 "1.0"，若被改动为其他主版本按构造期错误拒绝）
  if (typeof env.schema_version !== "string" || !RE_SCHEMA_VERSION.test(env.schema_version)) {
    add("schema_version", `格式必须为 MAJOR.MINOR，实际 "${env.schema_version}"`);
  } else if (!env.schema_version.startsWith("1.")) {
    add("schema_version", `不受支持的契约主版本 "${env.schema_version}"（REQ-0003）`);
  }
  // message_id
  if (typeof env.message_id !== "string" || !RE_MESSAGE_ID.test(env.message_id)) {
    add("message_id", `格式必须为 MSG-YYYYMMDD-NNNNNN，实际 "${env.message_id}"`);
  } else if (env.message_id.length > 64 || !RE_ID_CHARSET.test(env.message_id)) {
    add("message_id", "字符集 [A-Z0-9-] 且 ≤64 字符");
  }
  // message_type
  if (!MESSAGE_TYPES.includes(env.message_type)) {
    add("message_type", `必须是 03-协议 §3 的 16 种类型之一，实际 "${env.message_type}"`);
  }
  // created_at
  if (!isoWithTimezone(env.created_at)) {
    add("created_at", "必须为 ISO 8601 带时区时间戳");
  }
  // source / target
  for (const side of ["source", "target"]) {
    const o = env[side];
    if (!o || typeof o !== "object") { add(side, "必须为 {agent_id, agent_type} 对象"); continue; }
    if (typeof o.agent_id !== "string" || !RE_AGENT_ID.test(o.agent_id)) add(`${side}.agent_id`, `格式 [A-Z0-9-]{1,32}，实际 "${o.agent_id}"`);
    if (!AGENT_TYPES.includes(o.agent_type)) add(`${side}.agent_type`, `枚举 system/developer/reviewer/tester/auditor/user，实际 "${o.agent_type}"`);
  }
  // project_id
  if (typeof env.project_id !== "string" || !RE_PROJECT_ID.test(env.project_id)) {
    add("project_id", `大写 slug [A-Z0-9-]{1,32}，实际 "${env.project_id}"`);
  }
  // batch_id / task_id 条件必填（任务级消息必填）
  if (TASK_LEVEL_TYPES.has(env.message_type)) {
    if (typeof env.batch_id !== "string" || !RE_BATCH_ID.test(env.batch_id)) {
      add("batch_id", `任务级消息必填，格式 BATCH-<3位以上序号>，实际 "${env.batch_id}"`);
    }
    if (typeof env.task_id !== "string" || !RE_TASK_ID.test(env.task_id)) {
      add("task_id", `任务级消息必填，格式 T-(P\\d+-)?\\d{3,}，实际 "${env.task_id}"`);
    }
  } else if (env.task_id !== undefined && env.task_id !== null && typeof env.task_id === "string" && !RE_TASK_ID.test(env.task_id)) {
    add("task_id", `格式 T-(P\\d+-)?\\d{3,}，实际 "${env.task_id}"`);
  }
  // correlation_id
  if (typeof env.correlation_id !== "string" || env.correlation_id.length > 64 || !RE_CORRELATION.test(env.correlation_id)) {
    add("correlation_id", "必须为 CORR-<序号> 或 UUIDv4，≤64 字符");
  }
  // payload
  if (typeof env.payload !== "object" || env.payload === null || Array.isArray(env.payload)) {
    add("payload", "必须为对象（可为 {}）");
  } else if (env.payload.schema_version !== undefined) {
    add("payload", "payload 内不得重复携带 schema_version（以信封为准，C1 §2.2-5）");
  }
  return errors;
}
