// 只读：R8 新会话采集 fail-closed 后，诊断当前页 unit 集合与生成态。不导航、不发送、不改 DOM 内容。
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const OUT = "D:/AIEO/phase0/logs/recoll-ctx-code-r8";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222", { timeout: 30000 });
const ctx = browser.contexts()[0];
const pages = ctx.pages().filter((p) => p.url().includes("chatgpt.com"));
const report = [];

for (const page of pages) {
  const r = await page.evaluate(() => {
    const units = Array.from(document.querySelectorAll("[data-content-search-unit-key]")).map((u, i) => ({
      i,
      key: u.getAttribute("data-content-search-unit-key"),
      role: u.getAttribute("data-content-search-unit-role"),
      textHead: (u.innerText || "").slice(0, 80),
      textLen: (u.innerText || "").length,
    }));
    const stop = Array.from(document.querySelectorAll('button[data-testid="stop-button"], button[aria-label="停止"], button[aria-label="Stop"]'))
      .filter((b) => b.getClientRects().length > 0).length;
    const sc = document.scrollingElement;
    return {
      url: location.href,
      title: document.title,
      scrollTop: sc?.scrollTop,
      scrollHeight: sc?.scrollHeight,
      clientHeight: sc?.clientHeight,
      unitCount: units.length,
      stopVisible: stop,
      units,
    };
  });
  report.push(r);
}

writeFileSync(`${OUT}/state-diag.json`, JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify(report, null, 2));
await browser.close();
