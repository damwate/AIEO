import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { controllerError } from "./errors.mjs";
import { normalizeAgentId, normalizeSessionUrl } from "./validation.mjs";

const FORMAT_VERSION = "1.0";
const SESSION_STATUSES = new Set(["ACTIVE", "SUSPENDED", "OFFLINE", "EXPIRED"]);

function emptyStore() {
  return { format_version: FORMAT_VERSION, adapter: "M2_RUNTIME_SESSION_REFERENCES", sessions: [] };
}

function readJson(path) {
  if (!existsSync(path)) return emptyStore();
  let value;
  try {
    value = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw controllerError("SESSION_STORE_READ_FAILED", "runtime 会话配置损坏或不可读；拒绝按空配置继续");
  }
  if (value?.format_version !== FORMAT_VERSION || value?.adapter !== "M2_RUNTIME_SESSION_REFERENCES" || !Array.isArray(value.sessions)) {
    throw controllerError("SESSION_STORE_INVALID", "runtime 会话配置结构不符合 v1.0");
  }
  const ids = new Set();
  for (const session of value.sessions) {
    if (typeof session?.session_id !== "string" || ids.has(session.session_id) ||
        !SESSION_STATUSES.has(session?.status) || typeof session?.agent_id !== "string") {
      throw controllerError("SESSION_STORE_INVALID", "runtime 会话记录缺少有效身份、状态或存在重复 session_id");
    }
    normalizeAgentId(session.agent_id);
    if (session.session_url !== null) normalizeSessionUrl(session.session_url, { nullable: false });
    ids.add(session.session_id);
  }
  return value;
}

