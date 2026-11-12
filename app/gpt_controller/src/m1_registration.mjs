// M1 最小本地 artifact 登记适配器（自 phase0/tools/m1_artifact_registry.mjs 整理）。
// 边界：仅持久化本机 JSON 登记簿，不是完整 M1 REST/数据库/ACK 平台实现
//（MINIMAL_LOCAL_M1_NOT_FULL_PLATFORM）。
// 幂等语义必须保留：同一 task/execution/correlation/artifact hash 重试返回原记录；
// 同一业务身份不得用不同原文 hash 覆盖或复用旧记录；登记恢复不得重新触发 GPT。
// 三 ID 强制在核心入口执行，不允许上游绕过（DEC-015/DEC-016）。

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { acquireSessionLock } from "./session_lock.mjs";
import { controllerError } from "./errors.mjs";

const injectedFailureKeys = new Set();
const RETRYABLE_INJECTION = "M1_INJECTED_FIRST_FAILURE";

function m1Error(code, message, details = undefined) {
  return controllerError(code, message, details === undefined ? {} : { details });
}

function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

function emptyRegistry() {
  return { format_version: "1.0", adapter: "M1_MINIMAL_LOCAL_JSON", next_sequence: 1, records: [] };
}

function readRegistry(registryPath) {
  if (!existsSync(registryPath)) return emptyRegistry();
  let registry;
  try {
    registry = JSON.parse(readFileSync(registryPath, "utf8"));
  } catch (error) {
    throw m1Error("M1_REGISTRY_READ_FAILED", "M1 本地登记簿读取失败，拒绝按空登记簿继续", { cause: error.message });
  }
  if (
    registry?.format_version !== "1.0" ||
    registry?.adapter !== "M1_MINIMAL_LOCAL_JSON" ||
    !Number.isInteger(registry?.next_sequence) || registry.next_sequence < 1 ||
    !Array.isArray(registry?.records)
  ) {
    throw m1Error("M1_REGISTRY_INVALID", "M1 本地登记簿结构无效");
  }
  return registry;
}

function writeRegistryAtomic(registryPath, registry) {
  mkdirSync(dirname(registryPath), { recursive: true });
  const tempPath = `${registryPath}.${process.pid}.${Date.now()}.tmp`;
  try {
    writeFileSync(tempPath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
    const readback = JSON.parse(readFileSync(tempPath, "utf8"));
    if (JSON.stringify(readback) !== JSON.stringify(registry)) {
      throw new Error("registry readback mismatch");
    }
    renameSync(tempPath, registryPath);
    const committedReadback = JSON.parse(readFileSync(registryPath, "utf8"));
    if (JSON.stringify(committedReadback) !== JSON.stringify(registry)) {
      throw new Error("committed registry readback mismatch");
    }
  } catch (error) {
    rmSync(tempPath, { force: true });
    if (error?.code?.startsWith?.("M1_")) throw error;
    throw m1Error("M1_REGISTRY_WRITE_FAILED", "M1 本地登记簿原子写入或回读失败", { cause: error.message });
  }
}

function idempotencyFields({ task_id, execution_id, correlation_id, artifact_sha256 }) {
  return {
    task_id: task_id ?? null,
    execution_id: execution_id ?? null,
    correlation_id: correlation_id ?? null,
    artifact_sha256,
  };
}

function idempotencyKey(fields) {
  return JSON.stringify(fields);
}

function maybeInjectFailure(registryPath) {
  const key = resolve(registryPath);
  if (process.env.AIEO_M1_FAIL_FIRST === "1" && !injectedFailureKeys.has(key)) {
    injectedFailureKeys.add(key);
    throw m1Error(RETRYABLE_INJECTION, "测试故障注入：本进程该登记簿第一次登记失败", {
      registry_path: registryPath,
      retry_with_same_artifact: true,
      gpt_resend_required: false,
    });
  }
}

function acquireRegistryLock(registryPath) {
  const normalizedRegistryPath = resolve(registryPath);
  const timeoutMs = Number(process.env.AIEO_M1_REGISTRY_LOCK_TIMEOUT_MS || 60000);
  const startedAt = Date.now();
  for (;;) {
    try {
      return acquireSessionLock({
        lockPath: `${normalizedRegistryPath}.lockfile`,
        holder: `m1-registry:${process.pid}`,
      });
    } catch (error) {
      if (error?.code !== "SESSION_LOCK_CONFLICT" || Date.now() - startedAt >= timeoutMs) {
        throw m1Error("M1_REGISTRY_LOCK_UNAVAILABLE", "登记簿 OS 句柄锁获取失败，拒绝无互斥登记", {
          registry_path: registryPath,
          cause: error.message,
        });
      }
      // 只等待内核句柄释放；不读取、解释或仲裁锁文件内容（DEC-001）。
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50 + Math.floor(Math.random() * 50));
    }
  }
}

