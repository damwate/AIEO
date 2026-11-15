import { chromium } from "playwright";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const ctx = browser.contexts()[0];
let page = ctx.pages().find((p) => p.url().includes("6af9e82c"));
if (!page) { console.log("PAGE NOT FOUND"); process.exit(1); }
const info = await page.evaluate(() => {
  const cands = document.querySelectorAll(
    'button[aria-label="停止"], button[aria-label="Stop"], button[data-testid="stop-button"], form button[aria-label*="停止"], form button[aria-label*="Stop"]');
  const out = [];
  for (const el of cands) {
    const r = el.getBoundingClientRect();
    out.push({label: el.getAttribute("aria-label"), testid: el.getAttribute("data-testid"),
              visible: el.offsetParent !== null || el.getClientRects().length > 0,
              w: r.width, h: r.y});
  }
  const lastU = [...document.querySelectorAll("[data-content-search-unit-key]")].slice(-2).map(e => e.getAttribute("data-content-search-unit-key"));
  return {cands: out, tailKeys: lastU, total: document.querySelectorAll("[data-content-search-unit-key]").length};
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
