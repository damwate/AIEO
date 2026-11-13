// AIEO Phase 0 返工 R2 — 生成完成判定反向测试
//
// 测试对象：completion_judge.mjs 的真实生产函数（sendAndCollect 调用的同一份代码），
// 通过依赖注入（sleep/now/isGenVisible）模拟页面状态序列。这不是伪造浏览器，
// 而是对判定代码本身的黑盒驱动测试；真实浏览器回归由 e2e 全链重跑承担（见报告）。
//
// 运行：node test_completion_judge.mjs
// 输出：逐场景 PASS/FAIL + logs/rework4-judge-tests.json；任何失败 exit 1。

import { strict as assert } from "node:assert";
import { writeFileSync } from "node:fs";
import {
  createGenerationTracker,
  trackGeneration,
  waitForGenerationEnd,
  verifyCompletion,
  finalizeCompletion,
  verifySendAcceptance,
} from "./completion_judge.mjs";

function makeFakeClock() {
  let t = 0;
  return { now: () => t, sleep: async (ms) => { t += ms; } };
}

const UUID_A = "11111111-2222-3333-4444-555555555555";
const UUID_B = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

const scenarios = [];
function record(name, pass, detail) {
  scenarios.push({ name, pass, detail });
  console.log(`[${pass ? "PASS" : "FAIL"}] ${name} — ${detail}`);
}

