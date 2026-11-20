// share.yotin 缓存复测 · 步骤4：跨方案复用——同一项目另一方案（生成方案6）进 3D，
// 观测先前已加载素材是否本机直读缓存；对仍回源的请求逐条归类（新素材/裸路径重验证/同版本重下载=可疑）。
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const BASE = "http://share.yotin.com.cn:8870";
const SCHEME_A_URL = `${BASE}/projects/b60402ed-fc4a-45f5-b47a-b95831b8d565/schemes/c8bbcd17-ba0e-4d7d-aa9c-74036be4b9c6`;
const SCHEME_B_URL = `${BASE}/projects/b60402ed-fc4a-45f5-b47a-b95831b8d565/schemes/61e384c6-af02-487e-aa15-1d325c09f589`;
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
const bare = (u) => u.split("?")[0];

const entry1 = JSON.parse(readFileSync(join(OUT, "entry1.json"), "utf8"));
const prevServerBare = new Set(entry1.server_list.map((x) => bare(x.url)));
const prevServerFull = new Set(entry1.server_list.map((x) => x.url));

const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
try {
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find((p) => p.url().includes("share.yotin.com.cn"));
  if (!page) throw new Error("未找到站点页");
  if (!page.url().includes(SCHEME_A_URL.split("/schemes/")[0].split("/projects/")[1].slice(0, 0))) { /* noop 占位 */ }

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

  log(`跨方案：直接打开同项目另一方案 ${SCHEME_B_URL}`);
  await page.goto(SCHEME_B_URL);
  await page.waitForSelector(".pad-workspace > .plan canvas", { timeout: 45000 });
  log("方案B 2D 画布已出现");
  await page.waitForTimeout(3000);
  await page.getByTestId("mini-3d-expand").click();
  await page.waitForSelector('[data-testid="three-page"]', { timeout: 45000 });
  log("方案B 3D 页面已出现，等待加载完整…");

  const t0 = Date.now();
  while (Date.now() - lastAssetActivity < 10000) {
    await page.waitForTimeout(500);
    if (Date.now() - t0 > 180000) { log("等待超时（180s），按当前状态结算"); break; }
  }
  log("资产静默达成");
  await page.waitForTimeout(2000);
  await page.screenshot({ path: join(OUT, "schemeB-3d.png"), fullPage: false });

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
    const wasPrev = prevServerBare.has(bare(m.url));
    const kind = !prevServerBare.has(bare(m.url)) ? "方案B新素材"
      : (prevServerFull.has(m.url) ? "同版本URL重下载(可疑)" : "同素材不同版本参数(重验证)");
    serverList.push({ url: m.url.slice(0, 180), status: m.status, bytes: b, kind });
  }
  const totals = Object.values(agg).reduce((s, x) => ({ server200: s.server200 + x.server200, server304: s.server304 + x.server304, serverBytes: s.serverBytes + x.serverBytes, cacheServed: s.cacheServed + x.cacheServed }), { server200: 0, server304: 0, serverBytes: 0, cacheServed: 0 });
  const result = { phase: "schemeB_cross", scheme_url: SCHEME_B_URL, agg, totals, server_list: serverList, extracted_at: new Date().toISOString() };
  writeFileSync(join(OUT, "schemeB.json"), JSON.stringify(result, null, 1), "utf8");
  log(`方案B指标：到服务器 200=${totals.server200} 304=${totals.server304} 传输=${(totals.serverBytes / 1024).toFixed(0)}KB；本机命中=${totals.cacheServed}`);
  for (const [name, a] of Object.entries(agg)) log(`  ${name}: 200=${a.server200} 304=${a.server304} bytes=${(a.serverBytes / 1024).toFixed(0)}KB cache=${a.cacheServed}`);
  log("---- 仍回源请求逐条归类 ----");
  serverList.forEach((x, i) => log(`  [${i + 1}] ${x.kind} status=${x.status} ${(x.bytes / 1024).toFixed(1)}KB ${x.url}`));
  const suspicious = serverList.filter((x) => x.kind.includes("可疑"));
  log(suspicious.length ? `!! 同版本 URL 重下载 ${suspicious.length} 条——共享素材缓存未命中，需排查` : "无同版本 URL 重下载——共享素材全部命中缓存 ✓");
} finally {
  await browser.close().catch(() => {});
}
