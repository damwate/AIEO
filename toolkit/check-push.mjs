#!/usr/bin/env node
// toolkit/check-push.mjs —— Git 推送诊断与执行（L-014 行为纪律 + L-016/代理共识五条固化）。
//
// 共识五条（2026-11-14，dispatch-2026-11-14T15-39-58"共识达成"）：
//   1. 注册表 ProxyServer 是 Windows 系统代理首选发现来源，按协议解析（勿整串抓第一个数字）。
//   2. 候选发现序：直连 → 注册表 → git config → netstat（末位）。
//   3. 配置来源只提供候选，实际连接测试判定可用性（配置存在≠端口可用；监听≠代理）。
//   4. 严格只读：不改注册表/git config/系统代理，不重启代理客户端，不回写探测端口。
//   5. 诊断失败必须区分"调用失败/成功无值/解析失败"，禁止未交叉验证就下"不存在"结论。
// 发现与验证两模块分离：更换代理客户端只需改发现适配器，不重写推送恢复逻辑。
//
// 路径：①绕仓库代理直连 → ②失败按候选队列逐个验证（TCP 预筛 + git dry-run 真实探测，
//       TLS 握手+HTTP 响应即链路通，200 非唯一判据）→ ③仍失败输出精确报告（操作/路径/来源/失败原因）。
// 共识约束（version-directory-plan v1.0 §4）：执行前需确认；任何情况下不写入/修改 .git/config。
//
// 用法：
//   node toolkit/check-push.mjs                诊断模式：dry-run 试推各路径，不真正推送
//   node toolkit/check-push.mjs --push         诊断 + 真实推送（TTY 交互确认；非 TTY 拒绝，需 --yes）
//   node toolkit/check-push.mjs --push --yes   非交互确认推送（仅在已获用户授权时使用）
//   --ports 10391,6822                         附加候选代理端口
// 候选来源（去重，按发现序）：注册表 ProxyServer ∪ git config ∪ AIEO_CHECK_PORTS ∪ --ports ∪ netstat（末位，截断）
// 退出码：0 成功 / 1 推送失败或无可用路径 / 2 环境错误 / 3 用户取消
import { execFile } from "node:child_process";
import net from "node:net";
import { dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import readline from "node:readline/promises";

const squash = (s, n = 400) => { const t = String(s || "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n) + "…" : t; };
const maskUrl = (u) => (u ? u.replace(/\/\/[^@/]+@/, "//***@") : u);

const GIT_TIMEOUT_DEFAULT = 120000;
function git(cwd, gitArgs, timeoutMs = GIT_TIMEOUT_DEFAULT) {
  return new Promise((resolve) => {
    execFile("git", gitArgs, { cwd, timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024, encoding: "utf8", windowsHide: true }, (err, stdout, stderr) => {
      resolve({ ok: !err, code: err && typeof err.code === "number" ? err.code : err ? 1 : 0, stdout: String(stdout || ""), stderr: String(stderr || "") });
    });
  });
}

// ============================================================
// 发现模块（只读；runner 可注入供测试，默认真实执行）
// ============================================================

// 解析注册表 ProxyServer 值。两种格式：
//   分协议串（SakuraCat 等现代客户端）："http=127.0.0.1:3572;https=127.0.0.1:3572;socks=127.0.0.1:3572"
//   传统串："127.0.0.1:8080" 或 "host:port"
// 共识 1：按协议解析，勿整串抓第一个数字、勿假设各协议端口相同。
export function parseProxyServerString(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return { ok: false, reason: "empty", raw: s };
  if (s.includes("=")) {
    const ports = {};
    for (const part of s.split(";")) {
      const t = part.trim(); if (!t) continue;
      const eq = t.indexOf("=");
      if (eq <= 0) continue;
      const proto = t.slice(0, eq).trim().toLowerCase();
      const addr = t.slice(eq + 1).trim();
      const m = addr.match(/:(\d{1,5})\s*$/);
      if (m && proto) ports[proto] = Number(m[1]);
    }
    const keys = Object.keys(ports);
    if (keys.length) {
      const preferred = ports.https ?? ports.http ?? ports[keys[0]];
      return { ok: true, ports, preferred, format: "per-protocol", raw: s };
    }
    return { ok: false, reason: "parse_failed", raw: s };
  }
  const m = s.match(/^.{1,}:(\d{1,5})$/);
  if (m) {
    const port = Number(m[1]);
    return { ok: true, ports: { http: port, https: port }, preferred: port, format: "legacy", raw: s };
  }
  return { ok: false, reason: "parse_failed", raw: s };
}

// 注册表发现（共识 5 三态：query_failed / disabled / no_value / parse_failed / ok）。
// 默认 runner 经 execFile 直接调 powershell.exe（无 Shell 中间层——程序级规避 Git Bash MSYS
// 参数转换吃掉 /v 的 L-016 案例），并检查退出码与原始输出，不把查询失败当"无值"。
const REGISTRY_PS_ARGS = [
  "-NoProfile", "-Command",
  "$ErrorActionPreference='Stop';$p=Get-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';"
  + "Write-Output ('ENABLE=' + [string]$p.ProxyEnable);Write-Output ('SERVER=' + [string]$p.ProxyServer)",
];
function defaultRegistryRunner() {
  return new Promise((resolve) => {
    execFile("powershell.exe", REGISTRY_PS_ARGS, { timeout: 15000, encoding: "utf8", windowsHide: true }, (err, stdout, stderr) => {
      resolve({ ok: !err, code: err && typeof err.code === "number" ? err.code : err ? 1 : 0, stdout: String(stdout || ""), stderr: String(stderr || "") });
    });
  });
}
export async function discoverRegistryProxy({ runner = defaultRegistryRunner } = {}) {
  let r;
  try { r = await runner(); } catch (e) {
    return { state: "query_failed", ports: [], detail: "runner 异常: " + squash(e && e.message, 160) };
  }
  if (!r.ok) {
    return { state: "query_failed", ports: [], detail: `退出码=${r.code} stderr=${squash(r.stderr, 160)}` };
  }
  const mE = r.stdout.match(/^ENABLE=(.*)$/m);
  const mS = r.stdout.match(/^SERVER=(.*)$/m);
  if (!mE || !mS) return { state: "parse_failed", ports: [], detail: "输出缺 ENABLE/SERVER 行: " + squash(r.stdout, 120) };
  if (mE[1].trim() === "0") return { state: "disabled", ports: [], detail: "ProxyEnable=0（系统代理未启用）" };
  const server = mS[1].trim();
  if (!server) return { state: "no_value", ports: [], detail: "ProxyEnable=1 但 ProxyServer 为空" };
  const parsed = parseProxyServerString(server);
  if (!parsed.ok) return { state: "parse_failed", ports: [], detail: `ProxyServer 无法解析(${parsed.reason}): ${squash(server, 120)}` };
  const byPort = new Map(); // 同端口多协议合并为一个候选（如 SakuraCat 混合端口三协议同值）
  for (const [proto, port] of Object.entries(parsed.ports)) {
    if (!byPort.has(port)) byPort.set(port, []);
    byPort.get(port).push(proto);
  }
  const ports = [...byPort.entries()]
    .map(([port, protos]) => ({ port, source: `注册表ProxyServer(${protos.join("+")})` }))
    .sort((a, b) => (a.port === parsed.preferred ? -1 : 0) - (b.port === parsed.preferred ? -1 : 0));
  return { state: "ok", ports, preferred: parsed.preferred, format: parsed.format, detail: `ProxyServer=${squash(server, 120)}` };
}

// git config 代理条目（只读解析；调用方已读 entries，这里只提取端口）
export function portsFromGitConfigEntries(entries) {
  const out = [];
  for (const e of entries) {
    try { const u = new URL(e.val); if (u.port) out.push({ port: Number(u.port), source: `git config ${e.key}` }); } catch { /* 非法 URL 忽略该条 */ }
  }
  return out;
}

// 解析 Windows netstat -ano -p TCP 输出：仅 LISTENING 且本地地址为 127.* 或 0.0.0.0 的端口
export function parseNetstatListeners(output) {
  const out = [];
  const seen = new Set();
  for (const line of String(output || "").split("\n")) {
    const m = line.match(/^\s*TCP\s+(\S+):(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$/i);
    if (!m) continue;
    const host = m[1];
    if (!(host === "0.0.0.0" || host.startsWith("127."))) continue;
    const port = Number(m[2]);
    if (!port || seen.has(port)) continue;
    seen.add(port);
    out.push(port);
  }
  return out;
}

// ============================================================
// 候选队列（发现序去重合并：注册表 → git config → env → --ports → netstat 末位）
// ============================================================
export function buildCandidateQueue({ registryPorts = [], gitConfigPorts = [], envPorts = [], cliPorts = [], netstatPorts = [], netstatLimit = 6 } = {}) {
  const byPort = new Map(); // port -> { port, sources:Set, note }
  const add = (port, source, note) => {
    port = Number(port); if (!port) return;
    if (!byPort.has(port)) byPort.set(port, { port, sources: new Set(), note: undefined });
    const c = byPort.get(port);
    c.sources.add(source);
    if (note && !c.note) c.note = note;
  };
  for (const { port, source } of registryPorts) add(port, source);
  for (const { port, source } of gitConfigPorts) add(port, source);
  for (const p of envPorts) add(p, "env AIEO_CHECK_PORTS");
  for (const p of cliPorts) add(p, "--ports");
  let netstatAdded = 0;
  for (const p of netstatPorts) {
    if (byPort.has(Number(p))) { add(p, "netstat"); continue; } // 已有来源的端口补标来源，不占截断名额
    if (netstatAdded >= netstatLimit) break;
    if (Number(p) < 1024) continue; // 特权/知名端口噪音过滤（139/445/5040 等）
    add(p, "netstat", "监听未证实代理（须真实探测）");
    netstatAdded++;
  }
  return [...byPort.values()].map((c) => ({ port: c.port, sources: [...c.sources], note: c.note }));
}

// ============================================================
// 验证模块
// ============================================================
function probePort(port, host = "127.0.0.1", timeoutMs = 2000) {
  return new Promise((resolve) => {
    const s = net.connect({ host, port: Number(port) });
    const done = (ok) => { try { s.destroy(); } catch {} resolve(ok); };
    s.setTimeout(timeoutMs, () => done(false));
    s.once("connect", () => done(true));
    s.once("error", () => done(false));
  });
}

// ============================================================
// 主流程
// ============================================================
async function main() {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const argv = process.argv.slice(2);
  const doPush = argv.includes("--push");
  const yes = argv.includes("--yes");
  const pi = argv.indexOf("--ports");
  const extraPorts = pi >= 0 ? String(argv[pi + 1] || "").split(",").map((s) => s.trim()).filter(Boolean) : [];
  const GIT_TIMEOUT = doPush ? 180000 : 120000;

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

  // —— 只读解析 git 代理配置（不改写）——
  const proxyEntries = [];
  const cfg = await git(root, ["config", "--get-regexp", String.raw`^http(\..+)?\.proxy$`], 15000);
  if (cfg.ok) {
    for (const line of cfg.stdout.split("\n")) {
      const t = line.trim(); if (!t) continue;
      const sp = t.indexOf(" ");
      if (sp > 0) proxyEntries.push({ key: t.slice(0, sp), val: t.slice(sp + 1).trim() });
    }
  }

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

  // —— 候选发现（只读；发现与验证分离，共识 1/2/5）——
  let registry = null, netstatPorts = [];
  if (process.platform === "win32") {
    registry = await discoverRegistryProxy();
    console.log(`[check-push] 注册表 ProxyServer 发现：state=${registry.state}${registry.preferred ? ` preferred=${registry.preferred}（${registry.format}）` : ""}${registry.state !== "ok" ? ` detail=${registry.detail}` : ""}${registry.state === "query_failed" ? "（查询失败≠无代理，不据此下结论，继续其余候选——L-016）" : ""}`);
    const nsRunner = () => new Promise((resolve) => {
      execFile("netstat", ["-ano", "-p", "TCP"], { timeout: 15000, encoding: "utf8", windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
        resolve({ ok: !err, code: err && typeof err.code === "number" ? err.code : err ? 1 : 0, stdout: String(stdout || ""), stderr: String(stderr || "") });
      });
    });
    const ns = await nsRunner();
    netstatPorts = ns.ok ? parseNetstatListeners(ns.stdout) : [];
    if (!ns.ok) console.log(`[check-push] netstat 查询失败（不据此下结论）：${squash(ns.stderr, 120)}`);
  } else {
    console.log("[check-push] 非 Windows：跳过注册表/netstat 发现");
  }
  const queue = buildCandidateQueue({
    registryPorts: registry && registry.state === "ok" ? registry.ports : [],
    gitConfigPorts: portsFromGitConfigEntries(proxyEntries),
    envPorts: String(process.env.AIEO_CHECK_PORTS || "").split(",").map((s) => s.trim()).filter(Boolean),
    cliPorts: extraPorts,
    netstatPorts,
  });
  console.log(`[check-push] 候选队列（发现序：直连→注册表→git config→env/--ports→netstat 末位）：${queue.length ? queue.map((c) => c.port).join(", ") : "（无候选——可 --ports 或 AIEO_CHECK_PORTS 提供）"}`);
  for (const c of queue) console.log(`[check-push]   ${c.port} ← 来源: ${c.sources.join(" + ")}${c.note ? `（${c.note}）` : ""}`);

  // —— L-014/共识 2 路径：直连优先 ——
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
    const r = await git(root, args, GIT_TIMEOUT);
    tried.push({ label, port, args, r, ms: Date.now() - t0 });
    console.log(`[check-push] [${label}] ${r.ok ? "OK" : "FAIL"}（${tried[tried.length - 1].ms}ms）${r.ok ? "" : "stderr=" + squash(r.stderr, 200)}`);
    return r.ok;
  }

  console.log("[check-push] ① 直连 dry-run（绕过仓库代理）…");
  let win = null;
  if (await tryPath("直连（绕过仓库代理）", null)) {
    win = { label: "直连（绕过仓库代理）", port: null };
  } else {
    console.log(`[check-push] ② 直连失败 → 按候选队列逐个验证（TCP 预筛 + git dry-run 真实探测；监听≠代理，共识 3）`);
    for (const c of queue) {
      const alive = await probePort(c.port);
      if (!alive) {
        console.log(`[check-push]   端口 ${c.port}（来源: ${c.sources.join("+")}）：未监听 → 跳过（注册表/git config 有值≠端口可用）`);
        tried.push({ label: `代理 127.0.0.1:${c.port}（来源: ${c.sources.join("+")}）`, port: c.port, args: null, r: { ok: false, stderr: "TCP 未监听" }, ms: 0 });
        continue;
      }
      if (await tryPath(`代理 127.0.0.1:${c.port}（来源: ${c.sources.join("+")}）`, c.port)) {
        win = { label: `代理 127.0.0.1:${c.port}（来源: ${c.sources.join("+")}）`, port: c.port };
        break;
      }
    }
  }

  // —— 结果报告（L-014 三要素 + 共识"记录来源与失败原因"）——
  console.log("\n===== check-push 结果 =====");
  console.log(`操作：push ${branch} → ${upstream}（ahead=${ahead}）${doPush ? "【真实推送】" : "【dry-run 诊断】"}`);
  for (const t of tried) console.log(`路径 ${t.label}：${t.r.ok ? "OK" : "FAIL"} ${t.r.ok ? "" : "| " + squash(t.r.stderr)}`);
  console.log(`可用路径：${win ? win.label : "无"}`);

  if (!win) {
    console.log("下一步建议（L-014/L-016）：①按上方精确报告说明情况（试了哪些路径/来源/具体错误，含注册表发现 state）；②注册表/git config 有值但端口死 ≠ 无代理——确认代理客户端是否在跑；③继续其他工作，不得罢工；④网络/代理恢复后重试本命令；⑤不得擅自修改 .git/config——改配置由用户决定。");
    process.exit(1);
  }

  const winTried = tried.find((t) => t.r.ok);
  const realArgs = [...overrideArgs(win.port), "push"];
  console.log(`真实推送命令：${displayCmd(realArgs)}   （使用端口 ${win.port ?? "（直连）"}，来源: ${winTried ? winTried.label : win.label}）`);

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

  const rr = await git(root, realArgs, GIT_TIMEOUT);
  if (rr.ok) {
    const c2 = await git(root, ["rev-list", "--left-right", "--count", `${upstream}...HEAD`], 15000);
    const [b2, a2] = c2.ok ? c2.stdout.trim().split(/\t/).map(Number) : [NaN, NaN];
    console.log(`[check-push] 推送成功（端口 ${win.port ?? "直连"}）。复核：ahead=${isNaN(a2) ? "?" : a2} behind=${isNaN(b2) ? "?" : b2}`);
    process.exit(a2 === 0 ? 0 : 1);
  } else {
    console.log(`[check-push] 推送失败：${squash(rr.stderr, 600)}`);
    console.log("下一步建议（L-014）：按上方精确错误报告说明；不得擅自改 .git/config；可重新运行本命令重试。");
    process.exit(1);
  }
}

// —— CLI 主守卫：被测试导入时不执行主流程 ——
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) await main();
