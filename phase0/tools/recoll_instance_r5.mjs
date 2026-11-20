// trial-plan-r1 下一步咨询补采：send 双验通过（SEND_CONFIRMED 回执留证）但采集 fail-closed
// （INBOUND_WINDOW_COMPLETENESS_UNPROVEN，L-018 第 2 条：会话变长后滚动物化失效）。
// 禁重发 → 视口前置拉高静态 DOM 全量物化 + 归属校验三件套（marker 唯一+最后 user 断言+前轮 reply SHA 排除）。
// 派生自 recoll_webcacheload_20261120.mjs；三参数已换：CONV_UUID / MARKER / FAILED_DIR / 头注释 / failure_code。
// 回执交叉对照：send-state.json SEND_CONFIRMED session_id=6aff4117-… user_unit_key=fallback-turn-0:0:user。
import { chromium } from "playwright";
import { readDomUnits } from "./inbound_dom.mjs";
import { acquireSessionLock } from "../e2e-poc/session_lock.mjs";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const CONV_UUID = "6b009b70-1458-83ec-adf8-d4d5e52f0fca";
const MARKER = "INSTANCE-R5";
const FAILED_DIR = "phase0/logs/dispatch-2026-11-20T19-43-30";
const PREV_REPLY_SHA256 = "8b9f6922623d5a978634b755e04eb8a49f0a3a97d486db33568117dcab67b996";
const OUT_DIR = join(process.cwd(), "phase0", "logs",
  `recoll-instance-r5-${new Date().toISOString().replace(/[:.]/g, "-")}`);
mkdirSync(OUT_DIR, { recursive: true });
const log = (m) => {
  const line = `[${new Date().toISOString()}] ${m}`;
  console.log(line);
  writeFileSync(join(OUT_DIR, "run.log"), line + "\n", { flag: "a", encoding: "utf8" });
};
const lock = acquireSessionLock({ holder: "gpt_dispatch_recoll" });
log("会话锁已获取（instance-r5 阶段1终签补采）");
let browser;
let cdp;
try {
  browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find((p) => p.url().includes(CONV_UUID));
  if (!page) throw new Error(`未找到目标会话页 ${CONV_UUID}`);
  log(`页面归属命中 CONV_UUID=${CONV_UUID}`);
  // 前置生成态探测：仍在生成则干净退出（exit 3），不进入物化读取，待回复完成后重试本驱动。
  const generating = await page.evaluate(() => {
    const cands = document.querySelectorAll('button[aria-label="停止"], button[aria-label="Stop"], button[data-testid="stop-button"], form button[aria-label*="停止"], form button[aria-label*="Stop"]');
    for (const el of cands) {
      if (el.offsetParent !== null || el.getClientRects().length > 0) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) return true;
      }
    }
    return false;
  });
  if (generating) {
    log("RECOLL DEFERRED: 回复仍在生成（停止按钮可见），不物化不采集，稍后重试");
    process.exitCode = 3;
  } else {
  const vp = await page.evaluate(() => ({ w: innerWidth, dpr: devicePixelRatio }));
  cdp = await ctx.newCDPSession(page);
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
      recollection: true, driver: "recoll_instance_r5.mjs",
      conversation_url: `https://chatgpt.com/c/${CONV_UUID}`,
      failed_dispatch_dir: FAILED_DIR, failure_code: "INBOUND_WINDOW_COMPLETENESS_UNPROVEN",
      recovery: "视口拉高静态DOM全量物化+归属校验三件套+前轮SHA排除（禁重发，L-018 七查）",
      send_receipt_crossref: "phase0/logs/dispatch-2026-11-20T17-14-34/send-state.json (SEND_CONFIRMED, user_unit_key=fallback-turn-0:0:user)",
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
    if (cdp) await cdp.send("Page.clearDeviceMetricsOverride").catch(() => {});
    log("视口覆盖已清除");
  }
  }
} catch (e) {
  log(`RECOLL FAILED: ${e && e.message}`);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  lock.release();
  log("会话锁已释放（instance-r5 阶段1终签补采）");
}
