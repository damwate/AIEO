#!/usr/bin/env node
// toolkit/check-push.mjs —— Git 推送诊断与执行（L-014 路径固化）。
// 路径：①绕仓库代理直连 → ②失败探测活代理端口重试 → ③仍失败输出精确报告（操作/路径/建议三要素）。
// 共识约束（version-directory-plan v1.0 §4）：执行前需确认；诊断失败不得擅自改变 Git 配置（只报告）；端口可配置。
// 本脚本只读解析 Git 配置，任何情况下不写入/修改 .git/config（-c 命令行临时覆盖不是改配置）。
//
// 用法：
//   node toolkit/check-push.mjs                诊断模式：dry-run 试推各路径，不真正推送
//   node toolkit/check-push.mjs --push         诊断 + 真实推送（TTY 交互确认；非 TTY 拒绝，需 --yes）
//   node toolkit/check-push.mjs --push --yes   非交互确认推送（仅在已获用户授权时使用）
//   --ports 10391,6822                         附加候选代理端口
// 端口候选来源：只读解析仓库代理配置 ∪ 环境变量 AIEO_CHECK_PORTS ∪ --ports
// 退出码：0 成功 / 1 推送失败或无可用路径 / 2 环境错误 / 3 用户取消
import { execFile } from "node:child_process";
import net from "node:net";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import readline from "node:readline/promises";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const doPush = argv.includes("--push");
const yes = argv.includes("--yes");
const pi = argv.indexOf("--ports");
const extraPorts = pi >= 0 ? String(argv[pi + 1] || "").split(",").map((s) => s.trim()).filter(Boolean) : [];

