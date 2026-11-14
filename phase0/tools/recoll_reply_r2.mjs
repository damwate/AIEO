// 目录方案讨论 R1 补采驱动（2026-11-14 13:06 派单，同因补采）：仅对已发送成功的会话重新提取回复（不发送、不重发）。
// 背景：dispatch-2026-11-14T13-06-53 发送双验已通过（user unit fallback-turn-2:0:user），
//       但生成后读取遇 INBOUND_WINDOW_COMPLETENESS_UNPROVEN（流式期虚拟化滚动）。
// 本驱动 remediation = 在非虚拟化静态 DOM 上重新读取（错误消息自带指引），复用
// inbound_dom.readReplySnapshot / inbound_reply.compareInboundSnapshots / persistInboundArtifacts，
// 不重写任何算法；完成判定与 gpt_dispatch.mjs 相同契约（两次读取稳定 + 尾部 assistant + 无停止按钮）。
import { chromium } from "playwright";
import { existsSync, mkdirSync, writeFileSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { acquireSessionLock } from "../e2e-poc/session_lock.mjs";
import { readReplySnapshot } from "./inbound_dom.mjs";
import {
  MIN_STABLE_READ_INTERVAL_MS,
  compareInboundSnapshots,
  persistInboundArtifacts,
} from "./inbound_reply.mjs";

const CDP_URL = "http://127.0.0.1:9222";
const CONV_UUID = "6af858e4-7f74-83ec-860e-f360ab9484e2";
const SENT_USER_UNIT_KEY = "fallback-turn-2:0:user";
const FAILED_DIR = join(process.cwd(), "phase0", "logs", "dispatch-2026-11-14T13-06-53");
const OUT_DIR = join(process.cwd(), "phase0", "logs", `recoll-${new Date().toISOString().replace(/[:.]/g, "-")}`);
const IDLE_WAIT_MS = Number(process.env.AIEO_RECOLL_IDLE_WAIT_MS || 30000);

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  writeFileSync(join(OUT_DIR, "run.log"), line + "\n", { flag: "a", encoding: "utf8" });
}

mkdirSync(OUT_DIR, { recursive: true });

const lock = acquireSessionLock({ holder: "gpt_dispatch_recoll" });
log("会话锁已获取（补采）");
let browser;
try {
  if (!existsSync(FAILED_DIR)) throw new Error(`失败现场目录不存在: ${FAILED_DIR}`);
  copyFileSync(join(FAILED_DIR, "request.txt"), join(OUT_DIR, "request.txt"));

  browser = await chromium.connectOverCDP(CDP_URL);
  const ctx = browser.contexts()[0];
  if (!ctx) throw new Error("CDP 无浏览器上下文");
  let page = ctx.pages().find((p) => p.url().includes(CONV_UUID));
  if (!page) {
    log("未找到已打开的会话页，按保存的会话 URL 导航");
    page = await ctx.newPage();
    await page.goto(`https://chatgpt.com/c/${CONV_UUID}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  }
  log(`页面就位: ${page.url()}`);

  // 结构化静置门：composer 存在 + 无可见停止按钮（生成已结束）+ unit 已渲染
  const t0 = Date.now();
  let ready = false;
  while (Date.now() - t0 < 60000) {
    ready = await page.evaluate(() => {
      const composer = !!document.querySelector('[aria-label="询问 ChatGPT"], [aria-label="Ask ChatGPT"], #prompt-textarea');
      const units = document.querySelectorAll("[data-content-search-unit-key]").length;
      const stopCands = document.querySelectorAll(
        'button[aria-label="停止"], button[aria-label="Stop"], button[data-testid="stop-button"], form button[aria-label*="停止"], form button[aria-label*="Stop"]');
      let stopVisible = false;
      for (const el of stopCands) {
        if (el.offsetParent !== null || el.getClientRects().length > 0) {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) { stopVisible = true; break; }
        }
      }
      return { composer, units, stopVisible, ok: composer && units > 0 && !stopVisible };
    });
    if (ready.ok) break;
    await page.waitForTimeout(2000);
  }
  if (!ready.ok) throw new Error(`静置门未通过: ${JSON.stringify(ready)}`);
  log(`静置门通过（units=${ready.units}，无停止按钮）；额外静置 ${IDLE_WAIT_MS}ms 供虚拟列表收敛`);
  await page.waitForTimeout(IDLE_WAIT_MS);

  // 与 gpt_dispatch.mjs 相同契约：两次完整读取 + 稳定性比对
  const firstStarted = Date.now();
  const first = await readReplySnapshot(page, SENT_USER_UNIT_KEY);
  await page.waitForTimeout(MIN_STABLE_READ_INTERVAL_MS);
  const secondStarted = Date.now();
  const second = await readReplySnapshot(page, SENT_USER_UNIT_KEY);
  const stability = compareInboundSnapshots(first, second, secondStarted - firstStarted);
  const stopAfter = await page.evaluate(() => {
    const stopCands = document.querySelectorAll(
      'button[aria-label="停止"], button[aria-label="Stop"], button[data-testid="stop-button"], form button[aria-label*="停止"], form button[aria-label*="Stop"]');
    for (const el of stopCands) {
      if (el.offsetParent !== null || el.getClientRects().length > 0) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) return true;
      }
    }
    return false;
  });
  const checks = {
    final_stop_button_not_visible: stopAfter === false,
    tail_is_assistant: first.tail?.role === "assistant" && second.tail?.role === "assistant",
    dil_uuid_present: typeof second.tail?.assistantUuid === "string" && second.tail.assistantUuid.length > 0,
    uuid_stable: first.tail?.assistantUuid === second.tail?.assistantUuid,
    stable_unit_read: stability.stable === true,
    target_range_materialized: first.range_proof?.complete === true && second.range_proof?.complete === true,
  };
  log(`checks=${JSON.stringify(checks)}`);
  if (!Object.values(checks).every(Boolean)) {
    throw new Error(`完成判定未通过: ${JSON.stringify(checks)}`);
  }

  const extractedAt = new Date().toISOString();
  const artifacts = persistInboundArtifacts({ directory: OUT_DIR, snapshot: second, extractedAt });
  log(`reply 已落盘: ${artifacts.reply.path}（${Buffer.byteLength(second.reply, "utf8")} 字节，${second.unit_count} unit）`);

  const result = {
    recollection: true,
    reference_failed_dispatch_dir: "dispatch-2026-11-14T13-06-53",
    failure_code: "INBOUND_WINDOW_COMPLETENESS_UNPROVEN",
    remediation: "非虚拟化静态 DOM 重新读取（错误自带指引），未重发任何消息",
    conversation_url: `https://chatgpt.com/c/${CONV_UUID}`,
    sent_user_unit_key: SENT_USER_UNIT_KEY,
    assistant_uuid: second.assistant_uuid,
    user_unit_key: second.user_unit_key,
    next_user_unit_key: second.next_user_unit_key,
    unit_keys: second.unit_keys,
    unit_count: second.unit_count,
    reply_bytes: Buffer.byteLength(second.reply, "utf8"),
    checks,
    stability,
    extracted_at: extractedAt,
    artifacts: { reply: artifacts.reply.path, raw_units: artifacts.rawUnits?.path ?? null },
  };
  writeFileSync(join(OUT_DIR, "result.json"), JSON.stringify(result, null, 2), "utf8");
  log("recoll COMPLETED");
  console.log(`RECOLL_DIR=${OUT_DIR}`);
} finally {
  try { if (browser) await browser.close(); } catch {}
  lock.release();
  log("会话锁已释放（补采）");
}
