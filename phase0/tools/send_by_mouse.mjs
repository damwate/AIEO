// 坐标级鼠标点击兜底：取发送键 bounding box 中心，page.mouse 点击
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const MARKER = process.argv[2];
const OUT = process.argv[3];
const browser = await chromium.connectOverCDP("http://127.0.0.1:9222", { timeout: 30000 });
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes("chatgpt.com"));
if (!page) throw new Error("无 chatgpt 页");

const box = await page.evaluate(() => {
  const el = document.querySelector('form button[aria-label*="发送"], form button[aria-label*="Send"], button[data-testid="send-button"]');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height };
});
if (!box || box.w < 2 || box.h < 2) throw new Error("未找到发送键或尺寸异常: " + JSON.stringify(box));

const composerSel = '#prompt-textarea, [aria-label="询问 ChatGPT"], [aria-label="Ask ChatGPT"]';
const lenBefore = await page.evaluate((sel) => {
  const el = document.querySelector(sel);
  return el ? (el.innerText || "").length : -1;
}, composerSel);
if (lenBefore < 100) throw new Error("草稿长度异常 len=" + lenBefore + "，STOP");

await page.mouse.move(box.x, box.y);
await page.mouse.down();
await page.mouse.up();
console.log("clicked at", box);

let polls = 0;
const t0 = Date.now();
while (Date.now() - t0 < 60000) {
  polls++;
  const s = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    const len = el ? (el.innerText || "").length : -1;
    const stop = Array.from(document.querySelectorAll('button[data-label="停止"], button[aria-label="停止"], button[aria-label="Stop"], button[data-testid="stop-button"]'))
      .some((b) => b.getClientRects().length > 0);
    const units = Array.from(document.querySelectorAll("[data-content-search-unit-key]")).map((u) => u.getAttribute("data-content-search-unit-key"));
    return { len, stop, units };
  }, composerSel);
  if (s.len !== lenBefore && s.len <= 1) {
    const rec = { at: new Date().toISOString(), marker: MARKER, lenBefore, polls, lastUnitKey: s.units[s.units.length - 1] || null, result: "SENT" };
    writeFileSync(OUT + "/send-by-mouse-verify.json", JSON.stringify(rec, null, 2));
    console.log(JSON.stringify(rec));
    await browser.close();
    process.exit(0);
  }
  await page.waitForTimeout(2000);
}
writeFileSync(OUT + "/send-by-mouse-verify.json", JSON.stringify({ at: new Date().toISOString(), marker: MARKER, lenBefore, polls, result: "SEND_UNCONFIRMED" }, null, 2));
console.log("SEND_UNCONFIRMED");
await browser.close();
