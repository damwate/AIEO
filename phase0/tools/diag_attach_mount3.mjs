// 诊断3：附件挂载——路径A "+"按钮菜单点击后真实 input；路径B composer paste 事件（只读不发送）。
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { acquireSessionLock } from "../e2e-poc/session_lock.mjs";

const CDP_URL = "http://127.0.0.1:9222";
const ATTACH = "basic/tasks/b-20261115-phasec-workflow-stats/acceptance/s3-evidence-v1.zip";
const FNAME = basename(ATTACH);
const B64 = readFileSync(ATTACH).toString("base64");

function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }

const lock = acquireSessionLock({ holder: "diag_attach_mount3" });
log("会话锁已获取（诊断3，只读不发送）");
let browser;
try {
  browser = await chromium.connectOverCDP(CDP_URL, { timeout: 30000 });
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find((p) => p.url().includes("chatgpt.com")) || ctx.pages()[0];
  log(`页面: ${page.url()}`);
  const composerLoc = page.locator('[aria-label="询问 ChatGPT"], [aria-label="Ask ChatGPT"], #prompt-textarea').filter({ visible: true }).first();
  await composerLoc.waitFor({ state: "visible", timeout: 10000 });
  const form = composerLoc.locator("xpath=ancestor::form").first();

  const chipFound = async () => {
    const formText = (await form.innerText().catch(() => "")) || "";
    if (formText.includes(FNAME)) return "form";
    const pageText = await page.evaluate(() => document.body.innerText);
    return pageText.includes(FNAME) ? "page-body" : null;
  };

  // 路径B：paste 事件（先试，不改变 UI 状态）
  await page.evaluate(({ b64, fname }) => {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const file = new File([bytes], fname, { type: "application/zip" });
    const dt = new DataTransfer();
    dt.items.add(file);
    const composer = document.querySelector('[aria-label="询问 ChatGPT"], [aria-label="Ask ChatGPT"], #prompt-textarea');
    const ev = new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: dt });
    composer.dispatchEvent(ev);
  }, { b64: B64, fname: FNAME });
  log("paste 事件已派发");
  let t0 = Date.now(); let found = null;
  while (Date.now() - t0 < 15000) { found = await chipFound(); if (found) break; await page.waitForTimeout(1000); }
  log(`路径B paste: ${found ?? "15s 未出现"}`);

  // 路径A：点击 "+" 按钮展开菜单 → 点击"添加文件"类菜单项 → 真实 input
  if (!found) {
    const btnAudit = await page.evaluate(() => {
      const composer = document.querySelector('[aria-label="询问 ChatGPT"], [aria-label="Ask ChatGPT"], #prompt-textarea');
      const form = composer?.closest("form");
      if (!form) return [];
      return Array.from(form.querySelectorAll('button')).map((b, i) => ({
        i, aria: b.getAttribute("aria-label"), testid: b.getAttribute("data-testid"),
        text: (b.innerText || "").slice(0, 20), visible: !!(b.offsetParent || b.getClientRects().length),
      }));
    });
    log(`form 内按钮: ${JSON.stringify(btnAudit)}`);
    // 找 "+"（无 aria 或 aria 含 附加/添加）按钮点击
    const plus = page.locator('form button').filter({ hasNot: page.locator("textarea") }).filter({
      matches: undefined,
    });
    // 用选择器直接找可能的出现按钮
    for (const sel of ['form button[data-testid="composer-plus-btn"]', 'form button[aria-label*="附加"]', 'form button[aria-label*="添加"]', 'form button[aria-label*="Attach"]']) {
      const loc = page.locator(sel).first();
      if (await loc.count() && await loc.isVisible().catch(() => false)) {
        log(`点击候选: ${sel}`);
        await loc.click();
        await page.waitForTimeout(1200);
        break;
      }
    }
    // 菜单出现后找"添加文件"菜单项
    const menuAudit = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('[role="menuitem"], [role="menu"] button, [id^="radix-"] [role="menuitem"]'));
      return items.map((m) => ({ text: (m.innerText || "").slice(0, 24), visible: !!(m.offsetParent || m.getClientRects().length) })).filter((x) => x.visible);
    });
    log(`菜单项: ${JSON.stringify(menuAudit)}`);
    const menuItem = page.locator('[role="menuitem"]').filter({ hasText: /添加文件|上传文件|Add file|Upload|附件|文件/ }).first();
    if (await menuItem.count()) {
      log("点击菜单项（将打开真实文件对话框监听）");
      await menuItem.click();
      await page.waitForTimeout(800);
      // 菜单点击后新增/激活的 file input
      const inputs2 = await page.evaluate(() => Array.from(document.querySelectorAll('input[type="file"]')).map((el, i) => ({ i, aria: el.getAttribute("aria-label"), visible: !!(el.offsetParent || el.getClientRects().length), display: getComputedStyle(el).display })));
      log(`菜单后 input 审计: ${JSON.stringify(inputs2)}`);
      const live = page.locator('input[type="file"]').filter({ visible: false }).last(); // 模板件仍是 hidden，尝试逐个 set
      // 对 aria=附加文件 的 input 重新 set（菜单激活后可能已换绑）
      const fi = page.locator('input[aria-label="附加文件"]').last();
      await fi.setInputFiles(ATTACH).catch((e) => log(`setInputFiles 失败: ${String(e).slice(0, 120)}`));
      t0 = Date.now(); found = null;
      while (Date.now() - t0 < 15000) { found = await chipFound(); if (found) break; await page.waitForTimeout(1000); }
      log(`路径A 菜单+setInputFiles: ${found ?? "15s 未出现"}`);
    } else {
      log("未找到文件菜单项");
    }
  }
  if (found) log(`成功路径=${found}（下一步可改造派单工具；本次未发送）`);
  else log("两条路径均未挂载（本次未发送）");
} finally {
  if (browser) await browser.close().catch(() => {});
  lock.release();
  log("会话锁已释放（诊断3结束）");
}
