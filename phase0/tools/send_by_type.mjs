// 重打发送兜底：校验草稿→Ctrl+A 清空→insertText 重新输入→Enter→轮询
import { chromium } from "playwright";
import { writeFileSync, readFileSync } from "node:fs";

const [MARKER, MSG_FILE, OUT] = process.argv.slice(2);
if (!MARKER || !MSG_FILE || !OUT) throw new Error("用法: <marker> <msgFile> <outDir>");
const msg = readFileSync(MSG_FILE, "utf8");

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222", { timeout: 30000 });
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes("chatgpt.com"));
if (!page) throw new Error("无 chatgpt 页");

const composerSel = '#prompt-textarea, [aria-label="询问 ChatGPT"], [aria-label="Ask ChatGPT"]';
const composer = page.locator(composerSel).first();
const before = await composer.innerText();
if (!before.includes(MARKER)) throw new Error(`草稿缺本轮标记，STOP（len=${before.length}）`);

await composer.click();
await page.keyboard.press("Control+A");
await page.keyboard.press("Delete");
await page.waitForTimeout(300);
await page.keyboard.insertText(msg);
await page.waitForTimeout(500);
const typed = await composer.innerText();
if (!typed.includes(MARKER)) throw new Error("重打后缺标记，STOP");
if (typed.length !== msg.length) {
  console.log(`[warn] 重打长度 ${typed.length} ≠ 消息 ${msg.length}（可能换行差异），继续尝试发送`);
}
await page.keyboard.press("End");
await page.waitForTimeout(200);
await page.keyboard.press("Enter");

let polls = 0;
const t0 = Date.now();
let last = null;
while (Date.now() - t0 < 120000) {
  polls++;
  last = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    const len = el ? (el.innerText || "").length : -1;
    const stop = Array.from(document.querySelectorAll('button[data-label="停止"], button[aria-label="停止"], button[aria-label="Stop"], button[data-testid="stop-button"]'))
      .some((b) => b.getClientRects().length > 0);
    const units = Array.from(document.querySelectorAll("[data-content-search-unit-key]")).map((u) => u.getAttribute("data-content-search-unit-key"));
    return { len, stop, units };
  }, composerSel);
  if (last.len <= 1 && !last.stop) {
    const rec = { at: new Date().toISOString(), marker: MARKER, polls, lenBefore: before.length, lastUnitKey: last.units[last.units.length - 1] || null, result: "SENT" };
    writeFileSync(OUT + "/send-by-type-verify.json", JSON.stringify(rec, null, 2));
    console.log(JSON.stringify(rec));
    await browser.close();
    process.exit(0);
  }
  await page.waitForTimeout(2000);
}
writeFileSync(OUT + "/send-by-type-verify.json", JSON.stringify({ at: new Date().toISOString(), marker: MARKER, polls, lastLen: last ? last.len : -1, result: "SEND_UNCONFIRMED" }, null, 2));
console.log("SEND_UNCONFIRMED");
await browser.close();
