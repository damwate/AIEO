// share.yotin 缓存复测 · 通用双轮：进 3D（首轮）→ 退出项目页 → 重进（次轮），输出两轮到服务器指标与对比。
// 用法：SCHEME_URL=... PROJECT_URL=... TAG=s1 node s5_two_entries.mjs
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const BASE = "http://share.yotin.com.cn:8870";
const SCHEME_URL = process.env.SCHEME_URL;
const PROJECT_URL = process.env.PROJECT_URL;
const TAG = process.env.TAG || "x";
if (!SCHEME_URL || !PROJECT_URL) { console.error("need SCHEME_URL/PROJECT_URL/TAG"); process.exit(2); }
const OUT = "D:/AIEO/phase0/logs/share-cache-verify-20261120";
mkdirSync(OUT, { recursive: true });
const log = (m) => console.log(`[${new Date().toISOString()}] ${m}`);

const ASSET_SCOPE = /^https?:\/\/[^/]+\/(assets|thumbnails)\//;
const CLS = [
  ["glb", /\.glb(\?|$)/],
  ["ktx2", /\.ktx2(\?|$)/],
  ["img", /\.(webp|png|jpe?g|avif|gif|svg|ico)(\?|$)/],
  ["other_asset", /\/(assets|thumbnails)\//],
];
const classify = (u) => { for (const [n, re] of CLS) if (re.test(u)) return n; return null; };

async function measureEntry(ctx, page, cdp, label) {
  const urlById = new Map(); const meta = new Map(); const servedFromCache = new Set(); const bytes = new Map();
  let lastAssetActivity = Date.now();
  cdp.on("Network.requestWillBeSent", (e) => { const u = e.request.url; if (!ASSET_SCOPE.test(u)) return; urlById.set(e.requestId, u); lastAssetActivity = Date.now(); });
  cdp.on("Network.responseReceived", (e) => { const u = e.response.url || urlById.get(e.requestId); if (!u || !ASSET_SCOPE.test(u)) return; meta.set(e.requestId, { url: u, cls: classify(u), status: e.response.status, fromDiskCache: e.response.fromDiskCache === true, fromMemoryCache: e.response.fromMemoryCache === true }); lastAssetActivity = Date.now(); });
  cdp.on("Network.requestServedFromCache", (e) => { if (urlById.has(e.requestId)) { servedFromCache.add(urlById.get(e.requestId)); lastAssetActivity = Date.now(); } });
  cdp.on("Network.loadingFinished", (e) => { if (urlById.has(e.requestId)) { bytes.set(e.requestId, e.encodedDataLength); lastAssetActivity = Date.now(); } });

  const t0 = Date.now();
  while (Date.now() - lastAssetActivity < 10000) {
    await page.waitForTimeout(500);
    if (Date.now() - t0 > 180000) { log(`${label}: 等待超时，按当前状态结算`); break; }
  }
  await page.waitForTimeout(2000);
  await page.screenshot({ path: join(OUT, `${TAG}-${label}.png`), fullPage: false });

  const agg = {}; for (const [n] of CLS) agg[n] = { server200: 0, server304: 0, serverBytes: 0, cacheServed: 0 };
  const serverList = [];
  for (const [rid, m] of meta) {
    const a = agg[m.cls] || agg.other_asset;
    if (m.fromDiskCache || m.fromMemoryCache || servedFromCache.has(m.url)) { a.cacheServed++; continue; }
    const b = bytes.get(rid) ?? 0;
    if (m.status === 304) a.server304++; else a.server200++;
    a.serverBytes += b;
    serverList.push({ url: m.url.slice(0, 180), status: m.status, bytes: b });
  }
  const totals = Object.values(agg).reduce((s, x) => ({ server200: s.server200 + x.server200, server304: s.server304 + x.server304, serverBytes: s.serverBytes + x.serverBytes, cacheServed: s.cacheServed + x.cacheServed }), { server200: 0, server304: 0, serverBytes: 0, cacheServed: 0 });
  return { tag: TAG, phase: label, agg, totals, server_list: serverList, extracted_at: new Date().toISOString() };
}

const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
try {
  const ctx = browser.contexts()[0];
  let page;
  if (process.env.NEWTAB === "1") {
    page = await ctx.newPage();
    log("已开新标签页（内存缓存冷启动，磁盘缓存保留）");
    await page.goto(BASE + "/projects");
    await page.waitForTimeout(3000);
  } else {
    page = ctx.pages().find((p) => p.url().includes("share.yotin.com.cn"));
  }
  if (!page) throw new Error("未找到站点页");

  // ---- 首轮 ----
  let cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  log(`[${TAG}] 首轮打开 ${SCHEME_URL}`);
  await page.goto(SCHEME_URL);
  await page.waitForSelector(".pad-workspace > .plan canvas", { timeout: 45000 });
  log(`[${TAG}] 2D 就绪，展开全屏 3D`);
  await page.waitForTimeout(3000);
  await page.getByTestId("mini-3d-expand").click();
  await page.waitForSelector('[data-testid="three-page"]', { timeout: 45000 });
  log(`[${TAG}] 3D 出现，等资产静默…`);
  const e1 = await measureEntry(ctx, page, cdp, "entry1");
  writeFileSync(join(OUT, `${TAG}-entry1.json`), JSON.stringify(e1, null, 1), "utf8");
  log(`[${TAG}] 首轮：到服务器 200=${e1.totals.server200} 304=${e1.totals.server304} 传输=${(e1.totals.serverBytes / 1024).toFixed(0)}KB 本机命中=${e1.totals.cacheServed}`);

  // ---- 退出并重进（换新 CDP 会话重挂观测器）----
  log(`[${TAG}] 退出到项目页 ${PROJECT_URL}`);
  await page.goto(PROJECT_URL);
  await page.waitForTimeout(4000);
  cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  log(`[${TAG}] 重进 ${SCHEME_URL}`);
  await page.goto(SCHEME_URL);
  await page.waitForSelector(".pad-workspace > .plan canvas", { timeout: 45000 });
  await page.waitForTimeout(3000);
  await page.getByTestId("mini-3d-expand").click();
  await page.waitForSelector('[data-testid="three-page"]', { timeout: 45000 });
  log(`[${TAG}] 3D 出现，等资产静默…`);
  const e2 = await measureEntry(ctx, page, cdp, "entry2");
  writeFileSync(join(OUT, `${TAG}-entry2.json`), JSON.stringify(e2, null, 1), "utf8");
  log(`[${TAG}] 次轮：到服务器 200=${e2.totals.server200} 304=${e2.totals.server304} 传输=${(e2.totals.serverBytes / 1024).toFixed(0)}KB 本机命中=${e2.totals.cacheServed}`);

  // ---- 对比 ----
  const c1 = e1.totals.server200 + e1.totals.server304, c2 = e2.totals.server200 + e2.totals.server304;
  log(`[${TAG}] 对比：请求数 ${c1} → ${c2}（↓${c1 ? Math.round((1 - c2 / c1) * 100) : 0}%）；传输 ${(e1.totals.serverBytes / 1024).toFixed(0)}KB → ${(e2.totals.serverBytes / 1024).toFixed(0)}KB`);
  if (e2.server_list.length) {
    log(`[${TAG}] 次轮仍回源（应仅为裸路径重验证）：`);
    e2.server_list.slice(0, 10).forEach((x) => log(`   ${x.status} ${(x.bytes / 1024).toFixed(1)}KB ${x.url}`));
  } else {
    log(`[${TAG}] 次轮零回源 ✓`);
  }
} finally {
  await browser.close().catch(() => {});
}
