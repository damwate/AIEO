// M2 浏览器仿真测试（真实执行，本地 DOM fixture + 虚拟时钟，不连 chatgpt.com、不依赖登录）：
// ③ verifySendAcceptance 反向门（preSendStopVisible=true 拒发）与严格时序
// ④ 生成超时 GENERATION_TIMEOUT（不重发语义）
// ⑧ 会话上限检测 → CONTEXT_LIMIT_STOP → GitPointer 交接轮换 → 全新空白会话
// 另含：全管线派单 happy path（登记/不登记）、回复 >1200 字节（入站不受限）、
//       两次读取不一致 fail-closed、DOM 契约自检失败禁止盲发、出站超限接触浏览器前拒绝、
//       可滚动虚拟列表的分窗拼接（独立逻辑序列证明 / UNPROVEN fail-closed）。

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { runDispatch } from "../src/dispatch.mjs";
import { assertPreSendGate, insertAndVerifyComposer, verifySendAcceptance, sendWithAcceptance } from "../src/send_acceptance.mjs";
import { waitForGenerationEnd } from "../src/generation.mjs";
import { detectContextLimit, stopIfContextLimit, rotateIfContextLimit, beginFreshBlankSession, CONTEXT_LIMIT_MARKER } from "../src/context_limit.mjs";
import { readReplySnapshot } from "../src/dom_view.mjs";
import { SessionStore } from "../src/session_store.mjs";
import { buildGitPointerManifest, createGitPointer } from "../src/git_pointer.mjs";
import {
  ASSISTANT_UUID,
  CHATGPT_HOME,
  SESSION_URL,
  VALID_IDS,
  assertRejectsWith,
  baseSessionUnits,
  cleanupTempDir,
  createFixturePage,
  fakeLock,
  loadFixtureHtml,
  newTempDir,
  replyScript,
  sessionHtml,
} from "./helpers.mjs";

const REPLY_SCHEMA_PATH = fileURLToPath(new URL("./fixtures/reply.schema.json", import.meta.url));
const REPLY_JSON = JSON.stringify({ status: "SUCCESS", ...VALID_IDS, summary: "审查完成：模块边界与平台契约一致" });

// 非滚动小会话（2 个初始 unit，viewport 4）；发送后共 4 个 unit。
// extraAssistants 追加额外 assistant unit，专供 DEC-017 扩展门禁负例（默认空，保持单 unit 核心路径）；
// viewportUnits 同步放大可让多 unit 页面保持静态不可滚动，避免采集层完整性错误先于门禁触发。
function smallScenario({ replyText = REPLY_JSON, mutateAtMs = null, onSend = null, extraAssistants = [], viewportUnits = 4 } = {}) {
  const events = { sendCalled: 0, sentText: null };
  const page = createFixturePage({
    html: sessionHtml({ units: baseSessionUnits() }),
    viewportUnits,
    onSend: onSend ?? (({ text, page: p }) => {
      events.sendCalled += 1;
      events.sentText = text;
      replyScript({ replyText, mutateAtMs, extraAssistants })({ text, page: p });
    }),
  });
  return { page, events };
}

function dispatchConfig(tmpDir) {
  return {
    runtimeDir: tmpDir,
    generationTimeoutMs: 60000,
    confirmWindowMs: 1000,
    stableReadIntervalMs: 3000,
    sendAcceptTimeoutMs: 15000,
    pollIntervalMs: 500,
  };
}

// ---------- ③ pre-send 反向门与严格时序 ----------

test("③ 反向门：preSendStopVisible=true 时拒绝发送（PRE_SEND_GENERATION_ACTIVE）", async () => {
  const { page, events } = smallScenario();
  page.setGenerating(true); // 上一轮生成仍在进行
  await assertRejectsWith((async () => assertPreSendGate(page))(), "PRE_SEND_GENERATION_ACTIVE");
  assert.equal(await page.composerText(), "");
  assert.equal(page.allUnits.length, 2);
  assert.equal(events.sendCalled, 0);

  // 完整派单同样在门前失败：不插入、不回车、不追加任何 unit。
  const tmp = newTempDir("gptc-gate");
  try {
    await assertRejectsWith(
      runDispatch({
        view: page,
        message: "审查 §2",
        configOverrides: dispatchConfig(tmp),
        lock: fakeLock(),
      }),
      "PRE_SEND_GENERATION_ACTIVE",
    );
    assert.equal(events.sendCalled, 0);
    assert.equal(await page.composerText(), "");
    assert.equal(page.allUnits.length, 2);
  } finally {
    cleanupTempDir(tmp);
  }
});

