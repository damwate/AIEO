import { chromium } from "playwright";
import { readDomUnits } from "./inbound_dom.mjs";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const ctx = browser.contexts()[0];
const page = ctx.pages().find(p => p.url().includes("chatgpt.com/c/")) || ctx.pages()[0];
const vp = await page.evaluate(() => ({ w: innerWidth, dpr: devicePixelRatio }));
const cdp = await ctx.newCDPSession(page);
await cdp.send("Page.setDeviceMetricsOverride", { width: vp.w, height: 100000, deviceScaleFactor: vp.dpr || 1, mobile: false });
await page.waitForTimeout(8000);
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(3000);
const units = await readDomUnits(page);
console.log("UNITS", units.length);
for (const u of units.slice(-3)) {
  console.log(JSON.stringify({ key: u.key, role: u.role, assistantUuid: u.assistantUuid,
    visible: u.visible, textLen: (u.text || "").length, tail: (u.text || "").slice(-160) }));
}
const buttons = await page.evaluate(() => Array.from(document.querySelectorAll("button"))
  .map(b => (b.getAttribute("aria-label") || b.textContent || "").trim())
  .filter(Boolean).slice(-15));
console.log("BUTTONS", JSON.stringify(buttons));
await cdp.send("Page.clearDeviceMetricsOverride");
await browser.close();
