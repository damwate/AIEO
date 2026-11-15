// gpt03-review-leg S2验收补采驱动(recoll_gpt03_s2r1.mjs)：仅对已发送成功的会话重新提取回复（不发送、不重发）。
// 背景：R2 派单（brief_standard_kickoff_r2.txt，739B）发送双验通过（user_unit_key=fallback-turn-1:0:user），
//       采集 fail-closed（INBOUND_WINDOW_COMPLETENESS_UNPROVEN，物化窗口仅 turn-1 两 unit）——DEC-043 家族虚拟化，
//       按 L-018 处置序禁重发→静态 DOM 补采。归属校验型定位三件套（L-018 第 4 条）：简报标记文本唯一定位
//       "[规划复核R2|b-20261115-standard-kickoff"+最后 user 断言+前轮 R1 reply SHA 排除（e9aa9e78…）。
// 三参数核对（L-018 第 3 条）：CONV_UUID=6af9c5f3-4d00-83ec-8750-d6eef8219152+FAILED_DIR=dispatch-2026-11-15T16-25-10+SENT=fallback-turn-1:0:user /
//   SENT_USER_UNIT_KEY=发送双验报告 fallback-turn-1:0:user（定位以标记文本为准，键仅参考）/
//   FAILED_DIR=phase0/logs/dispatch-2026-11-15T12-59-40。
// 复用 inbound_dom.readDomUnits/readReplySnapshot + inbound_reply 比对/persistInboundArtifacts，不重写采集算法。
import { chromium } from "playwright";
import { existsSync, mkdirSync, writeFileSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { acquireSessionLock } from "../e2e-poc/session_lock.mjs";
import { readDomUnits, readReplySnapshot } from "./inbound_dom.mjs";
import {
  MIN_STABLE_READ_INTERVAL_MS, compareInboundSnapshots, persistInboundArtifacts,
} from "./inbound_reply.mjs";

const CDP_URL = "http://127.0.0.1:9222";
const CONV_UUID = "6af9c5f3-4d00-83ec-8750-d6eef8219152"; // 本任务专用会话
const MARKER = "【S2独立验收|b-20261115-gpt03-review-leg】";
const PREV_REPLY_SHA256 = "d2a9c58a"; // 前轮（S1-R5）reply SHA 前缀排除
const FAILED_DIR = join(process.cwd(), "phase0", "logs", "dispatch-2026-11-15T16-25-10");
const OUT_DIR = join(process.cwd(), "phase0", "logs", `recoll-${new Date().toISOString().replace(/[:.]/g, "-")}`);
const IDLE_WAIT_MS = Number(process.env.AIEO_RECOLL_IDLE_WAIT_MS || 30000);

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  writeFileSync(join(OUT_DIR, "run.log"), line + "\n", { flag: "a", encoding: "utf8" });
}

