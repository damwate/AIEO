// 一次性诊断级提取：读取 fallback-turn-2:2:assistant 全文（采集器缺陷期间维持会议推进用）。
// 证据等级：DIAG（非正式链路）——正式链路修复后应重新采集闭合证据链。
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const CDP_URL = "http://127.0.0.1:9222";
const CONV_UUID = "6af858e4-7f74-83ec-860e-f360ab9484e2";
const TARGET_KEY = "fallback-turn-2:2:assistant";
const OUT_DIR = join(process.cwd(), "phase0", "logs", `diag-extract-${new Date().toISOString().replace(/[:.]/g, "-")}`);
mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.connectOverCDP(CDP_URL);
const ctx = browser.contexts()[0];
let page = ctx.pages().find((p) => p.url().includes(CONV_UUID));
if (!page) {
  page = await ctx.newPage();
  await page.goto(`https://chatgpt.com/c/${CONV_UUID}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(8000);
}

const text = await page.evaluate((key) => {
  const el = document.querySelector(`[data-content-search-unit-key="${key}"]`);
  return el ? el.innerText : null;
}, TARGET_KEY);
if (!text) throw new Error("目标 unit 不存在: " + TARGET_KEY);

await page.evaluate((key) => {
  document.querySelector(`[data-content-search-unit-key="${key}"]`)?.scrollIntoView({ block: "start" });
}, TARGET_KEY);
await page.waitForTimeout(1500);
await page.screenshot({ path: join(OUT_DIR, "reply-turn2.png"), fullPage: false });

// 完整性交叉证据：全页 unit 键清单 + 目标 unit 是否为页尾 assistant + 无停止按钮
const cross = await page.evaluate(() => {
  const keys = [...document.querySelectorAll("[data-content-search-unit-key]")].map((e) => e.getAttribute("data-content-search-unit-key"));
  const stopCands = document.querySelectorAll('button[aria-label="停止"], button[aria-label="Stop"], button[data-testid="stop-button"]');
  let stopVisible = false;
  for (const el of stopCands) {
    if (el.offsetParent !== null || el.getClientRects().length > 0) { stopVisible = true; break; }
  }
  return { keys, stopVisible };
});

writeFileSync(join(OUT_DIR, "reply.txt"), text, "utf8");
writeFileSync(join(OUT_DIR, "cross-evidence.json"), JSON.stringify({ target: TARGET_KEY, ...cross }, null, 2), "utf8");
console.log("EXTRACT_DIR=" + OUT_DIR);
console.log("BYTES=" + Buffer.byteLength(text, "utf8"));
console.log("CROSS=" + JSON.stringify(cross));
console.log("----REPLY----");
console.log(text);
