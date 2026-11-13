// AIEO Phase 0 返工 R2 — GPT 生成完成判定模块（纯逻辑，可独立测试）
//
// 针对第二轮审查 MAJOR-001 的四点修复：
//   1. generationObserved：记录本轮"确实观察到"生成状态（停止按钮可见），不再硬编码 true；
//   2. generationEnded：记录停止按钮从可见到不可见的真实翻转；
//   3. 300 秒内未确认生成结束 → waitForGenerationEnd 抛 GENERATION_TIMEOUT（调用方以 exit 1 终止）；
//   4. completionConfirmed 必须同时满足 6 项条件（见 verifyCompletion），任何一项不满足都不算成功。
//
// 设计为纯函数 + 依赖注入（isGenVisible/sleep/now），使判定代码本身可以被反向测试真实执行，
// 无需伪造浏览器状态。sendAndCollect 是唯一的生产调用方；test_completion_judge.mjs 是测试调用方。

/**
 * 创建生成状态跟踪器。
 * @param {{initialObserved?: boolean}} opts 发送双验阶段若已观察到停止按钮，可置 initialObserved=true
 */
export function createGenerationTracker(opts = {}) {
  return { generationObserved: opts.initialObserved === true, generationEnded: false };
}

/**
 * 按当前停止按钮可见性更新跟踪器。
 * 翻转语义：先观察到生成（observed=true），其后观察到不可见 → ended=true。
 */
export function trackGeneration(tracker, stopButtonVisibleNow) {
  if (stopButtonVisibleNow === true) tracker.generationObserved = true;
  if (tracker.generationObserved === true && stopButtonVisibleNow !== true) tracker.generationEnded = true;
  return tracker;
}

/**
 * 等待生成结束：轮询 isGenVisible()，直到 observed && ended。
 * 超过 deadlineMs 仍未确认结束 → 抛 Error(code=GENERATION_TIMEOUT)，携带最终 tracker。
 * @param {() => Promise<boolean>} isGenVisible 停止按钮可见性观察源
 * @param {{deadlineMs?: number, intervalMs?: number, sleep?: (ms:number)=>Promise<void>, now?: () => number, tracker?: object}} opts
 */
export async function waitForGenerationEnd(isGenVisible, opts = {}) {
  const deadlineMs = opts.deadlineMs ?? 300000; // 审查要求：300 秒上限
  const intervalMs = opts.intervalMs ?? 2000;
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const now = opts.now ?? Date.now;
  const tracker = opts.tracker ?? createGenerationTracker();
  const t0 = now();
  while (now() - t0 < deadlineMs) {
    const gen = await isGenVisible();
    trackGeneration(tracker, gen);
    if (tracker.generationEnded) return tracker;
    await sleep(intervalMs);
  }
  const err = new Error(`GENERATION_TIMEOUT: ${deadlineMs}ms 内未确认生成结束（observed=${tracker.generationObserved}, ended=${tracker.generationEnded}）`);
  err.code = "GENERATION_TIMEOUT";
  err.tracker = tracker;
  throw err;
}

/**
 * 最终完成判定：6 项条件必须全部满足，任何一项不满足都不能返回成功。
 * @param {{tracker: object, finalStopVisible: boolean, tailAfter: object|null, tailAgain: object|null, composerEmpty: boolean}} input
 * @returns {{confirmed: boolean, checks: object}} checks 逐项布尔值，写入结构化 evidence
 */
export function verifyCompletion({ tracker, finalStopVisible, tailAfter, tailAgain, composerEmpty }) {
  const checks = {
    generation_observed: tracker?.generationObserved === true,                 // 本轮确实观察到生成状态
    generation_ended: tracker?.generationEnded === true,                       // 已观察到生成状态结束（可见→不可见翻转）
    final_stop_button_not_visible: finalStopVisible === false,                 // 最终停止按钮不可见（确认窗后复查）
    tail_is_assistant: tailAfter?.role === "assistant",                        // 尾部为 assistant
    dil_uuid_present: typeof tailAfter?.assistantUuid === "string" && tailAfter.assistantUuid.length > 0, // UUID 存在
    uuid_stable: typeof tailAfter?.assistantUuid === "string" &&
      tailAfter.assistantUuid.length > 0 &&
      tailAfter.assistantUuid === tailAgain?.assistantUuid,                    // 两次读取一致
    composer_empty: composerEmpty === true,                                    // Composer 为空
  };
  const confirmed = Object.values(checks).every(Boolean);
  return { confirmed, checks };
}

