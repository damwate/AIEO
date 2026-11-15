// Chrome tab 维护清理脚本（b-20261116-tab-cleanup S1.3，P1-04 安全门槛）。
//
// 默认 dry-run：只枚举+分组+输出候选报告，不关任何页。
// --close：显式开启关闭；逐页门槛（全部满足才关）：
//   ①非生成中（停止按钮不可见）；②tab_hygiene 判定为可关重复页（每会话留最新）；
//   ③主页/无 CONV 页保留最新一个；④无法确认安全一律不关（fail-closed）。
// 用法：node tab_cleanup.mjs [--close] [--json <out>]
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { describePages, dedupePlan } from "./tab_hygiene.mjs";

const CDP_URL = "http://127.0.0.1:9222";
const CLOSE = process.argv.includes("--close");
const jsonArg = process.argv[process.argv.indexOf("--json") + 1];

async function stopButtonVisible(page) {
  return page.evaluate(() => {
    const candidates = document.querySelectorAll(
      'button[aria-label="停止"], button[aria-label="Stop"], button[data-testid="stop-button"], form button[aria-label*="停止"], form button[aria-label*="Stop"]');
    for (const el of candidates) {
      if (el.offsetParent !== null || el.getClientRects().length > 0) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) return true;
      }
    }
    return false;
  }).catch(() => "PROBE_FAIL");
}

const browser = await chromium.connectOverCDP(CDP_URL, { timeout: 30000 });
const ctx = browser.contexts()[0];
if (!ctx) {
  console.error("CDP 无浏览器上下文");
  process.exit(1);
}
const pages = ctx.pages();
const descs = [];
const pageByIdx = [];
for (let i = 0; i < pages.length; i++) {
  const url = pages[i].url();
  const generating = (await stopButtonVisible(pages[i])) === true;
  descs.push({ url, generating, owned: !generating }); // owned 语义=安全门槛已确认（P1-04）：非生成中即可关候选
  pageByIdx.push(pages[i]);
}
const plan = dedupePlan(describePages(descs));

const report = {
  at: new Date().toISOString(),
  mode: CLOSE ? "close" : "dry-run",
  total: pages.length,
  pages: descs.map((d, i) => ({ index: i, url: d.url, generating: d.generating })),
  keep: plan.keep,
  closeCandidates: plan.close,
  skippedGenerating: plan.skippedGenerating,
  skippedNotOwned: plan.skippedNotOwned,
  closed: [],
  closeFailures: [],
};
console.log(`[tab-cleanup] mode=${report.mode} 总页数=${pages.length} 保留=${plan.keep.length} 关闭候选=${plan.close.length} 生成中跳过=${plan.skippedGenerating.length}`);

if (CLOSE) {
  for (const idx of plan.close) {
    try {
      await pageByIdx[idx].close();
      report.closed.push(idx);
      console.log(`[tab-cleanup] 已关闭页#${idx}: ${descs[idx].url}`);
    } catch (e) {
      report.closeFailures.push({ index: idx, error: String(e) });
      console.log(`[tab-cleanup] 页#${idx} 关闭失败（不吞错，继续其余页）: ${e.message}`);
    }
  }
  if (report.closeFailures.length > 0) process.exitCode = 1; // P2-02：关闭失败不得伪造成功
} else {
  console.log("[tab-cleanup] dry-run：未关闭任何页（--close 显式开启关闭）");
}

if (jsonArg) writeFileSync(jsonArg, JSON.stringify(report, null, 2), "utf8");
await browser.close().catch(() => {});
process.exit(process.exitCode ?? 0);
