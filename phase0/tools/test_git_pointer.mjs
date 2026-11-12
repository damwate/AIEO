// GitPointer 纯函数/本地 CLI 测试；所有 HTTP 均为注入式本地响应，不访问真实 GitHub。
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildGitPointerManifest,
  createGitPointer,
  createGitPointerProxyDispatcher,
  gitPointerRawUrl,
  readGitPointer,
  sha256Hex,
  validateGitPointer,
  validateGitPointerManifest,
} from "./git_pointer.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const logDir = join(__dirname, "..", "logs");
const tempDir = join(logDir, "git-pointer-test-tmp");
const jsonPath = join(logDir, "git-pointer-tests.json");
const logPath = join(logDir, "git-pointer-tests.log");
const startedAt = new Date().toISOString();
const results = [];
rmSync(tempDir, { recursive: true, force: true });
mkdirSync(tempDir, { recursive: true });

const baseUrl = "https://raw.example.test/materials";
const baseFiles = [
  { path: "handoff/task.md", content: Buffer.from("# 本地任务\n仅用于测试\n", "utf8") },
  { path: "handoff/data.json", content: Buffer.from('{"ok":true,"value":42}\n', "utf8") },
];
const ids = { task_id: "T-P1-951", execution_id: "EXEC-951" };
const commitSha = "a".repeat(40);
const built = buildGitPointerManifest({ ...ids, files: baseFiles });
const pointer = createGitPointer({
  owner: "example-owner",
  repo: "example-repo",
  branch: "never/read/head",
  commit_sha: commitSha,
  path: "handoff/manifest.json",
  manifestBytes: built.manifestBytes,
});

function remoteFetch({ manifestBytes = built.manifestBytes, fileChanges = {}, statuses = {}, failures = [] } = {}) {
  const requests = [];
  const contents = new Map();
  contents.set(gitPointerRawUrl(baseUrl, pointer, "handoff/manifest.json"), manifestBytes);
  for (const file of baseFiles) {
    contents.set(gitPointerRawUrl(baseUrl, pointer, file.path), fileChanges[file.path] ?? file.content);
  }
  const fetchImpl = async (url) => {
    requests.push(url);
    const failure = failures[requests.length - 1];
    if (failure) throw Object.assign(new Error("injected network failure"), { code: failure });
    const status = statuses[url] ?? 200;
    if (status !== 200) return new Response("injected status", { status });
    if (!contents.has(url)) return new Response("missing", { status: 404 });
    return new Response(contents.get(url), { status: 200 });
  };
  return { fetchImpl, requests };
}

function readWith(fetchImpl, customPointer = pointer, overrides = {}) {
  return readGitPointer({
    pointer: customPointer,
    baseUrl,
    fetchImpl,
    env: {},
    configOverrides: { httpMaxRetries: 2, httpRetryBaseSeconds: 0, ...overrides },
    sleep: async () => {},
    random: () => 0.5,
  });
}

