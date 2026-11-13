import { controllerError } from "./errors.mjs";

export const ID_RULES = Object.freeze({
  task_id: /^T-(P[0-9]+-)?[0-9]{3,}$/,
  execution_id: /^EXEC-[0-9]{3,}$/,
  correlation_id: /^(CORR-[0-9]{3,}|[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/,
});

export function normalizeIds(input = {}, { required = false } = {}) {
  const ids = {
    task_id: input.task_id ?? null,
    execution_id: input.execution_id ?? null,
    correlation_id: input.correlation_id ?? null,
  };
  const present = Object.entries(ids).filter(([, value]) => value !== null);
  if (required && present.length !== 3) {
    throw controllerError("DISPATCH_M1_BINDING_INCOMPLETE", "M1 登记要求 task_id、execution_id、correlation_id 全部提供", {
      details: { missing: Object.entries(ids).filter(([, value]) => value === null).map(([key]) => key) },
    });
  }
  if (present.length > 0 && present.length !== 3) {
    throw controllerError("DISPATCH_BINDING_INCOMPLETE", "task_id、execution_id、correlation_id 必须同时提供或同时省略", {
      details: { provided: present.map(([key]) => key) },
    });
  }
  for (const [field, value] of Object.entries(ids)) {
    if (value !== null && (typeof value !== "string" || !ID_RULES[field].test(value))) {
      throw controllerError("DISPATCH_ID_INVALID", `${field} 格式不合法`, { details: { field } });
    }
  }
  return ids;
}

export function normalizeAgentId(agentId) {
  if (typeof agentId !== "string" || !/^[A-Z0-9-]{1,32}$/.test(agentId)) {
    throw controllerError("INVALID_AGENT_ID", "agent_id 必须是大写 slug，长度 1-32");
  }
  return agentId;
}

export function normalizeSessionUrl(value, { nullable = true } = {}) {
  if ((value === null || value === undefined) && nullable) return null;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw controllerError("SESSION_URL_INVALID", "会话 URL 无法解析");
  }
  const match = parsed.pathname.match(/(?:^|\/)c\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})(?:\/)?$/i);
  if (parsed.protocol !== "https:" || parsed.hostname !== "chatgpt.com" || parsed.username || parsed.password ||
      parsed.search || parsed.hash || !match) {
    throw controllerError("SESSION_URL_INVALID", "只允许无凭据、query、fragment 的 chatgpt.com /c/<uuid> 会话 URL");
  }
  return { url: `https://chatgpt.com/c/${match[1].toLowerCase()}`, uuid: match[1].toLowerCase() };
}

export function requireObject(value, code, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw controllerError(code, message);
  return value;
}
