// CTX-CODE-R8 补采驱动（由 recoll_ctx_code_r7.mjs 派生，L-018 第 3/4 条三参数+归属校验）
// 三参数核对（派生前逐项确认，禁继承母本值）：
//   CONV_UUID=6b0418af-0fcc-83ec-aff0-dad2dd269864  （planning R3；send 已确认，采集 fail-closed）
//   SENT_USER_UNIT_KEY=fallback-turn-0:0:user        （发送双验报告键；键漂移后以标记文本定位，键仅参考）
//   FAILED_DIR=D:/AIEO/phase0/logs/dispatch-2026-11-23T03-09-42 （INBOUND_START_UNIT_MISSING 现场）
//   MARKER_TEXT=2K 档位裁定（planning R3）        （本轮简报标记；归属校验唯一锚点）
//   PREV_REPLY_SHA256=（空；新会话首轮无前轮可比，not_prev_reply_sha 恒真）
//   INSTANCE_ID=default（派单与 recoll 同实例同锁路径）
// 不发送、不重发；仅对已成功送达的会话重新提取回复。
import { chromium } from "playwright";
import { existsSync, mkdirSync, writeFileSync, copyFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { acquireSessionLock } from "../e2e-poc/session_lock.mjs";
import { deriveInstancePaths } from "./dispatch_options.mjs";
import { describePages } from "./tab_hygiene.mjs";
import { readDomUnits, readReplySnapshot } from "./inbound_dom.mjs";
import {
  MIN_STABLE_READ_INTERVAL_MS, compareInboundSnapshots, persistInboundArtifacts,
} from "./inbound_reply.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const INSTANCE = deriveInstancePaths({ instanceId: "standard-queue", aieoRoot: join(__dirname, "..", "..") });
function resolveRecollCdpPort() {
  if (INSTANCE.isDefault) return INSTANCE.defaultPort;
  const regPath = INSTANCE.portRegistryPath;
  if (!existsSync(regPath)) {
    throw new Error(`INSTANCE_REGISTRY_MISSING: 实例 ${INSTANCE.instanceId} 端口未登记，recoll 拒绝猜测（fail-closed）`);
  }
  const reg = JSON.parse(readFileSync(regPath, "utf8"));
  const port = reg?.ports?.[INSTANCE.instanceId];
  if (!Number.isInteger(port) || port < INSTANCE.portCandidates.min || port > INSTANCE.portCandidates.max) {
    throw new Error(`INSTANCE_REGISTRY_INVALID: 实例 ${INSTANCE.instanceId} 端口未登记或不合法: ${port}`);
  }
  return port;
}
const CDP_URL = `http://127.0.0.1:${resolveRecollCdpPort()}`;
const CONV_UUID = "6b0418af-0fcc-83ec-aff0-dad2dd269864";
const MARKER = "[AIEO-ROUND:2b375278906e2d57246174a1]";
const PREV_REPLY_SHA256 = "7f3def1ce3571bcff2f9b2a14ddd0a1a5fe0a3d5e4114a1dd82af487bb230e90"; // 排除 R2 reply
const SENT_KEY_REPORTED = "fallback-turn-0:0:user";
const FAILED_DIR = "D:/AIEO/.worktrees/feat-standard-task-management/phase0/logs/dispatch-2026-11-23T13-58-14";
const OUT_DIR = "D:/AIEO/basic/tasks/b-20261123-standard-third-trial/acceptance/recoll-planning-r3";
const IDLE_WAIT_MS = Number(process.env.AIEO_RECOLL_IDLE_WAIT_MS || 30000);

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  writeFileSync(join(OUT_DIR, "recoll-run.log"), line + "\n", { flag: "a", encoding: "utf8" });
}

async function quiesceGate(page, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < 60000) {
    const ready = await page.evaluate(() => {
      const composer = !!document.querySelector('[aria-label="询问 ChatGPT"], [aria-label="Ask ChatGPT"], #prompt-textarea');
      const units = document.querySelectorAll("[data-content-search-unit-key]").length;
      const stopCands = document.querySelectorAll(
        'button[aria-label="停止"], button[aria-label="Stop"], button[data-testid="stop-button"], form button[aria-label*="停止"], form button[aria-label*="Stop"]');
      let stopVisible = false;
      for (const el of stopCands) {
        if (el.offsetParent !== null || el.getClientRects().length > 0) {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) { stopVisible = true; break; }
        }
      }
      return { composer, units, stopVisible, ok: composer && units > 0 && !stopVisible };
    });
    if (ready.ok) return ready;
    await page.waitForTimeout(2000);
  }
  throw new Error(`静置门未通过(${label})`);
}

