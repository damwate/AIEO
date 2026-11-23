// 只读诊断 R8 派单目标：是否登录 / 目标会话是否可访问 / 重定向链。不发送任何消息。
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const OUT = "D:/AIEO/phase0/logs/diag-r8-target-20261123";
mkdirSync(OUT, { recursive: true });
const TARGET = "https://chatgpt.com/c/6b02a805-88f0-83ec-8fa3-ff4f30e21f65";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222", { timeout: 30000 });
const ctx = browser.contexts()[0];
let page = ctx.pages().find((p) => p.url().includes("chatgpt.com")) || (await ctx.newPage());
await page.setViewportSize({ width: 1600, height: 900 }).catch(() => {});

const redirects = [];
page.on("framenavigated", (f) => {
  if (f === page.mainFrame()) redirects.push(f.url());
});

let status = null;
try {
  const resp = await page.goto(TARGET, { waitUntil: "domcontentloaded", timeout: 45000 });
  status = resp ? resp.status() : null;
} catch (e) {
  redirects.push(`GOTO_ERR: ${e.message.split("\n")[0]}`);
}
await page.waitForTimeout(12000);

const snap = await page.evaluate(() => {
  const bodyText = (document.body?.innerText || "").slice(0, 1500);
  const lower = bodyText.toLowerCase();
  const loginSignals = ["log in", "sign up", "登录", "注册", "upgrade plan"];
  const sessionSignals = ["new chat", "新建聊天", "chatgpt", "ask anything", "询问"];
  const sidebar = document.querySelectorAll('nav, [data-testid="sidebar"], aside');
  const userMenu = Array.from(document.querySelectorAll('button, [role="button"]')).filter((b) => {
    const t = (b.getAttribute("aria-label") || b.textContent || "").toLowerCase();
    return t.includes("account") || t.includes("profile") || t.includes("用户") || t.includes("账户");
  }).length;
  const units = document.querySelectorAll("[data-content-search-unit-key]").length;
  return {
    url: location.href,
    title: document.title,
    unitCount: units,
    sidebarCount: sidebar.length,
    userMenuButtons: userMenu,
    loginSignalHits: loginSignals.filter((k) => lower.includes(k)),
    sessionSignalHits: sessionSignals.filter((k) => lower.includes(k)),
    bodyHead: bodyText.slice(0, 600),
  };
});

const out = { target: TARGET, httpStatus: status, redirects, snap };
writeFileSync(`${OUT}/diag.json`, JSON.stringify(out, null, 2), "utf8");
console.log(JSON.stringify(out, null, 2));
await browser.close();
