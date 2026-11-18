// C2-BATCH2 S3-④-A 阶段二：删除一次性会话+死态验证
// 一次性会话 6afdfaf1-afcc-83ec-b377-8d560fcfcc90（场景④-A 专用）；删除→GET 验证 404→UI 死态验证→侧边栏核对
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { acquireSessionLock } from "../e2e-poc/session_lock.mjs";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PROFILE_DIR = join(process.cwd(), "runtime", "chrome_profiles", "gpt-poc");
const CDP = "http://127.0.0.1:9222";
const UUID = "6afdfaf1-afcc-83ec-b377-8d560fcfcc90";
const ts = new Date().toISOString().replace(/[:.]/g, "-");
const OUT_DIR = join(process.cwd(), "phase0", "logs", `c2batch2-s3-04a-delete-${ts}`);
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
log("会话锁已获取（S3-④-A delete）");
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
    if (!(await cdpReady())) throw new Error("Chrome 调试端口未就绪");
  } else log("复用已运行调试端口 9222");
  browser = await chromium.connectOverCDP(CDP);
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find((p) => p.url().includes("chatgpt.com")) || ctx.pages()[0];
  await page.goto("https://chatgpt.com/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(4000);
  const attempts = [];
  // in-page fetch 带会话凭证；先取 accessToken（手册口径：API 仅作辅助通道，本场景为受控一次性会话删除）
  const tok = await page.evaluate(async () => {
    try { const r = await fetch("/api/auth/session"); const j = await r.json(); return j.accessToken || null; }
    catch (e) { return null; }
  });
  log(`accessToken 获取: ${tok ? "OK(len=" + tok.length + ")" : "NULL"}`);
  const call = (method, path, body) => page.evaluate(async ({ method, path, body, tok }) => {
    const r = await fetch(path, {
      method,
      headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, body: (await r.text()).slice(0, 300) };
  }, { method, path, body, tok });
  const variants = [
    { method: "DELETE", path: `/backend-api/conversation/${UUID}`, body: null },
    { method: "POST", path: `/backend-api/conversation/${UUID}/delete`, body: null },
    { method: "PATCH", path: `/backend-api/conversation/${UUID}`, body: { is_visible: false } },
  ];
  for (const v of variants) {
    try { const res = await call(v.method, v.path, v.body); attempts.push({ ...v, ...res }); log(`${v.method} ${v.path} -> ${res.status} ${res.body.slice(0, 80)}`); }
    catch (e) { attempts.push({ ...v, error: String(e && e.message) }); log(`${v.method} ${v.path} -> ERROR ${e && e.message}`); }
    if (attempts.length && ["200", "204"].includes(attempts[attempts.length - 1].status)) break;
  }
  writeFileSync(join(OUT_DIR, "delete-attempts.json"), JSON.stringify({ uuid: UUID, attempts }, null, 2), "utf8");
  // 死态验证：GET conversation API（期望 404）+ UI 直载会话 URL + 侧边栏核对
  const getVerify = await call("GET", `/backend-api/conversation/${UUID}`, null);
  log(`GET 验证 -> ${getVerify.status}`);
  await page.goto(`https://chatgpt.com/c/${UUID}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(6000);
  const uiState = await page.evaluate(() => ({
    url: location.href,
    bodyLen: document.body.innerText.length,
    mainText: (document.body.innerText || "").slice(0, 300),
    convUnits: document.querySelectorAll('[data-testid^="conversation-turn"], [data-content-search-unit-key]').length,
  }));
  log(`UI 直载死态验证: bodyLen=${uiState.bodyLen} convUnits=${uiState.convUnits} main="${uiState.mainText.slice(0, 120).replace(/\n/g, " ")}"`);
  writeFileSync(join(OUT_DIR, "dead-verify.json"), JSON.stringify({ uuid: UUID, get_status: getVerify.status, get_body: getVerify.body, ui: uiState }, null, 2), "utf8");
  const dead = getVerify.status === 404 || uiState.convUnits === 0;
  log(dead ? "DELETE VERIFIED: 会话已死（API 404 或 UI 无会话体）" : "DELETE NOT CONFIRMED: 会话仍可访问，需 UI 兜底");
  console.log(`DELETE_DIR=${OUT_DIR}`);
  console.log(`DEAD=${dead}`);
} catch (e) {
  log(`DELETE DRIVER FAILED: ${e && e.message}`);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  lock.release();
  log("会话锁已释放");
}
