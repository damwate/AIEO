// M2 GitPointer v1.0（自 phase0/tools/git_pointer.mjs 已验证实现整理为 M2 自有模块）。
//
// 职责边界（platform-contract §2.6 / DEC-012）：
//   - 本地构造/校验 GitPointer 与统一 manifest（引用 contracts/v1.0/ 的机器 Schema，只读共享）；
//   - 按完整 40 位 commit 经 raw URL 读取（fetchImpl 可注入以便离线测试）；
//   - 不执行 git commit/push；真实发布由获授权的主会话完成（M4/主会话职责）。
//
// 与 phase0 的差异（不改变语义）：
//   - 不引入 undici 代理 dispatcher（phase0 POC 用 EnvHttpProxyAgent）；代理注入点保留为
//     fetchImpl/dispatcher 参数，系统代理集成（DEC-004）属于部署配置，不在本模块默认路径。
//   - 去掉 CLI；M2 只需要库函数。

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { posix } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import addKeywords from "ajv-keywords";
import { AIEO_ROOT } from "./config.mjs";
import { controllerError } from "./errors.mjs";

const SCHEMA_DIR = join(AIEO_ROOT, "contracts", "v1.0");
const POINTER_SCHEMA = JSON.parse(readFileSync(join(SCHEMA_DIR, "git-pointer.schema.json"), "utf8"));
const MANIFEST_SCHEMA = JSON.parse(readFileSync(join(SCHEMA_DIR, "git-pointer-manifest.schema.json"), "utf8"));
export const MANIFEST_MEDIA_TYPE = "application/vnd.aieo.git-material-manifest+json";
export const MEDIA_TYPES = new Set(["text/plain", "text/markdown", "application/json", "application/x-ndjson"]);
const TRANSIENT_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

export const GIT_POINTER_DEFAULTS = Object.freeze({
  maxFiles: 50,
  maxFileBytes: 2 * 1024 * 1024,
  maxManifestBytes: 128 * 1024,
  maxTotalBytes: 10 * 1024 * 1024,
  httpMaxRetries: 3,
  httpRetryBaseSeconds: 2,
  httpTimeoutMs: 30000,
});

const ENV_KEYS = Object.freeze({
  maxFiles: "AIEO_GIT_POINTER_MAX_FILES",
  maxFileBytes: "AIEO_GIT_POINTER_MAX_FILE_BYTES",
  maxManifestBytes: "AIEO_GIT_POINTER_MAX_MANIFEST_BYTES",
  maxTotalBytes: "AIEO_GIT_POINTER_MAX_TOTAL_BYTES",
  httpMaxRetries: "AIEO_GIT_POINTER_HTTP_MAX_RETRIES",
  httpRetryBaseSeconds: "AIEO_GIT_POINTER_HTTP_RETRY_BASE_SECONDS",
  httpTimeoutMs: "AIEO_GIT_POINTER_HTTP_TIMEOUT_MS",
});

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
addKeywords(ajv);
const validatePointerSchema = ajv.compile(POINTER_SCHEMA);
const validateManifestSchema = ajv.compile(MANIFEST_SCHEMA);

export function gitPointerError(code, message, details = undefined) {
  return controllerError(code, message, details === undefined ? {} : { details });
}

export function sha256Hex(data) {
  return createHash("sha256").update(data).digest("hex");
}

function numericConfig(field, value, minimum) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number) || !Number.isInteger(number) || number < minimum) {
    throw gitPointerError("GIT_POINTER_CONFIG_INVALID", `${field} 必须是 >=${minimum} 的整数`, { field });
  }
  return number;
}

export function resolveGitPointerConfig(overrides = {}, env = process.env) {
  const config = {};
  for (const [field, defaultValue] of Object.entries(GIT_POINTER_DEFAULTS)) {
    const value = overrides[field] ?? env[ENV_KEYS[field]] ?? defaultValue;
    config[field] = numericConfig(field, value, ["httpMaxRetries", "httpRetryBaseSeconds"].includes(field) ? 0 : 1);
  }
  return config;
}

