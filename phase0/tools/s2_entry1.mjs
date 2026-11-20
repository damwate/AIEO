// share.yotin 缓存复测 · 步骤2：UI 登录 → 打开方案页（2D）→ 展开全屏 3D → 等资产静默 → 记录首轮（冷缓存）指标。
// 观测用 CDP Network（不启用 page.route，浏览器 HTTP 缓存保持原生开启）。
// 到服务器请求 = fromDiskCache/fromMemoryCache 均非真的响应；304 计回源；本机命中不计。
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = "http://share.yotin.com.cn:8870";
const SCHEME_URL = `${BASE}/projects/b60402ed-fc4a-45f5-b47a-b95831b8d565/schemes/c8bbcd17-ba0e-4d7d-aa9c-74036be4b9c6`;
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
  let page = ctx.pages().find((p) => p.url().includes("share.yotin.com.cn"));
  if (!page) { page = await ctx.newPage(); await page.goto(BASE + "/"); }

  // ---- UI 登录（可见输入）----
  const needLogin = await page.evaluate(() => !!document.querySelector('input[aria-label="账号"]'));
  if (needLogin) {
    log("登录页：填入 admin 凭据（可见输入）");
    await page.fill('input[aria-label="账号"]', "admin");
    await page.fill('input[aria-label="密码"]', "Youting@2026");
    await page.waitForTimeout(800);
    await page.click('button:has-text("进入工作台")');
    await page.waitForFunction(() => !document.querySelector('input[aria-label="账号"]'), undefined, { timeout: 30000 });
    log("登录成功，工作台已加载");
  } else {
    log("已有会话，跳过登录");
  }
  await page.waitForTimeout(2500);

  // ---- 挂观测器（进入方案前）----
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  const urlById = new Map();
  const meta = new Map(); // requestId -> {url, cls, status, fromDiskCache, fromMemoryCache}
  const servedFromCache = new Set();
  let lastAssetActivity = Date.now();
  cdp.on("Network.requestWillBeSent", (e) => {
    const u = e.request.url;
    if (!ASSET_SCOPE.test(u)) return;
    urlById.set(e.requestId, u);
    lastAssetActivity = Date.now();
  });
  cdp.on("Network.responseReceived", (e) => {
    const u = e.response.url || urlById.get(e.requestId);
    if (!u || !ASSET_SCOPE.test(u)) return;
    meta.set(e.requestId, {
      url: u, cls: classify(u),
      status: e.response.status,
      fromDiskCache: e.response.fromDiskCache === true,
      fromMemoryCache: e.response.fromMemoryCache === true,
    });
    lastAssetActivity = Date.now();
  });
  cdp.on("Network.requestServedFromCache", (e) => {
    if (urlById.has(e.requestId)) { servedFromCache.add(urlById.get(e.requestId)); lastAssetActivity = Date.now(); }
  });
  const bytes = new Map(); // requestId -> encodedDataLength
  cdp.on("Network.loadingFinished", (e) => {
    if (urlById.has(e.requestId)) { bytes.set(e.requestId, e.encodedDataLength); lastAssetActivity = Date.now(); }
  });

  // ---- 打开方案页（2D）→ 展开全屏 3D ----
  log(`打开方案页 ${SCHEME_URL}`);
  await page.goto(SCHEME_URL);
  await page.waitForSelector(".pad-workspace > .plan canvas", { timeout: 45000 });
  log("2D 画布已出现");
  await page.waitForTimeout(3000);
  log("点击展开全屏 3D");
  await page.getByTestId("mini-3d-expand").click();
  await page.waitForSelector('[data-testid="three-page"]', { timeout: 45000 });
  log("3D 页面已出现，等待模型与贴图加载完整…");

  // ---- 资产静默判定：连续 10 秒无资产请求活动 ----
  const t0 = Date.now();
  while (Date.now() - lastAssetActivity < 10000) {
    await page.waitForTimeout(500);
    if (Date.now() - t0 > 180000) { log("等待超时（180s），按当前状态结算"); break; }
  }
  log("资产静默达成（10s 无新资产活动）");
  await page.waitForTimeout(2000);
  await page.screenshot({ path: join(OUT, "entry1-3d.png"), fullPage: false });

  // ---- 结算指标 ----
  const agg = {};
  for (const [name] of CLS) agg[name] = { server200: 0, server304: 0, serverBytes: 0, cacheServed: 0 };
  const serverList = [];
  for (const [rid, m] of meta) {
    const a = agg[m.cls] || agg.other_asset;
    const local = m.fromDiskCache || m.fromMemoryCache || servedFromCache.has(m.url);
    if (local) { a.cacheServed++; continue; }
    const b = bytes.get(rid) ?? 0;
    if (m.status === 304) a.server304++;
    else a.server200++;
    a.serverBytes += b;
    serverList.push({ url: m.url.slice(0, 180), status: m.status, bytes: b });
  }
  const totals = Object.values(agg).reduce((s, x) => ({ server200: s.server200 + x.server200, server304: s.server304 + x.server304, serverBytes: s.serverBytes + x.serverBytes, cacheServed: s.cacheServed + x.cacheServed }), { server200: 0, server304: 0, serverBytes: 0, cacheServed: 0 });
  const result = { phase: "entry1", scheme_url: SCHEME_URL, agg, totals, server_list: serverList, extracted_at: new Date().toISOString() };
  writeFileSync(join(OUT, "entry1.json"), JSON.stringify(result, null, 1), "utf8");
  log(`首轮指标：到服务器 200=${totals.server200} 304=${totals.server304} 传输=${(totals.serverBytes / 1024).toFixed(0)}KB；本机命中=${totals.cacheServed}`);
  for (const [name, a] of Object.entries(agg)) log(`  ${name}: 200=${a.server200} 304=${a.server304} bytes=${(a.serverBytes / 1024).toFixed(0)}KB cache=${a.cacheServed}`);
} finally {
  await browser.close().catch(() => {});
}
