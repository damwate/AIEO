// M2 发送双验（R3+ 语义，port 自 phase0/tools/gpt_dispatch.mjs sendAndCollect；
// 严格时序修复 7c45263 / pre-send 生成门 009a2d1）。
//
// 严格时序（fail-closed）：
//   1. pre-send 生成门：发送前停止按钮必须不可见（preSendStopVisible=false），
//      可见 = 上一轮生成仍在进行，拒绝发送，绝不排队/重试/打断；
//   2. composer 必须为空；插入后回读一致（norm 空白折叠比较）才允许 Enter；
//   3. 发送后先确认"新的 user unit key（≠ 基线）"出现，停止按钮只在 tail 确认之后
//      观察到的才算数（stopOkAfterTail）；顺序颠倒即不确定；
//   4. 超时仍无双验证据 → SEND_ACCEPTANCE_UNCERTAIN，不重发。

import { controllerError } from "./errors.mjs";

function sendError(code, message, details = undefined) {
  return controllerError(code, message, details === undefined ? {} : { details });
}

function normText(s) {
  return (s || "").replace(/\s+/g, " ").trim();
}

// pre-send 生成门 + composer 就绪检查。返回审计字段 pre_send_stop_visible=false。
export async function assertPreSendGate(view) {
  const preSendStopVisible = await view.stopButtonVisible();
  if (preSendStopVisible === true) {
    throw sendError("PRE_SEND_GENERATION_ACTIVE", "发送前停止按钮可见：上一轮生成尚未结束，拒绝发送", {
      pre_send_stop_visible: true,
    });
  }
  const composerText = await view.composerText();
  if (composerText === null) {
    throw sendError("COMPOSER_NOT_READY", "composer 不存在或不可见，禁止盲发");
  }
  if (normText(composerText) !== "") {
    throw sendError("COMPOSER_NOT_EMPTY", "Composer 非空，STOP", { composer_length: composerText.length });
  }
  return { pre_send_stop_visible: false, composer_empty: true };
}

// 插入 + composer 回读一致性校验（在本地计量之后、Enter 之前）。
export async function insertAndVerifyComposer(view, text) {
  await view.focusComposer();
  await view.insertComposerText(text);
  const readback = await view.composerText();
  if (normText(readback) !== normText(text)) {
    throw sendError("COMPOSER_READBACK_MISMATCH", "composer 回读不一致，STOP（不发送）", {
      expected_bytes: Buffer.byteLength(text, "utf8"),
      readback_bytes: Buffer.byteLength(readback ?? "", "utf8"),
    });
  }
  return { readback_verified: true };
}

// 发送双验主体：调用方需先完成 assertPreSendGate + insertAndVerifyComposer 并自行按 Enter。
// baselineKey 是发送前的尾部 unit key；出现 ≠ baseline 的新 user unit 才算 tail 确认。
export async function verifySendAcceptance({ view, baselineKey, sendAcceptTimeoutMs = 30000, pollIntervalMs = 1000 }) {
  let tailOk = false;
  let stopOkAfterTail = false;
  let sentUserUnitKey = null;
  let polls = 0;
  const t0 = view.now();
  while (view.now() - t0 < sendAcceptTimeoutMs) {
    polls += 1;
    const tail = await view.readTailUnit();
    // 严格时序：先确认新 user unit；停止按钮的观察在 tail 确认之后才有效。
    if (!tailOk && tail && tail.role === "user" && tail.key && tail.key !== baselineKey) {
      tailOk = true;
      sentUserUnitKey = tail.key;
    }
    if (tailOk && (await view.stopButtonVisible())) stopOkAfterTail = true;
    if (tailOk && stopOkAfterTail) break;
    await view.sleep(pollIntervalMs);
  }
  if (!(tailOk && stopOkAfterTail && sentUserUnitKey)) {
    throw sendError(
      "SEND_ACCEPTANCE_UNCERTAIN",
      `发送双验未通过（tailOk=${tailOk} stopOkAfterTail=${stopOkAfterTail} userUnitKey=${sentUserUnitKey || "missing"}），UNCERTAIN，不重发`,
      { tail_ok: tailOk, stop_ok_after_tail: stopOkAfterTail, user_unit_key: sentUserUnitKey, polls },
    );
  }
  return {
    ok: true,
    user_unit_key: sentUserUnitKey,
    polls,
    stop_observed_after_tail: true,
    stop_button_visible_after_tail: true,
  };
}

// 一站式发送入口（出站计量由调用方在此之前完成）：门禁 → 插入回读 → Enter → 双验。
export async function sendWithAcceptance({ view, text, baselineKey, sendAcceptTimeoutMs = 30000, pollIntervalMs = 1000 }) {
  const gate = await assertPreSendGate(view);
  const insert = await insertAndVerifyComposer(view, text);
  await view.pressEnter();
  const acceptance = await verifySendAcceptance({ view, baselineKey, sendAcceptTimeoutMs, pollIntervalMs });
  return {
    send_receipt: {
      ...acceptance,
      pre_send_stop_visible: gate.pre_send_stop_visible,
      composer_readback_verified: insert.readback_verified,
      message_bytes: Buffer.byteLength(text, "utf8"),
    },
  };
}