test("③ 严格时序：停止按钮先于新 user unit 可见不计数；tail 确认后才验收", async () => {
  // 停止按钮 600ms 出现，user unit 1200ms 才出现：双验必须等到 tail 确认后的 stop 观察。
  const page = createFixturePage({
    html: sessionHtml({ units: baseSessionUnits() }),
    onSend: ({ page: p }) => {
      p.at(600, (q) => q.setGenerating(true));
      p.at(1200, (q) => {
        q.appendUnit({ key: "u1000:user", role: "user", text: "本次派单" });
        q.scrollToBottom();
      });
    },
  });
  const baseline = await page.readTailUnit();
  assert.equal(baseline.key, "a0002:assistant");
  await page.focusComposer();
  await page.insertComposerText("审查 §2");
  await page.pressEnter();
  const acceptance = await verifySendAcceptance({ view: page, baselineKey: baseline.key, sendAcceptTimeoutMs: 15000, pollIntervalMs: 500 });
  assert.equal(acceptance.ok, true);
  assert.equal(acceptance.user_unit_key, "u1000:user");
  assert.ok(acceptance.polls >= 3, `应至少轮询 3 次（实际 ${acceptance.polls}）`);
  assert.equal(acceptance.stop_observed_after_tail, true);
});

test("③ 严格时序：停止按钮可见但始终无新 user unit → SEND_ACCEPTANCE_UNCERTAIN（不重发）", async () => {
  const page = createFixturePage({
    html: sessionHtml({ units: baseSessionUnits() }),
    onSend: ({ page: p }) => {
      p.at(600, (q) => q.setGenerating(true)); // 只出现停止按钮，user unit 永不出现
    },
  });
  const baseline = await page.readTailUnit();
  await page.insertComposerText("审查 §2");
  await page.pressEnter();
  const error = await assertRejectsWith(
    verifySendAcceptance({ view: page, baselineKey: baseline.key, sendAcceptTimeoutMs: 3000, pollIntervalMs: 500 }),
    "SEND_ACCEPTANCE_UNCERTAIN",
  );
  assert.equal(error.details.tail_ok, false);
  assert.equal(error.details.stop_ok_after_tail, false);
});

test("③ 发送双验一站式：插入回读一致 → Enter → 验收回执", async () => {
  const { page } = smallScenario({ replyText: "收到，开始审查。" });
  const baseline = await page.readTailUnit();
  const { send_receipt } = await sendWithAcceptance({ view: page, text: "审查 §2", baselineKey: baseline.key, sendAcceptTimeoutMs: 15000, pollIntervalMs: 500 });
  assert.equal(send_receipt.ok, true);
  assert.equal(send_receipt.pre_send_stop_visible, false);
  assert.equal(send_receipt.composer_readback_verified, true);
  assert.equal(send_receipt.user_unit_key, "u1000:user");
  // pressEnter 已清空 composer；user unit 已入 DOM。
  assert.equal(await page.composerText(), "");
  assert.equal(page.allUnits.length, 3);

  // composer 回读不一致 → 拒发（不 Enter）：插入后页面侧篡改内容。
  const page2 = createFixturePage({ html: sessionHtml({ units: baseSessionUnits() }) });
  const originalInsert = page2.insertComposerText.bind(page2);
  page2.insertComposerText = async (text) => {
    await originalInsert(text);
    page2.composerValue = "被页面篡改的文本";
    page2.doc.querySelector('[aria-label="Ask ChatGPT"]').setText("被页面篡改的文本");
  };
  await assertRejectsWith((async () => insertAndVerifyComposer(page2, "原文本"))(), "COMPOSER_READBACK_MISMATCH");
  assert.equal(page2.allUnits.length, 2); // 未曾 Enter，无新 user unit
});