export function validateRepoRelativePath(path, { field = "path", allowedPrefixes = [] } = {}) {
  if (typeof path !== "string" || path.length < 1 || path.length > 512 || /[\u0000-\u001f\u007f]/.test(path)) {
    throw gitPointerError("GIT_POINTER_PATH_INVALID", `${field} 不是合法仓库相对 POSIX 路径`, { field });
  }
  if (
    path.startsWith("/") || path.endsWith("/") || path.includes("\\") || path.includes("//") ||
    /^[A-Za-z][A-Za-z0-9+.-]*:/.test(path) || path !== posix.normalize(path) ||
    path.split("/").some((segment) => !segment || segment === "." || segment === ".." || segment.toLowerCase() === ".git")
  ) {
    throw gitPointerError("GIT_POINTER_PATH_INVALID", `${field} 含绝对路径、盘符、穿越、非规范段或 .git`, { field });
  }
  if (allowedPrefixes.length > 0) {
    const normalizedPrefixes = allowedPrefixes.map((prefix) => prefix.replace(/\/+$/, ""));
    for (const prefix of normalizedPrefixes) {
      validateRepoRelativePath(prefix, { field: "allowed_prefix" });
    }
    if (!normalizedPrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
      throw gitPointerError("GIT_POINTER_PATH_OUT_OF_SCOPE", `${field} 不在任务允许路径范围内`, { field });
    }
  }
  return path;
}

function validateOwnerRepo(value, field) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_.-]+$/.test(value) || value === "." || value === "..") {
    throw gitPointerError("GIT_POINTER_REPOSITORY_INVALID", `${field} 不是可用于 raw URL 的单一 GitHub 名称段`, { field });
  }
}

export function inferMediaType(path) {
  const lower = path.toLowerCase();
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "text/markdown";
  if (lower.endsWith(".json")) return "application/json";
  if (lower.endsWith(".ndjson") || lower.endsWith(".jsonl")) return "application/x-ndjson";
  if (lower.endsWith(".txt") || lower.endsWith(".text")) return "text/plain";
  throw gitPointerError("GIT_POINTER_MEDIA_TYPE_REQUIRED", "无法按扩展名推断媒体类型，请显式提供 media_type");
}

const SECRET_RULES = [
  {
    id: "credential-assignment",
    regex: /\b(?:password|passwd|cookie|token|api[_-]?key|apikey|secret|session[_-]?key|access[_-]?key)\b\s*[:=]\s*(?:"[^"\r\n]+"|'[^'\r\n]+'|[^\s,;]+)/i,
  },
  { id: "cookie-header", regex: /\bset-cookie\s*:/i },
  { id: "bearer-credential", regex: /\bbearer\s+[A-Za-z0-9._~+/=-]{8,}/i },
  { id: "private-key", regex: /-----BEGIN(?: [A-Z0-9]+)? PRIVATE KEY-----/ },
  { id: "github-token", regex: /\b(?:gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{16,})\b/ },
  { id: "openai-token", regex: /\bsk-[A-Za-z0-9_-]{16,}\b/ },
  { id: "jwt", regex: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/ },
];

export function decodeUtf8(data, path = "material") {
  const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw gitPointerError("GIT_POINTER_INVALID_UTF8", "材料不是合法 UTF-8 文本", { path });
  }
}

export function scanSecrets(data, path = "material") {
  const text = decodeUtf8(data, path);
  const findings = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const rule of SECRET_RULES) {
      if (rule.regex.test(line)) findings.push({ rule: rule.id, line: index + 1 });
    }
  });
  return findings;
}

export function assertNoSecrets(data, path = "material") {
  const findings = scanSecrets(data, path);
  if (findings.length > 0) {
    // 诊断只包含规则与行号，绝不回显秘密值或所在原文。
    throw gitPointerError("GIT_POINTER_SECRET_DETECTED", "材料疑似包含密码/Cookie/Token/API Key 等秘密，拒绝发布或处理", { path, findings });
  }
}

