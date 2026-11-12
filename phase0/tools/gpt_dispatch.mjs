// AIEO Phase 0 工具：GPT 会话派单/收回复（供开发方 Agent 直接与审查会话往返）
//
// 用法：
//   node gpt_dispatch.mjs --new-session --message-file <txt>   # 新建审查会话并发送首条消息
//   node gpt_dispatch.mjs --message-file <txt>                 # 向已保存会话发送
//   node gpt_dispatch.mjs --message "<文本>"                   # 直接传文本
//   可选绑定/校验：--task-id <T-P1-001> --execution-id <EXEC-001> --correlation-id <CORR-001> --schema <path>
//
// 行为：
//   - 复用 POC-03 验证过的 CDP 接管模式与 DOM 契约（结构化判定、发送双验、75s 确认窗）
//   - 单条消息强制 ≤1200 UTF-8 字节；超限即拒绝，不截断、不自动拆分、不做网页长文本降级
//   - 以发送双验确认的 user unit key 为起点，提取下一 user 前的全部 assistant unit
//   - 确认窗后至少间隔 3 秒做两次完整读取，核对 key 列表、数量、逐 unit 全文 SHA-256 和尾部 UUID
//   - 证据落盘 logs/dispatch-<ts>/：request.txt / raw-units.json / reply.txt / result.json / 截图
//   - raw-units.json 与 reply.txt 先落盘并回读验证原始字节，成功后才写 result.json
//   - 新会话发送后自动捕获 /c/<uuid> 存入 logs/gpt-reviewer-session.json
//
// 注：判定辅助函数与本脚本内联（而非 import e2e_orchestrate），
//     因 e2e_orchestrate.mjs/completion_judge.mjs 正处于审查冻结的 Commit 中，不得改动。

import { chromium } from "playwright";
import { spawn, execFile } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, readFileSync, appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { acquireSessionLock } from "../e2e-poc/session_lock.mjs";
import {
  MIN_STABLE_READ_INTERVAL_MS,
  compareInboundSnapshots,
  createInboundRangeCollector,
  persistInboundArtifacts,
  proveAdjacentWindowOverlap,
  selectInboundReply,
  validateInboundJsonArtifact,
} from "./inbound_reply.mjs";
import { registerArtifactWithRetry } from "./m1_artifact_registry.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const AIEO_ROOT = join(__dirname, "..", "..");
const PROFILE_DIR = join(AIEO_ROOT, "runtime", "chrome_profiles", "gpt-poc");
const LOG_DIR = join(__dirname, "..", "logs");
const REVIEWER_SESSION = join(LOG_DIR, "gpt-reviewer-session.json");
const SESSION_JSON = join(LOG_DIR, "gpt-poc-session.json");

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const DEBUG_PORT = 9222;
const CDP_URL = `http://127.0.0.1:${DEBUG_PORT}`;
const CHATGPT_HOME = "https://chatgpt.com/";
const CONFIRM_WINDOW_MS = Number(
  process.env.AIEO_GPT_CONTROLLER_CONFIRM_WINDOW_MS || process.env.AIEO_CONFIRM_WINDOW_MS || 75000,
);
const STABLE_READ_INTERVAL_MS = Math.max(
  MIN_STABLE_READ_INTERVAL_MS,
  Number(process.env.AIEO_GPT_CONTROLLER_STABLE_READ_INTERVAL_MS || MIN_STABLE_READ_INTERVAL_MS),
);
const GENERATION_TIMEOUT_MS = Number(process.env.AIEO_GPT_CONTROLLER_GENERATION_TIMEOUT_MS || 300000);
const READY_TIMEOUT_MS = 40000;
const SEND_ACCEPT_TIMEOUT_MS = 30000;
const MAX_MSG_BYTES = 1200; // 网页 insertText 硬上限，不适用于入站回复

