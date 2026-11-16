// 回车键发送兜底：校验草稿含本轮标记→聚焦输入框→按 Enter→轮询发送双验
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";

const [MARKER, OUT] = process.argv.slice(2);
if (!MARKER || !OUT) throw new Error("用法: <marker> <outDir>");
mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222", { timeout: 30000 });
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes("chatgpt.com"));
if (!page) throw new Error("无 chatgpt 页");

const composerSel = '#prompt-textarea, [aria-label="询问 ChatGPT"], [aria-label="Ask ChatGPT"]';
const draft = await page.evaluate((sel) => {
  const el = document.querySelector(sel);
  return el ? (el.innerText || "") : "";
}, composerSel);
if (!draft.includes(MARKER)) throw new Error(`草稿缺本轮标记，STOP（len=${draft.length}）`);
const lenBefore = draft.length;

const composer = page.locator(composerSel).first();
await composer.click();
await page.keyboard.press("End");
await page.waitForTimeout(300);
await page.keyboard.press("Enter");

let tailOk = false, stopOk = false, polls = 0;
const t0 = Date.now();
while (Date.now() - t0 < 120000) {
  polls++;
  const s = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    const len = el ? (el.innerText || "").length : -1;
    const stop = Array.from(document.querySelectorAll('button[data-label="停止"], button[aria-label="停止"], button[aria-label="Stop"], button[data-testid="stop-button"]'))
      .some((b) => b.getClientRects().length > 0);
    const units = Array.from(document.querySelectorAll("[data-content-search-unit-key]")).map((u) => u.getAttribute("data-content-search-unit-key"));
    return { len, stop, units };
  }, composerSel);
  if (s.len !== lenBefore && s.len >= 0) tailOk = true;
  if (s.stop) stopOk = true;
  if (s.len !== lenBefore && !s.stop && s.len <= 1) {
    const key = s.units[s.units.length - 1] || null;
    writeFileSync(OUT + "/send-by-enter-verify.json", JSON.stringify({ at: new Date().toISOString(), marker: MARKER, lenBefore, polls, tailOk, stopOk, lastUnitKey: key }, null, 2));
    console.log(JSON.stringify({ at: new Date().toISOString(), marker: MARKER, lenBefore, polls, tailOk, stopOk, lastUnitKey: key }));
    await browser.close();
    process.exit(0);
  }
  await page.waitForTimeout(2000);
}
writeFileSync(OUT + "/send-by-enter-verify.json", JSON.stringify({ at: new Date().toISOString(), marker: MARKER, lenBefore, polls, tailOk, stopOk, result: "SEND_UNCONFIRMED" }, null, 2));
console.log("SEND_UNCONFIRMED");
await browser.close();
