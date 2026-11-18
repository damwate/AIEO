import { chromium } from "playwright";
const b = await chromium.connectOverCDP("http://127.0.0.1:9222");
try {
  const p = b.contexts()[0].pages()[0];
  const s = await p.evaluate(() => ({
    url: location.href,
    units: document.querySelectorAll("[data-content-search-unit-key]").length,
    composer: !!document.querySelector('[aria-label="询问 ChatGPT"],[aria-label="Ask ChatGPT"],#prompt-textarea'),
    bodyLen: (document.body?.innerText || "").length,
    tail: (document.body?.innerText || "").slice(-300),
  }));
  console.log(JSON.stringify(s, null, 2));
} finally {
  await b.close();
}
