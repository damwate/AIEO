// R3 会话页重载 + 状态复核（导航属只读重载；不发送、不改内容）
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const URL = "https://chatgpt.com/c/6afabbd3-ddec-83e8-afca-8a61cf91694c";
const OUT = "D:/AIEO/phase0/logs/dispatch-2026-11-16T08-40-08";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222", { timeout: 30000 });
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes("chatgpt.com")) || ctx.pages()[0];

const before = await page.evaluate(() => ({ url: location.href, units: document.querySelectorAll("[data-content-search-unit-key]").length }));
await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(10000);

const after = await page.evaluate(() => {
  const composer = document.querySelector('[aria-label="询问 ChatGPT"], [aria-label="Ask ChatGPT"], #prompt-textarea');
  const units = Array.from(document.querySelectorAll("[data-content-search-unit-key]")).map((u) => ({
    key: u.getAttribute("data-content-search-unit-key"), role: u.getAttribute("data-content-search-unit-role"),
  }));
  const sendBtns = Array.from(document.querySelectorAll('form button[aria-label*="发送"], form button[aria-label*="Send"], button[data-testid="send-button"]'))
    .map((b) => ({ label: b.getAttribute("aria-label"), disabled: b.disabled, visible: b.getClientRects().length > 0 }));
  return {
    url: location.href, title: document.title,
    composerLen: composer ? (composer.innerText || "").length : null,
    unitCount: units.length, unitKeys: units.map((u) => u.key), sendBtns,
  };
});
await page.screenshot({ path: `${OUT}/r3-after-reload.png` });
writeFileSync(`${OUT}/r3-after-reload.json`, JSON.stringify({ before, after }, null, 2), "utf8");
console.log(JSON.stringify({ before, after }, null, 2));
await browser.close();
