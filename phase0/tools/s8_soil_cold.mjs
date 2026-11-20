// 土壤.ktx2 冷缓存首载诊断：全新 Profile 首次进 3D，统计该纹理的请求数与形态（并发重复 vs 合并）。
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = "http://share.yotin.com.cn:8870";
const SCHEME_URL = `${BASE}/projects/b60402ed-fc4a-45f5-b47a-b95831b8d565/schemes/c8bbcd17-ba0e-4d7d-aa9c-74036be4b9c6`;
const OUT = "D:/AIEO/phase0/logs/share-cache-verify-20261120";
mkdirSync(OUT, { recursive: true });
const log = (m) => console.log(`[${new Date().toISOString()}] ${m}`);
const SOIL = (u) => /%E5%9C%9F%E5%A3%A4|土壤/i.test(decodeURIComponent(u));

const browser = await chromium.connectOverCDP("http://127.0.0.1:9224");
try {
  const ctx = browser.contexts()[0];
  const page = ctx.pages()[0] || (await ctx.newPage());
  await page.goto(BASE + "/");
  await page.waitForTimeout(2000);
  const needLogin = await page.evaluate(() => !!document.querySelector('input[aria-label="账号"]'));
  if (needLogin) {
    await page.fill('input[aria-label="账号"]', "admin");
    await page.fill('input[aria-label="密码"]', "Youting@2026");
    await page.click('button:has-text("进入工作台")');
    await page.waitForFunction(() => !document.querySelector('input[aria-label="账号"]'), undefined, { timeout: 30000 });
    log("冷 Profile 登录成功");
    await page.waitForTimeout(2000);
  }

  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  const rows = [];
  cdp.on("Network.requestWillBeSent", (e) => {
    if (!SOIL(e.request.url)) return;
    rows.push({ url: e.request.url, ts: e.timestamp, frame: e.frameId });
  });
  cdp.on("Network.responseReceived", (e) => {
    if (!SOIL(e.response.url)) return;
    const r = rows.find((x) => !x.status) || rows[rows.length - 1];
    if (r) { r.status = e.response.status; r.fromDiskCache = e.response.fromDiskCache === true; r.cc = e.response.headers["Cache-Control"] || "?"; }
  });
  cdp.on("Network.loadingFinished", (e) => {
    const r = rows.find((x) => x.bytes === undefined);
    if (r) r.bytes = e.encodedDataLength;
  });

  await page.goto(SCHEME_URL);
  await page.waitForSelector(".pad-workspace > .plan canvas", { timeout: 45000 });
  await page.waitForTimeout(3000);
  await page.getByTestId("mini-3d-expand").click();
  await page.waitForSelector('[data-testid="three-page"]', { timeout: 45000 });
  const t0 = Date.now();
  let last = Date.now();
  cdp.on("Network.requestWillBeSent", () => { last = Date.now(); });
  cdp.on("Network.responseReceived", () => { last = Date.now(); });
  while (Date.now() - last < 10000) { await page.waitForTimeout(500); if (Date.now() - t0 > 150000) break; }
  await page.waitForTimeout(1500);

  log(`冷缓存首载：土壤相关请求 ${rows.length} 条`);
  rows.forEach((r, i) => log(`  [${i + 1}] status=${r.status} disk=${r.fromDiskCache} bytes=${r.bytes} cc=${r.cc}\n      ${r.url.slice(0, 180)}`));
  writeFileSync(join(OUT, "s8-soil-cold.json"), JSON.stringify(rows, null, 1), "utf8");
} finally {
  await browser.close().catch(() => {});
}
