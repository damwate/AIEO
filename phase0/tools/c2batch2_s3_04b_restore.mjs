// C2-BATCH2 S3-④-B 恢复验证驱动：显式清除 offline 覆盖→页内 fetch 验证→落盘
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const CDP = "http://127.0.0.1:9222";
const ts = new Date().toISOString().replace(/[:.]/g, "-");
const OUT_DIR = join(process.cwd(), "phase0", "logs", `c2batch2-s3-04b-restore-${ts}`);
mkdirSync(OUT_DIR, { recursive: true });
const log = (m) => {
  const line = `[${new Date().toISOString()}] ${m}`;
  console.log(line);
  writeFileSync(join(OUT_DIR, "run.log"), line + "\n", { flag: "a", encoding: "utf8" });
};
let browser;
try {
  browser = await chromium.connectOverCDP(CDP);
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find((p) => p.url().includes("chatgpt.com")) || ctx.pages()[0];
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  log("offline 覆盖已显式清除");
  await page.goto("https://chatgpt.com/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(4000);
  const chk = await page.evaluate(async () => {
    try { const r = await fetch("/api/auth/session", { cache: "no-store" }); return { ok: r.ok, status: r.status }; }
    catch (e) { return { ok: false, err: String(e).slice(0, 80) }; }
  });
  log(`恢复验证: ${JSON.stringify(chk)}`);
  writeFileSync(join(OUT_DIR, "restore-verify.json"), JSON.stringify({ cleared: true, check: chk, at: new Date().toISOString() }, null, 2), "utf8");
  console.log(`RESTORE_DIR=${OUT_DIR} RESTORED=${chk.ok}`);
} catch (e) {
  log(`RESTORE DRIVER FAILED: ${e && e.message}`);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
}