async function main() {
  // ---------- 场景 1：正常生成结束（含生产路径：双验已观察到停止按钮后首轮即翻转到不可见） ----------
  {
    const clock = makeFakeClock();
    const seq = [false]; // 双验阶段已见停止按钮（initialObserved=true），进入等待后首轮观察即已翻转
    const tracker = await waitForGenerationEnd(() => Promise.resolve(seq.shift() ?? false), {
      deadlineMs: 300000, intervalMs: 2000, ...clock,
      tracker: createGenerationTracker({ initialObserved: true }),
    });
    assert.equal(tracker.generationObserved, true);
    assert.equal(tracker.generationEnded, true);
    const { confirmed, checks } = finalizeCompletion({
      tracker, finalStopVisible: false,
      tailAfter: { role: "assistant", assistantUuid: UUID_A },
      tailAgain: { role: "assistant", assistantUuid: UUID_A },
      composerEmpty: true,
    });
    assert.equal(confirmed, true);
    record("1 正常生成结束", true, `tracker={observed:true,ended:true} confirmed=true, checks=${JSON.stringify(checks)}`);
  }

  // ---------- 场景 2：300 秒仍未结束 → GENERATION_TIMEOUT（真实执行轮询与超时分支） ----------
  {
    const clock = makeFakeClock();
    let polls = 0;
    let threw = null;
    try {
      await waitForGenerationEnd(() => { polls++; return Promise.resolve(true); }, {
        deadlineMs: 300000, intervalMs: 2000, ...clock,
        tracker: createGenerationTracker({ initialObserved: true }),
      });
    } catch (e) { threw = e; }
    assert.ok(threw, "必须抛出异常");
    assert.equal(threw.code, "GENERATION_TIMEOUT");
    assert.equal(threw.tracker.generationEnded, false);
    // 轮询次数 = 300000/2000 = 150 次后超时
    assert.equal(polls, 150, `实际轮询 ${polls} 次`);
    record("2 等待300秒仍未结束", true, `抛 GENERATION_TIMEOUT，轮询 ${polls} 次后按 deadline 终止，exit 路径=1`);
  }

  // ---------- 场景 3：最终停止按钮仍可见 → 不得判定完成 ----------
  {
    const tracker = { generationObserved: true, generationEnded: true };
    let threw = null;
    try {
      finalizeCompletion({
        tracker, finalStopVisible: true,
        tailAfter: { role: "assistant", assistantUuid: UUID_A },
        tailAgain: { role: "assistant", assistantUuid: UUID_A },
        composerEmpty: true,
      });
    } catch (e) { threw = e; }
    assert.ok(threw, "必须抛出异常");
    assert.equal(threw.code, "COMPLETION_NOT_CONFIRMED");
    assert.equal(threw.checks.final_stop_button_not_visible, false);
    record("3 最终停止按钮仍可见", true, `抛 COMPLETION_NOT_CONFIRMED，未满足项=[${Object.entries(threw.checks).filter(([, v]) => !v).map(([k]) => k).join(", ")}]`);
  }

  // ---------- 场景 4：assistant UUID 不稳定（两次读取不一致） → 不得判定完成 ----------
  {
    const tracker = { generationObserved: true, generationEnded: true };
    let threw = null;
    try {
      finalizeCompletion({
        tracker, finalStopVisible: false,
        tailAfter: { role: "assistant", assistantUuid: UUID_A },
        tailAgain: { role: "assistant", assistantUuid: UUID_B },
        composerEmpty: true,
      });
    } catch (e) { threw = e; }
    assert.ok(threw, "必须抛出异常");
    assert.equal(threw.code, "COMPLETION_NOT_CONFIRMED");
    assert.equal(threw.checks.uuid_stable, false);
    record("4 assistant UUID 不稳定", true, `抛 COMPLETION_NOT_CONFIRMED，uuid_stable=false`);
  }

  // ---------- 场景 5：Composer 非空 → 不得判定完成 ----------
  {
    const tracker = { generationObserved: true, generationEnded: true };
    let threw = null;
    try {
      finalizeCompletion({
        tracker, finalStopVisible: false,
        tailAfter: { role: "assistant", assistantUuid: UUID_A },
        tailAgain: { role: "assistant", assistantUuid: UUID_A },
        composerEmpty: false,
      });
    } catch (e) { threw = e; }
    assert.ok(threw, "必须抛出异常");
    assert.equal(threw.code, "COMPLETION_NOT_CONFIRMED");
    assert.equal(threw.checks.composer_empty, false);
    record("5 Composer 非空", true, `抛 COMPLETION_NOT_CONFIRMED，composer_empty=false`);
  }

  // ---------- 场景 6（附加，对应 everGenerating=true 问题的根修）：从未观察到生成状态 → 不得判定完成 ----------
  {
    const tracker = createGenerationTracker(); // observed=false（如：发送后停止按钮从未出现）
    trackGeneration(tracker, false);
    trackGeneration(tracker, false);
    const { confirmed, checks } = verifyCompletion({
      tracker, finalStopVisible: false,
      tailAfter: { role: "assistant", assistantUuid: UUID_A },
      tailAgain: { role: "assistant", assistantUuid: UUID_A },
      composerEmpty: true,
    });
    assert.equal(confirmed, false);
    assert.equal(checks.generation_observed, false);
    assert.equal(checks.generation_ended, false);
    record("6 从未观察到生成状态（everGenerating 硬编码问题的根修验证）", true, `confirmed=false，generation_observed/ended=false 被正确拒绝`);
  }

  // ---------- 场景 7（第三轮审查点名）：stopOk 提前出现（先于本轮 user 确认）不得污染 generationObserved ----------
  {
    // 时序：poll1 停止按钮已可见（历史/上一轮状态）但尾部仍是基线 → 只记录 stopSeenBeforeTail，不采用；
    //       poll2 本轮 user 消息确认（tailOk）且此时停止按钮不可见；
    //       poll3 tail 确认后重新观察到停止按钮可见 → stopOkAfterTail=true（唯一合法来源）。
    const clock = makeFakeClock();
    const tails = [
      { role: "user", key: "fallback-turn-0:0:user" },   // 基线尾部（== baselineKey，未前进）
      { role: "user", key: "fallback-turn-1:0:user" },   // 本轮消息前进 → tailOk
      { role: "user", key: "fallback-turn-1:0:user" },
    ];
    const stops = [true, false, true]; // 与三次轮询一一对应
    const acc = await verifySendAcceptance({
      getTail: () => Promise.resolve(tails.shift()),
      isStopVisible: () => Promise.resolve(stops.shift() ?? false),
      preSendStopVisible: false,
      baselineKey: "fallback-turn-0:0:user",
      deadlineMs: 30000, intervalMs: 1000, ...clock,
    });
    assert.equal(acc.accepted, true, "tail 确认后观察到停止按钮 → 应通过");
    assert.equal(acc.stopSeenBeforeTail, 1, "tail 前的停止按钮观察应被记录且排除");
    assert.equal(acc.stopOkAfterTail, true);
    // 以 stopOkAfterTail（而非 pre-tail 观察）初始化 tracker，随后首次观察即不可见 → 正常结束
    const tracker = await waitForGenerationEnd(() => Promise.resolve(false), {
      deadlineMs: 300000, intervalMs: 2000, ...clock,
      tracker: createGenerationTracker({ initialObserved: acc.stopOkAfterTail }),
    });
    assert.equal(tracker.generationObserved, true);
    assert.equal(tracker.generationEnded, true);
    record("7 stop 可见于 tail 确认之前（R4：pre-send 门下归因本轮，计数留痕）", true,
      `accepted=true，stopSeenBeforeTail=1 仅审计；generationObserved 依赖 preSendStopVisible=false 建立可靠关联`);
  }

  // ---------- 场景 8：停止按钮仅在 tail 确认前出现、tail 后再不可见 → 发送双验必须失败 ----------
  {
    const clock = makeFakeClock();
    const tails = [
      { role: "user", key: "fallback-turn-0:0:user" },  // poll1: 基线尾部，停止按钮可见（历史状态）
      { role: "user", key: "fallback-turn-1:0:user" },  // poll2: tail 前进，但停止按钮已不可见
      { role: "user", key: "fallback-turn-1:0:user" },
      { role: "user", key: "fallback-turn-1:0:user" },
    ];
    const stops = [true, false, false, false]; // poll1 可见（历史），tail 确认后从未再可见
    const acc = await verifySendAcceptance({
      getTail: () => Promise.resolve(tails.shift() ?? { role: "user", key: "fallback-turn-1:0:user" }),
      isStopVisible: () => Promise.resolve(stops.shift() ?? false),
      preSendStopVisible: false,
      baselineKey: "fallback-turn-0:0:user",
      deadlineMs: 5000, intervalMs: 1000, ...clock, // 缩短 deadline 加速测试，语义同 30s
    });
    assert.equal(acc.accepted, false, "tail 确认后无停止按钮观察 → 不得通过（fail-safe）");
    assert.equal(acc.stopOkAfterTail, false);
    assert.equal(acc.stopSeenBeforeTail, 1, "poll1 的历史可见被记录但排除");
    record("8 停止按钮仅在 tail 前出现，tail 后不可见 → 验收失败（UNCERTAIN，不误判成功）", true,
      `accepted=false；生产路径将抛错 exit 1，历史生成状态无法通过本轮判定`);
  }

  // ---------- 场景 9：正常顺序（tail 先确认，停止按钮随后出现） ----------
  {
    const clock = makeFakeClock();
    const tails = [
      { role: "user", key: "fallback-turn-1:0:user" },  // tail 立即前进
      { role: "user", key: "fallback-turn-1:0:user" },  // 随后停止按钮可见
    ];
    const stops = [false, true];
    const acc = await verifySendAcceptance({
      getTail: () => Promise.resolve(tails.shift() ?? tails[tails.length - 1]),
      isStopVisible: () => Promise.resolve(stops.shift() ?? true),
      preSendStopVisible: false,
      baselineKey: "fallback-turn-0:0:user",
      deadlineMs: 30000, intervalMs: 1000, ...clock,
    });
    assert.equal(acc.accepted, true);
    assert.equal(acc.stopSeenBeforeTail, 0, "无 pre-tail 观察");
    assert.equal(acc.stopOkAfterTail, true);
    record("9 正常顺序（tail 先确认，停止按钮随后出现）", true, `accepted=true，stop_seen_before_tail=0`);
  }

  // ---------- 场景 10（第四轮审查点名）：preSendStopVisible=true（无法证明发送前无生成）→ 必须拒收 ----------
  {
    const clock = makeFakeClock();
    const acc = await verifySendAcceptance({
      getTail: () => Promise.resolve({ role: "user", key: "fallback-turn-1:0:user" }),
      isStopVisible: () => Promise.resolve(true),   // 持续可见 true→true
      preSendStopVisible: true,                      // 发送前停止按钮已可见——无法建立本轮关联
      baselineKey: "fallback-turn-0:0:user",
      deadlineMs: 30000, intervalMs: 1000, ...clock,
    });
    assert.equal(acc.accepted, false, "pre-send 可见 → 必须拒收（true→true 不得直接接受）");
    assert.equal(acc.reason, "PRE_SEND_STOP_VISIBLE");
    assert.equal(acc.polls, 0, "拒收发生在任何轮询之前");
    record("10 preSendStopVisible=true（含 true→true 持续可见）→ 拒收", true,
      `reason=PRE_SEND_STOP_VISIBLE，polls=0；生产路径在 Enter 前即终止且不发送`);
  }

  // ---------- 场景 11：preSend=false 时 true→true 持续可见 → 合法接受（可靠关联语义） ----------
  {
    const clock = makeFakeClock();
    const tails = [
      { role: "user", key: "fallback-turn-0:0:user" },  // poll1: 尾部未前进，停止按钮已可见（本轮生成先于 tail 确认启动）
      { role: "user", key: "fallback-turn-1:0:user" },  // poll2: tail 确认，停止按钮持续可见
    ];
    const acc = await verifySendAcceptance({
      getTail: () => Promise.resolve(tails.shift() ?? tails[tails.length - 1]),
      isStopVisible: () => Promise.resolve(true),       // 持续可见
      preSendStopVisible: false,                         // Enter 前实测不可见（生产 pre-send 门保证）
      baselineKey: "fallback-turn-0:0:user",
      deadlineMs: 30000, intervalMs: 1000, ...clock,
    });
    assert.equal(acc.accepted, true, "pre-send 不可见基线 + 单任务纪律 => post-Enter 可见均属本轮");
    assert.equal(acc.stopSeenBeforeTail, 1, "tail 前的可见被计数留痕（属本轮）");
    assert.equal(acc.stopOkAfterTail, true);
    record("11 preSend=false 时 true→true 持续可见 → 合法接受", true,
      `可靠关联由 pre-send 不可见基线建立（审查建议的路径一），无需观测瞬时转换`);
  }

  const allPass = scenarios.every((s) => s.pass);
  const out = {
    test_target: "phase0/e2e-poc/completion_judge.mjs（生产判定函数，sendAndCollect 同源）",
    method: "依赖注入（fake clock / isGenVisible 序列）黑盒驱动真实代码；浏览器异常注入未在真实 Chrome 上模拟，见报告未实测声明",
    executed_at: new Date().toISOString(),
    all_pass: allPass,
    scenarios,
  };
  writeFileSync(new URL("./../logs/rework4-judge-tests.json", import.meta.url), JSON.stringify(out, null, 2), "utf8");
  console.log(allPass ? "JUDGE TESTS: ALL PASS" : "JUDGE TESTS: HAS FAIL");
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => {
  console.error("测试框架自身异常:", e);
  record("测试框架异常", false, String(e.message || e));
  writeFileSync(new URL("./../logs/rework4-judge-tests.json", import.meta.url),
    JSON.stringify({ all_pass: false, scenarios, framework_error: String(e.message || e) }, null, 2), "utf8");
  process.exit(1);
});
