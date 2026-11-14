// T-P1-908 派单通道诊断（人工接管检查点）：截图+Composer DOM 摘要，不改任何状态。
import { chromium } from "playwright";
import { execFile, spawn } from "node:child_process";
import { join } from "node:path";

const PROFILE_DIR = join("D:/AIEO", "runtime", "chrome_profiles", "gpt-poc");
const CDP_URL = "http://127.0.0.1:9222";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const CHATGPT_HOME = "https://chatgpt.com/";
const log = (m) => console.log(`[${new Date().toISOString()}] ${m}`);

async function cdpReady() { try { return (await fetch(`${CDP_URL}/json/version`)).ok; } catch { return false; } }
function killProfileChrome() {
  return new Promise((resolve) => {
    const ps = `Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.CommandLine -like '*gpt-poc*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
    execFile("powershell", ["-NoProfile", "-Command", ps], () => resolve());
  });
}
async function main() {
  if (!(await cdpReady())) {
    const child = spawn(CHROME, ["--remote-debugging-port=9222", "--remote-allow-origins=*",
      `--user-data-dir=${PROFILE_DIR}`, "--no-first-run", "--no-default-browser-check",
      "--disable-session-crashed-bubble", "--start-maximized", CHATGPT_HOME], { detached: true, stdio: "ignore" });
    child.unref();
    for (let i = 0; i < 45; i++) { await new Promise((r) => setTimeout(r, 1000)); if (await cdpReady()) break; }
  }
  const browser = await chromium.connectOverCDP(CDP_URL, { timeout: 30000 });
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find((p) => p.url().includes("chatgpt.com")) || ctx.pages()[0] || (await ctx.newPage());
  await page.goto(CHATGPT_HOME, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000);
  await page.screenshot({ path: "D:/AIEO/runtime/t-p1-908/diag-page.png", fullPage: false });
  const info = await page.evaluate(() => {
    const ta = document.querySelector("#prompt-textarea");
    const overlay = [...document.querySelectorAll("[role=dialog], [data-testid*=modal]")].map(e => e.outerHTML.slice(0, 120));
    const btns = [...document.querySelectorAll("button")].slice(0, 8).map(b => (b.getAttribute("aria-label") || b.innerText || "").slice(0, 30));
    return {
      url: location.href,
      loggedIn: !!document.querySelector('[data-testid="profile-button"], [aria-label*="Account"], img[alt*="用户"], img[alt*="User"]'),
      composerFound: !!ta,
      composerAriaLabel: ta ? (ta.getAttribute("aria-label") || ta.closest("[aria-label]")?.getAttribute("aria-label") || "") : null,
      composerTextLen: ta ? ta.innerText.trim().length : -1,
      bodySnippet: (document.body.innerText || "").slice(0, 300).replace(/\n+/g, " | "),
      overlays: overlay.slice(0, 3),
      buttons: btns,
    };
  });
  console.log(JSON.stringify(info, null, 2));
  await browser.close();
  await killProfileChrome();
}
main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
