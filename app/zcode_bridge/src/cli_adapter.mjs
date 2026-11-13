// AIEO Phase 1 M3 ZCode Bridge — ZCode CLI 外部启动适配器（POC-02 已验证形态）
//
// 命令形态（POC-02 PASS_WITH_CONSTRAINTS，DEC-005）：
//   zcode --prompt "<任务包>" --cwd <项目> --mode <按风险> --json
//   → 结束后 stdout 返回 {sessionId, traceId, response, usage, projection}。
// 返回值：{session_id, trace_id, response, usage}（camelCase → snake_case）。
//
// 硬约束（Phase 0 实测，写入本适配器设计）：
//   - `--json` 为运行结束后返回；运行中状态靠 Agent 经 MCP 主动上报（final-report §5.5）；
//   - 外部取消无受支持接口 → 超时 + 软取消（标记文件）+ 进程树终止兜底（DEC-006，cancel.mjs）；
//   - 工作区写锁：每工作区一把，单会话单任务（module-boundaries §6），锁服务可注入；
//   - MINOR-004 权限模式分级：任务风险 → --mode 白名单映射，禁用 yolo（见 mapRiskToMode）。
//
// 本适配器不真实执行 ZCode CLI（不联网派任务）；测试经注入的 mock 可执行文件验证
// 参数拼装、JSON 解析、超时与取消链路。

import { spawn } from "node:child_process";
import { join } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import { aieoError } from "./errors.mjs";
import { CancelChain, writeCancelMarker, cancelledError } from "./cancel.mjs";
import { ZCODE_MODE_WHITELIST } from "./config.mjs"; // 单一定义源（MINOR-004 白名单）

/**
 * MINOR-004 落地：任务风险 → --mode 白名单映射。
 * 映射表（POC-02：--prompt 默认 yolo，生产按风险选择）：
 *   LOW → build；MEDIUM → edit；HIGH/CRITICAL → guarded；未知 → guarded（fail-closed 最严）。
 * requestedMode 仅当与映射结果一致才被采纳（不发明各模式内部权限语义，禁止静默放宽）；
 * yolo 一律拒绝；白名单外一律拒绝。
 *
 * @param {string|null} risk 任务风险（task package `risk`/`risk_level`，大写）
 * @param {{requestedMode?: string|null, allowedModes?: string[]}} [opts]
 * @returns {string} --mode 参数
 */
export function mapRiskToMode(risk, opts = {}) {
  const allowed = opts.allowedModes ?? ZCODE_MODE_WHITELIST;
  const requested = opts.requestedMode ?? null;

  const mapping = { LOW: "build", MEDIUM: "edit", HIGH: "guarded", CRITICAL: "guarded" };
  const normalized = typeof risk === "string" ? risk.trim().toUpperCase() : null;
  if (normalized !== null && !(normalized in mapping)) {
    throw aieoError("REQ-0001", `INVALID_ARGUMENT: 未知任务风险级别 "${risk}"（允许 LOW/MEDIUM/HIGH/CRITICAL），fail-closed 拒绝派发`);
  }
  const mapped = normalized ? mapping[normalized] : "guarded"; // 无风险声明 → 最严格模式

  if (requested !== null) {
    if (!ZCODE_MODE_WHITELIST.includes(requested)) {
      throw aieoError("REQ-0001", `INVALID_ARGUMENT: --mode "${requested}" 不在白名单（build/edit/guarded）；yolo 与白名单外模式禁止用于无人值守派发`);
    }
    if (!allowed.includes(requested)) {
      throw aieoError("REQ-0001", `INVALID_ARGUMENT: --mode "${requested}" 不在当前配置白名单（${allowed.join("/")}）`);
    }
    if (requested !== mapped) {
      throw aieoError("REQ-0001", `INVALID_ARGUMENT: 请求的 --mode "${requested}" 与风险映射结果 "${mapped}"（risk=${normalized ?? "未声明"}）不一致，禁止静默放宽权限`);
    }
  }
  return mapped;
}

