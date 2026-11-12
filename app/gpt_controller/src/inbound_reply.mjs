// M2 入站回复纯函数层（自 phase0/tools/inbound_reply.mjs 已验证实现整理，语义不变）。
// 职责：虚拟列表区间实体化、相邻窗口重叠证明、全文稳定比较、原始 artifact 先落盘回读校验、
// 全文 JSON/Schema/三 ID 绑定校验。本模块不接触浏览器。
//
// fail-closed 语义：
//   - 相邻窗口无重叠 / 顺序冲突 / 无法对齐 → 区间不完整，拒绝提取；
//   - 滚动中观察到渲染 unit 集合变化且无独立逻辑序列 → INBOUND_WINDOW_COMPLETENESS_UNPROVEN；
//   - 两次完整读取 key/数量/逐 unit 哈希/UUID 任一变化 → INBOUND_UNSTABLE_READ；
//   - artifact 写盘回读 hash/size 不一致 → ARTIFACT_READBACK_MISMATCH。

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { controllerError } from "./errors.mjs";

export const MIN_STABLE_READ_INTERVAL_MS = 3000;
export const CHATGPT_AUX_PREFIX = "ChatGPT 说：";

function inboundError(code, message, details = undefined) {
  return controllerError(code, message, details === undefined ? {} : { details });
}

export function sha256Hex(data) {
  return createHash("sha256").update(data).digest("hex");
}

function asUtf8Buffer(data) {
  return Buffer.isBuffer(data) ? data : Buffer.from(String(data), "utf8");
}

function unitIdentity(unit) {
  return {
    key: unit?.key ?? null,
    role: unit?.role ?? null,
    text: unit?.text ?? null,
    assistantUuid: unit?.assistantUuid ?? null,
  };
}

function sameUnitIdentity(first, second) {
  return JSON.stringify(unitIdentity(first)) === JSON.stringify(unitIdentity(second));
}

function validateWindow(domUnits) {
  if (!Array.isArray(domUnits) || domUnits.length === 0) {
    throw inboundError("INBOUND_WINDOW_EMPTY", "虚拟列表窗口为空，无法证明目标区间连续");
  }
  const keys = new Set();
  for (const unit of domUnits) {
    if (!unit || typeof unit.key !== "string" || unit.key.length === 0) {
      throw inboundError("INBOUND_UNIT_KEY_MISSING", "窗口内 unit 缺少有效 key");
    }
    if (keys.has(unit.key)) {
      throw inboundError("INBOUND_WINDOW_DUPLICATE_KEY", "同一窗口存在重复 unit key", { unit_key: unit.key });
    }
    keys.add(unit.key);
  }
}

// 搜索起点时也必须逐窗连续；只允许相同 key 且身份/原文完全一致的窗口衔接。
export function proveAdjacentWindowOverlap(previousWindow, currentWindow) {
  validateWindow(previousWindow);
  validateWindow(currentWindow);
  const currentByKey = new Map(currentWindow.map((unit, index) => [unit.key, { unit, index }]));
  const overlaps = [];
  for (let previousIndex = 0; previousIndex < previousWindow.length; previousIndex += 1) {
    const previous = previousWindow[previousIndex];
    const current = currentByKey.get(previous.key);
    if (current) overlaps.push({ key: previous.key, previous_index: previousIndex, current_index: current.index });
  }
  if (overlaps.length === 0) {
    throw inboundError("INBOUND_WINDOW_DISCONTINUOUS", "相邻虚拟列表窗口没有重叠 unit key，可能裁掉中间内容", {
      previous_unit_keys: previousWindow.map((unit) => unit.key),
      current_unit_keys: currentWindow.map((unit) => unit.key),
    });
  }
  const offsets = new Set(overlaps.map((item) => item.previous_index - item.current_index));
  if (offsets.size !== 1) {
    throw inboundError("INBOUND_WINDOW_OVERLAP_INCONSISTENT", "相邻窗口重叠 key 的相对顺序不一致", { overlaps });
  }
  for (const item of overlaps) {
    const previous = previousWindow[item.previous_index];
    const current = currentWindow[item.current_index];
    if (!sameUnitIdentity(previous, current)) {
      throw inboundError("INBOUND_WINDOW_OVERLAP_CHANGED", "重叠 unit 的角色、UUID 或原文发生变化", {
        unit_key: item.key,
      });
    }
  }
  return { overlap_keys: overlaps.map((item) => item.key), relative_offset: [...offsets][0] };
}

