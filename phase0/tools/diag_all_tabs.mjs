// 只读：列出所有 CDP 页及其 ChatGPT unit 概览，判断消息是否发到另一标签页。
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
const OUT = "D:/AIEO/phase0/logs/diag-all-tabs-20261123";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.connectOverCDP("http://127.0.0.1:9222", { timeout: 30000 });
const ctx = browser.contexts()[0];
const out = [];
for (const page of ctx.pages()) {
  const r = await page.evaluate(() => {
    const units = Array.from(document.querySelectorAll("[data-content-search-unit-key]")).map((u) => ({
      key: u.getAttribute("data-content-search-unit-key"),
      head: (u.innerText || "").slice(0, 70),
    }));
    return { url: location.href, title: document.title, unitCount: units.length, units };
  }).catch((e) => ({ url: page.url(), err: e.message.split("\n")[0] }));
  out.push(r);
}
writeFileSync(`${OUT}/tabs.json`, JSON.stringify(out, null, 2), "utf8");
console.log(JSON.stringify(out, null, 2));
await browser.close();
