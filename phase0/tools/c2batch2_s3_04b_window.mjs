// C2-BATCH2 S3-④-B：限时断网窗口驱动（页面级 CDP 隔离，窗口=一次派单运行时长）
// 序：启动/复用 Chrome→打开④-B会话(活)→离线武装→子进程派单(断网窗口内)→等待退出→解除→恢复验证→窗口证据落盘
// 边界：仅针对本页 target 注入 offline；不触碰系统代理/GitHub/VPN；不持会话锁（子进程派单需自取锁）
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { readDomUnits } from "./inbound_dom.mjs";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PROFILE_DIR = join(process.cwd(), "runtime", "chrome_profiles", "gpt-poc");
const CDP = "http://127.0.0.1:9222";
const SESSION_UUID = "6afdfd07-92fc-83ec-8350-be4bff239277";
const DISPATCH_CMD = ["node", "phase0/tools/gpt_dispatch.mjs", "--message-file", "phase0/tools/brief_c2batch2_s3_04b_offline.txt"];
const ts = new Date().toISOString().replace(/[:.]/g, "-");
const OUT_DIR = join(process.cwd(), "phase0", "logs", `c2batch2-s3-04b-window-${ts}`);
mkdirSync(OUT_DIR, { recursive: true });
const log = (m) => {
  const line = `[${new Date().toISOString()}] ${m}`;
  console.log(line);
  writeFileSync(join(OUT_DIR, "run.log"), line + "\n", { flag: "a", encoding: "utf8" });
};
async function cdpReady() {
  try { const r = await fetch(`${CDP}/json/version`); return r.ok; } catch { return false; }
}
async function launchChrome() {
  const child = spawn(CHROME, [
    "--remote-debugging-port=9222", "--remote-allow-origins=*",
    `--user-data-dir=${PROFILE_DIR}`, "--no-first-run", "--no-default-browser-check",
    "--disable-session-crashed-bubble", "--start-maximized", "https://chatgpt.com/",
  ], { detached: true, stdio: "ignore" });
  child.unref();
  for (let i = 0; i < 45; i++) { await new Promise((r) => setTimeout(r, 1000)); if (await cdpReady()) { log(`Chrome 已启动 pid=${child.pid}`); return child; } }
  throw new Error("Chrome 调试端口未就绪");
}
const rec = { armed_at: null, disarmed_at: null, dispatch_exit: null, dispatch_summary: null, offline_sanity: null, restore_check: null, chrome_restarted: false };
let browser;
let cdp;
try {
  if (!(await cdpReady())) { await launchChrome(); rec.chrome_restarted = false; }
  else log("复用已运行调试端口 9222");
  browser = await chromium.connectOverCDP(CDP);
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find((p) => p.url().includes("chatgpt.com")) || ctx.pages()[0];
  await page.goto(`https://chatgpt.com/c/${SESSION_UUID}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(5000);
  const units = await readDomUnits(page);
  log(`④-B会话(活)载入: units=${units.length} 尾role=${units[units.length - 1]?.role}`);
  // 武装：本页 offline
  cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  rec.armed_at = new Date().toISOString();
  log(`离线武装于 ${rec.armed_at}（仅本页 target）`);
  // 摸底：页内 fetch 应失败
  rec.offline_sanity = await page.evaluate(async () => {
    try { const r = await fetch(location.href, { cache: "no-store" }); return { ok: true, status: r.status }; }
    catch (e) { return { ok: false, err: String(e && e.message).slice(0, 100) }; }
  });
  log(`离线摸底 fetch: ${JSON.stringify(rec.offline_sanity)}`);
  // 断网窗口内派单（子进程，自取会话锁）
  log("派发子进程（断网窗口开始）…");
  const child = spawn(DISPATCH_CMD[0], DISPATCH_CMD.slice(1), { cwd: process.cwd(), shell: true });
  let out = "";
  child.stdout.on("data", (d) => { out += d; });
  child.stderr.on("data", (d) => { out += d; });
  const exit = await new Promise((res) => child.on("close", (code) => res(code)));
  rec.dispatch_exit = exit;
  rec.dispatch_summary = out.split("\n").filter((l) => /致命错误|COMPLETED|发送双验|PAGE_NOT_READY|会话就绪|SESSION_ATTRIBUTION|保留现场/.test(l)).slice(-8);
  log(`子进程退出 code=${exit}；关键行: ${JSON.stringify(rec.dispatch_summary)}`);
  // 解除+恢复验证
  try {
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    rec.disarmed_at = new Date().toISOString();
    log(`离线解除于 ${rec.disarmed_at}`);
  } catch (e) { log(`解除时 CDP 失效（Chrome 可能已被子进程处置）: ${e && e.message}`); }
  rec.restore_check = await page.evaluate(async () => {
    try { const r = await fetch("/api/auth/session", { cache: "no-store" }); return { ok: r.ok, status: r.status }; }
    catch (e) { return { ok: false, err: String(e && e.message).slice(0, 100) }; }
  }).catch((e) => ({ ok: false, err: String(e && e.message).slice(0, 100) }));
  log(`恢复验证: ${JSON.stringify(rec.restore_check)}`);
  writeFileSync(join(OUT_DIR, "offline-window.json"), JSON.stringify({ session: SESSION_UUID, ...rec }, null, 2), "utf8");
  console.log(`WINDOW_DIR=${OUT_DIR}`);
} catch (e) {
  log(`WINDOW DRIVER FAILED: ${e && e.message}`);
  try { if (cdp) await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }); } catch {}
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  log("窗口驱动退出（浏览器连接已关；CDP 覆盖已按上状态处理）");
}
