// 诊断：ChatGPT 新聊天页 Composer DOM 实况（只读，不输入不发送）
import { chromium } from "playwright";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222", { timeout: 30000 });
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes("chatgpt.com")) || ctx.pages()[0];
console.log("page url:", page.url());

const info = await page.evaluate(() => {
  const out = { candidates: [], promptTextarea: null, askLabels: [] };
  // 1) 枚举所有潜在输入元素
  const els = document.querySelectorAll('textarea, [contenteditable="true"], [contenteditable="plaintext-only"], #prompt-textarea');
  for (const el of els) {
    const r = el.getBoundingClientRect();
    const visible = r.width > 0 && r.height > 0;
    out.candidates.push({
      tag: el.tagName,
      id: el.id || null,
      ariaLabel: el.getAttribute("aria-label") || null,
      testid: el.getAttribute("data-testid") || null,
      placeholder: el.getAttribute("placeholder") || null,
      visible,
      rect: visible ? { w: Math.round(r.width), h: Math.round(r.height) } : null,
      innerTextJSON: JSON.stringify((el.innerText || "").slice(0, 80)),
      textLen: (el.innerText || "").length,
      isContentEditable: el.isContentEditable,
    });
  }
  // 2) aria-label 含 Ask/询问 的所有元素
  for (const el of document.querySelectorAll('[aria-label]')) {
    const lb = el.getAttribute("aria-label") || "";
    if (/ask|询问/i.test(lb)) out.askLabels.push({ tag: el.tagName, label: lb, visible: el.getBoundingClientRect().width > 0 });
  }
  return out;
});

console.log(JSON.stringify(info, null, 2));
await browser.close();
