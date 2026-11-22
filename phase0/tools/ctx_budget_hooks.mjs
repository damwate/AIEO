// ctx_budget_hooks.mjs — 会话上下文预算接入的纯函数化（可注入测试）
// 从 gpt_dispatch.mjs 抽出（CTX-CODE R5 P1-2：派单故障路径端到端可测）。
// 语义与 gpt_dispatch 内联版完全一致；gpt_dispatch 调用这些导出函数。
// 约束（CTX-R9 冻结）：UNCERTAIN 不得自动放行（--allow-near-limit 不绕过 UNCERTAIN）；
// 记账失败 → markUncertain 持久标记；markUncertain 自身失败 → SESSION_BUDGET_MARK_FAILED 中止派单。

const DEFAULT_AGENT_KIT_DIR = "D:/CommonProjects/agent-kit";

export async function loadSessionBudget(env = process.env) {
  const { join } = await import("node:path");
  const { pathToFileURL } = await import("node:url");
  const dir = env.AGENT_KIT_DIR || DEFAULT_AGENT_KIT_DIR;
  return import(pathToFileURL(join(dir, "monitor", "session-budget.mjs")).href);
}

// 发送前预检门。返回 verdict（NORMAL/WARN 时调用方继续）；HARD/UNCERTAIN/账本异常 = 抛错中止派单。
export function assessBudgetGate(uuid, { sessionBudget, allowNearLimit = false, log = () => {} }) {
  // 新会话阶段：UUID 尚未取得（--new-session）→ 无既有账本可评估，跳过预检（不触碰账本）
  if (!uuid) {
    return { state: "NORMAL", totals: { turns: 0, inBytes: 0, outBytes: 0, totalBytes: 0, maxTurnBytes: 0 }, thresholds: sessionBudget.thresholds?.() ?? null, provableEmpty: true, skipped: true };
  }
  let verdict;
  try {
    verdict = sessionBudget.assessLedger(uuid);
  } catch (e) {
    throw new Error(`SESSION_BUDGET_UNCERTAIN: ${e.message}（账本异常不得自动放行，fail-closed）`);
  }
  if (verdict.state === "UNCERTAIN") {
    // R4 P0：标记存在=派单被阻断；不可被 --allow-near-limit 绕过
    throw new Error(`SESSION_BUDGET_UNCERTAIN: 会话 ${uuid} 存在记账失败标记（持久 UNCERTAIN，不自动放行）；请核对账本后用 agent-kit clearUncertain 显式恢复（审计留痕 recovery-log.ndjson）再派单`);
  }
  if (verdict.state === "HARD" && !allowNearLimit) {
    throw new Error(`SESSION_BUDGET_EXCEEDED: 会话 ${uuid} 累计 ${verdict.totals.totalBytes}B ≥ HARD ${verdict.thresholds.hardBytes}B；请改用 --new-session 自包含简报迁移（紧急通道 --allow-near-limit 显式留痕）`);
  }
  if (verdict.state !== "NORMAL") {
    log(`[ctx-budget] ${verdict.state}: 累计 ${verdict.totals.totalBytes}B（WARN≥${verdict.thresholds.warnBytes}/HARD≥${verdict.thresholds.hardBytes}）${allowNearLimit ? "（--allow-near-limit 显式放行）" : ""}`);
  }
  return verdict;
}

// 发送确认后记 in_bytes（开启逻辑轮）。recordTurn 失败 → markUncertain 持久标记；
// markUncertain 自身失败 → SESSION_BUDGET_MARK_FAILED（R4 P0：磁盘故障时持久标记不存在，不得继续）。
export function recordInTurn(uuid, inBytes, { sessionBudget, log = () => {} }) {
  try {
    sessionBudget.recordTurn(uuid, { inBytes, outBytes: 0 });
    log(`[ctx-budget] turn+in_bytes=${inBytes}B → ${uuid}`);
  } catch (e) {
    try {
      sessionBudget.markUncertain(uuid, `in_record_failed: ${e.message}`);
      log(`[ctx-budget] UNCERTAIN 标记已写入 ${uuid}`);
    } catch (e2) {
      throw new Error(`SESSION_BUDGET_MARK_FAILED: in 记账失败且 UNCERTAIN 标记写入失败，派单中止: ${e.message} / ${e2.message}`);
    }
  }
}

// 采集完成后记 out_bytes（completeOpenTurn 关联同一逻辑轮）。调用方须已把 reply 证据落盘。
// 失败语义同 recordInTurn。
export function recordOutTurn(uuid, outBytes, { sessionBudget, log = () => {}, evDir = null }) {
  try {
    sessionBudget.recordTurn(uuid, { inBytes: 0, outBytes }, { completeOpenTurn: true });
    log(`[ctx-budget] turn+out_bytes=${outBytes}B → ${uuid}`);
  } catch (e) {
    try {
      sessionBudget.markUncertain(uuid, `out_record_failed: ${e.message}`);
      log(`[ctx-budget] UNCERTAIN 标记已写入 ${uuid}`);
    } catch (e2) {
      throw new Error(`SESSION_BUDGET_MARK_FAILED: out 记账失败且 UNCERTAIN 标记写入失败，派单中止（证据已落盘 ${evDir ?? "未指定"}，需人工核查）: ${e.message} / ${e2.message}`);
    }
  }
}