/** 任务包（03-协议 §5 必备字段）的最小完整性检查；缺失字段 → REQ-0001（不伪造任务包）。 */
const REQUIRED_PACKAGE_FIELDS = [
  "task_id", "project_id", "batch_id", "title", "description",
  "workspace_path", "base_commit", "files_scope", "acceptance_criteria",
  "test_command", "branch_naming",
];

function validateTaskPackage(pkg) {
  const missing = REQUIRED_PACKAGE_FIELDS.filter((f) => pkg?.[f] === undefined || pkg?.[f] === null || pkg?.[f] === "");
  if (!pkg || typeof pkg !== "object") {
    throw aieoError("REQ-0001", "INVALID_ARGUMENT: 任务包必须为对象（03-协议 §5）");
  }
  if (missing.length > 0) {
    throw aieoError("REQ-0001", `INVALID_ARGUMENT: 任务包缺少必备字段（03-协议 §5）: ${missing.join(", ")}`, {
      details: { missing_fields: missing },
    });
  }
}

/** 生成取消标记文件路径（工作区外，避免弄脏 Git 工作区）。 */
export function cancelMarkerPathFor(cancelDir, taskId) {
  return join(cancelDir, `cancel-${String(taskId).replace(/[^A-Za-z0-9_-]/g, "_")}.json`);
}

/** 任务提示词组装：任务包 JSON + 取消协议（DEC-006 软取消需要任务包协议配合）。 */
export function buildPrompt(taskPackage, markerPath) {
  return [
    "AIEO 任务包（JSON，03-协议 §5）：",
    JSON.stringify(taskPackage),
    "",
    "取消协议（必须遵守）：执行期间每完成一个工作步骤检查一次取消标记文件；",
    `若文件存在（路径：${markerPath}），立即停止新工作、收尾当前步骤，`,
    "通过 MCP 工具 submit_result 上报（status=BLOCKED, known_issues 注明 cancelled_by_aieo），随后正常退出。",
  ].join("\n");
}

/**
 * CLI 外部启动适配器。
 * @param {object} deps 依赖注入
 * @param {{zcodeCliPath: string, cancelDir: string, taskTimeoutMs: number, cancelGraceMs: number,
 *          allowedModes: string[]}} config C6 配置
 * @param {{lockService?: {acquire: Function}|null, logger?: object|null, spawnImpl?: Function,
 *          now?: () => number}} [hooks] lockService 可注入（测试内存假锁）；spawnImpl 可注入（测试 mock）
 */
export class ZcodeCliAdapter {
  constructor(config, hooks = {}) {
    this.config = config;
    this.lockService = hooks.lockService ?? null;
    this.logger = hooks.logger ?? null;
    this.spawnImpl = hooks.spawnImpl ?? spawn;
    this.cancelDir = config.cancelDir;
    if (!existsSync(this.cancelDir)) {
      try { mkdirSync(this.cancelDir, { recursive: true }); } catch { /* 写日志失败路径由 CancelChain 兜底 */ }
    }
  }

  _log(event, message, extra) {
    if (!this.logger) return;
    this.logger.info(event, message, extra);
  }

  /** POC-02 返回结构（camelCase → snake_case）。 */
  _result(parsed, exitCode, durationMs, mode, lockHandle, cancelled, cancelPhases) {
    return {
      session_id: parsed.sessionId ?? null,
      trace_id: parsed.traceId ?? null,
      response: parsed.response ?? "",
      usage: parsed.usage ?? null,
      exit_code: exitCode,
      duration_ms: durationMs,
      cancelled,
      ...(cancelPhases ? { cancel_phases: cancelPhases } : {}),
      mode,
      lock: lockHandle ? { lockPath: lockHandle.lockPath } : null,
    };
  }

