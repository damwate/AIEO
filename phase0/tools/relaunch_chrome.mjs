// 一次性工具：安全拉起 gpt-poc profile Chrome（带 9222 调试端口）并直达指定会话页。
// 只杀 gpt-poc profile 实例（复刻 gpt_dispatch.killProfileChrome），不影响用户自己的 Chrome。
import { spawn, execFile } from "node:child_process";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PROFILE_DIR = "D:\\AIEO\\runtime\\chrome_profiles\\gpt-poc";
const CDP_URL = "http://127.0.0.1:9222";
const CONV_URL = process.argv[2] || "https://chatgpt.com/";

async function cdpReady() {
  try { return (await fetch(`${CDP_URL}/json/version`)).ok; } catch { return false; }
}
function killProfileChrome() {
  return new Promise((resolve) => {
    const ps = `Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.CommandLine -like '*gpt-poc*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
    execFile("powershell", ["-NoProfile", "-Command", ps], () => resolve());
  });
}

if (await cdpReady()) { console.log("CDP-already-ready"); process.exit(0); }
await killProfileChrome();
await new Promise((r) => setTimeout(r, 1500));
const child = spawn(CHROME, [
  "--remote-debugging-port=9222", "--remote-allow-origins=*",
  `--user-data-dir=${PROFILE_DIR}`, "--no-first-run", "--no-default-browser-check",
  "--disable-session-crashed-bubble", "--start-maximized", CONV_URL,
], { detached: true, stdio: "ignore" });
child.unref();
for (let i = 0; i < 45; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  if (await cdpReady()) { console.log(`chrome-up pid=${child.pid}`); process.exit(0); }
}
throw new Error("chrome-debug-port-not-ready");
