// C2-BATCH2 S4-04D1 空回复 DOM 诊断：静态全量物化读取目标会话尾部，核验 DOM 层是否真空
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { acquireSessionLock } from "../e2e-poc/session_lock.mjs";
import { readDomUnits } from "./inbound_dom.mjs";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PROFILE_DIR = join(process.cwd(), "runtime", "chrome_profiles", "gpt-poc");
const CDP = "http://127.0.0.1:9222";
const CONV_UUID = "6afdffa2-fbb8-83ec-b44b-a22faf93a8a3";
const ts = new Date().toISOString().replace(/[:.]/g, "-");
const OUT_DIR = join(process.cwd(), "phase0", "logs", `c2batch2-s4-04d1-domdiag-${ts}`);
mkdirSync(OUT_DIR, { recursive: true });
const log = (m) => {
  const line = `[${new Date().toISOString()}] ${m}`;
  console.log(line);
  writeFileSync(join(OUT_DIR, "run.log"), line + "\n", { flag: "a", encoding: "utf8" });
};
async function cdpReady() {
  try { const r = await fetch(`${CDP}/json/version`); return r.ok; } catch { return false; }
}
const lock = acquireSessionLock({ holder: "c2batch2_s4_04d1" });
log("会话锁已获取（S4-04D1 domdiag）");
let browser;
try {
  if (!(await cdpReady())) {
    const child = spawn(CHROME, [
      "--remote-debugging-port=9222", "--remote-allow-origins=*",
      `--user-data-dir=${PROFILE_DIR}`, "--no-first-run", "--no-default-browser-check",
      "--disable-session-crashed-bubble", "--start-maximized", `https://chatgpt.com/c/${CONV_UUID}`,
    ], { detached: true, stdio: "ignore" });
    child.unref();
    for (let i = 0; i < 45; i++) { await new Promise((r) => setTimeout(r, 1000)); if (await cdpReady()) { log(`Chrome 已启动 pid=${child.pid}`); break; } }
    if (!(await cdpReady())) throw new Error("Chrome 调试端口未就绪");
  } else log("复用已运行调试端口 9222");
  browser = await chromium.connectOverCDP(CDP);
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find((p) => p.url().includes("chatgpt.com")) || ctx.pages()[0];
  await page.goto(`https://chatgpt.com/c/${CONV_UUID}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(5000);
  const vp = await page.evaluate(() => ({ w: innerWidth, dpr: devicePixelRatio }));
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Page.setDeviceMetricsOverride", { width: vp.w, height: 80000, deviceScaleFactor: vp.dpr || 1, mobile: false });
  await page.waitForTimeout(8000);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(3000);
  const units = await readDomUnits(page);
  log(`units=${units.length}`);
  const dump = units.map((u) => ({ key: u.key, role: u.role, visible: u.visible, text_len: (u.text || "").length, text_head: (u.text || "").slice(0, 160), text_tail: (u.text || "").slice(-80) }));
  writeFileSync(join(OUT_DIR, "units-diag.json"), JSON.stringify(dump, null, 2), "utf8");
  const last = dump[dump.length - 1];
  log(`尾部: role=${last?.role} len=${last?.text_len} head=${JSON.stringify(last?.text_head?.slice(0, 60))}`);
  await cdp.send("Page.clearDeviceMetricsOverride").catch(() => {});
  console.log(`DIAG_DIR=${OUT_DIR}`);
  console.log(`TAIL_EMPTY=${last?.role === "assistant" && last?.text_len <= 14}`);
} catch (e) {
  log(`DOMDIAG FAILED: ${e && e.message}`);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  lock.release();
  log("会话锁已释放");
}