function schemaErrors(errors) {
  return (errors ?? []).map((error) => ({ keyword: error.keyword, instance_path: error.instancePath, message: error.message }));
}

export function validateGitPointer(pointer, { allowedPrefixes = [] } = {}) {
  if (!validatePointerSchema(pointer)) {
    throw gitPointerError("GIT_POINTER_SCHEMA_INVALID", "GitPointer 不符合 v1.0 Schema", { errors: schemaErrors(validatePointerSchema.errors) });
  }
  validateOwnerRepo(pointer.owner, "owner");
  validateOwnerRepo(pointer.repo, "repo");
  validateRepoRelativePath(pointer.path, { field: "manifest_path", allowedPrefixes });
  if (pointer.media_type !== MANIFEST_MEDIA_TYPE) {
    throw gitPointerError("GIT_POINTER_MANIFEST_MEDIA_INVALID", "根 GitPointer 只能指向统一 manifest");
  }
  return pointer;
}

export function validateGitPointerManifest(manifest, {
  configOverrides = {},
  env = process.env,
  manifestSizeBytes = null,
  allowedPrefixes = [],
} = {}) {
  const config = resolveGitPointerConfig(configOverrides, env);
  if (!validateManifestSchema(manifest)) {
    throw gitPointerError("GIT_POINTER_MANIFEST_SCHEMA_INVALID", "manifest 不符合 v1.0 Schema", { errors: schemaErrors(validateManifestSchema.errors) });
  }
  if (manifest.files.length > config.maxFiles) {
    throw gitPointerError("GIT_POINTER_FILE_COUNT_EXCEEDED", "材料文件数超过上限", { actual: manifest.files.length, maximum: config.maxFiles });
  }
  const seen = new Set();
  let materialBytes = 0;
  for (const file of manifest.files) {
    validateRepoRelativePath(file.path, { field: "file_path", allowedPrefixes });
    if (seen.has(file.path)) throw gitPointerError("GIT_POINTER_DUPLICATE_PATH", "manifest 含重复文件 path");
    seen.add(file.path);
    if (!MEDIA_TYPES.has(file.media_type)) {
      throw gitPointerError("GIT_POINTER_MEDIA_TYPE_INVALID", "实际材料媒体类型不受支持", { path: file.path });
    }
    if (file.size_bytes > config.maxFileBytes) {
      throw gitPointerError("GIT_POINTER_FILE_SIZE_EXCEEDED", "单个材料文件超过大小上限", { path: file.path, actual: file.size_bytes, maximum: config.maxFileBytes });
    }
    materialBytes += file.size_bytes;
  }
  if (manifestSizeBytes !== null && manifestSizeBytes > config.maxManifestBytes) {
    throw gitPointerError("GIT_POINTER_MANIFEST_SIZE_EXCEEDED", "manifest 超过大小上限", { actual: manifestSizeBytes, maximum: config.maxManifestBytes });
  }
  if (manifestSizeBytes !== null && manifestSizeBytes + materialBytes > config.maxTotalBytes) {
    throw gitPointerError("GIT_POINTER_TOTAL_SIZE_EXCEEDED", "manifest 与全部材料总大小超过上限", { actual: manifestSizeBytes + materialBytes, maximum: config.maxTotalBytes });
  }
  return manifest;
}

