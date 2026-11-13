// AIEO Phase 0 - POC-03: Playwright 控制系统 Chrome 与网页 GPT 会话往返
//
// 模式说明（2026-11-12 修订：CDP 接管模式）：
//   Playwright 直启的 Chrome 带 navigator.webdriver=true 等自动化标记，
//   auth.openai.com 的 Cloudflare Turnstile 人机验证会循环拒绝（人工也点不过）。
//   按项目约束不做任何绕过/隐身注入。改为：
//   以"普通方式"启动系统 Chrome（专用用户数据目录 + 仅本机的调试端口 9222，
//   无自动化标记），由用户人工完成登录与验证，脚本经 Playwright connectOverCDP
//   官方接口接管页面执行收发。调试端口只绑定 127.0.0.1，不暴露局域网。
//
// 用法：
//   node gpt_roundtrip.mjs --setup   # 首次：普通方式打开专用 Chrome，等待人工登录
//                                    # ChatGPT 并打开一个测试会话；脚本自动捕获会话 URL
//   node gpt_roundtrip.mjs --run     # 之后：重启 Chrome（登录态已在配置目录）自动收发验证
//
// 设计要点（依据本机 ego 手册实测 DOM 契约，2026-11-08 验证）：
//   - 消息身份锚点：[data-content-search-unit-key]（key 末段为 user/assistant 角色）；
//     assistant UUID 用 [data-dil-response][data-dil-message-id]。
//     禁用已失效的 [data-message-author-role]/[data-message-id]/article。
//   - 生成中只认"可见停止按钮"，不做"正在思考"文本匹配。
//   - 完成判定 = 停止按钮消失翻转 + 确认窗 + 尾部 assistant UUID 两次读取稳定 + Composer 空。
//   - 发送双验 = 尾部 unit 前进为 user + 停止按钮出现；超时只报 UNCERTAIN，绝不盲目重发。
//   - Composer 定位按 aria-label（询问 ChatGPT/Ask ChatGPT）→ id prompt-textarea 分级，
//     不用"第一个 contenteditable"。
//   - 系统代理 127.0.0.1:10391（直连 ChatGPT 不通，见环境盘点）——Chrome 普通启动
//     自动继承系统代理，无需额外参数。

import { chromium } from "playwright";
import { spawn, execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const AIEO_ROOT = join(__dirname, "..", "..");
const PROFILE_DIR = join(AIEO_ROOT, "runtime", "chrome_profiles", "gpt-poc");
const SHOT_DIR = join(__dirname, "..", "screenshots");
const LOG_DIR = join(__dirname, "..", "logs");
const SESSION_JSON = join(LOG_DIR, "gpt-poc-session.json");
const RUN_JSON = join(LOG_DIR, "gpt-poc-roundtrip-result.json");
const RUN_LOG = join(LOG_DIR, "gpt-poc-roundtrip.log");

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const DEBUG_PORT = 9222;
const CDP_URL = `http://127.0.0.1:${DEBUG_PORT}`;
const CHATGPT_HOME = "https://chatgpt.com/";

const CONFIRM_WINDOW_MS = Number(process.env.AIEO_CONFIRM_WINDOW_MS || 75000); // 手册口径 75s
const SEND_ACCEPT_TIMEOUT_MS = 30000;
const READY_TIMEOUT_MS = 40000;

const mode = process.argv.includes("--setup") ? "setup" : process.argv.includes("--run") ? "run" : null;
if (!mode) {
  console.error("用法: node gpt_roundtrip.mjs --setup | --run");
  process.exit(2);
}

for (const d of [PROFILE_DIR, SHOT_DIR, LOG_DIR]) mkdirSync(d, { recursive: true });

const logLines = [];
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  logLines.push(line);
  console.log(line);
  appendFileSync(RUN_LOG, line + "\n", "utf8");
}
async function shot(page, name) {
  const p = join(SHOT_DIR, name);
  await page.screenshot({ path: p, fullPage: false }).catch((e) => log(`截图失败 ${name}: ${e.message}`));
  log(`截图: ${name}`);
  return p;
}

