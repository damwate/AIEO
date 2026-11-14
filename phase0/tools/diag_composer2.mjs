// 诊断2：dump Composer 全文并与简报原文对比（只读）
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222", { timeout: 30000 });
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes("chatgpt.com")) || ctx.pages()[0];

const composerText = await page.evaluate(() => {
  const el = document.querySelector('[aria-label="询问 ChatGPT"], [aria-label="Ask ChatGPT"], #prompt-textarea');
  return el ? el.innerText : null;
});

const src = readFileSync("D:/AIEO/phase0/tools/taskpack-checker-s2-reverify-r3b.txt", "utf-8");
const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
console.log("composer len:", composerText ? composerText.length : "null");
console.log("source len:", src.length, "bytes:", Buffer.byteLength(src, "utf-8"));
console.log("normalized equal:", norm(composerText) === norm(src));
if (norm(composerText) !== norm(src)) {
  const a = norm(composerText), b = norm(src);
  let i = 0;
  while (i < Math.min(a.length, b.length) && a[i] === b[i]) i++;
  console.log("first diff at index", i);
  console.log("composer around:", JSON.stringify(a.slice(Math.max(0, i - 30), i + 60)));
  console.log("source   around:", JSON.stringify(b.slice(Math.max(0, i - 30), i + 60)));
  console.log("composer tail:", JSON.stringify(a.slice(-120)));
  console.log("source   tail:", JSON.stringify(b.slice(-120)));
}
// 逐段结构（#30：contenteditable 顶层 <p> 逐段读取）
const paras = await page.evaluate(() => {
  const el = document.querySelector('[aria-label="询问 ChatGPT"], [aria-label="Ask ChatGPT"], #prompt-textarea');
  if (!el) return null;
  const ps = el.querySelectorAll(":scope > p, :scope > div");
  return Array.from(ps).map((p) => JSON.stringify(p.innerText));
});
console.log("top-level blocks:", paras ? paras.length : 0);
if (paras) console.log(paras.slice(0, 6).join("\n"));
await browser.close();
