// share.yotin 缓存复测 · 步骤1：打开站点，报告页面状态（登录页/已登录），截图留证。
// 可见 Chrome（9223 CDP 附加），只读观察不动页面。
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = "D:/AIEO/phase0/logs/share-cache-verify-20261120";
mkdirSync(OUT, { recursive: true });
const log = (m) => console.log(`[${new Date().toISOString()}] ${m}`);

const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
try {
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find((p) => p.url().includes("share.yotin.com.cn")) || ctx.pages()[0];
  log(`page url = ${page.url()}`);
  await page.waitForLoadState("load").catch(() => {});
  await page.waitForTimeout(4000);
  const state = await page.evaluate(() => ({
    title: document.title,
    bodyLen: document.body.innerText.length,
    hasAccountInput: !!document.querySelector('input[aria-label="账号"]'),
    hasPasswordInput: !!document.querySelector('input[aria-label="密码"]'),
    hasSubmit: !!Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.includes("进入工作台")),
    bodyHead: document.body.innerText.slice(0, 200),
  }));
  log(`state = ${JSON.stringify(state)}`);
  await page.screenshot({ path: join(OUT, "s1-open.png"), fullPage: false });
  log("screenshot saved: s1-open.png");
} finally {
  await browser.close().catch(() => {});
}