// ---------- Chrome 生命周期（普通方式启动 + CDP 接管） ----------
function killProfileChrome() {
  return new Promise((resolve) => {
    const ps = `Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.CommandLine -like '*gpt-poc*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
    execFile("powershell", ["-NoProfile", "-Command", ps], (err) => {
      if (err) log(`killProfileChrome: ${err.message.slice(0, 100)}`);
      resolve();
    });
  });
}

async function cdpReady() {
  try {
    const r = await fetch(`${CDP_URL}/json/version`);
    return r.ok;
  } catch {
    return false;
  }
}

async function startChromeWithDebugPort() {
  if (await cdpReady()) {
    log(`复用已运行的调试端口 ${DEBUG_PORT}`);
    return;
  }
  await killProfileChrome();
  await new Promise((r) => setTimeout(r, 1500));
  const child = spawn(
    CHROME,
    [
      `--remote-debugging-port=${DEBUG_PORT}`,
      "--remote-allow-origins=*",
      `--user-data-dir=${PROFILE_DIR}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-session-crashed-bubble",
      "--start-maximized",
      CHATGPT_HOME,
    ],
    { detached: true, stdio: "ignore" }
  );
  child.unref();
  for (let i = 0; i < 45; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    if (await cdpReady()) {
      log(`Chrome 已以普通方式启动并开放本机调试端口 ${DEBUG_PORT}（pid=${child.pid}）`);
      return;
    }
  }
  throw new Error(`Chrome 调试端口 ${DEBUG_PORT} 45 秒内未就绪`);
}

async function attachPage() {
  const browser = await chromium.connectOverCDP(CDP_URL, { timeout: 30000 });
  const ctx = browser.contexts()[0];
  if (!ctx) throw new Error("CDP 无默认上下文");
  let page = ctx.pages().find((p) => p.url().includes("chatgpt.com")) || ctx.pages()[0] || (await ctx.newPage());
  return { browser, page };
}

// ---------- DOM 读取辅助 ----------
async function readTailUnit(page) {
  // 返回尾部 unit：{ role, key, assistantUuid, text } 或 null
  return page.evaluate(() => {
    const units = Array.from(document.querySelectorAll("[data-content-search-unit-key]")).filter(
      (el) => el.offsetParent !== null || el.getClientRects().length > 0
    );
    if (!units.length) return null;
    const last = units[units.length - 1];
    const key = last.getAttribute("data-content-search-unit-key") || "";
    const role = key.split(":").pop();
    let assistantUuid = null;
    if (role === "assistant") {
      const dil = last.querySelector("[data-dil-response][data-dil-message-id]");
      assistantUuid = dil ? dil.getAttribute("data-dil-message-id") : null;
    }
    return { role, key, assistantUuid, text: (last.innerText || "").slice(0, 200) };
  });
}

async function readReplyAfterOwnMessage(page, marker) {
  // 定位"包含我方消息特征串的最后一个 user unit"，合并其后全部 assistant unit 文本。
  // 不按 key 拼 user 键（实测 user/assistant 的 key 中段序号不同，拼接会落空）。
  return page.evaluate((marker) => {
    const units = Array.from(document.querySelectorAll("[data-content-search-unit-key]")).filter(
      (el) => el.offsetParent !== null || el.getClientRects().length > 0
    );
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
        let t = el.innerText || "";
        t = t.replace(/^ChatGPT 说：\s*/i, "").trim(); // 去掉回复气泡前缀
        out.push({ key, text: t });
      }
    }
    return out;
  }, marker);
}

async function composerVisible(page) {
  const sel = '[aria-label="询问 ChatGPT"], [aria-label="Ask ChatGPT"], #prompt-textarea';
  return (await page.locator(sel).count()) > 0;
}

async function findComposer(page) {
  const sel = '[aria-label="询问 ChatGPT"], [aria-label="Ask ChatGPT"], #prompt-textarea';
  const loc = page.locator(sel).first();
  await loc.waitFor({ state: "visible", timeout: 10000 });
  return loc;
}