export function buildGitPointerManifest({
  task_id,
  execution_id,
  contract_version = "1.0",
  files,
  configOverrides = {},
  env = process.env,
  allowedPrefixes = [],
}) {
  const config = resolveGitPointerConfig(configOverrides, env);
  if (!Array.isArray(files)) throw gitPointerError("GIT_POINTER_FILES_REQUIRED", "files 必须是材料描述数组");
  if (files.length > config.maxFiles) {
    throw gitPointerError("GIT_POINTER_FILE_COUNT_EXCEEDED", "材料文件数超过上限", { actual: files.length, maximum: config.maxFiles });
  }
  const seen = new Set();
  const entries = [];
  let materialBytes = 0;
  for (const descriptor of files) {
    const path = validateRepoRelativePath(descriptor?.path, { field: "file_path", allowedPrefixes });
    if (seen.has(path)) throw gitPointerError("GIT_POINTER_DUPLICATE_PATH", "材料文件 path 重复", { path });
    seen.add(path);
    const bytes = Buffer.isBuffer(descriptor.content) ? Buffer.from(descriptor.content) : Buffer.from(descriptor?.content ?? "");
    const media_type = descriptor.media_type ?? inferMediaType(path);
    if (!MEDIA_TYPES.has(media_type)) throw gitPointerError("GIT_POINTER_MEDIA_TYPE_INVALID", "实际材料媒体类型不受支持", { path });
    if (bytes.length < 1) throw gitPointerError("GIT_POINTER_EMPTY_FILE", "空文件不符合 manifest size_bytes>=1", { path });
    if (bytes.length > config.maxFileBytes) {
      throw gitPointerError("GIT_POINTER_FILE_SIZE_EXCEEDED", "单个材料文件超过大小上限", { path, actual: bytes.length, maximum: config.maxFileBytes });
    }
    assertNoSecrets(bytes, path);
    materialBytes += bytes.length;
    entries.push({ path, artifact_sha256: sha256Hex(bytes), size_bytes: bytes.length, media_type });
  }
  const manifest = { transport: "git_pointer_manifest", contract_version, task_id, execution_id, files: entries };
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  validateGitPointerManifest(manifest, { configOverrides: config, env: {}, manifestSizeBytes: manifestBytes.length, allowedPrefixes });
  assertNoSecrets(manifestBytes, "manifest");
  return {
    manifest,
    manifestBytes,
    manifest_sha256: sha256Hex(manifestBytes),
    size_bytes: manifestBytes.length,
    total_bytes: manifestBytes.length + materialBytes,
  };
}

export function parseGitPointerManifest(manifestBytes, {
  configOverrides = {},
  env = process.env,
  allowedPrefixes = [],
  path = "manifest",
} = {}) {
  const bytes = Buffer.isBuffer(manifestBytes) ? manifestBytes : Buffer.from(manifestBytes);
  const config = resolveGitPointerConfig(configOverrides, env);
  if (bytes.length > config.maxManifestBytes) {
    throw gitPointerError("GIT_POINTER_MANIFEST_SIZE_EXCEEDED", "manifest 超过大小上限", { actual: bytes.length, maximum: config.maxManifestBytes });
  }
  assertNoSecrets(bytes, path);
  let manifest;
  try {
    manifest = JSON.parse(decodeUtf8(bytes, path));
  } catch (error) {
    if (error?.code === "GIT_POINTER_INVALID_UTF8") throw error;
    throw gitPointerError("GIT_POINTER_MANIFEST_JSON_INVALID", "manifest 不是单一完整 JSON 文档");
  }
  validateGitPointerManifest(manifest, { configOverrides: config, env: {}, manifestSizeBytes: bytes.length, allowedPrefixes });
  return manifest;
}

export function createGitPointer({
  owner,
  repo,
  branch,
  commit_sha,
  path,
  manifestBytes,
  configOverrides = {},
  env = process.env,
  allowedPrefixes = [],
}) {
  const manifest = parseGitPointerManifest(manifestBytes, { configOverrides, env, allowedPrefixes, path });
  const bytes = Buffer.isBuffer(manifestBytes) ? manifestBytes : Buffer.from(manifestBytes);
  const pointer = {
    transport: "git_pointer",
    owner,
    repo,
    branch,
    commit_sha,
    path,
    artifact_sha256: sha256Hex(bytes),
    size_bytes: bytes.length,
    media_type: MANIFEST_MEDIA_TYPE,
    contract_version: manifest.contract_version,
    task_id: manifest.task_id,
    execution_id: manifest.execution_id,
  };
  return validateGitPointer(pointer, { allowedPrefixes });
}

