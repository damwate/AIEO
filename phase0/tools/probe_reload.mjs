import { chromium } from "playwright";
const URL = "https://chatgpt.com/c/6afdc528-88ac-83ec-a9da-282ae6cf5432";
const b = await chromium.connectOverCDP("http://127.0.0.1:9222");
try {
  const p = b.contexts()[0].pages()[0];
  try {
    await p.goto(URL, { waitUntil: "domcontentloaded", timeout: 90000 });
    console.log("GOTO_OK");
  } catch (e) {
    console.log("GOTO_FAIL " + e.message);
  }
  await p.waitForTimeout(3000);
  const s = await p.evaluate(() => ({
    url: location.href,
    units: document.querySelectorAll("[data-content-search-unit-key]").length,
    composer: !!document.querySelector('[aria-label="询问 ChatGPT"],[aria-label="Ask ChatGPT"],#prompt-textarea'),
    bodyLen: (document.body?.innerText || "").length,
    tail: (document.body?.innerText || "").slice(-200),
  }));
  console.log(JSON.stringify(s, null, 2));
} finally {
  await b.close();
}
