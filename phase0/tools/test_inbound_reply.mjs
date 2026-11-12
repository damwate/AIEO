// 入站纯函数、虚拟列表区间、JSON/Schema/绑定与 artifact 的本地可复现测试；完整日志与 JSON 同源生成。
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CHATGPT_AUX_PREFIX,
  compareInboundSnapshots,
  createInboundRangeCollector,
  extractCompleteJson,
  persistInboundArtifacts,
  proveAdjacentWindowOverlap,
  selectInboundReply,
  sha256Hex,
  validateInboundJsonArtifact,
  verifyArtifactFile,
} from "./inbound_reply.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const logDir = join(__dirname, "..", "logs");
const tempDir = join(logDir, "rework-inbound-test-tmp");
const jsonPath = join(logDir, "rework-inbound-tests.json");
const logPath = join(logDir, "rework-inbound-tests.log");
const pocSchemaPath = join(__dirname, "..", "..", "contracts", "v1.0", "gpt-inbound-poc.schema.json");
const startedAt = new Date().toISOString();
const results = [];
const lines = [`[${startedAt}] 入站本地测试开始 node=${process.version}`];
mkdirSync(logDir, { recursive: true });
rmSync(tempDir, { recursive: true, force: true });
mkdirSync(tempDir, { recursive: true });

const baseDom = [
  { key: "turn-0:user", role: "user", text: "旧问题", assistantUuid: null },
  { key: "turn-0:assistant", role: "assistant", text: "旧回复", assistantUuid: "00000000-0000-4000-8000-000000000000" },
  { key: "turn-1:user", role: "user", text: "本次问题", assistantUuid: null },
  { key: "turn-1:assistant:0", role: "assistant", text: "  原始第一段  \n", assistantUuid: null },
  { key: "turn-1:assistant:1", role: "assistant", text: "\n第二段\n", assistantUuid: "11111111-1111-4111-8111-111111111111" },
  { key: "turn-2:user", role: "user", text: "下一问题", assistantUuid: null },
  { key: "turn-2:assistant", role: "assistant", text: "不得混入", assistantUuid: "22222222-2222-4222-8222-222222222222" },
];

function expectCode(code, fn) {
  assert.throws(fn, (error) => error && error.code === code);
}

function completeSnapshot(dom = baseDom, userUnitKey = "turn-1:user", atBottom = false) {
  const collector = createInboundRangeCollector(userUnitKey);
  collector.ingest(dom, { atBottom });
  const materialized = collector.build();
  return { ...selectInboundReply(materialized.units, userUnitKey), range_proof: materialized.range_proof };
}

function snapshotFromWindows(windows, userUnitKey = "turn-1:user", bottomAtLast = false) {
  const collector = createInboundRangeCollector(userUnitKey);
  windows.forEach((window, index) => collector.ingest(window, { atBottom: bottomAtLast && index === windows.length - 1 }));
  const materialized = collector.build();
  return { ...selectInboundReply(materialized.units, userUnitKey), range_proof: materialized.range_proof };
}

const pocJson = {
  test: "INBOUND_SCHEMA_M1_POC",
  text: "汉".repeat(1000),
  task_id: "T-P1-901",
  execution_id: "EXEC-901",
  correlation_id: "CORR-901",
};
const expectedPocIds = {
  task_id: pocJson.task_id,
  execution_id: pocJson.execution_id,
  correlation_id: pocJson.correlation_id,
};

