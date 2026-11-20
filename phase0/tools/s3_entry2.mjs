// share.yotin 缓存复测 · 步骤3：退出（回项目页）→ 重新进入同一方案 → 再进 3D → 等静默 → 记录次轮指标并对比首轮。
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const BASE = "http://share.yotin.com.cn:8870";
const SCHEME_URL = `${BASE}/projects/b60402ed-fc4a-45f5-b47a-b95831b8d565/schemes/c8bbcd17-ba0e-4d7d-aa9c-74036be4b9c6`;
const PROJECT_URL = `${BASE}/projects/b60402ed-fc4a-45f5-b47a-b95831b8d565`;
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
function classify(url) {
  for (const [name, re] of CLS) if (re.test(url)) return name;
  return null;
}

const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
try {
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find((p) => p.url().includes("share.yotin.com.cn"));
  if (!page) throw new Error("未找到站点页");

  // ---- 挂观测器（退出动作前）----
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  const urlById = new Map();
  const meta = new Map();
  const servedFromCache = new Set();
  const bytes = new Map();
  let lastAssetActivity = Date.now();
  cdp.on("Network.requestWillBeSent", (e) => {
    const u = e.request.url;
    if (!ASSET_SCOPE.test(u)) return;
    urlById.set(e.requestId, u); lastAssetActivity = Date.now();
  });
  cdp.on("Network.responseReceived", (e) => {
    const u = e.response.url || urlById.get(e.requestId);
    if (!u || !ASSET_SCOPE.test(u)) return;
    meta.set(e.requestId, { url: u, cls: classify(u), status: e.response.status, fromDiskCache: e.response.fromDiskCache === true, fromMemoryCache: e.response.fromMemoryCache === true });
    lastAssetActivity = Date.now();
  });
  cdp.on("Network.requestServedFromCache", (e) => {
    if (urlById.has(e.requestId)) { servedFromCache.add(urlById.get(e.requestId)); lastAssetActivity = Date.now(); }
  });
  cdp.on("Network.loadingFinished", (e) => {
    if (urlById.has(e.requestId)) { bytes.set(e.requestId, e.encodedDataLength); lastAssetActivity = Date.now(); }
  });

  // ---- 退出：回项目页（真实离开 3D）----
  log(`退出 3D：返回项目页 ${PROJECT_URL}`);
  await page.goto(PROJECT_URL);
  await page.waitForTimeout(4000);
  log("已离开方案页，4 秒后重新进入同一方案");

  // ---- 重新进入同一方案 → 全屏 3D ----
  log(`重新打开 ${SCHEME_URL}`);
  await page.goto(SCHEME_URL);
  await page.waitForSelector(".pad-workspace > .plan canvas", { timeout: 45000 });
  log("2D 画布已出现");
  await page.waitForTimeout(3000);
  await page.getByTestId("mini-3d-expand").click();
  await page.waitForSelector('[data-testid="three-page"]', { timeout: 45000 });
  log("3D 页面已出现，等待加载完整…");

  const t0 = Date.now();
  while (Date.now() - lastAssetActivity < 10000) {
    await page.waitForTimeout(500);
    if (Date.now() - t0 > 180000) { log("等待超时（180s），按当前状态结算"); break; }
  }
  log("资产静默达成");
  await page.waitForTimeout(2000);
  await page.screenshot({ path: join(OUT, "entry2-3d.png"), fullPage: false });

  // ---- 结算 ----
  const agg = {};
  for (const [name] of CLS) agg[name] = { server200: 0, server304: 0, serverBytes: 0, cacheServed: 0 };
  const serverList = [];
  for (const [rid, m] of meta) {
    const a = agg[m.cls] || agg.other_asset;
    const local = m.fromDiskCache || m.fromMemoryCache || servedFromCache.has(m.url);
    if (local) { a.cacheServed++; continue; }
    const b = bytes.get(rid) ?? 0;
    if (m.status === 304) a.server304++; else a.server200++;
    a.serverBytes += b;
    serverList.push({ url: m.url.slice(0, 180), status: m.status, bytes: b });
  }
  const totals = Object.values(agg).reduce((s, x) => ({ server200: s.server200 + x.server200, server304: s.server304 + x.server304, serverBytes: s.serverBytes + x.serverBytes, cacheServed: s.cacheServed + x.cacheServed }), { server200: 0, server304: 0, serverBytes: 0, cacheServed: 0 });
  const result = { phase: "entry2", agg, totals, server_list: serverList, extracted_at: new Date().toISOString() };
  writeFileSync(join(OUT, "entry2.json"), JSON.stringify(result, null, 1), "utf8");
  log(`次轮指标：到服务器 200=${totals.server200} 304=${totals.server304} 传输=${(totals.serverBytes / 1024).toFixed(0)}KB；本机命中=${totals.cacheServed}`);

  // ---- 对比 ----
  const e1 = JSON.parse(readFileSync(join(OUT, "entry1.json"), "utf8"));
  log("=========== 两轮对比（到服务器口径：304 计回源，本机命中不计）===========");
  const row = (n, a, b) => `${n.padEnd(12)} 首轮: 请求数=${(a.server200 + a.server304).toString().padStart(3)} 字节=${(a.serverBytes / 1024).toFixed(0).padStart(6)}KB   次轮: 请求数=${(b.server200 + b.server304).toString().padStart(3)} 字节=${(b.serverBytes / 1024).toFixed(0).padStart(6)}KB   本机命中=${b.cacheServed}`;
  for (const [name] of CLS) log(row(name, e1.agg[name] || {}, agg[name] || {}));
  const t1 = e1.totals, t2 = totals;
  const cnt1 = t1.server200 + t1.server304, cnt2 = t2.server200 + t2.server304;
  log(row("合计", t1, t2));
  log(`请求数降幅: ${cnt1} → ${cnt2}（↓${cnt1 ? Math.round((1 - cnt2 / cnt1) * 100) : 0}%）；传输降幅: ${(t1.serverBytes / 1024).toFixed(0)}KB → ${(t2.serverBytes / 1024).toFixed(0)}KB（↓${t1.serverBytes ? Math.round((1 - t2.serverBytes / t1.serverBytes) * 100) : 0}%）`);
} finally {
  await browser.close().catch(() => {});
}
