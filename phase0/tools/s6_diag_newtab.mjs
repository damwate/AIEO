// share.yotin 缓存复测 · 诊断：新标签页先落地同站首页再挂 CDP，统计全部请求事件判别「CDP失明 vs 全内存命中」。
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = "http://share.yotin.com.cn:8870";
const SCHEME_URL = `${BASE}/projects/84de7412-dfdb-4056-afc2-07057e20bc61/schemes/84685ddf-75d3-4390-8e9f-c053992095ce`;
const OUT = "D:/AIEO/phase0/logs/share-cache-verify-20261120";
mkdirSync(OUT, { recursive: true });
const log = (m) => console.log(`[${new Date().toISOString()}] ${m}`);
const ASSET_SCOPE = /^https?:\/\/[^/]+\/(assets|thumbnails)\//;

const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
try {
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();
  log("新标签页：先落地首页（等跨进程导航稳定）");
  await page.goto(BASE + "/projects");
  await page.waitForSelector(".pad-workspace > .plan canvas, body", { timeout: 30000 });
  await page.waitForTimeout(3000);

  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  let allReq = 0, assetReq = 0;
  const assetRows = [];
  const urlById = new Map(); const meta = new Map(); const served = new Set(); const bytes = new Map();
  let lastAssetActivity = Date.now();
  cdp.on("Network.requestWillBeSent", (e) => {
    allReq++;
    const u = e.request.url;
    if (!ASSET_SCOPE.test(u)) return;
    assetReq++; urlById.set(e.requestId, u); lastAssetActivity = Date.now();
  });
  cdp.on("Network.responseReceived", (e) => {
    const u = e.response.url || urlById.get(e.requestId);
    if (!u || !ASSET_SCOPE.test(u)) return;
    meta.set(e.requestId, { url: u, status: e.response.status, fromDiskCache: e.response.fromDiskCache === true, fromMemoryCache: e.response.fromMemoryCache === true });
    lastAssetActivity = Date.now();
  });
  cdp.on("Network.requestServedFromCache", (e) => { if (urlById.has(e.requestId)) { served.add(urlById.get(e.requestId)); lastAssetActivity = Date.now(); } });
  cdp.on("Network.loadingFinished", (e) => { if (urlById.has(e.requestId)) { bytes.set(e.requestId, e.encodedDataLength); lastAssetActivity = Date.now(); } });

  log("打开 10w 生成方案1 并展开 3D");
  await page.goto(SCHEME_URL);
  await page.waitForSelector(".pad-workspace > .plan canvas", { timeout: 45000 });
  await page.waitForTimeout(3000);
  await page.getByTestId("mini-3d-expand").click();
  await page.waitForSelector('[data-testid="three-page"]', { timeout: 45000 });
  const t0 = Date.now();
  while (Date.now() - lastAssetActivity < 10000) {
    await page.waitForTimeout(500);
    if (Date.now() - t0 > 120000) break;
  }
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(OUT, "s3-10w-fixed.png"), fullPage: false });
  log(`全部请求事件=${allReq}，资产请求事件=${assetReq}`);
  const local = [...meta.values()].filter((m) => m.fromDiskCache || m.fromMemoryCache || served.has(m.url)).length;
  const srv = [...meta.values()].filter((m) => !(m.fromDiskCache || m.fromMemoryCache || served.has(m.url)));
  log(`资产响应：可计数=${meta.size}，其中本机缓存=${local}，到服务器=${srv.length}（200:${srv.filter(x=>x.status===200).length} 304:${srv.filter(x=>x.status===304).length}）`);
  srv.slice(0, 10).forEach((x) => log(`  回源 ${x.status} ${x.url.slice(0, 120)}`));
  writeFileSync(join(OUT, "s3-10w-fixed.json"), JSON.stringify({ allReq, assetReq, metaSize: meta.size, local, server: srv }, null, 1), "utf8");
} finally {
  await browser.close().catch(() => {});
}
