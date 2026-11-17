import { chromium } from "playwright";
const b = await chromium.connectOverCDP("http://127.0.0.1:9222");
const p = b.contexts()[0].pages()[0];
const r = await p.evaluate(() => {
  const t = document.body.innerText || "";
  return {
    composer: !!document.querySelector('[aria-label="询问 ChatGPT"], [aria-label="Ask ChatGPT"], #prompt-textarea'),
    rateLimit: /rate limit|消息数|上限|too many|稍后再试|达到.*限制|超出/i.test(t),
    tail: t.slice(-500),
    title: document.title,
  };
});
console.log(JSON.stringify(r, null, 2));
await b.close();
