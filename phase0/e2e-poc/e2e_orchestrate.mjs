// AIEO Phase 0 - POC-05: 最小端到端开发闭环
//
// 链路（对照文档 05 §7）：
//   1. 向 GPT 测试会话发送任务规划请求（GPT-项目经理角色，要求只输出 JSON 任务）
//   2. 提取并校验结构化任务/指令
//   3. 经官方 CLI（--prompt）外部触发 ZCode 新会话执行开发
//   4. AIEO 脚本执行 Git：任务分支 + 提交 + 读取 SHA/Diff（复用 POC-04 能力）
//   5. 将 Diff 发回 GPT 测试会话审查（GPT-代码审查员角色，要求只输出 JSON 结论）
//   6. 保存审查报告与全程证据
//
// 每一步失败即停止并落盘证据，不伪造成功。浏览器侧复用 POC-03 已验证的
// CDP 接管模式与 DOM 契约（结构化状态判定、发送双验、75 秒确认窗、特征串定位提取）。

import { chromium } from "playwright";
import { spawn, execFile } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, appendFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createGenerationTracker, waitForGenerationEnd, finalizeCompletion, verifySendAcceptance } from "./completion_judge.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const AIEO_ROOT = join(__dirname, "..", "..");
const PROFILE_DIR = join(AIEO_ROOT, "runtime", "chrome_profiles", "gpt-poc");
const SHOT_DIR = join(__dirname, "..", "screenshots");
const LOG_DIR = join(__dirname, "..", "logs");
const E2E_REPO = join(AIEO_ROOT, "runtime", "e2e-repo");
const EVIDENCE_JSON = join(LOG_DIR, "e2e-evidence.json");
const E2E_LOG = join(LOG_DIR, "e2e-run.log");
const SESSION_JSON = join(LOG_DIR, "gpt-poc-session.json");

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const DEBUG_PORT = 9222;
const CDP_URL = `http://127.0.0.1:${DEBUG_PORT}`;
const CHATGPT_HOME = "https://chatgpt.com/";
const CONFIRM_WINDOW_MS = Number(process.env.AIEO_CONFIRM_WINDOW_MS || 75000);
const READY_TIMEOUT_MS = 40000;
const SEND_ACCEPT_TIMEOUT_MS = 30000;

mkdirSync(SHOT_DIR, { recursive: true });
mkdirSync(LOG_DIR, { recursive: true });

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  appendFileSync(E2E_LOG, line + "\n", "utf8");
}
async function shot(page, name) {
  await page.screenshot({ path: join(SHOT_DIR, name) }).catch(() => {});
  log(`截图: ${name}`);
}

