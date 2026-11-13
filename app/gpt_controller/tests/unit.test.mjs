// M2 单元测试（真实执行）：①1200 字节出站计量正/负例 ②三 ID 缺失/部分/非法拒绝
// ⑤入站两次读取比较 fail-closed ⑥入站区间集合变化 UNPROVEN / 独立序列 FAILED
// ⑦artifact 落盘回读 hash 一致 + 篡改负例；另含 GitPointer 离线读取（fetchImpl 注入）、
// Git 交接包、会话存储/轮换决策、C3 映射、C4 日志、M1 幂等与三 ID 核心入口强制。
// 不连真实 chatgpt.com，不连网（HTTP 用注入 shim）。

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertOutboundWithinLimit,
  buildGitPointerInstruction,
  buildOutboundMessage,
  MAX_OUTBOUND_BYTES,
  measureOutboundBytes,
} from "../src/outbound.mjs";
import { meterOutboundMessage, normalizeDispatchRequest } from "../src/dispatch.mjs";
import { normalizeIds, ID_RULES } from "../src/validation.mjs";
import { compareInboundSnapshots, createInboundRangeCollector, selectInboundReply, assertInboundExtensionGate, sha256Hex, persistInboundArtifacts, verifyArtifactFile, validateInboundJsonArtifact, extractCompleteJson } from "../src/inbound_reply.mjs";
import {
  buildGitPointerManifest,
  createGitPointer,
  readGitPointer,
  scanSecrets,
  validateGitPointer,
  validateRepoRelativePath,
} from "../src/git_pointer.mjs";
import { buildHandoffInstruction, normalizeGitHandoff } from "../src/git_handoff.mjs";
import { SessionStore, decideSessionRotation } from "../src/session_store.mjs";
import { registerArtifact, registerArtifactWithRetry } from "../src/m1_registration.mjs";
import { controllerError } from "../src/errors.mjs";
import { createLogger } from "../src/logging.mjs";
import { resolveControllerConfig } from "../src/config.mjs";
import * as controllerApi from "../index.mjs";
import {
  ASSISTANT_UUID,
  VALID_IDS,
  assertRejectsWith,
  cleanupTempDir,
  newTempDir,
} from "./helpers.mjs";

// ---------- ① 出站 1200 UTF-8 字节计量 ----------

test("① 出站计量：1200 字节边界（ASCII 与多字节汉字）正/负例", async () => {
  assert.equal(MAX_OUTBOUND_BYTES, 1200);

  const ascii1199 = "a".repeat(1199);
  const ascii1200 = "a".repeat(1200);
  const ascii1201 = "a".repeat(1201);
  assert.equal(measureOutboundBytes(ascii1200), 1200);
  assert.equal(assertOutboundWithinLimit(ascii1199).within_limit, true);
  assert.equal(assertOutboundWithinLimit(ascii1200).within_limit, true);

  // 401 个汉字 = 1203 字节 > 1200；400 个汉字 = 1200 字节恰好达标。
  assert.equal(measureOutboundBytes("汉".repeat(400)), 1200);
  assert.equal(measureOutboundBytes("汉".repeat(401)), 1203);

  const tooLarge = await assertRejectsWith((async () => assertOutboundWithinLimit(ascii1201))(), "OUTBOUND_MESSAGE_TOO_LARGE");
  assert.equal(tooLarge.details.size_bytes, 1201);
  assert.equal(tooLarge.details.truncated, false);
  assert.equal(tooLarge.details.split, false);
});

test("① 出站计量：多字节 1203 字节拒发；meterOutboundMessage 与 assertOutboundWithinLimit 同口径", async () => {
  await assertRejectsWith((async () => assertOutboundWithinLimit("汉".repeat(401)))(), "OUTBOUND_MESSAGE_TOO_LARGE");
  const metering = meterOutboundMessage("汉".repeat(400));
  assert.equal(metering.bytes, 1200);
  assert.equal(metering.max_bytes, 1200);
  assert.equal(meterOutboundMessage("ok").bytes, 2);
});

test("① 出站计量：buildOutboundMessage 组合并整体计量；超限整体拒绝（不截断/不拆分）", async () => {
  const built = buildOutboundMessage({ text: "审查 §2", extraLines: ["输出 JSON"] });
  assert.equal(built.within_limit, true);
  assert.ok(built.message.includes("审查 §2"));

  // 长材料必须走 GitPointer：整封指令（含指针 JSON）不超 1200。
  const { pointer } = buildTestPointer();
  const instruction = buildGitPointerInstruction({ gitPointer: pointer, correlation_id: VALID_IDS.correlation_id });
  assert.ok(instruction.includes(pointer.commit_sha));
  assert.ok(instruction.includes(`correlation_id=${VALID_IDS.correlation_id}`));
  assert.ok(Buffer.byteLength(instruction, "utf8") <= 1200);

  await assertRejectsWith((async () => buildOutboundMessage({ text: "汉".repeat(401) }))(), "OUTBOUND_MESSAGE_TOO_LARGE");
});

// ---------- GitPointer 离线构造/校验/读取（fetchImpl 注入，无网络） ----------

function buildTestPointer() {
  const fileContent = "# 任务材料\nAIEO 离线测试材料内容。\n";
  const built = buildGitPointerManifest({
    task_id: VALID_IDS.task_id,
    execution_id: VALID_IDS.execution_id,
    files: [{ path: "tasks/T-P1-001/brief.md", content: fileContent }],
  });
  const pointer = createGitPointer({
    owner: "acme-lab",
    repo: "aieo-materials",
    branch: "main",
    commit_sha: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0",
    path: "tasks/T-P1-001/manifest.json",
    manifestBytes: built.manifestBytes,
  });
  return { pointer, built, fileContent };
}

function fetchShim(routes) {
  return async (url) => {
    const hit = routes.find(([suffix]) => url.endsWith(suffix));
    if (!hit) return { ok: false, status: 404 };
    const bytes = hit[1];
    return { ok: true, status: 200, arrayBuffer: async () => bytes };
  };
}