const args = process.argv.slice(2);
const newSession = args.includes("--new-session");
const msgIdx = args.indexOf("--message");
const fileIdx = args.indexOf("--message-file");
let message = null;
if (fileIdx >= 0) message = readFileSync(args[fileIdx + 1], "utf8").trim();
else if (msgIdx >= 0) message = args[msgIdx + 1];
if (!message) {
  console.error("用法: node gpt_dispatch.mjs [--new-session] --message-file <txt> | --message <文本> [--task-id <id>] [--execution-id <id>] [--correlation-id <id>] [--schema <path>]");
  process.exit(2);
}

function optionalArg(flag) {
  const index = args.indexOf(flag);
  if (index < 0) return null;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    console.error(`${flag} 缺少值`);
    process.exit(2);
  }
  return value;
}
const optionalIds = {
  task_id: optionalArg("--task-id"),
  execution_id: optionalArg("--execution-id"),
  correlation_id: optionalArg("--correlation-id"),
};
const schemaPath = optionalArg("--schema");
const idRules = {
  task_id: /^T-(P[0-9]+-)?[0-9]{3,}$/,
  execution_id: /^EXEC-[0-9]{3,}$/,
  correlation_id: /^(CORR-[0-9]{3,}|[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/,
};
for (const [field, value] of Object.entries(optionalIds)) {
  if (value !== null && !idRules[field].test(value)) {
    console.error(`${field} 格式不合法: ${value}`);
    process.exit(2);
  }
}

const msgBytes = Buffer.byteLength(message, "utf8");
if (msgBytes > MAX_MSG_BYTES) {
  console.error(`消息 ${msgBytes} 字节，超过单条上限 ${MAX_MSG_BYTES}。请缩短指令或改用 GitPointer；不自动拆分，不做网页长文本降级。`);
  process.exit(2);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const EV_DIR = join(LOG_DIR, `dispatch-${stamp}`);
mkdirSync(EV_DIR, { recursive: true });

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  appendFileSync(join(EV_DIR, "run.log"), line + "\n", "utf8");
}
async function shot(page, name) {
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

// ---------- DOM 契约 ----------
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
      const dils = Array.from(last.querySelectorAll("[data-dil-response][data-dil-message-id]"));
      if (dils.length === 1) {
        const id = dils[0].getAttribute("data-dil-message-id") || "";
        assistantUuid = id.length > 0 ? id : null;
      }
    }
    return { role, key, assistantUuid };
  });
}

// 完整读取当前 DOM 渲染集合，不用文本 marker，也不只取尾部或可视片段。
async function readDomUnits(page) {
  return page.evaluate(() => Array.from(document.querySelectorAll("[data-content-search-unit-key]")).map((el) => {
    const key = el.getAttribute("data-content-search-unit-key") || "";
    const role = key.split(":").pop();
    const dils = Array.from(el.querySelectorAll("[data-dil-response][data-dil-message-id]"));
    let assistantUuid = null;
    if (role === "assistant" && dils.length === 1) {
      const id = dils[0].getAttribute("data-dil-message-id") || "";
      assistantUuid = id.length > 0 ? id : null;
    }
    return {
      key,
      role,
      text: el.innerText ?? "",
      assistantUuid,
      visible: el.offsetParent !== null || el.getClientRects().length > 0,
    };
  }));
}

async function readDomWindow(page) {
  const units = await readDomUnits(page);
  const scroll = await page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll("[data-content-search-unit-key]"));
    const anchor = candidates.find((el) => el.offsetParent !== null || el.getClientRects().length > 0) || candidates[0];
    let scroller = anchor?.parentElement ?? null;
    while (scroller && scroller !== document.body) {
      const style = getComputedStyle(scroller);
      if (/(auto|scroll|overlay)/.test(style.overflowY) && scroller.scrollHeight > scroller.clientHeight) break;
      scroller = scroller.parentElement;
    }
    const target = scroller && scroller !== document.body ? scroller : document.scrollingElement;
    if (!target) return { at_top: true, at_bottom: true, scrollable: false, scroll_top: 0, scroll_height: 0, client_height: 0 };
    return {
      at_top: target.scrollTop <= 1,
      at_bottom: target.scrollTop + target.clientHeight >= target.scrollHeight - 2,
      scrollable: target.scrollHeight > target.clientHeight + 2,
      scroll_top: target.scrollTop,
      scroll_height: target.scrollHeight,
      client_height: target.clientHeight,
    };
  });
  return { units, ...scroll };
}

