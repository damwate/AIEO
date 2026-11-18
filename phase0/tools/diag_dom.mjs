import { chromium } from "playwright";
import { readDomUnits } from "./inbound_dom.mjs";
import { acquireSessionLock } from "../e2e-poc/session_lock.mjs";
const CONV_UUID = "6afd9f0c-ff44-83ee-973f-55c1b302d0c0";
const lock = acquireSessionLock({ holder: "diag" });
let browser;
try {
  browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find((p) => p.url().includes("chatgpt.com/c/")) || ctx.pages()[0];
  console.log("URL", page.url());
  const vp = await page.evaluate(() => ({ w: innerWidth, dpr: devicePixelRatio }));
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Page.setDeviceMetricsOverride", { width: vp.w, height: 100000, deviceScaleFactor: vp.dpr || 1, mobile: false });
  await page.waitForTimeout(5000);
  const units = await readDomUnits(page);
  console.log("TOTAL_UNITS", units.length);
  const tail = units.slice(-8);
  tail.forEach((u, i) => console.log(i, u.role, u.key, JSON.stringify((u.text || "").slice(0, 140))));
  await cdp.send("Page.clearDeviceMetricsOverride").catch(() => {});
} catch (e) {
  console.log("ERR", e && e.message);
} finally {
  if (browser) await browser.close().catch(() => {});
  lock.release();
}