test("GitPointer：Schema 校验正/负例（完整 40 位 SHA、路径规则、manifest 媒体类型）", async () => {
  const { pointer } = buildTestPointer();
  assert.equal(validateGitPointer(pointer).transport, "git_pointer");

  // Schema 本身就拒绝 HEAD/短 SHA、穿越路径、盘符、.git 与非 manifest 媒体类型。
  await assertRejectsWith((async () => validateGitPointer({ ...pointer, commit_sha: "HEAD" }))(), "GIT_POINTER_SCHEMA_INVALID");
  await assertRejectsWith((async () => validateGitPointer({ ...pointer, commit_sha: "a1" }))(), "GIT_POINTER_SCHEMA_INVALID");
  await assertRejectsWith((async () => validateGitPointer({ ...pointer, path: "../escape/manifest.json" }))(), "GIT_POINTER_SCHEMA_INVALID");
  await assertRejectsWith((async () => validateGitPointer({ ...pointer, path: "C:/materials/manifest.json" }))(), "GIT_POINTER_SCHEMA_INVALID");
  await assertRejectsWith((async () => validateGitPointer({ ...pointer, path: "tasks/.git/config" }))(), "GIT_POINTER_SCHEMA_INVALID");
  await assertRejectsWith((async () => validateGitPointer({ ...pointer, media_type: "text/plain" }))(), "GIT_POINTER_SCHEMA_INVALID");

  // 路径语义规则在 validateRepoRelativePath 中独立可测（POSIX 相对、禁穿越/盘符/.git/非规范段）。
  await assertRejectsWith((async () => validateRepoRelativePath("../x"))(), "GIT_POINTER_PATH_INVALID");
  await assertRejectsWith((async () => validateRepoRelativePath("C:/x"))(), "GIT_POINTER_PATH_INVALID");
  await assertRejectsWith((async () => validateRepoRelativePath("a//b"))(), "GIT_POINTER_PATH_INVALID");
  await assertRejectsWith((async () => validateRepoRelativePath("tasks/.git/config"))(), "GIT_POINTER_PATH_INVALID");
  await assertRejectsWith((async () => validateRepoRelativePath("tasks//brief.md"))(), "GIT_POINTER_PATH_INVALID");
  await assertRejectsWith((async () => validateRepoRelativePath("/abs/brief.md"))(), "GIT_POINTER_PATH_INVALID");
  assert.equal(validateRepoRelativePath("tasks/x/brief.md"), "tasks/x/brief.md");
});

test("GitPointer：指定完整 SHA 全量读取（manifest+文件 size/SHA 核对）正例与回读不一致负例", async () => {
  const { pointer, built, fileContent } = buildTestPointer();
  const commit = pointer.commit_sha;
  const read = await readGitPointer({
    pointer,
    fetchImpl: fetchShim([
      [`/${commit}/tasks/T-P1-001/manifest.json`, built.manifestBytes],
      [`/${commit}/tasks/T-P1-001/brief.md`, Buffer.from(fileContent, "utf8")],
    ]),
  });
  assert.equal(read.complete, true);
  assert.equal(read.commit_sha, commit);
  assert.equal(read.files.length, 1);
  assert.equal(read.files[0].content.toString("utf8"), fileContent);
  assert.equal(read.manifest_sha256, pointer.artifact_sha256);

  // 文件 SHA 与 manifest 不一致 → 拒绝（同长度改写，确保命中 hash 检查而非 size 检查）。
  const tamperedContent = `${fileContent.slice(0, -1)}X`;
  assert.equal(Buffer.byteLength(tamperedContent, "utf8"), Buffer.byteLength(fileContent, "utf8"));
  await assertRejectsWith(
    readGitPointer({
      pointer,
      fetchImpl: fetchShim([
        [`/${commit}/tasks/T-P1-001/manifest.json`, built.manifestBytes],
        [`/${commit}/tasks/T-P1-001/brief.md`, Buffer.from(tamperedContent, "utf8")],
      ]),
    }),
    "GIT_POINTER_FILE_HASH_MISMATCH",
  );

  // manifest 字节数与指针声明不一致 → 拒绝。
  await assertRejectsWith(
    readGitPointer({
      pointer,
      fetchImpl: fetchShim([["/manifest.json", Buffer.concat([built.manifestBytes, Buffer.from(" ")])]]),
    }),
    "GIT_POINTER_MANIFEST_SIZE_MISMATCH",
  );

  // 指针与 manifest 绑定不一致 → 拒绝。
  await assertRejectsWith(
    readGitPointer({
      pointer: { ...pointer, task_id: "T-P1-002" },
      fetchImpl: fetchShim([[`/${commit}/tasks/T-P1-001/manifest.json`, built.manifestBytes]]),
    }),
    "GIT_POINTER_BINDING_MISMATCH",
  );
});

test("GitPointer：404/403 fail-closed（不回退 HEAD、不重试权限错误）与暂时 503 有限重试", async () => {
  const { pointer, built } = buildTestPointer();
  const commit = pointer.commit_sha;

  await assertRejectsWith(
    readGitPointer({ pointer, fetchImpl: async () => ({ ok: false, status: 404 }) }),
    "GIT_POINTER_NOT_FOUND",
  );
  await assertRejectsWith(
    readGitPointer({ pointer, fetchImpl: async () => ({ ok: false, status: 403 }) }),
    "GIT_POINTER_PERMISSION_DENIED",
  );

  let calls = 0;
  const retryShim = fetchShim([
    [`/${commit}/tasks/T-P1-001/manifest.json`, built.manifestBytes],
    [`/${commit}/tasks/T-P1-001/brief.md`, Buffer.from("# 任务材料\nAIEO 离线测试材料内容。\n", "utf8")],
  ]);
  const read = await readGitPointer({
    pointer,
    configOverrides: { httpMaxRetries: 2, httpRetryBaseSeconds: 0 },
    sleep: async () => {},
    fetchImpl: async (url) => {
      calls += 1;
      if (calls === 1) return { ok: false, status: 503 };
      return retryShim(url);
    },
  });
  assert.equal(read.complete, true);
  assert.equal(calls, 3); // manifest 首次 503 + 重试成功；材料 1 次
});

test("GitPointer：秘密扫描拒止（不回显秘密值）", async () => {
  const findings = scanSecrets(Buffer.from("line1\napi_key = \"super-secret-value\"\nline3"));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, "credential-assignment");
  await assertRejectsWith((async () => validateRepoRelativePath("../x"))(), "GIT_POINTER_PATH_INVALID");
});

// ---------- ② 三 ID 强制 ----------

test("② 三 ID：normalizeIds 缺一（required）/部分提供/格式非法即拒", async () => {
  await assertRejectsWith((async () => normalizeIds({}, { required: true }))(), "DISPATCH_M1_BINDING_INCOMPLETE");
  await assertRejectsWith((async () => normalizeIds({ task_id: VALID_IDS.task_id }))(), "DISPATCH_BINDING_INCOMPLETE");
  await assertRejectsWith((async () => normalizeIds({ task_id: VALID_IDS.task_id, execution_id: VALID_IDS.execution_id }))(), "DISPATCH_BINDING_INCOMPLETE");
  await assertRejectsWith((async () => normalizeIds({ ...VALID_IDS, task_id: "T-1" }))(), "DISPATCH_ID_INVALID");
  await assertRejectsWith((async () => normalizeIds({ ...VALID_IDS, execution_id: "EXEC-1" }))(), "DISPATCH_ID_INVALID");
  await assertRejectsWith((async () => normalizeIds({ ...VALID_IDS, correlation_id: "CORR-x" }))(), "DISPATCH_ID_INVALID");
  assert.deepEqual(normalizeIds(VALID_IDS), VALID_IDS);
  assert.ok(ID_RULES.task_id.test("T-P12-0034"));
  assert.ok(ID_RULES.correlation_id.test("0f1e2d3c-4b5a-4678-9aab-bbccddeeff00"));
});

