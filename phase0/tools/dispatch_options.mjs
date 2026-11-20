// GPT 派单参数与 M1 登记绑定的纯函数解析。
// 三 ID 要么全部缺省（通用非登记派单），要么与 --schema 同时完整提供。

import { readFileSync } from "node:fs";

export const DISPATCH_ID_RULES = Object.freeze({
  task_id: /^T-(P[0-9]+-)?[0-9]{3,}$/,
  execution_id: /^EXEC-[0-9]{3,}$/,
  correlation_id: /^(CORR-[0-9]{3,}|[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/,
});

function optionError(code, message, details = undefined) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  error.exitCode = 2;
  if (details !== undefined) error.details = details;
  return error;
}

function optionalArg(argv, flag) {
  const indices = argv.flatMap((value, index) => value === flag ? [index] : []);
  if (indices.length === 0) return null;
  if (indices.length > 1) throw optionError("DISPATCH_OPTION_DUPLICATE", `${flag} 不得重复提供`);
  const value = argv[indices[0] + 1];
  if (!value || value.startsWith("--")) {
    throw optionError("DISPATCH_OPTION_VALUE_MISSING", `${flag} 缺少值`, { flag });
  }
  return value;
}

/**
 * 是否应写 reviewer 指针（DEC-094 #4）。默认写（保持审查会话迁移语义）；
 * 显式 --no-update-pointer 时跳过。中心化以便纯函数回归。
 */
export function shouldUpdateReviewerPointer(options) {
  return options?.noUpdatePointer !== true && !options?.sessionResult;
}

/**
 * 归属校验（DEC-094 规划复审要求：确认目标页确属本次会话，校验失败 fail-closed）。
 * 新会话派单：捕获到的 sessionId 不得与 attach 时已存在的会话 UUID 相同——相同意味着
 * 复用/误捕获了既有页（wrong-session 事故形态），必须拒写 reviewer 指针。
 * 既有会话派单：捕获到的 sessionId 必须等于目标会话 UUID，否则为错页。
 */
const SESSION_ID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

export function sessionIdIsAttributable({ newSession, sessionId, targetSessionId, preexistingSessionIds = [] }) {
  if (typeof sessionId !== "string" || !SESSION_ID.test(sessionId)) return false;
  const pre = new Set(preexistingSessionIds.filter(Boolean).map((x) => String(x).toLowerCase()));
  if (newSession) {
    return !pre.has(sessionId.toLowerCase());
  }
  return typeof targetSessionId === "string" && targetSessionId.toLowerCase() === sessionId.toLowerCase();
}

function chatGptUrl(value) {
  try {
    const url = new URL(value);
    return url.origin === "https://chatgpt.com" && !url.username && !url.password ? url : null;
  } catch {
    return null;
  }
}

export function extractSessionId(value) {
  const id = chatGptUrl(value)?.pathname.match(/^\/(?:g\/[^/]+\/)?c\/([^/]+)\/?$/)?.[1];
  return id && SESSION_ID.test(id) ? id.toLowerCase() : null;
}

export function assertDispatchTarget({ url, newSession, targetSessionId, hasMessages }) {
  const page = chatGptUrl(url);
  const allowed = newSession
    ? page?.pathname === "/" && hasMessages === false
    : sessionIdIsAttributable({ newSession, sessionId: extractSessionId(url), targetSessionId });
  if (!allowed) throw new Error("SESSION_TARGET_MISMATCH: 页面与派单目标不符，发送前停止");
}

export async function assertDispatchPage(page, { newSession, targetSessionId }) {
  const hasMessages = newSession ? (await page.locator("[data-content-search-unit-key]").count()) > 0 : undefined;
  assertDispatchTarget({ url: page.url(), newSession, targetSessionId, hasMessages });
}

export async function submitDispatchMessage(page, target, beforeEnter) {
  await assertDispatchPage(page, target);
  beforeEnter();
  await page.keyboard.press("Enter");
}

/**
 * 从简报首行提取 [TAG|...] 标记，供 #3 键漂移时唯一定位起点 user unit。
 * 无标记返回 null（回退既有固定 key 路径，负例强度不降）。
 */
export function extractBriefMarker(text) {
  const first = String(text || "").split(/\r?\n/, 1)[0] || "";
  const m = first.match(/^\[([^\]]{3,80})\]/);
  return m ? `[${m[1]}]` : null;
}

export function parseDispatchOptions(argv, { readMessageFile = (path) => readFileSync(path, "utf8") } = {}) {
  if (!Array.isArray(argv)) throw new TypeError("argv 必须是数组");
  const newSession = argv.includes("--new-session");
  const sessionResult = optionalArg(argv, "--session-result");
  if (newSession && sessionResult !== null) {
    throw optionError("DISPATCH_SESSION_AMBIGUOUS", "--new-session 与 --session-result 只能提供一项");
  }
  const registerM1Flag = argv.includes("--register-m1");
  // DEC-094 #4：任务腿/一次性 --new-session 派单不得覆盖 reviewer 指针（实战两次
  // 误覆盖→简报错发实战会话）。默认仍更新（保持审查会话迁移既有语义）；显式
  // --no-update-pointer 才跳过写盘，纯增量、零默认行为变化。
  const noUpdatePointer = argv.includes("--no-update-pointer");
  const messageValue = optionalArg(argv, "--message");
  const messageFile = optionalArg(argv, "--message-file");
  if (messageValue !== null && messageFile !== null) {
    throw optionError("DISPATCH_MESSAGE_AMBIGUOUS", "--message 与 --message-file 只能提供一项");
  }
  const requestText = messageFile !== null ? readMessageFile(messageFile) : messageValue;
  const message = messageFile !== null ? requestText.trim() : requestText;
  if (!message) {
    throw optionError(
      "DISPATCH_MESSAGE_REQUIRED",
      "用法: node gpt_dispatch.mjs [--new-session] (--message-file <txt> | --message <文本>) [--task-id <id> --execution-id <id> --correlation-id <id> --schema <path> | --schema <path>]",
    );
  }

  const ids = {
    task_id: optionalArg(argv, "--task-id"),
    execution_id: optionalArg(argv, "--execution-id"),
    correlation_id: optionalArg(argv, "--correlation-id"),
  };
  const schemaPath = optionalArg(argv, "--schema");
  for (const [field, value] of Object.entries(ids)) {
    if (value !== null && !DISPATCH_ID_RULES[field].test(value)) {
      throw optionError("DISPATCH_ID_INVALID", `${field} 格式不合法: ${value}`, { field });
    }
  }

  const providedIds = Object.entries(ids).filter(([, value]) => value !== null).map(([field]) => field);
  const m1RegistrationRequested = registerM1Flag || providedIds.length > 0;
  if (m1RegistrationRequested) {
    const missing = Object.entries(ids).filter(([, value]) => value === null).map(([field]) => field);
    if (missing.length > 0 || schemaPath === null) {
      throw optionError(
        "DISPATCH_M1_BINDING_INCOMPLETE",
        "请求 M1 登记或提供任一 task_id/execution_id/correlation_id 时，三 ID 与 --schema 必须全部提供；缺少任一项均在派单前失败",
        { missing_ids: missing, schema_provided: schemaPath !== null },
      );
    }
  }

  return {
    message,
    requestText,
    newSession,
    sessionResult,
    noUpdatePointer,
    ids,
    schemaPath,
    m1RegistrationRequested,
    m1RegistrationStatus: m1RegistrationRequested ? "REQUESTED" : "NOT_REQUESTED",
  };
}
