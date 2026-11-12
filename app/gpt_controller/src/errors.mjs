// M2 对外错误：保留可诊断内部 code，同时在模块边界映射到平台 C3 错误码。
// 顺序敏感：前面的规则优先命中。
const C3_BY_PREFIX = [
  [/^INBOUND_(?:JSON|SCHEMA|TASK_BINDING)/, "REQ-0002"],
  [/^GIT_POINTER_PERMISSION|^GIT_HANDOFF_PERMISSION/, "AUTH-0002"],
  [/^GIT_POINTER_|^GIT_HANDOFF_/, "GIT-0002"],
  [/^M1_ARTIFACT_HASH|^ARTIFACT_.*MISMATCH/, "ART-0002"],
  [/^M1_/, "SYS-0002"],
  [/^OUTBOUND_MESSAGE_TOO_LARGE/, "REQ-0001"],
  [/^DISPATCH_/, "REQ-0001"],
  [/^SESSION_LOCK/, "RES-0002"],
  [/^SESSION_/, "REQ-0001"],
  [/^GENERATION_TIMEOUT|^NO_PROGRESS/, "PROVIDER-0001"],
  [/^CONTEXT_LIMIT|^SESSION_EXPIRED|^SECURITY_VERIFICATION/, "PROVIDER-0003"],
  [/^DOM_|^INBOUND_|^COMPOSER_|^SEND_|^PRE_SEND/, "PROVIDER-0004"],
  [/^BROWSER_/, "PROVIDER-0002"],
  [/^INVALID_/, "REQ-0001"],
];

export class GptControllerError extends Error {
  constructor(code, message, {
    c3Code = null,
    details = null,
    retryable = false,
    cause = undefined,
  } = {}) {
    super(`${code}: ${message}`, cause === undefined ? undefined : { cause });
    this.name = "GptControllerError";
    this.code = code;
    this.c3_code = c3Code ?? C3_BY_PREFIX.find(([pattern]) => pattern.test(code))?.[1] ?? "SYS-0001";
    this.status = "BLOCKED";
    this.retryable = retryable === true;
    this.details = details;
  }

  toJSON() {
    return {
      code: this.c3_code,
      message: `${this.code}: ${this.message.replace(`${this.code}: `, "")}`,
      details: this.details ?? { internal_code: this.code },
      retryable: this.retryable,
      status: this.status,
      internal_code: this.code,
    };
  }
}

export function controllerError(code, message, options = {}) {
  return new GptControllerError(code, message, options);
}

export function asControllerError(error, fallbackCode = "GPT_CONTROLLER_OPERATION_FAILED") {
  if (error instanceof GptControllerError) return error;
  if (error?.code && typeof error.code === "string") {
    return new GptControllerError(error.code, error.message?.replace(`${error.code}: `, "") || "操作失败", {
      details: error.details ?? null,
      retryable: false,
    });
  }
  // 未知异常不向 API 客户端泄露堆栈或底层消息。
  return new GptControllerError(fallbackCode, "未分类控制器失败；已停止当前操作", {
    details: null,
    retryable: false,
  });
}
