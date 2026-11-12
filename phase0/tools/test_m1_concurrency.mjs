// 至少四个真实 Node 进程并发验证 M1 OS 句柄锁、序号唯一、幂等及 hash 冲突。
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const logDir = join(__dirname, "..", "logs");
const evidenceDir = join(logDir, "m1-concurrency-evidence");
const jsonPath = join(logDir, "m1-concurrency-tests.json");
const logPath = join(logDir, "m1-concurrency-tests.log");
const workerPath = join(__dirname, "m1_register_worker.mjs");
const startedAt = new Date().toISOString();
rmSync(evidenceDir, { recursive: true, force: true });
mkdirSync(evidenceDir, { recursive: true });

function runWorker(group, registryPath, artifactPath, ids, worker) {
  const output = join(evidenceDir, `${group}-${worker}.json`);
  const args = [
    workerPath,
    "--registry", registryPath,
    "--artifact", artifactPath,
    "--task-id", ids.task_id,
    "--execution-id", ids.execution_id,
    "--correlation-id", ids.correlation_id,
    "--worker", worker,
    "--output", output,
  ];
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: __dirname,
      env: { ...process.env, AIEO_M1_REGISTRY_LOCK_TIMEOUT_MS: "60000" },
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${group}/${worker} 超过 90 秒`));
    }, 90000);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      const parsed = existsSync(output) ? JSON.parse(readFileSync(output, "utf8")) : null;
      resolve({ worker, pid: child.pid, exit_code: code, signal, stdout, stderr, output_path: output, result: parsed });
    });
  });
}

async function runGroup(group, registryName, artifacts, idsForIndex) {
  const registryPath = join(evidenceDir, registryName);
  const workers = await Promise.all(artifacts.map((artifactPath, index) => runWorker(
    group,
    registryPath,
    artifactPath,
    idsForIndex(index),
    `w${index + 1}`,
  )));
  const registry = JSON.parse(readFileSync(registryPath, "utf8"));
  return { registry_path: registryPath, lockfile_path: `${registryPath}.lockfile`, registry, workers };
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
let distinct;
let duplicate;
let conflict;

test("4 个真实进程并发登记不同 artifact：ID 唯一且记录不丢失", async () => {
  const artifacts = Array.from({ length: 4 }, (_, index) => {
    const path = join(evidenceDir, `distinct-${index + 1}.txt`);
    writeFileSync(path, `独立 artifact ${index + 1}\n`, "utf8");
    return path;
  });
  distinct = await runGroup("distinct", "distinct-registry.json", artifacts, (index) => ({
    task_id: `T-P1-93${index}`,
    execution_id: `EXEC-93${index}`,
    correlation_id: `CORR-93${index}`,
  }));
  assert.ok(distinct.workers.every((worker) => worker.exit_code === 0 && worker.result?.result === "SUCCESS"));
  assert.equal(distinct.registry.records.length, 4);
  assert.equal(distinct.registry.next_sequence, 5);
  assert.equal(new Set(distinct.registry.records.map((record) => record.artifact_id)).size, 4);
  assert.equal(new Set(distinct.registry.records.map((record) => record.idempotency_key)).size, 4);
  assert.deepEqual(
    [...distinct.registry.records.map((record) => record.artifact_id)].sort(),
    ["ART-M1-000001", "ART-M1-000002", "ART-M1-000003", "ART-M1-000004"],
  );
  assert.ok(existsSync(distinct.lockfile_path));
});

test("4 个真实进程并发登记同一 artifact：返回同一 ID 且仅一条记录", async () => {
  const artifactPath = join(evidenceDir, "same.txt");
  writeFileSync(artifactPath, "四个进程共享同一原始字节\n", "utf8");
  const ids = { task_id: "T-P1-940", execution_id: "EXEC-940", correlation_id: "CORR-940" };
  duplicate = await runGroup("duplicate", "duplicate-registry.json", Array(4).fill(artifactPath), () => ids);
  assert.ok(duplicate.workers.every((worker) => worker.exit_code === 0 && worker.result?.result === "SUCCESS"));
  assert.equal(duplicate.registry.records.length, 1);
  assert.equal(duplicate.registry.next_sequence, 2);
  const artifactId = duplicate.registry.records[0].artifact_id;
  assert.ok(duplicate.workers.every((worker) => worker.result.registration.artifact_id === artifactId));
  assert.equal(duplicate.workers.filter((worker) => worker.result.registration.status === "REGISTERED").length, 1);
  assert.equal(duplicate.workers.filter((worker) => worker.result.registration.status === "DUPLICATE").length, 3);
});

test("4 个真实进程以同一身份并发提交不同 hash：仅一个登记，其余拒绝冲突", async () => {
  const artifacts = Array.from({ length: 4 }, (_, index) => {
    const path = join(evidenceDir, `conflict-${index + 1}.txt`);
    writeFileSync(path, `互斥 hash 冲突内容 ${index + 1}\n`, "utf8");
    return path;
  });
  const ids = { task_id: "T-P1-941", execution_id: "EXEC-941", correlation_id: "CORR-941" };
  conflict = await runGroup("conflict", "conflict-registry.json", artifacts, () => ids);
  const successes = conflict.workers.filter((worker) => worker.exit_code === 0);
  const failures = conflict.workers.filter((worker) => worker.exit_code === 1);
  assert.equal(successes.length, 1);
  assert.equal(failures.length, 3);
  assert.ok(failures.every((worker) => worker.result?.error_code === "M1_ARTIFACT_HASH_CONFLICT"));
  assert.equal(conflict.registry.records.length, 1);
  assert.equal(conflict.registry.next_sequence, 2);
  assert.equal(conflict.registry.records[0].artifact_id, successes[0].result.registration.artifact_id);
});

const results = [];
for (const { name, fn } of tests) {
  try {
    await fn();
    results.push({ name, result: "PASS" });
  } catch (error) {
    results.push({ name, result: "FAIL", error: error.message, stack: error.stack });
  }
}
const failed = results.filter((result) => result.result === "FAIL").length;
const report = {
  started_at: startedAt,
  finished_at: new Date().toISOString(),
  node: process.version,
  process_count_per_scenario: 4,
  mutex: "OS_FILE_HANDLE_FILESHARE_NONE_WITH_STDIN_LIFECYCLE",
  content_based_mutex: false,
  total: results.length,
  passed: results.length - failed,
  failed,
  tests: results,
  evidence: { distinct, duplicate, conflict },
};
const lines = [
  `[${startedAt}] M1 真实多进程并发测试开始 node=${process.version} pid=${process.pid}`,
  ...results.map((result) => `[${new Date().toISOString()}] ${result.result} ${result.name}${result.error ? `: ${result.error}` : ""}`),
  ...[distinct, duplicate, conflict].filter(Boolean).flatMap((group) => group.workers.map((worker) =>
    `[${new Date().toISOString()}] WORKER group=${worker.result?.registration ? (worker.result.registration.registry_path.includes("distinct") ? "distinct" : worker.result.registration.registry_path.includes("duplicate") ? "duplicate" : "conflict") : "conflict"} worker=${worker.worker} pid=${worker.pid} exit=${worker.exit_code} status=${worker.result?.registration?.status ?? worker.result?.error_code ?? "UNKNOWN"} artifact_id=${worker.result?.registration?.artifact_id ?? "none"}`)),
  `[${report.finished_at}] SUMMARY total=${report.total} passed=${report.passed} failed=${failed}`,
];
writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
writeFileSync(logPath, `${lines.join("\n")}\n`, "utf8");
console.log(lines.join("\n"));
console.log(`测试报告: ${jsonPath}`);
if (failed > 0) process.exitCode = 1;
