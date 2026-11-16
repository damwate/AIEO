// 只读检查：指定会话页的 unit 列表与输入框状态（不发送、不改 DOM）
import { chromium } from "playwright";

const url = process.argv[2];
if (!url) { console.error("usage: node check_conv_units.mjs <conversation_url>"); process.exit(2); }

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222", { timeout: 30000 });
const ctx = browser.contexts()[0];
let page = ctx.pages().find((p) => p.url().includes("chatgpt.com"));
if (!page) page = await ctx.newPage();

await page.setViewportSize({ width: 1920, height: 12000 }).catch(() => {});

const read = async () => page.evaluate(() => {
  const composer = document.querySelector('#prompt-textarea, [aria-label="询问 ChatGPT"], [aria-label="Ask ChatGPT"]');
  const text = composer ? (composer.innerText || "") : "";
  const units = Array.from(document.querySelectorAll("[data-content-search-unit-key]")).map((u) => ({
    key: u.getAttribute("data-content-search-unit-key"),
    role: u.getAttribute("data-content-search-unit-role"),
  }));
  const stop = Array.from(document.querySelectorAll('button[data-testid="stop-button"], button[aria-label="停止"], button[aria-label="Stop"]'))
    .filter((b) => b.getClientRects().length > 0).length;
  return {
    url: location.href,
    title: document.title,
    readyState: document.readyState,
    composerLen: text.length,
    composerHead: text.slice(0, 60),
    stopVisible: stop,
    unitCount: units.length,
    unitKeys: units.map((u) => u.key),
  };
});

// 多次尝试导航，容忍慢链路
let navigated = false;
for (let i = 0; i < 3 && !navigated; i++) {
  try {
    await page.goto(url, { waitUntil: "commit", timeout: 45000 });
    navigated = true;
  } catch (e) {
    console.log(`goto attempt ${i + 1} failed: ${e.message.split("\n")[0]}`);
    await page.waitForTimeout(5000);
  }
}
await page.waitForTimeout(15000);

let state = await read();
for (let i = 0; i < 4 && state.unitCount < 4; i++) {
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
  await page.waitForTimeout(8000);
  state = await read();
}
console.log(JSON.stringify(state, null, 2));
await browser.close();