// ---------- 浏览器（复用 POC-03 已验证模式） ----------
function killProfileChrome() {
  return new Promise((resolve) => {
    const ps = `Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.CommandLine -like '*gpt-poc*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
    execFile("powershell", ["-NoProfile", "-Command", ps], () => resolve());
  });
}
async function cdpReady() {
  try { return (await fetch(`${CDP_URL}/json/version`)).ok; } catch { return false; }
}
async function startChromeWithDebugPort() {
  if (await cdpReady()) { log("复用已运行的调试端口 9222"); return; }
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
    if (await cdpReady()) { log(`Chrome 已启动（pid=${child.pid}）`); return; }
  }
  throw new Error("Chrome 调试端口未就绪");
}
async function attachPage() {
  const browser = await chromium.connectOverCDP(CDP_URL, { timeout: 30000 });
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find((p) => p.url().includes("chatgpt.com")) || ctx.pages()[0] || (await ctx.newPage());
  return { browser, page };
}

// ---------- DOM 契约（同 POC-03） ----------
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
async function waitForReady(page, targetUrl) {
  const t0 = Date.now();
  await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  while (Date.now() - t0 < READY_TIMEOUT_MS) {
    const probe = await page.evaluate(() => {
      const units = document.querySelectorAll("[data-content-search-unit-key]").length;
      const composer = !!document.querySelector('[aria-label="询问 ChatGPT"], [aria-label="Ask ChatGPT"], #prompt-textarea');
      return { bodyLen: (document.body?.innerText || "").length, units, composer };
    });
    if (probe.units > 0 && probe.composer && probe.bodyLen > 300) return true;
    await page.waitForTimeout(1500);
  }
  return false;
}

// 发送并等待完整回复（POC-03 已验证全链）
async function sendAndCollect(page, text, label) {
  const findComposer = async () => {
    const loc = page.locator('[aria-label="询问 ChatGPT"], [aria-label="Ask ChatGPT"], #prompt-textarea').first();
    await loc.waitFor({ state: "visible", timeout: 10000 });
    return loc;
  };
  const baseline = await readTailUnit(page);
  log(`[${label}] 基线尾部: role=${baseline?.role} uuid=${baseline?.assistantUuid?.slice(0, 8)}`);
  const c = await findComposer(page);
  if (((await c.innerText()) || "").trim() !== "") throw new Error(`[${label}] Composer 非空，STOP`);
  await c.click();
  await page.evaluate((t) => document.execCommand("insertText", false, t), text);
  const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
  if (norm(await c.innerText()) !== norm(text)) throw new Error(`[${label}] 回读不一致，STOP`);
  const sendBtn = page.locator('button[aria-label="发送"], button[aria-label="Send"], button[data-testid="send-button"]').first();
  if ((await sendBtn.count()) === 0) throw new Error(`[${label}] 发送按钮不存在，STOP`);
  await c.focus();

  // pre-send 生成门（R4 修复，回应第四轮审查 MAJOR）：Enter 前停止按钮必须不可见。
  // 若可见说明上一轮生成仍在进行（或异常状态），不发送，fail-safe 终止。
  // 该不变量 + 单会话单任务纪律 = 本轮内任何停止按钮可见均可归因于本次发送。
  const preSendStopVisible = await stopButtonVisible(page);
  if (preSendStopVisible) {
    throw new Error(`[${label}] PRE_SEND_GENERATION_ACTIVE_STOP：Enter 前停止按钮可见（上一轮生成未结束），不发送`);
  }
  await page.keyboard.press("Enter");

  // 发送双验（R4）：以 pre-send 不可见基线建立可靠关联，任何 post-Enter 可见均属本轮
  const acceptance = await verifySendAcceptance({
    getTail: () => readTailUnit(page),
    isStopVisible: () => stopButtonVisible(page),
    preSendStopVisible,
    baselineKey: baseline?.key,
    deadlineMs: SEND_ACCEPT_TIMEOUT_MS,
    intervalMs: 1000,
  });
  log(`[${label}] 发送双验: accepted=${acceptance.accepted} reason=${acceptance.reason || "-"} tailOk=${acceptance.tailOk} stopOkAfterTail=${acceptance.stopOkAfterTail} stopSeenBeforeTail=${acceptance.stopSeenBeforeTail} polls=${acceptance.polls}`);
  if (!acceptance.accepted) {
    throw new Error(`[${label}] 发送双验未通过（tailOk=${acceptance.tailOk} stopOkAfterTail=${acceptance.stopOkAfterTail} reason=${acceptance.reason}），UNCERTAIN，不重发`);
  }
  await shot(page, `e2e-sent-${label}.png`);

  // 生成等待：generationObserved 初始值严格来自 tail 确认后的本轮观察（R3）。
  // waitForGenerationEnd 持续观察"可见→不可见"翻转；300 秒未结束即抛 GENERATION_TIMEOUT（exit 1）。
  const tracker = await waitForGenerationEnd(() => stopButtonVisible(page), {
    deadlineMs: 300000,
    intervalMs: 2000,
    tracker: createGenerationTracker({ initialObserved: acceptance.stopOkAfterTail }),
  });
  log(`[${label}] 生成状态跟踪: observed=${tracker.generationObserved} ended=${tracker.generationEnded}`);
  await page.waitForTimeout(CONFIRM_WINDOW_MS);

  // 最终判定（R2 修复）：确认窗后必须复查停止按钮；6 项条件全部满足才算完成
  const finalStopVisible = await stopButtonVisible(page);
  const tailAfter = await readTailUnit(page);
  await page.waitForTimeout(3000);
  const tailAgain = await readTailUnit(page);
  const composerEmpty = ((await c.innerText().catch(() => "x")) || "").trim() === "";
  const { confirmed: completionConfirmed, checks: completionChecks } = finalizeCompletion({
    tracker,
    finalStopVisible,
    tailAfter,
    tailAgain,
    composerEmpty,
  });
  log(`[${label}] 完成判定6项: ${JSON.stringify(completionChecks)}`);
  const marker = text.replace(/\s+/g, "").slice(0, 18);
  const units = (await readReplyAfterOwnMessage(page, marker)) || [];
  const reply = units.map((u) => u.text).join("\n").trim();
  log(`[${label}] COMPLETED（生成态确认结束），回复 ${reply.length} 字符`);
  await shot(page, `e2e-reply-${label}.png`);
  return { reply, assistant_uuid: tailAfter.assistantUuid, baseline, completion_confirmed: completionConfirmed, completion_checks: completionChecks, send_acceptance: { pre_send_stop_visible: preSendStopVisible, tail_ok: acceptance.tailOk, stop_ok_after_tail: acceptance.stopOkAfterTail, stop_seen_before_tail: acceptance.stopSeenBeforeTail, polls: acceptance.polls, reason: acceptance.reason || null } };
}

// ---------- 外部进程工具 ----------
function runCmd(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { encoding: "utf8", windowsHide: true, maxBuffer: 32 * 1024 * 1024, ...opts },
      (err, stdout, stderr) => (err ? reject(Object.assign(err, { stdout, stderr })) : resolve({ stdout, stderr })));
  });
}
async function git(args) {
  const { stdout } = await runCmd("git", args, { cwd: E2E_REPO });
  return stdout.trim();
}

// ---------- 主流程 ----------
const evidence = { started_at: new Date().toISOString(), steps: [] };
function step(name, data) { evidence.steps.push({ name, at: new Date().toISOString(), ...data }); }

async function main() {
  log("=== POC-05 端到端闭环开始 ===");
  if (!existsSync(SESSION_JSON)) throw new Error("缺少会话配置，请先完成 POC-03 setup");
  const { conversation_url: targetUrl } = JSON.parse(readFileSync(SESSION_JSON, "utf8"));

  // 0. 准备一次性 e2e 仓库（main 基线）
  if (existsSync(E2E_REPO)) await runCmd("powershell", ["-NoProfile", "-Command",
    `Remove-Item -Recurse -Force '${E2E_REPO}'`]);
  await runCmd("git", ["init", "-b", "main", E2E_REPO]);
  await runCmd("git", ["-C", E2E_REPO, "config", "user.name", "AIEO-E2E"]);
  await runCmd("git", ["-C", E2E_REPO, "config", "user.email", "aieo-e2e@example.local"]);
  (await import("node:fs")).writeFileSync(join(E2E_REPO, "README.md"), "# AIEO POC-05 e2e 测试仓库\n", "utf8");
  await runCmd("git", ["-C", E2E_REPO, "add", "."]);
  await runCmd("git", ["-C", E2E_REPO, "commit", "-m", "init: e2e 基线"]);
  const baseSha = await git(["rev-parse", "HEAD"]);
  step("repo_baseline", { base_sha: baseSha });
  log(`e2e 仓库基线: ${baseSha}`);

  // 1. 浏览器：GPT 项目经理规划
  await startChromeWithDebugPort();
  const { browser, page } = await attachPage();
  if (!(await waitForReady(page, targetUrl))) throw new Error("页面未就绪（登录失效或验证页）");
  log("页面就绪");

  const planAsk =
    "你现在担任 AIEO 项目经理（GPT-01）。请为下面这个需求输出开发任务指令，**只输出一个 JSON 对象，不要输出任何其他文字或代码块围栏**。" +
    '格式：{"task_id":"T-E2E-001","instruction":"给开发 Agent 的完整实现指令","acceptance":"验收标准一句话"}。' +
    "需求：在一个全新的 Node.js 目录中实现 src/e2e_add.js，导出函数 add(a,b) 返回 a+b；并创建 test_e2e_add.js，用 assert 严格断言 add(2,3)===5 且 add(-1,1)===0，node 直接运行打印 TEST PASS。";
  const plan = await sendAndCollect(page, planAsk, "plan");
  log(`GPT 规划回复（前 200 字）: ${plan.reply.slice(0, 200)}`);
  step("gpt_plan", { raw_reply_head: plan.reply.slice(0, 500), assistant_uuid: plan.assistant_uuid, completion_confirmed: plan.completion_confirmed, completion_checks: plan.completion_checks, send_acceptance: plan.send_acceptance });

  // 2. 提取 JSON（容忍 ```json 围栏）
  const m = plan.reply.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("GPT 规划回复中未找到 JSON，停止");
  let task;
  try { task = JSON.parse(m[0]); } catch (e) { throw new Error(`GPT 任务 JSON 解析失败: ${e.message}; 原文头: ${m[0].slice(0, 200)}`); }
  if (!task.task_id || !task.instruction) throw new Error(`GPT 任务 JSON 缺字段: ${Object.keys(task)}`);
  step("plan_json_valid", { task_id: task.task_id });
  log(`任务 JSON 有效: task_id=${task.task_id}`);

  // 3. 外部触发 ZCode 执行（官方 CLI，POC-02 已验证方式）
  const zcodePrompt =
    `你是 AIEO 开发 Agent。任务 ${task.task_id} 的实现指令：${task.instruction} ` +
    `硬性约束：在当前目录工作；只允许创建 src/e2e_add.js 与 test_e2e_add.js 两个文件；执行 node test_e2e_add.js 自测；` +
    `禁止执行任何 git 命令；禁止创建或修改其他文件；完成后简短总结测试输出。`;
  log("外部触发 ZCode（CLI --prompt）...");
  const zc = await runCmd("node", [
    "D:\\Program Files\\ZCode\\resources\\glm\\zcode.cjs",
    "--prompt", zcodePrompt, "--cwd", E2E_REPO, "--json",
  ], { timeout: 480000 });
  const zcOut = JSON.parse(zc.stdout);
  log(`ZCode 会话完成: ${zcOut.sessionId} 状态=${zcOut.projection?.status}`);
  log(`ZCode 返回（前 300 字）: ${(zcOut.response || "").slice(0, 300)}`);
  step("zcode_exec", { session_id: zcOut.sessionId, response_head: (zcOut.response || "").slice(0, 500) });

  // 4. Git 采集（POC-04 能力）：验收文件 → 分支 → 提交 → SHA/Diff
  const filesOk = existsSync(join(E2E_REPO, "src", "e2e_add.js")) && existsSync(join(E2E_REPO, "test_e2e_add.js"));
  if (!filesOk) throw new Error("ZCode 未产出预期文件，停止");
  const testRun = await runCmd("node", ["test_e2e_add.js"], { cwd: E2E_REPO });
  const testPass = testRun.stdout.includes("TEST PASS");
  if (!testPass) throw new Error(`开发自测未通过: ${testRun.stdout} ${testRun.stderr}`);
  await git(["checkout", "-b", "feature/AIEO-E2E-001"]);
  await git(["add", "src/e2e_add.js", "test_e2e_add.js"]);
  await git(["commit", "-m", `feat(${task.task_id}): e2e_add 实现与测试（AIEO 端到端演示）`]);
  const commitSha = await git(["rev-parse", "HEAD"]);
  const diff = await git(["diff", baseSha, commitSha]);
  const statusClean = (await git(["status", "--porcelain"])) === "";
  step("git_collect", { base_sha: baseSha, commit_sha: commitSha, clean: statusClean, diff_lines: diff.split("\n").length });
  log(`Git 提交: ${commitSha}（干净=${statusClean}，diff ${diff.split("\n").length} 行）`);

  // 5. GPT 代码审查（同一测试会话，GPT-03 角色）
  // R4 补强：按文档 03 §6，审查请求必须附带完整证据（测试执行记录 + 完整 SHA），不仅 Diff。
  const reviewAsk =
    "你现在担任 AIEO 代码审查员（GPT-03）。请审查以下 Git Diff 与随附执行证据，**只输出一个 JSON 对象，不要其他文字**。" +
    '格式：{"result":"PASS|REWORK|BLOCKED","findings":[{"severity":"MAJOR|MINOR","description":"..."}],"summary":"一句话总结"}。' +
    `审查上下文：任务 ${task.task_id}，验收标准：${task.acceptance || "实现 add 并有断言测试"}。` +
    `Git 信息：分支 feature/AIEO-E2E-001，基线 ${baseSha}，提交 ${commitSha}，工作区干净（git status --porcelain 为空）。` +
    `测试执行证据（AIEO 端独立复跑）：命令 node test_e2e_add.js，退出码 ${testRun.exitCode ?? 0}，标准输出：${testRun.stdout.trim()}。` +
    "Diff：\n```diff\n" + diff + "\n```";
  const review = await sendAndCollect(page, reviewAsk, "review");
  log(`GPT 审查回复（前 300 字）: ${review.reply.slice(0, 300)}`);
  const rm = review.reply.match(/\{[\s\S]*\}/);
  if (!rm) throw new Error("GPT 审查回复中未找到 JSON，停止");
  let verdict;
  try { verdict = JSON.parse(rm[0]); } catch (e) { throw new Error(`审查 JSON 解析失败: ${e.message}; 原文头: ${rm[0].slice(0, 200)}`); }
  step("gpt_review", { verdict, assistant_uuid: review.assistant_uuid, completion_confirmed: review.completion_confirmed, completion_checks: review.completion_checks, send_acceptance: review.send_acceptance });
  log(`审查结论: ${verdict.result} — ${verdict.summary || ""}`);

  await browser.close().catch(() => {});
  await killProfileChrome();

  // 6. 汇总：e2e_loop_pass 必须由真实验收条件计算（MAJOR-001 修复），不得硬编码
  const acceptance = {
    plan_json_valid: !!(task && task.task_id === "T-E2E-001" && typeof task.instruction === "string" && task.instruction.length > 0),
    plan_generation_confirmed: plan.completion_confirmed === true,
    zcode_files_present: filesOk === true,
    dev_test_pass: testPass === true,
    worktree_clean: statusClean === true,                       // git status --porcelain 非空 → 不通过
    review_result_strict_pass: verdict.result === "PASS",       // 严格等于 "PASS"，REWORK/BLOCKED 均不通过
    review_generation_confirmed: review.completion_confirmed === true,
  };
  acceptance.all = Object.entries(acceptance).every(([, v]) => v === true);
  evidence.finished_at = new Date().toISOString();
  evidence.acceptance = { ...acceptance };
  evidence.e2e_loop_pass = acceptance.all;                      // 计算值，非声明值
  evidence.task = task;
  evidence.git = { base_sha: baseSha, commit_sha: commitSha, branch: "feature/AIEO-E2E-001", clean: statusClean };
  evidence.review = verdict;
  writeFileSync(EVIDENCE_JSON, JSON.stringify(evidence, null, 2), "utf8");
  log(`验收条件: ${JSON.stringify(evidence.acceptance)}`);
  log(acceptance.all
    ? `=== POC-05 端到端闭环 PASS ===（证据: ${EVIDENCE_JSON}）`
    : `=== POC-05 验收未全部满足（e2e_loop_pass=false），如实落盘 ===`);
  process.exit(acceptance.all ? 0 : 1);
}

main().catch((e) => {
  evidence.error = String(e.message || e);
  evidence.e2e_loop_pass = false;
  evidence.finished_at = new Date().toISOString();
  writeFileSync(EVIDENCE_JSON, JSON.stringify(evidence, null, 2), "utf8");
  log(`致命错误: ${e.message}`);
  console.error(e);
  process.exit(1);
});
