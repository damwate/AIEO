// DV1 语义校验器：JSON Schema 子集（结构/类型/必填/枚举/闭合字段）+ 跨字段与 RECOVER 复制语义。
// 只读；输入=契约 schema + 事件上下文 + 待测事件；输出={valid, errors}。不接入 M1，不执行任何写操作。
import { readFileSync } from "node:fs";

const SCHEMA_PATH = new URL("./event-contract.schema.json", import.meta.url);
const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf8"));

const typeOk = (v, t) => {
  if (t === "number") return typeof v === "number" && Number.isFinite(v);
  if (t === "integer") return Number.isInteger(v);
  if (t === "string") return typeof v === "string";
  return false;
};

export function checkSchemaSelfConsistency() {
  const errors = [];
  const types = schema["x-event-types"] || [];
  const reqMap = schema["x-required-by-event-type"] || {};
  const fieldTypes = schema["x-field-types"] || {};
  const props = schema.properties || {};
  for (const t of types) {
    if (!reqMap[t]) errors.push(`x-required-by-event-type 缺 ${t}`);
  }
  for (const [field, t] of Object.entries(fieldTypes)) {
    if (!props[field]) errors.push(`properties 缺字段 ${field}`);
    else if (props[field].type !== t) errors.push(`字段 ${field} 类型不一致`);
  }
  for (const rule of schema.allOf || []) {
    const t = rule?.if?.properties?.event_type?.const;
    const want = reqMap[t];
    const got = rule?.then?.required;
    if (!want || !got || want.join("|") !== got.join("|")) {
      errors.push(`allOf if/then 与 x-required 不一致: ${t}`);
    }
  }
  const enumVals = props.event_type?.enum;
  if (!enumVals) errors.push("标准 event_type enum 缺失（未知类型不会被标准 Schema 拒绝）");
  else if (enumVals.join("|") !== types.join("|")) errors.push("event_type enum 与 x-event-types 不一致");
  const reasonVals = props["n/a_reason"]?.additionalProperties?.enum;
  if (!reasonVals) errors.push("标准 n/a_reason 值 enum 缺失（未知原因不会被标准 Schema 拒绝）");
  else if (reasonVals.join("|") !== (schema["x-reason-enum"] || []).join("|")) {
    errors.push("n/a_reason 值枚举与 x-reason-enum 不一致");
  }
  return { consistent: errors.length === 0, errors };
}

function validateStructure(event, errors) {
  const known = new Set([...Object.keys(schema.properties || {})]);
  for (const k of Object.keys(event || {})) {
    if (!known.has(k)) errors.push(`未登记字段: ${k}`);
  }
  for (const [k, t] of Object.entries(schema["x-field-types"] || {})) {
    if (Object.hasOwn(event, k) && !typeOk(event[k], t)) errors.push(`字段类型错误: ${k}`);
  }
  const et = event?.event_type;
  if (!(schema["x-event-types"] || []).includes(et)) errors.push(`未定义 event_type: ${et}`);
  for (const f of schema.required || []) {
    if (!Object.hasOwn(event, f)) errors.push(`缺基线必填: ${f}`);
  }
  for (const f of (schema["x-required-by-event-type"] || {})[et] || []) {
    if (!Object.hasOwn(event, f)) errors.push(`缺类型必填: ${et}.${f}`);
  }
  for (const f of ["fault_scope", "injection_point"]) {
    if (Object.hasOwn(event, f)) {
      const allowed = schema.properties[f]?.enum || [];
      if (!allowed.includes(event[f])) errors.push(`枚举越界: ${f}=${event[f]}`);
    }
  }
  if (et === "FAULT_INJECT") {
    if (event.fault_scope === "TASK") {
      for (const f of ["task_id", "request_id", "trace_id"]) {
        if (!Object.hasOwn(event, f) || event[f] === "N/A") errors.push(`FAULT_INJECT TASK 须真实 ${f}`);
      }
      if (["DB_BEFORE_COMMIT", "DB_AFTER_COMMIT"].includes(event.injection_point) && !Object.hasOwn(event, "db_transaction_id")) {
        errors.push("FAULT_INJECT DB 注入点须 db_transaction_id");
      }
      if (["ACK_SEND", "ACK_CONFIRM"].includes(event.injection_point) && !Object.hasOwn(event, "ack_id")) {
        errors.push("FAULT_INJECT ACK 注入点须 ack_id");
      }
    } else if (event.fault_scope === "GLOBAL") {
      for (const f of ["task_id", "request_id"]) {
        if (event[f] !== "N/A") errors.push(`FAULT_INJECT GLOBAL 须 ${f}=N/A`);
        if (event["n/a_reason"]?.[f] !== "GLOBAL_SCOPE") errors.push(`FAULT_INJECT GLOBAL 须 ${f} 原因 GLOBAL_SCOPE`);
      }
    }
  }
  const reasons = event?.["n/a_reason"];
  if (Object.hasOwn(event, "n/a_reason")) {
    if (!reasons || typeof reasons !== "object" || Array.isArray(reasons)) {
      errors.push("n/a_reason 必须为对象");
    } else {
      const allowedKeys = new Set(schema.properties["n/a_reason"]?.propertyNames?.enum || []);
      const allowedVals = new Set(schema["x-reason-enum"] || []);
      for (const [k, v] of Object.entries(reasons)) {
        if (!allowedKeys.has(k)) errors.push(`原因映射未知字段键: ${k}`);
        if (!allowedVals.has(v)) errors.push(`未知原因代码: ${v}`);
      }
    }
  }
}