// 从包含本次 user unit 的窗口开始向下实体化。每次滚动必须用重叠 key 对齐并合并；
// 下一 user 是明确终点；没有下一 user 时只有真实滚动到底才允许结束。
export function createInboundRangeCollector(userUnitKey, { expectedUnitKeys = null } = {}) {
  if (typeof userUnitKey !== "string" || userUnitKey.length === 0) {
    throw inboundError("INBOUND_USER_UNIT_KEY_MISSING", "发送双验未记录本次 user unit key");
  }
  if (expectedUnitKeys !== null) {
    if (!Array.isArray(expectedUnitKeys) || expectedUnitKeys.length === 0 ||
        expectedUnitKeys.some((key) => typeof key !== "string" || key.length === 0) ||
        new Set(expectedUnitKeys).size !== expectedUnitKeys.length) {
      throw inboundError("INBOUND_EXPECTED_UNIT_SEQUENCE_INVALID", "独立逻辑 unit 序列必须是非空、无重复 key 的数组");
    }
    if (!expectedUnitKeys.includes(userUnitKey)) {
      throw inboundError("INBOUND_EXPECTED_UNIT_SEQUENCE_INVALID", "独立逻辑 unit 序列不包含本次 user unit key");
    }
  }
  let started = false;
  let complete = false;
  let sawScrollableWindow = false;
  let virtualizationObserved = false;
  let stitched = [];
  let startIndex = -1;
  let endIndex = -1;
  let endReason = null;
  let nextUserUnitKey = null;
  let previousWindow = null;
  let previousWindowOffset = 0;
  const windowProofs = [];

  function ingest(domUnits, { atBottom = false, scrollable = false } = {}) {
    if (complete) throw inboundError("INBOUND_RANGE_ALREADY_COMPLETE", "完整区间已结束，不得继续合并窗口");
    validateWindow(domUnits);
    sawScrollableWindow ||= scrollable === true;
    let overlapProof = null;
    let currentWindowOffset = 0;

    if (!started) {
      startIndex = domUnits.findIndex((unit) => unit.key === userUnitKey && unit.role === "user");
      if (startIndex < 0) {
        throw inboundError("INBOUND_START_UNIT_MISSING", "起点搜索尚未定位本次 user unit", { user_unit_key: userUnitKey });
      }
      stitched = structuredClone(domUnits);
      started = true;
    } else {
      overlapProof = proveAdjacentWindowOverlap(previousWindow, domUnits);
      // "容器可滚动"不等于"发生虚拟裁切"。只有实际观察到渲染 unit 集合
      // 随窗口变化（新增/消失），才要求独立逻辑序列；稳定渲染集合可走真实页面。
      if (scrollable) {
        const beforeKeys = new Set(previousWindow.map((unit) => unit.key));
        const currentKeys = new Set(domUnits.map((unit) => unit.key));
        const changed = beforeKeys.size !== currentKeys.size ||
          [...beforeKeys].some((key) => !currentKeys.has(key)) ||
          [...currentKeys].some((key) => !beforeKeys.has(key));
        if (changed) virtualizationObserved = true;
      }
      const offsets = new Set();
      for (let previousIndex = 0; previousIndex < previousWindow.length; previousIndex += 1) {
        const currentIndex = domUnits.findIndex((unit) => unit.key === previousWindow[previousIndex].key);
        if (currentIndex >= 0) offsets.add(previousWindowOffset + previousIndex - currentIndex);
      }
      if (offsets.size !== 1) {
        throw inboundError("INBOUND_WINDOW_OVERLAP_INCONSISTENT", "无法以唯一偏移对齐相邻窗口");
      }
      currentWindowOffset = [...offsets][0];
      if (currentWindowOffset < 0 || currentWindowOffset > stitched.length) {
        throw inboundError("INBOUND_WINDOW_OFFSET_INVALID", "向下采集出现回退或空洞", {
          current_window_offset: currentWindowOffset,
          materialized_count: stitched.length,
        });
      }
      for (let currentIndex = 0; currentIndex < domUnits.length; currentIndex += 1) {
        const globalIndex = currentWindowOffset + currentIndex;
        const current = domUnits[currentIndex];
        if (globalIndex < stitched.length) {
          if (!sameUnitIdentity(stitched[globalIndex], current)) {
            throw inboundError("INBOUND_MATERIALIZED_UNIT_CONFLICT", "重叠区域与已实体化 unit 不一致", {
              unit_key: current.key,
              global_index: globalIndex,
            });
          }
        } else if (globalIndex === stitched.length) {
          stitched.push(structuredClone(current));
        } else {
          throw inboundError("INBOUND_WINDOW_DISCONTINUOUS", "合并窗口会产生未实体化空洞");
        }
      }
    }

    windowProofs.push({
      index: windowProofs.length,
      unit_keys: domUnits.map((unit) => unit.key),
      unit_text_sha256: domUnits.map((unit) => sha256Hex(asUtf8Buffer(unit.text ?? ""))),
      window_offset: currentWindowOffset,
      at_bottom: atBottom === true,
      overlap_keys: overlapProof?.overlap_keys ?? [],
    });
    previousWindow = structuredClone(domUnits);
    previousWindowOffset = currentWindowOffset;

    const nextUserIndex = stitched.findIndex((unit, index) => index > startIndex && unit.role === "user");
    const endpointAvailable = nextUserIndex >= 0 || atBottom;
    if (scrollable && windowProofs.length < 2 && endpointAvailable) {
      return {
        started,
        complete: false,
        deferred_endpoint: true,
        end_reason: null,
        next_user_unit_key: null,
        materialized_count: stitched.length,
      };
    }
    if (nextUserIndex >= 0) {
      endIndex = nextUserIndex;
      nextUserUnitKey = stitched[nextUserIndex].key;
      endReason = "NEXT_USER";
      complete = true;
    } else if (atBottom) {
      if (stitched[stitched.length - 1]?.role !== "assistant") {
        throw inboundError("INBOUND_END_BOUNDARY_INVALID", "已到底但目标区间尾部不是 assistant，且没有下一 user 边界");
      }
      endIndex = stitched.length - 1;
      endReason = "DOM_BOTTOM";
      complete = true;
    }

    return {
      started,
      complete,
      end_reason: endReason,
      next_user_unit_key: nextUserUnitKey,
      materialized_count: stitched.length,
    };
  }

  function build() {
    if (!started) throw inboundError("INBOUND_START_UNIT_MISSING", "未定位本次 user unit，不能构造完整区间");
    if (!complete || endIndex < startIndex) {
      throw inboundError("INBOUND_RANGE_INCOMPLETE", "目标区间未到下一 user 或真实底部，拒绝判定完整");
    }
    const targetUnits = stitched.slice(startIndex, endIndex + 1);
    const actualKeys = targetUnits.map((unit) => unit.key);
    let windowIntegrity;
    if (expectedUnitKeys !== null) {
      const expectedStart = expectedUnitKeys.indexOf(userUnitKey);
      let expectedEnd;
      if (endReason === "NEXT_USER") {
        expectedEnd = expectedUnitKeys.indexOf(nextUserUnitKey, expectedStart + 1);
        if (expectedEnd < 0) throw inboundError("INBOUND_WINDOW_COMPLETENESS_FAILED", "实体化终点不在独立逻辑 unit 序列中");
      } else {
        expectedEnd = expectedUnitKeys.length - 1;
      }
      const expectedKeys = expectedUnitKeys.slice(expectedStart, expectedEnd + 1);
      if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
        const actualSet = new Set(actualKeys);
        const expectedSet = new Set(expectedKeys);
        throw inboundError(
          "INBOUND_WINDOW_COMPLETENESS_FAILED",
          "实体化区间与独立逻辑 unit 序列不一致；中间 unit 可能在所有窗口中持续缺失，拒绝误判完整",
          {
            missing_unit_keys: expectedKeys.filter((key) => !actualSet.has(key)),
            unexpected_unit_keys: actualKeys.filter((key) => !expectedSet.has(key)),
            expected_unit_keys: expectedKeys,
            actual_unit_keys: actualKeys,
          },
        );
      }
      windowIntegrity = {
        complete: true,
        method: "INDEPENDENT_LOGICAL_UNIT_SEQUENCE",
        expected_unit_count: expectedKeys.length,
        materialized_unit_count: actualKeys.length,
      };
    } else if (virtualizationObserved) {
      throw inboundError(
        "INBOUND_WINDOW_COMPLETENESS_UNPROVEN",
        "BLOCKED: 滚动中实际观察到渲染 unit 集合变化，且缺少独立逻辑序列，不能排除持续遗漏中间 unit",
        { materialized_unit_keys: actualKeys, remediation: "提供可信的完整逻辑 unit 序列，或在非虚拟化静态 DOM 上重新读取" },
      );
    } else {
      windowIntegrity = {
        complete: true,
        method: sawScrollableWindow ? "STABLE_RENDERED_UNIT_SET" : "STATIC_NON_SCROLLABLE_DOM",
        scrollable_window_observed: sawScrollableWindow,
        virtualization_observed: virtualizationObserved,
        limitation: "仅适用于滚动期间渲染 unit 集合未变化的当前 DOM；不宣称证明持续隐藏 unit 或所有未来虚拟化行为",
      };
    }
    return {
      units: targetUnits,
      range_proof: {
        complete: true,
        user_unit_key: userUnitKey,
        next_user_unit_key: nextUserUnitKey,
        end_reason: endReason,
        windows: windowProofs,
        materialized_unit_keys: actualKeys,
        window_integrity: windowIntegrity,
      },
    };
  }

  return { ingest, build };
}