test("② 三 ID：normalizeDispatchRequest 请求登记/部分 ID 缺 schema 均发送前拒绝", async () => {
  const none = normalizeDispatchRequest({ message: "hi" });
  assert.equal(none.m1RegistrationStatus, "NOT_REQUESTED");

  const full = normalizeDispatchRequest({ message: "hi", ids: VALID_IDS, schemaPath: "tests/fixtures/reply.schema.json" });
  assert.equal(full.m1RegistrationRequested, true);

  await assertRejectsWith((async () => normalizeDispatchRequest({ message: "hi", ids: { task_id: VALID_IDS.task_id } }))(), "DISPATCH_BINDING_INCOMPLETE");
  await assertRejectsWith((async () => normalizeDispatchRequest({ message: "hi", ids: VALID_IDS }))(), "DISPATCH_M1_BINDING_INCOMPLETE");
  await assertRejectsWith((async () => normalizeDispatchRequest({ message: "hi", registerM1: true }))(), "DISPATCH_M1_BINDING_INCOMPLETE");
  await assertRejectsWith((async () => normalizeDispatchRequest({ message: "   " }))(), "DISPATCH_MESSAGE_REQUIRED");
});

// ---------- ⑤ 入站两次完整读取比较 ----------

function makeSnapshot({
  userKey = "u1:user",
  assistantKey = "a1:assistant",
  text = "本地仿真回复",
  assistantUuid = ASSISTANT_UUID,
  nextUser = "u2:user",
  endReason = "NEXT_USER",
  rangeComplete = true,
  readAt = 0,
} = {}) {
  const bytes = Buffer.from(text, "utf8");
  return {
    read_started_at: new Date(readAt).toISOString(),
    read_finished_at: new Date(readAt + 100).toISOString(),
    user_unit_key: userKey,
    next_user_unit_key: nextUser,
    unit_keys: [assistantKey],
    unit_count: 1,
    assistant_uuid: assistantUuid,
    units: [{ key: assistantKey, role: "assistant", text, text_sha256: sha256Hex(bytes), size_bytes: bytes.length, assistant_uuid: assistantUuid }],
    reply: text,
    range_proof: { complete: rangeComplete, end_reason: endReason, user_unit_key: userKey, next_user_unit_key: nextUser },
  };
}

test("⑤ 两次读取比较：完全一致 + 间隔≥3000ms 判稳定", async () => {
  const first = makeSnapshot({ readAt: 0 });
  const second = makeSnapshot({ readAt: 3000 });
  const result = compareInboundSnapshots(first, second, 3000);
  assert.equal(result.stable, true);
  assert.equal(result.checks.interval_at_least_3000ms, true);
  assert.equal(result.checks.unit_text_hashes_equal, true);
  assert.equal(Object.values(result.checks).every(Boolean), true);
});