test("③ 生成等待：观察生成 → 结束；从未观察即结束也要求先观察", async () => {
  const { page } = smallScenario();
  const baseline = await page.readTailUnit();
  await sendWithAcceptance({ view: page, text: "审查 §2", baselineKey: baseline.key, sendAcceptTimeoutMs: 15000, pollIntervalMs: 500 });
  const generation = await waitForGenerationEnd({ view: page, generationObserved: true, generationTimeoutMs: 60000 });
  assert.equal(generation.generation_observed, true);
  assert.equal(generation.generation_ended, true);
});

// ---------- ④ 生成超时 ----------

test("④ 生成超时：300s 窗口内未确认生成结束 → GENERATION_TIMEOUT（gpt_resend_required=false）", async () => {
  const events = { sendCalled: 0 };
  const page = createFixturePage({
    html: sessionHtml({ units: baseSessionUnits() }),
    onSend: ({ page: p }) => {
      events.sendCalled += 1;
      p.at(600, (q) => {
        q.appendUnit({ key: "u1000:user", role: "user", text: "本次派单" });
        q.scrollToBottom();
        q.setGenerating(true); // 生成永不结束
      });
    },
  });
  const tmp = newTempDir("gptc-timeout");
  try {
    const error = await assertRejectsWith(
      runDispatch({
        view: page,
        message: "审查 §2",
        configOverrides: { ...dispatchConfig(tmp), generationTimeoutMs: 5000 },
        lock: fakeLock(),
      }),
      "GENERATION_TIMEOUT",
    );
    assert.equal(error.details.generation_observed, true);
    assert.equal(error.details.gpt_resend_required, false);
    assert.equal(events.sendCalled, 1);
  } finally {
    cleanupTempDir(tmp);
  }
});

// ---------- ⑧ 上下文上限检测与轮换 ----------

function buildTestPointer() {
  const built = buildGitPointerManifest({
    task_id: VALID_IDS.task_id,
    execution_id: VALID_IDS.execution_id,
    files: [{ path: "tasks/T-P1-001/brief.md", content: "# 轮换交接材料\n" }],
  });
  const pointer = createGitPointer({
    owner: "acme-lab",
    repo: "aieo-materials",
    branch: "main",
    commit_sha: "b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1",
    path: "tasks/T-P1-001/manifest.json",
    manifestBytes: built.manifestBytes,
  });
  return pointer;
}

test("⑧ 上限检测：横幅文本命中即 CONTEXT_LIMIT_STOP；无横幅持续检测后放行", async () => {
  assert.equal(CONTEXT_LIMIT_MARKER, "上下文窗口已达上限");
  assert.equal(detectContextLimit("说明：上下文窗口已达上限，无法继续。"), true);
  assert.equal(detectContextLimit("正常回复正文"), false);

  // 横幅延迟 1000ms 出现：持续检测窗口内命中。
  const page = createFixturePage({ html: sessionHtml({ units: baseSessionUnits() }) });
  page.at(1000, (p) => p.setContextLimitBanner(true));
  await assertRejectsWith(stopIfContextLimit({ view: page, detectWindowMs: 5000, pollIntervalMs: 500 }), "CONTEXT_LIMIT_STOP");

  // 无横幅：检测窗口耗尽后返回 false（不误报）。
  const calm = createFixturePage({ html: sessionHtml({ units: baseSessionUnits() }) });
  assert.equal(await stopIfContextLimit({ view: calm, detectWindowMs: 5000, pollIntervalMs: 500 }), false);
});

test("⑧ 派单前上限检测：横幅出现 → 拒绝派单且不发送", async () => {
  const { page, events } = smallScenario();
  page.at(1000, (p) => p.setContextLimitBanner(true));
  const tmp = newTempDir("gptc-limit");
  try {
    await assertRejectsWith(
      runDispatch({ view: page, message: "审查 §2", configOverrides: dispatchConfig(tmp), lock: fakeLock() }),
      "CONTEXT_LIMIT_STOP",
    );
    assert.equal(events.sendCalled, 0);
  } finally {
    cleanupTempDir(tmp);
  }
});

