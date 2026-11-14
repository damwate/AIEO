#!/usr/bin/env node
// toolkit/check-env.mjs —— 环境体检（跨平台 Linux/Windows，只读，不改任何配置）。
// 端口可配置：代理端口 AIEO_CHECK_PORTS / --ports（默认只读解析仓库代理配置）；
// CDP 端口 AIEO_CDP_PORT / --cdp-port（默认 9222 = phase0 冻结派单工具链值）。
// 说明：退出码恒 0（报告型工具）。端口未监听/CDP 不在线属常见波动
// （L-014、phase0/environment-inventory.md §5"配置存在≠服务在跑"），由阅读者判断。
import { execFile } from "node:child_process";
import net from "node:net";
import os from "node:os";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const optVal = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
const extraPorts = String(optVal("--ports") || "").split(",").map((s) => s.trim()).filter(Boolean);
const cdpPort = Number(optVal("--cdp-port") || process.env.AIEO_CDP_PORT || 9222);

function git(cwd, gitArgs, timeoutMs = 30000) {
  return new Promise((resolve) => {
    execFile("git", gitArgs, { cwd, timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024, encoding: "utf8", windowsHide: true }, (err, stdout, stderr) => {
      resolve({ ok: !err, stdout: String(stdout || ""), stderr: String(stderr || "") });
    });
  });
}
function probePort(port, host = "127.0.0.1", timeoutMs = 1500) {
  return new Promise((resolve) => {
    const s = net.connect({ host, port: Number(port) });
    const done = (ok) => { try { s.destroy(); } catch {} resolve(ok); };
    s.setTimeout(timeoutMs, () => done(false));
    s.once("connect", () => done(true));
    s.once("error", () => done(false));
  });
}
async function probeHttp(url, timeoutMs = 4000) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return { ok: r.ok, status: r.status, body: r.ok ? await r.text() : "" };
  } catch (e) { return { ok: false, err: String((e && e.message) || e) }; }
}
const maskUrl = (u) => (u ? u.replace(/\/\/[^@/]+@/, "//***@") : u);
const OK = "[OK]  ", FAIL = "[FAIL]", WARN = "[WARN]", INFO = "[INFO]";

console.log(`===== AIEO 环境体检 ${new Date().toISOString()} =====`);

// 1. OS / node / git
console.log(`${INFO} OS: ${process.platform} ${os.release()} ${os.arch()} 主机=${os.hostname()}`);
const nodeMajor = Number(process.versions.node.split(".")[0]);
console.log(`${nodeMajor >= 18 ? OK : WARN} node ${process.versions.node}（需 ≥18：派单工具链/playwright 要求）`);
const gv = await git(scriptDir, ["--version"], 15000);
console.log(`${gv.ok ? OK : FAIL} ${gv.ok ? gv.stdout.trim() : "git 不可用 " + gv.stderr}`);

// 2. 仓库状态
const rootRes = await git(scriptDir, ["rev-parse", "--show-toplevel"], 15000);
let root = null;
if (rootRes.ok) {
  root = rootRes.stdout.trim();
  const branch = (await git(root, ["rev-parse", "--abbrev-ref", "HEAD"], 15000)).stdout.trim();
  const upRes = await git(root, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], 15000);
  const upstream = upRes.ok ? upRes.stdout.trim() : null;
  let ahead = "?", behind = "?";
  if (upstream) {
    const c = await git(root, ["rev-list", "--left-right", "--count", `${upstream}...HEAD`], 15000);
    if (c.ok) { const [b, a] = c.stdout.trim().split(/\t/).map(Number); ahead = a; behind = b; }
  }
  const st = await git(root, ["status", "--porcelain"], 15000);
  const dirty = st.stdout ? st.stdout.split("\n").filter(Boolean).length : 0;
  const log = await git(root, ["log", "-1", "--format=%h %s"], 15000);
  console.log(`${OK} 仓库 ${root}`);
  console.log(`${INFO} 分支=${branch} 上游=${upstream || "无"} ahead=${ahead} behind=${behind} 未提交变更=${dirty}`);
  console.log(`${INFO} 最近提交: ${log.stdout.trim().slice(0, 120)}`);
} else {
  console.log(`${FAIL} 未定位到 Git 根（本脚本须在仓库内运行）`);
}

// 3. 代理配置与端口监听（只读解析；配置存在≠服务在跑）
const cfg = await git(scriptDir, ["config", "--get-regexp", String.raw`^http(\..+)?\.proxy$`], 15000);
const cfgPorts = new Set();
if (cfg.ok) {
  for (const line of cfg.stdout.split("\n")) {
    const t = line.trim(); if (!t) continue;
    const sp = t.indexOf(" ");
    if (sp <= 0) continue;
    const key = t.slice(0, sp), val = t.slice(sp + 1).trim();
    console.log(`${INFO} 代理配置(只读) ${key} = ${maskUrl(val)}`);
    try { const u = new URL(val); if (u.port) cfgPorts.add(u.port); } catch {}
  }
} else {
  console.log(`${INFO} 仓库代理配置：无 http.*.proxy 条目`);
}
const envPorts = String(process.env.AIEO_CHECK_PORTS || "").split(",").map((s) => s.trim()).filter(Boolean);
const ports = [...new Set([...cfgPorts, ...envPorts, ...extraPorts])];
if (ports.length === 0) {
  console.log(`${INFO} 无候选代理端口（可 --ports a,b 或环境变量 AIEO_CHECK_PORTS 提供）`);
} else {
  for (const p of ports) {
    const alive = await probePort(p);
    console.log(`${alive ? OK : WARN} 端口 ${p}：${alive ? "监听中" : "未监听（常见波动，非必故障）"}`);
  }
}

// 4. Chrome CDP（gpt-poc 派单 profile）
const cdp = await probeHttp(`http://127.0.0.1:${cdpPort}/json/version`);
if (cdp.ok) {
  let b = "";
  try { b = (JSON.parse(cdp.body).Browser) || ""; } catch {}
  console.log(`${OK} Chrome CDP 127.0.0.1:${cdpPort} 在线 ${b}`);
} else {
  console.log(`${WARN} Chrome CDP 127.0.0.1:${cdpPort} 不在线（gpt-poc Chrome 由派单工具按需拉起，属常见态）`);
}

// 5. 派单工具链关键文件
if (root) {
  const files = [
    ["phase0/tools/gpt_dispatch.mjs", "派单主工具"],
    ["phase0/tools/inbound_dom.mjs", "回复采集器"],
    ["phase0/tools/node_modules/playwright", "playwright 依赖"],
    ["phase0/e2e-poc/session_lock.mjs", "会话锁"],
    ["runtime/chrome_profiles/gpt-poc", "gpt-poc Chrome profile"],
    ["basic/WORKFLOW.md", "Basic 工作流规范"],
    ["docs/phase1/handoff-template.md", "交接包权威模板"],
    ["docs/phase1/version-directory-plan.md", "版本目录方案 v1.0"],
  ];
  for (const [rel, desc] of files) {
    const exists = existsSync(join(root, rel));
    console.log(`${exists ? OK : FAIL} ${rel}（${desc}）${exists ? "" : " 缺失"}`);
  }
}

console.log("===== 体检完成（报告型工具，退出码恒 0）=====");