async function composerText(page) {
  const c = await findComposer(page);
  return c.innerText();
}

async function stopButtonVisible(page) {
  return page.evaluate(() => {
    const candidates = document.querySelectorAll(
      'button[aria-label="停止"], button[aria-label="Stop"], button[data-testid="stop-button"], form button[aria-label*="停止"], form button[aria-label*="Stop"]'
    );
    for (const el of candidates) {
      if (el.offsetParent !== null || el.getClientRects().length > 0) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) return true;
      }
    }
    return false;
  });
}

async function waitForReady(page, targetUrl) {
  const t0 = Date.now();
  // goto 后 hydration 窗口内 unit 读取为 null 属正常，按 40s 预算等就绪
  await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  while (Date.now() - t0 < READY_TIMEOUT_MS) {
    const probe = await page.evaluate(() => {
      const units = document.querySelectorAll("[data-content-search-unit-key]").length;
      const composer =
        !!document.querySelector('[aria-label="询问 ChatGPT"], [aria-label="Ask ChatGPT"], #prompt-textarea');
      return { bodyLen: (document.body?.innerText || "").length, units, composer };
    });
    // 就绪 = 主区已有结构化消息 unit + composer 在 + 正文非空壳（>300）。
    // 短会话正文可远小于 600；空壳页（侧栏完整主区空）无 unit，以此区分。
    if (probe.units > 0 && probe.composer && probe.bodyLen > 300) return true;
    await page.waitForTimeout(1500);
  }
  return false;
}

// ---------- setup 模式 ----------
async function setup() {
  log("=== POC-03 setup：普通方式启动专用 Chrome（调试端口 127.0.0.1:" + DEBUG_PORT + "，无自动化标记）===");
  await startChromeWithDebugPort();
  const { browser, page } = await attachPage();
  await page.goto(CHATGPT_HOME, { waitUntil: "domcontentloaded", timeout: 60000 }).catch((e) => log(`初始导航: ${e.message}`));
  await page.waitForTimeout(4000);
  await shot(page, "poc3-01-initial-cdp.png");

  const t0 = Date.now();
  const MAX = 30 * 60 * 1000;
  log("请在弹出的浏览器窗口中：1) 登录 ChatGPT（邮箱+密码/验证码方式，Google 按钮会被 Google 拒绝）；2) 打开或新建一个测试会话（发过一条消息出现 /c/ 链接即可）。");
  let saved = false;
  while (Date.now() - t0 < MAX) {
    const url = page.url();
    const m = url.match(/chatgpt\.com\/.*(\/c\/[0-9a-f-]{36})/i);
    if (m) {
      const conversationUrl = `https://chatgpt.com${m[1]}`;
      const payload = { conversation_url: conversationUrl, captured_at: new Date().toISOString(), page_title: await page.title() };
      writeFileSync(SESSION_JSON, JSON.stringify(payload, null, 2), "utf8");
      await shot(page, "poc3-02-session-captured.png");
      log(`已捕获测试会话: ${conversationUrl}`);
      log("setup 完成。");
      saved = true;
      break;
    }
    await page.waitForTimeout(5000);
  }
  await browser.close().catch(() => {});
  await killProfileChrome();
  log(saved ? "=== setup PASS（登录态已保存在专用配置目录）===" : "=== setup 超时（30 分钟内未捕获到会话）===");
  process.exit(saved ? 0 : 1);
}

