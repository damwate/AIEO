// 只读：列出候选发送键的实际状态
import { chromium } from "playwright";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9222", { timeout: 30000 });
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes("chatgpt.com"));
if (!page) throw new Error("无 chatgpt 页");
const r = await page.evaluate(() =>
  Array.from(document.querySelectorAll('form button[aria-label*="发送"], form button[aria-label*="Send"], button[data-testid="send-button"]'))
    .map((el, i) => ({
      i,
      label: el.getAttribute("aria-label"),
      testid: el.getAttribute("data-testid"),
      disabled: el.disabled,
      aria: el.getAttribute("aria-disabled"),
      rects: el.getClientRects().length,
      html: el.outerHTML.slice(0, 140),
    }))
);
console.log(JSON.stringify(r, null, 1));
await browser.close();
