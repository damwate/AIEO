// webcacheload 重复发送探测：只读。统计标记命中数、生成态、尾部角色。
import { chromium } from "playwright";
import { readDomUnits } from "./inbound_dom.mjs";
import { acquireSessionLock } from "../e2e-poc/session_lock.mjs";

const CONV_UUID = "6aff11d3-7cc8-83ec-af09-f57f68ddf67a";
const MARKER = "webcacheload20261120";
const log = (m) => console.log(`[${new Date().toISOString()}] ${m}`);
const lock = acquireSessionLock({ holder: "gpt_dispatch_probe" });
let browser;
try {
  browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find((p) => p.url().includes(CONV_UUID));
  if (!page) throw new Error(`未找到目标会话页 ${CONV_UUID}`);
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
  const units = await readDomUnits(page);
  const marked = units.filter((u) => u.role === "user" && (u.text || "").includes(MARKER));
  const tail = units[units.length - 1];
  log(`stopVisible=${stopVisible} units=${units.length} tail=${tail ? tail.role + ":" + tail.key + ":len=" + (tail.text || "").length : "null"}`);
  log(`标记命中=${marked.length}${marked.length ? " keys=" + marked.map((m) => m.key).join(" | ") : ""}`);
  marked.forEach((m, i) => log(`  [${i + 1}] ${m.key} head=${(m.text || "").slice(0, 60).replace(/\s+/g, " ")}`));
  console.log(`PROBE=${JSON.stringify({ stopVisible, hits: marked.length, tailRole: tail?.role, units: units.length })}`);
} catch (e) {
  log(`PROBE FAILED: ${e && e.message}`);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  lock.release();
}
