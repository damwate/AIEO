// 通用「点击发送」兜底：仅当 Composer 含本轮标记且长度匹配才发送，并自做发送双验
// 用法：node send_by_click_generic.mjs <marker> <expectLen> <outDir>
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";

const [MARKER, EXPECT_LEN, OUT] = process.argv.slice(2);
if (!MARKER || !EXPECT_LEN || !OUT) throw new Error("用法: <marker> <expectLen> <outDir>");
mkdirSync(OUT, { recursive: true });
const browser = await chromium.connectOverCDP("http://127.0.0.1:9222", { timeout: 30000 });
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes("chatgpt.com"));
if (!page) throw new Error("无 chatgpt 页");

const composerSel = '[aria-label="询问 ChatGPT"], [aria-label="Ask ChatGPT"], #prompt-textarea';
const text = await page.evaluate((sel) => {
  const el = document.querySelector(sel);
  return el ? (el.innerText || "") : "";
}, composerSel);
if (!text.includes(MARKER)) throw new Error(`草稿缺本轮标记，STOP（len=${text.length}）`);
if (String(text.length) !== String(EXPECT_LEN)) throw new Error(`草稿长度异常 ${text.length}≠${EXPECT_LEN}，STOP`);

const before = await page.evaluate(() =>
  Array.from(document.querySelectorAll("[data-content-search-unit-key]")).map((u) => u.getAttribute("data-content-search-unit-key")));
const sendBtns = page.locator('form button[aria-label*="发送"], form button[aria-label*="Send"], button[data-testid="send-button"]');
const candCount = await sendBtns.count();
console.log(`[debug] page=${page.url()} candCount=${candCount}`);
let clicked = false;
if (candCount === 1) {
  // 唯一候选即发送键（inspect_send_btns.mjs 已核实 rects>0、disabled=false）；DOM 级点击
  await sendBtns.nth(0).evaluate((el) => el.click());
  clicked = true;
} else {
  for (let i = 0; i < candCount; i++) {
    const b = sendBtns.nth(i);
    const visible = await b.isVisible();
    const enabled = visible && !(await b.isDisabled());
    if (enabled) {
      await b.evaluate((el) => el.click());
      clicked = true;
      break;
    }
  }
}
if (!clicked) throw new Error("发送键不可用，STOP");

let tailOk = false, stopOk = false, key = null, polls = 0;
const t0 = Date.now();
while (Date.now() - t0 < 120000) {
  polls++;
  const s = await page.evaluate(() => {
    const units = Array.from(document.querySelectorAll("[data-content-search-unit-key]")).map((u) => ({
      key: u.getAttribute("data-content-search-unit-key"), role: u.getAttribute("data-content-search-unit-role"),
    }));
    const stop = Array.from(document.querySelectorAll('button[aria-label="停止"], button[aria-label="Stop"], button[data-testid="stop-button"]'))
      .some((b) => b.getClientRects().length > 0);
    return { units, stop };
  });
  const tail = s.units[s.units.length - 1];
  if (!tailOk && tail && tail.role === "user" && !before.includes(tail.key)) { tailOk = true; key = tail.key; }
  if (tailOk && s.stop) stopOk = true;
  if (tailOk) break; // 已确认新 user unit；停止键观察另行记录
  await page.waitForTimeout(2000);
}
await page.screenshot({ path: `${OUT}/send-by-click.png` });
const result = { at: new Date().toISOString(), marker: MARKER, beforeUnitCount: before.length, polls, tailOk, stopOk, sentUserUnitKey: key, composerLen: text.length };
writeFileSync(`${OUT}/send-by-click-verify.json`, JSON.stringify(result, null, 2), "utf8");
console.log(JSON.stringify(result));
console.log(tailOk && key ? "SEND_CONFIRMED" : "SEND_UNCONFIRMED");
await browser.close();
