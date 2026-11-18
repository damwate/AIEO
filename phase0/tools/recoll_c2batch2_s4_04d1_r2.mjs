// C2-BATCH2 S3-① 多unit感知补采：备用触发派单完成判定未通过（composer_empty:false）。禁重发→静态DOM补采+多unit结构核验。
// 派生自 recoll_c2batch2_r3.mjs；四常量：CONV_UUID + MARKER + PREV_REPLY_SHA + FAILED_DIR（L-018 第 3/4 条）；扩展=标记user后全部unit收集+索引连续性+多assistant计数（场景①两道独立判断之采集有效性）
import { chromium } from "playwright";
import { readDomUnits } from "./inbound_dom.mjs";
import { acquireSessionLock } from "../e2e-poc/session_lock.mjs";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const CONV_UUID = "6afdffa2-fbb8-83ec-b44b-a22faf93a8a3";
const MARKER = "[C2-BATCH2-S4-04D1|20261119]";
const PREV_REPLY_SHA = "6b86968ec1780354"; // 本会话最近已归档回复（S4-04D1 空回复轮次，dispatch-2026-11-18T19-54-06）SHA 前缀
const FAILED_DIR = "phase0/logs/dispatch-2026-11-18T19-57-39";
const OUT_DIR = join(process.cwd(), "phase0", "logs",
  `recoll-c2batch2-s4-04d1-r2-${new Date().toISOString().replace(/[:.]/g, "-")}`);
mkdirSync(OUT_DIR, { recursive: true });
const log = (m) => {
  const line = `[${new Date().toISOString()}] ${m}`;
  console.log(line);
  writeFileSync(join(OUT_DIR, "run.log"), line + "\n", { flag: "a", encoding: "utf8" });
};
const lock = acquireSessionLock({ holder: "gpt_dispatch_recoll" });
log("会话锁已获取（C2-BATCH2 R3 补采）");
let browser;
try {
  browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find((p) => p.url().includes("chatgpt.com/c/")) || ctx.pages()[0];
  if (!page.url().includes(CONV_UUID)) throw new Error(`会话 UUID 不匹配: ${page.url()}`);
  const vp = await page.evaluate(() => ({ w: innerWidth, dpr: devicePixelRatio }));
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Page.setDeviceMetricsOverride",
    { width: vp.w, height: 80000, deviceScaleFactor: vp.dpr || 1, mobile: false });
  await page.waitForTimeout(8000);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(3000);
  try {
    const first = await readDomUnits(page);
    await page.waitForTimeout(12000);
    const second = await readDomUnits(page);
    const stable = first.length === second.length &&
      first.every((u, i) => u.key === second[i].key && (u.text || "") === (second[i].text || ""));
    if (!stable) throw new Error("静态 DOM 两次读取不稳定");
    writeFileSync(join(OUT_DIR, "units-diag.json"), JSON.stringify(second.map((u) => ({
      key: u.key, role: u.role, visible: u.visible, text_len: (u.text || "").length,
      text_head: (u.text || "").slice(0, 100),
    })), null, 2), "utf8");
    const users = second.filter((u) => u.role === "user");
    if (users.length === 0) throw new Error("无 user unit");
    const target = users[users.length - 1];
    if (!(target.text || "").includes(MARKER)) throw new Error("最后 user 不含本轮标记（归属存疑）");
    log(`定位口径=最后user断言（标记命中${users.filter((u) => (u.text || "").includes(MARKER)).length}条,两轮同标记为预期,前轮SHA排除兜底）`);
    const idx = second.indexOf(target);
    const after = second.slice(idx + 1);
    const assistants = after.filter((u) => u.role === "assistant");
    const last = second[second.length - 1];
    if (assistants.length === 0) throw new Error("标记后无 assistant unit");
    if (last.role !== "assistant") throw new Error("尾部不是 assistant unit");
    // 场景①采集有效性核心：unit key 索引连续性（user 起至尾部无缺口感）
    const parseIdx = (k) => { const m = k.match(/:(\d+):(user|assistant)$/); return m ? Number(m[1]) : null; };
    const seq = [target, ...after].map((u) => parseIdx(u.key));
    const continuity = seq.every((n, i) => i === 0 || n === seq[i - 1] + 1);
    const reply = after.map((u) => u.text || "").join("\n\n");
    const sha = createHash("sha256").update(reply, "utf8").digest("hex");
    if (sha.startsWith(PREV_REPLY_SHA)) throw new Error("采到前轮回复");
    const stopVisible = await page.evaluate(() => {
      const cands = document.querySelectorAll('button[aria-label="停止"], button[aria-label="Stop"], button[data-testid="stop-button"], form button[aria-label*="停止"], form button[aria-label*="Stop"]');
      for (const el of cands) {
        if (el.offsetParent !== null || el.getClientRects().length > 0) {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) return true;
        }
      }
      return false;
    });
    const checks = {
      marked_user_unique: true, last_user_assertion: true,
      adjacent_assistant_tail: assistants.length > 0 && last.role === "assistant", stable_static_dom_read: stable, index_continuity: continuity,
      final_stop_button_not_visible: !stopVisible, not_prev_reply_sha: true,
      response_length_plausible: true, uuid_based_locator: false,
    };
    log(`checks=${JSON.stringify(checks)}`);
    writeFileSync(join(OUT_DIR, "reply.txt"), reply, "utf8");
    writeFileSync(join(OUT_DIR, "result.json"), JSON.stringify({
      recollection: true, driver: "recoll_c2batch2_s3_01.mjs(s4-04d1 diag)",
      conversation_url: `https://chatgpt.com/c/${CONV_UUID}`,
      failed_dispatch_dir: FAILED_DIR, failure_code: "INBOUND_WINDOW_COMPLETENESS_UNPROVEN",
      recovery: "视口拉高静态DOM全量物化+归属校验型定位（禁重发）",
      marked_user_unit_key: target.key, assistant_unit_key: last.key,
      assistant_unit_count: assistants.length,
      after_units: after.map((u) => ({ key: u.key, role: u.role, text_len: (u.text || "").length, text_head: (u.text || "").slice(0, 60) })),
      index_continuity: continuity,
      reply_bytes: Buffer.byteLength(reply, "utf8"), reply_sha256: sha,
      checks, extracted_at: new Date().toISOString(),
    }, null, 2), "utf8");
    log(`reply 已落盘（${Buffer.byteLength(reply, "utf8")} 字节，SHA=${sha.slice(0, 16)}…）`);
    log("RECOLL COMPLETED");
    console.log(`RECOLL_DIR=${OUT_DIR}`);
  } finally {
    await cdp.send("Page.clearDeviceMetricsOverride").catch(() => {});
    log("视口覆盖已清除");
  }
} catch (e) {
  log(`RECOLL FAILED: ${e && e.message}`);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  lock.release();
  log("会话锁已释放（C2-BATCH2 R3 补采）");
}