// domUnits 必须按 DOM 顺序提供已证明连续的完整目标区间；text 是未经清理的原始 innerText。
// DEC-017 扩展门禁（T-P1-901 F-001）：默认只放行单 assistant unit 核心路径（maxAssistantUnits=1）。
// 纯函数/fixture 测试可显式传入更大的 maxAssistantUnits 覆盖多 unit 采集能力；
// 真实浏览器路径（dispatch.mjs）不得放宽，且在快照收敛点另有无条件复核。
export function selectInboundReply(domUnits, userUnitKey, { maxAssistantUnits = 1 } = {}) {
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
      "本次 user unit 不在已实体化区间中，可能被虚拟列表裁出，拒绝部分提取",
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
  if (units.length > maxAssistantUnits) {
    throw inboundError(
      "INBOUND_MULTI_UNIT_EXTENSION_GATE_BLOCKED",
      "检测到多个 assistant unit，超出 DEC-017 已验收单 unit 核心路径，fail-closed",
      {
        unit_count: units.length,
        max_assistant_units: maxAssistantUnits,
        decision: "DEC-017",
        remediation: "真实多 assistant unit 场景必须先通过 DEC-017 扩展验收门禁并经独立审查解除限制",
      },
    );
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

// DEC-017 扩展门禁收敛复核（T-P1-901 F-001/F-101）：dispatch 最终防线的独立函数，供直接测试。
// 上游（selectInboundReply/readReplySnapshot）即使被放宽或失效，本函数仍无条件复核。
// 畸形快照（缺/非法 unit_count 或 unit_keys、二者不一致）无法证明安全 → 一律 fail-closed，不给绕过空间。
export function assertInboundExtensionGate(snapshot) {
  const count = snapshot?.unit_count;
  const keys = snapshot?.unit_keys;
  const malformed =
    typeof count !== "number" ||
    !Number.isInteger(count) ||
    count < 0 ||
    !Array.isArray(keys) ||
    keys.length !== count;
  if (malformed) {
    throw inboundError(
      "INBOUND_REPLY_SNAPSHOT_MALFORMED",
      "回复快照缺少或携带非法的 unit_count/unit_keys，无法安全判定扩展门禁，fail-closed",
      {
        unit_count: count === undefined ? null : count,
        unit_keys_type: Array.isArray(keys) ? "array" : typeof keys,
        decision: "DEC-017",
        remediation: "修复快照读取与选择逻辑，使其返回一致的 unit_count/unit_keys 后重试",
      },
    );
  }
  if (count > 1) {
    throw inboundError(
      "INBOUND_MULTI_UNIT_EXTENSION_GATE_BLOCKED",
      "检测到多个 assistant unit，超出 DEC-017 已验收单 unit 核心路径，fail-closed",
      {
        unit_count: count,
        max_assistant_units: 1,
        unit_keys: keys,
        decision: "DEC-017",
        remediation: "真实多 assistant unit 场景必须先通过 DEC-017 扩展验收门禁并经独立审查解除限制",
      },
    );
  }
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
    next_user_unit_key: snapshot.next_user_unit_key ?? null,
    range_end_reason: snapshot.range_proof?.end_reason ?? null,
  };
}

// 两次完整读取比较：间隔 ≥3s、key 列表、数量、逐 unit 全文 SHA-256、尾部 UUID、边界全部一致。
export function compareInboundSnapshots(first, second, intervalMs) {
  if (!first || !second) {
    throw inboundError("INBOUND_STABILITY_SNAPSHOT_MISSING", "两次完整读取均必须存在");
  }
  const firstSummary = stabilitySummary(first);
  const secondSummary = stabilitySummary(second);
  const checks = {
    interval_at_least_3000ms: Number.isFinite(intervalMs) && intervalMs >= MIN_STABLE_READ_INTERVAL_MS,
    first_range_complete: first.range_proof?.complete === true,
    second_range_complete: second.range_proof?.complete === true,
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
    next_user_boundary_stable: firstSummary.next_user_unit_key === secondSummary.next_user_unit_key,
    range_end_reason_stable: firstSummary.range_end_reason === secondSummary.range_end_reason,
  };
  const result = {
    stable: Object.values(checks).every(Boolean),
    interval_ms: intervalMs,
    checks,
    first: firstSummary,
    second: secondSummary,
  };
  if (!result.stable) {
    throw inboundError("INBOUND_UNSTABLE_READ", "完整区间证明或两次读取稳定性未通过，拒绝成功返回", result);
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

// 原始 artifact 先落盘（raw-units.json + reply.txt）并回读校验；任一失败不产生成功结果。
export function persistInboundArtifacts({ directory, snapshot, extractedAt }) {
  if (!snapshot || !Array.isArray(snapshot.units) || typeof snapshot.reply !== "string") {
    throw inboundError("ARTIFACT_SNAPSHOT_INVALID", "缺少可持久化的完整入站快照");
  }
  if (snapshot.range_proof?.complete !== true) {
    throw inboundError("ARTIFACT_RANGE_INCOMPLETE", "缺少虚拟列表完整区间证明，拒绝持久化为成功 artifact");
  }
  mkdirSync(directory, { recursive: true });
  const rawDocument = {
    format_version: "1.1",
    extracted_at: extractedAt,
    user_unit_key: snapshot.user_unit_key,
    next_user_unit_key: snapshot.next_user_unit_key,
    unit_keys: snapshot.unit_keys,
    unit_count: snapshot.unit_count,
    assistant_uuid: snapshot.assistant_uuid,
    range_proof: snapshot.range_proof,
    units: snapshot.units,
  };
  const rawUnits = writeAndVerify(
    join(directory, "raw-units.json"),
    Buffer.from(JSON.stringify(rawDocument, null, 2), "utf8"),
  );
  const reply = writeAndVerify(join(directory, "reply.txt"), Buffer.from(snapshot.reply, "utf8"));
  return { raw_units: rawUnits, reply };
}

export function extractCompleteJson(rawArtifact) {
  const raw = Buffer.isBuffer(rawArtifact) ? rawArtifact.toString("utf8") : String(rawArtifact);
  const prefixRemoved = raw.startsWith(CHATGPT_AUX_PREFIX);
  // 只允许移除精确辅助前缀；不得从第一个 { 截取或忽略其他非 JSON 文本。
  const jsonText = prefixRemoved ? raw.slice(CHATGPT_AUX_PREFIX.length) : raw;
  try {
    return { value: JSON.parse(jsonText), prefix_removed: prefixRemoved, json_text: jsonText };
  } catch (error) {
    throw inboundError("INBOUND_JSON_PARSE_FAILED", "完整原始 artifact 不是单一可解析 JSON", {
      prefix_removed: prefixRemoved,
      cause: error.message,
    });
  }
}

// 全文 JSON 解析 + Ajv Schema + task/execution/correlation 精确绑定（写成功结果前完成）。
export function validateInboundJsonArtifact({ artifactPath, schemaPath = null, expectedIds = {} }) {
  if (!schemaPath) {
    return {
      status: "NOT_REQUESTED",
      json: { status: "NOT_REQUESTED" },
      schema: { status: "NOT_REQUESTED" },
      binding: {
        status: "NOT_REQUESTED",
        task_id: "NOT_REQUESTED",
        execution_id: "NOT_REQUESTED",
        correlation_id: "NOT_REQUESTED",
      },
      parsed_json: null,
    };
  }

  const artifactBytes = readFileSync(artifactPath);
  const extracted = extractCompleteJson(artifactBytes);
  let schema;
  try {
    schema = JSON.parse(readFileSync(schemaPath, "utf8"));
  } catch (error) {
    throw inboundError("INBOUND_SCHEMA_READ_FAILED", "Schema 文件读取或解析失败", { cause: error.message });
  }
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  let validate;
  try {
    validate = ajv.compile(schema);
  } catch (error) {
    throw inboundError("INBOUND_SCHEMA_COMPILE_FAILED", "Schema 编译失败", { cause: error.message });
  }
  const schemaValid = validate(extracted.value) === true;
  if (!schemaValid) {
    throw inboundError("INBOUND_SCHEMA_VALIDATION_FAILED", "回复 JSON 不符合指定 Schema", {
      errors: validate.errors ?? [],
    });
  }

  const bindings = {};
  for (const field of ["task_id", "execution_id", "correlation_id"]) {
    const expected = expectedIds?.[field];
    if (expected === null || expected === undefined) {
      bindings[field] = "NOT_REQUESTED";
      continue;
    }
    const actual = extracted.value?.[field];
    if (actual !== expected) {
      throw inboundError("INBOUND_TASK_BINDING_MISMATCH", `${field} 与本次派发绑定不完全一致`, {
        field,
        expected,
        actual: actual ?? null,
      });
    }
    bindings[field] = "PASS";
  }
  const requestedBindings = Object.values(bindings).filter((value) => value !== "NOT_REQUESTED");
  return {
    status: "PASS",
    json: {
      status: "PASS",
      artifact_path: artifactPath,
      artifact_sha256: sha256Hex(artifactBytes),
      auxiliary_prefix_removed: extracted.prefix_removed,
      auxiliary_prefix: extracted.prefix_removed ? CHATGPT_AUX_PREFIX : null,
      full_document_parsed: true,
    },
    schema: { status: "PASS", schema_path: schemaPath, errors: [] },
    binding: {
      status: requestedBindings.length > 0 ? "PASS" : "NOT_REQUESTED",
      ...bindings,
    },
    parsed_json: extracted.value,
  };
}
