// v0.3生效落地复核轮补采驱动v2(recoll_node_report.mjs)：仅对已发送成功的会话重新提取回复（不发送、不重发）。
// 背景：recoll_v03act_r2.mjs 用固定键 fallback-turn-5:0:user 补采，结果 reply SHA256 与 R1 轮完全相同
//       （a9e3059b…）=采到 R1 旧回复——reload 后虚拟化物化键重排，相同键字符串指向了旧 user（L-018 第3条
//       "采到错误 reply"变体：键字符串相同但语义漂移）。本驱动即发现即弃用该结果。本任务轮：CONV_UUID 换新审查会话 6af93e42（旧会话 6af90e6f 达上限归档），首派漏换经 units-diag 当场发现即纠正（L-018 第 3 条检查单实战）。
// 本驱动修正=归属校验型定位：静态 DOM（视口拉高，同前）后用 readDomUnits 列出全部物化 unit（落盘诊断），
//   按本轮简报标记文本"[验收复核R3|b-20261115-v03-activation"精确定位本轮 user unit，并断言其为最后一个
//   user（其后无其他 user）——键可能重排，但简报文本唯一。随后 readReplySnapshot(该键)+同契约六查。
//   若提取 reply SHA256 前缀等于前轮（1cf73ed7…）则判 FAIL 防再误采。
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
const CONV_UUID = "6af93e42-91e8-83ec-943f-8e312e1b50a0";
const MARKER = "[节点汇报与判定|";
const R1_REPLY_SHA256 = "1cf73ed767f049c6"; // 前轮 reply SHA 前缀排除（R2），not_prev_reply_sha 用前缀匹配
const FAILED_DIR = join(process.cwd(), "phase0", "logs", "dispatch-2026-11-15T06-46-36");
const OUT_DIR = join(process.cwd(), "phase0", "logs", `recoll-${new Date().toISOString().replace(/[:.]/g, "-")}`);
const IDLE_WAIT_MS = Number(process.env.AIEO_RECOLL_IDLE_WAIT_MS || 30000);

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  writeFileSync(join(OUT_DIR, "run.log"), line + "\n", { flag: "a", encoding: "utf8" });
}

mkdirSync(OUT_DIR, { recursive: true });
const lock = acquireSessionLock({ holder: "gpt_dispatch_recoll" });
log("会话锁已获取（补采v2）");
let browser;
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
  const vp = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio }));
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Page.setDeviceMetricsOverride", { width: vp.w, height: 20000, deviceScaleFactor: vp.dpr || 1, mobile: false });
  log(`视口覆盖已应用（${vp.w}×20000）`);
  await page.waitForTimeout(8000);
  try {
    // 结构化静置门（同前）
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
    if (!ready.ok) throw new Error(`静置门未通过: ${JSON.stringify(ready)}`);
    log(`静置门通过（units=${ready.units}）；额外静置 ${IDLE_WAIT_MS}ms`);
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
    log(`本轮 user 定位成功: ${target.key}（简报标记唯一且为最后一个 user）`);

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
      not_prev_reply_sha: !createHash("sha256").update(second.reply, "utf8").digest("hex").startsWith(R1_REPLY_SHA256),
    };
    log(`checks=${JSON.stringify(checks)}`);
    if (!Object.values(checks).every(Boolean)) throw new Error(`完成判定未通过: ${JSON.stringify(checks)}`);
    const extractedAt = new Date().toISOString();
    const artifacts = persistInboundArtifacts({ directory: OUT_DIR, snapshot: second, extractedAt });
    const replySha = createHash("sha256").update(second.reply, "utf8").digest("hex");
    log(`reply 已落盘: ${artifacts.reply.path}（${Buffer.byteLength(second.reply, "utf8")} 字节，SHA256=${replySha.slice(0, 16)}…）`);
    const result = {
      recollection: true, driver: "recoll_node_report.mjs",
      remediation: "归属校验型定位（简报标记文本唯一+最后user断言+R1 SHA排除），未重发任何消息",
      reference_failed_dispatch_dir: "phase0/logs/phase0/logs/dispatch-2026-11-15T06-46-36",
      prior_misrecollection: { driver: "recoll_v03act_r2.mjs", got_r1_reply_sha256: R1_REPLY_SHA256, root_cause: "reload后物化键重排，同名字符串指向旧user" },
      conversation_url: `https://chatgpt.com/c/${CONV_UUID}`,
      sent_user_unit_key: target.key, assistant_uuid: second.assistant_uuid,
      unit_keys: second.unit_keys, unit_count: second.unit_count,
      reply_bytes: Buffer.byteLength(second.reply, "utf8"), reply_sha256: replySha,
      checks, stability, extracted_at: extractedAt,
      artifacts: { reply: artifacts.reply.path, raw_units: artifacts.rawUnits?.path ?? null },
    };
    writeFileSync(join(OUT_DIR, "result.json"), JSON.stringify(result, null, 2), "utf8");
    log("recoll COMPLETED");
    console.log(`RECOLL_DIR=${OUT_DIR}`);
  } finally {
    await cdp.send("Page.clearDeviceMetricsOverride").catch(() => {});
    log("视口覆盖已清除");
  }
} catch (e) {
  log(`recoll FAILED: ${e && e.message}`);
  console.error("RECOLL_FAILED:", e && e.message);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  lock.release();
  log("会话锁已释放（补采v2）");
}