async function locateTarget(page) {
  const units = await readDomUnits(page);
  writeFileSync(join(OUT_DIR, "units-diag.json"), JSON.stringify(units.map((u) => ({
    key: u.key, role: u.role, visible: u.visible, text_head: (u.text || "").slice(0, 80),
  })), null, 2), "utf8");
  const userUnits = units.filter((u) => u.role === "user");
  const marked = userUnits.filter((u) => (u.text || "").includes(MARKER));
  if (marked.length !== 1) throw new Error(`本轮标记 user 定位失败: 命中 ${marked.length} 条（需恰 1 条）`);
  const target = marked[0];
  const lastUser = userUnits[userUnits.length - 1];
  if (target.key !== lastUser.key) throw new Error(`标记 user 非最后一个 user: target=${target.key} last=${lastUser.key}`);
  return { target, units };
}

async function snapshotPair(page, targetKey) {
  const firstStarted = Date.now();
  const first = await readReplySnapshot(page, targetKey);
  await page.waitForTimeout(MIN_STABLE_READ_INTERVAL_MS);
  const secondStarted = Date.now();
  const second = await readReplySnapshot(page, targetKey);
  const stability = compareInboundSnapshots(first, second, secondStarted - firstStarted);
  const stopVisible = await page.evaluate(() => {
    const stopCands = document.querySelectorAll(
      'button[aria-label="停止"], button[aria-label="Stop"], button[data-testid="stop-button"], form button[aria-label*="停止"], form button[aria-label*="Stop"]');
    for (const el of stopCands) {
      if (el.offsetParent !== null || el.getClientRects().length > 0) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) return true;
      }
    }
    return false;
  });
  return { first, second, stability, stopVisible };
}