test("⑧ 轮换执行：GitPointer 交接 + 旧轮已终结 → 跳转主页开全新空白会话", async () => {
  const tmp = newTempDir("gptc-rotate");
  try {
    const store = new SessionStore({ filePath: join(tmp, "sessions.json") });
    const session = store.create({ agent_id: "M2-R1", session_url: SESSION_URL });
    store.stop(session.session_id, "CONTEXT_LIMIT_STOP");

    const homeHtml = loadFixtureHtml("chatgpt-home-blank.html");
    const page = createFixturePage({
      html: sessionHtml({ units: baseSessionUnits(), filler: "x".repeat(50) }),
      pages: { [CHATGPT_HOME]: homeHtml },
    });

    const outcome = await rotateIfContextLimit({
      sessionStore: store,
      sessionId: session.session_id,
      view: page,
      handoff: { git_pointer: buildTestPointer() },
      oldRoundEvidence: { resolved: true, state: "GENERATION_ENDED" },
    });
    assert.equal(outcome.decision, "ROTATE_TO_FRESH_BLANK_SESSION");
    assert.equal(outcome.new_session.status, "ACTIVE");
    assert.equal(outcome.new_session.rotated_from_session_id, session.session_id);
    assert.equal(outcome.new_session.session_url, null);
    assert.equal(page.navigatedTo, CHATGPT_HOME);
    assert.equal(store.get(session.session_id).status, "EXPIRED");

    // 新会话页面确实是全新空白：无 user unit、composer 就绪、body 文本充分。
    const probe = await beginFreshBlankSession({ view: page, homeUrl: CHATGPT_HOME });
    assert.equal(probe.ready, true);
    assert.equal(probe.user_units, 0);
    assert.equal(probe.composer_present, true);
  } finally {
    cleanupTempDir(tmp);
  }
});

test("⑧ 轮换决策 fail-closed：摘要交接/旧轮未终结 → BLOCKED 且不做任何页面动作", async () => {
  const tmp = newTempDir("gptc-rotate-blocked");
  try {
    const store = new SessionStore({ filePath: join(tmp, "sessions.json") });
    const session = store.create({ agent_id: "M2-R2" });
    store.stop(session.session_id, "CONTEXT_LIMIT_STOP");
    const page = createFixturePage({ html: sessionHtml({ units: baseSessionUnits() }) });

    const summaryBlocked = await rotateIfContextLimit({
      sessionStore: store,
      sessionId: session.session_id,
      view: page,
      handoff: { git_pointer: buildTestPointer(), summary: "旧会话摘要（禁止继承）" },
      oldRoundEvidence: { resolved: true, state: "GENERATION_ENDED" },
    });
    assert.equal(summaryBlocked.decision, "BLOCKED");
    assert.equal(summaryBlocked.code, "GIT_HANDOFF_REQUIRED_NO_SUMMARY");
    assert.equal(summaryBlocked.new_session, null);
    assert.equal(page.navigatedTo, undefined);

    const unresolved = await rotateIfContextLimit({
      sessionStore: store,
      sessionId: session.session_id,
      view: page,
      handoff: { git_pointer: buildTestPointer() },
      oldRoundEvidence: { resolved: false, state: "SENT" },
    });
    assert.equal(unresolved.decision, "BLOCKED");
    assert.equal(unresolved.code, "ROTATION_OLD_ROUND_UNRESOLVED");
    assert.equal(page.navigatedTo, undefined);
  } finally {
    cleanupTempDir(tmp);
  }
});

// ---------- 全管线派单（仿真页端到端） ----------

