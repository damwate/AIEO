// 诊断（只读）：复现 readReplySnapshot 的滚动路径，逐步记录渲染 unit 集合变化，
// 定位 R4 recoll INBOUND_WINDOW_COMPLETENESS_UNPROVEN 的集合变化发生在哪一步。
// 不发送、不重发、不修改任何采集算法；仅调用 inbound_dom.mjs 已导出的 readDomWindow/scrollDomWindow。
import { chromium } from "playwright";
import { readDomWindow, scrollDomWindow } from "./inbound_dom.mjs";
import { acquireSessionLock } from "../e2e-poc/session_lock.mjs";

const CDP_URL = "http://127.0.0.1:9222";
const CONV_UUID = "6af8cab1-06bc-83ec-bcc8-712149e80e45";
const START_KEY = "fallback-turn-3:0:user";

function fmt(w) {
  return `units=[${w.units.map((u) => u.key).join(", ")}] at_bottom=${w.at_bottom} at_top=${w.at_top} scrollable=${w.scrollable}`;
}

const lock = acquireSessionLock({ holder: "diag_r4_virtualization" });
let browser;
try {
  browser = await chromium.connectOverCDP(CDP_URL);
  const ctx = browser.contexts()[0];
  if (!ctx) throw new Error("CDP 无浏览器上下文");
  const page = ctx.pages().find((p) => p.url().includes(CONV_UUID));
  if (!page) throw new Error("未找到已打开的会话页");
  console.log(`页面: ${page.url()}`);

  let current = await readDomWindow(page);
  console.log(`[初始] ${fmt(current)}`);

  // 复现搜索段：向上滚动直到 (startFound && (!at_bottom || !scrollable))
  let transitions = 0;
  let startFound = current.units.some((u) => u.key === START_KEY && u.role === "user");
  console.log(`[搜索] startFound=${startFound}`);
  while (!(startFound && (!current.at_bottom || !current.scrollable))) {
    if (current.at_top) throw new Error("到顶部仍未满足 break 条件");
    const moved = await scrollDomWindow(page, -1);
    transitions += 1;
    const prev = current;
    current = await readDomWindow(page);
    const prevKeys = new Set(prev.units.map((u) => u.key));
    const curKeys = new Set(current.units.map((u) => u.key));
    const changed = prevKeys.size !== curKeys.size ||
      [...prevKeys].some((k) => !curKeys.has(k)) || [...curKeys].some((k) => !prevKeys.has(k));
    console.log(`[搜索-上#${transitions}] ${fmt(current)} 集合变化=${changed}`);
    startFound = current.units.some((u) => u.key === START_KEY && u.role === "user");
    if (moved.before === moved.after) { console.log("[搜索-上] 无位移"); break; }
  }
  console.log(`[搜索结束] break 位置: ${fmt(current)} startFound=${startFound}`);

  // 复现采集段：向下滚动直到 at_bottom，逐步记录集合
  let step = 0;
  while (!current.at_bottom) {
    const moved = await scrollDomWindow(page, 1);
    step += 1;
    const prev = current;
    current = await readDomWindow(page);
    const prevKeys = new Set(prev.units.map((u) => u.key));
    const curKeys = new Set(current.units.map((u) => u.key));
    const changed = prevKeys.size !== curKeys.size ||
      [...prevKeys].some((k) => !curKeys.has(k)) || [...curKeys].some((k) => !prevKeys.has(k));
    console.log(`[采集-下#${step}] ${fmt(current)} 集合变化=${changed}${changed ? ` 消失=[${[...prevKeys].filter((k) => !curKeys.has(k))}] 新增=[${[...curKeys].filter((k) => !prevKeys.has(k))}]` : ""}`);
    if (moved.before === moved.after) { console.log("[采集-下] 无位移"); break; }
  }
  console.log(`[最终] ${fmt(current)}`);

  // 附加观测：底部单元文本长度（判断 R4 回复规模）
  const info = await page.evaluate(() => {
    const els = [...document.querySelectorAll("[data-content-search-unit-key]")];
    return els.map((el) => ({
      key: el.getAttribute("data-content-search-unit-key"),
      textLen: (el.innerText || "").length,
      rectTop: Math.round(el.getBoundingClientRect().top),
      rectH: Math.round(el.getBoundingClientRect().height),
    }));
  });
  console.log("[底部单元几何]", JSON.stringify(info, null, 1));
  const scroll = await page.evaluate(() => ({
    scrollHeight: document.scrollingElement?.scrollHeight ?? document.documentElement.scrollHeight,
    clientHeight: document.scrollingElement?.clientHeight ?? document.documentElement.clientHeight,
    scrollTop: document.scrollingElement?.scrollTop ?? document.documentElement.scrollTop,
  }));
  console.log("[滚动几何]", JSON.stringify(scroll));
} finally {
  try { if (browser) await browser.close(); } catch {}
  lock.release();
  console.log("诊断完成，锁已释放");
}
