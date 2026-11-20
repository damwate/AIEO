// 生产验收 · 硬重启缓存保留：整进程退出浏览器 → 同 Profile 重启 → 重进方案 3D → 统计回源。
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = "http://share.yotin.com.cn:8870";
const SCHEME_URL = `${BASE}/projects/f7ce76e6-ae98-410c-a0ad-deaedfbe6b4f/schemes/0c7869a6-8518-494f-84fc-e70b302d41ed`;
const OUT = "D:/AIEO/phase0/logs/share-cache-verify-20261120";
mkdirSync(OUT, { recursive: true });
const log = (m) => console.log(`[${new Date().toISOString()}] ${m}`);
const ASSET_SCOPE = /^https?:\/\/[^/]+\/(assets|thumbnails)\//;

const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
try {
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find((p) => p.url().includes("share.yotin.com.cn"));
  if (!page) throw new Error("未找到站点页");
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  const meta = new Map(); const bytes = new Map(); const urlById = new Map(); const served = new Set();
  let last = Date.now();
  cdp.on("Network.requestWillBeSent", (e) => { urlById.set(e.requestId, e.request.url); if (ASSET_SCOPE.test(e.request.url)) last = Date.now(); });
  cdp.on("Network.responseReceived", (e) => {
    const u = e.response.url || urlById.get(e.requestId);
    meta.set(e.requestId, { url: u, status: e.response.status, fromDisk: e.response.fromDiskCache === true, fromMem: e.response.fromMemoryCache === true });
    if (ASSET_SCOPE.test(u)) last = Date.now();
  });
  cdp.on("Network.requestServedFromCache", (e) => { if (urlById.has(e.requestId)) { served.add(urlById.get(e.requestId)); last = Date.now(); } });
  cdp.on("Network.loadingFinished", (e) => { if (urlById.has(e.requestId)) { bytes.set(e.requestId, e.encodedDataLength); if (ASSET_SCOPE.test(urlById.get(e.requestId))) last = Date.now(); } });

  await page.goto(SCHEME_URL);
  await page.waitForSelector(".pad-workspace > .plan canvas", { timeout: 45000 });
  await page.waitForTimeout(2500);
  await page.getByTestId("mini-3d-expand").click();
  await page.waitForSelector('[data-testid="three-page"]', { timeout: 45000 });
  const t0 = Date.now();
  while (Date.now() - last < 9000) { await page.waitForTimeout(500); if (Date.now() - t0 > 120000) break; }
  await page.waitForTimeout(1000);

  let srv200 = 0, srv304 = 0, local = 0, assetBytes = 0;
  const serverUrls = [];
  for (const [rid, m] of meta) {
    if (!ASSET_SCOPE.test(m.url)) continue;
    if (m.fromDisk || m.fromMem || served.has(m.url)) { local++; continue; }
    if (m.status === 304) srv304++; else if (m.status === 200) srv200++; else continue;
    assetBytes += bytes.get(rid) ?? 0;
    serverUrls.push(m.url.slice(0, 140));
  }
  log(`硬重启后重进多活动区：到服务器 200=${srv200} 304=${srv304} 传输=${(assetBytes / 1024).toFixed(0)}KB；本机命中=${local}`);
  serverUrls.forEach((u) => log(`  回源: ${u}`));
  writeFileSync(join(OUT, "s11-hard-restart.json"), JSON.stringify({ srv200, srv304, assetBytes, local, serverUrls }, null, 1), "utf8");
  console.log(`HARD_RESTART_RESULT=${JSON.stringify({ srv200, srv304, local })}`);
} finally {
  await browser.close().catch(() => {});
}
