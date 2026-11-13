// AIEO Phase 1 M3 ZCode Bridge — 取消封装（DEC-006：超时 + 软取消 + 进程树终止兜底）
//
// Phase 0 实测边界（final-report §5.4 / POC-02）：ZCode CLI 无受支持的外部取消接口。
// 取消链路固定三段，顺序不可调换：
//   ① 超时判定（任务单交付期限 / AIEO_ZCODE_BRIDGE_TASK_TIMEOUT_MS，CLI 超时兜底）；
//   ② 软取消：写取消标记文件（JSON），任务提示词已内嵌"周期性检查标记文件"协议，
//      Agent 感知后自行收尾退出（保存现场）；等待 cancelGraceMs 宽限期；
//   ③ 进程树终止兜底：宽限期满仍未退出 → taskkill /T /F（Windows）或进程组 SIGTERM/ kill
//      （POSIX），不保存会话现场（粗暴但可靠）。
//
// 取消标记文件内容只含任务标识与原因，不含敏感信息；写失败不静默（返回 false 由调用方落日志）。

import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname } from "node:path";
import { aieoError } from "./errors.mjs";

/**
 * 写软取消标记文件（原子替换：tmp + rename）。
 * @param {string} markerPath 标记文件绝对路径（由 CLI 适配器按任务生成）
 * @param {{taskId: string, sessionId?: string|null, traceId?: string|null, reason: string, requestedBy?: string}} info
 * @returns {boolean} 是否成功写出
 */
export function writeCancelMarker(markerPath, info) {
  const payload = {
    cancel: true,
    task_id: info.taskId,
    session_id: info.sessionId ?? null,
    trace_id: info.traceId ?? null,
    reason: info.reason ?? "timeout",
    requested_by: info.requestedBy ?? "aieo-zcode-bridge",
    requested_at: new Date().toISOString(),
    protocol: "Agent 发现本文件后应立即停止新工作、收尾已开始的工作并通过 MCP submit_result 上报，随后退出；本文件由 AIEO 侧管理",
  };
  try {
    mkdirSync(dirname(markerPath), { recursive: true });
    const tmp = `${markerPath}.tmp-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
    writeFileSync(tmp, JSON.stringify(payload, null, 2), "utf8");
    renameSync(tmp, markerPath);
    return true;
  } catch {
    return false;
  }
}

export function cancelMarkerExists(markerPath) {
  return existsSync(markerPath);
}

/** 跨平台进程树终止兜底。返回 {signaled: boolean, tool: string}。 */
export async function treeKill(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return { signaled: false, tool: "none" };
  if (process.platform === "win32") {
    // taskkill /T：连根终止进程树；/F：强制（无受支持的安全停止接口，DEC-006）
    return new Promise((resolve) => {
      const child = spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
      child.on("exit", (code) => resolve({ signaled: code === 0, tool: "taskkill /T /F" }));
      child.on("error", () => resolve({ signaled: false, tool: "taskkill /T /F" }));
    });
  }
  // POSIX：spawn 时用 detached 使子进程成为进程组长 → kill 整组
  try {
    process.kill(-pid, "SIGTERM");
    await new Promise((r) => setTimeout(r, 1500));
    try { process.kill(-pid, 0); process.kill(-pid, "SIGKILL"); } catch { /* 已退出 */ }
    return { signaled: true, tool: "kill -TERM/-KILL <pgid>" };
  } catch {
    return { signaled: false, tool: "kill <pgid>" };
  }
}

/**
 * 取消链路控制器（DEC-006）。
 * @param {object} opts
 * @param {() => Promise<boolean>} opts.isRunning 被监控进程是否仍在运行
 * @param {(reason: string, phase: "timeout"|"explicit") => Promise<string|null>} opts.writeMarker 写取消标记文件，返回标记路径
 * @param {() => Promise<{signaled: boolean, tool: string}>} opts.treeKillFn 进程树终止兜底
 * @param {{graceMs?: number, pollMs?: number}} [timing]
 */
export class CancelChain {
  constructor(opts, timing = {}) {
    this.isRunning = opts.isRunning;
    this.writeMarker = opts.writeMarker;
    this.treeKillFn = opts.treeKillFn ?? treeKill;
    this.graceMs = timing.graceMs ?? 10_000;
    this.pollMs = timing.pollMs ?? 250;
    this.timer = null;
    this.cancelled = false;
    this.phases = [];
  }

  /** 启动超时监视（timeoutMs 后触发链路）。 */
  start(timeoutMs) {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      // 保存在途链路 Promise：主流程（CLI 退出事件）可经 waitSettled 等待收敛，
      // 避免早于 graceful_exit/tree_kill 记录就快照 phases 的竞态；catch 防 unhandledRejection。
      this._running = this.trigger("timeout");
      this._running.catch(() => { /* 链路异常由 phases/日志侧体现，不向主流程抛 */ });
    }, timeoutMs);
    if (typeof this.timer.unref === "function") this.timer.unref();
  }

  /** 等待在途取消链路收敛（graceful_exit 或 tree_kill 落定）；未在途则立即返回。 */
  async waitSettled() {
    if (this._running) {
      try { await this._running; } catch { /* 同上，不向主流程抛 */ }
    }
  }

  stop() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
  }

  /** 显式取消（外部指令），同一链路：软取消优先，宽限期后树终止兜底。 */
  async trigger(reason, phase = "explicit") {
    if (this.cancelled) return this.phases;
    this.cancelled = true;
    this.stop();

    // ② 软取消：写标记 + 等宽限期（Agent 自行收尾）
    const markerPath = await this.writeMarker(reason, phase);
    this.phases.push({ phase: "soft_cancel", marker_path: markerPath, written: markerPath !== null });
    const deadline = Date.now() + this.graceMs;
    while (Date.now() < deadline) {
      if (!(await this.isRunning())) {
        this.phases.push({ phase: "graceful_exit", tool: "marker_file" });
        return this.phases;
      }
      await sleep(this.pollMs);
    }

    // ③ 进程树终止兜底
    const kill = await this.treeKillFn();
    this.phases.push({ phase: "tree_kill", ...kill });
    return this.phases;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 取消链路失败语义：软取消/树终止都不保证 Agent 状态可恢复，超时取消的结果一律按 PROVIDER-0001 折算（超时 ≠ 任务失败，先核验再重试）。 */
export function cancelledError(reason) {
  return aieoError("PROVIDER-0001", `PROVIDER_TIMEOUT: ZCode CLI 执行超时，取消链路已执行（${reason}）；执行状态待核验，禁止盲目重复派发`);
}
