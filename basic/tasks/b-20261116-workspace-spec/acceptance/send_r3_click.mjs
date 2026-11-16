// R3 一次性提交：草稿已在 Composer（547 字，本任务 R3 简报），点击发送键并做发送双验
// 严格前置：仅当 Composer 内容含 R3 标记且长度=547 才发送；否则 STOP（不触碰无主草稿）
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const CDP = "http://127.0.0.1:9222";
const MARKER = "【S1-R3 收尾确认】";
const EXPECT_LEN = 547;
const OUT = "D:/AIEO/phase0/logs/dispatch-2026-11-16T08-40-08";

const browser = await chromium.connectOverCDP(CDP, { timeout: 30000 });
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes("chatgpt.com"));
if (!page) throw new Error("无 chatgpt 页");

const composerSel = '[aria-label="询问 ChatGPT"], [aria-label="Ask ChatGPT"], #prompt-textarea';
const text = await page.evaluate((sel) => {
  const el = document.querySelector(sel);
  return el ? (el.innerText || "") : "";
}, composerSel);
if (!text.includes(MARKER)) throw new Error(`草稿非本轮 R3（缺标记），STOP：len=${text.length}`);
if (text.length !== EXPECT_LEN) throw new Error(`草稿长度异常 ${text.length}≠${EXPECT_LEN}，STOP`);

const before = await page.evaluate(() =>
  Array.from(document.querySelectorAll("[data-content-search-unit-key]")).map((u) => u.getAttribute("data-content-search-unit-key")));
const sendBtn = page.locator('form button[aria-label*="发送"], form button[aria-label*="Send"], button[data-testid="send-button"]').first();
await sendBtn.waitFor({ state: "visible", timeout: 10000 });
const clickable = await sendBtn.evaluate((el) => !el.disabled && el.getAttribute("aria-disabled") !== "true");
if (!clickable) throw new Error("发送键不可用，STOP");

await sendBtn.click();

let tailOk = false, stopOk = false, key = null, polls = 0;
const t0 = Date.now();
while (Date.now() - t0 < 30000) {
  polls++;
  const s = await page.evaluate(() => {
    const units = Array.from(document.querySelectorAll("[data-content-search-unit-key]")).map((u) => ({
      key: u.getAttribute("data-content-search-unit-key"),
      role: u.getAttribute("data-content-search-unit-role"),
    }));
    const stop = Array.from(document.querySelectorAll('button[aria-label="停止"], button[aria-label="Stop"], button[data-testid="stop-button"]'))
      .some((b) => b.getClientRects().length > 0);
    return { units, stop };
  });
  const tail = s.units[s.units.length - 1];
  if (!tailOk && tail && tail.role === "user" && !before.includes(tail.key)) { tailOk = true; key = tail.key; }
  if (tailOk && s.stop) stopOk = true;
  if (tailOk && stopOk) break;
  await page.waitForTimeout(1000);
}
await page.screenshot({ path: `${OUT}/r3-sent-click.png` });
const result = { at: new Date().toISOString(), beforeUnitCount: before.length, polls, tailOk, stopOk, sentUserUnitKey: key, composerLen: text.length };
writeFileSync(`${OUT}/r3-send-double-verify.json`, JSON.stringify(result, null, 2), "utf8");
console.log(JSON.stringify(result));
if (!(tailOk && stopOk && key)) { console.log("SEND_DOUBLE_VERIFY_FAILED"); process.exitCode = 1; } else console.log("SEND_DOUBLE_VERIFY_OK");
await browser.close();
