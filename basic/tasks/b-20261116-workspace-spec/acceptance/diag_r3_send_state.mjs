// 只读诊断：R3 派单「发送双验未通过」现场状态（不发送、不修改 DOM）
import { chromium } from "playwright";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222", { timeout: 30000 });
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes("chatgpt.com")) || ctx.pages()[0];

const state = await page.evaluate(() => {
  const composer = document.querySelector('[aria-label="询问 ChatGPT"], [aria-label="Ask ChatGPT"], #prompt-textarea');
  const text = composer ? (composer.innerText || "") : "";
  const sendBtns = Array.from(document.querySelectorAll(
    'button[data-testid="send-button"], form button[aria-label*="发送"], form button[aria-label*="Send"]'
  )).map((b) => ({
    label: b.getAttribute("aria-label"), testid: b.getAttribute("data-testid"),
    disabled: b.disabled, ariaDisabled: b.getAttribute("aria-disabled"),
    visible: b.getClientRects().length > 0,
  }));
  const stopBtns = Array.from(document.querySelectorAll(
    'button[data-label="停止"], button[aria-label="停止"], button[aria-label="Stop"], button[data-testid="stop-button"]'
  )).map((b) => ({ label: b.getAttribute("aria-label"), visible: b.getClientRects().length > 0 }));
  const dialogs = Array.from(document.querySelectorAll('[role="dialog"]')).map((d) => ({
    text: (d.innerText || "").slice(0, 120), visible: d.getClientRects().length > 0,
  }));
  const units = Array.from(document.querySelectorAll("[data-content-search-unit-key]")).map((u) => ({
    key: u.getAttribute("data-content-search-unit-key"),
    searchRole: u.getAttribute("data-content-search-unit-role"),
  }));
  return {
    url: location.href, title: document.title,
    composer: { len: text.length, head: text.slice(0, 40) },
    sendBtns, stopBtns, dialogs,
    unitCount: units.length, unitKeys: units.map((u) => u.key),
    active: document.activeElement ? document.activeElement.tagName + ":" + (document.activeElement.getAttribute("contenteditable") ?? "") : null,
  };
});
console.log(JSON.stringify(state, null, 2));
await browser.close();