test("全管线（不登记）：发送双验 → 生成 → 确认窗 → 两次读取 → artifact 落盘回读 → 完成判定全绿", async () => {
  const { page, events } = smallScenario({
    replyText: `审查结论：${"模块边界与平台契约逐项一致，".repeat(120)}`, // 远超 1200 字节，证明入站不受出站上限约束
  });
  const tmp = newTempDir("gptc-e2e");
  try {
    const result = await runDispatch({
      view: page,
      message: "请审查模块边界文档 §2 并给出结论。",
      configOverrides: dispatchConfig(tmp),
      lock: fakeLock(),
      outputDir: tmp,
    });
    assert.equal(events.sendCalled, 1);
    assert.equal(Object.values(result.completion_checks).every(Boolean), true);
    assert.equal(result.send_receipt.ok, true);
    assert.equal(result.send_receipt.pre_send_stop_visible, false);
    assert.equal(result.generation.generation_ended, true);
    assert.equal(result.stability.stable, true);
    assert.equal(result.user_unit_key, "u1000:user");
    assert.deepEqual(result.unit_keys, ["a1001:assistant"]);
    assert.ok(Buffer.byteLength(result.reply, "utf8") > 1200, "入站回复必须不受 1200 字节出站上限约束");
    assert.equal(result.json_schema_binding.status, "NOT_REQUESTED");
    assert.equal(result.m1_registration.status, "NOT_REQUESTED");
    assert.equal(result.conversation_url, SESSION_URL);
    assert.ok(existsSync(result.reply_path));
    assert.ok(existsSync(result.raw_units_path));

    // 出站消息全文落盘（审计）。
    assert.ok(existsSync(join(tmp, result.dispatch_id, "request.txt")));
    assert.ok(existsSync(join(tmp, result.dispatch_id, "result.json")));
  } finally {
    cleanupTempDir(tmp);
  }
});

test("全管线（M1 登记）：三 ID + Schema 绑定 + 回读 artifact 登记 REGISTERED + 会话 URL 捕获", async () => {
  const { page } = smallScenario();
  const tmp = newTempDir("gptc-e2e-m1");
  try {
    const store = new SessionStore({ filePath: join(tmp, "sessions.json") });
    const session = store.create({ agent_id: "M2-R3" });
    const result = await runDispatch({
      view: page,
      message: "请按指定 Schema 输出审查结论。",
      ids: VALID_IDS,
      schemaPath: REPLY_SCHEMA_PATH,
      registerM1: true,
      sessionStore: store,
      sessionId: session.session_id,
      configOverrides: dispatchConfig(tmp),
      lock: fakeLock(),
      outputDir: tmp,
    });
    assert.equal(Object.values(result.completion_checks).every(Boolean), true);
    assert.equal(result.json_schema_binding.status, "PASS");
    assert.equal(result.json_schema_binding.binding.task_id, "PASS");
    assert.equal(result.m1_registration.status, "REGISTERED");
    assert.equal(result.m1_registration.adapter_scope, "MINIMAL_LOCAL_M1_NOT_FULL_PLATFORM");
    assert.deepEqual(result.m1_registration.attempts, [{ attempt: 1, result: "SUCCESS" }]);
    assert.equal(result.session_id, "3f2a7b8c-1c41-4091-817f-7b7c0f3f314a"); // 会话 URL 中的 /c/<uuid>，非本地登记 id
    assert.equal(result.conversation_url, SESSION_URL);
    assert.equal(store.get(session.session_id).in_flight_dispatch_id, null);

    // 登记簿内容核对。
    const registry = JSON.parse(readFileSync(join(tmp, "m1-artifact-registry.json"), "utf8"));
    assert.equal(registry.records.length, 1);
    assert.equal(registry.records[0].task_id, VALID_IDS.task_id);
    assert.equal(registry.records[0].artifact_kind, "GPT_SCHEMA_VALIDATED_JSON");
    assert.equal(registry.records[0].content, REPLY_JSON);
  } finally {
    cleanupTempDir(tmp);
  }
});

