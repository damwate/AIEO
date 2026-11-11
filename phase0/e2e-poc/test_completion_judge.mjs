// AIEO Phase 0 返工 R2 — 生成完成判定反向测试
//
// 测试对象：completion_judge.mjs 的真实生产函数（sendAndCollect 调用的同一份代码），
// 通过依赖注入（sleep/now/isGenVisible）模拟页面状态序列。这不是伪造浏览器，
// 而是对判定代码本身的黑盒驱动测试；真实浏览器回归由 e2e 全链重跑承担（见报告）。
//
// 运行：node test_completion_judge.mjs
// 输出：逐场景 PASS/FAIL + logs/rework2-judge-tests.json；任何失败 exit 1。

import { strict as assert } from "node:assert";
import { writeFileSync } from "node:fs";
import {
  createGenerationTracker,
  trackGeneration,
  waitForGenerationEnd,
  verifyCompletion,
  finalizeCompletion,
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

  const allPass = scenarios.every((s) => s.pass);
  const out = {
    test_target: "phase0/e2e-poc/completion_judge.mjs（生产判定函数，sendAndCollect 同源）",
    method: "依赖注入（fake clock / isGenVisible 序列）黑盒驱动真实代码；浏览器异常注入未在真实 Chrome 上模拟，见报告未实测声明",
    executed_at: new Date().toISOString(),
    all_pass: allPass,
    scenarios,
  };
  writeFileSync(new URL("./../logs/rework2-judge-tests.json", import.meta.url), JSON.stringify(out, null, 2), "utf8");
  console.log(allPass ? "JUDGE TESTS: ALL PASS" : "JUDGE TESTS: HAS FAIL");
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => {
  console.error("测试框架自身异常:", e);
  record("测试框架异常", false, String(e.message || e));
  writeFileSync(new URL("./../logs/rework2-judge-tests.json", import.meta.url),
    JSON.stringify({ all_pass: false, scenarios, framework_error: String(e.message || e) }, null, 2), "utf8");
  process.exit(1);
});
