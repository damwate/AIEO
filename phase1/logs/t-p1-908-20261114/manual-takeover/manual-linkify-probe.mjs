// 链接化探测：验证带/不带 scheme 的 URL 在 Composer 中的 innerText 行为。
import { chromium } from "playwright";
import { execFile, spawn } from "node:child_process";
import { join } from "node:path";

const PROFILE_DIR = join("D:/AIEO", "runtime", "chrome_profiles", "gpt-poc");
const CDP_URL = "http://127.0.0.1:9222";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
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
      "--disable-session-crashed-bubble", "--start-maximized", "https://chatgpt.com/"], { detached: true, stdio: "ignore" });
    child.unref();
    for (let i = 0; i < 45; i++) { await new Promise((r) => setTimeout(r, 1000)); if (await cdpReady()) break; }
  }
  const browser = await chromium.connectOverCDP(CDP_URL, { timeout: 30000 });
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find((p) => p.url().includes("chatgpt.com")) || ctx.pages()[0] || (await ctx.newPage());
  await page.goto("https://chatgpt.com/", { waitUntil: "domcontentloaded" });
  const sel = '[aria-label="询问 ChatGPT"], [aria-label="Ask ChatGPT"], #prompt-textarea';
  const loc = page.locator(sel).filter({ visible: true }).first();
  await loc.waitFor({ state: "visible", timeout: 30000 });
  const clear = async () => { await loc.click(); await page.keyboard.press("Control+A"); await page.keyboard.press("Delete"); await page.waitForTimeout(400); };
  await clear();
  const probe = "探测A github.com/damwate/AIEO 探测B https://github.com/damwate/AIEO 探测C";
  await loc.click();
  await page.evaluate((t) => document.execCommand("insertText", false, t), probe);
  await page.waitForTimeout(800);
  const res = await page.evaluate(() => {
    const el = document.querySelector('[aria-label="询问 ChatGPT"]') || document.querySelector("#prompt-textarea");
    const anchors = [...(el ? el.querySelectorAll("a") : [])].map(a => ({ text: a.innerText, href: a.href }));
    return { innerText: el ? el.innerText : null, anchors };
  });
  const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
  console.log("PROBE-INSERTED:", probe);
  console.log("PROBE-READBACK:", JSON.stringify(res.innerText));
  console.log("PROBE-ANCHORS:", JSON.stringify(res.anchors));
  console.log("PROBE-MATCH-BARE:", norm(res.innerText).includes("探测A github.com/damwate/AIEO 探测B"));
  console.log("PROBE-NORM-EQUAL:", norm(res.innerText) === norm(probe));
  await clear();
  await browser.close();
  await killProfileChrome();
  log("probe done, chrome killed");
}
main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