test("全管线：两次完整读取之间回复被改写 → INBOUND_UNSTABLE_READ fail-closed，不写成功结果", async () => {
  const { page, events } = smallScenario({ mutateAtMs: 5000 }); // 第一次读取 ≈4000ms，第二次 ≈7000ms
  const tmp = newTempDir("gptc-e2e-unstable");
  try {
    const error = await assertRejectsWith(
      runDispatch({
        view: page,
        message: "请审查模块边界文档 §2 并给出结论。",
        configOverrides: dispatchConfig(tmp),
        lock: fakeLock(),
        outputDir: tmp,
      }),
      "INBOUND_UNSTABLE_READ",
    );
    assert.equal(error.details.checks.unit_text_hashes_equal, false);
    assert.equal(error.details.checks.unit_key_list_equal, true);
    assert.equal(events.sendCalled, 1);
    // 不写成功结果。
    assert.ok(!existsSync(join(tmp, "result.json")));
  } finally {
    cleanupTempDir(tmp);
  }
});

test("全管线：DEC-017 多 assistant unit 扩展门禁 → INBOUND_MULTI_UNIT_EXTENSION_GATE_BLOCKED fail-closed，不写成功结果", async () => {
  // 真实路径 readReplySnapshot 默认 maxAssistantUnits=1（T-P1-901 F-001），多 assistant unit 在第一次读取即被拦截。
  const { page, events } = smallScenario({
    viewportUnits: 8, // 6 unit 全可见、静态不可滚动，确保失败点在门禁而非采集完整性
    extraAssistants: [
      { key: "a1002:assistant", text: "（额外 assistant unit，超出已验收核心路径）", assistantUuid: "aaaaaaaa-0000-4000-8000-000000001002" },
      { key: "a1003:assistant", text: "（额外 assistant unit 2）", assistantUuid: "aaaaaaaa-0000-4000-8000-000000001003" },
    ],
  });
  const tmp = newTempDir("gptc-e2e-multigate");
  try {
    const error = await assertRejectsWith(
      runDispatch({
        view: page,
        message: "请审查模块边界文档 §2 并给出结论。",
        configOverrides: dispatchConfig(tmp),
        lock: fakeLock(),
        outputDir: tmp,
      }),
      "INBOUND_MULTI_UNIT_EXTENSION_GATE_BLOCKED",
    );
    assert.equal(error.details.unit_count, 3);
    assert.equal(error.details.max_assistant_units, 1);
    assert.equal(error.details.decision, "DEC-017");
    assert.equal(events.sendCalled, 1);
    // 不写成功结果。
    assert.ok(!existsSync(join(tmp, "result.json")));
  } finally {
    cleanupTempDir(tmp);
  }
});

test("全管线：上游门禁被放宽（deps 注入模拟失效）→ dispatch 收敛点仍 fail-closed（T-P1-901 F-101 纵深防御）", async () => {
  const { page, events } = smallScenario({
    viewportUnits: 8,
    extraAssistants: [
      { key: "a1002:assistant", text: "（额外 assistant unit，超出已验收核心路径）", assistantUuid: "aaaaaaaa-0000-4000-8000-000000001002" },
      { key: "a1003:assistant", text: "（额外 assistant unit 2）", assistantUuid: "aaaaaaaa-0000-4000-8000-000000001003" },
    ],
  });
  // 注入放宽版 reader（等价于上游 selectInboundReply(maxAssistantUnits=8) 的产物）：
  // 第一/二层门禁被绕过，dispatch 最终防线必须仍拦截多 unit 快照。
  const relaxedReader = (view, userUnitKey, opts) => readReplySnapshot(view, userUnitKey, { ...opts, maxAssistantUnits: 8 });
  const tmp = newTempDir("gptc-e2e-finalgate");
  try {
    const error = await assertRejectsWith(
      runDispatch({
        view: page,
        message: "请审查模块边界文档 §2 并给出结论。",
        configOverrides: dispatchConfig(tmp),
        lock: fakeLock(),
        outputDir: tmp,
        readReplySnapshot: relaxedReader,
      }),
      "INBOUND_MULTI_UNIT_EXTENSION_GATE_BLOCKED",
    );
    assert.equal(error.details.unit_count, 3);
    assert.equal(error.details.max_assistant_units, 1);
    assert.equal(error.details.decision, "DEC-017");
    assert.equal(events.sendCalled, 1);
    // 不写成功结果。
    assert.ok(!existsSync(join(tmp, "result.json")));
  } finally {
    cleanupTempDir(tmp);
  }
});

