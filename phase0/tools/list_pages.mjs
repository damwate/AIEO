// 只读：列出 CDP 浏览器中全部页面
import { chromium } from "playwright";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222", { timeout: 30000 });
for (const ctx of browser.contexts()) {
  const pages = ctx.pages();
  console.log(`pages=${pages.length}`);
  for (let i = 0; i < pages.length; i++) {
    const t = await pages[i].title();
    console.log(`  [${i}] ${pages[i].url().slice(0, 110)} | ${String(t).slice(0, 40)}`);
  }
}
console.log("browserVersion:", browser.version());
await browser.close();
