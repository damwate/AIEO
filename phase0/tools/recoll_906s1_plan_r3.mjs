// 906 S1 R3 独立验收补采：send 双验通过但采集 fail-closed（INBOUND_WINDOW_COMPLETENESS_UNPROVEN）。
// 禁重发→三步诊断（diag_906s1_plan_r3.mjs，virtualization_inferred=true）→静态DOM全量物化补采 + 归属校验三件套（L-018 第2/3/4条）。
// 派生自 recoll_906s1_plan_r2.mjs；四常量全换（CONV_UUID + MARKER + PREV_REPLY_SHA + FAILED_DIR），头部已 grep 核对。
import { chromium } from "playwright";
import { readDomUnits } from "./inbound_dom.mjs";
import { acquireSessionLock } from "../e2e-poc/session_lock.mjs";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const CONV_UUID = "6afe9d76-5af0-83ec-bb84-77e7c54f409e";
const MARKER = "[906S1-PLAN-R3|20261119]";
const PREV_REPLY_SHA = "cf078bc249319e66d79e1414756c12e8074290c001110a6e2ace137f83518ecb"; // R2 裁定回复，排除
const FAILED_DIR = "phase0/logs/dispatch-2026-11-19T07-07-30";
const OUT_DIR = join(process.cwd(), "phase0", "logs",
  `recoll-906s1-plan-r3-${new Date().toISOString().replace(/[:.]/g, "-")}`);
mkdirSync(OUT_DIR, { recursive: true });
const log = (m) => {
  const line = `[${new Date().toISOString()}] ${m}`;
  console.log(line);
  writeFileSync(join(OUT_DIR, "run.log"), line + "\n", { flag: "a", encoding: "utf8" });
};
const lock = acquireSessionLock({ holder: "gpt_dispatch_recoll" });
log("会话锁已获取（906 S1 R3 补采）");
let browser;
try {
  browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
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
    if (sha === PREV_REPLY_SHA || sha.startsWith(PREV_REPLY_SHA.slice(0, 16))) {
      throw new Error("前轮 reply SHA 排除命中：采到 R2 规划旧回复");
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
      recollection: true, driver: "recoll_906s1_plan_r3.mjs",
      conversation_url: `https://chatgpt.com/c/${CONV_UUID}`,
      failed_dispatch_dir: FAILED_DIR, failure_code: "INBOUND_WINDOW_COMPLETENESS_UNPROVEN",
      diagnosis: "phase0/logs/diag-906s1-plan-r3-2026-11-19T07-11-02-816Z/report.json (virtualization_inferred=true)",
      recovery: "视口拉高静态DOM全量物化+归属校验三件套（禁重发）",
      marked_user_unit_key: target.key, assistant_unit_key: last.key,
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
  log("会话锁已释放（906 S1 R3 补采）");
}
