// 只读检查：指定会话页的 unit 列表与输入框状态（不发送、不改 DOM）
// --diagnose：附加只读诊断——上下文上限横幅关键词扫描、composer/发送键禁用态（b-20261122-session-ctx-mgmt）
import { chromium } from "playwright";

const diagnose = process.argv.includes("--diagnose");
const url = process.argv[2];
if (!url) { console.error("usage: node check_conv_units.mjs <conversation_url> [--diagnose]"); process.exit(2); }

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222", { timeout: 30000 });
const ctx = browser.contexts()[0];
let page = ctx.pages().find((p) => p.url().includes("chatgpt.com"));
if (!page) page = await ctx.newPage();

await page.setViewportSize({ width: 1920, height: 12000 }).catch(() => {});

const read = async () => page.evaluate((diagnose) => {
  const composer = document.querySelector('#prompt-textarea, [aria-label="询问 ChatGPT"], [aria-label="Ask ChatGPT"]');
  const text = composer ? (composer.innerText || "") : "";
  const units = Array.from(document.querySelectorAll("[data-content-search-unit-key]")).map((u) => ({
    key: u.getAttribute("data-content-search-unit-key"),
    role: u.getAttribute("data-content-search-unit-role"),
  }));
  const stop = Array.from(document.querySelectorAll('button[data-testid="stop-button"], button[aria-label="停止"], button[aria-label="Stop"]'))
    .filter((b) => b.getClientRects().length > 0).length;
  const out = {
    url: location.href,
    title: document.title,
    readyState: document.readyState,
    composerLen: text.length,
    composerHead: text.slice(0, 60),
    stopVisible: stop,
    unitCount: units.length,
    unitKeys: units.map((u) => u.key),
  };
  if (diagnose) {
    // 只读诊断（b-20261122-session-ctx-mgmt）：横幅关键词扫描 + 控件禁用态。
    // 关键词命中仅作诊断信息上报，不作发送状态门（手册 §5.1 禁文本匹配判状态的边界遵守）。
    const KW = ["上下文", "已达上限", "达到上限", "maximum length", "too long", "无法发送", "conversation is too long"];
    const hits = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const seen = new Set();
    while (walker.nextNode() && hits.length < 8) {
      const t = (walker.currentNode.textContent || "").trim();
      if (!t || t.length > 200 || seen.has(t)) continue;
      seen.add(t);
      const low = t.toLowerCase();
      if (KW.some((k) => low.includes(k.toLowerCase()))) hits.push(t.slice(0, 120));
    }
    const composerEl = document.querySelector('#prompt-textarea, [aria-label="询问 ChatGPT"], [aria-label="Ask ChatGPT"]');
    const sendBtn = Array.from(document.querySelectorAll('button[data-testid="send-button"], button[aria-label="发送"], button[aria-label="Send"]'))
      .filter((b) => b.getClientRects().length > 0)[0] || null;
    out.diagnose = {
      bannerKeywordHits: hits,
      composerContentEditable: composerEl ? composerEl.getAttribute("contenteditable") : null,
      composerDisabled: composerEl ? (composerEl.getAttribute("aria-disabled") || composerEl.getAttribute("disabled")) : null,
      sendButtonFound: !!sendBtn,
      sendButtonDisabled: sendBtn ? sendBtn.disabled : null,
    };
  }
  return out;
}, diagnose);

// 多次尝试导航，容忍慢链路
let navigated = false;
for (let i = 0; i < 3 && !navigated; i++) {
  try {
    await page.goto(url, { waitUntil: "commit", timeout: 45000 });
    navigated = true;
  } catch (e) {
    console.log(`goto attempt ${i + 1} failed: ${e.message.split("\n")[0]}`);
    await page.waitForTimeout(5000);
  }
}
await page.waitForTimeout(15000);

let state = await read();
for (let i = 0; i < 4 && state.unitCount < 4; i++) {
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
  await page.waitForTimeout(8000);
  state = await read();
}
console.log(JSON.stringify(state, null, 2));
await browser.close();