function registerArtifactLocked({
  registryPath,
  artifactPath,
  task_id,
  execution_id = null,
  correlation_id = null,
  unit_metadata = {},
  artifact_kind = "GPT_REPLY_TEXT",
  schema_validation = "NOT_REQUESTED",
}) {
  if (typeof registryPath !== "string" || registryPath.length === 0) {
    throw m1Error("M1_REGISTRY_PATH_REQUIRED", "必须提供本地登记簿路径");
  }
  if (typeof artifactPath !== "string" || artifactPath.length === 0) {
    throw m1Error("M1_ARTIFACT_PATH_REQUIRED", "必须提供原始 artifact 路径");
  }
  if (typeof task_id !== "string" || task_id.length === 0) {
    throw m1Error("M1_TASK_ID_REQUIRED", "最小登记适配器要求 task_id 参与幂等键");
  }
  // 核心入口也必须强制三 ID，不能仅依赖上游参数解析（复审 MAJOR）。
  if (typeof execution_id !== "string" || execution_id.length === 0) {
    throw m1Error("M1_EXECUTION_ID_REQUIRED", "M1 登记必须提供 execution_id，禁止上游绕过三 ID 绑定");
  }
  if (typeof correlation_id !== "string" || correlation_id.length === 0) {
    throw m1Error("M1_CORRELATION_ID_REQUIRED", "M1 登记必须提供 correlation_id，禁止上游绕过三 ID 绑定");
  }
  if (artifact_kind === "REVIEW_REPORT" && schema_validation !== "PASS") {
    throw m1Error("M1_UNVALIDATED_REVIEW_REPORT", "未通过 Schema 的文本不得登记为审查报告");
  }

  // 故障注入在读取/返回旧记录之前触发，确保测试覆盖真实首次失败后的同 artifact 重试。
  maybeInjectFailure(registryPath);
  const contentBytes = readFileSync(artifactPath);
  const artifactSha256 = sha256(contentBytes);
  const fields = idempotencyFields({ task_id, execution_id, correlation_id, artifact_sha256: artifactSha256 });
  const key = idempotencyKey(fields);
  const registry = readRegistry(registryPath);

  const exact = registry.records.find((record) => record.idempotency_key === key);
  if (exact) {
    if (exact.content_sha256 !== artifactSha256 || sha256(Buffer.from(exact.content, "utf8")) !== artifactSha256) {
      throw m1Error("M1_REGISTRY_CONTENT_MISMATCH", "既有登记记录原文与幂等键 hash 不一致", {
        artifact_id: exact.artifact_id,
      });
    }
    return {
      status: "DUPLICATE",
      artifact_id: exact.artifact_id,
      duplicate: true,
      retry_count: 0,
      idempotency_key: key,
      registry_path: registryPath,
      record_count: registry.records.length,
      record: exact,
      adapter_scope: "MINIMAL_LOCAL_M1_NOT_FULL_PLATFORM",
    };
  }

  const identityConflict = registry.records.find((record) =>
    record.task_id === fields.task_id &&
    record.execution_id === fields.execution_id &&
    record.correlation_id === fields.correlation_id &&
    record.artifact_sha256 !== artifactSha256
  );
  if (identityConflict) {
    throw m1Error("M1_ARTIFACT_HASH_CONFLICT", "同一 task/execution/correlation 的原始 hash 已变化，拒绝复用旧 artifact 记录", {
      existing_artifact_id: identityConflict.artifact_id,
      existing_artifact_sha256: identityConflict.artifact_sha256,
      new_artifact_sha256: artifactSha256,
    });
  }

  const sequence = registry.next_sequence;
  const record = {
    artifact_id: `ART-M1-${String(sequence).padStart(6, "0")}`,
    registered_at: new Date().toISOString(),
    ...fields,
    idempotency_key: key,
    content_sha256: artifactSha256,
    size_bytes: contentBytes.length,
    artifact_path: resolve(artifactPath),
    artifact_kind,
    schema_validation,
    content: contentBytes.toString("utf8"),
    unit_metadata: structuredClone(unit_metadata),
  };
  registry.records.push(record);
  registry.next_sequence += 1;
  writeRegistryAtomic(registryPath, registry);
  return {
    status: "REGISTERED",
    artifact_id: record.artifact_id,
    duplicate: false,
    retry_count: 0,
    idempotency_key: key,
    registry_path: registryPath,
    record_count: registry.records.length,
    record,
    adapter_scope: "MINIMAL_LOCAL_M1_NOT_FULL_PLATFORM",
  };
}

// 每个 registry 使用独立 OS 句柄 lockfile；读登记簿、分配序号、写入及最终回读均在同一临界区。
export function registerArtifact(options) {
  const registryPath = options?.registryPath;
  if (typeof registryPath !== "string" || registryPath.length === 0) {
    return registerArtifactLocked(options);
  }
  const lock = acquireRegistryLock(registryPath);
  try {
    return registerArtifactLocked(options);
  } finally {
    lock.release();
  }
}

// 仅对同一已提取 artifact 做最多一次补登记；本函数没有浏览器或发送依赖（登记失败不重跑 GPT）。
export function registerArtifactWithRetry(options) {
  const attempts = [];
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const registered = registerArtifact(options);
      const result = {
        ...registered,
        status: registered.duplicate ? "DUPLICATE" : (attempt > 1 ? "RECOVERED" : "REGISTERED"),
        attempts: attempts.concat({ attempt, result: "SUCCESS" }),
        attempt_count: attempt,
        retry_count: attempt - 1,
        gpt_resend_count: 0,
      };
      return result;
    } catch (error) {
      attempts.push({ attempt, result: "FAILURE", error_code: error.code ?? "M1_UNKNOWN_ERROR", message: error.message });
      const nonRetryable = ["M1_ARTIFACT_HASH_CONFLICT", "M1_REGISTRY_CONTENT_MISMATCH", "M1_UNVALIDATED_REVIEW_REPORT"];
      if (attempt === 2 || nonRetryable.includes(error.code)) {
        error.m1_attempts = attempts;
        throw error;
      }
    }
  }
  throw new Error("unreachable");
}
