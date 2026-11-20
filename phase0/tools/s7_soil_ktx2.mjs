// share.yotin 缓存复测 · 土壤.ktx2 多次请求诊断：抓取该纹理全部请求形态（原始 URL/解码/参数序/kv 有无/响应头/fromDiskCache/发起者）。
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = "http://share.yotin.com.cn:8870";
const SCHEME_URL = `${BASE}/projects/b60402ed-fc4a-45f5-b47a-b95831b8d565/schemes/c8bbcd17-ba0e-4d7d-aa9c-74036be4b9c6`;
const PROJECT_URL = `${BASE}/projects/b60402ed-fc4a-45f5-b47a-b95831b8d565`;
const OUT = "D:/AIEO/phase0/logs/share-cache-verify-20261120";
mkdirSync(OUT, { recursive: true });
const log = (m) => console.log(`[${new Date().toISOString()}] ${m}`);
const SOIL = (u) => /%E5%9C%9F%E5%A3%A4|土壤/i.test(decodeURIComponent(u));

const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
try {
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find((p) => p.url().includes("share.yotin.com.cn"));
  if (!page) throw new Error("未找到站点页");

  async function observe(label, nav) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Network.enable");
    const rows = [];
    cdp.on("Network.requestWillBeSent", (e) => {
      if (!SOIL(e.request.url)) return;
      rows.push({ phase: label, url: e.request.url, initiator: e.initiator ? (e.initiator.type + ":" + JSON.stringify(e.initiator.stack?.callFrames?.[0]?.url || e.initiator.scriptId || "").slice(0, 120)) : "?", ts: e.timestamp });
    });
    cdp.on("Network.responseReceived", (e) => {
      if (!SOIL(e.response.url)) return;
      const r = rows.find((x) => !x.status && x.url === e.response.url) || rows[rows.length - 1];
      if (r) { r.status = e.response.status; r.fromDiskCache = e.response.fromDiskCache === true; r.fromMemoryCache = e.response.fromMemoryCache === true; r.cacheControl = e.response.headers["Cache-Control"] || e.response.headers["cache-control"] || "?"; }
    });
    cdp.on("Network.loadingFinished", (e) => {
      const r = rows.find((x) => !x.bytes && x.ts);
      if (r) r.bytes = e.encodedDataLength;
    });
    await nav();
    const t0 = Date.now();
    let last = Date.now();
    // 资产静默（任意请求即刷新计时，这里只需等 3D 加载完）
    cdp.on("Network.requestWillBeSent", () => { last = Date.now(); });
    cdp.on("Network.responseReceived", () => { last = Date.now(); });
    while (Date.now() - last < 10000) { await page.waitForTimeout(500); if (Date.now() - t0 > 150000) break; }
    await page.waitForTimeout(1500);
    cdp.detach().catch(() => {});
    return rows;
  }

  log("第 1 轮：打开方案7 进 3D");
  const rows1 = await observe("entry1", async () => {
    await page.goto(SCHEME_URL);
    await page.waitForSelector(".pad-workspace > .plan canvas", { timeout: 45000 });
    await page.waitForTimeout(3000);
    await page.getByTestId("mini-3d-expand").click();
    await page.waitForSelector('[data-testid="three-page"]', { timeout: 45000 });
  });

  log("退出并重进（第 2 轮）");
  const rows2 = await observe("entry2", async () => {
    await page.goto(PROJECT_URL);
    await page.waitForTimeout(3000);
    await page.goto(SCHEME_URL);
    await page.waitForSelector(".pad-workspace > .plan canvas", { timeout: 45000 });
    await page.waitForTimeout(3000);
    await page.getByTestId("mini-3d-expand").click();
    await page.waitForSelector('[data-testid="three-page"]', { timeout: 45000 });
  });

  const all = [...rows1, ...rows2];
  log(`土壤相关请求共 ${all.length} 条：`);
  all.forEach((r, i) => log(`  [${i + 1}] ${r.phase} status=${r.status} disk=${r.fromDiskCache} mem=${r.fromMemoryCache} bytes=${r.bytes} cc=${r.cacheControl}\n      url=${r.url.slice(0, 200)}\n      init=${r.initiator}`));
  // 归一化对比：参数序 + kv 有无
  const norm = all.map((r) => { try { const u = new URL(r.url); return u.pathname + "?" + u.searchParams.toString(); } catch { return r.url; } });
  const uniq = [...new Set(norm)];
  log(`归一化后 URL 形态数 = ${uniq.length}：`);
  uniq.forEach((u) => log(`  ${u.slice(0, 220)}`));
  writeFileSync(join(OUT, "s7-soil-ktx2.json"), JSON.stringify(all, null, 1), "utf8");
} finally {
  await browser.close().catch(() => {});
}
