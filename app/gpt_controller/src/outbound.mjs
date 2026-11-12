// M2 出站纪律（platform-contract §2.6.1）。
//
// 1200 UTF-8 字节硬上限只约束最终传给 document.execCommand("insertText", ...) 的完整字符串，
// 计量范围包含信封、任务说明、GitPointer、路径、验收标准、输出 JSON 要求、三 ID、空白与换行；
// 不得只计算指针或只计算汉字字符数。超限：本地发送前失败，不点击发送、不静默截断、
// 不自动拆成多条、不改为反复粘贴长材料；只能缩短指令或改用指向 manifest 的 GitPointer。

import { controllerError } from "./errors.mjs";

export const MAX_OUTBOUND_BYTES = 1200;

export function measureOutboundBytes(text) {
  if (typeof text !== "string") {
    throw controllerError("OUTBOUND_MESSAGE_INVALID", "出站消息必须是字符串", { details: { type: typeof text } });
  }
  return Buffer.byteLength(text, "utf8");
}

// 发送前的完整计量；返回值即审计证据（bytes / max_bytes）。
export function assertOutboundWithinLimit(text, { maxBytes = MAX_OUTBOUND_BYTES } = {}) {
  const bytes = measureOutboundBytes(text);
  if (bytes > maxBytes) {
    throw controllerError(
      "OUTBOUND_MESSAGE_TOO_LARGE",
      `出站消息 ${bytes} UTF-8 字节，超过单条上限 ${maxBytes}。不发送、不截断、不拆分；请缩短指令或改用 GitPointer。`,
      { details: { size_bytes: bytes, maximum: maxBytes, truncated: false, split: false } },
    );
  }
  return { bytes, max_bytes: maxBytes, within_limit: true };
}

// 从长材料构造 GitPointer 短指令（DEC-007/DEC-012：长材料走 Git，网页只发指针）。
// materialLabel 用于人读定位；最终仍必须整体过 1200 字节计量。
export function buildGitPointerInstruction({ gitPointer, correlation_id, requirement = "Read the manifest and every file at this exact commit; do not use HEAD or another source.", extraLines = [] }) {
  if (!gitPointer || typeof gitPointer !== "object") {
    throw controllerError("OUTBOUND_GIT_POINTER_REQUIRED", "长材料指令必须携带 GitPointer");
  }
  const lines = [
    `AIEO task materials: ${JSON.stringify(gitPointer)}`,
    correlation_id ? `correlation_id=${correlation_id}` : null,
    requirement,
    ...extraLines,
  ].filter((line) => typeof line === "string" && line.length > 0);
  const text = lines.join("\n");
  assertOutboundWithinLimit(text);
  return text;
}

// 组合最终出站字符串并整体计量；这是唯一允许进入 insertText 的入口。
export function buildOutboundMessage({ text, gitPointer = null, correlation_id = null, extraLines = [] }) {
  let message;
  if (gitPointer) {
    message = buildGitPointerInstruction({ gitPointer, correlation_id, extraLines });
  } else {
    message = [text, ...extraLines].filter((line) => typeof line === "string").join("\n");
  }
  const metering = assertOutboundWithinLimit(message);
  return { message, ...metering };
}
