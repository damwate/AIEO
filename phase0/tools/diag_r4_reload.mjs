// 诊断（只读）：重新导航到会话页后观测渲染 unit 集合是否静态稳定（R4 recoll 虚拟化失败的缓解验证）。
// 不发送、不重发、不改采集算法；仅复用 inbound_dom.mjs 导出原语做观测。
import { chromium } from "playwright";
import { readDomWindow, scrollDomWindow } from "./inbound_dom.mjs";
import { acquireSessionLock } from "../e2e-poc/session_lock.mjs";

const CDP_URL = "http://127.0.0.1:9222";
const CONV_UUID = "6af8cab1-06bc-83ec-bcc8-712149e80e45";

function fmt(w) {
  return `units=[${w.units.map((u) => u.key).join(", ")}] at_bottom=${w.at_bottom} at_top=${w.at_top} scrollable=${w.scrollable}`;
}

const lock = acquireSessionLock({ holder: "diag_r4_reload" });
let browser;
try {
  browser = await chromium.connectOverCDP(CDP_URL);
  const ctx = browser.contexts()[0];
  if (!ctx) throw new Error("CDP 无浏览器上下文");
  let page = ctx.pages().find((p) => p.url().includes(CONV_UUID));
  if (!page) throw new Error("未找到已打开的会话页");

  await page.goto(`https://chatgpt.com/c/${CONV_UUID}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  // 静置等待：composer + 无停止按钮 + unit 已渲染（与 recoll 静置门同条件）
  const t0 = Date.now();
  let ready = false;
  while (Date.now() - t0 < 60000) {
    ready = await page.evaluate(() => {
      const composer = !!document.querySelector('[aria-label="询问 ChatGPT"], [aria-label="Ask ChatGPT"], #prompt-textarea');
      const units = document.querySelectorAll("[data-content-search-unit-key]").length;
      const stopCands = document.querySelectorAll(
        'button[aria-label="停止"], button[aria-label="Stop"], button[data-testid="stop-button"], form button[aria-label*="停止"], form button[aria-label*="Stop"]');
      let stopVisible = false;
      for (const el of stopCands) {
        if (el.offsetParent !== null || el.getClientRects().length > 0) {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) { stopVisible = true; break; }
        }
      }
      return { composer, units, stopVisible, ok: composer && units > 0 && !stopVisible };
    });
    if (ready.ok) break;
    await page.waitForTimeout(2000);
  }
  if (!ready.ok) throw new Error(`重载后静置门未通过: ${JSON.stringify(ready)}`);
  console.log(`[重载后静置门] 通过（units=${ready.units}）`);
  await page.waitForTimeout(10000);

  let current = await readDomWindow(page);
  console.log(`[初始] ${fmt(current)}`);

  // 上滚一轮：观测是否重物化历史 unit
  const m1 = await scrollDomWindow(page, -1);
  const up = await readDomWindow(page);
  console.log(`[上#1] ${fmt(up)}`);
  // 回到底部
  let down = 0;
  while (!up.at_bottom && down < 10) {
    await scrollDomWindow(page, 1);
    down += 1;
  }
  const bottom = await readDomWindow(page);
  console.log(`[回底] ${fmt(bottom)}`);
  // 再上再下各一次，看集合是否稳定
  await scrollDomWindow(page, -1);
  const up2 = await readDomWindow(page);
  console.log(`[上#2] ${fmt(up2)}`);
  while (!up2.at_bottom && down < 20) { await scrollDomWindow(page, 1); down += 1; }
  const bottom2 = await readDomWindow(page);
  console.log(`[回底2] ${fmt(bottom2)}`);
} finally {
  try { if (browser) await browser.close(); } catch {}
  lock.release();
  console.log("诊断完成，锁已释放");
}
