// AIEO Phase 1 M3 ZCode Bridge — M1Client 可注入接口层
//
// M3 与 M1 的对接只依赖 C1 REST 契约（platform-contract §2.3 端点表），不 import M1 代码：
//   - claimTask          → POST /api/v1/tasks/{task_id}/claim      （200 Task；409 TASK-0003）
//   - submitMessage      → POST /api/v1/messages                   （202 MessageAck；409 RES-0003 幂等返回原结果）
//   - registerDevReport  → POST /api/v1/reports/development        （201；409 RES-0003 幂等返回原结果）
//
// 注入形态（依赖倒置，测试用内存/文件假实现替换）：
//   - HttpM1Client：生产实现（fetch，默认 http://127.0.0.1:8000，仅本机）；
//   - FileBackedFakeM1Client：内存假实现 + 状态落盘 JSON（测试 ①②③ 用；供 stdio 子进程
//     与测试进程共享同一假 M1 状态，语义等价于内存实现）。
//
// 边界（如实声明）：
//   - ClaimRequest / MessageAck / DevReport 请求体的机器可读 Schema 尚未出现在 contracts/v1.0/
//     （该目录现仅有 git-pointer / review-report / gpt-inbound-poc 三个 Schema）；
//     本文件按 C1 端点表语义与 03-协议 §6 结构实现最小请求体，待 M1 契约测试基线补齐后对齐。

import { aieoError, httpStatusToC3 } from "./errors.mjs";

/**
 * @typedef {Object} M1Client
 * @property {(req: {task_id: string, agent_id: string, agent_type: string,
 *                     correlation_id: string, session_id: string, claimed_at: string}) => Promise<object>} claimTask
 *   领取任务（非幂等独占租约）：已被领取时必须抛 TASK-0003；任务不存在抛 RES-0001。
 * @property {(envelope: object) => Promise<{message_id: string, status: string, duplicate?: boolean}>} submitMessage
 *   消息投递统一入口：message_id 主键去重；重复时返回原处理结果（duplicate=true），不重复执行副作用。
 * @property {(report: object) => Promise<{registered: boolean, duplicate?: boolean, dev_report_id?: string}>} registerDevReport
 *   开发报告登记：execution_id 唯一；重复登记返回原登记结果（duplicate=true）。
 */

/** C1 §2.1：除 health 外全部端点要求有效会话；M3 以 C7 §8.6 本机服务身份凭证透传（若配置）。 */
export class HttpM1Client {
  /**
   * @param {{baseUrl: string, serviceToken?: string|null, fetchImpl?: typeof fetch,
   *          timeoutMs?: number, logger?: {info:Function, warn:Function, error:Function}}} opts
   */
  constructor(opts) {
    if (!opts?.baseUrl) throw new Error("SYS-0001: HttpM1Client 需要 baseUrl");
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.serviceToken = opts.serviceToken ?? null;
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
    this.timeoutMs = opts.timeoutMs ?? 15_000;
    this.logger = opts.logger ?? null;
  }

  _headers() {
    const h = { "content-type": "application/json; charset=utf-8" };
    if (this.serviceToken) h.authorization = `Bearer ${this.serviceToken}`;
    return h;
  }

  async _request(method, path, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res;
    try {
      res = await this.fetchImpl(this.baseUrl + path, {
        method,
        headers: this._headers(),
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      // M1 不可达 / 超时：按 C3 折算，不做无限重试
      if (err?.name === "AbortError") {
        throw aieoError("SYS-0003", `OPERATION_TIMEOUT: M1 请求超时（${this.timeoutMs}ms）: ${path}`, { retryable: false });
      }
      throw aieoError("SYS-0002", `SERVICE_UNAVAILABLE: M1 不可达: ${err.message}`, { retryable: true });
    } finally {
      clearTimeout(timer);
    }
    const text = await res.text();
    let payload = null;
    try { payload = text ? JSON.parse(text) : null; } catch { /* 非 JSON 响应按原始文本处理 */ }

    if (!res.ok) {
      // M1 遵守 §4.2 统一错误 Schema：优先透传其 code；否则按 HTTP 保守映射
      const code = payload?.code && typeof payload.code === "string" ? payload.code : httpStatusToC3(res.status);
      throw aieoError(code, payload?.message ?? `M1 返回 HTTP ${res.status}: ${path}`, {
        details: payload?.details ?? undefined,
        retryable: payload?.retryable,
        correlation_id: payload?.correlation_id ?? undefined,
      });
    }
    return payload;
  }

  /** POST /api/v1/tasks/{task_id}/claim（C1 §2.3：非幂等独占租约；TASK-0003/RES-0001 由 M1 判定并透传）。 */
  async claimTask(req) {
    return this._request("POST", `/api/v1/tasks/${encodeURIComponent(req.task_id)}/claim`, {
      agent_id: req.agent_id,
      agent_type: req.agent_type,
      correlation_id: req.correlation_id,
      session_id: req.session_id,
      claimed_at: req.claimed_at,
    });
  }

  /** POST /api/v1/messages（幂等：message_id 主键去重；RES-0003 = 返回原处理结果）。 */
  async submitMessage(envelope) {
    try {
      const ack = await this._request("POST", "/api/v1/messages", envelope);
      return { ...ack, duplicate: false };
    } catch (err) {
      if (err?.c3?.code === "RES-0003") {
        // §2.3 /messages 幂等规则：重复 → RES-0003（返回原处理结果，不重复执行副作用）
        return {
          message_id: envelope.message_id,
          status: err.c3.details?.original_status ?? "duplicate",
          duplicate: true,
          original_result: err.c3.details ?? null,
        };
      }
      throw err;
    }
  }

  /** POST /api/v1/reports/development（幂等：execution_id 唯一；RES-0003 = 幂等返回原登记结果）。 */
  async registerDevReport(report) {
    try {
      const ack = await this._request("POST", "/api/v1/reports/development", report);
      return { registered: true, duplicate: false, dev_report_id: ack?.dev_report_id ?? null, ...ack };
    } catch (err) {
      if (err?.c3?.code === "RES-0003") {
        return { registered: true, duplicate: true, dev_report_id: err.c3.details?.dev_report_id ?? null };
      }
      throw err;
    }
  }
}
