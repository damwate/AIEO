// 诊断：附件挂载后 Composer 表单实际文本 dump（只读不发送；沿 diag_composer 先例）。
// 背景：dispatch-2026-11-14T20-16-46 --attach s3-evidence-v1.zip 15s 内未见文件名 chip，fail-closed STOP。
// 本驱动回答：chip 是否出现？出现在哪个容器？form.innerText 为何不含文件名？
import { chromium } from "playwright";
import { basename } from "node:path";
import { acquireSessionLock } from "../e2e-poc/session_lock.mjs";

const CDP_URL = "http://127.0.0.1:9222";
const ATTACH = "basic/tasks/b-20261115-phasec-workflow-stats/acceptance/s3-evidence-v1.zip";
const FNAME = basename(ATTACH);

function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }

const lock = acquireSessionLock({ holder: "diag_attach_mount" });
log("会话锁已获取（诊断，只读）");
let browser;
try {
  browser = await chromium.connectOverCDP(CDP_URL, { timeout: 30000 });
  const ctx = browser.contexts()[0];
  if (!ctx) throw new Error("CDP 无浏览器上下文");
  const page = ctx.pages().find((p) => p.url().includes("chatgpt.com")) || ctx.pages()[0];
  if (!page) throw new Error("无 chatgpt.com 页面");
  log(`页面: ${page.url()}`);

  const composerLoc = page.locator('[aria-label="询问 ChatGPT"], [aria-label="Ask ChatGPT"], #prompt-textarea').filter({ visible: true }).first();
  await composerLoc.waitFor({ state: "visible", timeout: 10000 });

  const inputs = await page.locator('input[type="file"]').count();
  log(`页面 input[type=file] 数量: ${inputs}`);
  for (let i = 0; i < inputs; i++) {
    const info = await page.locator('input[type="file"]').nth(i).evaluate((el) => ({
      ariaLabel: el.getAttribute("aria-label"),
      accept: el.getAttribute("accept"),
      name: el.name,
    })).catch(() => null);
    log(`input#${i}: ${JSON.stringify(info)}`);
  }

  const fileInput = page.locator('input[aria-label="附加文件"]').first();
  await fileInput.setInputFiles(ATTACH);
  log("setInputFiles 已执行");

  const form = composerLoc.locator("xpath=ancestor::form").first();
  const t0 = Date.now();
  let found = null;
  while (Date.now() - t0 < 25000) {
    const formText = (await form.innerText().catch(() => "")) || "";
    if (formText.includes(FNAME)) { found = "form"; break; }
    const pageText = await page.evaluate(() => document.body.innerText);
    if (pageText.includes(FNAME)) { found = "page-body"; break; }
    await page.waitForTimeout(1000);
  }
  log(`chip 检测: ${found ?? "25s 未出现"}`);
  const formText = (await form.innerText().catch(() => "")) || "";
  log(`form.innerText(${formText.length} chars): ${JSON.stringify(formText.slice(0, 600))}`);
  // dump 含文件名的元素上下文
  const ctxInfo = await page.evaluate((fname) => {
    const hits = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const t = walker.currentNode.textContent || "";
      if (t.includes(fname)) {
        const el = walker.currentNode.parentElement;
        hits.push({
          tag: el?.tagName, cls: (el?.className || "").toString().slice(0, 80),
          text: t.slice(0, 120),
          inForm: !!el?.closest("form"),
        });
      }
    }
    return hits.slice(0, 5);
  }, FNAME).catch((e) => [{ error: String(e) }]);
  log(`含文件名元素: ${JSON.stringify(ctxInfo)}`);
} finally {
  if (browser) await browser.close().catch(() => {});
  lock.release();
  log("会话锁已释放（诊断结束，未发送任何内容）");
}
