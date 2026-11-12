// AIEO Phase 1 入站回复：完整 unit 区间、全文稳定比较与原始 artifact 回读校验。
// 本模块不接触浏览器；DOM 采集与纯函数测试共用同一份选择和校验逻辑。

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const MIN_STABLE_READ_INTERVAL_MS = 3000;

function inboundError(code, message, details = undefined) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  if (details !== undefined) error.details = details;
  return error;
}

export function sha256Hex(data) {
  return createHash("sha256").update(data).digest("hex");
}

function asUtf8Buffer(data) {
  return Buffer.isBuffer(data) ? data : Buffer.from(String(data), "utf8");
}

// domUnits 必须按 DOM 顺序提供完整渲染集合；text 是未经清理的原始 innerText。
export function selectInboundReply(domUnits, userUnitKey) {
  if (!Array.isArray(domUnits)) {
    throw inboundError("INBOUND_DOM_UNITS_INVALID", "DOM unit 集合不是数组");
  }
  if (typeof userUnitKey !== "string" || userUnitKey.length === 0) {
    throw inboundError("INBOUND_USER_UNIT_KEY_MISSING", "发送双验未记录本次 user unit key");
  }

  const startIndex = domUnits.findIndex(
    (unit) => unit && unit.key === userUnitKey && unit.role === "user",
  );
  if (startIndex < 0) {
    throw inboundError(
      "INBOUND_START_UNIT_MISSING",
      "本次 user unit 不在当前 DOM 中，可能被虚拟列表裁出，拒绝部分提取",
      { user_unit_key: userUnitKey, rendered_unit_keys: domUnits.map((unit) => unit?.key ?? null) },
    );
  }

  const units = [];
  const seenKeys = new Set();
  let nextUserUnitKey = null;
  for (let index = startIndex + 1; index < domUnits.length; index += 1) {
    const unit = domUnits[index];
    if (!unit || typeof unit.key !== "string" || unit.key.length === 0) {
      throw inboundError("INBOUND_UNIT_KEY_MISSING", `DOM unit ${index} 缺少有效 key`);
    }
    if (unit.role === "user") {
      nextUserUnitKey = unit.key;
      break;
    }
    if (unit.role !== "assistant") continue;
    if (seenKeys.has(unit.key)) {
      throw inboundError("INBOUND_DUPLICATE_UNIT_KEY", "目标区间存在重复 assistant unit key", {
        unit_key: unit.key,
      });
    }
    if (typeof unit.text !== "string") {
      throw inboundError("INBOUND_UNIT_TEXT_INVALID", "assistant unit 原始 innerText 不是字符串", {
        unit_key: unit.key,
      });
    }
    seenKeys.add(unit.key);
    const rawBytes = Buffer.from(unit.text, "utf8");
    units.push({
      key: unit.key,
      role: "assistant",
      text: unit.text,
      text_sha256: sha256Hex(rawBytes),
      size_bytes: rawBytes.length,
      assistant_uuid: typeof unit.assistantUuid === "string" && unit.assistantUuid.length > 0
        ? unit.assistantUuid
        : null,
    });
  }

  if (units.length === 0) {
    throw inboundError("INBOUND_ASSISTANT_UNITS_MISSING", "本次 user unit 后没有 assistant unit", {
      user_unit_key: userUnitKey,
      next_user_unit_key: nextUserUnitKey,
    });
  }
  const assistantUuid = units[units.length - 1].assistant_uuid;
  if (!assistantUuid) {
    throw inboundError(
      "INBOUND_ASSISTANT_UUID_MISSING",
      "目标区间尾部 assistant unit 缺少非空 data-dil-message-id",
      { unit_key: units[units.length - 1].key },
    );
  }

  return {
    user_unit_key: userUnitKey,
    next_user_unit_key: nextUserUnitKey,
    unit_keys: units.map((unit) => unit.key),
    unit_count: units.length,
    assistant_uuid: assistantUuid,
    units,
    reply: units.map((unit) => unit.text).join("\n"),
  };
}

function stabilitySummary(snapshot) {
  return {
    read_started_at: snapshot.read_started_at ?? null,
    read_finished_at: snapshot.read_finished_at ?? null,
    unit_keys: [...snapshot.unit_keys],
    unit_count: snapshot.unit_count,
    unit_text_sha256: snapshot.units.map((unit) => ({
      key: unit.key,
      sha256: unit.text_sha256,
      size_bytes: unit.size_bytes,
    })),
    assistant_uuid: snapshot.assistant_uuid,
  };
}

