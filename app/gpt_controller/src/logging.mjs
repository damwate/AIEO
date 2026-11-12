// M2 运行日志（platform-contract v1.0 §5 C4）。
// - NDJSON：一行一个 JSON 对象；禁止发明其他格式。
// - 字段：timestamp/level/service/module/event/message/env 必填；
//   task_id/execution_id/correlation_id/session_id/artifact_sha256/operation/result/
//   duration_ms/error_code/retryable/attempt 等可选字段按 C4 §5.1 清单透传。
// - 落盘 logs/phase1/<service>/（AIEO_LOG_DIR 可覆盖根目录），按日期轮转。
// - 脱敏：cookie/token/authorization/password/secret 类键一律拒绝写入（§5.4）。
// - 写入失败不得静默吞掉事件：运行日志降级到 stderr，标记 audit 的事件失败即抛错（§5.5）。

import { mkdirSync, appendFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { AIEO_ROOT } from "./config.mjs";
import { controllerError } from "./errors.mjs";

const LEVELS = new Set(["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]);
const FORBIDDEN_KEY_PATTERN = /cookie|token|authorization|password|passwd|secret|api[_-]?key|session[_-]?key/i;

// C4 §5.1 清单内的可选业务字段；白名单外字段必须进 details，不允许随意展平。
const OPTIONAL_FIELDS = Object.freeze([
  "task_id", "execution_id", "project_id", "batch_id", "message_id", "correlation_id", "trace_id",
  "agent_id", "agent_type", "session_id", "repository_id", "branch", "base_commit", "commit_sha",
  "artifact_id", "artifact_sha256", "operation", "result", "duration_ms", "error_code", "retryable",
  "attempt", "http_status", "process_id", "exit_code",
]);

export function resolveLogDir(env = process.env, overrides = {}) {
  const root = overrides.logDir ?? env.AIEO_LOG_DIR ?? join(AIEO_ROOT, "logs", "phase1");
  return resolve(root, "gpt_controller");
}

// 敏感字段检查必须递归：details 内嵌的 cookie/token 等同样禁止写入（C4 §5.4）。
function assertNoSensitiveField(record, basePath = "") {
  for (const [key, value] of Object.entries(record)) {
    const fieldPath = basePath ? `${basePath}.${key}` : key;
    if (FORBIDDEN_KEY_PATTERN.test(key)) {
      throw controllerError("LOG_SENSITIVE_FIELD_FORBIDDEN", `日志字段 ${fieldPath} 属于敏感字段，禁止写入`, { details: { field: fieldPath } });
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (item && typeof item === "object") assertNoSensitiveField(item, `${fieldPath}[${index}]`);
      });
    } else if (value && typeof value === "object") {
      assertNoSensitiveField(value, fieldPath);
    }
  }
}

function utcDateStamp(date) {
  return date.toISOString().slice(0, 10);
}

export function createLogger({
  env = process.env,
  logDir = null,
  service = "gpt_controller",
  moduleName = "M2",
  clock = () => new Date(),
  writeImpl = null,
} = {}) {
  const dir = logDir ? resolve(logDir) : resolveLogDir(env);
  const environment = env.AIEO_ENV ?? "development";
  let currentDate = null;
  let currentPath = null;

  function targetPath(now) {
    const stamp = utcDateStamp(now);
    if (currentPath === null || currentDate !== stamp) {
      mkdirSync(dir, { recursive: true });
      currentPath = join(dir, `${service}-${stamp}.ndjson`);
      currentDate = stamp;
    }
    return currentPath;
  }

  function write(line) {
    if (writeImpl) {
      writeImpl(currentPath ?? targetPath(clock()), line);
      return;
    }
    appendFileSync(targetPath(clock()), `${line}\n`, "utf8");
  }

  /**
   * 记录一条 NDJSON 运行日志。fields.event 与 fields.message 必填。
   * options.audit = true 时写入失败直接抛错（审计事件不得静默丢失）。
   */
  function log(fields, options = {}) {
    const {
      level = "INFO",
      event,
      message,
      details,
      ...rest
    } = fields ?? {};
    if (!event || typeof event !== "string") {
      throw controllerError("LOG_EVENT_REQUIRED", "日志必须提供稳定 event 名称");
    }
    if (typeof message !== "string") {
      throw controllerError("LOG_MESSAGE_REQUIRED", "日志必须提供人类可读 message 摘要");
    }
    if (!LEVELS.has(level)) {
      throw controllerError("LOG_LEVEL_INVALID", `日志级别 ${level} 不在 C4 枚举内`, { details: { level } });
    }
    const now = clock();
    const record = {
      timestamp: now.toISOString(),
      level,
      service,
      module: moduleName,
      event,
      message,
      env: environment,
    };
    for (const field of OPTIONAL_FIELDS) {
      if (rest[field] !== undefined && rest[field] !== null) record[field] = rest[field];
    }
    const extraKeys = Object.keys(rest).filter((key) => !OPTIONAL_FIELDS.includes(key) && key !== "details");
    const mergedDetails = { ...(details ?? {}) };
    for (const key of extraKeys) mergedDetails[key] = rest[key];
    if (Object.keys(mergedDetails).length > 0) record.details = mergedDetails;
    assertNoSensitiveField(record);
    const line = JSON.stringify(record);
    try {
      write(line);
    } catch (error) {
      if (options.audit === true) {
        throw controllerError("LOG_AUDIT_WRITE_FAILED", "审计事件写盘失败，不得静默丢失", { details: { event }, cause: error });
      }
      // 运行日志失败降级 stderr，不中断业务流程，但保证事件可见。
      process.stderr.write(`[logging-fallback] ${line}\n`);
    }
    return record;
  }

  return { log, logDir: dir };
}
