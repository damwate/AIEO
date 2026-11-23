// 只读诊断：reload 当前会话页，观察本轮 recheck2 消息是否在重载后物化。不发送、不改内容。
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
const OUT = "D:/AIEO/phase0/logs/diag-r8-recheck2-reload";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.connectOverCDP("http://127.0.0.1:9222", { timeout: 30000 });
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes("chatgpt.com"));
await page.setViewportSize({ width: 1920, height: 12000 }).catch(() => {});
await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(15000);
const samples = [];
for (let i = 0; i < 4; i++) {
  const s = await page.evaluate(() => {
    const units = Array.from(document.querySelectorAll("[data-content-search-unit-key]")).map((u) => ({
      key: u.getAttribute("data-content-search-unit-key"),
      role: (u.getAttribute("data-content-search-unit-key") || "").split(":").pop(),
      head: (u.innerText || "").slice(0, 100),
    }));
    return { url: location.href, unitCount: units.length, units };
  });
  samples.push({ t: new Date().toISOString(), ...s });
  await page.waitForTimeout(8000);
}
writeFileSync(`${OUT}/after-reload.json`, JSON.stringify(samples, null, 2), "utf8");
console.log(JSON.stringify(samples.map((s) => ({ t: s.t, n: s.unitCount, keys: s.units.map((u) => u.key + '|' + u.head.slice(0,30)) })), null, 2));
await browser.close();