const tests = [
  ["正常单 assistant unit，保留原始文本并截断于下一 user", () => {
    const dom = [baseDom[2], { ...baseDom[4], key: "turn-1:assistant" }, baseDom[5], baseDom[6]];
    const snapshot = selectInboundReply(dom, "turn-1:user");
    assert.equal(snapshot.unit_count, 1);
    assert.equal(snapshot.reply, "\n第二段\n");
    assert.equal(snapshot.next_user_unit_key, "turn-2:user");
    assert.equal(snapshot.assistant_uuid, "11111111-1111-4111-8111-111111111111");
  }],
  ["多 assistant unit 按 DOM 顺序以单换行合成且忽略 tool unit", () => {
    const dom = [
      ...baseDom.slice(0, 4),
      { key: "turn-1:tool", role: "tool", text: "工具输出不得混入", assistantUuid: null },
      ...baseDom.slice(4),
    ];
    const snapshot = selectInboundReply(dom, "turn-1:user");
    assert.deepEqual(snapshot.unit_keys, ["turn-1:assistant:0", "turn-1:assistant:1"]);
    assert.equal(snapshot.unit_count, 2);
    assert.equal(snapshot.reply, "  原始第一段  \n\n\n第二段\n");
    assert.equal(snapshot.units[0].size_bytes, Buffer.byteLength("  原始第一段  \n", "utf8"));
  }],
  ["发送起点因虚拟列表缺失时失败", () => {
    expectCode("INBOUND_START_UNIT_MISSING", () => selectInboundReply(baseDom.slice(3), "turn-1:user"));
    const collector = createInboundRangeCollector("turn-1:user");
    expectCode("INBOUND_START_UNIT_MISSING", () => collector.ingest(baseDom.slice(3), { atBottom: true }));
  }],
  ["多窗口多 assistant unit 以重叠 key 实体化并保序", () => {
    const a = { key: "a", role: "assistant", text: "甲", assistantUuid: null };
    const b = { key: "b", role: "assistant", text: "乙", assistantUuid: null };
    const c = { key: "c", role: "assistant", text: "丙", assistantUuid: null };
    const d = { key: "d", role: "assistant", text: "丁", assistantUuid: "44444444-4444-4444-8444-444444444444" };
    const next = { key: "next:user", role: "user", text: "新问题", assistantUuid: null };
    const snapshot = snapshotFromWindows([
      [baseDom[2], a, b],
      [b, c, d],
      [d, next],
    ]);
    assert.deepEqual(snapshot.unit_keys, ["a", "b", "c", "d"]);
    assert.equal(snapshot.reply, "甲\n乙\n丙\n丁");
    assert.equal(snapshot.next_user_unit_key, "next:user");
    assert.equal(snapshot.range_proof.complete, true);
    assert.deepEqual(snapshot.range_proof.windows[1].overlap_keys, ["b"]);
    assert.deepEqual(snapshot.range_proof.windows[2].overlap_keys, ["d"]);
  }],
  ["没有下一 user 时必须真实到底才完成", () => {
    const tail = { ...baseDom[4], key: "tail", assistantUuid: "55555555-5555-4555-8555-555555555555" };
    const collector = createInboundRangeCollector("turn-1:user");
    const state = collector.ingest([baseDom[2], baseDom[3]], { atBottom: false });
    assert.equal(state.complete, false);
    expectCode("INBOUND_RANGE_INCOMPLETE", () => collector.build());
    collector.ingest([baseDom[3], tail], { atBottom: true, scrollable: true });
    const result = collector.build();
    assert.equal(result.range_proof.end_reason, "DOM_BOTTOM");
    assert.equal(result.units.at(-1).key, "tail");
  }],
  ["起点存在但中间 assistant unit 被裁掉时窗口跳跃必须失败", () => {
    const a = { key: "a", role: "assistant", text: "保留段", assistantUuid: null };
    const c = { key: "c", role: "assistant", text: "尾段", assistantUuid: "66666666-6666-4666-8666-666666666666" };
    const collector = createInboundRangeCollector("turn-1:user");
    collector.ingest([baseDom[2], a], { atBottom: false });
    // b 被虚拟列表裁掉，下一窗直接从 c 开始；无重叠不能宣称连续。
    expectCode("INBOUND_WINDOW_DISCONTINUOUS", () => collector.ingest([c], { atBottom: true }));
    expectCode("INBOUND_RANGE_INCOMPLETE", () => collector.build());
  }],
  ["残缺 DOM 即使两次 key/hash 相同，没有完整区间证明也不得 stable", () => {
    const cropped = [baseDom[2], baseDom[4]];
    const first = selectInboundReply(cropped, "turn-1:user");
    const second = selectInboundReply(structuredClone(cropped), "turn-1:user");
    expectCode("INBOUND_UNSTABLE_READ", () => compareInboundSnapshots(first, second, 3000));
    try {
      compareInboundSnapshots(first, second, 3000);
    } catch (error) {
      assert.equal(error.details.checks.first_range_complete, false);
      assert.equal(error.details.checks.second_range_complete, false);
    }
  }],
  ["可滚动单窗口即使起点和尾部都在 DOM 也不能直接判完整", () => {
    const collector = createInboundRangeCollector("turn-1:user");
    const cropped = [baseDom[2], baseDom[4]]; // 中间 assistant:0 被裁掉
    const state = collector.ingest(cropped, { atBottom: true, scrollable: true });
    assert.equal(state.complete, false);
    assert.equal(state.deferred_endpoint, true);
    expectCode("INBOUND_RANGE_INCOMPLETE", () => collector.build());
  }],
  ["窗口无重叠、重叠顺序矛盾或重叠原文变化均失败", () => {
    expectCode("INBOUND_WINDOW_DISCONTINUOUS", () => proveAdjacentWindowOverlap([baseDom[2], baseDom[3]], [baseDom[4]]));
    expectCode("INBOUND_WINDOW_OVERLAP_INCONSISTENT", () => proveAdjacentWindowOverlap(
      [baseDom[2], baseDom[3], baseDom[4]],
      [baseDom[4], baseDom[3]],
    ));
    expectCode("INBOUND_WINDOW_OVERLAP_CHANGED", () => proveAdjacentWindowOverlap(
      [baseDom[2], baseDom[3]],
      [{ ...baseDom[3], text: "被改动" }],
    ));
  }],
  ["不连续采集失败后不得续用，重新完整连续采集可恢复", () => {
    const a = { key: "a", role: "assistant", text: "甲", assistantUuid: null };
    const b = { key: "b", role: "assistant", text: "乙", assistantUuid: null };
    const c = { key: "c", role: "assistant", text: "丙", assistantUuid: "77777777-7777-4777-8777-777777777777" };
    const bad = createInboundRangeCollector("turn-1:user");
    bad.ingest([baseDom[2], a], { atBottom: false });
    expectCode("INBOUND_WINDOW_DISCONTINUOUS", () => bad.ingest([c], { atBottom: true }));
    expectCode("INBOUND_RANGE_INCOMPLETE", () => bad.build());
    const recovered = snapshotFromWindows([[baseDom[2], a, b], [b, c]], "turn-1:user", true);
    assert.deepEqual(recovered.unit_keys, ["a", "b", "c"]);
    assert.equal(recovered.range_proof.complete, true);
  }],
  ["unit 文本变化时全文稳定比较失败", () => {
    const first = completeSnapshot();
    const changed = baseDom.map((unit) => unit.key === "turn-1:assistant:0" ? { ...unit, text: `${unit.text}变化` } : unit);
    const second = completeSnapshot(changed);
    expectCode("INBOUND_UNSTABLE_READ", () => compareInboundSnapshots(first, second, 3000));
  }],
  ["unit 新增或 key 列表变化时稳定比较失败", () => {
    const first = completeSnapshot();
    const added = [
      ...baseDom.slice(0, 4),
      { key: "turn-1:assistant:new", role: "assistant", text: "新增", assistantUuid: null },
      ...baseDom.slice(4),
    ];
    const second = completeSnapshot(added);
    expectCode("INBOUND_UNSTABLE_READ", () => compareInboundSnapshots(first, second, 3000));
  }],
  ["尾部 assistant UUID 变化或读取间隔不足均失败", () => {
    const first = completeSnapshot();
    const changed = baseDom.map((unit) => unit.key === "turn-1:assistant:1" ? { ...unit, assistantUuid: "33333333-3333-4333-8333-333333333333" } : unit);
    const second = completeSnapshot(changed);
    expectCode("INBOUND_UNSTABLE_READ", () => compareInboundSnapshots(first, second, 3000));
    expectCode("INBOUND_UNSTABLE_READ", () => compareInboundSnapshots(first, first, 2999));
  }],
  ["相同完整快照双读通过并记录每个全文哈希与连续证明", () => {
    const first = completeSnapshot();
    const second = completeSnapshot(structuredClone(baseDom));
    const stable = compareInboundSnapshots(first, second, 3001);
    assert.equal(stable.stable, true);
    assert.equal(stable.checks.first_range_complete, true);
    assert.equal(stable.first.unit_text_sha256.length, 2);
    assert.equal(stable.first.unit_text_sha256[0].sha256, sha256Hex(Buffer.from(baseDom[3].text, "utf8")));
  }],
  ["长回复 artifact 原文不截断且 raw/reply 回读 hash size 一致", () => {
    const longText = `\n前导空白  ${"汉".repeat(1500)}\n尾部空白  `;
    const dom = [
      baseDom[2],
      { key: "turn-long:assistant", role: "assistant", text: longText, assistantUuid: "44444444-4444-4444-8444-444444444444" },
    ];
    const snapshot = completeSnapshot(dom, "turn-1:user", true);
    assert.ok(Buffer.byteLength(snapshot.reply, "utf8") > 1200);
    const artifacts = persistInboundArtifacts({ directory: tempDir, snapshot, extractedAt: startedAt });
    const replyBytes = readFileSync(artifacts.reply.path);
    assert.equal(replyBytes.toString("utf8"), longText);
    assert.equal(artifacts.reply.size_bytes, replyBytes.length);
    assert.equal(artifacts.reply.artifact_sha256, sha256Hex(replyBytes));
    assert.equal(artifacts.reply.readback_verified, true);
    assert.equal(artifacts.raw_units.readback_verified, true);
    const raw = JSON.parse(readFileSync(artifacts.raw_units.path, "utf8"));
    assert.equal(raw.units[0].text, longText);
    assert.equal(raw.units[0].key, "turn-long:assistant");
    assert.equal(raw.range_proof.complete, true);
    results.artifactEvidence = {
      reply_bytes: artifacts.reply.size_bytes,
      reply_sha256: artifacts.reply.artifact_sha256,
      raw_units_bytes: artifacts.raw_units.size_bytes,
      raw_units_sha256: artifacts.raw_units.artifact_sha256,
    };
  }],
  ["无区间证明的 artifact 不得进入成功持久化", () => {
    const snapshot = selectInboundReply(baseDom, "turn-1:user");
    expectCode("ARTIFACT_RANGE_INCOMPLETE", () => persistInboundArtifacts({ directory: tempDir, snapshot, extractedAt: startedAt }));
  }],
  ["写盘后内容被改动时 hash size 回读负例必须失败", () => {
    const filePath = join(tempDir, "tampered-reply.txt");
    const expected = Buffer.from("原始 artifact", "utf8");
    writeFileSync(filePath, expected);
    writeFileSync(filePath, Buffer.from("已被篡改的 artifact", "utf8"));
    expectCode("ARTIFACT_READBACK_MISMATCH", () => verifyArtifactFile(filePath, expected));
  }],
  ["精确 ChatGPT 辅助前缀可移除，全文 JSON/POC Schema/三个 ID 绑定通过", () => {
    const filePath = join(tempDir, "poc-valid.txt");
    writeFileSync(filePath, `${CHATGPT_AUX_PREFIX}\n\n${JSON.stringify(pocJson)}`, "utf8");
    const validated = validateInboundJsonArtifact({ artifactPath: filePath, schemaPath: pocSchemaPath, expectedIds: expectedPocIds });
    assert.equal(validated.status, "PASS");
    assert.equal(validated.json.auxiliary_prefix_removed, true);
    assert.equal(validated.schema.status, "PASS");
    assert.equal(validated.binding.task_id, "PASS");
    assert.equal(validated.binding.execution_id, "PASS");
    assert.equal(validated.binding.correlation_id, "PASS");
    assert.deepEqual(validated.parsed_json, pocJson);
  }],
  ["JSON 不从第一个左括号截取，额外前后文本均失败", () => {
    expectCode("INBOUND_JSON_PARSE_FAILED", () => extractCompleteJson(`说明\n${JSON.stringify(pocJson)}`));
    expectCode("INBOUND_JSON_PARSE_FAILED", () => extractCompleteJson(`${JSON.stringify(pocJson)}\n尾部说明`));
    expectCode("INBOUND_JSON_PARSE_FAILED", () => extractCompleteJson(`ChatGPT 说:\n${JSON.stringify(pocJson)}`));
  }],
  ["Schema 失败和任一任务 ID 绑定不一致均失败", () => {
    const invalidPath = join(tempDir, "poc-invalid-schema.txt");
    writeFileSync(invalidPath, JSON.stringify({ ...pocJson, text: "太短" }), "utf8");
    expectCode("INBOUND_SCHEMA_VALIDATION_FAILED", () => validateInboundJsonArtifact({ artifactPath: invalidPath, schemaPath: pocSchemaPath, expectedIds: expectedPocIds }));
    const validPath = join(tempDir, "poc-binding.txt");
    for (const field of ["task_id", "execution_id", "correlation_id"]) {
      writeFileSync(validPath, JSON.stringify(pocJson), "utf8");
      expectCode("INBOUND_TASK_BINDING_MISMATCH", () => validateInboundJsonArtifact({
        artifactPath: validPath,
        schemaPath: pocSchemaPath,
        expectedIds: { ...expectedPocIds, [field]: `${expectedPocIds[field]}-WRONG` },
      }));
    }
  }],
  ["未提供 Schema 时 JSON/Schema/绑定全部 NOT_REQUESTED", () => {
    const filePath = join(tempDir, "not-requested.txt");
    writeFileSync(filePath, "任意文本，不是已验证报告", "utf8");
    const result = validateInboundJsonArtifact({ artifactPath: filePath, schemaPath: null, expectedIds: expectedPocIds });
    assert.equal(result.status, "NOT_REQUESTED");
    assert.equal(result.json.status, "NOT_REQUESTED");
    assert.equal(result.schema.status, "NOT_REQUESTED");
    assert.equal(result.binding.status, "NOT_REQUESTED");
    assert.equal(result.parsed_json, null);
  }],
];

for (const [name, fn] of tests) {
  try {
    await fn();
    results.push({ name, result: "PASS" });
    lines.push(`[${new Date().toISOString()}] PASS ${name}`);
  } catch (error) {
    results.push({ name, result: "FAIL", error: error.message, stack: error.stack });
    lines.push(`[${new Date().toISOString()}] FAIL ${name}: ${error.stack || error.message}`);
  }
}

rmSync(tempDir, { recursive: true, force: true });
const failed = results.filter((result) => result.result === "FAIL").length;
const report = {
  started_at: startedAt,
  finished_at: new Date().toISOString(),
  node: process.version,
  total: results.length,
  passed: results.length - failed,
  failed,
  artifact_evidence: results.artifactEvidence ?? null,
  tests: results,
};
lines.push(`[${report.finished_at}] SUMMARY total=${report.total} passed=${report.passed} failed=${failed}`);
writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
writeFileSync(logPath, `${lines.join("\n")}\n`, "utf8");
console.log(lines.join("\n"));
console.log(`测试报告: ${jsonPath}`);
if (failed > 0) process.exitCode = 1;
