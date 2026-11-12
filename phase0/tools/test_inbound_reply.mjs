// 入站纯函数与 artifact 的本地可复现测试，同时写人读日志和机器 JSON 结果。
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  compareInboundSnapshots,
  persistInboundArtifacts,
  selectInboundReply,
  sha256Hex,
  verifyArtifactFile,
} from "./inbound_reply.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const logDir = join(__dirname, "..", "logs");
const tempDir = join(logDir, "rework-inbound-test-tmp");
const jsonPath = join(logDir, "rework-inbound-tests.json");
const logPath = join(logDir, "rework-inbound-tests.log");
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
  }],
  ["unit 文本变化时全文稳定比较失败", () => {
    const first = selectInboundReply(baseDom, "turn-1:user");
    const changed = baseDom.map((unit) => unit.key === "turn-1:assistant:0" ? { ...unit, text: `${unit.text}变化` } : unit);
    const second = selectInboundReply(changed, "turn-1:user");
    expectCode("INBOUND_UNSTABLE_READ", () => compareInboundSnapshots(first, second, 3000));
  }],
  ["unit 新增或 key 列表变化时稳定比较失败", () => {
    const first = selectInboundReply(baseDom, "turn-1:user");
    const added = [
      ...baseDom.slice(0, 4),
      { key: "turn-1:assistant:new", role: "assistant", text: "新增", assistantUuid: null },
      ...baseDom.slice(4),
    ];
    const second = selectInboundReply(added, "turn-1:user");
    expectCode("INBOUND_UNSTABLE_READ", () => compareInboundSnapshots(first, second, 3000));
  }],
  ["尾部 assistant UUID 变化或读取间隔不足均失败", () => {
    const first = selectInboundReply(baseDom, "turn-1:user");
    const changed = baseDom.map((unit) => unit.key === "turn-1:assistant:1" ? { ...unit, assistantUuid: "33333333-3333-4333-8333-333333333333" } : unit);
    const second = selectInboundReply(changed, "turn-1:user");
    expectCode("INBOUND_UNSTABLE_READ", () => compareInboundSnapshots(first, second, 3000));
    expectCode("INBOUND_UNSTABLE_READ", () => compareInboundSnapshots(first, first, 2999));
  }],
  ["相同完整快照双读通过并记录每个全文哈希", () => {
    const first = selectInboundReply(baseDom, "turn-1:user");
    const second = selectInboundReply(structuredClone(baseDom), "turn-1:user");
    const stable = compareInboundSnapshots(first, second, 3001);
    assert.equal(stable.stable, true);
    assert.equal(stable.first.unit_text_sha256.length, 2);
    assert.equal(stable.first.unit_text_sha256[0].sha256, sha256Hex(Buffer.from(baseDom[3].text, "utf8")));
  }],
  ["长回复 artifact 原文不截断且 raw/reply 回读 hash size 一致", () => {
    const longText = `\n前导空白  ${"汉".repeat(1500)}\n尾部空白  `;
    const dom = [
      baseDom[2],
      { key: "turn-long:assistant", role: "assistant", text: longText, assistantUuid: "44444444-4444-4444-8444-444444444444" },
    ];
    const snapshot = selectInboundReply(dom, "turn-1:user");
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
    results.artifactEvidence = {
      reply_bytes: artifacts.reply.size_bytes,
      reply_sha256: artifacts.reply.artifact_sha256,
      raw_units_bytes: artifacts.raw_units.size_bytes,
      raw_units_sha256: artifacts.raw_units.artifact_sha256,
    };
  }],
  ["写盘后内容被改动时 hash size 回读负例必须失败", () => {
    const filePath = join(tempDir, "tampered-reply.txt");
    const expected = Buffer.from("原始 artifact", "utf8");
    writeFileSync(filePath, expected);
    writeFileSync(filePath, Buffer.from("已被篡改的 artifact", "utf8"));
    expectCode("ARTIFACT_READBACK_MISMATCH", () => verifyArtifactFile(filePath, expected));
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
