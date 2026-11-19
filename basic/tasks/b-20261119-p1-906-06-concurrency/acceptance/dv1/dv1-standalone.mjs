// DV2b 自包含验证器：仅运行 `node dv1-standalone.mjs`，无需其他文件。
// DV1 语义校验器：JSON Schema 子集（结构/类型/必填/枚举/闭合字段）+ 跨字段与 RECOVER 复制语义。
// 只读；输入=契约 schema + 事件上下文 + 待测事件；输出={valid, errors}。不接入 M1，不执行任何写操作。

const schema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://aieo.local/schema/906-06-event-contract-dv1.json",
  "title": "906⑥ M1 平台级并发事件契约 DV1",
  "description": "R2-R6 事件契约的机器可校验版本；DV1 降档验证产物，不替代⑥实测。",
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "event_id": { "type": "string" },
    "task_id": { "type": "string" },
    "request_id": { "type": "string" },
    "instance_id": { "type": "string" },
    "idempotency_key": { "type": "string" },
    "trace_id": { "type": "string" },
    "event_type": { "type": "string", "enum": ["REST_REQ", "REST_RESP", "DB_TXN_BEGIN", "DB_TXN_COMMIT", "ACK_SEND", "ACK_CONFIRM", "FAULT_INJECT", "RECOVER"] },
    "monotonic_timestamp": { "type": "number" },
    "clock_domain": { "type": "string" },
    "db_transaction_id": { "type": "string" },
    "ack_id": { "type": "string" },
    "state_version": { "type": "integer" },
    "http_status": { "type": "integer" },
    "commit_result": { "type": "string" },
    "confirm_result": { "type": "string" },
    "recover_result": { "type": "string" },
    "fault_scope": { "type": "string", "enum": ["TASK", "GLOBAL"] },
    "injection_point": { "type": "string", "enum": ["DB_BEFORE_COMMIT", "DB_AFTER_COMMIT", "ACK_SEND", "ACK_CONFIRM", "INSTANCE_ABORT"] },
    "recover_target_event_id": { "type": "string" },
    "n/a_reason": {
      "type": "object",
      "additionalProperties": { "type": "string", "enum": ["GLOBAL_SCOPE", "TARGET_EVENT_FIELD_NOT_APPLICABLE"] },
      "propertyNames": { "enum": ["task_id", "request_id", "instance_id", "idempotency_key", "trace_id", "db_transaction_id", "ack_id", "state_version", "http_status", "commit_result", "confirm_result", "recover_result", "fault_scope", "injection_point", "recover_target_event_id"] }
    }
  },
  "required": ["event_id", "event_type", "monotonic_timestamp", "clock_domain"],
  "allOf": [
    { "if": { "properties": { "event_type": { "const": "REST_REQ" } }, "required": ["event_type"] }, "then": { "required": ["task_id", "request_id", "instance_id", "idempotency_key", "trace_id"] } },
    { "if": { "properties": { "event_type": { "const": "REST_RESP" } }, "required": ["event_type"] }, "then": { "required": ["task_id", "request_id", "instance_id", "trace_id", "http_status"] } },
    { "if": { "properties": { "event_type": { "const": "DB_TXN_BEGIN" } }, "required": ["event_type"] }, "then": { "required": ["task_id", "request_id", "instance_id", "trace_id", "db_transaction_id", "state_version", "idempotency_key"] } },
    { "if": { "properties": { "event_type": { "const": "DB_TXN_COMMIT" } }, "required": ["event_type"] }, "then": { "required": ["task_id", "request_id", "instance_id", "trace_id", "db_transaction_id", "state_version", "idempotency_key", "commit_result"] } },
    { "if": { "properties": { "event_type": { "const": "ACK_SEND" } }, "required": ["event_type"] }, "then": { "required": ["task_id", "request_id", "instance_id", "trace_id", "ack_id", "state_version", "db_transaction_id"] } },
    { "if": { "properties": { "event_type": { "const": "ACK_CONFIRM" } }, "required": ["event_type"] }, "then": { "required": ["task_id", "request_id", "instance_id", "trace_id", "ack_id", "state_version", "db_transaction_id", "confirm_result"] } },
    { "if": { "properties": { "event_type": { "const": "FAULT_INJECT" } }, "required": ["event_type"] }, "then": { "required": ["instance_id", "fault_scope", "injection_point", "trace_id"] } },
    { "if": { "properties": { "event_type": { "const": "RECOVER" } }, "required": ["event_type"] }, "then": { "required": ["instance_id", "recover_result", "recover_target_event_id", "trace_id"] } }
  ],
  "x-event-types": ["REST_REQ", "REST_RESP", "DB_TXN_BEGIN", "DB_TXN_COMMIT", "ACK_SEND", "ACK_CONFIRM", "FAULT_INJECT", "RECOVER"],
  "x-field-types": {
    "event_id": "string", "task_id": "string", "request_id": "string", "instance_id": "string",
    "idempotency_key": "string", "trace_id": "string", "event_type": "string",
    "monotonic_timestamp": "number", "clock_domain": "string", "db_transaction_id": "string",
    "ack_id": "string", "state_version": "integer", "http_status": "integer",
    "commit_result": "string", "confirm_result": "string", "recover_result": "string",
    "fault_scope": "string", "injection_point": "string", "recover_target_event_id": "string"
  },
  "x-required-by-event-type": {
    "REST_REQ": ["task_id", "request_id", "instance_id", "idempotency_key", "trace_id"],
    "REST_RESP": ["task_id", "request_id", "instance_id", "trace_id", "http_status"],
    "DB_TXN_BEGIN": ["task_id", "request_id", "instance_id", "trace_id", "db_transaction_id", "state_version", "idempotency_key"],
    "DB_TXN_COMMIT": ["task_id", "request_id", "instance_id", "trace_id", "db_transaction_id", "state_version", "idempotency_key", "commit_result"],
    "ACK_SEND": ["task_id", "request_id", "instance_id", "trace_id", "ack_id", "state_version", "db_transaction_id"],
    "ACK_CONFIRM": ["task_id", "request_id", "instance_id", "trace_id", "ack_id", "state_version", "db_transaction_id", "confirm_result"],
    "FAULT_INJECT": ["instance_id", "fault_scope", "injection_point", "trace_id"],
    "RECOVER": ["instance_id", "recover_result", "recover_target_event_id", "trace_id"]
  },
  "x-reason-enum": ["GLOBAL_SCOPE", "TARGET_EVENT_FIELD_NOT_APPLICABLE"],
  "x-recover-copy-fields": ["task_id", "request_id", "trace_id", "db_transaction_id", "ack_id"],
  "x-recover-target-allowed-types": ["REST_REQ", "REST_RESP", "DB_TXN_BEGIN", "DB_TXN_COMMIT", "ACK_SEND", "ACK_CONFIRM", "FAULT_INJECT"],
  "x-extension-fields": ["http_status", "commit_result", "confirm_result", "recover_result", "fault_scope", "injection_point", "recover_target_event_id", "n/a_reason"]
};

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

