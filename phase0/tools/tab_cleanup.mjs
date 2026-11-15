// Chrome tab 维护清理脚本（b-20261116-tab-cleanup S1.3，P1-04 安全门槛；S4-R1 P1-02 整改）。
//
// 默认 dry-run：只枚举+分组+输出候选报告，不关任何页。
// --close：显式开启关闭，且须先取得会话锁（任何自动化在途即拒绝——归属安全门槛）；
//   逐页门槛（全部满足才关）：
//   ①停止按钮探测明确返回 false（生成中/探测失败一律不关——fail-closed）；
//   ②tab_hygiene 判定为可关重复页（每会话留最新）；
//   ③主页/无 CONV 页保留最新一个；
//   ④无法确认安全一律不关（skippedNotOwned/skippedGenerating 如实报告）。
// 用法：node tab_cleanup.mjs [--close] [--json <out>]
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { describePages, dedupePlan } from "./tab_hygiene.mjs";
import { acquireSessionLock } from "../e2e-poc/session_lock.mjs";

const CDP_URL = "http://127.0.0.1:9222";
const CLOSE = process.argv.includes("--close");
const jsonArg = process.argv[process.argv.indexOf("--json") + 1];

async function stopButtonVisible(page) {
  // 三态：true=生成中；false=探测成功且非生成中；"PROBE_FAIL"=探测失败（fail-closed）
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

async function targetIdList() {
  try {
    const r = await fetch(`${CDP_URL}/json`);
    const tabs = await r.json();
    return tabs.filter((t) => t.type === "page").map((t) => ({ id: t.id, url: t.url }));
  } catch {
    return { error: "CDP_UNREACHABLE" };
  }
}

// S4-R2 P1-02：--close 时会话锁必须覆盖"枚举→判定→关闭"全程（probe-then-release 存在
// 并发竞态：锁释放后、关闭前自动化可能取得锁）。锁在 finally 释放；dry-run 只读不需要锁。
let sessionLock = null;
if (CLOSE) {
  try {
    sessionLock = acquireSessionLock({ holder: "tab_cleanup" });
    console.log("[tab-cleanup] 会话锁已获取（覆盖枚举→判定→关闭全程）");
  } catch (e) {
    console.error(`[tab-cleanup] --close 拒绝：会话锁被持有（自动化可能在途，fail-closed）: ${e.message}`);
    process.exit(1);
  }
}

let browser = null;
try {
  browser = await chromium.connectOverCDP(CDP_URL, { timeout: 30000 });
  const ctx = browser.contexts()[0];
  if (!ctx) {
    console.error("CDP 无浏览器上下文");
    process.exit(1);
  }
  const pages = ctx.pages();
  const descs = [];
  const pageByIdx = [];
  for (let i = 0; i < pages.length; i++) {
    const probe = await stopButtonVisible(pages[i]);
    descs.push({
      url: pages[i].url(),
      generating: probe === true,      // 仅明确探测到生成中才算
      owned: probe === false,          // 仅"探测成功且非生成中"才确权（PROBE_FAIL→双 false=不进关闭计划）
    });
    pageByIdx.push(pages[i]);
  }
  const plan = dedupePlan(describePages(descs));

  const report = {
    at: new Date().toISOString(),
    mode: CLOSE ? "close" : "dry-run",
    total: pages.length,
    targets: await targetIdList(),
    pages: descs.map((d, i) => ({ index: i, url: d.url, generating: d.generating, owned: d.owned })),
    keep: plan.keep,
    closeCandidates: plan.close,
    skippedGenerating: plan.skippedGenerating,
    skippedNotOwned: plan.skippedNotOwned,
    closed: [],
    closeFailures: [],
  };
  console.log(`[tab-cleanup] mode=${report.mode} 总页数=${pages.length} 保留=${plan.keep.length} 关闭候选=${plan.close.length} 生成中跳过=${plan.skippedGenerating.length} 未确权跳过=${plan.skippedNotOwned.length}`);

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
} finally {
  if (sessionLock) sessionLock.release();
  if (browser) await browser.close().catch(() => {});
}
process.exit(process.exitCode ?? 0);
