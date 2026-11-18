// C2-BATCH2 S3-④-A 阶段一：既有会话清单快照（操作约束#1：创建前记录既有会话清单）
// 只读诊断：启动/复用 Chrome(9222)→chatgpt.com→展开侧边栏→快照全部会话链接(title+href)→落盘
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { acquireSessionLock } from "../e2e-poc/session_lock.mjs";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PROFILE_DIR = join(process.cwd(), "runtime", "chrome_profiles", "gpt-poc");
const CDP = "http://127.0.0.1:9222";
const ts = new Date().toISOString().replace(/[:.]/g, "-");
const OUT_DIR = join(process.cwd(), "phase0", "logs", `c2batch2-s3-04a-inventory-${ts}`);
mkdirSync(OUT_DIR, { recursive: true });
const log = (m) => {
  const line = `[${new Date().toISOString()}] ${m}`;
  console.log(line);
  writeFileSync(join(OUT_DIR, "run.log"), line + "\n", { flag: "a", encoding: "utf8" });
};

async function cdpReady() {
  try { const r = await fetch(`${CDP}/json/version`); return r.ok; } catch { return false; }
}

const lock = acquireSessionLock({ holder: "c2batch2_s3_04a" });
log("会话锁已获取（S3-④-A inventory）");
let browser;
try {
  if (!(await cdpReady())) {
    log("启动 Chrome(9222)…");
    const child = spawn(CHROME, [
      "--remote-debugging-port=9222", "--remote-allow-origins=*",
      `--user-data-dir=${PROFILE_DIR}`, "--no-first-run", "--no-default-browser-check",
      "--disable-session-crashed-bubble", "--start-maximized", "https://chatgpt.com/",
    ], { detached: true, stdio: "ignore" });
    child.unref();
    for (let i = 0; i < 45; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      if (await cdpReady()) { log(`Chrome 已启动 pid=${child.pid}`); break; }
    }
    if (!(await cdpReady())) throw new Error("Chrome 调试端口未就绪");
  } else {
    log("复用已运行调试端口 9222");
  }
  browser = await chromium.connectOverCDP(CDP);
  const ctx = browser.contexts()[0];
  let page = ctx.pages().find((p) => p.url().includes("chatgpt.com")) || ctx.pages()[0];
  await page.goto("https://chatgpt.com/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(5000);
  const bodyLen = await page.evaluate(() => document.body.innerText.length);
  log(`chatgpt.com 就绪 bodyLen=${bodyLen}`);
  // 侧边栏会话链接（新 UI 在 nav/a[href*="/c/"]；必要时点开侧边栏）
  let links = await page.evaluate(() =>
    [...document.querySelectorAll('a[href*="/c/"]')].map((a) => ({
      title: (a.textContent || "").trim().slice(0, 80), href: a.getAttribute("href"),
    })).filter((x) => x.href && x.href.includes("/c/")));
  log(`首次捕获会话链接 ${links.length} 条`);
  if (links.length === 0) {
    for (const sel of ['button[data-testid="open-sidebar"]', 'button[aria-label*="侧边栏"]', 'button[aria-label*="sidebar" i]']) {
      const btn = page.locator(sel).first();
      if (await btn.count() > 0) {
        await btn.click().catch(() => {});
        log(`已点击展开侧边栏(${sel})`);
        await page.waitForTimeout(2500);
        break;
      }
    }
    links = await page.evaluate(() =>
      [...document.querySelectorAll('a[href*="/c/"]')].map((a) => ({
        title: (a.textContent || "").trim().slice(0, 80), href: a.getAttribute("href"),
      })).filter((x) => x.href && x.href.includes("/c/")));
    log(`展开后捕获会话链接 ${links.length} 条`);
  }
  writeFileSync(join(OUT_DIR, "session-inventory.json"), JSON.stringify({
    captured_at: new Date().toISOString(), purpose: "S3-④-A 操作约束#1 创建前既有会话清单",
    page_url: page.url(), body_len: bodyLen, conversation_links: links,
    note: "侧边栏为可视区快照,长列表可能虚拟化截断——快照口径如实登记",
  }, null, 2), "utf8");
  const targets = await (await fetch(`${CDP}/json`)).json();
  writeFileSync(join(OUT_DIR, "cdp-targets.json"), JSON.stringify(
    targets.filter((t) => t.type === "page").map((t) => ({ id: t.id, url: t.url })), null, 2), "utf8");
  log(`清单落盘: ${links.length} 条会话链接`);
  console.log(`INVENTORY_DIR=${OUT_DIR}`);
} catch (e) {
  log(`INVENTORY FAILED: ${e && e.message}`);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  lock.release();
  log("会话锁已释放（Chrome 保持运行供后续阶段复用）");
}
