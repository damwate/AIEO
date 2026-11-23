// 只读多时点诊断 recheck2 续派后页面状态：不导航、不发送、不改 DOM。
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
const OUT = "D:/AIEO/phase0/logs/diag-r8-recheck2-state";
import { mkdirSync } from "node:fs";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222", { timeout: 30000 });
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes("chatgpt.com"));
const samples = [];
for (let i = 0; i < 6; i++) {
  const s = await page.evaluate(() => {
    const units = Array.from(document.querySelectorAll("[data-content-search-unit-key]")).map((u) => ({
      key: u.getAttribute("data-content-search-unit-key"),
      textHead: (u.innerText || "").slice(0, 90),
    }));
    const composer = document.querySelector('#prompt-textarea, [aria-label="询问 ChatGPT"], [aria-label="Ask ChatGPT"]');
    const stop = Array.from(document.querySelectorAll('button[data-testid="stop-button"], button[aria-label="停止"], button[aria-label="Stop"]')).filter((b) => b.getClientRects().length > 0).length;
    return {
      url: location.href, title: document.title, units, unitCount: units.length,
      composerLen: composer ? (composer.innerText || "").length : null,
      stopVisible: stop, scrollH: document.scrollingElement?.scrollHeight, scrollT: document.scrollingElement?.scrollTop,
    };
  });
  samples.push({ t: new Date().toISOString(), ...s });
  await page.waitForTimeout(8000);
}
writeFileSync(`${OUT}/samples.json`, JSON.stringify(samples, null, 2), "utf8");
console.log(JSON.stringify(samples.map((s) => ({ t: s.t, unitCount: s.unitCount, composerLen: s.composerLen, stop: s.stopVisible, title: s.title, keys: s.units.map((u) => u.key) })), null, 2));
await browser.close();
