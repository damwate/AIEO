// webcachenext 补采前探测：仅读，不发送。检查停止按钮可见性与尾部 unit。
import { chromium } from "playwright";
import { readDomUnits } from "./inbound_dom.mjs";
import { acquireSessionLock } from "../e2e-poc/session_lock.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const CONV_UUID = "6aff11d3-7cc8-83ec-af09-f57f68ddf67a";
const OUT_DIR = join(process.cwd(), "phase0", "logs",
  `probe-genstate-next-${new Date().toISOString().replace(/[:.]/g, "-")}`);
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, ".keep"), "", "utf8");
const log = (m) => console.log(`[${new Date().toISOString()}] ${m}`);
const lock = acquireSessionLock({ holder: "gpt_dispatch_probe" });
let browser;
try {
  browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
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
  const tail = units[units.length - 1];
  log(`stopVisible=${stopVisible} units=${units.length} tail=${tail ? tail.role + ":" + tail.key + ":len=" + (tail.text || "").length : "null"}`);
  const mine = units.filter((u) => u.role === "user" && (u.text || "").includes("webcachenext20261119a"));
  log(`marker_hits=${mine.length}${mine.length ? " at " + mine[0].key : ""}`);
  console.log(`PROBE_RESULT=${JSON.stringify({ stopVisible, units: units.length, tailRole: tail?.role })}`);
} catch (e) {
  log(`PROBE FAILED: ${e && e.message}`);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  lock.release();
}
