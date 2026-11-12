// M2 生成等待与完成判定辅助（port 自 phase0/tools/gpt_dispatch.mjs）。
//   - 生成观察：tail 确认后停止按钮出现（或 tail 后 stopOkAfterTail 已观察到）；
//   - 生成结束：已观察生成 && 停止按钮最终不可见；
//   - 默认 300s 生成超时（AIEO_GPT_CONTROLLER_GENERATION_TIMEOUT_MS）→ GENERATION_TIMEOUT；
//   - 超时不等于任务失败：只抛错暂停，由调用方保存证据并查询状态，不得盲目重发。

import { controllerError } from "./errors.mjs";

export function generationError(code, message, details = undefined) {
  return controllerError(code, message, details === undefined ? {} : { details });
}

// 生成等待：generationObserved 初始值通常为发送双验的 stop_observed_after_tail。
export async function waitForGenerationEnd({
  view,
  generationObserved = false,
  generationTimeoutMs = 300000,
  pollIntervalMs = 2000,
}) {
  let observed = generationObserved === true;
  let generationEnded = false;
  const t1 = view.now();
  while (view.now() - t1 < generationTimeoutMs) {
    const generating = await view.stopButtonVisible();
    if (generating) observed = true;
    if (observed && !generating) {
      generationEnded = true;
      break;
    }
    await view.sleep(pollIntervalMs);
  }
  if (!generationEnded) {
    throw generationError("GENERATION_TIMEOUT", `GENERATION_TIMEOUT: ${generationTimeoutMs}ms 内未确认生成结束`, {
      generation_observed: observed,
      generation_timeout_ms: generationTimeoutMs,
      gpt_resend_required: false,
    });
  }
  return { generation_observed: observed, generation_ended: true };
}

// 确认窗之后/期间的最终安静检查：停止按钮必须不可见、composer 必须为空。
export async function assertFinalQuietness({ view, composerText = undefined }) {
  const finalStopVisible = await view.stopButtonVisible();
  if (finalStopVisible !== false) {
    throw generationError("FINAL_STOP_VISIBLE", "完成判定失败：停止按钮仍可见", { final_stop_visible: true });
  }
  const composer = composerText === undefined ? await view.composerText() : composerText;
  if (composer === null) {
    throw generationError("COMPOSER_NOT_READY", "完成判定失败：composer 不存在");
  }
  if (composer.trim() !== "") {
    throw generationError("COMPOSER_NOT_EMPTY_AFTER_REPLY", "完成判定失败：composer 非空", { composer_length: composer.length });
  }
  return { final_stop_button_not_visible: true, composer_empty: true };
}
