// tab_hygiene.mjs 单元测试（b-20261116-tab-cleanup）：纯函数矩阵，零真浏览器。
// 正反例对应 task-brief §2 消歧/去重规则与"回复未采集不关"边界（close 仅由调用方
// 在采集完成后执行，纯函数层不提供 close —— 测试断言其不存在即可防误用）。
import assert from "node:assert/strict";
import { describePages, pickChatGptPage, dedupePlan, cleanupDecision } from "./tab_hygiene.mjs";

const CONV_A = "6afa0860-ab7c-83ec-8fce-260067e855cb";
const CONV_B = "91800300-0000-0000-0000-000000000000";

const pages = (urls) => urls.map((u) => ({ url: u }));
const HOME = "https://chatgpt.com/";
const conv = (u) => `https://chatgpt.com/c/${u}`;

const tests = [
  // ---- pickChatGptPage：指定会话（recoll 消歧）----
  ["指定会话多命中取最近创建（末位）", () => {
    const d = describePages(pages([conv(CONV_A), HOME, conv(CONV_A)]));
    const p = pickChatGptPage(d, { conversationUuid: CONV_A });
    assert.equal(p.index, 2);
  }],
  ["指定会话单命中返回该页", () => {
    const d = describePages(pages([HOME, conv(CONV_A)]));
    assert.equal(pickChatGptPage(d, { conversationUuid: CONV_A }).index, 1);
  }],
  ["指定会话零命中返回 null（调用方 newPage）", () => {
    const d = describePages(pages([HOME, conv(CONV_B)]));
    assert.equal(pickChatGptPage(d, { conversationUuid: CONV_A }), null);
  }],
  ["空页表返回 null", () => {
    assert.equal(pickChatGptPage(describePages([]), { conversationUuid: CONV_A }), null);
    assert.equal(pickChatGptPage(describePages([]), {}), null);
  }],
  ["同会话 UUID 大小写归一命中", () => {
    const d = describePages(pages([conv(CONV_A.toUpperCase())]));
    assert.equal(pickChatGptPage(d, { conversationUuid: CONV_A }).index, 0);
  }],
  // ---- pickChatGptPage：新会话派单（无 uuid；与既有 attachPage 语义一致）----
  ["无 uuid：返回数组序第一个 chatgpt 页（既有语义）", () => {
    const d = describePages(pages([HOME, conv(CONV_A), conv(CONV_B)]));
    assert.equal(pickChatGptPage(d, {}).index, 0);
  }],
  ["无 uuid：跳过非 chatgpt 页取首个 chatgpt 页", () => {
    const d = describePages(pages(["https://example.com", HOME]));
    assert.equal(pickChatGptPage(d, {}).index, 1);
  }],
  ["无 uuid：零 chatgpt 候选返回 null", () => {
    const d = describePages(pages(["https://example.com"]));
    assert.equal(pickChatGptPage(d, {}), null);
  }],
  // ---- dedupePlan：维护清理 ----
  ["同会话多 tab：留最近创建，关其余（均确权）", () => {
    const d = describePages([conv, conv, conv].map((f) => ({ url: f(CONV_A), owned: true })));
    const plan = dedupePlan(d);
    assert.deepEqual({ keep: plan.keep, close: plan.close }, { keep: [2], close: [1, 0] });
  }],
  ["不同会话各留一页", () => {
    const d = describePages([{ url: conv(CONV_A), owned: true }, { url: conv(CONV_B) }, { url: conv(CONV_A), owned: true }]);
    const plan = dedupePlan(d);
    assert.deepEqual({ keep: plan.keep, close: plan.close }, { keep: [2, 1], close: [0] });
  }],
  ["主页多个只留一个；非 chatgpt 页不进计划", () => {
    const d = describePages([{ url: HOME, owned: true }, { url: "https://example.com" }, { url: HOME, owned: true }, { url: conv(CONV_A) }]);
    const plan = dedupePlan(d);
    assert.deepEqual({ keep: plan.keep, close: plan.close }, { keep: [3, 2], close: [0] });
  }],
  ["全部唯一：close 为空", () => {
    const d = describePages(pages([conv(CONV_A), conv(CONV_B), HOME]));
    assert.deepEqual(dedupePlan(d).close, []);
  }],
  // ---- P2-02 扩容：生成中/未确权保护 ----
  ["生成中页永不进 close（P2-02 误关保护）", () => {
    const d = describePages([
      { url: conv(CONV_A), owned: true, generating: true },
      { url: conv(CONV_A), owned: true },
    ]);
    const plan = dedupePlan(d);
    assert.deepEqual(plan.close, []);
    assert.deepEqual(plan.skippedGenerating, [0]);
  }],
  ["未确权页进 skippedNotOwned 不进 close（P1-05 归属隔离）", () => {
    const d = describePages([
      { url: conv(CONV_A), owned: false },
      { url: conv(CONV_A), owned: false },
      { url: conv(CONV_A), owned: true },
    ]);
    const plan = dedupePlan(d);
    assert.deepEqual(plan.close, []);
    assert.deepEqual(plan.skippedNotOwned, [1, 0]);
  }],
  ["确权且非生成中的重复页才可关", () => {
    const d = describePages([
      { url: conv(CONV_A), owned: true },
      { url: conv(CONV_A), owned: true },
    ]);
    assert.deepEqual(dedupePlan(d).close, [0]);
  }],
  ["多候选并列 seq 相同按 index 大者（P1-02 可执行定义）", () => {
    const d = describePages([{ url: conv(CONV_A) }, { url: conv(CONV_A) }]);
    d[0].seq = 100; d[1].seq = 100;
    assert.equal(pickChatGptPage(d, { conversationUuid: CONV_A }).index, 1);
  }],
  // ---- S4-R1 P1-01：失败路径分类 ----
  ["Enter 后失败=保留现场（UNCERTAIN 禁关页）", () => {
    assert.equal(cleanupDecision({ sendAttempted: true }), "preserve_scene");
  }],
  ["发送前失败=仅关自建页（无发送证据）", () => {
    assert.equal(cleanupDecision({ sendAttempted: false }), "close_created_pages");
  }],
  // ---- 防误用边界 ----
  ["模块不导出任何 close/kill 函数（关闭动作只属调用方）", async () => {
    const m = await import("./tab_hygiene.mjs");
    const exportsWithClose = Object.keys(m).filter((k) => /close|kill/i.test(k));
    assert.deepEqual(exportsWithClose, []);
  }],
];

let failed = 0;
const results = [];
for (const [name, fn] of tests) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log("PASS", name);
  } catch (e) {
    failed += 1;
    results.push({ name, ok: false, error: String(e) });
    console.log("FAIL", name, "::", e.message);
  }
}
console.log(`total=${tests.length} pass=${tests.length - failed} fail=${failed}`);
process.exit(failed ? 1 : 0);
