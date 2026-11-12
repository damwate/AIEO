// M2 会话上限（context limit）检测与轮换（rotateIfContextLimit 语义）。
//
// 语义（module-boundaries §2 M2 / DEC-008 / platform-contract §2.6.8）：
//   - 检测到"上下文窗口已达上限"→ 立即安全停止自动化（CONTEXT_LIMIT_STOP），不重发、不自动迁移；
//   - 轮换 = 不继承摘要/历史/旧提示词，跳转主页开全新空白会话，交接只接受 GitPointer 交接包；
//   - 旧一轮没有结构化证据（未发送或生成已结束）时，轮换 fail-closed（ROTATION_OLD_ROUND_UNRESOLVED）。
// 上限横幅可能晚于 unit/composer 就绪出现，不能只做一次即时检查（phase0 教训）。

import { CONTEXT_LIMIT_MARKER, contextLimitDocument } from "./dom_extract.mjs";
import { controllerError } from "./errors.mjs";
import { CHATGPT_HOME } from "./browser_session.mjs";
import { decideSessionRotation } from "./session_store.mjs";

export { CONTEXT_LIMIT_MARKER };

export function contextLimitError(code, message, details = undefined) {
  return controllerError(code, message, details === undefined ? {} : { details });
}

export function detectContextLimit(bodyText) {
  return typeof bodyText === "string" && bodyText.includes(CONTEXT_LIMIT_MARKER);
}

// 持续检测（默认窗口 5s，内部 500ms 轮询）；命中即抛 CONTEXT_LIMIT_STOP 安全停止。
// 时钟默认取 view.now()（真实浏览器=Date.now()；测试夹具=虚拟时钟注入点）。
export async function stopIfContextLimit({ view, detectWindowMs = 5000, pollIntervalMs = 500, clock = null }) {
  const now = clock ?? (typeof view?.now === "function" ? () => view.now() : () => Date.now());
  const t0 = now();
  for (;;) {
    if (detectContextLimit(await view.bodyText())) {
      throw contextLimitError(
        "CONTEXT_LIMIT_STOP",
        "上下文窗口已达上限，已停止自动化；请由主会话换会话，不重发、不自动迁移",
        { detected_at: new Date().toISOString(), session_rotation_required: true },
      );
    }
    if (now() - t0 >= detectWindowMs) return false;
    await view.sleep(pollIntervalMs);
  }
}

// rotateIfContextLimit：上限停止后的轮换决策。委托 session_store.decideSessionRotation 保持
// 单一来源（GitPointer 交接包必须、禁止摘要继承、旧轮证据必须已终结）。
export function decideContextLimitRotation({ session, reason = "CONTEXT_LIMIT_STOP", handoff, oldRoundEvidence }) {
  return decideSessionRotation(session, { reason, handoff, oldRoundEvidence });
}

// 轮换执行：标记旧会话 → 决策 → 建新会话 → 视图跳转主页并验证"全新空白"。
// 返回 { decision, new_session? }；decision=BLOCKED 时不做任何页面动作。
export async function rotateIfContextLimit({
  sessionStore,
  sessionId,
  view = null,
  handoff,
  oldRoundEvidence,
  readyTimeoutMs = 40000,
  readyProbe = null,
}) {
  const session = sessionStore.get(sessionId);
  const decision = decideContextLimitRotation({
    session,
    reason: session.stop_reason ?? "CONTEXT_LIMIT_STOP",
    handoff,
    oldRoundEvidence,
  });
  if (decision.decision !== "ROTATE_TO_FRESH_BLANK_SESSION") {
    return { decision: "BLOCKED", ...decision, new_session: null };
  }
  const newSession = sessionStore.rotate({
    oldSessionId: sessionId,
    reason: session.stop_reason ?? "CONTEXT_LIMIT_STOP",
    handoff,
  });
  if (view) {
    await beginFreshBlankSession({ view, readyTimeoutMs, readyProbe });
  }
  return { decision: decision.decision, ...decision, new_session: newSession };
}

// 跳转主页开全新空白会话：就绪 = composer 存在且 body 文本充分，且没有任何 user unit（空白）。
export async function beginFreshBlankSession({ view, homeUrl = CHATGPT_HOME, readyTimeoutMs = 40000, readyProbe = null }) {
  await view.navigate(homeUrl);
  const t0 = view.now();
  for (;;) {
    const probe = readyProbe
      ? await readyProbe(view)
      : await (async () => {
        const units = await view.listUnits();
        const composer = await view.composerText();
        const body = await view.bodyText();
        return {
          ready: composer !== null && body.length > 300 && units.filter((unit) => unit.role === "user").length === 0,
          user_units: units.filter((unit) => unit.role === "user").length,
          composer_present: composer !== null,
          body_length: body.length,
        };
      })();
    if (probe.ready) return probe;
    if (view.now() - t0 >= readyTimeoutMs) {
      throw contextLimitError("FRESH_SESSION_NOT_READY", "新会话页面在超时前未就绪（composer/空白判定未通过）", probe);
    }
    await view.sleep(1500);
  }
}
