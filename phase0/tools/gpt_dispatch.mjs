// AIEO Phase 0 工具：GPT 会话派单/收回复（供开发方 Agent 直接与审查会话往返）
//
// 用法：
//   node gpt_dispatch.mjs --new-session --message-file <txt>   # 新建审查会话并发送首条消息
//   node gpt_dispatch.mjs --message-file <txt>                 # 向已保存会话发送
//   node gpt_dispatch.mjs --session-result <result.json> --message-file <txt> # 使用指定派单结果绑定会话
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
// 注：完成判定辅助函数与本脚本内联；DOM 窗口采集由 inbound_dom.mjs 与真实浏览器仿真测试共享，
//     区间完整性纯函数由 inbound_reply.mjs 统一提供，避免测试复制另一套算法。

import { chromium } from "playwright";
import { spawn, execFile } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, readFileSync, appendFileSync, renameSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { basename, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { acquireSessionLock } from "../e2e-poc/session_lock.mjs";
import { describePages, pickChatGptPage, cleanupDecision } from "./tab_hygiene.mjs";
import {
  MIN_STABLE_READ_INTERVAL_MS,
  compareInboundSnapshots,
  persistInboundArtifacts,
  validateInboundJsonArtifact,
} from "./inbound_reply.mjs";
import { registerArtifactWithRetry } from "./m1_artifact_registry.mjs";
import {
  parseDispatchOptions, shouldUpdateReviewerPointer, sessionIdIsAttributable, extractSessionId,
  extractBriefMarker, assertDispatchPage, submitDispatchMessage,
  deriveInstancePaths, allocateInstancePort, assertPointerWriterAllowed, buildKillProfileScript,
  decidePortReuse, validatePortRegistry,
} from "./dispatch_options.mjs";
import { readReplySnapshot, readTailUnit } from "./inbound_dom.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const AIEO_ROOT = join(__dirname, "..", "..");
const LOG_DIR = join(__dirname, "..", "logs");
const REVIEWER_SESSION = join(LOG_DIR, "gpt-reviewer-session.json");

// ---------- 会话上下文预算（b-20261122-session-ctx-mgmt，CTX-R9 授权编码） ----------
// 核心在 agent-kit monitor/session-budget.mjs（SQLite 唯一权威账本）；本工具只做接入：
// 发送前预检门（HARD 拒发/WARN 告警/账本异常 UNCERTAIN fail-closed）+ 轮次记账。
const AGENT_KIT_DIR = process.env.AGENT_KIT_DIR || "D:/CommonProjects/agent-kit";
let sessionBudget = null;
try {
  sessionBudget = await import(pathToFileURL(join(AGENT_KIT_DIR, "monitor", "session-budget.mjs")).href);
} catch {}
function requireSessionBudget() {
  if (!sessionBudget) {
    throw new Error(`SESSION_BUDGET_CORE_MISSING: agent-kit monitor/session-budget.mjs 不可用（AGENT_KIT_DIR=${AGENT_KIT_DIR}）；fail-closed 拒绝派单，不静默降级`);
  }
  return sessionBudget;
}
const SESSION_JSON = join(LOG_DIR, "gpt-poc-session.json");

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
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

let dispatchOptions;
try {
  dispatchOptions = parseDispatchOptions(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  if (error.details !== undefined) console.error(JSON.stringify(error.details));
  process.exit(error.exitCode ?? 2);
}
// tab 生命周期卫生状态（b-20261116-tab-cleanup，P1-03/P1-05）：
// sendAttempted=发送意图已落盘、即将按 Enter（此后失败需保留现场）；
// ownedCreatedPages=本次运行自建页注册表（关闭唯一对象；不依赖 browser.close 做清理）。
let sendAttempted = false;
let ownedCreatedPages = [];
const tabAuditBeforeRef = { value: null }; // attach 前页清单（catch 路径取证用）
const {
  message,
  newSession,
  ids: optionalIds,
  schemaPath,
  m1RegistrationRequested,
  instanceId: rawInstanceId,
} = dispatchOptions;

// ── 实例域（DEC-123 PARA-R1）：default 实例逐字节=既有常量（C7 默认兼容）；
// 命名实例派生独立锁/profile，端口在 mainLocked 内经注册表分配（探测碰撞检查）。
const INSTANCE = deriveInstancePaths({ instanceId: rawInstanceId, aieoRoot: AIEO_ROOT });
const PROFILE_DIR = INSTANCE.profileDir;
let DEBUG_PORT = INSTANCE.defaultPort; // default=9222（C7）；命名实例在 mainLocked 内分配后重绑
let CDP_URL = `http://127.0.0.1:${DEBUG_PORT}`;

// 附件支持（--attach <file>，EGO-LITE 手册 §3.2 附件通道：先挂全部文件→发送键 enabled→填文本→Enter 一次发送）
const attachIdx = process.argv.indexOf("--attach");
const attachPath = attachIdx >= 0 && process.argv.length > attachIdx + 1 ? process.argv[attachIdx + 1] : null;

const msgBytes = Buffer.byteLength(message, "utf8");
if (msgBytes > MAX_MSG_BYTES) {
  console.error(`消息 ${msgBytes} 字节，超过单条上限 ${MAX_MSG_BYTES}。请缩短指令或改用 GitPointer；不自动拆分，不做网页长文本降级。`);
  process.exit(2);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
mkdirSync(LOG_DIR, { recursive: true });
let EV_DIR = join(LOG_DIR, `dispatch-${stamp}`);
try {
  mkdirSync(EV_DIR);
} catch (error) {
  if (error.code !== "EEXIST") throw error;
  EV_DIR = `${EV_DIR}-${randomUUID()}`;
  mkdirSync(EV_DIR);
}
const callerReceipt = process.env.AIEO_DISPATCH_SEND_RECEIPT;

function recordSend(state, details = {}) {
  const receipt = JSON.stringify({ state, dispatch_dir: basename(EV_DIR), ...details }, null, 2);
  for (const path of [callerReceipt, join(EV_DIR, "send-state.json")].filter(Boolean)) {
    const temp = `${path}.tmp`;
    writeFileSync(temp, receipt, { encoding: "utf8", flush: true });
    renameSync(temp, path);
  }
}

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
// DEC-123 ③加严：进程归属按完整启动参数 --user-data-dir 精确 token 匹配（大小写不敏感），
// 禁子串通配（*gpt-poc* 会误杀 gpt-poc-a2 等前缀相关实例）；归属不明进程一律不杀只计数。
function killProfileChrome() {
  return new Promise((resolve) => {
    const ps = buildKillProfileScript(PROFILE_DIR);
    execFile("powershell", ["-NoProfile", "-Command", ps], (error, stdout) => {
      const m = String(stdout || "").match(/own=(\d+) foreign=(\d+) remaining=(\d+)/);
      const counts = m ? { own: Number(m[1]), foreign: Number(m[2]), remaining: Number(m[3]) } : null;
      if (counts) log(`[instance] 清理本实例 Chrome：own=${counts.own} foreign(不动)=${counts.foreign} remaining=${counts.remaining}`);
      resolve(counts);
    });
  });
}
// 启动归属核验（C8）：端口有 CDP 端点但全机无本实例 profile 的进程 → 端口属于他者，fail-closed。
function countChromeProcessesForProfile(profileDir) {
  return new Promise((resolve) => {
    const ps = `
$c = 0
foreach ($p in (Get-CimInstance Win32_Process -Filter "Name='chrome.exe'")) {
  $m = [regex]::Match($p.CommandLine, '--user-data-dir=(?:"([^"]*)"|(\\S+))')
  if ($m.Success) {
    $dir = ($m.Groups[1].Value + $m.Groups[2].Value).Trim('"')
    if ($dir -ieq '${String(profileDir).replace(/'/g, "''")}') { $c++ }
  }
}
Write-Output "count=$c"
`.trim();
    execFile("powershell", ["-NoProfile", "-Command", ps], (error, stdout) => {
      const m = String(stdout || "").match(/count=(\d+)/);
      resolve(m ? Number(m[1]) : null);
    });
  });
}
async function cdpReady() { try { return (await fetch(`${CDP_URL}/json/version`)).ok; } catch { return false; } }
async function startChromeWithDebugPort() {
  if (await cdpReady()) {
    // P1-1 整改（DEC-123 验收 R1）：查询失败/解析失败（null）一律 fail-closed 停止，
    // 不再落入复用分支——只有明确核验到本实例进程（own>0）才允许复用。
    const ownProcs = await countChromeProcessesForProfile(PROFILE_DIR);
    const decision = decidePortReuse({ ownProcs });
    if (decision !== "REUSE") {
      throw new Error(`INSTANCE_PORT_${decision === "FOREIGN_STOP" ? "FOREIGN" : "OWNERSHIP_UNVERIFIED"}: 端口 ${DEBUG_PORT} 归属核验未通过（decision=${decision}, ownProcs=${ownProcs ?? "null"}），fail-closed 不复用`);
    }
    log(`复用本实例调试端口 ${DEBUG_PORT}（归属核验 own=${ownProcs}）`);
    return;
  }
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
    if (await cdpReady()) { log(`Chrome 已启动 pid=${child.pid} port=${DEBUG_PORT}`); return; }
  }
  throw new Error("Chrome 调试端口未就绪");
}
// tab-audit 证据（b-20261116-tab-cleanup P2-03/S4-R1 P2-01）：CDP /json 目标清单快照，
// 运行前后页身份（targetId+URL）对照+处置记录——成功/失败路径均落盘。
async function cdpTargetList() {
  try {
    const r = await fetch(`${CDP_URL}/json`);
    const tabs = await r.json();
    return tabs.filter((t) => t.type === "page").map((t) => ({ id: t.id, url: t.url }));
  } catch {
    return { error: "CDP_UNREACHABLE" };
  }
}

function writeTabAudit(extra) {
  try {
    writeFileSync(join(EV_DIR, "tab-audit.json"), JSON.stringify({ at: new Date().toISOString(), ...extra }, null, 2), "utf8");
  } catch (e) {
    log(`[tab-hygiene] tab-audit 落盘失败（不影响主流程）: ${e.message}`);
  }
}

async function attachPage() {
  const browser = await chromium.connectOverCDP(CDP_URL, { timeout: 30000 });
  const ctx = browser.contexts()[0];
  // tab 消歧落档（b-20261116-tab-cleanup）：选页语义与既有行为一致（首个 chatgpt 页
  // 或新建），仅显式化判定并登记自建页——零语义变更红线（task-brief v0.2 §0 P2-01）。
  const existing = ctx.pages();
  const descs = describePages(existing.map((p) => ({ url: p.url() })));
  const picked = pickChatGptPage(descs, {});
  const page = picked ? existing[picked.index] : await ctx.newPage();
  const createdPages = picked ? [] : [page];
  // DEC-094 归属校验：记录 attach 时既有会话 UUID；新会话派单不得捕获到这些 UUID（错页）
  const preexistingSessionIds = descs.map((d) => d.conversationUuid).filter(Boolean);
  log(`[tab-hygiene] 选页: ${picked ? `复用既有页#${picked.index}` : "新建页"}（既有 ${existing.length} 页）；自建页注册 ${createdPages.length} 页；既有会话 UUID ${preexistingSessionIds.length} 个`);
  return { browser, page, createdPages, preexistingSessionIds };
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
async function sendAndCollect(page, text, label, attachPath, target, confirmSend) {
  const findComposer = async () => {
    const loc = page.locator('[aria-label="询问 ChatGPT"], [aria-label="Ask ChatGPT"], #prompt-textarea').filter({ visible: true }).first();
    await loc.waitFor({ state: "visible", timeout: 10000 });
    return loc;
  };
  const baseline = await readTailUnit(page);
  log(`[${label}] 基线尾部: ${JSON.stringify(baseline)}`);
  const c = await findComposer(page);
  if (((await c.innerText()) || "").trim() !== "") throw new Error("Composer 非空，STOP");
  // 附件挂载（手册 §3.2：先挂全部文件→轮询发送键 enabled（上传中 disabled）→再填文本→Enter）
  if (attachPath) {
    const fileInput = page.locator('input[aria-label="附加文件"]').first();
    await fileInput.setInputFiles(attachPath);
    const fname = basename(attachPath);
    const form = c.locator("xpath=ancestor::form").first();
    const chipT0 = Date.now();
    let chipOk = false;
    while (Date.now() - chipT0 < 15000) {
      const formText = (await form.innerText().catch(() => "")) || "";
      if (formText.includes(fname)) { chipOk = true; break; }
      await page.waitForTimeout(800);
    }
    if (!chipOk) throw new Error("附件挂载未验证（form 内未见文件名 chip），STOP");
    const sendBtn = page.locator('button[data-testid="send-button"], form button[aria-label*="发送"], form button[aria-label*="Send"]').first();
    const upT0 = Date.now();
    while (Date.now() - upT0 < 60000) {
      const ready = await sendBtn.evaluate((el) => !el.disabled && el.getAttribute("aria-disabled") !== "true").catch(() => false);
      if (ready) break;
      await page.waitForTimeout(1000);
    }
    const upReady = await sendBtn.evaluate((el) => !el.disabled && el.getAttribute("aria-disabled") !== "true").catch(() => false);
    if (!upReady) throw new Error("上传未完成（发送键 60s 内仍 disabled），STOP");
    log(`[${label}] 附件已挂载并上传完成: ${fname}`);
  }
  await c.click();
  // 填充走 CDP Input.insertText（EGO-LITE 手册禁用 document.execCommand）
  await page.keyboard.insertText(text);
  const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
  // URL autolink 容错：Lexical 自动链接化会在 URL 前的冒号后补空格（2026-11-15 实测致回读不一致），
  // 归一化时折叠该伪影；其余差异仍严格拒绝
  const normUrl = (s) => norm(s).replace(/:\s+(?=https?:\/\/)/g, ":");
  if (normUrl(await c.innerText()) !== normUrl(text)) throw new Error("回读不一致，STOP");
  await c.focus();
  // P1-01（S4-R1 整改）：发送旗标紧贴实际发送动作（Enter）——入口处置位会把基线读取/
  // composer 检查/附件上传等发送前失败误判为"已发送"而跳过自建页清理。此前的失败
  // =发送前失败（无发送证据），catch 按 close_created_pages 分叉；Enter 后=UNCERTAIN 保留现场。
  await submitDispatchMessage(page, target, () => {
    recordSend("SEND_ATTEMPTED", { target_session_id: extractSessionId(page.url()) });
    sendAttempted = true;
  });

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
  await confirmSend(sentUserUnitKey);
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
  // DEC-094 #3：简报标记作为键漂移时的唯一定位锚点（无标记则沿用固定 key，不降负例强度）
  const startMarker = extractBriefMarker(text);
  const firstReadStartedMs = Date.now();
  const firstSnapshot = await readReplySnapshot(page, sentUserUnitKey, { startMarker });
  await page.waitForTimeout(STABLE_READ_INTERVAL_MS);
  const secondReadStartedMs = Date.now();
  const secondSnapshot = await readReplySnapshot(page, sentUserUnitKey, { startMarker });
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
    sentUserUnitKey,
  };
}

// ---------- 实例端口注册表（DEC-123 ③：实例身份/锁/端口/profile 可核验映射） ----------
function readPortRegistry() {
  const path = INSTANCE.portRegistryPath;
  if (!existsSync(path)) return { version: 1, ports: {} };
  let registry;
  try {
    registry = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`INSTANCE_REGISTRY_INVALID: 实例端口注册表读取失败，拒绝按空注册表继续: ${error.message}`);
  }
  if (registry?.version !== 1 || typeof registry?.ports !== "object" || registry?.ports === null || Array.isArray(registry.ports)) {
    throw new Error("INSTANCE_REGISTRY_INVALID: 实例端口注册表结构无效（ports 必须为映射对象，禁数组）");
  }
  // P1-2 整改（DEC-123 验收 R1）：锁只防并发分配竞态，不证明已有内容合法——
  // 逐项校验 ID/端口类型/候选域/跨实例唯一/default 占用，任一违反即拒。
  try {
    validatePortRegistry(registry.ports, { candidates: INSTANCE.portCandidates, defaultPort: INSTANCE.defaultPort });
  } catch (error) {
    throw new Error(`INSTANCE_REGISTRY_INVALID: ${error.message}`);
  }
  return registry;
}

function writePortRegistryAtomic(registry) {
  const path = INSTANCE.portRegistryPath;
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.${Date.now()}.tmp`;
  try {
    writeFileSync(temp, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
    renameSync(temp, path);
  } catch (error) {
    try { renameSync(temp, `${temp}.orphan`); } catch {}
    throw new Error(`INSTANCE_REGISTRY_WRITE_FAILED: 实例端口注册表原子写入失败: ${error.message}`);
  }
}

// 命名实例端口分配：注册表锁内 读→探测→分配→写（防双实例同刻分配同端口）。
async function resolveInstancePort() {
  if (INSTANCE.isDefault) return INSTANCE.defaultPort;
  const regLock = acquireSessionLock({
    holder: `instance-port-alloc:${INSTANCE.instanceId}`,
    lockPath: `${INSTANCE.portRegistryPath}.lockfile`,
  });
  try {
    const registry = readPortRegistry();
    const candidates = [];
    for (let port = INSTANCE.portCandidates.min; port <= INSTANCE.portCandidates.max; port += 1) {
      candidates.push(port);
    }
    const busy = new Set(
      await Promise.all(candidates.map(async (port) => {
        try {
          const r = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1200) });
          return r.ok ? port : null;
        } catch { return null; }
      })).then((results) => results.filter((port) => port !== null)),
    );
    const { port } = allocateInstancePort({
      instanceId: INSTANCE.instanceId,
      registry: registry.ports,
      isPortBusy: (p) => busy.has(p),
      candidates: INSTANCE.portCandidates,
    });
    if (port !== registry.ports[INSTANCE.instanceId]) {
      writePortRegistryAtomic({ version: 1, ports: { ...registry.ports, [INSTANCE.instanceId]: port } });
      log(`[instance] 端口分配: instance=${INSTANCE.instanceId} port=${port}（注册表已原子落盘，探测占用=${busy.size}）`);
    } else {
      log(`[instance] 端口沿用注册表登记: instance=${INSTANCE.instanceId} port=${port}`);
    }
    return port;
  } finally {
    regLock.release();
  }
}

// ---------- 主流程 ----------
async function main() {
  log(`证据目录: ${EV_DIR}`);
  recordSend("NOT_SENT");
  // R5+DEC-123：实例域锁——default 用既有全局锁文件（C7 逐字节不变）；命名实例独立锁文件。
  const lock = acquireSessionLock({ holder: `gpt_dispatch:${INSTANCE.instanceId}`, lockPath: INSTANCE.lockPath });
  log(`会话锁已获取 pid=${process.pid} instance=${INSTANCE.instanceId} lock=${basename(INSTANCE.lockPath)}`);
  try {
    await mainLocked();
  } finally {
    lock.release();
    log("会话锁已释放");
  }
}

async function mainLocked() {
  log(`=== GPT 派单（${newSession ? "新建会话" : "已有会话"}，消息 ${msgBytes} 字节）===`);
  writeFileSync(join(EV_DIR, "request.txt"), dispatchOptions.requestText, "utf8");
  // 共享 reviewer 指针单写者守卫（DEC-123）：非 default 实例必须绑定会话或显式不写指针。
  assertPointerWriterAllowed({ instanceId: INSTANCE.instanceId, options: dispatchOptions });


  DEBUG_PORT = await resolveInstancePort();
  CDP_URL = `http://127.0.0.1:${DEBUG_PORT}`;
  log(`[instance] 实例域就绪: instance=${INSTANCE.instanceId} port=${DEBUG_PORT} profile=${basename(PROFILE_DIR)} lock=${basename(INSTANCE.lockPath)}`);

  await startChromeWithDebugPort();
  const tabAuditBefore = await cdpTargetList();
  tabAuditBeforeRef.value = tabAuditBefore;
  const { browser, page, createdPages, preexistingSessionIds } = await attachPage();
  ownedCreatedPages = createdPages;
  let targetSessionId = null; // 既有会话派单的目标 UUID（归属校验用）；新会话为 null
  log(`[tab-hygiene] attach 前页清单 ${Array.isArray(tabAuditBefore) ? tabAuditBefore.length + " 页" : "不可达"}`);

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
    const sessionFile = dispatchOptions.sessionResult ?? (existsSync(REVIEWER_SESSION) ? REVIEWER_SESSION : SESSION_JSON);
    const { conversation_url: targetUrl, session_id: recordedSessionId } = JSON.parse(readFileSync(sessionFile, "utf8"));
    targetSessionId = extractSessionId(targetUrl);
    if (!targetSessionId || ((dispatchOptions.sessionResult || recordedSessionId !== undefined)
        && recordedSessionId !== targetSessionId)) {
      throw new Error("SESSION_TARGET_INVALID: 会话 URL 与归档身份无效，发送前停止");
    }
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

  const target = { newSession, targetSessionId };
  await assertDispatchPage(page, target);
  await stopIfContextLimit(page);

  // 会话上下文预算预检门（两条独立防线之一：字节预算=预测；stopIfContextLimit=已发生）
  const budgetUuid = targetSessionId ?? extractSessionId(targetUrl);
  if (budgetUuid) {
    const sb = requireSessionBudget();
    let verdict;
    try {
      verdict = sb.assessLedger(budgetUuid);
    } catch (e) {
      throw new Error(`SESSION_BUDGET_UNCERTAIN: ${e.message}（账本异常不得自动放行，fail-closed）`);
    }
    if (verdict.state === "HARD" && !dispatchOptions.allowNearLimit) {
      throw new Error(`SESSION_BUDGET_EXCEEDED: 会话 ${budgetUuid} 累计 ${verdict.totals.totalBytes}B ≥ HARD ${verdict.thresholds.hardBytes}B；请改用 --new-session 自包含简报迁移（紧急通道 --allow-near-limit 显式留痕）`);
    }
    if (verdict.state !== "NORMAL") {
      log(`[ctx-budget] ${verdict.state}: 累计 ${verdict.totals.totalBytes}B（WARN≥${verdict.thresholds.warnBytes}/HARD≥${verdict.thresholds.hardBytes}）${dispatchOptions.allowNearLimit ? "（--allow-near-limit 显式放行）" : ""}`);
    }
  }

  let confirmedSessionId = null;
  const confirmSend = async (userUnitKey) => {
    const isAttributable = (url) => sessionIdIsAttributable({
      newSession, sessionId: extractSessionId(url), targetSessionId, preexistingSessionIds,
    });
    confirmedSessionId = isAttributable(page.url()) ? extractSessionId(page.url()) : null;
    recordSend("SEND_CONFIRMED", {
      session_id: confirmedSessionId,
      user_unit_key: userUnitKey,
    });
    // ctx-mgmt 记账：发送确认即记 in_bytes（此后采集失败也已在账；失败仅告警不毁证据）
    if (confirmedSessionId) {
      try {
        requireSessionBudget().recordTurn(confirmedSessionId, { inBytes: Buffer.byteLength(message, "utf8"), outBytes: 0 });
        log(`[ctx-budget] turn+in_bytes=${Buffer.byteLength(message, "utf8")}B → ${confirmedSessionId}`);
      } catch (e) {
        log(`[ctx-budget] WARN: 记账失败（不影响本次派单证据，下次预检按 UNCERTAIN fail-closed）: ${e.message}`);
      }
    }
    if (newSession && !confirmedSessionId) {
      await page.waitForURL(isAttributable, { timeout: 5000 }).catch(() => {});
      if (isAttributable(page.url())) {
        confirmedSessionId = extractSessionId(page.url());
        recordSend("SEND_CONFIRMED", { session_id: confirmedSessionId, user_unit_key: userUnitKey });
      }
    }
  };
  const { snapshot, assistant_uuid, checks, stability, sentUserUnitKey } = await sendAndCollect(
    page, message, "dispatch", attachPath, target, confirmSend,
  );
  // ctx-mgmt 记账：采集 COMPLETED 记 out_bytes（reply 字节数）
  {
    const collectUuid = confirmedSessionId ?? extractSessionId(page.url());
    if (collectUuid) {
      try {
        requireSessionBudget().recordTurn(collectUuid, { inBytes: 0, outBytes: Buffer.byteLength(snapshot.reply, "utf8") });
        log(`[ctx-budget] turn+out_bytes=${Buffer.byteLength(snapshot.reply, "utf8")}B → ${collectUuid}`);
      } catch (e) {
        log(`[ctx-budget] WARN: 记账失败（不影响本次派单证据，下次预检按 UNCERTAIN fail-closed）: ${e.message}`);
      }
    }
  }

  // 保存当前真实会话 URL（local-chatgpt 草稿态跳过；上限已在发送前安全停止）
  let conversationUrl = null;
  let sessionId = null;
  let pointerAttribution = "NOT_EVALUATED";
  for (let i = 0; i < 10; i++) {
    const sid = extractSessionId(page.url());
    if (sid) {
      sessionId = sid;
      conversationUrl = `https://chatgpt.com/c/${sessionId}`;
      // DEC-094 规划复审归属校验：确认捕获页确属本次会话（新会话≠既有 UUID；既有会话须=目标 UUID）。
      // 校验失败 fail-closed：不写 reviewer 指针、不写成功结果（下方抛错）。
      const attributable = (!confirmedSessionId || sessionId === confirmedSessionId) && sessionIdIsAttributable({
        newSession, sessionId, targetSessionId, preexistingSessionIds,
      });
      pointerAttribution = attributable ? "PASS" : "FAIL";
      if (!attributable) {
        log(`[归属校验] FAIL — 捕获会话 ${sessionId} 不属本次派单（target=${targetSessionId}, 既有=${JSON.stringify(preexistingSessionIds)}）；fail-closed 拒写指针`);
        break;
      }
      recordSend("SEND_CONFIRMED", { session_id: sessionId, user_unit_key: sentUserUnitKey });
      if (!shouldUpdateReviewerPointer(dispatchOptions)) {
        // DEC-094 #4：任务腿/一次性派单显式要求不覆盖 reviewer 指针（实战两次误覆盖
        // 致简报错发实战会话）。仍解析本会话 URL 供 result.json 绑定，仅跳过指针写盘。
        log(`会话 URL 已取得且归属校验 PASS，跳过 reviewer 指针写盘: ${conversationUrl}`);
      } else {
        const session = { conversation_url: conversationUrl, captured_at: new Date().toISOString(), role: "reviewer" };
        writeFileSync(REVIEWER_SESSION, JSON.stringify(session, null, 2), "utf8");
        log(`审查会话已保存（归属校验 PASS）: ${session.conversation_url}`);
      }
      break;
    }
    await page.waitForTimeout(1000);
  }
  if (!conversationUrl || !sessionId) throw new Error("SESSION_URL_UNAVAILABLE: 未取得真实会话 URL，拒绝写成功结果");
  if (pointerAttribution === "FAIL") {
    throw new Error("SESSION_ATTRIBUTION_FAIL: 捕获会话页不属本次派单，fail-closed 拒绝写指针与成功结果");
  }

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
  if (m1RegistrationRequested) {
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
      reason: "三 ID 均未提供且未显式请求 M1；本次为通用非登记派单",
      adapter_scope: "MINIMAL_LOCAL_M1_NOT_FULL_PLATFORM",
    };
    log("M1 本地登记: NOT_REQUESTED（三 ID 均未提供，通用非登记派单）");
  }

  const result = {
    at: extractedAt,
    instance_id: INSTANCE.instanceId,
    instance_lock_path: INSTANCE.lockPath,
    instance_debug_port: DEBUG_PORT,
    instance_profile_dir: PROFILE_DIR,
    message_bytes: msgBytes,
    reply: snapshot.reply,
    user_unit_key: snapshot.user_unit_key,
    start_key_resolved: snapshot.start_key_resolved,
    start_resolved_by_marker: snapshot.start_resolved_by_marker,
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
  const tabAuditExitBefore = await cdpTargetList();
  await browser.close().catch(() => {});
  await killProfileChrome();
  // S4-R2 P2-01：处置后快照——profile Chrome 已杀，CDP 不可达即"处置后状态"的机器证明（如实记录采集失败）
  const tabAuditExitAfter = await cdpTargetList();
  writeTabAudit({ outcome: "success", before: tabAuditBefore, exit_before_disposal: tabAuditExitBefore,
                  exit_after_disposal: tabAuditExitAfter,
                  created_pages: ownedCreatedPages.length,
                  disposal: `browser.close+killProfileChrome（实例 ${INSTANCE.instanceId} profile 精确归属清理=既有成功语义的实例域版，含既有页与自建页）；exit_after_disposal CDP_UNREACHABLE=tab 清零证明` });
  log(`[tab-hygiene] 成功退出：浏览器连接已关+实例 ${INSTANCE.instanceId} Chrome 已清理（精确归属，他实例不动；含本次自建页 ${ownedCreatedPages.length} 页）；本实例 tab 清零`);
  log(`=== 派单完成，artifact_sha256=${result.artifact_sha256} size_bytes=${result.size_bytes} ===`);
  console.log("\n=====REPLY_BEGIN=====");
  console.log(snapshot.reply);
  console.log("=====REPLY_END=====");
}

main().catch(async (e) => {
  const details = e.details === undefined ? "" : ` details=${JSON.stringify(e.details)}`;
  log(`致命错误: ${e.message}${details}`);
  // S4-R4 P1-01：清理决策统一走 tab_hygiene.cleanupDecision（被测纯函数=实际决策路径）
  const cleanup = cleanupDecision({ sendAttempted });
  if (cleanup === "preserve_scene") {
    // P1-03：发送已发生——UNCERTAIN/生成中/采集失败现场必须保留（禁重发语义依赖现场），禁关页。
    writeTabAudit({ outcome: "failure_scene_preserved", before: tabAuditBeforeRef.value,
                    exit_after_disposal: "not_applicable（现场保留，无处置动作）",
                    created_pages: ownedCreatedPages.length,
                    disposal: "已发送后失败：现场保留不关页（L-018 禁重发语义依赖现场），退出后人工/补采链处置",
                    error: e.message });
    log("[tab-hygiene] 发送已发生：保留现场不关页（禁重发语义依赖现场）；退出后由人工/补采链按 L-018 处置");
  } else {
    // P1-03/P1-01：发送前失败（Enter 前任何步骤）——仅关闭本次自建页（显式 page.close，逐页容错但不吞主错误）。
    const exitBefore = await cdpTargetList();
    for (const p of ownedCreatedPages) {
      await p.close().then(() => log("[tab-hygiene] 已关闭自建页（发送前失败清理）"))
        .catch((ce) => log(`[tab-hygiene] 自建页关闭失败（不影响主错误上报）: ${ce.message}`));
    }
    // S4-R2 P2-01：处置后快照——证明实际关闭结果与既有页保留情况
    const exitAfter = await cdpTargetList();
    writeTabAudit({ outcome: "failure_created_pages_closed", before: tabAuditBeforeRef.value,
                    exit_before_disposal: exitBefore, exit_after_disposal: exitAfter,
                    created_pages: ownedCreatedPages.length,
                    disposal: "发送前失败：仅关闭本次自建页；既有页零触碰（exit_before/exit_after 对照=值守页零关闭证明）",
                    error: e.message });
  }
  console.error(e);
  process.exit(1);
});
