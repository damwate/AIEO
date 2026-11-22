// test_ctx_budget_hooks.mjs — 派单预算门/记账钩子故障注入测试（CTX-CODE R5 P1-2）
// 验证 gpt_dispatch 实际使用的 ctx_budget_hooks 导出函数在故障注入下的阻断语义。
// 运行：node --test phase0/tools/test_ctx_budget_hooks.mjs
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { assessBudgetGate, recordInTurn, recordOutTurn } from "./ctx_budget_hooks.mjs";

function fakeBudget({ assess = () => ({ state: "NORMAL", totals: { totalBytes: 0 }, thresholds: { warnBytes: 24576, hardBytes: 49152 } }), recordTurn = () => {}, markUncertain = () => {} } = {}) {
  return { assessLedger: assess, recordTurn, markUncertain };
}
const logLines = () => { const lines = []; return { log: (m) => lines.push(m), lines }; };

describe("assessBudgetGate 预检门", () => {
  test("UNCERTAIN 标记 → 拒发，且 --allow-near-limit 不绕过", () => {
    const sb = fakeBudget({ assess: () => ({ state: "UNCERTAIN", totals: { totalBytes: 999 }, thresholds: { warnBytes: 24576, hardBytes: 49152 } }) });
    assert.throws(() => assessBudgetGate("uuid-x", { sessionBudget: sb, allowNearLimit: true }), /SESSION_BUDGET_UNCERTAIN/);
    assert.throws(() => assessBudgetGate("uuid-x", { sessionBudget: sb, allowNearLimit: false }), /SESSION_BUDGET_UNCERTAIN/);
  });
  test("HARD → 拒发；--allow-near-limit 显式放行（留痕）", () => {
    const sb = fakeBudget({ assess: () => ({ state: "HARD", totals: { totalBytes: 50000 }, thresholds: { warnBytes: 24576, hardBytes: 49152 } }) });
    assert.throws(() => assessBudgetGate("uuid-x", { sessionBudget: sb, allowNearLimit: false }), /SESSION_BUDGET_EXCEEDED/);
    const { log, lines } = logLines();
    const v = assessBudgetGate("uuid-x", { sessionBudget: sb, allowNearLimit: true, log });
    assert.equal(v.state, "HARD");
    assert.ok(lines.join("\n").includes("allow-near-limit"));
  });
  test("账本读取异常 → SESSION_BUDGET_UNCERTAIN（fail-closed）", () => {
    const sb = fakeBudget({ assess: () => { throw new Error("LEDGER_UNREADABLE: broken"); } });
    assert.throws(() => assessBudgetGate("uuid-x", { sessionBudget: sb }), /SESSION_BUDGET_UNCERTAIN/);
  });
  test("NORMAL → 通过并返回 verdict", () => {
    const sb = fakeBudget();
    const v = assessBudgetGate("uuid-x", { sessionBudget: sb });
    assert.equal(v.state, "NORMAL");
  });
});

describe("recordInTurn / recordOutTurn 记账钩子", () => {
  test("记账成功 → 无异常", () => {
    const sb = fakeBudget();
    assert.doesNotThrow(() => recordInTurn("uuid-x", 500, { sessionBudget: sb }));
    assert.doesNotThrow(() => recordOutTurn("uuid-x", 1200, { sessionBudget: sb, evDir: "E:/ev" }));
  });
  test("input 记账失败 → markUncertain 落盘，不中止（证据优先）", () => {
    let marked = null;
    const sb = fakeBudget({ recordTurn: () => { throw new Error("LEDGER_BUSY_TIMEOUT: injected"); }, markUncertain: (u, r) => { marked = { u, r }; } });
    recordInTurn("uuid-x", 500, { sessionBudget: sb });
    assert.match(marked.r, /in_record_failed.*LEDGER_BUSY_TIMEOUT/);
    assert.equal(marked.u, "uuid-x");
  });
  test("input 记账失败且标记写入失败 → SESSION_BUDGET_MARK_FAILED 中止派单", () => {
    const sb = fakeBudget({
      recordTurn: () => { throw new Error("LEDGER_BUSY_TIMEOUT: injected"); },
      markUncertain: () => { throw new Error("disk_full: injected"); },
    });
    assert.throws(() => recordInTurn("uuid-x", 500, { sessionBudget: sb }), /SESSION_BUDGET_MARK_FAILED.*disk_full/);
  });
  test("out 记账失败 → markUncertain；标记写入失败 → MARK_FAILED（证据目录引用）", () => {
    const sb = fakeBudget({
      recordTurn: () => { throw new Error("LEDGER_COMMIT_UNCERTAIN: injected"); },
      markUncertain: () => { throw new Error("disk_full: injected"); },
    });
    assert.throws(() => recordOutTurn("uuid-x", 1200, { sessionBudget: sb, evDir: "D:/ev/dir" }), /SESSION_BUDGET_MARK_FAILED.*D:\/ev\/dir.*LEDGER_COMMIT_UNCERTAIN/);
  });
});
