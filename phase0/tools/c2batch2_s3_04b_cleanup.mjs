// C2-BATCH2 S3-④-B 清理驱动：先存证后删除 ④-B 测试会话 6afdfd07，验证死态
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { acquireSessionLock } from "../e2e-poc/session_lock.mjs";
import { readDomUnits } from "./inbound_dom.mjs";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PROFILE_DIR = join(process.cwd(), "runtime", "chrome_profiles", "gpt-poc");
const CDP = "http://127.0.0.1:9222";
const UUID = "6afdfd07-92fc-83ec-8350-be4bff239277";
const ts = new Date().toISOString().replace(/[:.]/g, "-");
const OUT_DIR = join(process.cwd(), "phase0", "logs", `c2batch2-s3-04b-cleanup-${ts}`);
mkdirSync(OUT_DIR, { recursive: true });
const log = (m) => {
  const line = `[${new Date().toISOString()}] ${m}`;
  console.log(line);
  writeFileSync(join(OUT_DIR, "run.log"), line + "\n", { flag: "a", encoding: "utf8" });
};
async function cdpReady() {
  try { const r = await fetch(`${CDP}/json/version`); return r.ok; } catch { return false; }
}
const lock = acquireSessionLock({ holder: "c2batch2_s3_04b" });
log("会话锁已获取（S3-④-B cleanup）");
let browser;
try {
  if (!(await cdpReady())) {
    const child = spawn(CHROME, [
      "--remote-debugging-port=9222", "--remote-allow-origins=*",
      `--user-data-dir=${PROFILE_DIR}`, "--no-first-run", "--no-default-browser-check",
      "--disable-session-crashed-bubble", "--start-maximized", "https://chatgpt.com/",
    ], { detached: true, stdio: "ignore" });
    child.unref();
    for (let i = 0; i < 45; i++) { await new Promise((r) => setTimeout(r, 1000)); if (await cdpReady()) { log(`Chrome 已启动 pid=${child.pid}`); break; } }
  } else log("复用已运行调试端口 9222");
  browser = await chromium.connectOverCDP(CDP);
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find((p) => p.url().includes("chatgpt.com")) || ctx.pages()[0];
  const tok = await page.evaluate(async () => {
    try { const r = await fetch("/api/auth/session"); const j = await r.json(); return j.accessToken || null; } catch { return null; }
  });
  await page.goto(`https://chatgpt.com/c/${UUID}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(5000);
  const units = await readDomUnits(page);
  writeFileSync(join(OUT_DIR, "session-snapshot.json"), JSON.stringify({
    uuid: UUID, units: units.map((u) => ({ key: u.key, role: u.role, text_len: (u.text || "").length, text_head: (u.text || "").slice(0, 100) })),
  }, null, 2), "utf8");
  log(`存证 ${UUID.slice(0, 8)}…: ${units.length} units`);
  const api = (method, path, body) => page.evaluate(async ({ method, path, body, tok }) => {
    const r = await fetch(path, { method, headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: (await r.text()).slice(0, 200) };
  }, { method, path, body, tok });
  const del = await api("PATCH", `/backend-api/conversation/${UUID}`, { is_visible: false });
  const get = await api("GET", `/backend-api/conversation/${UUID}`, null);
  log(`删除验证: PATCH=${del.status} GET后=${get.status} ${get.status === 404 ? "已死" : "仍活!"}`);
  writeFileSync(join(OUT_DIR, "cleanup-verify.json"), JSON.stringify({ uuid: UUID, patch_status: del.status, get_status_after: get.status, dead: get.status === 404 }, null, 2), "utf8");
  console.log(`CLEANUP_DIR=${OUT_DIR} DEAD=${get.status === 404}`);
} catch (e) {
  log(`CLEANUP FAILED: ${e && e.message}`);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  lock.release();
  log("会话锁已释放");
}
