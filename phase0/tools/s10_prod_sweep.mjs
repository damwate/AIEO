// 生产验收清扫（只读）：多方案 2D+3D 全量观测，抓漏网之鱼。
// 抓什么：①任何 >=400 响应 ②版本化 URL 却返回 no-cache（覆盖缺口）③console/page 错误 ④意外的全量重下载。
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = "http://share.yotin.com.cn:8870";
const OUT = "D:/AIEO/phase0/logs/share-cache-verify-20261120";
mkdirSync(OUT, { recursive: true });
const log = (m) => console.log(`[${new Date().toISOString()}] ${m}`);

const SCHEMES = [
  { tag: "dong7", pid: "b60402ed-fc4a-45f5-b47a-b95831b8d565", sid: "c8bbcd17-ba0e-4d7d-aa9c-74036be4b9c6", note: "东海岸方案7（热）" },
  { tag: "duoActive", pid: "f7ce76e6-ae98-410c-a0ad-deaedfbe6b4f", sid: "0c7869a6-8518-494f-84fc-e70b302d41ed", note: "调试多活动区（热）" },
  { tag: "po1103s2", pid: "2648b383-09b6-4127-a4fd-1c2ad956c97b", sid: "2e0ce453-2687-475f-ad9e-df7558ad525f", note: "PO1103方案2（冷，27产品）" },
  { tag: "2w10", pid: "f63f189d-48fd-4ddc-974e-b1052fbff34e", sid: "dc87bcc5-70ad-430b-9ed5-790c34f52d00", note: "2w方案10（冷）" },
];
const ASSET_SCOPE = /^https?:\/\/[^/]+\/(assets|thumbnails)\//;
const isVersioned = (u) => /[?&](v|kv)=/.test(u);

const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
const findings = { errors: [], uncovered_versioned: [], console_errors: [], redownloads: [] };
try {
  const ctx = browser.contexts()[0];
  let page = ctx.pages().find((p) => p.url().includes("share.yotin.com.cn"));
  if (!page) { page = await ctx.newPage(); await page.goto(BASE + "/"); }
  const needLogin = await page.evaluate(() => !!document.querySelector('input[aria-label="账号"]'));
  if (needLogin) {
    await page.fill('input[aria-label="账号"]', "admin");
    await page.fill('input[aria-label="密码"]', "Youting@2026");
    await page.click('button:has-text("进入工作台")');
    await page.waitForFunction(() => !document.querySelector('input[aria-label="账号"]'), undefined, { timeout: 30000 });
    log("登录成功");
  }
  page.on("console", (msg) => { if (msg.type() === "error") findings.console_errors.push({ url: page.url().slice(0, 80), text: msg.text().slice(0, 200) }); });
  page.on("pageerror", (err) => findings.console_errors.push({ url: page.url().slice(0, 80), text: ("pageerror:" + err.message).slice(0, 200) }));

  const seenFullDownload = new Set(); // 已观测到的全量下载 URL（跨方案）
  for (const s of SCHEMES) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Network.enable");
    const meta = new Map(); const bytes = new Map(); const urlById = new Map(); const served = new Set();
    let last = Date.now();
    cdp.on("Network.requestWillBeSent", (e) => { urlById.set(e.requestId, e.request.url); if (ASSET_SCOPE.test(e.request.url)) last = Date.now(); });
    cdp.on("Network.responseReceived", (e) => {
      const u = e.response.url || urlById.get(e.requestId);
      meta.set(e.requestId, { url: u, status: e.response.status, cc: e.response.headers["Cache-Control"] || e.response.headers["cache-control"] || "", fromDisk: e.response.fromDiskCache === true, fromMem: e.response.fromMemoryCache === true });
      if (ASSET_SCOPE.test(u)) last = Date.now();
      if (e.response.status >= 400) findings.errors.push({ scheme: s.tag, url: u.slice(0, 180), status: e.response.status });
    });
    cdp.on("Network.requestServedFromCache", (e) => { if (urlById.has(e.requestId)) { served.add(urlById.get(e.requestId)); last = Date.now(); } });
    cdp.on("Network.loadingFinished", (e) => { if (urlById.has(e.requestId)) { bytes.set(e.requestId, e.encodedDataLength); if (ASSET_SCOPE.test(urlById.get(e.requestId))) last = Date.now(); } });

    log(`[${s.tag}] ${s.note} — 打开 ${s.sid}`);
    await page.goto(`${BASE}/projects/${s.pid}/schemes/${s.sid}`);
    await page.waitForSelector(".pad-workspace > .plan canvas", { timeout: 45000 });
    await page.waitForTimeout(2500);
    await page.getByTestId("mini-3d-expand").click();
    await page.waitForSelector('[data-testid="three-page"]', { timeout: 45000 });
    const t0 = Date.now();
    while (Date.now() - last < 9000) { await page.waitForTimeout(500); if (Date.now() - t0 > 120000) break; }
    await page.waitForTimeout(1000);

    let srv200 = 0, srv304 = 0, local = 0, assetBytes = 0;
    for (const [rid, m] of meta) {
      if (!ASSET_SCOPE.test(m.url)) continue;
      const isLocal = m.fromDisk || m.fromMem || served.has(m.url);
      if (isLocal) { local++; continue; }
      if (m.status === 304) srv304++; else if (m.status === 200) srv200++; else continue;
      assetBytes += bytes.get(rid) ?? 0;
      if (isVersioned(m.url) && /no-cache/i.test(m.cc)) findings.uncovered_versioned.push({ scheme: s.tag, url: m.url.slice(0, 180), status: m.status });
      const bare = m.url.split("?")[0];
      if (m.status === 200 && (bytes.get(rid) ?? 0) > 50000 && seenFullDownload.has(bare)) findings.redownloads.push({ scheme: s.tag, url: m.url.slice(0, 160), bytes: bytes.get(rid) });
      if (m.status === 200) seenFullDownload.add(bare);
    }
    log(`[${s.tag}] 资产：到服务器 200=${srv200} 304=${srv304} 传输=${(assetBytes / 1024).toFixed(0)}KB；本机命中=${local}`);
    cdp.detach().catch(() => {});
    await page.goto(BASE + "/projects"); // 离开 3D
    await page.waitForTimeout(1500);
  }
  writeFileSync(join(OUT, "s10-prod-sweep.json"), JSON.stringify(findings, null, 1), "utf8");
  log("==== 漏网之鱼清单 ====");
  log(`HTTP 错误响应（任意 URL）：${findings.errors.length}`);
  findings.errors.forEach((x) => log(`  [${x.scheme}] ${x.status} ${x.url}`));
  log(`版本化 URL 却 no-cache（覆盖缺口）：${findings.uncovered_versioned.length}`);
  findings.uncovered_versioned.forEach((x) => log(`  [${x.scheme}] ${x.status} ${x.url}`));
  log(`console/page 错误：${findings.console_errors.length}`);
  findings.console_errors.slice(0, 10).forEach((x) => log(`  [${x.url}] ${x.text}`));
  log(`同素材全量重复下载（>50KB）：${findings.redownloads.length}`);
  findings.redownloads.forEach((x) => log(`  [${x.scheme}] ${(x.bytes / 1024).toFixed(0)}KB ${x.url}`));
  if (!findings.errors.length && !findings.uncovered_versioned.length && !findings.console_errors.length && !findings.redownloads.length) log("四类异常全零 ✓");
} finally {
  await browser.close().catch(() => {});
}
