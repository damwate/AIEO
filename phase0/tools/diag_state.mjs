import { chromium } from "playwright";
const CONV_UUID = "6afd9f0c-ff44-83ee-973f-55c1b302d0c0";
const b = await chromium.connectOverCDP("http://127.0.0.1:9222");
const ctx = b.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes("chatgpt.com/c/")) || ctx.pages()[0];
const info = await page.evaluate(() => {
  const stop = [...document.querySelectorAll('button')].filter(el => {
    const a = (el.getAttribute('aria-label') || '').toLowerCase();
    return a.includes('stop') || a.includes('停止');
  }).map(el => ({ label: el.getAttribute('aria-label'), rect: el.getBoundingClientRect().width > 0 }));
  const body = document.body.innerText || '';
  const tail = body.slice(-1200);
  const errWords = ['error', 'something went wrong', '出错了', '重试', 'try again', 'rate limit', '限制'].filter(w => tail.toLowerCase().includes(w));
  return { stop, tail, errWords, url: location.href };
});
console.log(JSON.stringify(info, null, 2));
await b.close();