function validateReasonMapping(event, errors) {
  const reasons = event?.["n/a_reason"];
  const naFields = new Set(
    Object.entries(event || {})
      .filter(([k, v]) => k !== "n/a_reason" && v === "N/A")
      .map(([k]) => k),
  );
  const reasonKeys = new Set(reasons && typeof reasons === "object" ? Object.keys(reasons) : []);
  for (const f of naFields) if (!reasonKeys.has(f)) errors.push(`N/A 字段缺原因: ${f}`);
  for (const f of reasonKeys) if (!naFields.has(f)) errors.push(`非 N/A 字段附带原因: ${f}`);
}

function validateRecover(event, context, errors) {
  if (event?.event_type !== "RECOVER") return;
  const id = event.recover_target_event_id;
  const targets = (context || []).filter((e) => e?.event_id === id);
  if (targets.length === 0) return errors.push("RECOVER 目标不存在");
  if (targets.length > 1) return errors.push("RECOVER 目标重复");
  const target = targets[0];
  if (!(schema["x-recover-target-allowed-types"] || []).includes(target.event_type)) {
    errors.push(`RECOVER 目标类型非法: ${target.event_type}`);
  }
  const reasons = event["n/a_reason"] || {};
  const targetReasons = target["n/a_reason"] || {};
  for (const f of schema["x-recover-copy-fields"] || []) {
    if (!Object.hasOwn(target, f)) {
      if (event[f] !== "N/A") errors.push(`RECOVER 目标无字段 ${f}，须填 N/A`);
      if (reasons[f] !== "TARGET_EVENT_FIELD_NOT_APPLICABLE") {
        errors.push(`RECOVER 目标无字段 ${f}，原因须为 TARGET_EVENT_FIELD_NOT_APPLICABLE`);
      }
    } else if (target[f] === "N/A") {
      if (event[f] !== "N/A") errors.push(`RECOVER 目标字段 ${f}=N/A，须复制 N/A`);
      if (reasons[f] !== targetReasons[f]) errors.push(`RECOVER 目标字段 ${f}=N/A，须按字段继承原因`);
    } else if (event[f] !== target[f]) {
      errors.push(`RECOVER 目标字段 ${f} 须原值复制`);
    }
  }
}

export function validateEvent(event, context = []) {
  const errors = [];
  (context || []).forEach((ctxEvent, i) => {
    const ctxErrors = [];
    validateStructure(ctxEvent, ctxErrors);
    validateReasonMapping(ctxEvent, ctxErrors);
    ctxErrors.forEach((m) => errors.push(`context[${i}] ${ctxEvent?.event_id}: ${m}`));
  });
  validateStructure(event, errors);
  validateReasonMapping(event, errors);
  validateRecover(event, context, errors);
  return { valid: errors.length === 0, errors };
}

export function validateAll(events = []) {
  const errors = [];
  events.forEach((e, i) => {
    const r = validateEvent(e, events);
    r.errors.forEach((msg) => errors.push(`event[${i}] ${e?.event_id}: ${msg}`));
  });
  return { valid: errors.length === 0, errors };
}