export function gitPointerRawUrl(baseUrl, pointer, path) {
  let parsed;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw gitPointerError("GIT_POINTER_BASE_URL_INVALID", "base URL 无法解析");
  }
  if (!["https:", "http:"].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw gitPointerError("GIT_POINTER_BASE_URL_INVALID", "base URL 只允许无凭据、query 和 fragment 的 HTTP(S) 地址");
  }
  validateGitPointer(pointer);
  validateRepoRelativePath(path);
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `${baseUrl.replace(/\/+$/, "")}/${encodeURIComponent(pointer.owner)}/${encodeURIComponent(pointer.repo)}/${pointer.commit_sha}/${encodedPath}`;
}

async function readResponseBytes(response, maximum, path) {
  if (!response.body?.getReader) {
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > maximum) throw gitPointerError("GIT_POINTER_RESPONSE_SIZE_EXCEEDED", "HTTP 响应超过资源上限", { path, maximum });
    return bytes;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      size += chunk.length;
      if (size > maximum) {
        await reader.cancel().catch(() => {});
        throw gitPointerError("GIT_POINTER_RESPONSE_SIZE_EXCEEDED", "HTTP 响应超过资源上限", { path, actual_at_least: size, maximum });
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, size);
}

function retryDelayMs(config, retryIndex, random) {
  const baseMs = config.httpRetryBaseSeconds * 1000 * (2 ** retryIndex);
  return Math.round(baseMs * (0.8 + random() * 0.4));
}

export async function fetchGitPointerBytes(url, {
  path,
  maximum,
  configOverrides = {},
  env = process.env,
  fetchImpl = globalThis.fetch,
  sleep = delay,
  random = Math.random,
} = {}) {
  const config = resolveGitPointerConfig(configOverrides, env);
  const attempts = [];
  for (let attempt = 0; attempt <= config.httpMaxRetries; attempt += 1) {
    let response;
    try {
      response = await fetchImpl(url, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(config.httpTimeoutMs),
        headers: { "user-agent": "aieo-gpt-controller/1.0", accept: "*/*" },
      });
    } catch (error) {
      attempts.push({ attempt: attempt + 1, outcome: "NETWORK_ERROR", error_code: error.code ?? error.name ?? "FETCH_ERROR" });
      if (attempt === config.httpMaxRetries) {
        throw gitPointerError("GIT_POINTER_NETWORK_RETRY_EXHAUSTED", "暂时网络错误在有限重试后仍未恢复", { url, path, attempts });
      }
      const waitMs = retryDelayMs(config, attempt, random);
      attempts[attempts.length - 1].planned_delay_ms = waitMs;
      await sleep(waitMs);
      continue;
    }
    if (TRANSIENT_HTTP_STATUSES.has(response.status)) {
      attempts.push({ attempt: attempt + 1, outcome: "TRANSIENT_HTTP", status: response.status });
      await response.body?.cancel?.().catch?.(() => {});
      if (attempt === config.httpMaxRetries) {
        throw gitPointerError("GIT_POINTER_HTTP_RETRY_EXHAUSTED", "暂时性 HTTP 错误在有限重试后仍未恢复", { url, path, status: response.status, attempts });
      }
      const waitMs = retryDelayMs(config, attempt, random);
      attempts[attempts.length - 1].planned_delay_ms = waitMs;
      await sleep(waitMs);
      continue;
    }
    if (response.status === 401 || response.status === 403) {
      attempts.push({ attempt: attempt + 1, outcome: "PERMISSION_DENIED", status: response.status });
      throw gitPointerError("GIT_POINTER_PERMISSION_DENIED", "仓库或指定 SHA 权限被拒绝；不重试、不换源（私有仓库属扩展门禁）", { url, path, status: response.status, attempts });
    }
    if (response.status === 404 || response.status === 410) {
      attempts.push({ attempt: attempt + 1, outcome: "NOT_FOUND", status: response.status });
      throw gitPointerError("GIT_POINTER_NOT_FOUND", "指定 SHA 或路径不存在；不得回退分支 HEAD 或相似路径", { url, path, status: response.status, attempts });
    }
    if (!response.ok) {
      attempts.push({ attempt: attempt + 1, outcome: "HTTP_ERROR", status: response.status });
      throw gitPointerError("GIT_POINTER_HTTP_ERROR", "GitPointer HTTP 读取失败且不属于可重试暂时错误", { url, path, status: response.status, attempts });
    }
    attempts.push({ attempt: attempt + 1, outcome: "SUCCESS", status: response.status });
    const bytes = await readResponseBytes(response, maximum, path);
    return { bytes, attempts };
  }
  throw new Error("unreachable");
}