test("⑤ 两次读取比较：间隔不足/文本变化/UUID 变化/区间不完整 任一即 INBOUND_UNSTABLE_READ", async () => {
  await assertRejectsWith((async () => compareInboundSnapshots(makeSnapshot({ readAt: 0 }), makeSnapshot({ readAt: 2999 }), 2999))(), "INBOUND_UNSTABLE_READ");
  await assertRejectsWith((async () => compareInboundSnapshots(makeSnapshot({ readAt: 0 }), makeSnapshot({ readAt: 3000, text: "被改写的回复" }), 3000))(), "INBOUND_UNSTABLE_READ");
  await assertRejectsWith((async () => compareInboundSnapshots(makeSnapshot({ readAt: 0 }), makeSnapshot({ readAt: 3000, assistantUuid: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeffff0001" }), 3000))(), "INBOUND_UNSTABLE_READ");
  await assertRejectsWith((async () => compareInboundSnapshots(makeSnapshot({ readAt: 0, rangeComplete: false }), makeSnapshot({ readAt: 3000, rangeComplete: false }), 3000))(), "INBOUND_UNSTABLE_READ");
  await assertRejectsWith((async () => compareInboundSnapshots(makeSnapshot({ readAt: 0 }), makeSnapshot({ readAt: 3000, nextUser: "u3:user" }), 3000))(), "INBOUND_UNSTABLE_READ");
});

// ---------- ⑥ 虚拟列表区间实体化与完整性证明 ----------

function unitOf(key, overrides = {}) {
  const role = key.split(":").pop();
  return { key, role, text: overrides.text ?? `原文-${key}`, assistantUuid: role === "assistant" ? (overrides.assistantUuid ?? `uuid-${key}`) : null };
}

test("⑥ 区间采集：多窗口拼接 + 独立逻辑序列 → 完整证明", async () => {
  const expected = ["u0:user", "a1:assistant", "a2:assistant", "a3:assistant", "u4:user"];
  const collector = createInboundRangeCollector("u0:user", { expectedUnitKeys: expected });
  collector.ingest([unitOf("u0:user"), unitOf("a1:assistant"), unitOf("a2:assistant")], { atBottom: false, scrollable: true });
  collector.ingest([unitOf("a2:assistant"), unitOf("a3:assistant")], { atBottom: false, scrollable: true });
  collector.ingest([unitOf("a3:assistant"), unitOf("u4:user")], { atBottom: false, scrollable: true });
  const built = collector.build();
  assert.deepEqual(built.units.map((unit) => unit.key), expected);
  assert.equal(built.range_proof.window_integrity.method, "INDEPENDENT_LOGICAL_UNIT_SEQUENCE");
  assert.equal(built.range_proof.end_reason, "NEXT_USER");

  // DEC-017 扩展门禁（T-P1-901 F-001）：默认 maxAssistantUnits=1，多 assistant unit fixture 测试须显式放宽。
  const selected = selectInboundReply(built.units, "u0:user", { maxAssistantUnits: 8 });
  assert.deepEqual(selected.unit_keys, ["a1:assistant", "a2:assistant", "a3:assistant"]);
  assert.equal(selected.next_user_unit_key, "u4:user");
  assert.equal(selected.assistant_uuid, "uuid-a3:assistant");
  assert.ok(selected.reply.includes("原文-a1:assistant"));
});

test("⑥ 区间采集：滚动中集合变化且无独立序列 → INBOUND_WINDOW_COMPLETENESS_UNPROVEN（fail-closed）", async () => {
  const collector = createInboundRangeCollector("u0:user");
  collector.ingest([unitOf("u0:user"), unitOf("a1:assistant"), unitOf("a2:assistant")], { atBottom: false, scrollable: true });
  collector.ingest([unitOf("a2:assistant"), unitOf("a3:assistant")], { atBottom: false, scrollable: true });
  collector.ingest([unitOf("a3:assistant")], { atBottom: true, scrollable: true });
  await assertRejectsWith((async () => collector.build())(), "INBOUND_WINDOW_COMPLETENESS_UNPROVEN");
});

test("⑥ 区间采集：独立序列含未渲染中间 unit → INBOUND_WINDOW_COMPLETENESS_FAILED（列出缺失）", async () => {
  const expected = ["u0:user", "a1:assistant", "a2:assistant", "a3:assistant", "u4:user"];
  const collector = createInboundRangeCollector("u0:user", { expectedUnitKeys: expected });
  collector.ingest([unitOf("u0:user"), unitOf("a1:assistant")], { atBottom: false, scrollable: true });
  collector.ingest([unitOf("a1:assistant"), unitOf("a3:assistant")], { atBottom: false, scrollable: true }); // a2 在所有窗口中缺失
  collector.ingest([unitOf("a3:assistant"), unitOf("u4:user")], { atBottom: false, scrollable: true });
  assert.throws(() => collector.build(), (err) => err.code === "INBOUND_WINDOW_COMPLETENESS_FAILED" &&
    JSON.stringify(err.details.missing_unit_keys) === JSON.stringify(["a2:assistant"]));
});

test("⑥ 区间采集：相邻窗口无重叠/重叠原文被改 → fail-closed", async () => {
  const c1 = createInboundRangeCollector("u0:user");
  c1.ingest([unitOf("u0:user"), unitOf("a1:assistant"), unitOf("a2:assistant")], { atBottom: false, scrollable: true });
  await assertRejectsWith((async () => c1.ingest([unitOf("a9:assistant")], { atBottom: false, scrollable: true }))(), "INBOUND_WINDOW_DISCONTINUOUS");

  const c2 = createInboundRangeCollector("u0:user");
  c2.ingest([unitOf("u0:user"), unitOf("a1:assistant"), unitOf("a2:assistant")], { atBottom: false, scrollable: true });
  assertRejectsWith(
    (async () => c2.ingest([unitOf("a2:assistant", { text: "滚动后原文被改" }), unitOf("a3:assistant")], { atBottom: false, scrollable: true }))(),
    "INBOUND_WINDOW_OVERLAP_CHANGED",
  );
});

test("⑥ 区间采集：非滚动静态 DOM 单窗到底；到底但尾为 user → INBOUND_END_BOUNDARY_INVALID", async () => {
  const collector = createInboundRangeCollector("u0:user");
  collector.ingest([unitOf("u0:user"), unitOf("a1:assistant")], { atBottom: true, scrollable: false });
  const built = collector.build();
  assert.equal(built.range_proof.window_integrity.method, "STATIC_NON_SCROLLABLE_DOM");
  assert.equal(built.range_proof.end_reason, "DOM_BOTTOM");

  const bad = createInboundRangeCollector("u0:user");
  await assertRejectsWith((async () => bad.ingest([unitOf("u0:user")], { atBottom: true, scrollable: false }))(), "INBOUND_END_BOUNDARY_INVALID");
});

test("⑥ selectInboundReply：起点缺失/无 assistant/缺 DIL UUID 均 fail-closed", async () => {
  await assertRejectsWith((async () => selectInboundReply([unitOf("a1:assistant")], "u0:user"))(), "INBOUND_START_UNIT_MISSING");
  await assertRejectsWith((async () => selectInboundReply([unitOf("u0:user"), unitOf("u9:user")], "u0:user"))(), "INBOUND_ASSISTANT_UNITS_MISSING");
  const noUuid = [{ key: "u0:user", role: "user", text: "q", assistantUuid: null }, { key: "a1:assistant", role: "assistant", text: "r", assistantUuid: null }];
  await assertRejectsWith((async () => selectInboundReply(noUuid, "u0:user"))(), "INBOUND_ASSISTANT_UUID_MISSING");
});

test("⑥ DEC-017 扩展门禁：多 assistant unit 默认 fail-closed，显式放宽后放行", async () => {
  const units = [unitOf("u0:user"), unitOf("a1:assistant"), unitOf("a2:assistant"), unitOf("a3:assistant"), unitOf("u4:user")];
  // 默认（真实路径参数）：超过 1 个 assistant unit → INBOUND_MULTI_UNIT_EXTENSION_GATE_BLOCKED。
  const gateError = await assertRejectsWith((async () => selectInboundReply(units, "u0:user"))(), "INBOUND_MULTI_UNIT_EXTENSION_GATE_BLOCKED");
  assert.equal(gateError.details.unit_count, 3);
  assert.equal(gateError.details.max_assistant_units, 1);
  assert.equal(gateError.details.decision, "DEC-017");
  // maxAssistantUnits=1 显式传入与默认等价，仍拒绝。
  await assertRejectsWith((async () => selectInboundReply(units, "u0:user", { maxAssistantUnits: 1 }))(), "INBOUND_MULTI_UNIT_EXTENSION_GATE_BLOCKED");
  // 单 assistant unit 核心路径不受门禁影响（已由其他用例覆盖），此处验证放宽参数可用。
  const relaxed = selectInboundReply(units, "u0:user", { maxAssistantUnits: 8 });
  assert.deepEqual(relaxed.unit_keys, ["a1:assistant", "a2:assistant", "a3:assistant"]);
});

test("⑥ DEC-017 最终防线（T-P1-901 F-101/F-402）：assertInboundExtensionGate 完整合法快照放行，多 unit/畸形/结构不一致一律 fail-closed", async () => {
  // F-402 起最终防线验证完整快照结构：合法 units 元素必须带真实 text 与自洽摘要/大小。
  const validUnitOf = (key, text) => ({
    key,
    role: "assistant",
    text,
    text_sha256: sha256Hex(Buffer.from(text, "utf8")),
    size_bytes: Buffer.byteLength(text, "utf8"),
    assistant_uuid: "uuid-a1",
  });
  const validSnapshotOf = (keys, texts) => ({
    unit_count: keys.length,
    unit_keys: keys,
    units: keys.map((key, index) => validUnitOf(key, texts[index])),
    reply: texts.join("\n"),
    assistant_uuid: "uuid-a1",
  });
  const singleText = "回复正文 {\"ok\":true}";
  // 单 assistant unit 核心路径：完整合法快照不抛。
  assert.doesNotThrow(() => assertInboundExtensionGate(validSnapshotOf(["a1:assistant"], [singleText])));
  // 多 unit：即使上游已放宽（模拟 selectInboundReply(maxAssistantUnits=8) 的产物），最终防线仍拦截。
  const multi = validSnapshotOf(["a1:assistant", "a2:assistant", "a3:assistant"], ["t1", "t2", "t3"]);
  const gateError = await assertRejectsWith((async () => assertInboundExtensionGate(multi))(), "INBOUND_MULTI_UNIT_EXTENSION_GATE_BLOCKED");
  assert.equal(gateError.details.unit_count, 3);
  assert.equal(gateError.details.max_assistant_units, 1);
  assert.equal(gateError.details.decision, "DEC-017");
  // 畸形快照：缺字段/类型非法/内部矛盾 → INBOUND_REPLY_SNAPSHOT_MALFORMED，不给绕过空间。
  const malformedCases = [
    ["缺 unit_count", {}],
    ["unit_count undefined", { unit_count: undefined, unit_keys: ["a1:assistant"], units: [validUnitOf("a1:assistant", "t")], reply: "t", assistant_uuid: "uuid-a1" }],
    ["unit_count 非整数", { unit_count: 2.5, unit_keys: ["a1:assistant", "a2:assistant"], units: [validUnitOf("a1:assistant", "t"), validUnitOf("a2:assistant", "t")], reply: "t\nt", assistant_uuid: "uuid-a1" }],
    ["unit_count 负数", { unit_count: -1, unit_keys: [], units: [], reply: "", assistant_uuid: "uuid-a1" }],
    ["unit_count NaN", { unit_count: Number.NaN, unit_keys: [], units: [], reply: "", assistant_uuid: "uuid-a1" }],
    ["unit_count 字符串", { unit_count: "3", unit_keys: ["a1", "a2", "a3"], units: [], reply: "", assistant_uuid: "uuid-a1" }],
    ["缺 unit_keys", { unit_count: 1 }],
    ["unit_keys 非数组", { unit_count: 1, unit_keys: "a1:assistant", units: [validUnitOf("a1:assistant", "t")], reply: "t", assistant_uuid: "uuid-a1" }],
    ["unit_keys 与 unit_count 不一致", { unit_count: 3, unit_keys: ["a1:assistant"], units: [], reply: "", assistant_uuid: "uuid-a1" }],
    // F-201 补充边界（第 3 轮审查）：零数量、null 元素、空字符串、重复 key、非字符串元素。
    ["unit_count 零（无 assistant unit）", { unit_count: 0, unit_keys: [], units: [], reply: "", assistant_uuid: "uuid-a1" }],
    ["unit_keys 含 null 元素", { unit_count: 1, unit_keys: [null], units: [], reply: "", assistant_uuid: "uuid-a1" }],
    ["unit_keys 含空字符串元素", { unit_count: 1, unit_keys: [""], units: [], reply: "", assistant_uuid: "uuid-a1" }],
    ["unit_keys 重复 key", { unit_count: 2, unit_keys: ["a1:assistant", "a1:assistant"], units: [], reply: "", assistant_uuid: "uuid-a1" }],
    ["unit_keys 含非字符串元素", { unit_count: 2, unit_keys: ["a1:assistant", 123], units: [], reply: "", assistant_uuid: "uuid-a1" }],
    // F-402 补充边界（第 5 轮审查）：units 结构一致性——空 units、长度不符、元素非法、摘要伪造、reply 脱钩。
    ["units 空数组但 unit_count=1（F-402 核心绕过）", { unit_count: 1, unit_keys: ["a1:assistant"], units: [], reply: "", assistant_uuid: "uuid-a1" }],
    ["units 长度与 unit_count 不一致", { unit_count: 1, unit_keys: ["a1:assistant"], units: [validUnitOf("a1:assistant", "t"), validUnitOf("a2:assistant", "t")], reply: "t", assistant_uuid: "uuid-a1" }],
    ["units 元素 null", { unit_count: 1, unit_keys: ["a1:assistant"], units: [null], reply: "t", assistant_uuid: "uuid-a1" }],
    ["units 元素非对象", { unit_count: 1, unit_keys: ["a1:assistant"], units: ["a1:assistant"], reply: "t", assistant_uuid: "uuid-a1" }],
    ["units 元素 role 非法（user）", { unit_count: 1, unit_keys: ["a1:assistant"], units: [{ ...validUnitOf("a1:assistant", "t"), role: "user" }], reply: "t", assistant_uuid: "uuid-a1" }],
    ["units 元素 role 缺失", { unit_count: 1, unit_keys: ["a1:assistant"], units: [{ key: "a1:assistant", text: "t", text_sha256: sha256Hex(Buffer.from("t", "utf8")), size_bytes: 1, assistant_uuid: "uuid-a1" }], reply: "t", assistant_uuid: "uuid-a1" }],
    ["units 元素 key 与 unit_keys 不一致", { unit_count: 1, unit_keys: ["a1:assistant"], units: [validUnitOf("a2:assistant", "t")], reply: "t", assistant_uuid: "uuid-a1" }],
    ["units 元素 key 空", { unit_count: 1, unit_keys: ["a1:assistant"], units: [validUnitOf("", "t")], reply: "t", assistant_uuid: "uuid-a1" }],
    ["units 元素 text 空", { unit_count: 1, unit_keys: ["a1:assistant"], units: [validUnitOf("a1:assistant", "")], reply: "", assistant_uuid: "uuid-a1" }],
    ["units 元素 text 非字符串", { unit_count: 1, unit_keys: ["a1:assistant"], units: [{ key: "a1:assistant", role: "assistant", text: 123, text_sha256: "a".repeat(64), size_bytes: 3, assistant_uuid: "uuid-a1" }], reply: "123", assistant_uuid: "uuid-a1" }],
    ["units 元素 text_sha256 非 64 位十六进制", { unit_count: 1, unit_keys: ["a1:assistant"], units: [{ ...validUnitOf("a1:assistant", "t"), text_sha256: "deadbeef" }], reply: "t", assistant_uuid: "uuid-a1" }],
    ["units 元素 text_sha256 与 text 不匹配（伪造摘要）", { unit_count: 1, unit_keys: ["a1:assistant"], units: [{ ...validUnitOf("a1:assistant", "t"), text_sha256: sha256Hex(Buffer.from("伪造", "utf8")) }], reply: "t", assistant_uuid: "uuid-a1" }],
    ["units 元素 size_bytes 与 text 不匹配", { unit_count: 1, unit_keys: ["a1:assistant"], units: [{ ...validUnitOf("a1:assistant", "t"), size_bytes: 999 }], reply: "t", assistant_uuid: "uuid-a1" }],
    ["units 元素 size_bytes 非正整数", { unit_count: 1, unit_keys: ["a1:assistant"], units: [{ ...validUnitOf("a1:assistant", "t"), size_bytes: 0 }], reply: "t", assistant_uuid: "uuid-a1" }],
    ["快照级 assistant_uuid 缺失", { ...validSnapshotOf(["a1:assistant"], [singleText]), assistant_uuid: undefined }],
    ["快照级 assistant_uuid 空字符串", { ...validSnapshotOf(["a1:assistant"], [singleText]), assistant_uuid: "" }],
    // F-502 补充边界（第 6 轮审查）：unit 级 assistant_uuid 与快照级一致性——unit 级缺失/伪造而快照级合法不得绕过。
    ["units 元素 assistant_uuid 缺失", { unit_count: 1, unit_keys: ["a1:assistant"], units: [{ key: "a1:assistant", role: "assistant", text: "t", text_sha256: sha256Hex(Buffer.from("t", "utf8")), size_bytes: 1 }], reply: "t", assistant_uuid: "uuid-a1" }],
    ["units 元素 assistant_uuid 空字符串", { unit_count: 1, unit_keys: ["a1:assistant"], units: [{ ...validUnitOf("a1:assistant", "t"), assistant_uuid: "" }], reply: "t", assistant_uuid: "uuid-a1" }],
    ["units 元素 assistant_uuid 非字符串", { unit_count: 1, unit_keys: ["a1:assistant"], units: [{ ...validUnitOf("a1:assistant", "t"), assistant_uuid: 123 }], reply: "t", assistant_uuid: "uuid-a1" }],
    ["快照级 assistant_uuid 与 unit 不一致（F-502 核心绕过）", { ...validSnapshotOf(["a1:assistant"], [singleText]), assistant_uuid: "uuid-forged" }],
    ["reply 与 units 拼接不一致（脱钩 reply）", { ...validSnapshotOf(["a1:assistant"], [singleText]), reply: "被篡改的回复" }],
    ["reply 非字符串", { ...validSnapshotOf(["a1:assistant"], [singleText]), reply: 123 }],
  ];
  for (const [label, snapshot] of malformedCases) {
    const error = await assertRejectsWith((async () => assertInboundExtensionGate(snapshot))(), "INBOUND_REPLY_SNAPSHOT_MALFORMED");
    assert.equal(error.details.decision, "DEC-017", label);
  }
});

// ---------- ⑦ artifact 落盘回读 + JSON/Schema/三 ID 绑定 ----------

test("⑦ artifact：先落盘回读 SHA-256/size 一致；篡改后回读 → ARTIFACT_READBACK_MISMATCH", async () => {
  const dir = newTempDir("gptc-artifact");
  try {
    const snapshot = {
      user_unit_key: "u1:user",
      next_user_unit_key: null,
      unit_keys: ["a1:assistant"],
      unit_count: 1,
      assistant_uuid: ASSISTANT_UUID,
      units: [{ key: "a1:assistant", role: "assistant", text: "{\"ok\":true}", text_sha256: sha256Hex(Buffer.from("{\"ok\":true}", "utf8")), size_bytes: 9, assistant_uuid: ASSISTANT_UUID }],
      reply: "{\"ok\":true}",
      range_proof: { complete: true, end_reason: "DOM_BOTTOM" },
    };
    const artifacts = persistInboundArtifacts({ directory: dir, snapshot, extractedAt: "2026-11-13T00:00:00.000Z" });
    assert.equal(artifacts.reply.readback_verified, true);
    assert.equal(artifacts.raw_units.readback_verified, true);
    assert.equal(artifacts.reply.artifact_sha256, sha256Hex(Buffer.from("{\"ok\":true}", "utf8")));
    assert.ok(existsSync(artifacts.reply.path));
    assert.ok(existsSync(artifacts.raw_units.path));

    const tampered = `${artifacts.reply.path}.tampered`;
    writeFileSync(tampered, "{\"ok\":false}", "utf8");
    await assertRejectsWith((async () => verifyArtifactFile(tampered, "{\"ok\":true}"))(), "ARTIFACT_READBACK_MISMATCH");
    const ok = verifyArtifactFile(artifacts.reply.path, "{\"ok\":true}");
    assert.equal(ok.readback_verified, true);
  } finally {
    cleanupTempDir(dir);
  }
});

test("⑦ JSON/Schema/三 ID 绑定：PASS、前缀剥离、绑定不一致、Schema 违规、NOT_REQUESTED", async () => {
  const schemaPath = fileURLToPath(new URL("./fixtures/reply.schema.json", import.meta.url));
  const dir = newTempDir("gptc-json");
  try {
    const replyJson = JSON.stringify({ status: "SUCCESS", ...VALID_IDS, summary: "本地仿真审查完成" });
    const artifactPath = join(dir, "reply.txt");
    writeFileSync(artifactPath, replyJson, "utf8");

    const pass = validateInboundJsonArtifact({ artifactPath, schemaPath, expectedIds: VALID_IDS });
    assert.equal(pass.status, "PASS");
    assert.equal(pass.binding.task_id, "PASS");
    assert.equal(pass.binding.execution_id, "PASS");
    assert.equal(pass.binding.correlation_id, "PASS");
    assert.equal(pass.schema.status, "PASS");

    // ChatGPT 辅助前缀只允许精确剥离一次。
    const prefixed = join(dir, "prefixed.txt");
    writeFileSync(prefixed, `ChatGPT 说：${replyJson}`, "utf8");
    const prefixedResult = validateInboundJsonArtifact({ artifactPath: prefixed, schemaPath, expectedIds: VALID_IDS });
    assert.equal(prefixedResult.json.auxiliary_prefix_removed, true);

    // 三 ID 绑定不一致。
    const wrongIds = join(dir, "wrong-ids.txt");
    writeFileSync(wrongIds, JSON.stringify({ status: "SUCCESS", ...VALID_IDS, task_id: "T-P1-999", summary: "x" }), "utf8");
    await assertRejectsWith((async () => validateInboundJsonArtifact({ artifactPath: wrongIds, schemaPath, expectedIds: VALID_IDS }))(), "INBOUND_TASK_BINDING_MISMATCH");

    // Schema 违规。
    const invalid = join(dir, "invalid.txt");
    writeFileSync(invalid, JSON.stringify({ status: "OTHER", ...VALID_IDS, summary: "x" }), "utf8");
    await assertRejectsWith((async () => validateInboundJsonArtifact({ artifactPath: invalid, schemaPath, expectedIds: VALID_IDS }))(), "INBOUND_SCHEMA_VALIDATION_FAILED");

    // 未请求 Schema → NOT_REQUESTED。
    const skipped = validateInboundJsonArtifact({ artifactPath, schemaPath: null, expectedIds: {} });
    assert.equal(skipped.status, "NOT_REQUESTED");

    const parsed = extractCompleteJson(Buffer.from(replyJson, "utf8"));
    assert.equal(parsed.value.summary, "本地仿真审查完成");
    await assertRejectsWith((async () => extractCompleteJson("垃圾文本 {{{"))(), "INBOUND_JSON_PARSE_FAILED");
  } finally {
    cleanupTempDir(dir);
  }
});

// ---------- M1 最小登记：幂等、三 ID 核心入口强制、故障注入恢复 ----------

test("M1 登记：REGISTERED → 同 artifact 幂等 DUPLICATE；核心入口缺 execution/correlation 即拒", async () => {
  const dir = newTempDir("gptc-m1");
  try {
    const registryPath = join(dir, "registry.json");
    const artifactPath = join(dir, "reply.txt");
    writeFileSync(artifactPath, "本地仿真回复正文", "utf8");

    const first = registerArtifact({ registryPath, artifactPath, ...VALID_IDS, artifact_kind: "GPT_SCHEMA_VALIDATED_JSON", schema_validation: "PASS" });
    assert.equal(first.status, "REGISTERED");
    assert.equal(first.record.task_id, VALID_IDS.task_id);

    const second = registerArtifact({ registryPath, artifactPath, ...VALID_IDS });
    assert.equal(second.status, "DUPLICATE");
    assert.equal(second.artifact_id, first.artifact_id);

    await assertRejectsWith((async () => registerArtifact({ registryPath, artifactPath, task_id: VALID_IDS.task_id, correlation_id: VALID_IDS.correlation_id }))(), "M1_EXECUTION_ID_REQUIRED");
    await assertRejectsWith((async () => registerArtifact({ registryPath, artifactPath, task_id: VALID_IDS.task_id, execution_id: VALID_IDS.execution_id }))(), "M1_CORRELATION_ID_REQUIRED");
  } finally {
    cleanupTempDir(dir);
  }
});

test("M1 登记：同身份不同原文 → M1_ARTIFACT_HASH_CONFLICT（不重试）；未验证报告拒登记", async () => {
  const dir = newTempDir("gptc-m1-conflict");
  try {
    const registryPath = join(dir, "registry.json");
    const artifactPath = join(dir, "reply.txt");
    writeFileSync(artifactPath, "第一版正文", "utf8");
    registerArtifact({ registryPath, artifactPath, ...VALID_IDS });

    writeFileSync(artifactPath, "被改写的第二版正文", "utf8");
    await assertRejectsWith((async () => registerArtifactWithRetry({ registryPath, artifactPath, ...VALID_IDS }))(), "M1_ARTIFACT_HASH_CONFLICT");

    assertRejectsWith(
      (async () => registerArtifact({ registryPath: join(dir, "r2.json"), artifactPath, ...VALID_IDS, artifact_kind: "REVIEW_REPORT", schema_validation: "NOT_REQUESTED" }))(),
      "M1_UNVALIDATED_REVIEW_REPORT",
    );
  } finally {
    cleanupTempDir(dir);
  }
});

test("M1 登记：首次登记失败注入 → 同 artifact 重试恢复 RECOVERED，gpt_resend_count=0", async () => {
  const dir = newTempDir("gptc-m1-retry");
  process.env.AIEO_M1_FAIL_FIRST = "1";
  try {
    const registryPath = join(dir, "registry.json");
    const artifactPath = join(dir, "reply.txt");
    writeFileSync(artifactPath, "故障注入恢复测试正文", "utf8");
    const result = registerArtifactWithRetry({ registryPath, artifactPath, ...VALID_IDS });
    assert.equal(result.status, "RECOVERED");
    assert.equal(result.attempt_count, 2);
    assert.equal(result.gpt_resend_count, 0);
    assert.deepEqual(result.attempts.map((a) => a.result), ["FAILURE", "SUCCESS"]);
    assert.equal(result.attempts[0].error_code, "M1_INJECTED_FIRST_FAILURE");
  } finally {
    delete process.env.AIEO_M1_FAIL_FIRST;
    cleanupTempDir(dir);
  }
});

// ---------- Git 交接包（禁摘要继承） ----------

test("Git 交接包：summary/history/messages 禁止；三 ID 与 GitPointer 绑定一致；短指令 ≤1200", async () => {
  const { pointer } = buildTestPointer();
  const handoff = { ...VALID_IDS, git_pointer: pointer };
  const normalized = normalizeGitHandoff(handoff);
  assert.equal(normalized.git_pointer.commit_sha, pointer.commit_sha);
  assert.equal(normalized.git_pointer.media_type, pointer.media_type);
  assert.equal(normalized.summary, undefined);

  await assertRejectsWith((async () => normalizeGitHandoff({ ...handoff, summary: "旧会话摘要" }))(), "GIT_HANDOFF_SUMMARY_FORBIDDEN");
  await assertRejectsWith((async () => normalizeGitHandoff({ ...handoff, history: [] }))(), "GIT_HANDOFF_SUMMARY_FORBIDDEN");
  await assertRejectsWith((async () => normalizeGitHandoff({ ...handoff, task_id: "T-P1-002" }))(), "GIT_HANDOFF_BINDING_MISMATCH");

  const instruction = buildHandoffInstruction(handoff);
  assert.ok(instruction.includes("No prior summary is inherited"));
  assert.ok(instruction.includes(pointer.commit_sha));
  assert.ok(Buffer.byteLength(instruction, "utf8") <= 1200);

  // Schema 允许的最长 owner(100)/path(512) 组合会把整封短指令顶过 1200 字节 → 拒发。
  const oversizedPointer = {
    ...pointer,
    owner: "a".repeat(100),
    path: `tasks/${"a".repeat(480)}/manifest.json`,
  };
  const oversized = normalizeGitHandoff({ ...handoff, git_pointer: oversizedPointer });
  void oversized;
  await assertRejectsWith((async () => buildHandoffInstruction({ ...handoff, git_pointer: oversizedPointer }))(), "OUTBOUND_MESSAGE_TOO_LARGE");
});

// ---------- 会话存储与轮换决策 ----------

function makeStore(dir) {
  return new SessionStore({ filePath: join(dir, "sessions.json") });
}

test("会话存储：同 agent 单 ACTIVE、在途任务互斥、URL 捕获不一致拒绝、完成清位", async () => {
  const dir = newTempDir("gptc-store");
  try {
    const store = makeStore(dir);
    const session = store.create({ agent_id: "M2-R1" });
    assert.equal(session.status, "ACTIVE");
    await assertRejectsWith((async () => store.create({ agent_id: "M2-R1" }))(), "SESSION_ACTIVE_EXISTS");

    store.beginDispatch(session.session_id, "DISPATCH-1");
    await assertRejectsWith((async () => store.beginDispatch(session.session_id, "DISPATCH-2"))(), "SESSION_TASK_IN_FLIGHT");
    await assertRejectsWith((async () => store.completeDispatch(session.session_id, "DISPATCH-9"))(), "SESSION_DISPATCH_BINDING_MISMATCH");
    store.completeDispatch(session.session_id, "DISPATCH-1");
    assert.equal(store.get(session.session_id).in_flight_dispatch_id, null);

    store.captureUrl(session.session_id, "https://chatgpt.com/c/3f2a7b8c-1c41-4091-817f-7b7c0f3f314a");
    await assertRejectsWith((async () => store.captureUrl(session.session_id, "https://chatgpt.com/c/aaaaaaaa-bbbb-4ccc-8ddd-eeeeffff0001"))(), "SESSION_URL_CHANGED");

    await assertRejectsWith((async () => store.rotate({ oldSessionId: session.session_id, reason: "CONTEXT_LIMIT_STOP", handoff: {} }))(), "SESSION_ROTATION_NOT_REQUESTED");
  } finally {
    cleanupTempDir(dir);
  }
});

test("轮换决策：GitPointer 交接 + 旧轮已终结 → ROTATE；摘要/未终结/原因不符 → BLOCKED", async () => {
  const { pointer } = buildTestPointer();
  const suspended = { status: "SUSPENDED", rotation_required: true, stop_reason: "CONTEXT_LIMIT_STOP" };
  const evidence = { resolved: true, state: "GENERATION_ENDED" };

  const ok = decideSessionRotation(suspended, { reason: "CONTEXT_LIMIT_STOP", handoff: { git_pointer: pointer }, oldRoundEvidence: evidence });
  assert.equal(ok.decision, "ROTATE_TO_FRESH_BLANK_SESSION");
  assert.equal(ok.inherit_summary, false);

  assert.equal(decideSessionRotation({ status: "ACTIVE", rotation_required: false }, { reason: "CONTEXT_LIMIT_STOP", handoff: { git_pointer: pointer }, oldRoundEvidence: evidence }).code, "SESSION_ROTATION_NOT_REQUESTED");
  assert.equal(decideSessionRotation(suspended, { reason: "OTHER", handoff: { git_pointer: pointer }, oldRoundEvidence: evidence }).code, "SESSION_ROTATION_REASON_MISMATCH");
  assert.equal(decideSessionRotation(suspended, { reason: "CONTEXT_LIMIT_STOP", handoff: { git_pointer: pointer, summary: "s" }, oldRoundEvidence: evidence }).code, "GIT_HANDOFF_REQUIRED_NO_SUMMARY");
  assert.equal(decideSessionRotation(suspended, { reason: "CONTEXT_LIMIT_STOP", handoff: {}, oldRoundEvidence: evidence }).code, "GIT_HANDOFF_REQUIRED_NO_SUMMARY");
  const blocked = decideSessionRotation(suspended, { reason: "CONTEXT_LIMIT_STOP", handoff: { git_pointer: pointer }, oldRoundEvidence: { resolved: false, state: "SENT" } });
  assert.equal(blocked.code, "ROTATION_OLD_ROUND_UNRESOLVED");
  assert.ok(blocked.unblock_condition);
});

test("会话轮换：stop → rotate 生成新空白会话（不继承 URL/摘要），旧会话 EXPIRED", async () => {
  const dir = newTempDir("gptc-rotate");
  try {
    const store = makeStore(dir);
    const session = store.create({ agent_id: "M2-R2", session_url: "https://chatgpt.com/c/3f2a7b8c-1c41-4091-817f-7b7c0f3f314a" });
    store.stop(session.session_id, "CONTEXT_LIMIT_STOP");
    const stopped = store.get(session.session_id);
    assert.equal(stopped.status, "SUSPENDED");
    assert.equal(stopped.rotation_required, true);

    const next = store.rotate({ oldSessionId: session.session_id, reason: "CONTEXT_LIMIT_STOP", handoff: { git_pointer: { transport: "git_pointer" } } });
    assert.equal(next.status, "ACTIVE");
    assert.equal(next.session_url, null);
    assert.equal(next.rotated_from_session_id, session.session_id);
    assert.deepEqual(next.handoff, { git_pointer: { transport: "git_pointer" } });
    assert.equal(store.get(session.session_id).status, "EXPIRED");
  } finally {
    cleanupTempDir(dir);
  }
});

// ---------- C3 错误码映射 / C4 日志 / 配置 ----------

test("C3 映射：内部 code → 平台错误码（顺序敏感映射表抽查）", async () => {
  const cases = [
    ["OUTBOUND_MESSAGE_TOO_LARGE", "REQ-0001"],
    ["DISPATCH_M1_BINDING_INCOMPLETE", "REQ-0001"],
    ["INBOUND_TASK_BINDING_MISMATCH", "REQ-0002"],
    ["INBOUND_WINDOW_COMPLETENESS_UNPROVEN", "PROVIDER-0004"],
    ["SEND_ACCEPTANCE_UNCERTAIN", "PROVIDER-0004"],
    ["GENERATION_TIMEOUT", "PROVIDER-0001"],
    ["CONTEXT_LIMIT_STOP", "PROVIDER-0003"],
    ["SESSION_LOCK_CONFLICT", "RES-0002"],
    ["SESSION_URL_CHANGED", "REQ-0001"],
    ["GIT_POINTER_NOT_FOUND", "GIT-0002"],
    ["GIT_POINTER_PERMISSION_DENIED", "AUTH-0002"],
    ["GIT_HANDOFF_SUMMARY_FORBIDDEN", "GIT-0002"],
    ["M1_ARTIFACT_HASH_CONFLICT", "ART-0002"],
    ["M1_REGISTRY_WRITE_FAILED", "SYS-0002"],
    ["BROWSER_DRIVER_UNAVAILABLE", "PROVIDER-0002"],
    ["TOTALLY_UNKNOWN_CODE", "SYS-0001"],
  ];
  for (const [code, c3] of cases) {
    const error = controllerError(code, "x");
    assert.equal(error.c3_code, c3, `${code} → ${c3}`);
    assert.equal(error.status, "BLOCKED");
    const json = error.toJSON();
    assert.equal(json.code, c3);
    assert.equal(json.internal_code, code);
  }
});

test("C4 日志：NDJSON 必填字段、敏感字段拒写、event/level 校验、审计写失败抛错", async () => {
  const dir = newTempDir("gptc-log");
  try {
    const lines = [];
    const logger = createLogger({ logDir: join(dir, "logs"), env: { AIEO_ENV: "test" }, clock: () => new Date("2026-11-13T08:00:00.000Z") });
    const record = logger.log({ event: "dispatch.completed", message: "完成", task_id: VALID_IDS.task_id, operation: "dispatch", result: "SUCCESS" });
    assert.equal(record.timestamp, "2026-11-13T08:00:00.000Z");
    assert.equal(record.service, "gpt_controller");
    assert.equal(record.module, "M2");
    assert.equal(record.env, "test");

    const captured = [];
    const memLogger = createLogger({ env: {}, writeImpl: (path, line) => captured.push(line) });
    memLogger.log({ event: "x.y", message: "m", details: { nested: true } });
    const parsed = JSON.parse(captured[0]);
    for (const field of ["timestamp", "level", "service", "module", "event", "message", "env"]) {
      assert.ok(field in parsed, `缺少 C4 必填字段 ${field}`);
    }

    await assertRejectsWith((async () => memLogger.log({ event: "bad", message: "m", token: "should-not-log" }))(), "LOG_SENSITIVE_FIELD_FORBIDDEN");
    await assertRejectsWith((async () => memLogger.log({ message: "no event" }))(), "LOG_EVENT_REQUIRED");
    await assertRejectsWith((async () => memLogger.log({ event: "e", message: "m", level: "VERBOSE" }))(), "LOG_LEVEL_INVALID");
  } finally {
    cleanupTempDir(dir);
  }
});

test("配置：stableReadIntervalMs < 3000 拒绝；env 覆盖优先于默认值", async () => {
  await assertRejectsWith((async () => resolveControllerConfig({ stableReadIntervalMs: 2999 }))(), "GPT_CONTROLLER_CONFIG_INVALID");
  const cfg = resolveControllerConfig({}, { AIEO_GPT_CONTROLLER_GENERATION_TIMEOUT_MS: "5000", AIEO_GPT_CONTROLLER_CONFIRM_WINDOW_MS: "0" });
  assert.equal(cfg.generationTimeoutMs, 5000);
  assert.equal(cfg.confirmWindowMs, 0);
  assert.equal(cfg.stableReadIntervalMs, 3000);
  assert.equal(resolveControllerConfig().generationTimeoutMs, 300000);
});

test("包入口：公共 API 可导入（编排/双验/采集/锁/登记/GitPointer）", async () => {
  const required = [
    "runDispatch", "normalizeDispatchRequest", "meterOutboundMessage",
    "verifySendAcceptance", "sendWithAcceptance", "assertPreSendGate",
    "waitForGenerationEnd", "assertFinalQuietness",
    "readReplySnapshot", "createInboundRangeCollector", "compareInboundSnapshots",
    "persistInboundArtifacts", "validateInboundJsonArtifact",
    "acquireSessionLock", "withSessionLock", "SessionStore", "decideSessionRotation",
    "registerArtifact", "registerArtifactWithRetry",
    "validateGitPointer", "readGitPointer", "buildGitPointerManifest", "createGitPointer",
    "normalizeGitHandoff", "readPublicGitHandoff", "buildHandoffInstruction",
    "checkDomContract", "detectContextLimit", "stopIfContextLimit", "rotateIfContextLimit", "beginFreshBlankSession",
    "assertOutboundWithinLimit", "measureOutboundBytes", "buildOutboundMessage",
    "createLogger", "resolveControllerConfig", "controllerError",
  ];
  for (const name of required) {
    assert.equal(typeof controllerApi[name], "function", `index.mjs 缺少导出 ${name}`);
  }
  assert.ok(Object.keys(controllerApi).length >= 80);
});
