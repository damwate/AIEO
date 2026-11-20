// webcachenext20261119a 下一步咨询：send 双验通过但采集 fail-closed（INBOUND_START_UNIT_MISSING）。
// 禁重发 → 视口前置拉高静态 DOM 全量物化 + 归属三件套 + 前轮 reply SHA 排除（L-018 七查）。
// 派生自 recoll_webcache_bd3fix_r2.mjs；三参数已换：CONV_UUID/ MARKER / FAILED_DIR / 头注释。
import { chromium } from "playwright";
import { readDomUnits } from "./inbound_dom.mjs";
import { acquireSessionLock } from "../e2e-poc/session_lock.mjs";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const CONV_UUID = "6aff11d3-7cc8-83ec-af09-f57f68ddf67a";
const MARKER = "webcacheload20261120";
const FAILED_DIR = "phase0/logs/dispatch-2026-11-19T17-45-28";
const PREV_REPLY_SHA256 = "53b91111e1a33bd34ecf4b14511cba2984fd9ad58d81bdf7b55fa6d971019e04";
const OUT_DIR = join(process.cwd(), "phase0", "logs",
  `recoll-webcacheload-${new Date().toISOString().replace(/[:.]/g, "-")}`);
mkdirSync(OUT_DIR, { recursive: true });
const log = (m) => {
  const line = `[${new Date().toISOString()}] ${m}`;
  console.log(line);
  writeFileSync(join(OUT_DIR, "run.log"), line + "\n", { flag: "a", encoding: "utf8" });
};
const lock = acquireSessionLock({ holder: "gpt_dispatch_recoll" });
log("会话锁已获取（webcacheload 加载优化讨论补采）");
let browser;
try {
  browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find((p) => p.url().includes(CONV_UUID));
  if (!page) throw new Error(`未找到目标会话页 ${CONV_UUID}`);
  log(`页面归属命中 CONV_UUID=${CONV_UUID}`);
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
    const marked = second.filter((u) => u.role === "user" && (u.text || "").includes(MARKER));
    // 重复发送归属（2026-11-20 实况）：两次派单均落库，标记命中=2。取最后一份为归属目标；
    // 两份之间的 assistant 单元归档为 reply#1（记录用），最后一份之后到尾部为主 reply。
    if (marked.length === 0) throw new Error("标记定位失败：命中 0 条");
    if (marked.length > 2) throw new Error(`标记命中 ${marked.length} 条，超出重复发送假设（≤2），停止`);
    const target = marked[marked.length - 1];
    const users = second.filter((u) => u.role === "user");
    if (target.key !== users[users.length - 1].key) throw new Error("最后 user 断言失败：标记 user 非最后一个 user");
    log(`归属校验=标记命中${marked.length}条(取最后)+最后user断言（target=${target.key}）`);
    const idx = second.indexOf(target);
    const after = second.slice(idx + 1);
    let reply1 = "";
    if (marked.length === 2) {
      const idx1 = second.indexOf(marked[0]);
      reply1 = second.slice(idx1 + 1, idx).map((u) => u.text || "").join("\n\n");
      log(`归档 reply#1（第一份简报的回复，${Buffer.byteLength(reply1, "utf8")} 字节）`);
      writeFileSync(join(OUT_DIR, "reply1.txt"), reply1, "utf8");
    }
    const assistants = after.filter((u) => u.role === "assistant");
    const last = second[second.length - 1];
    if (assistants.length === 0) throw new Error("标记后无 assistant unit");
    if (last.role !== "assistant") throw new Error("尾部不是 assistant unit");
    const reply = after.map((u) => u.text || "").join("\n\n");
    const sha = createHash("sha256").update(reply, "utf8").digest("hex");
    if (sha === PREV_REPLY_SHA256) throw new Error("前轮 reply SHA 排除命中：采得与上轮完全相同的 reply，归属冲突");
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
      marked_user_unique: marked.length === 1, last_user_assertion: true,
      duplicate_send_confirmed: marked.length === 2,
      adjacent_assistant_tail: true, stable_static_dom_read: stable,
      final_stop_button_not_visible: !stopVisible,
      response_length_plausible: Buffer.byteLength(reply, "utf8") > 100,
      not_prev_reply_sha: sha !== PREV_REPLY_SHA256,
    };
    log(`checks=${JSON.stringify(checks)}`);
    writeFileSync(join(OUT_DIR, "reply.txt"), reply, "utf8");
    writeFileSync(join(OUT_DIR, "result.json"), JSON.stringify({
      recollection: true, driver: "recoll_webcacheload_20261120.mjs",
      conversation_url: `https://chatgpt.com/c/${CONV_UUID}`,
      failed_dispatch_dir: FAILED_DIR, failure_code: "INBOUND_START_UNIT_MISSING",
      recovery: "视口拉高静态DOM全量物化+归属校验三件套+前轮SHA排除（禁重发，L-018 七查）",
      marked_user_unit_key: target.key, assistant_unit_key: last.key,
      assistant_unit_count: assistants.length,
      after_units: after.map((u) => ({ key: u.key, role: u.role, text_len: (u.text || "").length })),
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
  log("会话锁已释放（webcacheload 加载优化讨论补采）");
}