async function scrollDomWindow(page, direction) {
  const result = await page.evaluate(({ direction }) => {
    const candidates = Array.from(document.querySelectorAll("[data-content-search-unit-key]"));
    const anchor = candidates.find((el) => el.offsetParent !== null || el.getClientRects().length > 0) || candidates[0];
    let scroller = anchor?.parentElement ?? null;
    while (scroller && scroller !== document.body) {
      const style = getComputedStyle(scroller);
      if (/(auto|scroll|overlay)/.test(style.overflowY) && scroller.scrollHeight > scroller.clientHeight) break;
      scroller = scroller.parentElement;
    }
    const target = scroller && scroller !== document.body ? scroller : document.scrollingElement;
    if (!target) return { before: 0, after: 0 };
    const before = target.scrollTop;
    const delta = Math.max(200, target.clientHeight * 0.65) * direction;
    target.scrollTop = Math.max(0, Math.min(target.scrollHeight - target.clientHeight, before + delta));
    return { before, after: target.scrollTop };
  }, { direction });
  await page.waitForTimeout(250);
  return result;
}

function findStartIndex(windowUnits, userUnitKey) {
  return windowUnits.findIndex((unit) => unit.key === userUnitKey && unit.role === "user");
}

// 两段式实体化：先向上逐窗定位起点，再向下逐窗收集至下一 user 或真实底部。
// 起点搜索和回复采集的每一次窗口转换都必须有相同 key 重叠；跳窗直接失败。
async function readReplySnapshot(page, userUnitKey) {
  const readStartedAt = Date.now();
  const maxWindowTransitions = Number(process.env.AIEO_GPT_CONTROLLER_MAX_RANGE_SCROLLS || 200);
  let current = await readDomWindow(page);
  if (current.units.length === 0) throw new Error("INBOUND_WINDOW_EMPTY: 页面没有已渲染 unit");
  let previousSearch = null;
  const searchProof = [];
  let transitions = 0;

  while (true) {
    if (previousSearch) {
      const overlap = proveAdjacentWindowOverlap(previousSearch.units, current.units);
      searchProof.push({ unit_keys: current.units.map((unit) => unit.key), ...overlap });
    } else {
      searchProof.push({ unit_keys: current.units.map((unit) => unit.key), overlap_keys: [] });
    }
    const startFound = findStartIndex(current.units, userUnitKey) >= 0;
    // 可滚动页面即使起点和尾部同屏 DOM 存在，也先向上离开底部，再向下分段复核。
    if (startFound && (!current.at_bottom || !current.scrollable)) break;
    if (current.at_top) {
      throw new Error(`INBOUND_START_UNIT_MISSING: 连续向上搜索到顶部仍未找到可分段读取的 ${userUnitKey}`);
    }
    if (transitions >= maxWindowTransitions) throw new Error("INBOUND_RANGE_SCROLL_LIMIT: 起点搜索超过窗口转换上限");
    const moved = await scrollDomWindow(page, -1);
    transitions += 1;
    previousSearch = current;
    current = await readDomWindow(page);
    if (moved.before === moved.after) throw new Error("INBOUND_START_SEARCH_NO_PROGRESS: 向上滚动无位移且尚未到顶部");
  }

  const collector = createInboundRangeCollector(userUnitKey);
  let collectionState = collector.ingest(current.units, { atBottom: current.at_bottom, scrollable: current.scrollable });
  while (!collectionState.complete) {
    if (current.at_bottom) throw new Error("INBOUND_RANGE_INCOMPLETE: 已到底但未形成完整目标区间");
    if (transitions >= maxWindowTransitions) throw new Error("INBOUND_RANGE_SCROLL_LIMIT: 区间采集超过窗口转换上限");
    const moved = await scrollDomWindow(page, 1);
    transitions += 1;
    current = await readDomWindow(page);
    if (moved.before === moved.after) throw new Error("INBOUND_RANGE_SCROLL_NO_PROGRESS: 向下滚动无位移且尚未到终点");
    collectionState = collector.ingest(current.units, { atBottom: current.at_bottom, scrollable: current.scrollable });
  }

  const materialized = collector.build();
  const selected = selectInboundReply(materialized.units, userUnitKey);
  const visibleUnits = current.units.filter((unit) => unit.visible);
  const tail = visibleUnits.length > 0 ? visibleUnits[visibleUnits.length - 1] : null;
  return {
    ...selected,
    range_proof: { ...materialized.range_proof, start_search_windows: searchProof, window_transitions: transitions },
    read_started_at: new Date(readStartedAt).toISOString(),
    read_finished_at: new Date().toISOString(),
    rendered_unit_keys: current.units.map((unit) => unit.key),
    tail: tail ? { key: tail.key, role: tail.role, assistantUuid: tail.assistantUuid } : null,
  };
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

// ---------- 会话上限安全停止 ----------
async function stopIfContextLimit(page) {
  // 上限横幅可能晚于 unit/composer 就绪出现，不能只做一次即时检查
  const limited = await page
    .waitForFunction(() => (document.body?.innerText || "").includes("上下文窗口已达上限"), null, { timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  if (!limited) return false;
  await shot(page, "session-context-limit-stop.png");
  throw new Error("CONTEXT_LIMIT_STOP: 上下文窗口已达上限，已停止自动化；请由主会话换会话，不重发、不自动迁移");
}

// ---------- 发送并收集 ----------
async function sendAndCollect(page, text, label) {
  const findComposer = async () => {
    const loc = page.locator('[aria-label="询问 ChatGPT"], [aria-label="Ask ChatGPT"], #prompt-textarea').filter({ visible: true }).first();
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

  // 发送双验：记录本次新 user unit key，并在 tail 确认后观察停止按钮。
  let tailOk = false;
  let stopOkAfterTail = false;
  let sentUserUnitKey = null;
  let polls = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < SEND_ACCEPT_TIMEOUT_MS) {
    polls++;
    const tail = await readTailUnit(page);
    if (!tailOk && tail && tail.role === "user" && tail.key && tail.key !== baseline?.key) {
      tailOk = true;
      sentUserUnitKey = tail.key;
    }
    if (tailOk && (await stopButtonVisible(page))) stopOkAfterTail = true;
    if (tailOk && stopOkAfterTail) break;
    await page.waitForTimeout(1000);
  }
  if (!(tailOk && stopOkAfterTail && sentUserUnitKey)) {
    throw new Error(`发送双验未通过（tailOk=${tailOk} stopOkAfterTail=${stopOkAfterTail} userUnitKey=${sentUserUnitKey || "missing"}），UNCERTAIN，不重发`);
  }
  log(`[${label}] 发送双验通过（polls=${polls}，user_unit_key=${sentUserUnitKey}，tail 后观察）`);
  await shot(page, `sent-${label}.png`);

  // 生成等待 + 默认 300s 超时
  let generationObserved = stopOkAfterTail;
  let generationEnded = false;
  const t1 = Date.now();
  while (Date.now() - t1 < GENERATION_TIMEOUT_MS) {
    const gen = await stopButtonVisible(page);
    if (gen) generationObserved = true;
    if (generationObserved && !gen) { generationEnded = true; break; }
    await page.waitForTimeout(2000);
  }
  if (!generationEnded) throw new Error(`GENERATION_TIMEOUT: ${GENERATION_TIMEOUT_MS}ms 内未确认生成结束`);
  await page.waitForTimeout(CONFIRM_WINDOW_MS);

  // 确认窗后进行两次完整 unit 读取；任何全文、key、数量或 UUID 变化都会抛错。
  const finalStopVisible = await stopButtonVisible(page);
  const firstReadStartedMs = Date.now();
  const firstSnapshot = await readReplySnapshot(page, sentUserUnitKey);
  await page.waitForTimeout(STABLE_READ_INTERVAL_MS);
  const secondReadStartedMs = Date.now();
  const secondSnapshot = await readReplySnapshot(page, sentUserUnitKey);
  const stability = compareInboundSnapshots(firstSnapshot, secondSnapshot, secondReadStartedMs - firstReadStartedMs);
  const tailAfter = firstSnapshot.tail;
  const tailAgain = secondSnapshot.tail;
  const finalStopVisibleAgain = await stopButtonVisible(page);
  const composerEmpty = ((await c.innerText().catch(() => "x")) || "").trim() === "";
  const checks = {
    generation_observed: generationObserved === true,
    generation_ended: generationEnded === true,
    final_stop_button_not_visible: finalStopVisible === false && finalStopVisibleAgain === false,
    tail_is_assistant: tailAfter?.role === "assistant" && tailAgain?.role === "assistant",
    dil_uuid_present: typeof tailAfter?.assistantUuid === "string" && tailAfter.assistantUuid.length > 0,
    uuid_stable: typeof tailAfter?.assistantUuid === "string" && tailAfter.assistantUuid === tailAgain?.assistantUuid,
    target_tail_matches_overall:
      firstSnapshot.assistant_uuid === tailAfter?.assistantUuid && secondSnapshot.assistant_uuid === tailAgain?.assistantUuid,
    stable_unit_read: stability.stable === true,
    target_range_materialized:
      firstSnapshot.range_proof?.complete === true && secondSnapshot.range_proof?.complete === true,
    composer_empty: composerEmpty === true,
  };
  if (!Object.values(checks).every(Boolean)) {
    throw new Error(`完成判定未通过: ${JSON.stringify(checks)}`);
  }
  log(`[${label}] COMPLETED，${secondSnapshot.unit_count} 个 assistant unit，回复 ${Buffer.byteLength(secondSnapshot.reply, "utf8")} UTF-8 字节，区间窗口 ${secondSnapshot.range_proof.windows.length} 个`);
  await shot(page, `reply-${label}.png`);
  return {
    snapshot: secondSnapshot,
    assistant_uuid: secondSnapshot.assistant_uuid,
    checks,
    stability,
  };
}

// ---------- 主流程 ----------
async function main() {
  // R5：会话级跨进程独占锁（与 e2e_orchestrate 同一把锁，互斥自动化实例）
  const lock = acquireSessionLock({ holder: "gpt_dispatch" });
  log(`会话锁已获取 pid=${process.pid}`);
  try {
    await mainLocked();
  } finally {
    lock.release();
    log("会话锁已释放");
  }
}

async function mainLocked() {
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

  await stopIfContextLimit(page);

  const { snapshot, assistant_uuid, checks, stability } = await sendAndCollect(page, message, "dispatch");

  // 保存当前真实会话 URL（local-chatgpt 草稿态跳过；上限已在发送前安全停止）
  let conversationUrl = null;
  let sessionId = null;
  for (let i = 0; i < 10; i++) {
    const m = page.url().match(/chatgpt\.com\/(?:.*\/)?c\/([0-9a-f-]{36})/i);
    if (m) {
      sessionId = m[1];
      conversationUrl = `https://chatgpt.com/c/${sessionId}`;
      const session = { conversation_url: conversationUrl, captured_at: new Date().toISOString(), role: "reviewer" };
      writeFileSync(REVIEWER_SESSION, JSON.stringify(session, null, 2), "utf8");
      log(`审查会话已保存: ${session.conversation_url}`);
      break;
    }
    await page.waitForTimeout(1000);
  }
  if (!conversationUrl || !sessionId) throw new Error("SESSION_URL_UNAVAILABLE: 未取得真实会话 URL，拒绝写成功结果");

  // 原始 unit 与合成回复先落盘、回读核验；任一失败都不会写 result.json。
  const extractedAt = new Date().toISOString();
  const artifacts = persistInboundArtifacts({ directory: EV_DIR, snapshot, extractedAt });

  // 从已回读的原始 artifact 做全文 JSON 解析；未请求 Schema 时明确 NOT_REQUESTED。
  const validationWithJson = validateInboundJsonArtifact({
    artifactPath: artifacts.reply.path,
    schemaPath,
    expectedIds: optionalIds,
  });
  const { parsed_json: parsedJson, ...validation } = validationWithJson;
  log(`JSON/Schema/绑定校验: ${validation.status}`);

  // 只有原始 artifact 与请求的校验全部通过后才登记；失败只重试本地登记，绝不重发 GPT。
  let m1Registration;
  if (optionalIds.task_id) {
    const artifactKind = schemaPath
      ? (schemaPath.replaceAll("\\", "/").endsWith("/review-report.schema.json") ? "REVIEW_REPORT" : "GPT_SCHEMA_VALIDATED_JSON")
      : "GPT_REPLY_TEXT";
    m1Registration = registerArtifactWithRetry({
      registryPath: join(LOG_DIR, "m1-artifact-registry.json"),
      artifactPath: artifacts.reply.path,
      ...optionalIds,
      artifact_kind: artifactKind,
      schema_validation: validation.schema.status,
      unit_metadata: {
        user_unit_key: snapshot.user_unit_key,
        next_user_unit_key: snapshot.next_user_unit_key,
        unit_keys: snapshot.unit_keys,
        unit_count: snapshot.unit_count,
        assistant_uuid,
        range_proof: snapshot.range_proof,
      },
    });
    log(`M1 本地登记: ${m1Registration.status} artifact_id=${m1Registration.artifact_id} attempts=${m1Registration.attempt_count}`);
  } else {
    m1Registration = {
      status: "NOT_REQUESTED",
      reason: "task_id 未提供；未请求 M1 业务 artifact 登记",
      adapter_scope: "MINIMAL_LOCAL_M1_NOT_FULL_PLATFORM",
    };
    log("M1 本地登记: NOT_REQUESTED（未提供 task_id）");
  }

  const result = {
    at: extractedAt,
    message_bytes: msgBytes,
    reply: snapshot.reply,
    user_unit_key: snapshot.user_unit_key,
    next_user_unit_key: snapshot.next_user_unit_key,
    unit_keys: snapshot.unit_keys,
    unit_count: snapshot.unit_count,
    assistant_uuid,
    stability,
    range_proof: snapshot.range_proof,
    json_schema_binding: validation,
    m1_registration: m1Registration,
    artifact_sha256: artifacts.reply.artifact_sha256,
    size_bytes: artifacts.reply.size_bytes,
    reply_path: artifacts.reply.path,
    reply_readback_sha256: artifacts.reply.readback_sha256,
    raw_units_path: artifacts.raw_units.path,
    raw_units_sha256: artifacts.raw_units.artifact_sha256,
    raw_units_size_bytes: artifacts.raw_units.size_bytes,
    raw_units_readback_sha256: artifacts.raw_units.readback_sha256,
    session_id: sessionId,
    conversation_url: conversationUrl,
    completion_checks: {
      ...checks,
      raw_units_artifact_readback: artifacts.raw_units.readback_verified === true,
      reply_artifact_readback: artifacts.reply.readback_verified === true,
      json_schema_binding: validation.status === "PASS" || validation.status === "NOT_REQUESTED",
      m1_registration: ["REGISTERED", "RECOVERED", "DUPLICATE", "NOT_REQUESTED"].includes(m1Registration.status),
    },
    ...Object.fromEntries(Object.entries(optionalIds).filter(([, value]) => value !== null)),
  };
  writeFileSync(join(EV_DIR, "result.json"), JSON.stringify(result, null, 2), "utf8");
  await browser.close().catch(() => {});
  await killProfileChrome();
  log(`=== 派单完成，artifact_sha256=${result.artifact_sha256} size_bytes=${result.size_bytes} ===`);
  console.log("\n=====REPLY_BEGIN=====");
  console.log(snapshot.reply);
  console.log("=====REPLY_END=====");
}

main().catch((e) => {
  const details = e.details === undefined ? "" : ` details=${JSON.stringify(e.details)}`;
  log(`致命错误: ${e.message}${details}`);
  console.error(e);
  process.exit(1);
});