// ---------- run 模式 ----------
async function run() {
  if (!existsSync(SESSION_JSON)) {
    console.error("未找到会话配置，请先执行 --setup");
    process.exit(2);
  }
  const { conversation_url: targetUrl } = JSON.parse(readFileSync(SESSION_JSON, "utf8"));
  log(`=== POC-03 run：目标会话 ${targetUrl} ===`);
  const evidence = { started_at: new Date().toISOString(), target_url: targetUrl, messages: [], mode: "cdp-attach" };

  await startChromeWithDebugPort();
  const { browser, page } = await attachPage();

  const ready = await waitForReady(page, targetUrl);
  evidence.ready = ready;
  if (!ready) {
    await shot(page, "poc3-error-not-ready.png");
    writeFileSync(RUN_JSON, JSON.stringify({ ...evidence, error: "PAGE_NOT_READY" }, null, 2), "utf8");
    log("页面 40 秒内未就绪（可能登录失效或验证页），停止，不重发。请人工检查 screenshots/poc3-error-not-ready.png");
    await browser.close().catch(() => {});
    process.exit(1);
  }
  log("页面就绪。");
  await shot(page, "poc3-03-ready.png");

  const MSG1 = "你好，这是 AIEO Phase 0 的自动化测试消息。请只回复一个词：确认";
  const MSG2 = "第二条测试（验证上下文连续性）：我上一条消息要求你只回复的那个词是什么？请只回复那个词本身。";

  async function sendMessage(text, label) {
    const rec = { label, text_preview: text.slice(0, 50), sent_at: null };
    const baseline = await readTailUnit(page);
    rec.baseline_tail = baseline;
    log(`[${label}] 基线尾部: role=${baseline?.role} key=${baseline?.key?.slice(-24)} uuid=${baseline?.assistantUuid?.slice(0, 8)}`);

    // Composer 必须为空（空态 innerText.trim()===''）；非空即停，不覆盖他人草稿
    const c = await findComposer(page);
    let ctext = await composerText(page);
    if (ctext.trim() !== "") {
      rec.error = "COMPOSER_NOT_EMPTY_FOREIGN_DRAFT";
      log(`[${label}] Composer 非空（疑似他人/残留草稿），按手册 STOP，不覆盖。`);
      return rec;
    }
    await c.click();
    await page.evaluate((t) => {
      document.execCommand("insertText", false, t);
    }, text);
    // 回读核对（归一化空白）
    ctext = (await composerText(page)) || "";
    const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
    rec.readback_ok = norm(ctext) === norm(text);
    if (!rec.readback_ok) {
      rec.error = "READBACK_MISMATCH";
      rec.composer_actual = ctext.slice(0, 200);
      log(`[${label}] 回读不一致，STOP。实际=${ctext.slice(0, 80)}`);
      return rec;
    }
    log(`[${label}] 填充并回读一致（${text.length} 字符）。`);
    await shot(page, `poc3-04-filled-${label}.png`);

    // 发送前确认发送按钮可用（disabled=陈旧页）
    const sendBtn = page.locator('button[aria-label="发送"], button[aria-label="Send"], button[data-testid="send-button"]').first();
    const sendDisabled = await sendBtn.getAttribute("disabled").catch(() => null);
    const ariaDisabled = await sendBtn.getAttribute("aria-disabled").catch(() => null);
    rec.send_button = { found: (await sendBtn.count()) > 0, disabled: sendDisabled, ariaDisabled };
    if ((await sendBtn.count()) === 0) {
      rec.error = "SEND_BUTTON_MISSING_STOP";
      log(`[${label}] 发送按钮不存在，STOP。`);
      return rec;
    }

    // 默认 focus+Enter（手册口径）
    rec.sent_at = new Date().toISOString();
    await c.focus();
    await page.keyboard.press("Enter");

    // 发送双验：尾部前进为 user + 停止按钮出现
    const t0 = Date.now();
    let tailOk = false, stopOk = false;
    while (Date.now() - t0 < SEND_ACCEPT_TIMEOUT_MS) {
      const tail = await readTailUnit(page);
      if (tail && tail.role === "user" && tail.key !== baseline?.key) tailOk = true;
      if (await stopButtonVisible(page)) stopOk = true;
      if (tailOk && stopOk) break;
      await page.waitForTimeout(1000);
    }
    rec.accepted = { tail_advanced_to_user: tailOk, stop_button_appeared: stopOk };
    await shot(page, `poc3-05-sent-${label}.png`);
    if (!(tailOk && stopOk)) {
      rec.error = "SEND_UNCERTAIN_NO_RESEND";
      log(`[${label}] 发送未获完整确认（tail=${tailOk} stop=${stopOk}），标记 UNCERTAIN，不重发。`);
      return rec;
    }
    log(`[${label}] 发送双验通过。`);

    // 等待完成：停止按钮由有到无翻转 + 确认窗 + UUID 稳定 + Composer 空
    let everGenerating = stopOk;
    const t1 = Date.now();
    while (Date.now() - t1 < 300000) {
      const gen = await stopButtonVisible(page);
      if (gen) everGenerating = true;
      if (everGenerating && !gen) {
        log(`[${label}] 检测到生成→空闲翻转，进入确认窗 ${CONFIRM_WINDOW_MS / 1000}s。`);
        break;
      }
      await page.waitForTimeout(2000);
    }
    await page.waitForTimeout(CONFIRM_WINDOW_MS);
    const tailAfterWindow = await readTailUnit(page);
    await page.waitForTimeout(3000);
    const tailAgain = await readTailUnit(page);
    const composerEmpty = ((await composerText(page).catch(() => "x")) || "").trim() === "";
    rec.completion = {
      tail_role: tailAfterWindow?.role,
      assistant_uuid: tailAfterWindow?.assistantUuid,
      uuid_stable: !!tailAfterWindow?.assistantUuid && tailAfterWindow.assistantUuid === tailAgain?.assistantUuid,
      composer_empty: composerEmpty,
    };
    rec.completed = rec.completion.uuid_stable && composerEmpty && tailAfterWindow?.role === "assistant";
    log(`[${label}] 完成判定: ${JSON.stringify(rec.completion)} => ${rec.completed ? "COMPLETED" : "NOT_CONFIRMED"}`);

    // 提取回复：以本次 user unit 为界合并其后 assistant 文本
    const marker = text.replace(/\s+/g, "").slice(0, 18); // 去空白特征串，定位我方消息
    const ours = await readReplyAfterOwnMessage(page, marker);
    const units = ours || [];
    rec.reply_units = units.length;
    rec.reply_text = units.map((u) => u.text).join("\n").trim();
    rec.reply_head = rec.reply_text.slice(0, 300);
    await shot(page, `poc3-06-reply-${label}.png`);
    return rec;
  }

  const r1 = await sendMessage(MSG1, "msg1");
  evidence.messages.push(r1);
  writeFileSync(RUN_JSON, JSON.stringify(evidence, null, 2), "utf8");

  if (!r1.completed) {
    log("msg1 未确认完成，终止，不发送第二条。");
    writeFileSync(RUN_JSON, JSON.stringify(evidence, null, 2), "utf8");
    await browser.close().catch(() => {});
    process.exit(1);
  }

  await page.waitForTimeout(5000);
  const r2 = await sendMessage(MSG2, "msg2");
  evidence.messages.push(r2);
  evidence.finished_at = new Date().toISOString();
  writeFileSync(RUN_JSON, JSON.stringify(evidence, null, 2), "utf8");

  // 上下文连续性判定：msg2 回复应包含 msg1 要求的词"确认"
  evidence.context_continuity = (r2.reply_text || "").includes("确认");
  writeFileSync(RUN_JSON, JSON.stringify(evidence, null, 2), "utf8");
  log(`上下文连续性: ${evidence.context_continuity ? "PASS（msg2 回复包含 msg1 指定词）" : "FAIL"}`);
  log(`msg1 回复头: ${(r1.reply_text || "").slice(0, 100)}`);
  log(`msg2 回复头: ${(r2.reply_text || "").slice(0, 100)}`);

  await browser.close().catch(() => {});
  await killProfileChrome();
  const allOk = r1.completed && r2.completed && evidence.context_continuity;
  log(allOk ? "=== POC-03 run PASS ===" : "=== POC-03 run PARTIAL/FAIL（详见 JSON） ===");
  process.exit(allOk ? 0 : 1);
}

await (mode === "setup" ? setup() : run()).catch((e) => {
  log(`致命错误: ${e.message}`);
  console.error(e);
  process.exit(1);
});