test("全管线：内部矛盾快照（unit_keys/unit_count 不一致）骗过稳定性比较 → 最终防线 INBOUND_REPLY_SNAPSHOT_MALFORMED", async () => {
  const { page, events } = smallScenario();
  // 手搓快照满足稳定性比较的全部相等性检查，但 unit_keys 与 unit_count 内部矛盾——
  // 证明最终防线对畸形快照不给绕过空间（T-P1-901 F-101 recommendation：非法快照不得绕过门禁）。
  const contradictory = () => ({
    user_unit_key: "u1000:user",
    next_user_unit_key: null,
    unit_keys: ["a1001:assistant"], // 仅 1 个 key
    unit_count: 3, // 宣称 3 个 —— 内部矛盾
    assistant_uuid: ASSISTANT_UUID,
    units: [1, 2, 3].map((i) => ({ key: `a100${i}:assistant`, role: "assistant", text: `t${i}`, text_sha256: `h${i}`, size_bytes: 2, assistantUuid: ASSISTANT_UUID })),
    reply: "t1\nt2\nt3",
    range_proof: { complete: true, end_reason: "DOM_BOTTOM" },
    read_started_at: new Date().toISOString(),
    read_finished_at: new Date().toISOString(),
  });
  const tmp = newTempDir("gptc-e2e-malformed");
  try {
    const error = await assertRejectsWith(
      runDispatch({
        view: page,
        message: "请审查模块边界文档 §2 并给出结论。",
        configOverrides: dispatchConfig(tmp),
        lock: fakeLock(),
        outputDir: tmp,
        readReplySnapshot: contradictory,
      }),
      "INBOUND_REPLY_SNAPSHOT_MALFORMED",
    );
    assert.equal(error.details.unit_count, 3);
    assert.equal(error.details.unit_keys_type, "array");
    assert.equal(error.details.decision, "DEC-017");
    assert.equal(events.sendCalled, 1);
    // 不写成功结果。
    assert.ok(!existsSync(join(tmp, "result.json")));
  } finally {
    cleanupTempDir(tmp);
  }
});

test("禁止盲发：DOM 契约自检失败（composer 缺失）→ 拒绝派单且不插入任何文本", async () => {
  const noComposerHtml = `<html><body><header>仿真页（composer 缺失）</header>
    <div id="thread">
      <div data-content-search-unit-key="u0001:user" data-role="user">问</div>
    </div>
    <form><button type="button" data-testid="stop-button" aria-label="Stop" style="display:none">停止</button></form>
  </body></html>`;
  const events = { sendCalled: 0 };
  const page = createFixturePage({
    html: noComposerHtml,
    onSend: () => { events.sendCalled += 1; },
  });
  const tmp = newTempDir("gptc-contract");
  try {
    const error = await assertRejectsWith(
      runDispatch({ view: page, message: "审查 §2", configOverrides: dispatchConfig(tmp), lock: fakeLock() }),
      "DOM_CONTRACT_CHECK_FAILED",
    );
    assert.equal(error.details.ok, false);
    assert.equal(error.details.checks.composer_present, false);
    assert.equal(error.details.checks.units_present_when_required, true);
    assert.equal(events.sendCalled, 0);
    assert.equal(page.composerValue, "");
  } finally {
    cleanupTempDir(tmp);
  }
});

test("出站超限：1200 字节上限在接触浏览器前拒绝（不插文本、不回车、不加 unit）", async () => {
  const { page, events } = smallScenario();
  const tmp = newTempDir("gptc-oversize");
  try {
    const error = await assertRejectsWith(
      runDispatch({
        view: page,
        message: `汉`.repeat(401), // 1203 字节
        configOverrides: dispatchConfig(tmp),
        lock: fakeLock(),
      }),
      "OUTBOUND_MESSAGE_TOO_LARGE",
    );
    assert.equal(error.details.size_bytes, 1203);
    assert.equal(error.details.truncated, false);
    assert.equal(events.sendCalled, 0);
    assert.equal(page.allUnits.length, 2);
    assert.equal(await page.composerText(), "");
  } finally {
    cleanupTempDir(tmp);
  }
});

