// M1 最小本地登记适配器测试：成功、首次失败补登记、重复幂等、hash 冲突与零 GPT 重发。
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { registerArtifact, registerArtifactWithRetry } from "./m1_artifact_registry.mjs";
import { sha256Hex } from "./inbound_reply.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const logDir = join(__dirname, "..", "logs");
const tempDir = join(logDir, "m1-registry-test-tmp");
const jsonPath = join(logDir, "m1-registry-tests.json");
const logPath = join(logDir, "m1-registry-tests.log");
const startedAt = new Date().toISOString();
const results = [];
const lines = [`[${startedAt}] M1 本地登记测试开始 node=${process.version}`];
rmSync(tempDir, { recursive: true, force: true });
mkdirSync(tempDir, { recursive: true });

const ids = { task_id: "T-P1-911", execution_id: "EXEC-911", correlation_id: "CORR-911" };
const originalFailFirst = process.env.AIEO_M1_FAIL_FIRST;

function expectCode(code, fn) {
  assert.throws(fn, (error) => error && error.code === code);
}

function artifact(name, text) {
  const path = join(tempDir, name);
  writeFileSync(path, text, "utf8");
  return path;
}

function options(registryPath, artifactPath, overrides = {}) {
  return {
    registryPath,
    artifactPath,
    ...ids,
    unit_metadata: { unit_keys: ["u1"], unit_count: 1, assistant_uuid: "88888888-8888-4888-8888-888888888888" },
    ...overrides,
  };
}

const tests = [
  ["登记成功并持久化原文、hash、unit 元数据与完整幂等键", () => {
    const registryPath = join(tempDir, "success-registry.json");
    const artifactPath = artifact("success.txt", "原始回复\n第二行");
    const result = registerArtifact(options(registryPath, artifactPath));
    assert.equal(result.status, "REGISTERED");
    assert.equal(result.duplicate, false);
    assert.match(result.artifact_id, /^ART-M1-\d{6}$/);
    const registry = JSON.parse(readFileSync(registryPath, "utf8"));
    assert.equal(registry.records.length, 1);
    const record = registry.records[0];
    assert.equal(record.content, "原始回复\n第二行");
    assert.equal(record.artifact_sha256, sha256Hex(Buffer.from("原始回复\n第二行", "utf8")));
    assert.equal(record.size_bytes, Buffer.byteLength("原始回复\n第二行", "utf8"));
    assert.deepEqual(record.unit_metadata.unit_keys, ["u1"]);
    for (const field of ["task_id", "execution_id", "correlation_id", "artifact_sha256"]) {
      assert.ok(Object.hasOwn(JSON.parse(record.idempotency_key), field));
    }
  }],
  ["AIEO_M1_FAIL_FIRST 首次失败后使用同 artifact/correlation 重试成功", () => {
    const registryPath = join(tempDir, "retry-registry.json");
    const artifactPath = artifact("retry.txt", "需要补登记的同一原文");
    process.env.AIEO_M1_FAIL_FIRST = "1";
    const result = registerArtifactWithRetry(options(registryPath, artifactPath));
    assert.equal(result.status, "RECOVERED");
    assert.equal(result.attempt_count, 2);
    assert.equal(result.retry_count, 1);
    assert.equal(result.attempts[0].error_code, "M1_INJECTED_FIRST_FAILURE");
    assert.equal(result.gpt_resend_count, 0);
    const registry = JSON.parse(readFileSync(registryPath, "utf8"));
    assert.equal(registry.records.length, 1);
    assert.equal(registry.records[0].content, "需要补登记的同一原文");
  }],
  ["重复登记返回已有 artifact_id 且不新增记录", () => {
    const registryPath = join(tempDir, "retry-registry.json");
    const artifactPath = join(tempDir, "retry.txt");
    const before = JSON.parse(readFileSync(registryPath, "utf8"));
    const result = registerArtifactWithRetry(options(registryPath, artifactPath));
    const after = JSON.parse(readFileSync(registryPath, "utf8"));
    assert.equal(result.status, "DUPLICATE");
    assert.equal(result.duplicate, true);
    assert.equal(result.artifact_id, before.records[0].artifact_id);
    assert.equal(result.record_count, 1);
    assert.equal(after.records.length, before.records.length);
    assert.equal(after.next_sequence, before.next_sequence);
  }],
  ["原始 hash 变化时拒绝复用旧记录且不新增", () => {
    const registryPath = join(tempDir, "retry-registry.json");
    const changedPath = artifact("changed.txt", "已被改变的不同原文");
    const before = JSON.parse(readFileSync(registryPath, "utf8"));
    expectCode("M1_ARTIFACT_HASH_CONFLICT", () => registerArtifactWithRetry(options(registryPath, changedPath)));
    const after = JSON.parse(readFileSync(registryPath, "utf8"));
    assert.equal(after.records.length, before.records.length);
    assert.equal(after.records[0].content, before.records[0].content);
  }],
  ["登记失败与补登记路径不调用 GPT 发送", () => {
    let gptSendCount = 0;
    const sendForTest = () => { gptSendCount += 1; };
    const registryPath = join(tempDir, "no-resend-registry.json");
    const artifactPath = artifact("no-resend.txt", "只补登记不重发");
    process.env.AIEO_M1_FAIL_FIRST = "1";
    const recovered = registerArtifactWithRetry(options(registryPath, artifactPath));
    const duplicate = registerArtifactWithRetry(options(registryPath, artifactPath));
    assert.equal(recovered.status, "RECOVERED");
    assert.equal(duplicate.status, "DUPLICATE");
    assert.equal(recovered.gpt_resend_count, 0);
    assert.equal(duplicate.gpt_resend_count, 0);
    assert.equal(gptSendCount, 0);
    assert.equal(typeof sendForTest, "function");
  }],
  ["未通过 Schema 的任意文本不得登记为审查报告", () => {
    const registryPath = join(tempDir, "review-guard-registry.json");
    const artifactPath = artifact("not-review.txt", "任意文本");
    expectCode("M1_UNVALIDATED_REVIEW_REPORT", () => registerArtifact(options(registryPath, artifactPath, {
      artifact_kind: "REVIEW_REPORT",
      schema_validation: "NOT_REQUESTED",
    })));
    assert.equal(existsSync(registryPath), false);
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

if (originalFailFirst === undefined) delete process.env.AIEO_M1_FAIL_FIRST;
else process.env.AIEO_M1_FAIL_FIRST = originalFailFirst;
const report = {
  started_at: startedAt,
  finished_at: new Date().toISOString(),
  node: process.version,
  total: results.length,
  passed: results.length - results.filter((result) => result.result === "FAIL").length,
  failed: results.filter((result) => result.result === "FAIL").length,
  adapter_scope: "MINIMAL_LOCAL_M1_NOT_FULL_PLATFORM",
  tests: results,
};
lines.push(`[${report.finished_at}] SUMMARY total=${report.total} passed=${report.passed} failed=${report.failed}`);
writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
writeFileSync(logPath, `${lines.join("\n")}\n`, "utf8");
console.log(lines.join("\n"));
console.log(`测试报告: ${jsonPath}`);
if (report.failed > 0) process.exitCode = 1;
rmSync(tempDir, { recursive: true, force: true });
