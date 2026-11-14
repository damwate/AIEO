// T-P1-908 run 间人工浏览器接管：清理 gpt-poc profile 的 Composer 残留草稿。
// 背景：ORCH-908001 S2 派单回读校验失败时文本残留 → profile 持久化草稿 →
//       后续 run gpt_dispatch "Composer 非空，STOP" fail-closed。
// 本脚本为一次性人工接管（F001-SCHEDULER-BRIEF §1 人工检查点：浏览器人工接管），
// 不修改派单工具本身；只清 Composer 文本并行为级验证；不记录任何会话正文。
import { chromium } from "playwright";
import { execFile, spawn } from "node:child_process";
import { join } from "node:path";
import { existsSync, readFileSync } from "node:fs";

const AIEO_ROOT = "D:/AIEO";
const PROFILE_DIR = join(AIEO_ROOT, "runtime", "chrome_profiles", "gpt-poc");
const CDP_URL = "http://127.0.0.1:9222";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const CHATGPT_HOME = "https://chatgpt.com/";

const log = (m) => console.log(`[${new Date().toISOString()}] ${m}`);

async function cdpReady() {
  try { const r = await fetch(`${CDP_URL}/json/version`); return r.ok; } catch { return false; }
}
function killProfileChrome() {
  return new Promise((resolve) => {
    const ps = `Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.CommandLine -like '*gpt-poc*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
    execFile("powershell", ["-NoProfile", "-Command", ps], () => resolve());
  });
}

async function main() {
  if (!(await cdpReady())) {
    log("Chrome 未在跑，启动 gpt-poc profile...");
    const child = spawn(CHROME, [
      "--remote-debugging-port=9222", "--remote-allow-origins=*",
      `--user-data-dir=${PROFILE_DIR}`, "--no-first-run", "--no-default-browser-check",
      "--disable-session-crashed-bubble", "--start-maximized", CHATGPT_HOME,
    ], { detached: true, stdio: "ignore" });
    child.unref();
    for (let i = 0; i < 45; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      if (await cdpReady()) { log(`Chrome 就绪 pid=${child.pid}`); break; }
      if (i === 44) throw new Error("Chrome 调试端口未就绪");
    }
  } else {
    log("复用已运行调试端口 9222");
  }
  const browser = await chromium.connectOverCDP(CDP_URL, { timeout: 30000 });
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find((p) => p.url().includes("chatgpt.com")) || ctx.pages()[0] || (await ctx.newPage());
  if (!page.url().includes("chatgpt.com")) await page.goto(CHATGPT_HOME, { waitUntil: "domcontentloaded" });
  const composerLoc = '[aria-label="询问 ChatGPT"], [aria-label="Ask ChatGPT"], #prompt-textarea';
  const loc = page.locator(composerLoc).filter({ visible: true }).first();
  await loc.waitFor({ state: "visible", timeout: 30000 });

  const readLen = async () => ((await loc.innerText()) || "").trim().length;
  let before = await readLen();
  log(`Composer 当前字符数（trim 后）: ${before}`);
  for (let round = 1; round <= 3 && before > 0; round++) {
    await loc.click();
    await page.keyboard.press("Control+A");
    await page.keyboard.press("Delete");
    await page.waitForTimeout(500);
    before = await readLen();
    log(`清理第 ${round} 轮后字符数: ${before}`);
  }
  if (before > 0) throw new Error(`Composer 无法清空（残留 ${before} 字符）——人工检查`);

  // 行为级验证：刷新后草稿不应再恢复
  await page.reload({ waitUntil: "domcontentloaded" });
  const loc2 = page.locator(composerLoc).filter({ visible: true }).first();
  await loc2.waitFor({ state: "visible", timeout: 30000 });
  await page.waitForTimeout(1500);
  const after = ((await loc2.innerText()) || "").trim().length;
  log(`刷新后 Composer 字符数: ${after}`);
  if (after > 0) {
    await loc2.click();
    await page.keyboard.press("Control+A");
    await page.keyboard.press("Delete");
    await page.waitForTimeout(800);
    const after2 = ((await loc2.innerText()) || "").trim().length;
    log(`刷新后二次清理: ${after2}`);
    if (after2 > 0) throw new Error("草稿在刷新后仍恢复——需进一步人工检查");
  }
  log("COMPOSER-CLEAN-OK：Composer 已空且刷新后不恢复");
  await browser.close();
  await killProfileChrome();
  await new Promise((r) => setTimeout(r, 2000));
  log("Chrome 已关闭（9222 释放，S0 PRECHECK 前置满足）");
}
main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
