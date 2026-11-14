// 诊断2：附件挂载——4 个 file input 归属审计 + DataTransfer drop 替代路径（只读不发送）。
// 背景：diag_attach_mount 证实 setInputFiles 落在 input[aria-label=附加文件] 上但 UI 零反应。
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { acquireSessionLock } from "../e2e-poc/session_lock.mjs";

const CDP_URL = "http://127.0.0.1:9222";
const ATTACH = "basic/tasks/b-20261115-phasec-workflow-stats/acceptance/s3-evidence-v1.zip";
const FNAME = basename(ATTACH);
const B64 = readFileSync(ATTACH).toString("base64");

function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }

const lock = acquireSessionLock({ holder: "diag_attach_mount2" });
log("会话锁已获取（诊断2，只读）");
let browser;
try {
  browser = await chromium.connectOverCDP(CDP_URL, { timeout: 30000 });
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find((p) => p.url().includes("chatgpt.com")) || ctx.pages()[0];
  log(`页面: ${page.url()}`);

  // (a) 逐 input 审计：可见性 + 是否在 form 内 + 位置
  const audit = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('input[type="file"]')).map((el, i) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      let label = null;
      const form = el.closest("form");
      return {
        i,
        aria: el.getAttribute("aria-label"),
        inForm: !!form,
        visible: !!(el.offsetParent || el.getClientRects().length),
        display: cs.display, rect: `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`,
      };
    });
  });
  log(`input 审计: ${JSON.stringify(audit)}`);

  // (b) DataTransfer drop 到 composer 容器
  const composerLoc = page.locator('[aria-label="询问 ChatGPT"], [aria-label="Ask ChatGPT"], #prompt-textarea').filter({ visible: true }).first();
  await composerLoc.waitFor({ state: "visible", timeout: 10000 });
  const form = composerLoc.locator("xpath=ancestor::form").first();
  const dropTarget = await composerLoc.evaluate((el) => {
    // 向上找 5 层内可接收 drop 的容器
    let node = el;
    for (let k = 0; k < 5 && node; k++) {
      if (node.tagName === "FORM" || (node.dataset && node.dataset.testid)) return node;
      node = node.parentElement;
    }
    return el.closest("form") || el.parentElement;
  }, ).catch(() => null);
  log(`drop 目标: ${dropTarget ? "form/容器" : "composer 本体"}`);

  await page.evaluate(({ b64, fname, tagName }) => {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const file = new File([bytes], fname, { type: "application/zip" });
    const dt = new DataTransfer();
    dt.items.add(file);
    const target = document.querySelector(tagName) ; // 占位，下面用 drop 事件绑定
    const composer = document.querySelector('[aria-label="询问 ChatGPT"], [aria-label="Ask ChatGPT"], #prompt-textarea');
    let node = composer;
    for (let k = 0; k < 5 && node; k++) {
      if (node.tagName === "FORM") break;
      node = node.parentElement;
    }
    const dest = node || composer.parentElement;
    for (const type of ["dragenter", "dragover", "drop"]) {
      dest.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
    }
  }, { b64: B64, fname: FNAME, tagName: "form" });
  log("drop 事件已派发");

  const t0 = Date.now();
  let found = null;
  while (Date.now() - t0 < 20000) {
    const formText = (await form.innerText().catch(() => "")) || "";
    if (formText.includes(FNAME)) { found = "form"; break; }
    const pageText = await page.evaluate(() => document.body.innerText);
    if (pageText.includes(FNAME)) { found = "page-body"; break; }
    await page.waitForTimeout(1000);
  }
  log(`chip 检测（drop 路径）: ${found ?? "20s 未出现"}`);
  if (found) {
    const formText = (await form.innerText().catch(() => "")) || "";
    log(`form.innerText: ${JSON.stringify(formText.slice(0, 400))}`);
  }
} finally {
  if (browser) await browser.close().catch(() => {});
  lock.release();
  log("会话锁已释放（诊断2结束，未发送任何内容）");
}
