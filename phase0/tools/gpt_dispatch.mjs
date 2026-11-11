// AIEO Phase 0 工具：GPT 会话派单/收回复（供开发方 Agent 直接与审查会话往返）
//
// 用法：
//   node gpt_dispatch.mjs --new-session --message-file <txt>   # 新建审查会话并发送首条消息
//   node gpt_dispatch.mjs --message-file <txt>                 # 向已保存会话发送
//   node gpt_dispatch.mjs --message "<文本>"                   # 直接传文本
//
// 行为：
//   - 复用 POC-03 验证过的 CDP 接管模式与 DOM 契约（结构化判定、发送双验、75s 确认窗、特征串提取）
//   - 单条消息强制 ≤1200 UTF-8 字节（ego 手册硬上限；超限即拒绝，不做静默截断）
//   - 证据落盘 logs/dispatch-<ts>/：request.txt / reply.txt / result.json / 截图
//   - 新会话发送后自动捕获 /c/<uuid> 存入 logs/gpt-reviewer-session.json
//
// 注：判定辅助函数与本脚本内联（而非 import e2e_orchestrate），
//     因 e2e_orchestrate.mjs/completion_judge.mjs 正处于审查冻结的 Commit 中，不得改动。

import { chromium } from "playwright";
import { spawn, execFile } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, readFileSync, appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const AIEO_ROOT = join(__dirname, "..", "..");
const PROFILE_DIR = join(AIEO_ROOT, "runtime", "chrome_profiles", "gpt-poc");
const SHOT_DIR = join(__dirname, "..", "screenshots");
const LOG_DIR = join(__dirname, "..", "logs");
const REVIEWER_SESSION = join(LOG_DIR, "gpt-reviewer-session.json");
const SESSION_JSON = join(LOG_DIR, "gpt-poc-session.json");

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const DEBUG_PORT = 9222;
const CDP_URL = `http://127.0.0.1:${DEBUG_PORT}`;
const CHATGPT_HOME = "https://chatgpt.com/";
const CONFIRM_WINDOW_MS = Number(process.env.AIEO_CONFIRM_WINDOW_MS || 75000);
const READY_TIMEOUT_MS = 40000;
const SEND_ACCEPT_TIMEOUT_MS = 30000;
const MAX_MSG_BYTES = 1200; // ego 手册硬上限（单块 insertText）

const args = process.argv.slice(2);
const newSession = args.includes("--new-session");
const msgIdx = args.indexOf("--message");
const fileIdx = args.indexOf("--message-file");
let message = null;
if (fileIdx >= 0) message = readFileSync(args[fileIdx + 1], "utf8").trim();
else if (msgIdx >= 0) message = args[msgIdx + 1];
if (!message) { console.error("用法: node gpt_dispatch.mjs [--new-session] --message-file <txt> | --message <文本>"); process.exit(2); }

const msgBytes = Buffer.byteLength(message, "utf8");
if (msgBytes > MAX_MSG_BYTES) {
  console.error(`消息 ${msgBytes} 字节，超过单块上限 ${MAX_MSG_BYTES}。请拆分或精简（分块投递属 Phase 1 范围）。`);
  process.exit(2);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const EV_DIR = join(LOG_DIR, `dispatch-${stamp}`);
mkdirSync(EV_DIR, { recursive: true });
mkdirSync(SHOT_DIR, { recursive: true });

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  appendFileSync(join(EV_DIR, "run.log"), line + "\n", "utf8");
}
async function shot(page, name) {
  await page.screenshot({ path: join(SHOT_DIR, name) }).catch(() => {});
  await page.screenshot({ path: join(EV_DIR, name) }).catch(() => {});
  log(`截图: ${name}`);
}

