// b-20261123-standard-third-trial S1 补证复核 fail-closed 三步诊断（只读；禁发送/禁重发）。
// 派生自 diag_s3_targeted_r1.mjs（L-018 三步诊断）；四常量全换（CONV_UUID 交叉核对 + MARKER + PREV_REPLY_SHA + FAILED_DIR），CDP=9300。
import { chromium } from "playwright";
import { readDomWindow } from "./inbound_dom.mjs";
import { acquireSessionLock } from "../e2e-poc/session_lock.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const CONV_UUID = "6b056690-87b8-83ee-a67a-6be774fcc829";
const MARKER = "[AIEO-ROUND:3d7bd51109e46f8f55251385]";
const PREV_REPLY_SHA = "87b19055d5d8c15487cd3c7759ea8bacb4fdfdba1b7f838cb6ae7b3208a97a39";
const FAILED_DIR = "phase0/logs/dispatch-2026-11-24T10-26-37";
const OUT_DIR = join(process.cwd(), "phase0", "logs",
  `diag-s1-targeted-r1-${new Date().toISOString().replace(/[:.]/g, "-")}`);
mkdirSync(OUT_DIR, { recursive: true });

const fmt = (w) => ({
  keys: w.units.map((u) => u.key), roles: w.units.map((u) => u.role),
  at_top: w.at_top, at_bottom: w.at_bottom, scrollable: w.scrollable,
  marker_hits: w.units.filter((u) => u.role === "user" && (u.text || "").includes(MARKER)).length,
});
const setChanged = (a, b) => {
  const A = new Set(a.keys), B = new Set(b.keys);
  return A.size !== B.size || [...A].some((k) => !B.has(k)) || [...B].some((k) => !A.has(k));
};

const lock = acquireSessionLock({ holder: "diag_s1_targeted_r1" });
let browser;
const report = { conv_uuid: CONV_UUID, marker: MARKER, prev_reply_sha: PREV_REPLY_SHA,
                 failed_dir: FAILED_DIR, steps: [] };
try {
  browser = await chromium.connectOverCDP("http://127.0.0.1:9300");
  const ctx = browser.contexts()[0];
  let page = ctx.pages().find((p) => p.url().includes(CONV_UUID));
  if (!page) {
    page = ctx.pages().find((p) => p.url().includes("chatgpt.com")) || ctx.pages()[0];
    await page.goto(`https://chatgpt.com/c/${CONV_UUID}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(5000);
  }
  if (!page.url().includes(CONV_UUID)) throw new Error(`会话 UUID 不匹配: ${page.url()}`);

  const initial = fmt(await readDomWindow(page));
  report.steps.push({ step: 1, name: "current_window", ...initial });

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1500);
  const up = fmt(await readDomWindow(page));
  report.steps.push({ step: 2, name: "scroll_up", ...up, changed_vs_initial: setChanged(initial, up) });

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1500);
  const down = fmt(await readDomWindow(page));
  report.steps.push({ step: 2, name: "scroll_down", ...down, changed_vs_up: setChanged(up, down) });

  await page.goto(`https://chatgpt.com/c/${CONV_UUID}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(8000);
  const reloaded = fmt(await readDomWindow(page));
  report.steps.push({ step: 3, name: "after_reload", ...reloaded, changed_vs_initial: setChanged(initial, reloaded) });

  report.virtualization_inferred = report.steps.some((s) => s.changed_vs_initial === true || s.changed_vs_up === true);
  report.failed_code = "INBOUND_WINDOW_COMPLETENESS_UNPROVEN";
  report.remediation = "CDP 视口拉高静态 DOM 全量物化补采（禁重发）";
  report.captured_at = new Date().toISOString();
  writeFileSync(join(OUT_DIR, "report.json"), JSON.stringify(report, null, 2), "utf8");
  console.log(`DIAG_DIR=${OUT_DIR}`);
  console.log(`virtualization_inferred=${report.virtualization_inferred}`);
} catch (e) {
  report.error = String(e && e.message);
  writeFileSync(join(OUT_DIR, "report.json"), JSON.stringify(report, null, 2), "utf8");
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  lock.release();
}