function writeJsonAtomic(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.${Date.now()}.tmp`;
  try {
    writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    const readback = JSON.parse(readFileSync(temp, "utf8"));
    if (JSON.stringify(readback) !== JSON.stringify(value)) throw new Error("readback mismatch");
    renameSync(temp, path);
    const committed = JSON.parse(readFileSync(path, "utf8"));
    if (JSON.stringify(committed) !== JSON.stringify(value)) throw new Error("committed readback mismatch");
  } catch {
    rmSync(temp, { force: true });
    throw controllerError("SESSION_STORE_WRITE_FAILED", "runtime 会话配置原子写入或回读失败");
  }
}

function copy(value) {
  return structuredClone(value);
}

export class SessionStore {
  constructor({ filePath, clock = () => new Date(), idFactory = randomUUID } = {}) {
    if (!filePath) throw controllerError("SESSION_STORE_PATH_REQUIRED", "必须提供 runtime 会话配置路径");
    this.filePath = resolve(filePath);
    this.clock = clock;
    this.idFactory = idFactory;
  }

  list() {
    return copy(readJson(this.filePath).sessions);
  }

  get(sessionId) {
    const session = readJson(this.filePath).sessions.find((item) => item.session_id === sessionId);
    if (!session) throw controllerError("SESSION_NOT_FOUND", "session_id 未登记", { details: { session_id: sessionId } });
    return copy(session);
  }

  create({ agent_id, session_url = null }) {
    const store = readJson(this.filePath);
    const agentId = normalizeAgentId(agent_id);
    const normalizedUrl = session_url === null ? null : normalizeSessionUrl(session_url, { nullable: false }).url;
    if (store.sessions.some((item) => item.agent_id === agentId && item.status === "ACTIVE")) {
      throw controllerError("SESSION_ACTIVE_EXISTS", "同一 agent_id 已有 ACTIVE 会话；必须复用或显式轮换，禁止隐式新开");
    }
    const now = this.clock().toISOString();
    const session = {
      session_id: this.idFactory(),
      agent_id: agentId,
      session_url: normalizedUrl,
      status: "ACTIVE",
      created_at: now,
      updated_at: now,
      last_seen_at: now,
      stop_reason: null,
      rotation_required: false,
      rotated_to_session_id: null,
      rotated_from_session_id: null,
      in_flight_dispatch_id: null,
      handoff: null,
    };
    store.sessions.push(session);
    writeJsonAtomic(this.filePath, store);
    return copy(session);
  }

  update(sessionId, patch) {
    const store = readJson(this.filePath);
    const index = store.sessions.findIndex((item) => item.session_id === sessionId);
    if (index < 0) throw controllerError("SESSION_NOT_FOUND", "session_id 未登记");
    const allowed = [
      "session_url", "status", "last_seen_at", "stop_reason", "rotation_required",
      "rotated_to_session_id", "in_flight_dispatch_id", "handoff",
    ];
    for (const key of Object.keys(patch)) {
      if (!allowed.includes(key)) throw controllerError("SESSION_STORE_FIELD_FORBIDDEN", `不允许写入运行时字段 ${key}`);
    }
    if (patch.status !== undefined && !SESSION_STATUSES.has(patch.status)) {
      throw controllerError("SESSION_STATE_INVALID", "会话状态不属于 ACTIVE/SUSPENDED/OFFLINE/EXPIRED");
    }
    if (patch.session_url !== undefined && patch.session_url !== null) {
      patch = { ...patch, session_url: normalizeSessionUrl(patch.session_url, { nullable: false }).url };
    }
    store.sessions[index] = { ...store.sessions[index], ...copy(patch), updated_at: this.clock().toISOString() };
    writeJsonAtomic(this.filePath, store);
    return copy(store.sessions[index]);
  }

  beginDispatch(sessionId, dispatchId) {
    const session = this.get(sessionId);
    if (session.status !== "ACTIVE" || session.rotation_required) {
      throw controllerError("SESSION_NOT_DISPATCHABLE", "会话已停止或需轮换；禁止在旧会话重试", {
        details: { session_id: sessionId, status: session.status, stop_reason: session.stop_reason },
      });
    }
    if (session.in_flight_dispatch_id !== null) {
      throw controllerError("SESSION_TASK_IN_FLIGHT", "同一会话已有在途任务，禁止并发或重复派发", {
        details: { session_id: sessionId, in_flight_dispatch_id: session.in_flight_dispatch_id },
      });
    }
    return this.update(sessionId, { in_flight_dispatch_id: dispatchId });
  }

  captureUrl(sessionId, sessionUrl) {
    const session = this.get(sessionId);
    const normalized = normalizeSessionUrl(sessionUrl, { nullable: false }).url;
    if (session.session_url !== null && session.session_url !== normalized) {
      throw controllerError("SESSION_URL_CHANGED", "实际会话 URL 与登记引用不一致；拒绝静默切换会话");
    }
    return this.update(sessionId, { session_url: normalized, last_seen_at: this.clock().toISOString() });
  }

  stop(sessionId, reason) {
    return this.update(sessionId, {
      status: "SUSPENDED",
      stop_reason: reason,
      rotation_required: true,
      last_seen_at: this.clock().toISOString(),
    });
  }

  completeDispatch(sessionId, dispatchId) {
    const session = this.get(sessionId);
    if (session.in_flight_dispatch_id !== dispatchId) {
      throw controllerError("SESSION_DISPATCH_BINDING_MISMATCH", "完成登记与当前在途 dispatch_id 不一致");
    }
    return this.update(sessionId, { in_flight_dispatch_id: null, last_seen_at: this.clock().toISOString() });
  }

  rotate({ oldSessionId, reason, handoff }) {
    const store = readJson(this.filePath);
    const old = store.sessions.find((item) => item.session_id === oldSessionId);
    if (!old) throw controllerError("SESSION_NOT_FOUND", "旧 session_id 未登记");
    if (!old.rotation_required || old.status !== "SUSPENDED") {
      throw controllerError("SESSION_ROTATION_NOT_REQUESTED", "只有已安全停止并标记需轮换的旧会话才能轮换");
    }
    const now = this.clock().toISOString();
    const next = {
      session_id: this.idFactory(),
      agent_id: old.agent_id,
      session_url: null,
      status: "ACTIVE",
      created_at: now,
      updated_at: now,
      last_seen_at: now,
      stop_reason: null,
      rotation_required: false,
      rotated_to_session_id: null,
      rotated_from_session_id: oldSessionId,
      in_flight_dispatch_id: null,
      handoff: copy(handoff),
    };
    old.status = "EXPIRED";
    old.updated_at = now;
    old.rotated_to_session_id = next.session_id;
    old.rotation_required = false;
    old.stop_reason = reason;
    store.sessions.push(next);
    writeJsonAtomic(this.filePath, store);
    return copy(next);
  }
}

export function decideSessionRotation(session, { reason, handoff, oldRoundEvidence }) {
  if (!session || session.status !== "SUSPENDED" || !session.rotation_required) {
    return { decision: "BLOCKED", code: "SESSION_ROTATION_NOT_REQUESTED", old_session_retry: false, new_session_created: false };
  }
  if (!["CONTEXT_LIMIT_STOP", "NO_PROGRESS_TIMEOUT"].includes(reason) || session.stop_reason !== reason) {
    return { decision: "BLOCKED", code: "SESSION_ROTATION_REASON_MISMATCH", old_session_retry: false, new_session_created: false };
  }
  if (!handoff?.git_pointer || handoff.summary !== undefined || handoff.history !== undefined || handoff.messages !== undefined) {
    return { decision: "BLOCKED", code: "GIT_HANDOFF_REQUIRED_NO_SUMMARY", old_session_retry: false, new_session_created: false };
  }
  // 无反馈只是本地超时，不证明旧轮已结束。只有调用方提供结构化已终结证据才可新会话派单。
  if (oldRoundEvidence?.resolved !== true || !["NOT_SENT", "GENERATION_ENDED"].includes(oldRoundEvidence.state)) {
    return {
      decision: "BLOCKED",
      code: "ROTATION_OLD_ROUND_UNRESOLVED",
      old_session_retry: false,
      new_session_created: false,
      unblock_condition: "先以结构化会话/unit/生成状态证明旧轮未发送或已结束",
    };
  }
  return {
    decision: "ROTATE_TO_FRESH_BLANK_SESSION",
    transport: "PUBLIC_GITHUB_GIT_POINTER",
    inherit_summary: false,
    old_session_retry: false,
    new_session_created: false,
  };
}