// 指定完整 SHA 全量读取：先 manifest 后全部文件，逐一核对 size/SHA-256 与绑定；禁止 HEAD 回退。
export async function readGitPointer({
  pointer,
  baseUrl = "https://raw.githubusercontent.com",
  configOverrides = {},
  env = process.env,
  fetchImpl = globalThis.fetch,
  sleep = delay,
  random = Math.random,
  allowedPrefixes = [],
}) {
  const config = resolveGitPointerConfig(configOverrides, env);
  validateGitPointer(pointer, { allowedPrefixes });
  if (pointer.size_bytes > config.maxManifestBytes) {
    throw gitPointerError("GIT_POINTER_MANIFEST_SIZE_EXCEEDED", "指针声明的 manifest 超过大小上限", { actual: pointer.size_bytes, maximum: config.maxManifestBytes });
  }
  const requestAudit = [];
  const request = (path, maximum) => fetchGitPointerBytes(gitPointerRawUrl(baseUrl, pointer, path), {
    path,
    maximum,
    configOverrides: config,
    env: {},
    fetchImpl,
    sleep,
    random,
  });
  const manifestResponse = await request(pointer.path, config.maxManifestBytes);
  requestAudit.push({ kind: "manifest", path: pointer.path, attempts: manifestResponse.attempts });
  const manifestBytes = manifestResponse.bytes;
  if (manifestBytes.length !== pointer.size_bytes) {
    throw gitPointerError("GIT_POINTER_MANIFEST_SIZE_MISMATCH", "回读 manifest 原始字节数与指针不一致", { path: pointer.path, expected: pointer.size_bytes, actual: manifestBytes.length });
  }
  const manifestHash = sha256Hex(manifestBytes);
  if (manifestHash !== pointer.artifact_sha256) {
    throw gitPointerError("GIT_POINTER_MANIFEST_HASH_MISMATCH", "回读 manifest SHA-256 与指针不一致", { path: pointer.path, expected: pointer.artifact_sha256, actual: manifestHash });
  }
  const manifest = parseGitPointerManifest(manifestBytes, {
    configOverrides: config,
    env: {},
    allowedPrefixes,
    path: pointer.path,
  });
  for (const field of ["contract_version", "task_id", "execution_id"]) {
    if (manifest[field] !== pointer[field]) {
      throw gitPointerError("GIT_POINTER_BINDING_MISMATCH", `manifest 与指针的 ${field} 不一致`, { field });
    }
  }
  const files = [];
  for (const entry of manifest.files) {
    const response = await request(entry.path, config.maxFileBytes);
    requestAudit.push({ kind: "material", path: entry.path, attempts: response.attempts });
    if (response.bytes.length !== entry.size_bytes) {
      throw gitPointerError("GIT_POINTER_FILE_SIZE_MISMATCH", "材料原始字节数与 manifest 不一致", { path: entry.path, expected: entry.size_bytes, actual: response.bytes.length });
    }
    const actualHash = sha256Hex(response.bytes);
    if (actualHash !== entry.artifact_sha256) {
      throw gitPointerError("GIT_POINTER_FILE_HASH_MISMATCH", "材料 SHA-256 与 manifest 不一致", { path: entry.path, expected: entry.artifact_sha256, actual: actualHash });
    }
    assertNoSecrets(response.bytes, entry.path);
    files.push({ ...entry, content: response.bytes });
  }
  return {
    complete: true,
    commit_sha: pointer.commit_sha,
    base_url: baseUrl,
    pointer,
    manifest,
    manifestBytes,
    manifest_sha256: manifestHash,
    files,
    request_audit: requestAudit,
  };
}