/**
 * sendAndCollect 使用的判定入口：不满足即抛错（带逐项 checks），满足则返回结果。
 */
export function finalizeCompletion(input) {
  const { confirmed, checks } = verifyCompletion(input);
  if (!confirmed) {
    const failed = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
    const err = new Error(`COMPLETION_NOT_CONFIRMED: 未满足项 [${failed.join(", ")}]`);
    err.code = "COMPLETION_NOT_CONFIRMED";
    err.checks = checks;
    throw err;
  }
  return { confirmed, checks };
}

/**
 * 发送双验（R4 修复，回应第四轮审查 MAJOR：持续可见的"true→true"漏洞）：
 *
 * 可靠关联建立方式：preSendStopVisible 必须 === false（生产在 Enter 前实测：
 * 停止按钮不可见才允许发送——否则上一轮生成仍在进行，直接拒绝发送）。
 * 结合"同一会话同一时刻仅一个在途任务"纪律，Enter 之后任何停止按钮可见
 * 都必然由本轮发送引起——因此 tail 确认前/后的可见观察（含持续可见 true→true）
 * 都可安全归因于本轮，无需观测到"不可见→可见"的瞬时转换。
 *
 * 调用方若无法证明 preSendStopVisible===false，本函数 fail-closed 拒收。
 *
 * @param {{getTail: () => Promise<{role: string, key: string}|null>,
 *          isStopVisible: () => Promise<boolean>,
 *          preSendStopVisible: boolean,
 *          baselineKey: string|undefined,
 *          deadlineMs?: number, intervalMs?: number,
 *          sleep?: (ms:number)=>Promise<void>, now?: () => number}} p
 * @returns {{accepted: boolean, reason?: string, tailOk: boolean, stopOkAfterTail: boolean,
 *            stopSeenBeforeTail: number, stopObservationsAfterTail: number, polls: number, lastTail: object|null}}
 */
export async function verifySendAcceptance(p) {
  // R4：pre-send 生成门——无法证明发送瞬间停止按钮不可见，一律拒收
  if (p.preSendStopVisible !== false) {
    return { accepted: false, reason: "PRE_SEND_STOP_VISIBLE", tailOk: false, stopOkAfterTail: false, stopSeenBeforeTail: 0, stopObservationsAfterTail: 0, polls: 0, lastTail: null };
  }
  const deadlineMs = p.deadlineMs ?? 30000;
  const intervalMs = p.intervalMs ?? 1000;
  const sleep = p.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const now = p.now ?? Date.now;
  let tailOk = false;
  let stopOkAfterTail = false;
  let stopSeenBeforeTail = 0;   // tail 确认前观察到停止按钮的次数（发送后出现，属本轮；记录供审计）
  let stopObservationsAfterTail = 0;
  let polls = 0;
  let lastTail = null;
  const t0 = now();
  while (now() - t0 < deadlineMs) {
    polls++;
    const tail = await p.getTail();
    lastTail = tail;
    if (!tailOk && tail && tail.role === "user" && tail.key !== p.baselineKey) {
      tailOk = true; // 本轮 user 消息已确认出现在 DOM（key 前进）
    }
    const stopNow = await p.isStopVisible();
    if (tailOk) {
      stopObservationsAfterTail++;
      if (stopNow) stopOkAfterTail = true;
    } else if (stopNow) {
      stopSeenBeforeTail++;
    }
    if (tailOk && stopOkAfterTail) {
      return { accepted: true, tailOk, stopOkAfterTail, stopSeenBeforeTail, stopObservationsAfterTail, polls, lastTail };
    }
    await sleep(intervalMs);
  }
  return { accepted: false, reason: "SEND_ACCEPT_TIMEOUT", tailOk, stopOkAfterTail, stopSeenBeforeTail, stopObservationsAfterTail, polls, lastTail };
}