// ---------- Chrome 生命周期（与 POC-03 相同模式） ----------
function killProfileChrome() {
  return new Promise((resolve) => {
    const ps = `Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.CommandLine -like '*gpt-poc*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
    execFile("powershell", ["-NoProfile", "-Command", ps], () => resolve());
  });
}
async function cdpReady() { try { return (await fetch(`${CDP_URL}/json/version`)).ok; } catch { return false; } }
async function startChromeWithDebugPort() {
  if (await cdpReady()) { log("复用已运行调试端口 9222"); return; }
  await killProfileChrome();
  await new Promise((r) => setTimeout(r, 1500));
  const child = spawn(CHROME, [
    `--remote-debugging-port=${DEBUG_PORT}`, "--remote-allow-origins=*",
    `--user-data-dir=${PROFILE_DIR}`, "--no-first-run", "--no-default-browser-check",
    "--disable-session-crashed-bubble", "--start-maximized", CHATGPT_HOME,
  ], { detached: true, stdio: "ignore" });
  child.unref();
  for (let i = 0; i < 45; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    if (await cdpReady()) { log(`Chrome 已启动 pid=${child.pid}`); return; }
  }
  throw new Error("Chrome 调试端口未就绪");
}
async function attachPage() {
  const browser = await chromium.connectOverCDP(CDP_URL, { timeout: 30000 });
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find((p) => p.url().includes("chatgpt.com")) || ctx.pages()[0] || (await ctx.newPage());
  return { browser, page };
}

// ---------- DOM 契约（与已验证版本一致） ----------
async function readTailUnit(page) {
  return page.evaluate(() => {
    const units = Array.from(document.querySelectorAll("[data-content-search-unit-key]")).filter(
      (el) => el.offsetParent !== null || el.getClientRects().length > 0);
    if (!units.length) return null;
    const last = units[units.length - 1];
    const key = last.getAttribute("data-content-search-unit-key") || "";
    const role = key.split(":").pop();
    let assistantUuid = null;
    if (role === "assistant") {
      const dil = last.querySelector("[data-dil-response][data-dil-message-id]");
      assistantUuid = dil ? dil.getAttribute("data-dil-message-id") : null;
    }
    return { role, key, assistantUuid };
  });
}
async function readReplyAfterOwnMessage(page, marker) {
  return page.evaluate((marker) => {
    const units = Array.from(document.querySelectorAll("[data-content-search-unit-key]")).filter(
      (el) => el.offsetParent !== null || el.getClientRects().length > 0);
    const norm = (s) => (s || "").replace(/\s+/g, "");
    let lastUserIdx = -1;
    for (let i = 0; i < units.length; i++) {
      const key = units[i].getAttribute("data-content-search-unit-key") || "";
      if (key.split(":").pop() === "user" && norm(units[i].innerText).includes(marker)) lastUserIdx = i;
    }
    if (lastUserIdx < 0) return null;
    const out = [];
    for (const el of units.slice(lastUserIdx + 1)) {
      const key = el.getAttribute("data-content-search-unit-key") || "";
      if (key.split(":").pop() === "assistant") {
        out.push({ key, text: (el.innerText || "").replace(/^ChatGPT 说：\s*/i, "").trim() });
      }
    }
    return out;
  }, marker);
}
async function stopButtonVisible(page) {
  return page.evaluate(() => {
    const candidates = document.querySelectorAll(
      'button[aria-label="停止"], button[aria-label="Stop"], button[data-testid="stop-button"], form button[aria-label*="停止"], form button[aria-label*="Stop"]');
    for (const el of candidates) {
      if (el.offsetParent !== null || el.getClientRects().length > 0) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) return true;
      }
    }
    return false;
  });
}

// ---------- 发送并收集（判定逻辑与 e2e_orchestrate 同语义） ----------
async function sendAndCollect(page, text, label) {
  const findComposer = async () => {
    const loc = page.locator('[aria-label="询问 ChatGPT"], [aria-label="Ask ChatGPT"], #prompt-textarea').first();
    await loc.waitFor({ state: "visible", timeout: 10000 });
    return loc;
  };
  const baseline = await readTailUnit(page);
  log(`[${label}] 基线尾部: ${JSON.stringify(baseline)}`);
  const c = await findComposer(page);
  if (((await c.innerText()) || "").trim() !== "") throw new Error("Composer 非空，STOP");
  await c.click();
  await page.evaluate((t) => document.execCommand("insertText", false, t), text);
  const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
  if (norm(await c.innerText()) !== norm(text)) throw new Error("回读不一致，STOP");
  await c.focus();
  await page.keyboard.press("Enter");

  // 发送双验（R3 语义）：tail 确认后观察停止按钮
  let tailOk = false, stopOkAfterTail = false, polls = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < SEND_ACCEPT_TIMEOUT_MS) {
    polls++;
    const tail = await readTailUnit(page);
    if (!tailOk && tail && tail.role === "user" && tail.key !== baseline?.key) tailOk = true;
    if (tailOk && (await stopButtonVisible(page))) stopOkAfterTail = true;
    if (tailOk && stopOkAfterTail) break;
    await page.waitForTimeout(1000);
  }
  if (!(tailOk && stopOkAfterTail)) {
    throw new Error(`发送双验未通过（tailOk=${tailOk} stopOkAfterTail=${stopOkAfterTail}），UNCERTAIN，不重发`);
  }
  log(`[${label}] 发送双验通过（polls=${polls}，tail 后观察）`);
  await shot(page, `sent-${label}.png`);

  // 生成等待 + 300s 超时
  let generationObserved = stopOkAfterTail, generationEnded = false;
  const t1 = Date.now();
  while (Date.now() - t1 < 300000) {
    const gen = await stopButtonVisible(page);
    if (gen) generationObserved = true;
    if (generationObserved && !gen) { generationEnded = true; break; }
    await page.waitForTimeout(2000);
  }
  if (!generationEnded) throw new Error(`GENERATION_TIMEOUT: 300s 内未确认生成结束`);
  await page.waitForTimeout(CONFIRM_WINDOW_MS);

  // 最终 6 项判定
  const finalStopVisible = await stopButtonVisible(page);
  const tailAfter = await readTailUnit(page);
  await page.waitForTimeout(3000);
  const tailAgain = await readTailUnit(page);
  const composerEmpty = ((await c.innerText().catch(() => "x")) || "").trim() === "";
  const checks = {
    generation_observed: generationObserved === true,
    generation_ended: generationEnded === true,
    final_stop_button_not_visible: finalStopVisible === false,
    tail_is_assistant: tailAfter?.role === "assistant",
    dil_uuid_present: typeof tailAfter?.assistantUuid === "string" && tailAfter.assistantUuid.length > 0,
    uuid_stable: typeof tailAfter?.assistantUuid === "string" && tailAfter.assistantUuid === tailAgain?.assistantUuid,
    composer_empty: composerEmpty === true,
  };
  if (!Object.values(checks).every(Boolean)) {
    throw new Error(`完成判定未通过: ${JSON.stringify(checks)}`);
  }
  const marker = text.replace(/\s+/g, "").slice(0, 18);
  const units = (await readReplyAfterOwnMessage(page, marker)) || [];
  const reply = units.map((u) => u.text).join("\n").trim();
  log(`[${label}] COMPLETED，回复 ${reply.length} 字符`);
  await shot(page, `reply-${label}.png`);
  return { reply, assistant_uuid: tailAfter.assistantUuid, checks };
}

// ---------- 主流程 ----------
async function main() {
  log(`=== GPT 派单（${newSession ? "新建会话" : "已有会话"}，消息 ${msgBytes} 字节）===`);
  writeFileSync(join(EV_DIR, "request.txt"), message, "utf8");

  await startChromeWithDebugPort();
  const { browser, page } = await attachPage();

  if (newSession) {
    // 新聊天落地页：无消息 unit，就绪 = composer + bodyLen>300（手册 NEW_CONV 口径）
    await page.goto(CHATGPT_HOME, { waitUntil: "domcontentloaded", timeout: 60000 });
    const t0 = Date.now();
    while (Date.now() - t0 < READY_TIMEOUT_MS) {
      const ok = await page.evaluate(() => {
        const composer = !!document.querySelector('[aria-label="询问 ChatGPT"], [aria-label="Ask ChatGPT"], #prompt-textarea');
        return composer && (document.body?.innerText || "").length > 300;
      });
      if (ok) break;
      await page.waitForTimeout(1500);
    }
    log("新聊天页面就绪");
  } else {
    const sessionFile = existsSync(REVIEWER_SESSION) ? REVIEWER_SESSION : SESSION_JSON;
    const { conversation_url: targetUrl } = JSON.parse(readFileSync(sessionFile, "utf8"));
    const t0 = Date.now();
    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    while (Date.now() - t0 < READY_TIMEOUT_MS) {
      const probe = await page.evaluate(() => {
        const units = document.querySelectorAll("[data-content-search-unit-key]").length;
        const composer = !!document.querySelector('[aria-label="询问 ChatGPT"], [aria-label="Ask ChatGPT"], #prompt-textarea');
        return { units, composer, bodyLen: (document.body?.innerText || "").length };
      });
      if (probe.units > 0 && probe.composer && probe.bodyLen > 300) break;
      await page.waitForTimeout(1500);
    }
    log(`会话就绪: ${targetUrl}`);
  }

  const { reply, assistant_uuid, checks } = await sendAndCollect(page, message, "dispatch");

  if (newSession) {
    // 发送后等真实会话 URL（跳过 local-chatgpt 草稿态）
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(1000);
      const m = page.url().match(/chatgpt\.com\/(c\/[0-9a-f-]{36})/i);
      if (m) {
        const session = { conversation_url: `https://chatgpt.com/${m[1]}`, captured_at: new Date().toISOString(), role: "reviewer" };
        writeFileSync(REVIEWER_SESSION, JSON.stringify(session, null, 2), "utf8");
        log(`审查会话已保存: ${session.conversation_url}`);
        break;
      }
    }
  }

  const result = { at: new Date().toISOString(), message_bytes: msgBytes, reply, assistant_uuid, completion_checks: checks };
  writeFileSync(join(EV_DIR, "result.json"), JSON.stringify(result, null, 2), "utf8");
  writeFileSync(join(EV_DIR, "reply.txt"), reply, "utf8");
  await browser.close().catch(() => {});
  await killProfileChrome();
  log("=== 派单完成 ===");
  console.log("\n=====REPLY_BEGIN=====");
  console.log(reply);
  console.log("=====REPLY_END=====");
}

main().catch((e) => {
  log(`致命错误: ${e.message}`);
  console.error(e);
  process.exit(1);
});
