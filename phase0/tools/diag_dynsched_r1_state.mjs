// 只读诊断 DYN-SCHED-R1 新会话采集失败后的页面状态：多时点观察，不导航、不发送。
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
const OUT = "D:/AIEO/phase0/logs/recoll-dynsched-r1";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.connectOverCDP("http://127.0.0.1:9222", { timeout: 30000 });
const ctx = browser.contexts()[0];
const pages = ctx.pages().filter((p) => p.url().includes("chatgpt.com"));
const report = [];
for (const page of pages) {
  const samples = [];
  for (let i = 0; i < 5; i++) {
    const s = await page.evaluate(() => {
      const units = Array.from(document.querySelectorAll("[data-content-search-unit-key]")).map((u) => ({
        key: u.getAttribute("data-content-search-unit-key"),
        role: (u.getAttribute("data-content-search-unit-key") || "").split(":").pop(),
        head: (u.innerText || "").slice(0, 90),
        len: (u.innerText || "").length,
      }));
      const stop = Array.from(document.querySelectorAll('button[data-testid="stop-button"], button[aria-label="停止"], button[aria-label="Stop"]')).filter((b) => b.getClientRects().length > 0).length;
      const sc = document.scrollingElement;
      return {
        url: location.href, title: document.title, unitCount: units.length, units,
        stopVisible: stop, scrollH: sc?.scrollHeight, scrollT: sc?.scrollTop,
      };
    });
    samples.push({ t: new Date().toISOString(), ...s });
    await page.waitForTimeout(8000);
  }
  report.push({ url: page.url(), samples });
}
writeFileSync(`${OUT}/state-diag.json`, JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify(report.map((r) => ({ url: r.url, obs: r.samples.map((s) => ({ t: s.t, n: s.unitCount, stop: s.stopVisible, title: s.title, keys: s.units.map((u) => u.key) })) })), null, 2));
await browser.close();