export function compareInboundSnapshots(first, second, intervalMs) {
  if (!first || !second) {
    throw inboundError("INBOUND_STABILITY_SNAPSHOT_MISSING", "两次完整读取均必须存在");
  }
  const firstSummary = stabilitySummary(first);
  const secondSummary = stabilitySummary(second);
  const checks = {
    interval_at_least_3000ms: Number.isFinite(intervalMs) && intervalMs >= MIN_STABLE_READ_INTERVAL_MS,
    unit_key_list_equal: JSON.stringify(firstSummary.unit_keys) === JSON.stringify(secondSummary.unit_keys),
    unit_count_equal: firstSummary.unit_count === secondSummary.unit_count,
    unit_text_hashes_equal:
      firstSummary.unit_text_sha256.length === secondSummary.unit_text_sha256.length &&
      firstSummary.unit_text_sha256.every((unit, index) => {
        const other = secondSummary.unit_text_sha256[index];
        return other && unit.key === other.key && unit.sha256 === other.sha256 && unit.size_bytes === other.size_bytes;
      }),
    assistant_uuid_present:
      typeof firstSummary.assistant_uuid === "string" && firstSummary.assistant_uuid.length > 0 &&
      typeof secondSummary.assistant_uuid === "string" && secondSummary.assistant_uuid.length > 0,
    assistant_uuid_stable: firstSummary.assistant_uuid === secondSummary.assistant_uuid,
  };
  const result = {
    stable: Object.values(checks).every(Boolean),
    interval_ms: intervalMs,
    checks,
    first: firstSummary,
    second: secondSummary,
  };
  if (!result.stable) {
    throw inboundError("INBOUND_UNSTABLE_READ", "完整 unit 区间两次读取不稳定，拒绝成功返回", result);
  }
  return result;
}

// 回读按原始 Buffer 同时核对长度、SHA-256 和完整字节，任何不一致均失败。
export function verifyArtifactFile(filePath, expectedData) {
  const expected = asUtf8Buffer(expectedData);
  let actual;
  try {
    actual = readFileSync(filePath);
  } catch (error) {
    throw inboundError("ARTIFACT_READBACK_FAILED", `artifact 回读失败: ${filePath}`, {
      cause: error.message,
    });
  }
  const metadata = {
    path: filePath,
    artifact_sha256: sha256Hex(expected),
    size_bytes: expected.length,
    readback_sha256: sha256Hex(actual),
    readback_size_bytes: actual.length,
  };
  if (!expected.equals(actual)) {
    throw inboundError("ARTIFACT_READBACK_MISMATCH", "artifact 写盘后回读 hash/size 不一致", metadata);
  }
  return {
    path: filePath,
    artifact_sha256: metadata.artifact_sha256,
    size_bytes: metadata.size_bytes,
    readback_sha256: metadata.readback_sha256,
    readback_size_bytes: metadata.readback_size_bytes,
    readback_verified: true,
  };
}

function writeAndVerify(filePath, data) {
  const bytes = asUtf8Buffer(data);
  try {
    writeFileSync(filePath, bytes);
  } catch (error) {
    throw inboundError("ARTIFACT_WRITE_FAILED", `artifact 写盘失败: ${filePath}`, {
      cause: error.message,
    });
  }
  return verifyArtifactFile(filePath, bytes);
}

export function persistInboundArtifacts({ directory, snapshot, extractedAt }) {
  if (!snapshot || !Array.isArray(snapshot.units) || typeof snapshot.reply !== "string") {
    throw inboundError("ARTIFACT_SNAPSHOT_INVALID", "缺少可持久化的完整入站快照");
  }
  mkdirSync(directory, { recursive: true });
  const rawDocument = {
    format_version: "1.0",
    extracted_at: extractedAt,
    user_unit_key: snapshot.user_unit_key,
    next_user_unit_key: snapshot.next_user_unit_key,
    unit_keys: snapshot.unit_keys,
    unit_count: snapshot.unit_count,
    assistant_uuid: snapshot.assistant_uuid,
    units: snapshot.units,
  };
  // 先写原始 unit，再写原始合成文本；两者都回读通过后才允许调用方写 result.json。
  const rawUnits = writeAndVerify(
    join(directory, "raw-units.json"),
    Buffer.from(JSON.stringify(rawDocument, null, 2), "utf8"),
  );
  const reply = writeAndVerify(join(directory, "reply.txt"), Buffer.from(snapshot.reply, "utf8"));
  return { raw_units: rawUnits, reply };
}