  /**
   * 触发一次 ZCode 任务（同步等待 CLI 结束）。
   * @param {object} taskPackage 03-协议 §5 任务包
   * @param {{correlationId: string, requestedMode?: string|null, risk?: string|null,
   *          timeoutMs?: number, cancelGraceMs?: number, sessionId?: string}} opts
   * @returns {Promise<{session_id: string|null, trace_id: string|null, response: string,
   *                     usage: object|null, exit_code: number|null, duration_ms: number,
   *                     cancelled: boolean, cancel_phases?: Array, mode: string, lock: object}>}
   */
  async trigger(taskPackage, opts) {
    validateTaskPackage(taskPackage);
    if (!opts?.correlationId) {
      throw aieoError("REQ-0001", "INVALID_ARGUMENT: trigger 需要 correlationId（C1 §2.2 请求与响应必须关联）");
    }
    const mode = mapRiskToMode(opts.risk ?? taskPackage.risk ?? taskPackage.risk_level ?? null, {
      requestedMode: opts.requestedMode ?? null,
      allowedModes: this.config.allowedModes,
    });
    const taskId = taskPackage.task_id;
    const markerPath = cancelMarkerPathFor(this.cancelDir, taskId);

    // 工作区写锁：每工作区一把（可注入；无锁服务时按配置决定是否允许裸跑——生产必须配锁）
    let lockHandle = null;
    if (this.lockService) {
      lockHandle = await this.lockService.acquire({
        workspacePath: taskPackage.workspace_path,
        taskId,
        sessionId: opts.sessionId ?? `SES-CLI-${process.pid}`,
        ttlMs: opts.timeoutMs ?? this.config.taskTimeoutMs,
      });
      this._log("cli.lock_acquired", `工作区写锁已获取: ${taskId}`, {
        task_id: taskId, correlation_id: opts.correlationId,
        operation: "trigger", result: "SUCCESS",
      });
    }

    const args = [
      "--prompt", buildPrompt(taskPackage, markerPath),
      "--cwd", taskPackage.workspace_path,
      "--mode", mode,
      "--json",
    ];

    const timeoutMs = opts.timeoutMs ?? this.config.taskTimeoutMs;
    const graceMs = opts.cancelGraceMs ?? this.config.cancelGraceMs;
    const t0 = Date.now();
    let child;
    let stdoutBuf = "";
    let stderrBuf = "";
    let cancelled = false;
    let cancelPhases = null;

    const chain = new CancelChain(
      {
        isRunning: async () => child && child.exitCode === null,
        writeMarker: async (reason, phase) => {
          const ok = writeCancelMarker(markerPath, {
            taskId, sessionId: opts.sessionId ?? null, reason: `${phase}:${reason}`,
          });
          this._log(ok ? "cli.soft_cancel" : "cli.soft_cancel_failed",
            ok ? `软取消标记已写入: ${taskId}` : `软取消标记写入失败: ${taskId}`,
            { task_id: taskId, correlation_id: opts.correlationId, operation: "trigger", result: ok ? "SUCCESS" : "FAILURE" });
          return ok ? markerPath : null;
        },
        treeKillFn: async () => {
          const kill = await import("./cancel.mjs").then((m) => m.treeKill(child?.pid));
          this._log("cli.tree_kill", `进程树终止兜底: ${taskId} (pid=${child?.pid}, signaled=${kill.signaled})`, {
            task_id: taskId, correlation_id: opts.correlationId, operation: "trigger",
            result: kill.signaled ? "SUCCESS" : "FAILURE", process_id: child?.pid,
          });
          return kill;
        },
      },
      { graceMs, pollMs: 100 }
    );

    try {
      child = this.spawnImpl(this.config.zcodeCliPath, args, {
        cwd: taskPackage.workspace_path,
        windowsHide: true,
        // POSIX：独立进程组，进程树终止按组杀；Windows 树终止走 taskkill /T
        detached: process.platform !== "win32",
        stdio: ["ignore", "pipe", "pipe"],
      });
      chain.start(timeoutMs);
      child.stdout?.on("data", (d) => { stdoutBuf += d; });
      child.stderr?.on("data", (d) => { stderrBuf += d; });

      const exitCode = await new Promise((resolve, reject) => {
        child.on("error", reject);
        child.on("close", (code) => resolve(code));
      });
      chain.stop();
      const durationMs = Date.now() - t0;

      // --json 解析（结束后返回）：容忍 CLI 在 stdout 混入非 JSON 行（版本探测等），取最后一个合法对象
      const parsed = extractFinalJson(stdoutBuf);

      if (chain.cancelled) {
        cancelled = true;
        // 软取消在途时 CLI 退出：等链路收敛（宽限轮询判定 graceful_exit / 树终止落定）再取
        // phases —— 否则存在竞态：close 事件早于轮询记录 graceful_exit，phases 被截断快照。
        await chain.waitSettled();
        cancelPhases = chain.phases;
        if (parsed) {
          // 软取消被 Agent 响应并正常收尾退出：结果有效，标记 cancelled=true 返回（保存现场路径）
          this._log("cli.cancelled_graceful", `取消后 Agent 正常收尾退出: ${taskId}`, {
            task_id: taskId, correlation_id: opts.correlationId, operation: "trigger",
            result: "SUCCESS", duration_ms: durationMs, process_id: child.pid, exit_code: exitCode,
          });
          return this._result(parsed, exitCode, durationMs, mode, lockHandle, true, cancelPhases);
        }
        // 宽限期满被进程树终止、无可解析输出：超时 ≠ 任务失败，PROVIDER-0001 待核验（C3 §4.3）
        throw cancelledError(`task=${taskId}, phases=${JSON.stringify(cancelPhases)}`);
      }

      if (!parsed) {
        this._log("cli.contract_changed", `--json 输出不符合 POC-02 已验证契约（task=${taskId}）`, {
          task_id: taskId, correlation_id: opts.correlationId, operation: "trigger",
          result: "FAILURE", duration_ms: durationMs, exit_code: exitCode,
        });
        throw aieoError("PROVIDER-0004", `PROVIDER_CONTRACT_CHANGED: ZCode CLI --json 输出无法解析为已验证结构（exit=${exitCode}），停止盲目操作`, {
          details: { exit_code: exitCode, stdout_bytes: stdoutBuf.length, stderr_bytes: stderrBuf.length },
        });
      }

      this._log("cli.launch", `ZCode CLI 任务结束: ${taskId}`, {
        task_id: taskId, correlation_id: opts.correlationId, operation: "trigger", result: "SUCCESS",
        duration_ms: durationMs, process_id: child.pid, exit_code: exitCode,
        session_id: parsed.sessionId ?? null, trace_id: parsed.traceId ?? null,
      });
      return this._result(parsed, exitCode, durationMs, mode, lockHandle, false, null);
    } catch (err) {
      if (cancelled) cancelPhases = chain.phases;
      throw err;
    } finally {
      chain.stop();
      if (lockHandle) {
        await lockHandle.release(); // 进程树终止兜底时同步释放（module-boundaries §6）
        this._log("cli.lock_released", `工作区写锁已释放: ${taskId}`, {
          task_id: taskId, correlation_id: opts.correlationId, operation: "trigger", result: "SUCCESS",
        });
      }
    }
  }
}

/**
 * 从 stdout 中提取 POC-02 已验证的最终 JSON（{sessionId, traceId, response, usage, projection}）。
 * 策略：逐块尝试解析最后一个可解析的 JSON 对象（容忍前缀日志行 / \n 分隔的多段输出）。
 */
export function extractFinalJson(stdout) {
  if (!stdout || typeof stdout !== "string") return null;
  const trimmed = stdout.trim();
  // ① 整体尝试
  const whole = tryParse(trimmed);
  if (whole && looksLikeCliResult(whole)) return whole;
  // ② 从每个 '{' 起点向后找可解析对象，取最后一个合格者
  let best = null;
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] !== "{") continue;
    const parsed = tryParse(trimmed.slice(i));
    if (parsed && looksLikeCliResult(parsed)) best = parsed;
  }
  return best;
}

function tryParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}

function looksLikeCliResult(obj) {
  return obj && typeof obj === "object" && (
    typeof obj.sessionId === "string"
    || typeof obj.traceId === "string"
    || ("projection" in obj && typeof obj.projection === "object")
    || ("usage" in obj && typeof obj.usage === "object")
  );
}
