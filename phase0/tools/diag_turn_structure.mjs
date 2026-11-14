// 一次性诊断：截图 + 导出会话页 unit 轮廓（诊断 turn-2:1 缺位原因），只读不改页面状态。
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const CDP_URL = "http://127.0.0.1:9222";
const CONV_UUID = "6af858e4-7f74-83ec-860e-f360ab9484e2";
const OUT_DIR = join(process.cwd(), "phase0", "logs", `diag-${new Date().toISOString().replace(/[:.]/g, "-")}`);
mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.connectOverCDP(CDP_URL);
const ctx = browser.contexts()[0];
let page = ctx.pages().find((p) => p.url().includes(CONV_UUID));
if (!page) {
  page = await ctx.newPage();
  await page.goto(`https://chatgpt.com/c/${CONV_UUID}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(8000);
}
await page.screenshot({ path: join(OUT_DIR, "viewport.png"), fullPage: false });

const outline = await page.evaluate(() => {
  const units = [...document.querySelectorAll("[data-content-search-unit-key]")].map((el) => ({
    key: el.getAttribute("data-content-search-unit-key"),
    role: el.getAttribute("data-message-author-role") || null,
    tag: el.tagName,
    text: (el.innerText || "").slice(0, 120).replace(/\s+/g, " "),
    childUnitCount: el.querySelectorAll("[data-content-search-unit-key]").length,
  }));
  // 找 turn 容器：user turn-2 前后的兄弟节点，识别未打键的中间块
  const sent = document.querySelector('[data-content-search-unit-key="fallback-turn-2:0:user"]');
  let between = [];
  if (sent) {
    let el = sent.parentElement;
    let turn = null;
    while (el && el !== document.body) {
      if (/turn/i.test(el.getAttribute("data-testid") || "") || el.getAttribute("data-turn-id")) { turn = el; break; }
      el = el.parentElement;
    }
    if (turn) {
      between = [...turn.querySelectorAll(":scope > *")].map((c) => ({
        tag: c.tagName,
        testid: c.getAttribute("data-testid") || null,
        unitKey: c.querySelector("[data-content-search-unit-key]")?.getAttribute("data-content-search-unit-key") || null,
        text: (c.innerText || "").slice(0, 100).replace(/\s+/g, " "),
      }));
    }
  }
  return { units, turnChildren: between };
});
writeFileSync(join(OUT_DIR, "outline.json"), JSON.stringify(outline, null, 2), "utf8");
console.log("DIAG_DIR=" + OUT_DIR);
console.log(JSON.stringify(outline, null, 1).slice(0, 3000));
await browser.close();