const embedCases = {
  "contract": "906-06-event-contract-dv1",
  "cases": [
    {"id":"P01","expect":"pass","event":{"event_id":"e1","event_type":"REST_REQ","monotonic_timestamp":100,"clock_domain":"host-A","task_id":"tA","request_id":"rA","instance_id":"A","idempotency_key":"iA","trace_id":"trA"}},
    {"id":"P02","expect":"pass","event":{"event_id":"e2","event_type":"REST_RESP","monotonic_timestamp":101,"clock_domain":"host-A","task_id":"tA","request_id":"rA","instance_id":"A","trace_id":"trA","http_status":200,"idempotency_key":"iA"}},
    {"id":"P03","expect":"pass","event":{"event_id":"e3","event_type":"DB_TXN_BEGIN","monotonic_timestamp":102,"clock_domain":"host-A","task_id":"tA","request_id":"rA","instance_id":"A","trace_id":"trA","db_transaction_id":"dbA","state_version":1,"idempotency_key":"iA"}},
    {"id":"P04","expect":"pass","event":{"event_id":"e4","event_type":"DB_TXN_COMMIT","monotonic_timestamp":103,"clock_domain":"host-A","task_id":"tA","request_id":"rA","instance_id":"A","trace_id":"trA","db_transaction_id":"dbA","state_version":2,"idempotency_key":"iA","commit_result":"OK"}},
    {"id":"P05","expect":"pass","event":{"event_id":"e5","event_type":"ACK_SEND","monotonic_timestamp":104,"clock_domain":"host-A","task_id":"tA","request_id":"rA","instance_id":"A","trace_id":"trA","ack_id":"ackA","state_version":3,"db_transaction_id":"dbA"}},
    {"id":"P06","expect":"pass","event":{"event_id":"e6","event_type":"ACK_CONFIRM","monotonic_timestamp":105,"clock_domain":"host-A","task_id":"tA","request_id":"rA","instance_id":"A","trace_id":"trA","ack_id":"ackA","state_version":4,"db_transaction_id":"dbA","confirm_result":"OK"}},
    {"id":"P07","expect":"pass","event":{"event_id":"e7","event_type":"FAULT_INJECT","monotonic_timestamp":106,"clock_domain":"host-A","instance_id":"A","trace_id":"trA","fault_scope":"TASK","injection_point":"ACK_SEND","task_id":"tA","request_id":"rA","ack_id":"ackA"}},
    {"id":"P08","expect":"pass","event":{"event_id":"e8","event_type":"FAULT_INJECT","monotonic_timestamp":107,"clock_domain":"host-A","instance_id":"ALL","trace_id":"trRoot","fault_scope":"GLOBAL","injection_point":"INSTANCE_ABORT","task_id":"N/A","request_id":"N/A","n/a_reason":{"task_id":"GLOBAL_SCOPE","request_id":"GLOBAL_SCOPE"}}},
    {"id":"P09","expect":"pass","context":[{"event_id":"e8","event_type":"FAULT_INJECT","monotonic_timestamp":107,"clock_domain":"host-A","instance_id":"ALL","trace_id":"trRoot","fault_scope":"GLOBAL","injection_point":"INSTANCE_ABORT","task_id":"N/A","request_id":"N/A","n/a_reason":{"task_id":"GLOBAL_SCOPE","request_id":"GLOBAL_SCOPE"}}],"event":{"event_id":"e9","event_type":"RECOVER","monotonic_timestamp":108,"clock_domain":"host-A","instance_id":"ALL","trace_id":"trRoot","recover_result":"OK","recover_target_event_id":"e8","task_id":"N/A","request_id":"N/A","db_transaction_id":"N/A","ack_id":"N/A","n/a_reason":{"task_id":"GLOBAL_SCOPE","request_id":"GLOBAL_SCOPE","db_transaction_id":"TARGET_EVENT_FIELD_NOT_APPLICABLE","ack_id":"TARGET_EVENT_FIELD_NOT_APPLICABLE"}}},
    {"id":"N01","expect":"reject","event":{"event_id":"n1","event_type":"REST_REQ","monotonic_timestamp":100,"clock_domain":"host-A","task_id":"tA","request_id":"rA","instance_id":"A","idempotency_key":"iA","trace_id":"trA","unregistered":"x"}},
    {"id":"N02","expect":"reject","event":{"event_id":"n2","event_type":"REST_REQ","monotonic_timestamp":100,"task_id":"tA","request_id":"rA","instance_id":"A","idempotency_key":"iA","trace_id":"trA"}},
    {"id":"N03","expect":"reject","event":{"event_id":"n3","event_type":"REST_REQ","monotonic_timestamp":100,"clock_domain":"host-A","task_id":"tA","request_id":"rA","instance_id":"A","trace_id":"trA"}},
    {"id":"N04","expect":"reject","event":{"event_id":"n4","event_type":"REST_REQ","monotonic_timestamp":"100","clock_domain":"host-A","task_id":"tA","request_id":"rA","instance_id":"A","idempotency_key":"iA","trace_id":"trA"}},
    {"id":"N05","expect":"reject","event":{"event_id":"n5","event_type":"FAULT_INJECT","monotonic_timestamp":107,"clock_domain":"host-A","instance_id":"ALL","trace_id":"trRoot","fault_scope":"GLOBAL","injection_point":"INSTANCE_ABORT","task_id":"N/A","request_id":"N/A"}},
    {"id":"N06","expect":"reject","event":{"event_id":"n6","event_type":"REST_REQ","monotonic_timestamp":100,"clock_domain":"host-A","task_id":"tA","request_id":"rA","instance_id":"A","idempotency_key":"iA","trace_id":"trA","n/a_reason":{"trace_id":"GLOBAL_SCOPE"}}},
    {"id":"N07","expect":"reject","event":{"event_id":"n7","event_type":"FAULT_INJECT","monotonic_timestamp":107,"clock_domain":"host-A","instance_id":"ALL","trace_id":"trRoot","fault_scope":"GLOBAL","injection_point":"INSTANCE_ABORT","task_id":"N/A","request_id":"N/A","n/a_reason":{"task_id":"UNKNOWN_CODE","request_id":"GLOBAL_SCOPE"}}},
    {"id":"N08","expect":"reject","event":{"event_id":"n8","event_type":"RECOVER","monotonic_timestamp":108,"clock_domain":"host-A","instance_id":"ALL","trace_id":"trRoot","recover_result":"OK","recover_target_event_id":"missing"}},
    {"id":"N09","expect":"reject","context":[{"event_id":"dup","event_type":"REST_REQ","monotonic_timestamp":100,"clock_domain":"host-A","task_id":"tA","request_id":"rA","instance_id":"A","idempotency_key":"iA","trace_id":"trA"},{"event_id":"dup","event_type":"REST_REQ","monotonic_timestamp":101,"clock_domain":"host-A","task_id":"tA","request_id":"rA","instance_id":"A","idempotency_key":"iA","trace_id":"trA"}],"event":{"event_id":"n9","event_type":"RECOVER","monotonic_timestamp":108,"clock_domain":"host-A","instance_id":"ALL","trace_id":"trRoot","recover_result":"OK","recover_target_event_id":"dup"}},
    {"id":"N10","expect":"reject","context":[{"event_id":"bad","event_type":"RECOVER","monotonic_timestamp":100,"clock_domain":"host-A","instance_id":"ALL","trace_id":"tr","recover_result":"OK","recover_target_event_id":"x"}],"event":{"event_id":"n10","event_type":"RECOVER","monotonic_timestamp":108,"clock_domain":"host-A","instance_id":"ALL","trace_id":"trRoot","recover_result":"OK","recover_target_event_id":"bad"}},
    {"id":"N11","expect":"reject","context":[{"event_id":"tA","event_type":"DB_TXN_BEGIN","monotonic_timestamp":100,"clock_domain":"host-A","task_id":"tA","request_id":"rA","instance_id":"A","trace_id":"trA","db_transaction_id":"dbA","state_version":1,"idempotency_key":"iA"}],"event":{"event_id":"n11","event_type":"RECOVER","monotonic_timestamp":108,"clock_domain":"host-A","instance_id":"A","trace_id":"trA","recover_result":"OK","recover_target_event_id":"tA","task_id":"WRONG","request_id":"rA","trace_id":"trA","db_transaction_id":"dbA","ack_id":"N/A","n/a_reason":{"ack_id":"TARGET_EVENT_FIELD_NOT_APPLICABLE"}}},
    {"id":"N12","expect":"reject","context":[{"event_id":"e8","event_type":"FAULT_INJECT","monotonic_timestamp":107,"clock_domain":"host-A","instance_id":"ALL","trace_id":"trRoot","fault_scope":"GLOBAL","injection_point":"INSTANCE_ABORT","task_id":"N/A","request_id":"N/A","n/a_reason":{"task_id":"GLOBAL_SCOPE","request_id":"GLOBAL_SCOPE"}}],"event":{"event_id":"n12","event_type":"RECOVER","monotonic_timestamp":108,"clock_domain":"host-A","instance_id":"ALL","trace_id":"trRoot","recover_result":"OK","recover_target_event_id":"e8","task_id":"N/A","request_id":"N/A","db_transaction_id":"N/A","ack_id":"N/A","n/a_reason":{"task_id":"GLOBAL_SCOPE","request_id":"GLOBAL_SCOPE","db_transaction_id":"GLOBAL_SCOPE","ack_id":"TARGET_EVENT_FIELD_NOT_APPLICABLE"}}},
    {"id":"N13","expect":"reject","event":{"event_id":"n13","event_type":"FAULT_INJECT","monotonic_timestamp":107,"clock_domain":"host-A","instance_id":"A","trace_id":"trA","fault_scope":"TASK","injection_point":"ACK_SEND","task_id":"tA","request_id":"rA"}},
    {"id":"N14","expect":"reject","event":{"event_id":"n14","event_type":"UNKNOWN_EVENT","monotonic_timestamp":100,"clock_domain":"host-A"}},
    {"id":"N15","expect":"reject","context":[{"event_id":"badTarget","event_type":"REST_REQ","monotonic_timestamp":100,"task_id":"tA","request_id":"rA","instance_id":"A","trace_id":"trA","db_transaction_id":"dbA"}],"event":{"event_id":"n15","event_type":"RECOVER","monotonic_timestamp":108,"clock_domain":"host-A","instance_id":"A","trace_id":"trA","recover_result":"OK","recover_target_event_id":"badTarget","task_id":"tA","request_id":"rA","trace_id":"trA","db_transaction_id":"dbA","ack_id":"N/A","n/a_reason":{"ack_id":"TARGET_EVENT_FIELD_NOT_APPLICABLE"}}}
  ]
};
const selfCheck = checkSchemaSelfConsistency();
const rows = embedCases.cases.map((c) => {
  const r = validateEvent(c.event, c.context || []);
  const want = c.expect === 'pass';
  return { id: c.id, event_type: c.event?.event_type, expect: c.expect, actual: r.valid ? 'pass' : 'reject', ok: want ? r.valid : !r.valid, errors: r.errors };
});
const all_ok = selfCheck.consistent && rows.every((r) => r.ok);
console.log(JSON.stringify({ artifact: 'dv1-standalone', contract: embedCases.contract, all_ok, schema_self_consistency: selfCheck, total: rows.length, matched: rows.filter((r) => r.ok).length, rows }, null, 2));
