// M2 Git 交接包：新会话恢复只接受 GitPointer 交接包，不继承摘要、历史或旧提示词
//（platform-contract §2.6；DEC-012/DEC-017 核心路径：公开 GitHub 指定完整 40 位 SHA）。

import { readGitPointer, validateGitPointer } from "./git_pointer.mjs";
import { controllerError } from "./errors.mjs";
import { normalizeIds, requireObject } from "./validation.mjs";

export function normalizeGitHandoff(handoff) {
  requireObject(handoff, "GIT_HANDOFF_REQUIRED_NO_SUMMARY", "会话恢复必须提供 Git 交接包");
  if (["summary", "history", "messages", "prompt", "conversation"].some((key) => handoff[key] !== undefined)) {
    throw controllerError("GIT_HANDOFF_SUMMARY_FORBIDDEN", "新会话只接受 GitPointer 交接包，不继承摘要、历史或旧提示词");
  }
  const ids = normalizeIds(handoff, { required: true });
  validateGitPointer(handoff.git_pointer);
  for (const field of ["task_id", "execution_id"]) {
    if (handoff.git_pointer[field] !== ids[field]) {
      throw controllerError("GIT_HANDOFF_BINDING_MISMATCH", `GitPointer 与交接包 ${field} 不一致`, { details: { field } });
    }
  }
  // 只保留合同字段，避免把凭证、草稿或其他运行时字段写入 runtime 配置。
  const pointer = {};
  for (const key of [
    "transport", "owner", "repo", "branch", "commit_sha", "path", "artifact_sha256",
    "size_bytes", "media_type", "contract_version", "task_id", "execution_id",
  ]) pointer[key] = handoff.git_pointer[key];
  return { git_pointer: pointer, ...ids };
}

// 公开仓库指定完整 SHA 读取（核心路径）。私有仓库权限属 DEC-017 扩展门禁，本模块不提供绕过。
export async function readPublicGitHandoff(handoff, options = {}) {
  const normalized = normalizeGitHandoff(handoff);
  try {
    const result = await readGitPointer({
      pointer: normalized.git_pointer,
      baseUrl: options.baseUrl ?? "https://raw.githubusercontent.com",
      fetchImpl: options.fetchImpl ?? globalThis.fetch,
      configOverrides: options.configOverrides ?? {},
      sleep: options.sleep,
      random: options.random,
      allowedPrefixes: options.allowedPrefixes ?? [],
    });
    if (result.complete !== true || result.commit_sha !== normalized.git_pointer.commit_sha) {
      throw controllerError("GIT_HANDOFF_INCOMPLETE", "Git 交接包未能按指定完整 SHA 全部读取");
    }
    return {
      complete: true,
      source: "PUBLIC_GITHUB_FIXED_COMMIT",
      commit_sha: result.commit_sha,
      manifest_path: normalized.git_pointer.path,
      file_count: result.files.length,
      request_audit: result.request_audit,
      result,
    };
  } catch (error) {
    if (error?.code) throw error;
    throw controllerError("GIT_HANDOFF_READ_FAILED", "公开 GitHub 固定 SHA 交接包读取失败", { retryable: false });
  }
}

export function buildHandoffInstruction(handoff) {
  const normalized = normalizeGitHandoff(handoff);
  const text = [
    "AIEO fresh-session Git handoff. No prior summary is inherited.",
    `GitPointer=${JSON.stringify(normalized.git_pointer)}`,
    `correlation_id=${normalized.correlation_id}`,
    "Read the manifest and every file at this exact commit; verify SHA-256/size and all IDs. If any read, permission, scope or integrity check fails, return BLOCKED; do not use HEAD or another source.",
  ].join("\n");
  const bytes = Buffer.byteLength(text, "utf8");
  if (bytes > 1200) {
    throw controllerError("OUTBOUND_MESSAGE_TOO_LARGE", `交接短指令为 ${bytes} UTF-8 字节，超过 1200；不得发送或拆分`, {
      details: { size_bytes: bytes, maximum: 1200 },
    });
  }
  return text;
}
