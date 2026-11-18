// C2-BATCH2 S3-④-A 阶段三：副作用会话存证+清理+指针恢复+审查会话核验
// 删除清单(仅此两个,均为本任务创建)：6afdfbba(死会话派单副作用会话)+6afdf8eb(S3-①测试会话)
// 审查会话 6afdf44d 及其余全部既有会话不触碰
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { acquireSessionLock } from "../e2e-poc/session_lock.mjs";
import { readDomUnits } from "./inbound_dom.mjs";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PROFILE_DIR = join(process.cwd(), "runtime", "chrome_profiles", "gpt-poc");
const CDP = "http://127.0.0.1:9222";
const REVIEWER_UUID = "6afdf44d-8d54-83ec-9fca-1bbde1ba1654";
const DELETE_LIST = [
  { uuid: "6afdfbba-a6f8-83ec-b1a9-e7f8e6fdabe4", reason: "S3-④-A 死会话派单副作用会话（dispatch-2026-11-18T19-24-59 归属校验拦截所捕获）" },
  { uuid: "6afdf8eb-4acc-83ec-923d-7f38ab2e9f14", reason: "S3-① 多unit采集测试会话（主尝试+备用触发已完成取证）" },
];
const ts = new Date().toISOString().replace(/[:.]/g, "-");
const OUT_DIR = join(process.cwd(), "phase0", "logs", `c2batch2-s3-04a-cleanup-${ts}`);
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
log("会话锁已获取（S3-④-A cleanup）");
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
  const tok = await page.evaluate(async () => {
    try { const r = await fetch("/api/auth/session"); const j = await r.json(); return j.accessToken || null; } catch { return null; }
  });
  log(`accessToken: ${tok ? "OK" : "NULL"}`);
  const api = (method, path, body) => page.evaluate(async ({ method, path, body, tok }) => {
    const r = await fetch(path, { method, headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: (await r.text()).slice(0, 300) };
  }, { method, path, body, tok });

  // 1) 副作用会话存证（先读后删）
  const ev = {};
  for (const item of DELETE_LIST) {
    await page.goto(`https://chatgpt.com/c/${item.uuid}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(5000);
    let units = [];
    try { units = await readDomUnits(page); } catch (e) { log(`readDomUnits ${item.uuid} 失败: ${e && e.message}`); }
    ev[item.uuid] = {
      reason: item.reason,
      units: units.map((u) => ({ key: u.key, role: u.role, text_len: (u.text || "").length, text_head: (u.text || "").slice(0, 120) })),
    };
    log(`存证 ${item.uuid.slice(0, 8)}…: ${units.length} units`);
  }
  writeFileSync(join(OUT_DIR, "side-effect-snapshot.json"), JSON.stringify(ev, null, 2), "utf8");

  // 2) 删除+验证
  const results = [];
  for (const item of DELETE_LIST) {
    const del = await api("PATCH", `/backend-api/conversation/${item.uuid}`, { is_visible: false });
    const get = await api("GET", `/backend-api/conversation/${item.uuid}`, null);
    results.push({ uuid: item.uuid, patch_status: del.status, get_status_after: get.status, dead: get.status === 404 });
    log(`删除 ${item.uuid.slice(0, 8)}…: PATCH=${del.status} GET后=${get.status} ${get.status === 404 ? "已死" : "仍活!"}`);
  }
  writeFileSync(join(OUT_DIR, "cleanup-verify.json"), JSON.stringify(results, null, 2), "utf8");

  // 3) 指针恢复+审查会话核验
  await page.goto(`https://chatgpt.com/c/${REVIEWER_UUID}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(6000);
  const vp = await page.evaluate(() => ({ w: innerWidth, dpr: devicePixelRatio }));
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Page.setDeviceMetricsOverride", { width: vp.w, height: 80000, deviceScaleFactor: vp.dpr || 1, mobile: false });
  await page.waitForTimeout(8000);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(3000);
  const units = await readDomUnits(page);
  const lastA = [...units].reverse().find((u) => u.role === "assistant");
  const sha = lastA ? createHash("sha256").update(lastA.text || "", "utf8").digest("hex") : null;
  log(`审查会话核验: units=${units.length} 尾assistant SHA=${sha ? sha.slice(0, 16) : "null"}（期望 552a463a…=R3 终局裁定）`);
  writeFileSync(join(OUT_DIR, "reviewer-verify.json"), JSON.stringify({
    reviewer: REVIEWER_UUID, unit_count: units.length,
    tail_assistant_sha256: sha, expected_prefix: "552a463a", intact: sha ? sha.startsWith("552a463a") : false,
  }, null, 2), "utf8");
  await cdp.send("Page.clearDeviceMetricsOverride").catch(() => {});
  console.log(`CLEANUP_DIR=${OUT_DIR}`);
  console.log(`ALL_DEAD=${results.every((r) => r.dead)} REVIEWER_INTACT=${sha ? sha.startsWith("552a463a") : false}`);
} catch (e) {
  log(`CLEANUP DRIVER FAILED: ${e && e.message}`);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  lock.release();
  log("会话锁已释放");
}
