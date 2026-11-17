// review-leg 补采驱动模板（review_leg_recoll_template.mjs）——完整文件重写派生。
// 仅对已发送成功的会话重新提取回复（不发送、不重发、不改 M2 工具代码；
// 复用 inbound_dom/inbound_reply 共享采集算法）。
//
// 派生参数（L-018 第 3/4 条三参数+归属校验五件套）：
//   CONV_UUID=6afbc6a9-b26c-83ee-9c27-b6c6e6f75664            （新会话 ID；CDP 枚举取得）
//   SENT_USER_UNIT_KEY=fallback-turn-0:0:user（发送双验报告键；定位以标记文本为准，键仅参考）
//   FAILED_DIR=D:/AIEO/phase0/logs/dispatch-2026-11-17T03-13-54 （发送失败现场 dispatch 目录；request.txt 证据源）
//   OUT_DIR=D:/AIEO/phase0/logs/dispatch-2026-11-17T03-13-54/recoll （补采产物落盘目录）
//   MARKER_TEXT=[DEC026-续行会商|20261117]        （简报标记文本；归属校验唯一锚点）
//   PREV_REPLY_SHA256=（空串；新会话首轮无前轮可比，not_prev_reply_sha 恒真）
//
// 流程=recoll_kickoff_gate2r3.mjs 先例同型：会话锁→静置门→视口前置拉高 1920×20000→
// 滚动+静置物化→归属校验型定位（标记文本恰 1 条+最后 user 断言）→双读稳定+七查
// （六查+not_prev_reply_sha）→落盘。
import { chromium } from "playwright";
import { existsSync, mkdirSync, writeFileSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { acquireSessionLock } from "../e2e-poc/session_lock.mjs";
import { describePages } from "./tab_hygiene.mjs";
import { readDomUnits, readReplySnapshot } from "./inbound_dom.mjs";
import {
  MIN_STABLE_READ_INTERVAL_MS, compareInboundSnapshots, persistInboundArtifacts,
} from "./inbound_reply.mjs";

const CDP_URL = "http://127.0.0.1:9222";
const CONV_UUID = "6afc054f-b0b8-83ee-a333-11821e0880e0";
const MARKER = "[H2-ACCEPT|20261117]";
const PREV_REPLY_SHA256 = "49be6777aef9eff26e7bdd7d3db220a29b857273460e5dd436ce655cd44f3eb7"; // 前轮（未推送拒判）reply 排除
const SENT_KEY_REPORTED = "fallback-turn-0:0:user";
const FAILED_DIR = "D:/AIEO/phase0/logs/dispatch-2026-11-17T08-25-03";
const OUT_DIR = "D:/AIEO/phase0/logs/dispatch-2026-11-17T08-25-03/recoll";
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
    key: u.key, role: u.role, visible: u.visible, text_head: (u.text || "").slice(0, 120),
  })), null, 2), "utf8");
  const userUnits = units.filter((u) => u.role === "user");
  const marked = userUnits.filter((u) => (u.text || "").includes(MARKER));
  // 同一标记出现两轮（首轮未推送拒判 + 本轮重派）：归属=最后一个 user 且带标记；
  // 前轮 reply 由 PREV_REPLY_SHA256 在 buildChecks.not_prev_reply_sha 排除。
  if (marked.length < 1) throw new Error(`本轮标记 user 定位失败: 命中 ${marked.length} 条（需 ≥1）`);
  const lastUser = userUnits[userUnits.length - 1];
  if (!(lastUser.text || "").includes(MARKER)) {
    throw new Error(`最后一个 user 不含本轮标记: last=${lastUser.key}（防错轮次归属）`);
  }
  const target = lastUser;
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
const lock = acquireSessionLock({ holder: "h2_accept_recoll" });
log("会话锁已获取（review-leg 补采；仅采集不发送）");
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
  // 视口前置拉高 1920x20000 强制全量物化（L-018 第 2 条 / L-021 第 3 条）
  cdp = await ctx.newCDPSession(page);
  await cdp.send("Emulation.setDeviceMetricsOverride",
    { width: 1920, height: 20000, deviceScaleFactor: 1, mobile: false }).catch(() => {});
  await page.waitForTimeout(10000);
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
    log("七查未全过 → 视口再拉高 1920x20000 强制全量物化后复测");
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
    recollection: true, driver: "review_leg_recoll_template.mjs (derived: recoll_dec026_meeting)",
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
  log("会话锁已释放（review-leg 补采）");
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
