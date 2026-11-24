// b-20261123-standard-third-trial S3 针对性复核补采：发送确认但采集 fail-closed。
// 禁重发→三步诊断（diag_s3_formal_r1.mjs，virtualization_inferred=true）→静态DOM全量物化 +
// 归属校验三件套（L-018 第2/3/4条）。三参数全换：CONV_UUID + SENT_USER_UNIT_KEY + FAILED_DIR（另换 MARKER + PREV_REPLY_SHAS 排除集）。
import { chromium } from "playwright";
import { readDomUnits } from "./inbound_dom.mjs";
import { acquireSessionLock } from "../e2e-poc/session_lock.mjs";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const CONV_UUID = "6b050b37-40b8-83ec-9365-8a0ca627b757";
const MARKER = "[复核S3|b-20261123-standard-third-trial]";
const SENT_USER_UNIT_KEY = "fallback-turn-0:0:user";
const PREV_REPLY_SHAS = [
  "81b313dfcc8fc135b4bf2a404031da55aa01d2dcff832b3739d32329adcf0ffd", // s3-formal（紧邻前轮）
  "87b19055d5d8c15487cd3c7759ea8bacb4fdfdba1b7f838cb6ae7b3208a97a39", // s1-formal
  "a58d9a5b408c0f911c1ba4a5cd69abd06e4bc41482fcedcd8051ee34beabfe98", // test-acceptance R1
];
const FAILED_DIR = "phase0/logs/dispatch-2026-11-24T08-37-23";
const DIAG_DIR = "phase0/logs/diag-s3-targeted-r1-2026-11-24T09-06-29-210Z";
const OUT_DIR = join(process.cwd(), "phase0", "logs",
  `recoll-s3-targeted-r1-${new Date().toISOString().replace(/[:.]/g, "-")}`);
mkdirSync(OUT_DIR, { recursive: true });
const log = (m) => {
  const line = `[${new Date().toISOString()}] ${m}`;
  console.log(line);
  writeFileSync(join(OUT_DIR, "run.log"), line + "\n", { flag: "a", encoding: "utf8" });
};
const lock = acquireSessionLock({ holder: "gpt_dispatch_recoll_s3_targeted" });
log("会话锁已获取（S3 针对性复核补采）");
let browser;
try {
  browser = await chromium.connectOverCDP("http://127.0.0.1:9300");
  const ctx = browser.contexts()[0];
  let page = ctx.pages().find((p) => p.url().includes(CONV_UUID));
  if (!page) {
    page = ctx.pages().find((p) => p.url().includes("chatgpt.com")) || ctx.pages()[0];
    await page.goto(`https://chatgpt.com/c/${CONV_UUID}`, { waitUntil: "domcontentloaded", timeout: 40000 });
    await page.waitForTimeout(5000);
  }
  if (!page.url().includes(CONV_UUID)) throw new Error(`会话 UUID 不匹配: ${page.url()}`);
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
    if (marked.length !== 1) throw new Error(`标记唯一定位失败：命中 ${marked.length} 条（应为 1）`);
    const target = marked[0];
    const users = second.filter((u) => u.role === "user");
    const lastUser = users[users.length - 1];
    if (target.key !== lastUser.key) throw new Error("最后 user 断言失败：标记 user 非最后一个 user");
    log(`归属校验=标记唯一(${marked.length})+最后user断言（target=${target.key}）`);
    const idx = second.indexOf(target);
    const after = second.slice(idx + 1);
    const assistants = after.filter((u) => u.role === "assistant");
    const last = second[second.length - 1];
    if (assistants.length === 0) throw new Error("标记后无 assistant unit");
    if (last.role !== "assistant") throw new Error("尾部不是 assistant unit");
    const reply = after.map((u) => u.text || "").join("\n\n");
    const sha = createHash("sha256").update(reply, "utf8").digest("hex");
    if (PREV_REPLY_SHAS.some((p) => sha === p || sha.startsWith(p.slice(0, 16)))) {
      throw new Error("前轮 reply SHA 排除命中：采到旧轮回复（归属冲突）");
    }
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
      adjacent_assistant_tail: assistants.length > 0 && last.role === "assistant",
      stable_static_dom_read: stable, final_stop_button_not_visible: !stopVisible,
      not_prev_reply_sha: true, response_length_plausible: Buffer.byteLength(reply, "utf8") > 100,
    };
    log(`checks=${JSON.stringify(checks)}`);
    writeFileSync(join(OUT_DIR, "reply.txt"), reply, "utf8");
    writeFileSync(join(OUT_DIR, "result.json"), JSON.stringify({
      recollection: true, driver: "recoll_s3_targeted_r1.mjs",
      conversation_url: `https://chatgpt.com/c/${CONV_UUID}`,
      failed_dispatch_dir: FAILED_DIR, failure_code: "INBOUND_WINDOW_COMPLETENESS_UNPROVEN",
      diagnosis: `${DIAG_DIR}/report.json (virtualization_inferred=true; 静态DOM路径适用)`,
      recovery: "视口拉高静态DOM全量物化+归属校验三件套（禁重发）",
      sent_user_unit_key: SENT_USER_UNIT_KEY, marked_user_unit_key: target.key, assistant_unit_key: last.key,
      assistant_unit_count: assistants.length,
      after_units: after.map((u) => ({ key: u.key, role: u.role, text_len: (u.text || "").length, text_head: (u.text || "").slice(0, 60) })),
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
  log("会话锁已释放（S3 针对性复核补采）");
}
