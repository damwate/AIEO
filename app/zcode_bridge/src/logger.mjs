// AIEO Phase 1 M3 ZCode Bridge — C4 NDJSON 日志（platform-contract-v1.0 §5）
//
// 硬规则：
// - 一行一个 JSON 对象（NDJSON），禁止模块自定义其他格式（§5.2-1）；
// - 字段集 = §5.1 字段表全量（27 行，含一行双字段的展开，共 34 个字段名），
//   必填 7 项永远输出：timestamp/level/service/module/event/message/env；
//   其余字段仅在调用方提供时输出，且不允许出现在表外字段（未知字段直接拒绝写入并降级告警）；
// - timestamp ISO 8601 UTC（§5.1-1：存储统一 UTC）；
// - 落盘 <logDir>/bridge-YYYY-MM-DD.ndjson 按日期轮转（§5.2-2/3），目录经 C6 配置，
//   禁止硬编码机器绝对路径；
// - 脱敏（§5.4）：Authorization/Cookie/password/token/api_key/secret 等键值一律丢弃，
//   message 不做自由文本审查，由调用方保证（工具入参整体不进 message）；
// - 写失败不抛出：返回 false 并向 stderr 报告（运行日志写失败不吞关键事件，§5.5）。

import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const SERVICE_NAME = "zcode_bridge";
export const MODULE_ID = "M3";

/** C4 §5.1 字段表全量字段名（27 行展开）。 */
export const C4_FIELDS = [
  "timestamp", "level", "service", "module", "event", "message",
  "task_id", "execution_id",
  "project_id", "batch_id",
  "message_id", "correlation_id", "trace_id",
  "agent_id", "agent_type", "session_id",
  "repository_id", "branch",
  "base_commit", "commit_sha",
  "artifact_id", "artifact_sha256",
  "operation", "result", "duration_ms", "error_code", "retryable", "attempt",
  "http_status", "process_id", "exit_code",
  "source_file", "source_line",
  "env",
];

/** 必填字段（§5.1 必填 + 建议必填由上下文注入，env 必填）。 */
export const C4_REQUIRED_FIELDS = ["timestamp", "level", "service", "module", "event", "message", "env"];

const LEVELS = new Set(["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]);
const RESULTS = new Set(["SUCCESS", "FAILURE", "RETRY", "BLOCKED", "SKIPPED"]);

const SENSITIVE_KEY_RE = /(authorization|cookie|password|passwd|secret|token|api_?key|credential|session_cookie)/i;

/** 递归脱敏：命中敏感键的字段整值丢弃，仅记录类型（§5.4：必要时仅记录凭证类型或摘要）。 */
export function redactValue(value) {
  if (Array.isArray(value)) return value.map((v) => redactValue(v));
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (SENSITIVE_KEY_RE.test(k)) {
        out[k] = `[REDACTED:${typeof v}]`;
      } else {
        out[k] = redactValue(v);
      }
    }
    return out;
  }
  return value;
}

function utcTimestamp() {
  return new Date().toISOString(); // ISO 8601 UTC（...Z）
}

/**
 * NDJSON 日志器。
 * @param {{logDir: string, env: string, correlationId?: string, traceId?: string,
 *          writer?: (line: string) => boolean, clock?: () => Date, retentionDays?: number}} opts
 */
export class NdjsonLogger {
  constructor(opts) {
    if (!opts?.logDir) throw new Error("SYS-0001: NdjsonLogger 需要 logDir（禁止硬编码绝对路径默认值逃逸 C6）");
    this.logDir = opts.logDir;
    this.env = opts.env ?? "development";
    this.defaultCorrelationId = opts.correlationId ?? null;
    this.defaultTraceId = opts.traceId ?? null;
    this.clock = opts.clock ?? (() => new Date());
    this.retentionDays = opts.retentionDays ?? 30;
    // 可注入 writer（测试用内存 sink）；默认真实追加写文件
    this.writer =
      opts.writer ??
      ((line) => {
        try {
          if (!existsSync(this.logDir)) mkdirSync(this.logDir, { recursive: true });
          const file = this.currentLogFile();
          if (!this._fh || this._fhFile !== file) {
            if (this._fh !== undefined) { try { closeSync(this._fh); } catch { /* 已关闭 */ } }
            this._fhFile = file;
            this._fh = openSync(file, "a");
          }
          writeFileSync(this._fh, line + "\n", "utf8");
          return true;
        } catch (err) {
          // 写失败不得静默：向 stderr 报告（§5.5），但不中断业务
          try { process.stderr.write(`[zcode_bridge][log-write-failure] ${err.message}\n`); } catch { /* stderr 不可用 */ }
          return false;
        }
      });
    this.writeFailures = 0;
  }

  /** 当日日志文件名：bridge-YYYY-MM-DD.ndjson（按日期轮转，UTC 日期）。 */
  currentLogFile(now = this.clock()) {
    return join(this.logDir, `bridge-${now.toISOString().slice(0, 10)}.ndjson`);
  }