async function expectCode(code, fn) {
  let observed;
  try {
    await fn();
  } catch (error) {
    observed = error;
  }
  assert.equal(observed?.code, code, observed?.stack || `未抛出 ${code}`);
  return observed;
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test("正例：多文件 manifest、每文件/manifest hash size 与指定 SHA 全量读取", async () => {
  assert.equal(built.manifest.files.length, 2);
  for (const file of baseFiles) {
    const entry = built.manifest.files.find((item) => item.path === file.path);
    assert.equal(entry.artifact_sha256, sha256Hex(file.content));
    assert.equal(entry.size_bytes, file.content.length);
  }
  assert.equal(built.manifest_sha256, sha256Hex(built.manifestBytes));
  assert.equal(built.size_bytes, built.manifestBytes.length);
  validateGitPointerManifest(built.manifest, { manifestSizeBytes: built.manifestBytes.length, env: {} });
  validateGitPointer(pointer);
  const remote = remoteFetch();
  const result = await readWith(remote.fetchImpl);
  assert.equal(result.complete, true);
  assert.equal(result.files.length, 2);
  assert.equal(result.commit_sha, commitSha);
  assert.deepEqual(result.files.map((file) => file.content.toString("utf8")), baseFiles.map((file) => file.content.toString("utf8")));
  assert.deepEqual(remote.requests, [
    gitPointerRawUrl(baseUrl, pointer, pointer.path),
    ...baseFiles.map((file) => gitPointerRawUrl(baseUrl, pointer, file.path)),
  ]);
  assert.ok(remote.requests.every((url) => url.includes(`/${commitSha}/`) && !url.includes("never/read/head")));
});

test("路径穿越、绝对路径、盘符与 .git 均在网络前拒绝", async () => {
  for (const path of ["../secret.txt", "handoff/../secret.txt", "/etc/passwd", "C:/secret.txt", "handoff/.git/config"]) {
    await expectCode("GIT_POINTER_PATH_INVALID", () => buildGitPointerManifest({ ...ids, files: [{ path, content: "x" }] }));
  }
  let networkCount = 0;
  await expectCode("GIT_POINTER_SCHEMA_INVALID", () => readGitPointer({
    pointer: { ...pointer, path: "handoff/../manifest.json" },
    fetchImpl: async () => { networkCount += 1; throw new Error("不得请求"); },
    env: {},
  }));
  assert.equal(networkCount, 0);
});

test("短 SHA 不可读取且不得回退分支", async () => {
  let networkCount = 0;
  await expectCode("GIT_POINTER_SCHEMA_INVALID", () => readGitPointer({
    pointer: { ...pointer, commit_sha: "abc1234" },
    fetchImpl: async () => { networkCount += 1; throw new Error("不得请求"); },
    env: {},
  }));
  assert.equal(networkCount, 0);
});

test("重复 path 在构造与远程 manifest Schema 校验均拒绝", async () => {
  await expectCode("GIT_POINTER_DUPLICATE_PATH", () => buildGitPointerManifest({
    ...ids,
    files: [baseFiles[0], { ...baseFiles[0], content: "different" }],
  }));
  const malicious = { ...built.manifest, files: [built.manifest.files[0], built.manifest.files[0]] };
  const maliciousBytes = Buffer.from(`${JSON.stringify(malicious, null, 2)}\n`, "utf8");
  const maliciousPointer = { ...pointer, artifact_sha256: sha256Hex(maliciousBytes), size_bytes: maliciousBytes.length };
  const remote = remoteFetch({ manifestBytes: maliciousBytes });
  await expectCode("GIT_POINTER_MANIFEST_SCHEMA_INVALID", () => readWith(remote.fetchImpl, maliciousPointer));
  assert.equal(remote.requests.length, 1);
});

test("password/cookie/token/API key/私钥扫描拒绝且诊断不回显秘密", async () => {
  const samples = [
    'password = "do-not-log-password"',
    "cookie: do-not-log-cookie",
    "token = do-not-log-token",
    "api_key: do-not-log-api-key",
    "-----BEGIN PRIVATE KEY-----\\nnot-a-real-key",
  ];
  for (const sample of samples) {
    const error = await expectCode("GIT_POINTER_SECRET_DETECTED", () => buildGitPointerManifest({
      ...ids,
      files: [{ path: "handoff/secret.txt", content: sample }],
    }));
    assert.doesNotMatch(JSON.stringify(error.details), /do-not-log/);
  }
});

test("文件数超限拒绝", async () => {
  await expectCode("GIT_POINTER_FILE_COUNT_EXCEEDED", () => buildGitPointerManifest({
    ...ids,
    files: baseFiles,
    configOverrides: { maxFiles: 1 },
    env: {},
  }));
});

test("单文件大小超限拒绝", async () => {
  await expectCode("GIT_POINTER_FILE_SIZE_EXCEEDED", () => buildGitPointerManifest({
    ...ids,
    files: baseFiles,
    configOverrides: { maxFileBytes: 8 },
    env: {},
  }));
});

test("manifest 大小超限拒绝", async () => {
  await expectCode("GIT_POINTER_MANIFEST_SIZE_EXCEEDED", () => buildGitPointerManifest({
    ...ids,
    files: baseFiles,
    configOverrides: { maxManifestBytes: built.manifestBytes.length - 1 },
    env: {},
  }));
});

test("manifest 与材料总大小超限拒绝", async () => {
  await expectCode("GIT_POINTER_TOTAL_SIZE_EXCEEDED", () => buildGitPointerManifest({
    ...ids,
    files: baseFiles,
    configOverrides: { maxTotalBytes: built.total_bytes - 1 },
    env: {},
  }));
});

test("文件 hash 不符（同长度篡改）拒绝", async () => {
  const original = baseFiles[0].content;
  const changed = Buffer.from(original);
  changed[changed.length - 2] ^= 1;
  const remote = remoteFetch({ fileChanges: { "handoff/task.md": changed } });
  await expectCode("GIT_POINTER_FILE_HASH_MISMATCH", () => readWith(remote.fetchImpl));
});

test("文件 size 不符拒绝", async () => {
  const remote = remoteFetch({ fileChanges: { "handoff/task.md": Buffer.from("x") } });
  await expectCode("GIT_POINTER_FILE_SIZE_MISMATCH", () => readWith(remote.fetchImpl));
});

test("manifest hash/size 不符均拒绝且不读取材料", async () => {
  const changed = Buffer.from(`${JSON.stringify({ ...built.manifest, future: true }, null, 2)}\n`, "utf8");
  let remote = remoteFetch({ manifestBytes: changed });
  await expectCode("GIT_POINTER_MANIFEST_SIZE_MISMATCH", () => readWith(remote.fetchImpl));
  assert.equal(remote.requests.length, 1);
  const sameLength = Buffer.from(built.manifestBytes);
  sameLength[sameLength.length - 2] = 32;
  remote = remoteFetch({ manifestBytes: sameLength });
  await expectCode("GIT_POINTER_MANIFEST_HASH_MISMATCH", () => readWith(remote.fetchImpl));
  assert.equal(remote.requests.length, 1);
});

test("多文件部分缺失立即 BLOCKED，不返回部分完整结果", async () => {
  const missingUrl = gitPointerRawUrl(baseUrl, pointer, "handoff/data.json");
  const remote = remoteFetch({ statuses: { [missingUrl]: 404 } });
  const error = await expectCode("GIT_POINTER_NOT_FOUND", () => readWith(remote.fetchImpl));
  assert.equal(error.details.status, 404);
  assert.equal(remote.requests.length, 3);
  assert.equal(remote.requests.at(-1), missingUrl);
});

test("暂时 503 有限退避后成功且只读指定 URL", async () => {
  const manifestUrl = gitPointerRawUrl(baseUrl, pointer, pointer.path);
  let manifestCalls = 0;
  const baseFetch = remoteFetch().fetchImpl;
  const waits = [];
  const result = await readGitPointer({
    pointer,
    baseUrl,
    env: {},
    configOverrides: { httpMaxRetries: 3, httpRetryBaseSeconds: 0 },
    sleep: async (ms) => { waits.push(ms); },
    random: () => 0.5,
    fetchImpl: async (url, options) => {
      if (url === manifestUrl && manifestCalls++ < 2) return new Response("busy", { status: 503 });
      return baseFetch(url, options);
    },
  });
  assert.equal(result.complete, true);
  assert.equal(manifestCalls, 3);
  assert.deepEqual(waits, [0, 0]);
  assert.equal(result.request_audit[0].attempts.length, 3);
});

test("网络异常重试耗尽：最多首次+maxRetries 次", async () => {
  let calls = 0;
  const error = await expectCode("GIT_POINTER_NETWORK_RETRY_EXHAUSTED", () => readWith(async () => {
    calls += 1;
    throw Object.assign(new Error("reset"), { code: "ECONNRESET" });
  }, pointer, { httpMaxRetries: 2 }));
  assert.equal(calls, 3);
  assert.equal(error.details.attempts.length, 3);
});

test("持续 503 重试耗尽且没有无限循环", async () => {
  let calls = 0;
  const error = await expectCode("GIT_POINTER_HTTP_RETRY_EXHAUSTED", () => readWith(async () => {
    calls += 1;
    return new Response("busy", { status: 503 });
  }, pointer, { httpMaxRetries: 2 }));
  assert.equal(calls, 3);
  assert.equal(error.details.status, 503);
});

test("403 权限拒绝不可重试、不可换源", async () => {
  let calls = 0;
  const error = await expectCode("GIT_POINTER_PERMISSION_DENIED", () => readWith(async () => {
    calls += 1;
    return new Response("denied", { status: 403 });
  }));
  assert.equal(calls, 1);
  assert.equal(error.details.attempts.length, 1);
});

test("manifest 与指针 task/execution/version 绑定不一致拒绝", async () => {
  const remote = remoteFetch();
  await expectCode("GIT_POINTER_BINDING_MISMATCH", () => readWith(remote.fetchImpl, { ...pointer, task_id: "T-P1-952" }));
  assert.equal(remote.requests.length, 1);
});

test("任务允许路径范围不可被 manifest 扩大", async () => {
  await expectCode("GIT_POINTER_PATH_OUT_OF_SCOPE", () => readGitPointer({
    pointer,
    baseUrl,
    fetchImpl: remoteFetch().fetchImpl,
    env: {},
    allowedPrefixes: ["other"],
  }));
});

test("标准代理 env 创建 EnvHttpProxyAgent，无代理 env 返回 null", async () => {
  const dispatcher = createGitPointerProxyDispatcher({ HTTPS_PROXY: "http://127.0.0.1:7890" });
  assert.ok(dispatcher);
  await dispatcher.close();
  assert.equal(createGitPointerProxyDispatcher({}), null);
});

test("本地 CLI build+pointer 正例，不执行 git 写操作", async () => {
  const root = join(tempDir, "cli-materials");
  mkdirSync(join(root, "handoff"), { recursive: true });
  writeFileSync(join(root, "handoff", "task.md"), baseFiles[0].content);
  writeFileSync(join(root, "handoff", "data.json"), baseFiles[1].content);
  const script = join(__dirname, "git_pointer.mjs");
  const build = spawnSync(process.execPath, [
    script, "build", "--root", root,
    "--file", "handoff/task.md", "--file", "handoff/data.json",
    "--manifest-path", "handoff/manifest.json",
    "--task-id", ids.task_id, "--execution-id", ids.execution_id,
  ], { encoding: "utf8", cwd: __dirname });
  assert.equal(build.status, 0, build.stderr || build.stdout);
  const manifestPath = join(root, "handoff", "manifest.json");
  const pointerOutput = join(tempDir, "pointer.json");
  const makePointer = spawnSync(process.execPath, [
    script, "pointer", "--owner", "example-owner", "--repo", "example-repo",
    "--branch", "local-only", "--commit-sha", commitSha,
    "--manifest-path", "handoff/manifest.json", "--manifest-file", manifestPath,
    "--output", pointerOutput,
  ], { encoding: "utf8", cwd: __dirname });
  assert.equal(makePointer.status, 0, makePointer.stderr || makePointer.stdout);
  const generated = JSON.parse(readFileSync(pointerOutput, "utf8"));
  assert.equal(generated.artifact_sha256, sha256Hex(readFileSync(manifestPath)));
  assert.equal(generated.commit_sha, commitSha);
});

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
  network_scope: "INJECTED_LOCAL_HTTP_RESPONSES_ONLY_NO_REAL_GITHUB",
  real_remote_git_pointer_verified: false,
  git_commit_or_push_performed: false,
  total: results.length,
  passed: results.length - failed,
  failed,
  tests: results,
};
const lines = [
  `[${startedAt}] GitPointer 本地测试开始；不访问真实 GitHub，不执行 commit/push`,
  ...results.map((result) => `[${new Date().toISOString()}] ${result.result} ${result.name}${result.error ? `: ${result.error}` : ""}`),
  `[${report.finished_at}] SUMMARY total=${report.total} passed=${report.passed} failed=${failed}`,
];
writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
writeFileSync(logPath, `${lines.join("\n")}\n`, "utf8");
console.log(lines.join("\n"));
console.log(`测试报告: ${jsonPath}`);
rmSync(tempDir, { recursive: true, force: true });
if (failed > 0) process.exitCode = 1;
