// 诊断：读取 reviewer 会话全部 unit 的文本头部，判断最后 user/assistant 归属与内容。
import { chromium } from "playwright";
import { readDomUnits } from "./inbound_dom.mjs";
import { writeFileSync } from "node:fs";

const CONV = "6afdaba1-034c-83ec-b1c7-d3eb57532ae9";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes(CONV));
if (!page) throw new Error("no page");
const vp = await page.evaluate(() => ({ w: innerWidth, dpr: devicePixelRatio }));
const cdp = await ctx.newCDPSession(page);
await cdp.send("Page.setDeviceMetricsOverride",
  { width: vp.w, height: 60000, deviceScaleFactor: vp.dpr || 1, mobile: false });
await page.waitForTimeout(5000);
try {
  const units = await readDomUnits(page);
  const out = units.map((u, i) => ({
    i, key: u.key, role: u.role, len: (u.text || "").length,
    head: (u.text || "").slice(0, 220),
  }));
  writeFileSync("phase0/logs/diag_release_reply.json", JSON.stringify(out, null, 2), "utf8");
  console.log(JSON.stringify(out, null, 2));
} finally {
  await cdp.send("Page.clearDeviceMetricsOverride").catch(() => {});
  await browser.close().catch(() => {});
}