  /**
   * 写一条日志。extra 只接受 C4 字段表内的字段；表外字段导致整条降级为
   * DEBUG 级 `log.field_rejected` 事件（原始事件不落盘、不伪造字段合规）。
   * @param {("DEBUG"|"INFO"|"WARNING"|"ERROR"|"CRITICAL")} level
   * @param {string} event 稳定机器可检索事件名（如 mcp.tool.call、cli.launch）
   * @param {string} message 人类可读摘要（不含敏感信息）
   * @param {object} [extra] 其余 C4 可选字段
   * @returns {boolean} 是否成功写出
   */
  log(level, event, message, extra = {}) {
    if (!LEVELS.has(level)) level = "INFO";
    const unknown = Object.keys(extra).filter((k) => !C4_FIELDS.includes(k));
    if (unknown.length > 0) {
      // 表外字段：fail-closed，不写入非法行，降级记录一条拒绝事件（字段名单进 message）
      return this._emit({
        level: "DEBUG",
        event: "log.field_rejected",
        message: `日志字段不在 C4 字段表内，原事件 "${event}" 拒绝写入（rejected=[${unknown.join(",")}])`,
        operation: "write_log",
        result: "SKIPPED",
      });
    }
    const record = this._build(level, event, message, extra);
    return this._write(record, event, extra);
  }

  _build(level, event, message, extra) {
    const rec = {
      timestamp: utcTimestamp(),
      level,
      service: SERVICE_NAME,
      module: MODULE_ID,
      event,
      message,
      env: this.env,
    };
    // 建议必填：correlation_id / trace_id（调用上下文默认值优先级低于显式传入）
    if (this.defaultCorrelationId && extra.correlation_id === undefined) rec.correlation_id = this.defaultCorrelationId;
    if (this.defaultTraceId && extra.trace_id === undefined) rec.trace_id = this.defaultTraceId;
    for (const k of C4_FIELDS) {
      if (rec[k] !== undefined) continue;
      const v = extra[k];
      if (v !== undefined) rec[k] = v;
    }
    return rec;
  }

  _write(record, origEvent, origExtra) {
    // 终检：必填字段齐全才允许落盘
    const missing = C4_REQUIRED_FIELDS.filter((f) => record[f] === undefined);
    if (missing.length > 0) {
      this.writeFailures += 1;
      try { process.stderr.write(`[zcode_bridge][log-missing-required] ${origEvent}: 缺 ${missing.join(",")}\n`); } catch { /* ignore */ }
      return false;
    }
    if (record.result !== undefined && !RESULTS.has(record.result)) {
      // result 枚举非法：原记录不落盘，降级写一条拒绝记录（与表外字段处理一致，保证可检索）
      this.writeFailures += 1;
      return this._emit({
        level: "DEBUG",
        event: "log.record_rejected",
        message: `result 枚举非法（"${record.result}"），原事件 "${origEvent}" 拒绝写入`,
        operation: "write_log",
        result: "SKIPPED",
      });
    }
    const ok = this.writer(JSON.stringify(record));
    if (!ok) this.writeFailures += 1;
    return ok;
  }

  _emit(obj) {
    const rec = this._build(obj.level ?? "DEBUG", obj.event ?? "log.unknown", obj.message ?? "", obj);
    return this._write(rec, rec.event, obj);
  }

  info(event, message, extra) { return this.log("INFO", event, message, extra); }
  warn(event, message, extra) { return this.log("WARNING", event, message, extra); }
  error(event, message, extra) { return this.log("ERROR", event, message, extra); }
  debug(event, message, extra) { return this.log("DEBUG", event, message, extra); }

  /** 尽力而为的保留期清理（C4 §5.2-3：普通运行日志保留 30 天，可经 AIEO_LOG_RETENTION_DAYS 调整）。 */
  sweepRetention(now = this.clock()) {
    let removed = 0;
    try {
      if (!existsSync(this.logDir)) return 0;
      const cutoff = now.getTime() - this.retentionDays * 86_400_000;
      for (const name of readdirSync(this.logDir)) {
        const m = /^bridge-\d{4}-\d{2}-\d{2}\.ndjson$/.exec(name);
        if (!m) continue;
        const full = join(this.logDir, name);
        if (statSync(full).mtimeMs < cutoff) {
          rmSync(full, { force: true });
          removed += 1;
        }
      }
    } catch { /* 清理失败不影响业务 */ }
    return removed;
  }

  close() {
    if (this._fh !== undefined) {
      try { closeSync(this._fh); } catch { /* ignore */ }
      this._fh = undefined;
    }
  }
}

/** 内存 sink（测试与 MCP 调用记录断言用）：收集 JSON 行，可回读解析。 */
export function memorySink() {
  const lines = [];
  return {
    lines,
    write(line) { lines.push(line); return true; },
    records() { return lines.map((l) => JSON.parse(l)); },
  };
}

/** 便捷追加写（供 CLI 适配器等无 logger 实例的场景复用同一目录约定）。 */
export function appendNdjsonLine(logDir, record) {
  if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });
  appendFileSync(join(logDir, `bridge-${new Date().toISOString().slice(0, 10)}.ndjson`), JSON.stringify(record) + "\n", "utf8");
}