const GIT_TIMEOUT = doPush ? 180000 : 120000;
function git(cwd, gitArgs, timeoutMs = GIT_TIMEOUT) {
  return new Promise((resolve) => {
    execFile("git", gitArgs, { cwd, timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024, encoding: "utf8", windowsHide: true }, (err, stdout, stderr) => {
      resolve({ ok: !err, code: err && typeof err.code === "number" ? err.code : err ? 1 : 0, stdout: String(stdout || ""), stderr: String(stderr || "") });
    });
  });
}
const squash = (s, n = 400) => { const t = String(s || "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n) + "…" : t; };
const maskUrl = (u) => (u ? u.replace(/\/\/[^@/]+@/, "//***@") : u);

function probePort(port, host = "127.0.0.1", timeoutMs = 2000) {
  return new Promise((resolve) => {
    const s = net.connect({ host, port: Number(port) });
    const done = (ok) => { try { s.destroy(); } catch {} resolve(ok); };
    s.setTimeout(timeoutMs, () => done(false));
    s.once("connect", () => done(true));
    s.once("error", () => done(false));
  });
}

// —— 定位 Git 根（不依赖启动目录）——
const rootRes = await git(scriptDir, ["rev-parse", "--show-toplevel"], 15000);
if (!rootRes.ok) {
  console.error("[check-push] FAIL 定位 Git 根失败（脚本须在仓库内）：", squash(rootRes.stderr, 200));
  process.exit(2);
}
const root = rootRes.stdout.trim();

// —— 基本信息 ——
const branch = (await git(root, ["rev-parse", "--abbrev-ref", "HEAD"], 15000)).stdout.trim();
const upRes = await git(root, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], 15000);
const upstream = upRes.ok ? upRes.stdout.trim() : null;
const remoteUrlRes = await git(root, ["remote", "get-url", ((upstream || "").split("/")[0] || "origin")], 15000);
const remoteUrl = remoteUrlRes.ok ? remoteUrlRes.stdout.trim() : null;
let ahead = 0, behind = 0;
if (upstream) {
  const c = await git(root, ["rev-list", "--left-right", "--count", `${upstream}...HEAD`], 15000);
  if (c.ok) { const [b, a] = c.stdout.trim().split(/\t/).map(Number); behind = b || 0; ahead = a || 0; }
}

// —— 只读解析代理配置（不改写）——
const proxyEntries = [];
const cfg = await git(root, ["config", "--get-regexp", String.raw`^http(\..+)?\.proxy$`], 15000);
if (cfg.ok) {
  for (const line of cfg.stdout.split("\n")) {
    const t = line.trim(); if (!t) continue;
    const sp = t.indexOf(" ");
    if (sp > 0) proxyEntries.push({ key: t.slice(0, sp), val: t.slice(sp + 1).trim() });
  }
}
const cfgPorts = new Set();
for (const e of proxyEntries) { try { const u = new URL(e.val); if (u.port) cfgPorts.add(u.port); } catch {} }
const envPorts = String(process.env.AIEO_CHECK_PORTS || "").split(",").map((s) => s.trim()).filter(Boolean);
const candidates = [...new Set([...cfgPorts, ...envPorts, ...extraPorts])];

console.log(`[check-push] 仓库=${root}`);
console.log(`[check-push] 分支=${branch} 上游=${upstream || "（无）"} ahead=${ahead} behind=${behind} remote=${maskUrl(remoteUrl)}`);
for (const e of proxyEntries) console.log(`[check-push] 代理配置(只读) ${e.key} = ${maskUrl(e.val)}`);

// —— 前置判断：无 upstream 不尝试（-u 会写分支配置，须用户决定）；ahead=0 无需推送 ——
if (!upstream) {
  console.log(`[check-push] 无 upstream：不尝试推送（-u 会写入分支配置，须用户决定）。建议人工确认后：git push -u origin ${branch}`);
  process.exit(1);
}
if (ahead === 0 && !doPush) { console.log("[check-push] ahead=0，无需推送。诊断完成。"); process.exit(0); }
if (ahead === 0 && doPush) { console.log("[check-push] ahead=0，远端已是最新，无需推送。"); process.exit(0); }
if (behind > 0) console.log(`[check-push] 注意 behind=${behind}：远端有新提交，推送可能被拒（先 pull/rebase 由用户决定，本脚本不代做）。`);

// —— L-014 路径：直连优先 ——
// -c http.proxy= 与 -c http.<remoteUrl>.proxy= 将代理清空（命令行临时覆盖，不改配置文件）
const overrideArgs = (port) => {
  const a = ["-c", "http.proxy=" + (port ? `http://127.0.0.1:${port}` : "")];
  if (remoteUrl && /^https?:\/\//i.test(remoteUrl)) a.push("-c", `http.${remoteUrl}.proxy=` + (port ? `http://127.0.0.1:${port}` : ""));
  return a;
};
const displayCmd = (args) => "git " + args.map((a) => (remoteUrl && a.includes(remoteUrl) ? a.split(remoteUrl).join(maskUrl(remoteUrl)) : a)).join(" ");

const tried = [];
async function tryPath(label, port) {
  const args = [...overrideArgs(port), "push", "--dry-run"];
  const t0 = Date.now();
  const r = await git(root, args);
  tried.push({ label, port, args, r, ms: Date.now() - t0 });
  console.log(`[check-push] [${label}] ${r.ok ? "OK" : "FAIL"}（${tried[tried.length - 1].ms}ms）${r.ok ? "" : "stderr=" + squash(r.stderr, 200)}`);
  return r.ok;
}

console.log("[check-push] ① 直连 dry-run（绕过仓库代理）…");
let win = await tryPath("直连（绕过仓库代理）", null) ? "直连（绕过仓库代理）" : null;
if (!win) {
  console.log(`[check-push] ② 直连失败 → 探测候选端口：${candidates.length ? candidates.join(", ") : "（无候选——可 --ports 或环境变量 AIEO_CHECK_PORTS 提供）"}`);
  for (const p of candidates) {
    const alive = await probePort(p);
    console.log(`[check-push]   端口 ${p}：${alive ? "监听中" : "未监听"}`);
    if (!alive) continue;
    if (await tryPath(`代理 127.0.0.1:${p}`, p)) { win = `代理 127.0.0.1:${p}`; break; }
  }
}

// —— 结果报告（L-014 三要素）——
console.log("\n===== check-push 结果 =====");
console.log(`操作：push ${branch} → ${upstream}（ahead=${ahead}）${doPush ? "【真实推送】" : "【dry-run 诊断】"}`);
for (const t of tried) console.log(`路径 ${t.label}：${t.r.ok ? "OK" : "FAIL"} ${t.r.ok ? "" : "| " + squash(t.r.stderr)}`);
console.log(`可用路径：${win || "无"}`);

if (!win) {
  console.log("下一步建议（L-014）：①按上方精确报告说明情况（试了哪些路径/具体错误）；②继续其他工作，不得罢工；③网络/代理恢复后重试本命令；④不得擅自修改 .git/config——改配置由用户决定。");
  process.exit(1);
}

const realArgs = [...overrideArgs(tried.find((t) => t.r.ok).port), "push"];
console.log(`真实推送命令：${displayCmd(realArgs)}`);

if (!doPush) {
  console.log("诊断完成：确认上述可用路径后，运行 node toolkit/check-push.mjs --push 执行真实推送。");
  process.exit(0);
}

// —— 执行前确认（共识约束）——
if (!yes) {
  if (!process.stdin.isTTY) {
    console.error("[check-push] 非交互环境执行真实推送需显式 --yes（并确保已获用户授权）。");
    process.exit(2);
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  const ans = (await rl.question(`将执行真实推送（${displayCmd(realArgs)}），确认？(y/N) `)).trim().toLowerCase();
  rl.close();
  if (ans !== "y" && ans !== "yes") { console.log("[check-push] 已取消（未推送）。"); process.exit(3); }
}

const rr = await git(root, realArgs);
if (rr.ok) {
  const c2 = await git(root, ["rev-list", "--left-right", "--count", `${upstream}...HEAD`], 15000);
  const [b2, a2] = c2.ok ? c2.stdout.trim().split(/\t/).map(Number) : [NaN, NaN];
  console.log(`[check-push] 推送成功。复核：ahead=${isNaN(a2) ? "?" : a2} behind=${isNaN(b2) ? "?" : b2}`);
  process.exit(a2 === 0 ? 0 : 1);
} else {
  console.log(`[check-push] 推送失败：${squash(rr.stderr, 600)}`);
  console.log("下一步建议（L-014）：按上方精确错误报告说明；不得擅自改 .git/config；可重新运行本命令重试。");
  process.exit(1);
}
