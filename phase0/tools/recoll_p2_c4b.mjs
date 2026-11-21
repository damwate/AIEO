// trial T3 补采：T2甲（dispatch-2026-11-20T17-30-24，进程 kill 于 SEND_CONFIRMED 后）原会话只读补采。
// 禁重发 → 页不在场则导航至原会话 → 前置生成态探测 → 视口拉高静态 DOM 全量物化
// → 归属三件套（marker 唯一+最后 user 断言+前轮 reply SHA 排除[新会话无前轮，零哨兵]）
// → 回执键形绑定：SEND_CONFIRMED.user_unit_key（fallback-turn-0:0:user 相对键）尾段
//   ":0:user" 必须与物化 marker 定位单元键尾段一致（首轮首单元语义对照），双键留档。
// 派生自 recoll_trial_plan_r1.mjs；三参数已换：CONV_UUID / MARKER / FAILED_DIR / 前轮 SHA=零哨兵。
import { chromium } from "playwright";
import { readDomUnits } from "./inbound_dom.mjs";
import { acquireSessionLock } from "../e2e-poc/session_lock.mjs";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const CONV_UUID = "6b0125b7-3f80-83ec-8e06-97cafd0f22dc";
const MARKER = "TRIAL-P2-C4B";
const FAILED_DIR = "phase0/logs/dispatch-2026-11-21T05-00-47";
const RECEIPT_USER_UNIT_KEY = "fallback-turn-0:0:user"; // T2甲 SEND_CONFIRMED 回执
const PREV_REPLY_SHA256 = "0000000000000000000000000000000000000000000000000000000000000000"; // 新会话无前轮 reply，零哨兵
const OUT_DIR = join(process.cwd(), "phase0", "logs",
  `recoll-p2-c4b-${new Date().toISOString().replace(/[:.]/g, "-")}`);
mkdirSync(OUT_DIR, { recursive: true });
const log = (m) => {
  const line = `[${new Date().toISOString()}] ${m}`;
  console.log(line);
  writeFileSync(join(OUT_DIR, "run.log"), line + "\n", { flag: "a", encoding: "utf8" });
};
const stopButtonVisible = (page) => page.evaluate(() => {
  const cands = document.querySelectorAll('button[aria-label="停止"], button[aria-label="Stop"], button[data-testid="stop-button"], form button[aria-label*="停止"], form button[aria-label*="Stop"]');
  for (const el of cands) {
    if (el.offsetParent !== null || el.getClientRects().length > 0) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return true;
    }
  }
  return false;
});
const lock = acquireSessionLock({ holder: "gpt_dispatch_recoll:agent-b", lockPath: "D:/AIEO/runtime/locks/gpt-session-agent-b.lockfile" });
log("会话锁已获取（p2-c4b agent-b 补采）");
let browser;
let cdp;
let createdPage = null;
try {
  browser = await chromium.connectOverCDP("http://127.0.0.1:9301");
  const ctx = browser.contexts()[0];
  let page = ctx.pages().find((p) => p.url().includes(CONV_UUID));
  if (!page) {
    page = await ctx.newPage();
    createdPage = page;
    await page.goto(`https://chatgpt.com/c/${CONV_UUID}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    log(`原会话页不在场，已新开页导航（createdPage=true）`);
  }
  for (let i = 0; i < 40; i++) {
    const units = await readDomUnits(page).catch(() => []);
    if (units.length > 0) break;
    await page.waitForTimeout(1000);
  }
  log(`页面就绪 CONV_UUID=${CONV_UUID}`);
  if (await stopButtonVisible(page)) {
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
    if (marked.length > 1) throw new Error(`标记命中 ${marked.length} 条，超出单发假设（=1），停止`);
    const target = marked[0];
    const users = second.filter((u) => u.role === "user");
    if (target.key !== users[users.length - 1].key) throw new Error("最后 user 断言失败：标记 user 非最后一个 user");
    // 回执键形绑定：回执相对键尾段 ":N:user" 与物化键尾段一致（首轮首单元语义对照）
    const receiptTail = RECEIPT_USER_UNIT_KEY.split(":").slice(-2).join(":"); // "0:user"
    const materializedTail = target.key.split(":").slice(-2).join(":");
    const keyFormBound = receiptTail === materializedTail;
    if (!keyFormBound) throw new Error(`回执键形绑定失败：回执尾段=${receiptTail} 物化尾段=${materializedTail}`);
    log(`归属校验=marker命中1条+最后user断言+回执键形绑定（receipt=${RECEIPT_USER_UNIT_KEY} materialized=${target.key}）`);
    const idx = second.indexOf(target);
    const after = second.slice(idx + 1);
    const assistants = after.filter((u) => u.role === "assistant");
    const last = second[second.length - 1];
    if (assistants.length === 0) throw new Error("标记后无 assistant unit");
    if (last.role !== "assistant") throw new Error("尾部不是 assistant unit");
    const reply = after.map((u) => u.text || "").join("\n\n");
    const sha = createHash("sha256").update(reply, "utf8").digest("hex");
    if (sha === PREV_REPLY_SHA256) throw new Error("零哨兵 SHA 异常命中（不可能），归属冲突");
    const stopVisible = await stopButtonVisible(page);
    const checks = {
      marked_user_unique: marked.length === 1, last_user_assertion: true,
      receipt_key_form_binding: keyFormBound,
      adjacent_assistant_tail: true, stable_static_dom_read: stable,
      final_stop_button_not_visible: !stopVisible,
      response_length_plausible: Buffer.byteLength(reply, "utf8") > 100,
      not_prev_reply_sha: sha !== PREV_REPLY_SHA256,
    };
    log(`checks=${JSON.stringify(checks)}`);
    writeFileSync(join(OUT_DIR, "reply.txt"), reply, "utf8");
    writeFileSync(join(OUT_DIR, "result.json"), JSON.stringify({
      recollection: true, driver: "recoll_p2_c4b.mjs",
      conversation_url: `https://chatgpt.com/c/${CONV_UUID}`,
      failed_dispatch_dir: FAILED_DIR, failure_code: "PROCESS_KILLED_AFTER_SEND_CONFIRMED",
      recovery: "导航原会话+视口拉高静态DOM全量物化+归属三件套+回执键形绑定（禁重发，只读补采）",
      prev_reply_sha_note: "新会话无前轮 reply，PREV_REPLY_SHA256=零哨兵仅保持七查结构",
      receipt_user_unit_key: RECEIPT_USER_UNIT_KEY,
      materialized_user_unit_key: target.key,
      key_form_binding: { receipt_tail: receiptTail, materialized_tail: materializedTail, bound: keyFormBound },
      assistant_unit_key: last.key, assistant_unit_count: assistants.length,
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
  if (createdPage) await createdPage.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
  lock.release();
  log("会话锁已释放（p2-c4b agent-b 补采；临时页已清理）");
}