// ---------- 可滚动虚拟列表的分窗拼接（readReplySnapshot 直测） ----------

function scrollableScenario({ withExpected }) {
  const units = [
    { key: "u0001:user", role: "user", text: "开场" },
    ...Array.from({ length: 9 }, (_, index) => ({
      key: `a000${index + 2}:assistant`,
      role: "assistant",
      text: `历史回答 ${index + 2}`,
      assistantUuid: `aaaaaaaa-0000-4000-8000-0000000000${String(index + 2).padStart(2, "0")}`,
    })),
  ];
  const page = createFixturePage({
    html: sessionHtml({ units }),
    viewportUnits: 4,
    onSend: ({ page: p }) => {
      p.at(600, (q) => {
        q.appendUnit({ key: "u1000:user", role: "user", text: "长会话里追问" });
        q.scrollToBottom();
        q.setGenerating(true);
      });
      p.at(2500, (q) => {
        q.appendUnit({ key: "a1001:assistant", role: "assistant", text: "分段回复 1", assistantUuid: ASSISTANT_UUID });
        q.appendUnit({ key: "a1002:assistant", role: "assistant", text: "分段回复 2", assistantUuid: "aaaaaaaa-0000-4000-8000-000000001002" });
        q.appendUnit({ key: "a1003:assistant", role: "assistant", text: "分段回复 3", assistantUuid: "aaaaaaaa-0000-4000-8000-000000001003" });
        q.appendUnit({ key: "a1004:assistant", role: "assistant", text: "分段回复 4（结尾）", assistantUuid: "aaaaaaaa-0000-4000-8000-000000001004" });
        q.setGenerating(false);
        q.scrollToBottom();
      });
    },
  });
  return { page, withExpected };
}

test("⑧ 可滚动虚拟列表：分窗向上定位 + 向下拼接 + 独立逻辑序列证明完整", async () => {
  const { page } = scrollableScenario({});
  page.onSend({ page });
  page.advance(3000);
  assert.equal(page.allUnits.length, 15); // 10 初始 + user + 4 assistant
  // 多 assistant unit fixture：显式放宽 DEC-017 门禁（仅测试；真实路径默认 1 且 dispatch 收敛点无条件复核）。
  const snapshot = await readReplySnapshot(page, "u1000:user", {
    expectedUnitKeys: ["u1000:user", "a1001:assistant", "a1002:assistant", "a1003:assistant", "a1004:assistant"],
    maxAssistantUnits: 8,
  });
  assert.deepEqual(snapshot.unit_keys, ["a1001:assistant", "a1002:assistant", "a1003:assistant", "a1004:assistant"]);
  assert.equal(snapshot.range_proof.window_integrity.method, "INDEPENDENT_LOGICAL_UNIT_SEQUENCE");
  assert.ok(snapshot.range_proof.window_transitions >= 1);
  assert.equal(snapshot.range_proof.end_reason, "DOM_BOTTOM");
  assert.ok(snapshot.reply.includes("分段回复 1"));
  assert.ok(snapshot.reply.includes("分段回复 4（结尾）"));
  assert.ok(!snapshot.reply.includes("历史回答"));
});

test("⑧ 可滚动虚拟列表：集合变化且无独立序列 → INBOUND_WINDOW_COMPLETENESS_UNPROVEN", async () => {
  const { page } = scrollableScenario({});
  page.onSend({ page });
  page.advance(3000);
  const error = await assertRejectsWith(
    readReplySnapshot(page, "u1000:user", {}),
    "INBOUND_WINDOW_COMPLETENESS_UNPROVEN",
  );
  assert.equal(error.details.remediation.includes("序列"), true);
  assert.equal(error.details.remediation.includes("重新读取"), true);
});
