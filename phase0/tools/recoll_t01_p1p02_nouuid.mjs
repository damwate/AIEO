// 专用补采变体：本轮派单发送双验通过，但入站窗口完整性无法证明（INBOUND_WINDOW_COMPLETENESS_UNPROVEN）。
// 按 L-018：禁重发→非虚拟化静态DOM（视口拉高）全量物化→归属校验型定位（标记唯一+最后user+
// 紧邻assistant+尾部+前轮reply SHA排除+稳定读取+停止按钮消失）。不发送、不重发。
import { chromium } from "playwright";
import { readDomUnits } from "./inbound_dom.mjs";
import { acquireSessionLock } from "../e2e-poc/session_lock.mjs";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const CONV_UUID = "6afd674c-7d70-83ec-a94b-172f46f2c4cc";
const MARKER = "[T01 P1-02复验|AI-Image-Service|20261119";
const PREV_REPLY_SHA = "7c656b187867c4ec";
const OUT_DIR = join(process.cwd(), "phase0", "logs",
  `recoll-nouuid-${new Date().toISOString().replace(/[:.]/g, "-")}`);
mkdirSync(OUT_DIR, { recursive: true });
const log = (m) => {
  const line = `[${new Date().toISOString()}] ${m}`;
  console.log(line);
  writeFileSync(join(OUT_DIR, "run.log"), line + "\n", { flag: "a", encoding: "utf8" });
};

const lock = acquireSessionLock({ holder: "gpt_dispatch_recoll" });
log("会话锁已获取（nouuid 专用补采）");
let browser;
try {
  browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find((p) => p.url().includes("chatgpt.com/c/")) || ctx.pages()[0];
  if (!page.url().includes(CONV_UUID)) throw new Error(`会话 UUID 不匹配: ${page.url()}`);
  const vp = await page.evaluate(() => ({ w: innerWidth, dpr: devicePixelRatio }));
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Page.setDeviceMetricsOverride",
    { width: vp.w, height: 100000, deviceScaleFactor: vp.dpr || 1, mobile: false });
  await page.waitForTimeout(8000);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(3000);
  try {
    const first = await readDomUnits(page);
    await page.waitForTimeout(12000);
    const second = await readDomUnits(page);
    const stable = first.length === second.length &&
      first.every((u, i) => u.key === second[i].key && (u.text || "") === (second[i].text || ""));
    if (!stable) throw new Error("静态 DOM 两次读取不稳定（存在仍在生成或虚拟抖动）");

    writeFileSync(join(OUT_DIR, "units-diag.json"), JSON.stringify(second.map((u) => ({
      key: u.key, role: u.role, visible: u.visible, assistantUuid: u.assistantUuid,
      text_head: (u.text || "").slice(0, 100),
    })), null, 2), "utf8");

    const users = second.filter((u) => u.role === "user");
    const marked = users.filter((u) => (u.text || "").includes(MARKER));
    if (marked.length !== 1) throw new Error(`标记命中数异常: ${marked.length}`);
    const target = marked[0];
    if (target.key !== users[users.length - 1].key) throw new Error("标记 user 不是最后一个 user");
    const idx = second.indexOf(target);
    const assistant = second[idx + 1];
    if (!assistant || assistant.role !== "assistant") throw new Error("标记 user 后无紧邻 assistant");
    if (assistant.key !== second[second.length - 1].key) throw new Error("尾部 assistant 不是最后一个 unit");
    const reply = assistant.text || "";
    if (reply.length < 300) throw new Error(`回复过短疑似未生成完: ${reply.length}`);
    const sha = createHash("sha256").update(reply, "utf8").digest("hex");
    if (sha.startsWith(PREV_REPLY_SHA)) throw new Error("采到前轮回复（SHA 命中排除项）");

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
      marked_user_unique: true,
      last_user_assertion: true,
      adjacent_assistant_tail: true,
      stable_static_dom_read: stable,
      final_stop_button_not_visible: !stopVisible,
      not_prev_reply_sha: true,
      response_length_plausible: true,
      uuid_based_locator: false,
    };
    log(`checks=${JSON.stringify(checks)}`);
    writeFileSync(join(OUT_DIR, "reply.txt"), reply, "utf8");
    writeFileSync(join(OUT_DIR, "result.json"), JSON.stringify({
      recollection: true, driver: "recoll_t01_p1p02_nouuid.mjs",
      conversation_url: `https://chatgpt.com/c/${CONV_UUID}`,
      reference_failed_dispatch_dir: "phase0/logs/dispatch-2026-11-18T09-06-11",
      failure_code: "INBOUND_WINDOW_COMPLETENESS_UNPROVEN",
      recovery: "视口拉高静态DOM全量物化+归属校验型定位（禁重发）",
      marked_user_unit_key: target.key, assistant_unit_key: assistant.key,
      assistant_uuid: assistant.assistantUuid ?? null,
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
  log("会话锁已释放（nouuid 专用补采）");
}
