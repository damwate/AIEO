// M2 浏览器会话生命周期（DEC-002：CDP 接管模式）。
//
//   - 普通方式启动系统 Chrome（专用 profile + 127.0.0.1:9222 调试端口），用户人工登录后
//     Playwright connectOverCDP 接管；不使用 Playwright 直启浏览器；
//   - 不使用任何隐身/绕过开关（项目红线）；启动参数与 phase0 POC 逐项一致；
//   - playwright 以动态 import 引入：M2 包内不捆绑 playwright，未安装时 fail-closed 报
//     BROWSER_DRIVER_UNAVAILABLE，纯逻辑（启动参数/URL 采集/就绪探测）可独立测试与使用。

import { spawn, execFile } from "node:child_process";
import { join } from "node:path";
import { AIEO_ROOT } from "./config.mjs";
import { controllerError } from "./errors.mjs";

export const CHATGPT_HOME = "https://chatgpt.com/";
export const DEFAULT_DEBUG_PORT = 9222;
export const DEFAULT_CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
export const DEFAULT_PROFILE_DIR = join(AIEO_ROOT, "runtime", "chrome_profiles", "gpt-controller");

const CDP_READY_TIMEOUT_MS = 45000;

function browserError(code, message, details = undefined) {
  return controllerError(code, message, details === undefined ? {} : { details });
}

// 专用 Chrome profile 启动参数（DEC-002；无任何隐身/自动化绕过开关）。
export function chromeLaunchArgs({ profileDir = DEFAULT_PROFILE_DIR, debugPort = DEFAULT_DEBUG_PORT, homeUrl = CHATGPT_HOME } = {}) {
  return [
    `--remote-debugging-port=${debugPort}`,
    "--remote-allow-origins=*",
    `--user-data-dir=${profileDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-session-crashed-bubble",
    "--start-maximized",
    homeUrl,
  ];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function cdpReady(debugPort = DEFAULT_DEBUG_PORT) {
  try {
    const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
    return response.ok;
  } catch {
    return false;
  }
}

// 杀掉属于本 profile 的 Chrome（只按 user-data-dir 过滤，不影响其他 Chrome 窗口）。
export function killProfileChrome(profileKey = "gpt-controller") {
  return new Promise((resolve) => {
    const ps = `Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.CommandLine -like '*${profileKey}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
    execFile("powershell", ["-NoProfile", "-Command", ps], () => resolve());
  });
}

// 启动系统 Chrome（普通方式，非 Playwright 直启）并等待调试端口就绪。
export async function startChromeWithDebugPort({
  chromePath = DEFAULT_CHROME_PATH,
  profileDir = DEFAULT_PROFILE_DIR,
  debugPort = DEFAULT_DEBUG_PORT,
  profileKey = "gpt-controller",
  log = () => {},
  isReady = cdpReady,
  spawnImpl = spawn,
} = {}) {
  if (await isReady(debugPort)) {
    log("复用已运行调试端口");
    return { reused: true };
  }
  await killProfileChrome(profileKey);
  await sleep(1500);
  const child = spawnImpl(chromePath, chromeLaunchArgs({ profileDir, debugPort }), {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  for (let i = 0; i < 45; i += 1) {
    await sleep(1000);
    if (await isReady(debugPort)) {
      log(`Chrome 已启动 pid=${child.pid}`);
      return { reused: false, pid: child.pid };
    }
  }
  throw browserError("CHROME_DEBUG_PORT_NOT_READY", "Chrome 调试端口未就绪", { debug_port: debugPort });
}

// CDP 接管：connectOverCDP 后挑选 chatgpt.com 页面（没有则新开）。
export async function attachChatgptPage({ debugPort = DEFAULT_DEBUG_PORT, timeoutMs = 30000 } = {}) {
  let playwright;
  try {
    playwright = await import("playwright");
  } catch (error) {
    throw browserError(
      "BROWSER_DRIVER_UNAVAILABLE",
      "playwright 未安装，无法执行 CDP 接管；请在部署环境安装依赖后重试（不使用任何绕过手段）",
      { cause: error.message },
    );
  }
  const browser = await playwright.chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`, { timeout: timeoutMs });
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find((p) => p.url().includes("chatgpt.com")) || ctx.pages()[0] || (await ctx.newPage());
  return { browser, page };
}

// 从当前页面 URL 提取 /c/<uuid> 会话 URL；取不到即为 null（草稿态/主页），调用方不得伪造。
export function extractConversationUrl(pageUrl) {
  if (typeof pageUrl !== "string") return null;
  const match = pageUrl.match(/chatgpt\.com\/(?:.*\/)?c\/([0-9a-f-]{36})/i);
  if (!match) return null;
  return {
    session_id: match[1],
    conversation_url: `https://chatgpt.com/c/${match[1]}`,
  };
}

// 已有会话 URL 就绪探测（unit > 0 + composer + body 文本充分）。
export function existingSessionReadyProbe(units, composerPresent, bodyLength) {
  return units > 0 && composerPresent === true && bodyLength > 300;
}
