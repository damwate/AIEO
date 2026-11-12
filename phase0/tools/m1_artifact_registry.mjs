// AIEO M1 最小本地 artifact 登记适配器（POC）。
// 边界：仅持久化本机 JSON 登记簿，不是完整 M1 REST/数据库/ACK 平台实现。
// 未来服务化接口必须保留相同幂等语义：同一 task/execution/correlation/artifact hash 重试返回原记录；
// 同一业务身份不得用不同原文 hash 覆盖或复用旧记录；登记恢复不得重新触发 GPT。

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const injectedFailureKeys = new Set();
const RETRYABLE_INJECTION = "M1_INJECTED_FIRST_FAILURE";

function m1Error(code, message, details = undefined) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  if (details !== undefined) error.details = details;
  return error;
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
  } catch (error) {
    rmSync(tempPath, { force: true });
    if (error.code?.startsWith?.("M1_")) throw error;
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

export function registerArtifact({
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

// 仅对同一已提取 artifact 做最多一次补登记；本函数没有浏览器或发送依赖。
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

function countSendDoubleVerifications(root) {
  if (!root || !existsSync(root)) return null;
  let count = 0;
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) stack.push(path);
      else if (entry.isFile() && entry.name === "run.log") {
        const text = readFileSync(path, "utf8");
        count += text.split("发送双验通过").length - 1;
      }
    }
  }
  return count;
}

function cliArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    if (!key?.startsWith("--") || !argv[index + 1]) throw new Error("CLI 参数必须为 --key value");
    result[key.slice(2)] = argv[index + 1];
  }
  return result;
}

async function cli() {
  const args = cliArgs(process.argv.slice(2));
  const required = ["registry", "artifact", "task-id", "execution-id", "correlation-id", "output"];
  for (const key of required) if (!args[key]) throw new Error(`缺少 --${key}`);
  const before = countSendDoubleVerifications(args["send-log-root"]);
  const registration = registerArtifactWithRetry({
    registryPath: resolve(args.registry),
    artifactPath: resolve(args.artifact),
    task_id: args["task-id"],
    execution_id: args["execution-id"],
    correlation_id: args["correlation-id"],
    unit_metadata: args.metadata ? JSON.parse(readFileSync(args.metadata, "utf8")) : {},
    artifact_kind: "GPT_REPLY_TEXT",
    schema_validation: "NOT_REQUESTED_EXISTING_ARTIFACT_RECOVERY",
  });
  const after = countSendDoubleVerifications(args["send-log-root"]);
  const evidence = {
    verified_at: new Date().toISOString(),
    registration,
    recovery_scope: "EXISTING_ARTIFACT_ONLY_NO_GPT_DISPATCH",
    gpt_send_double_verification_count_before: before,
    gpt_send_double_verification_count_after: after,
    no_new_gpt_send: before !== null && before === after && registration.gpt_resend_count === 0,
  };
  writeFileSync(resolve(args.output), `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(evidence, null, 2));
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath && invokedPath === resolve(fileURLToPath(import.meta.url))) {
  cli().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
