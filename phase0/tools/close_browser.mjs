// 关闭自动化浏览器窗口（CDP 整体退出）
import { chromium } from "playwright";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222", { timeout: 30000 });
console.log("closing browser (version", browser.version() + ")…");
await browser.close();
console.log("closed");
