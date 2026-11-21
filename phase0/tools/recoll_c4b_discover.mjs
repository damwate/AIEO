// C4-B 现场 UUID 发现（实例域补采的 UUID 恢复步骤；只读，不发送）：
// 连接 agent-b 实例浏览器（9301），读取侧栏首条会话链接。派生自 recoll 驱动谱系。
import { chromium } from "playwright";
import { acquireSessionLock } from "../e2e-poc/session_lock.mjs";
const lock = acquireSessionLock({ holder: "recoll-c4b-discover", lockPath: "D:/AIEO/runtime/locks/gpt-session-agent-b.lockfile" });
const browser = await chromium.connectOverCDP("http://127.0.0.1:9301", { timeout: 30000 });
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes("chatgpt.com")) || ctx.pages()[0];
await page.waitForTimeout(4000);
const links = await page.evaluate(() => {
  const anchors = [...document.querySelectorAll('a[href*="/c/"]')];
  return anchors.slice(0, 3).map((a) => a.getAttribute("href"));
});
console.log("SIDEBAR_LINKS=" + JSON.stringify(links));
await browser.close().catch(() => {});
lock.release();