mkdirSync(OUT_DIR, { recursive: true });
const lock = acquireSessionLock({ holder: "gpt_dispatch_recoll" });
log("会话锁已获取（补采 gpt03-S2R1）");
let browser;
let cdp;
try {
  if (!existsSync(FAILED_DIR)) throw new Error(`失败现场目录不存在: ${FAILED_DIR}`);
  copyFileSync(join(FAILED_DIR, "request.txt"), join(OUT_DIR, "request.txt"));
  browser = await chromium.connectOverCDP(CDP_URL);
  const ctx = browser.contexts()[0];
  if (!ctx) throw new Error("CDP 无浏览器上下文");
  let page = ctx.pages().find((p) => p.url().includes(CONV_UUID));
  if (!page) {
    page = await ctx.newPage();
    await page.goto(`https://chatgpt.com/c/${CONV_UUID}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  }
  log(`页面就位: ${page.url()}`);
  // 不做视口覆盖（先例 recoll_dod_r2：视口覆盖曾致 units=0，改用滚动+静置物化）；失败再按 L-018 第2条升级视口拉高
  await page.waitForTimeout(8000);
  // 结构化静置门
  const t0 = Date.now();
  let ready = false;
  while (Date.now() - t0 < 60000) {
    ready = await page.evaluate(() => {
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
    if (ready.ok) break;
    await page.waitForTimeout(2000);
  }
  if (!ready.ok) {
    log(`静置门未通过(${JSON.stringify(ready)})，执行 reload 对照重试`);
    await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(15000);
    const t0b = Date.now();
    while (Date.now() - t0b < 60000) {
      ready = await page.evaluate(() => {
        const composer = !!document.querySelector('[aria-label="询问 ChatGPT"], [aria-label="Ask ChatGPT"], #prompt-textarea');
        const units = document.querySelectorAll("[data-content-search-unit-key]").length;
        return { composer, units, ok: composer && units > 0 };
      });
      if (ready.ok) break;
      await page.waitForTimeout(2000);
    }
    if (!ready.ok) throw new Error(`静置门 reload 后仍未通过: ${JSON.stringify(ready)}`);
    log(`reload 后静置门通过（units=${ready.units}）`);
  }
  log(`静置门通过（units=${ready.units}）；滚动到底+额外静置 ${IDLE_WAIT_MS}ms`);
  await page.keyboard.press("End");
  await page.waitForTimeout(5000);
  await page.mouse.wheel(0, 50000);
  await page.waitForTimeout(5000);
  await page.waitForTimeout(IDLE_WAIT_MS);

  // 归属校验型定位：列出全部物化 unit，按简报标记找本轮 user
  const units = await readDomUnits(page);
  writeFileSync(join(OUT_DIR, "units-diag.json"), JSON.stringify(units.map((u) => ({
    key: u.key, role: u.role, visible: u.visible, text_head: (u.text || "").slice(0, 80),
  })), null, 2), "utf8");
  log(`物化 unit 共 ${units.length} 个（诊断落盘 units-diag.json）`);
  const userUnits = units.filter((u) => u.role === "user");
  const marked = userUnits.filter((u) => (u.text || "").includes(MARKER));
  if (marked.length !== 1) throw new Error(`本轮标记 user 定位失败: 命中 ${marked.length} 条（需恰 1 条）`);
  const target = marked[0];
  const lastUser = userUnits[userUnits.length - 1];
  if (target.key !== lastUser.key) throw new Error(`标记 user 非最后一个 user: target=${target.key} last=${lastUser.key}`);
  log(`本轮 user 定位成功: ${target.key}（简报标记唯一且为最后一个 user；发送双验报告键=fallback-turn-1:0:user 供对照）`);

  const firstStarted = Date.now();
  const first = await readReplySnapshot(page, target.key);
  await page.waitForTimeout(MIN_STABLE_READ_INTERVAL_MS);
  const secondStarted = Date.now();
  const second = await readReplySnapshot(page, target.key);
  const stability = compareInboundSnapshots(first, second, secondStarted - firstStarted);
  const stopAfter = await page.evaluate(() => {
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
  const checks = {
    final_stop_button_not_visible: stopAfter === false,
    tail_is_assistant: first.tail?.role === "assistant" && second.tail?.role === "assistant",
    dil_uuid_present: typeof second.tail?.assistantUuid === "string" && second.tail.assistantUuid.length > 0,
    uuid_stable: first.tail?.assistantUuid === second.tail?.assistantUuid,
    stable_unit_read: stability.stable === true,
    target_range_materialized: first.range_proof?.complete === true && second.range_proof?.complete === true,
    not_prev_reply_sha: !createHash("sha256").update(second.reply, "utf8").digest("hex").startsWith(PREV_REPLY_SHA256),
  };
  log(`checks=${JSON.stringify(checks)}`);
  if (!Object.values(checks).every(Boolean)) throw new Error(`完成判定未通过: ${JSON.stringify(checks)}`);
  const extractedAt = new Date().toISOString();
  const artifacts = persistInboundArtifacts({ directory: OUT_DIR, snapshot: second, extractedAt });
  const replySha = createHash("sha256").update(second.reply, "utf8").digest("hex");
  log(`reply 已落盘: ${artifacts.reply.path}（${Buffer.byteLength(second.reply, "utf8")} 字节，SHA256=${replySha.slice(0, 16)}…）`);
  const result = {
    recollection: true, driver: "recoll_gpt03_s2r1.mjs (derived)",
    remediation: "归属校验型定位（简报标记文本唯一+最后user断言+R1 reply SHA排除），未重发任何消息",
    reference_failed_dispatch_dir: "phase0/logs/dispatch-2026-11-15T16-25-10",
    conversation_url: `https://chatgpt.com/c/${CONV_UUID}`,
    sent_user_unit_key_reported: "fallback-turn-1:0:user(发送双验报告值,定位以标记文本为准)",
    located_user_unit_key: target.key, assistant_uuid: second.assistant_uuid,
    unit_keys: second.unit_keys, unit_count: second.unit_count,
    reply_bytes: Buffer.byteLength(second.reply, "utf8"), reply_sha256: replySha,
    checks, stability, extracted_at: extractedAt,
    artifacts: { reply: artifacts.reply.path, raw_units: artifacts.rawUnits?.path ?? null },
  };
  writeFileSync(join(OUT_DIR, "result.json"), JSON.stringify(result, null, 2), "utf8");
  log("recoll COMPLETED");
  console.log(`RECOLL_DIR=${OUT_DIR}`);
} catch (e) {
  log(`recoll FAILED: ${e && e.message}`);
  console.error("RECOLL_FAILED:", e && e.message);
  process.exitCode = 1;
} finally {
  if (cdp) await cdp.send("Page.clearDeviceMetricsOverride").catch(() => {});
  if (browser) await browser.close().catch(() => {});
  lock.release();
  log("会话锁已释放（补采 gpt03-S2R1）");
}
