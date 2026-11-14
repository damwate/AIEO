// 诊断（只读）：设备度量覆盖拉高视口，验证全对话能否在单一视口内完整物化（非虚拟化静态 DOM）。
// 对应 INBOUND_WINDOW_COMPLETENESS_UNPROVEN 自带 remediation「在非虚拟化静态 DOM 上重新读取」的可行性验证。
// 不发送、不重发、不改采集算法；结束后清除覆盖恢复原视口。
import { chromium } from "playwright";
import { readDomWindow, scrollDomWindow } from "./inbound_dom.mjs";
import { acquireSessionLock } from "../e2e-poc/session_lock.mjs";

const CDP_URL = "http://127.0.0.1:9222";
const CONV_UUID = "6af8cab1-06bc-83ec-bcc8-712149e80e45";

function fmt(w) {
  return `units=[${w.units.map((u) => u.key).join(", ")}] at_bottom=${w.at_bottom} at_top=${w.at_top} scrollable=${w.scrollable} scrollH=${w.scroll_height} clientH=${w.client_height}`;
}

const lock = acquireSessionLock({ holder: "diag_r4_static" });
let browser;
try {
  browser = await chromium.connectOverCDP(CDP_URL);
  const ctx = browser.contexts()[0];
  if (!ctx) throw new Error("CDP 无浏览器上下文");
  const page = ctx.pages().find((p) => p.url().includes(CONV_UUID));
  if (!page) throw new Error("未找到已打开的会话页");

  const vp = await page.evaluate(() => ({
    w: window.innerWidth,
    h: window.innerHeight,
    dpr: window.devicePixelRatio,
  }));
  console.log(`[当前视口] ${JSON.stringify(vp)}`);

  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Page.setDeviceMetricsOverride", {
    width: vp.w,
    height: 20000,
    deviceScaleFactor: vp.dpr || 1,
    mobile: false,
  });
  try {
    await page.waitForTimeout(8000);
    let current = await readDomWindow(page);
    console.log(`[覆盖后初始] ${fmt(current)}`);

    // 稳定性观测：上滚→回底→再上→再回底（若不可滚动则原语无位移）
    for (let i = 1; i <= 2; i += 1) {
      await scrollDomWindow(page, -1);
      const up = await readDomWindow(page);
      console.log(`[上#${i}] ${fmt(up)}`);
      let d = 0;
      while (!up.at_bottom && d < 5) { await scrollDomWindow(page, 1); d += 1; }
      const bottom = await readDomWindow(page);
      console.log(`[回底#${i}] ${fmt(bottom)}`);
    }

    // 全部 unit 的文本长度（确认完整对话内容量）
    const info = await page.evaluate(() =>
      [...document.querySelectorAll("[data-content-search-unit-key]")].map((el) => ({
        key: el.getAttribute("data-content-search-unit-key"),
        textLen: (el.innerText || "").length,
      })));
    console.log("[单元清单]", JSON.stringify(info));
  } finally {
    await cdp.send("Page.clearDeviceMetricsOverride");
    await page.waitForTimeout(2000);
    const after = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
    console.log(`[覆盖已清除，恢复视口] ${JSON.stringify(after)}`);
  }
} finally {
  try { if (browser) await browser.close(); } catch {}
  lock.release();
  console.log("诊断完成，锁已释放");
}
