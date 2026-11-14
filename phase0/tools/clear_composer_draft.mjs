// 清空 Composer 残留草稿 v2：focus + execCommand selectAll/delete（键入侧 execCommand 在本页实测有效）
import { chromium } from "playwright";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222", { timeout: 30000 });
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes("chatgpt.com")) || ctx.pages()[0];

const loc = page.locator('[aria-label="询问 ChatGPT"], [aria-label="Ask ChatGPT"], #prompt-textarea').filter({ visible: true }).first();
await loc.waitFor({ state: "visible", timeout: 10000 });
const before = ((await loc.innerText()) || "").trim();
console.log("before len:", before.length);
if (before.length === 0) {
  console.log("composer already empty");
} else {
  if (!before.startsWith("【AIEO·S2复验R3补验】")) {
    console.log("OWNERSHIP_UNPROVEN, not touching");
    process.exit(2);
  }
  await loc.click();
  await loc.focus();
  await page.waitForTimeout(300);
  const ok = await page.evaluate(() => {
    const sel = document.getSelection();
    if (!sel) return "no-selection-api";
    const editor = document.querySelector('[aria-label="询问 ChatGPT"], [aria-label="Ask ChatGPT"], #prompt-textarea');
    if (!editor) return "no-editor";
    // 把选区设在编辑器内再全选删除
    sel.removeAllRanges();
    const range = document.createRange();
    range.selectNodeContents(editor);
    sel.addRange(range);
    const d1 = document.execCommand("delete", false, null);
    return "delete-executed:" + d1;
  });
  console.log("exec result:", ok);
  await page.waitForTimeout(500);
  const after = ((await loc.innerText()) || "").trim();
  console.log("after len:", after.length, JSON.stringify(after.slice(0, 20)));
  console.log(after.length === 0 || after === "\n" ? "COMPOSER_CLEARED" : "NOT_CLEARED");
}
await browser.close();
