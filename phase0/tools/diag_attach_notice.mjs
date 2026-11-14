// 诊断4：dump 附件限制告警文本（只读）
import { chromium } from "playwright";
import { acquireSessionLock } from "../e2e-poc/session_lock.mjs";

const lock = acquireSessionLock({ holder: "diag_attach_notice" });
log("会话锁已获取（诊断4，只读）");
let browser;
try {
  browser = await chromium.connectOverCDP("http://127.0.0.1:9222", { timeout: 30000 });
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find((p) => p.url().includes("chatgpt.com")) || ctx.pages()[0];
  const info = await page.evaluate(() => {
    const composer = document.querySelector('[aria-label="询问 ChatGPT"], [aria-label="Ask ChatGPT"], #prompt-textarea');
    const form = composer?.closest("form");
    const btns = Array.from(form?.querySelectorAll("button") || []);
    const closeNotice = btns.find((b) => (b.getAttribute("aria-label") || "").includes("关闭文件附件"));
    let noticeText = null;
    if (closeNotice) {
      let n = closeNotice.parentElement;
      for (let k = 0; k < 4 && n; k++) {
        const t = (n.innerText || "").trim();
        if (t.length > 10) { noticeText = t.slice(0, 300); break; }
        n = n.parentElement;
      }
    }
    return { noticeText, formText: (form?.innerText || "").slice(0, 500) };
  });
  log(JSON.stringify(info, null, 1));
} finally {
  if (browser) await browser.close().catch(() => {});
  lock.release();
  log("会话锁已释放（诊断4结束）");
}

function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }
