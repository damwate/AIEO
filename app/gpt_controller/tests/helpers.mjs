// 测试共享辅助：fixture HTML 装配、仿真发送脚本、临时目录与断言工具。
// 仅服务 tests/；不是生产代码。

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { FixtureChatgptPage } from "../fixtures/sim_page.mjs";

// HTML fixture 位于包根 fixtures/；测试自身 fixture（Schema）在 tests/fixtures/。
export const FIXTURE_DIR = join(fileURLToPath(new URL("../fixtures/", import.meta.url)));

export function loadFixtureHtml(name) {
  return readFileSync(join(FIXTURE_DIR, name), "utf8");
}

export const SESSION_URL = "https://chatgpt.com/c/3f2a7b8c-1c41-4091-817f-7b7c0f3f314a";
export const CHATGPT_HOME = "https://chatgpt.com/";
export const VALID_IDS = Object.freeze({
  task_id: "T-P1-001",
  execution_id: "EXEC-001",
  correlation_id: "CORR-001",
});
export const ASSISTANT_UUID = "9a1b2c3d-4e5f-4a60-8b70-1c2d3e4f5a60";

export function escapeHtml(text) {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// 受约束 HTML（mini_dom 解析子集）：thread + 可选 unit + composer + 停止按钮 + 上限横幅。
export function sessionHtml({ units = [], withBanner = true, filler = "" } = {}) {
  const unitHtml = units.map((unit) => {
    if (unit.role === "assistant" && unit.assistantUuid) {
      return `      <div data-content-search-unit-key="${unit.key}" data-role="assistant"><div data-dil-response data-dil-message-id="${unit.assistantUuid}">${escapeHtml(unit.text ?? "")}</div></div>\n`;
    }
    return `      <div data-content-search-unit-key="${unit.key}" data-role="${unit.role}">${escapeHtml(unit.text ?? "")}</div>\n`;
  }).join("");
  return `<html lang="zh-CN">
  <body>
    <header>AIEO 仿真会话页</header>
    <div id="thread" style="overflow-y:auto">
${unitHtml}    </div>
    <form>
      <button type="button" data-testid="stop-button" aria-label="Stop" style="display:none">停止</button>
    </form>
    <div id="context-limit-banner" role="alert" style="display:none">上下文窗口已达上限</div>
    <div aria-label="Ask ChatGPT" contenteditable="true" id="prompt-textarea"></div>
    <p>${escapeHtml(filler)}</p>
  </body>
</html>
`;
}

// 默认小会话（2 个 unit，viewport 默认 4 → 全部可见、不可滚动）。
export function baseSessionUnits() {
  return [
    { key: "u0001:user", role: "user", text: "请审查模块边界文档 §2。" },
    { key: "a0002:assistant", role: "assistant", text: "已读取 §2，等待审查材料 GitPointer。", assistantUuid: "2b6f1c8e-0a11-4c22-9d33-000000000002" },
  ];
}

// onSend 脚本：Enter 后定时追加 user unit + 生成态，随后追加 assistant 回复并结束生成。
// mutateAtMs 用于"两次读取不一致"负例（在两次完整读取之间改写 assistant 原文）。
export function replyScript({
  userKey = "u1000:user",
  assistantKey = "a1001:assistant",
  replyText,
  assistantUuid = ASSISTANT_UUID,
  sendDelayMs = 600,
  replyDelayMs = 2500,
  mutateAtMs = null,
  mutateText = "（回复在两次读取之间被改写）",
  extraAssistants = [],
  userText = "（本次派单消息的 user unit）",
} = {}) {
  return ({ page }) => {
    page.at(sendDelayMs, (p) => {
      p.appendUnit({ key: userKey, role: "user", text: userText });
      p.scrollToBottom();
      p.setGenerating(true);
    });
    page.at(replyDelayMs, (p) => {
      p.appendUnit({ key: assistantKey, role: "assistant", text: replyText, assistantUuid });
      for (const extra of extraAssistants) {
        p.appendUnit({ key: extra.key, role: "assistant", text: extra.text, assistantUuid: extra.assistantUuid });
      }
      p.setGenerating(false);
      p.scrollToBottom();
    });
    if (mutateAtMs !== null) {
      page.at(mutateAtMs, (p) => p.mutateUnitText(assistantKey, mutateText));
    }
  };
}

// 标准仿真页（会话 URL 默认合法 /c/<uuid>，供 extractConversationUrl 采集）。
export function createFixturePage({ html, pages = {}, viewportUnits = 4, conversationUrl = SESSION_URL, onSend = null, clockStart = 0 } = {}) {
  return new FixtureChatgptPage({ html, pages, viewportUnits, conversationUrl, onSend, clockStart });
}

// 互斥锁替身（dispatch 测试注入，避免无谓的 PowerShell 进程）。
export function fakeLock() {
  const state = { released: false, releaseCount: 0 };
  return {
    state,
    release() {
      state.released = true;
      state.releaseCount += 1;
    },
  };
}

export function newTempDir(label = "gptc") {
  return mkdtempSync(join(tmpdir(), `${label}-`));
}

export function cleanupTempDir(dir) {
  rmSync(dir, { recursive: true, force: true });
}

// 断言 promise 以指定内部 code 的 GptControllerError 拒绝，否则原样抛出。
export async function assertRejectsWith(rejectingPromise, code) {
  try {
    await rejectingPromise;
  } catch (error) {
    if (error?.code !== code) {
      throw new Error(`期望错误 code=${code}，实际 code=${error?.code ?? "(非 GptControllerError)"}：${error?.message}`);
    }
    return error;
  }
  throw new Error(`期望抛出 code=${code} 的错误，但调用成功了`);
}