mkdirSync(OUT_DIR, { recursive: true });
const lock = acquireSessionLock({ holder: "recoll-ctx-code-r8-recheck2", lockPath: INSTANCE.lockPath });
log(`补采实例域: instance=${INSTANCE.instanceId} lock=${INSTANCE.lockPath} cdp=${CDP_URL}`);
log("会话锁已获取（R8 recoll；仅采集不发送）");
let browser;
let cdp;
const createdPages = [];
try {
  if (!existsSync(FAILED_DIR)) throw new Error(`失败现场目录不存在: ${FAILED_DIR}`);
  if (existsSync(join(FAILED_DIR, "request.txt"))) {
    copyFileSync(join(FAILED_DIR, "request.txt"), join(OUT_DIR, "request.txt"));
  }
  browser = await chromium.connectOverCDP(CDP_URL);
  const ctx = browser.contexts()[0];
  if (!ctx) throw new Error("CDP 无浏览器上下文");
  const existingPages = ctx.pages();
  const matchedDescs = describePages(existingPages.map((p) => ({ url: p.url() })))
    .map((d, i) => ({ d, raw: i }))
    .filter(({ d }) => d.conversationUuid === String(CONV_UUID).toLowerCase());
  let page;
  if (matchedDescs.length > 0) {
    page = existingPages[matchedDescs[matchedDescs.length - 1].raw];
    log(`[tab-hygiene] 会话页命中 ${matchedDescs.length} 个，取末位（最近创建）`);
  } else {
    page = await ctx.newPage();
    createdPages.push(page);
    await page.goto(`https://chatgpt.com/c/${CONV_UUID}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  }
  log(`页面就位: ${page.url()}`);
  await page.waitForTimeout(8000);
  let ready = await quiesceGate(page, "首次");
  log(`静置门通过（${ready.units} units）；滚动到底+额外静置 ${IDLE_WAIT_MS}ms`);
  await page.keyboard.press("End");
  await page.waitForTimeout(5000);
  await page.mouse.wheel(0, 50000);
  await page.waitForTimeout(5000);
  await page.waitForTimeout(IDLE_WAIT_MS);

  let { target } = await locateTarget(page);
  log(`本轮 user 定位成功: ${target.key}（标记唯一+最后 user；发送双验报告键=${SENT_KEY_REPORTED} 供对照）`);
  let { first, second, stability, stopVisible } = await snapshotPair(page, target.key);
  let checks = buildChecks(first, second, stability, stopVisible);
  log(`checks=${JSON.stringify(checks)}`);
  if (!Object.values(checks).every(Boolean)) {
    log("七查未全过 → 视口拉高 1920x20000 强制全量物化（L-021 第 3 条升级路径）后复测");
    cdp = await ctx.newCDPSession(page);
    await cdp.send("Emulation.setDeviceMetricsOverride",
      { width: 1920, height: 20000, deviceScaleFactor: 1, mobile: false }).catch(() => {});
    await page.waitForTimeout(15000);
    await page.mouse.wheel(0, 50000);
    await page.waitForTimeout(IDLE_WAIT_MS);
    ({ target } = await locateTarget(page));
    ({ first, second, stability, stopVisible } = await snapshotPair(page, target.key));
    checks = buildChecks(first, second, stability, stopVisible);
    log(`checks(视口升级后)=${JSON.stringify(checks)}`);
    if (!Object.values(checks).every(Boolean)) throw new Error(`完成判定未通过(升级后): ${JSON.stringify(checks)}`);
  }
  const extractedAt = new Date().toISOString();
  const artifacts = persistInboundArtifacts({ directory: OUT_DIR, snapshot: second, extractedAt });
  const replySha = createHash("sha256").update(second.reply, "utf8").digest("hex");
  log(`reply 已落盘: ${artifacts.reply.path}（${Buffer.byteLength(second.reply, "utf8")} 字节，SHA256=${replySha.slice(0, 16)}…）`);
  const result = {
    recollection: true, driver: "recoll_ctx_code_r8.mjs (derived from r7, L-018 三参数核对)",
    remediation: "归属校验型定位（标记文本唯一+最后user断言+前轮SHA排除），未重发任何消息",
    reference_failed_dispatch_dir: FAILED_DIR,
    conversation_url: `https://chatgpt.com/c/${CONV_UUID}`,
    sent_user_unit_key_reported: SENT_KEY_REPORTED,
    located_user_unit_key: target.key, assistant_uuid: second.assistant_uuid,
    unit_keys: second.unit_keys, unit_count: second.unit_count,
    reply_bytes: Buffer.byteLength(second.reply, "utf8"), reply_sha256: replySha,
    checks, stability, extracted_at: extractedAt,
    artifacts: { reply: artifacts.reply.path, raw_units: artifacts.raw_units?.path ?? null },
  };
  writeFileSync(join(OUT_DIR, "recoll-result.json"), JSON.stringify(result, null, 2), "utf8");
  log("recoll COMPLETED");
  console.log(`RECOLL_DIR=${OUT_DIR}`);
} catch (e) {
  log(`recoll FAILED: ${e && e.message}`);
  console.error("RECOLL_FAILED:", e && e.message);
  process.exitCode = 1;
} finally {
  if (cdp) await cdp.send("Emulation.clearDeviceMetricsOverride").catch(() => {});
  for (const p of createdPages) {
    await p.close().then(() => log("[tab-hygiene] 已关闭自建页"))
      .catch((ce) => log(`[tab-hygiene] 自建页关闭失败（不影响主流程结果）: ${ce && ce.message}`));
  }
  if (browser) await browser.close().catch(() => {});
  lock.release();
  log("会话锁已释放（R8 recoll）");
}

function buildChecks(first, second, stability, stopVisible) {
  return {
    final_stop_button_not_visible: stopVisible === false,
    tail_is_assistant: first.tail?.role === "assistant" && second.tail?.role === "assistant",
    dil_uuid_present: typeof second.tail?.assistantUuid === "string" && second.tail.assistantUuid.length > 0,
    uuid_stable: first.tail?.assistantUuid === second.tail?.assistantUuid,
    stable_unit_read: stability.stable === true,
    target_range_materialized: first.range_proof?.complete === true && second.range_proof?.complete === true,
    not_prev_reply_sha: PREV_REPLY_SHA256.length === 0 ||
      !createHash("sha256").update(second.reply, "utf8").digest("hex").startsWith(PREV_REPLY_SHA256),
  };
}
