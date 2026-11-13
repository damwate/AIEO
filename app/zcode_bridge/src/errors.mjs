// AIEO Phase 1 M3 ZCode Bridge — C3 统一错误码（platform-contract-v1.0 §4）
//
// M3 对外（MCP 工具结果、日志 error_code 字段）只使用本表编号；跨模块错误转换在
// 本模块边界完成，禁止向调用方透出堆栈或内部异常类型（§4.2）。

/** C3 §4.3 编号表（27 条全量采纳；此处登记 M3 可能产生/透传的编号及其 HTTP 映射）。 */
export const C3_ERRORS = {
  "SYS-0001": { name: "INTERNAL_ERROR", http: 500, retryable: false },
  "SYS-0002": { name: "SERVICE_UNAVAILABLE", http: 503, retryable: true },
  "SYS-0003": { name: "OPERATION_TIMEOUT", http: 504, retryable: false },
  "REQ-0001": { name: "INVALID_ARGUMENT", http: 400, retryable: false },
  "REQ-0002": { name: "SCHEMA_VALIDATION_FAILED", http: 422, retryable: false },
  "REQ-0003": { name: "UNSUPPORTED_VERSION", http: 400, retryable: false },
  "AUTH-0001": { name: "UNAUTHENTICATED", http: 401, retryable: false },
  "AUTH-0002": { name: "FORBIDDEN", http: 403, retryable: false },
  "AUTH-0003": { name: "SESSION_EXPIRED", http: 401, retryable: false },
  "RES-0001": { name: "RESOURCE_NOT_FOUND", http: 404, retryable: false },
  "RES-0002": { name: "RESOURCE_CONFLICT", http: 409, retryable: false },
  "RES-0003": { name: "DUPLICATE_MESSAGE", http: 409, retryable: false },
  "TASK-0001": { name: "INVALID_STATE_TRANSITION", http: 409, retryable: false },
  "TASK-0002": { name: "DEPENDENCY_NOT_READY", http: 409, retryable: false },
  "TASK-0003": { name: "TASK_ALREADY_CLAIMED", http: 409, retryable: false },
  "MSG-0001": { name: "MESSAGE_DELIVERY_FAILED", http: 502, retryable: true },
  "MSG-0002": { name: "ACK_TIMEOUT", http: 409, retryable: true },
  "PROVIDER-0001": { name: "PROVIDER_TIMEOUT", http: 504, retryable: false },
  "PROVIDER-0002": { name: "PROVIDER_UNAVAILABLE", http: 503, retryable: true },
  "PROVIDER-0003": { name: "PROVIDER_AUTH_FAILED", http: 502, retryable: false },
  "PROVIDER-0004": { name: "PROVIDER_CONTRACT_CHANGED", http: 502, retryable: false },
  "PROVIDER-0005": { name: "PROVIDER_RATE_LIMITED", http: 429, retryable: true },
  "GIT-0001": { name: "GIT_WORKTREE_DIRTY", http: 409, retryable: false },
  "GIT-0002": { name: "GIT_BASE_MISMATCH", http: 409, retryable: false },
  "GIT-0003": { name: "GIT_SCOPE_VIOLATION", http: 422, retryable: false },
  "ART-0001": { name: "ARTIFACT_NOT_FOUND", http: 404, retryable: false },
  "ART-0002": { name: "ARTIFACT_HASH_MISMATCH", http: 422, retryable: false },
};

/**
 * 构造携带 C3 编号的 Error。
 * @param {keyof typeof C3_ERRORS} code
 * @param {string} message 人类可读摘要（不含堆栈与敏感信息）
 * @param {{details?: object, retryable?: boolean, correlation_id?: string|null}} [opts]
 */
export function aieoError(code, message, opts = {}) {
  const meta = C3_ERRORS[code];
  if (!meta) throw new Error(`SYS-0001: 未登记的 C3 错误码 "${code}"（禁止向客户端返回未编号错误）`);
  const err = new Error(message);
  err.c3 = {
    code,
    name: meta.name,
    http_status: meta.http,
    retryable: opts.retryable ?? meta.retryable,
    details: opts.details ?? undefined,
    correlation_id: opts.correlation_id ?? undefined,
  };
  return err;
}

/** 判定错误是否为 C3 结构化错误（区别于编程 bug）。 */
export function isAieoError(err) {
  return Boolean(err && err.c3 && C3_ERRORS[err.c3.code]);
}

/**
 * 从任意错误提取 {code, message, retryable, details, correlation_id}；
 * 非 C3 错误一律折算为 SYS-0001（INTERNAL_ERROR），不透出堆栈（§4.2）。
 */
export function toC3Payload(err, correlationId = null) {
  if (isAieoError(err)) {
    return {
      code: err.c3.code,
      message: err.message,
      details: err.c3.details ?? null,
      retryable: err.c3.retryable,
      correlation_id: err.c3.correlation_id ?? correlationId,
    };
  }
  return {
    code: "SYS-0001",
    message: "INTERNAL_ERROR: 内部错误（细节已记录日志，不向调用方透出）",
    details: null,
    retryable: false,
    correlation_id: correlationId,
  };
}

/** HTTP 状态 → C3 码的保守映射（M1Client 透传 M1 错误时用）。 */
export function httpStatusToC3(status, fallback = "SYS-0001") {
  const table = {
    400: "REQ-0001", 401: "AUTH-0001", 403: "AUTH-0002", 404: "RES-0001",
    409: "RES-0002", 422: "REQ-0002", 429: "PROVIDER-0005",
    500: "SYS-0001", 502: "MSG-0001", 503: "SYS-0002", 504: "SYS-0003",
  };
  return table[status] ?? fallback;
}
