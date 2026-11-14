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
// v1.1（2026-11-15，复核 R1 dispatch-16-05-36"需要修改"三项整改）：
//   P1-1 超时分离——直连 dry-run 30s / 代理候选 dry-run 45s / 真实推送 180s；
//        超时记录为明确 timeout 失败原因（本次探测超时≠路径永久不可用），不再阻塞候选验证。
//   P1-2 执行器注入补全——netstat 发现/TCP 探测/git dry-run 全部 runner 可注入；
//        runProbeSequence 导出后流程可整体注入测试，不依赖真实注册表/端口/网络。
//   P1-3 端口合法性统一校验——isValidPort（整数 1-65535）在注册表解析/git config/
//        env/--ports/netstat/候选队列全入口执行；非法值过滤并输出原因，不静默。
//   P2-1 git config 非本地代理——仅本机地址（127.*/localhost/::1/0.0.0.0）作为本机端口
//        候选，非本地地址明确记录跳过原因，不静默丢弃主机信息（本工具限定本地代理）。
//
// 路径：①直连 dry-run（短超时）→ ②失败按候选队列逐个验证（TCP 预筛 + git dry-run 真实探测，
//       TLS 握手+HTTP 响应即链路通，200 非唯一判据；单候选超时记录后继续下一候选）→
//       ③仍失败输出精确报告（操作/路径/来源/失败原因）。
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

// P1-1：超时分离（真实推送保留长超时；探测一律短超时，防止单路径挂起拖延恢复流程）
export const TIMEOUTS = { directDryRun: 30000, proxyDryRun: 45000, push: 180000, gitQuick: 15000, regQuery: 15000, netstat: 15000, tcpProbe: 2000 };

function git(cwd, gitArgs, timeoutMs) {
  return new Promise((resolve) => {
    execFile("git", gitArgs, { cwd, timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024, encoding: "utf8", windowsHide: true }, (err, stdout, stderr) => {
      resolve({ ok: !err, code: err && typeof err.code === "number" ? err.code : err ? 1 : 0, stdout: String(stdout || ""), stderr: String(stderr || ""), timedOut: !!(err && err.killed) });
    });
  });
}

// ============================================================
// 发现模块（只读；runner/执行器可注入供测试，默认真实执行）
// ============================================================

// P1-3：端口合法性统一校验（整数 1-65535），所有候选入口共用
export function isValidPort(p) {
  const n = Number(p);
  return Number.isInteger(n) && n >= 1 && n <= 65535;
}

// P2-1：本机地址判定（本工具限定本地代理；非本地地址不作本机端口候选，记录原因）
export function isLocalHost(host) {
  const h = String(host || "").trim().toLowerCase().replace(/^\[|\]$/g, "");
  return !h || h === "localhost" || h === "::1" || h === "0.0.0.0" || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h);
}

// 解析注册表 ProxyServer 值。两种格式：
//   分协议串（SakuraCat 等现代客户端）："http=127.0.0.1:3572;https=127.0.0.1:3572;socks=127.0.0.1:3572"
//   传统串："127.0.0.1:8080" 或 "host:port"
// 共识 1：按协议解析，勿整串抓第一个数字、勿假设各协议端口相同。
// 返回 ok 时带 hosts（按协议）与 nonLocal（非本机地址条目，供上层记录跳过原因）。
export function parseProxyServerString(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return { ok: false, reason: "empty", raw: s };
  if (s.includes("=")) {
    const ports = {}, hosts = {}, nonLocal = [];
    for (const part of s.split(";")) {
      const t = part.trim(); if (!t) continue;
      const eq = t.indexOf("=");
      if (eq <= 0) continue;
      const proto = t.slice(0, eq).trim().toLowerCase();
      const addr = t.slice(eq + 1).trim();
      const m = addr.match(/^(.*):(\d{1,5})\s*$/);
      if (m && proto) {
        const host = m[1].trim(), port = Number(m[2]);
        if (!isValidPort(port)) { nonLocal.push({ proto, addr, reason: `非法端口 ${m[2]}` }); continue; }
        if (!isLocalHost(host)) { nonLocal.push({ proto, addr, reason: "非本机地址" }); continue; }
        ports[proto] = port; hosts[proto] = host || "127.0.0.1";
      }
    }
    const keys = Object.keys(ports);
    if (keys.length) {
      const preferred = ports.https ?? ports.http ?? ports[keys[0]];
      return { ok: true, ports, hosts, preferred, format: "per-protocol", nonLocal, raw: s };
    }
    return { ok: false, reason: "parse_failed", nonLocal, raw: s };
  }
  const m = s.match(/^(.{1,}):(\d{1,5})$/);
  if (m) {
    const host = m[1].trim(), port = Number(m[2]);
    if (!isValidPort(port)) return { ok: false, reason: "parse_failed", nonLocal: [{ proto: "all", addr: s, reason: `非法端口 ${m[2]}` }], raw: s };
    if (!isLocalHost(host)) return { ok: false, reason: "parse_failed", nonLocal: [{ proto: "all", addr: s, reason: "非本机地址" }], raw: s };
    return { ok: true, ports: { http: port, https: port }, hosts: { http: host, https: host }, preferred: port, format: "legacy", nonLocal: [], raw: s };
  }
  return { ok: false, reason: "parse_failed", nonLocal: [], raw: s };
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
    execFile("powershell.exe", REGISTRY_PS_ARGS, { timeout: TIMEOUTS.regQuery, encoding: "utf8", windowsHide: true }, (err, stdout, stderr) => {
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
  if (!parsed.ok) {
    const extra = parsed.nonLocal && parsed.nonLocal.length ? `；非候选: ${parsed.nonLocal.map((n) => `${n.addr}(${n.reason})`).join(", ")}` : "";
    return { state: "parse_failed", ports: [], detail: `ProxyServer 无法解析(${parsed.reason}): ${squash(server, 120)}${extra}` };
  }
  const byPort = new Map(); // 同端口多协议合并为一个候选（如 SakuraCat 混合端口三协议同值）
  for (const [proto, port] of Object.entries(parsed.ports)) {
    if (!byPort.has(port)) byPort.set(port, []);
    byPort.get(port).push(proto);
  }
  const ports = [...byPort.entries()]
    .map(([port, protos]) => ({ port, source: `注册表ProxyServer(${protos.join("+")})` }))
    .sort((a, b) => (a.port === parsed.preferred ? -1 : 0) - (b.port === parsed.preferred ? -1 : 0));
  const skipped = (parsed.nonLocal || []).map((n) => `注册表 ${n.addr}（${n.reason}）`);
  return { state: "ok", ports, preferred: parsed.preferred, format: parsed.format, detail: `ProxyServer=${squash(server, 120)}`, skipped };
}

// git config 代理条目（只读解析）：仅本机地址作为本机端口候选；非本地记录跳过原因（P2-1）
export function portsFromGitConfigEntries(entries) {
  const ports = [], skipped = [];
  for (const e of entries) {
    let u;
    try { u = new URL(e.val); } catch { skipped.push({ source: `git config ${e.key}`, val: e.val, reason: "非法 URL（含端口越界）" }); continue; }
    if (!u.port) { skipped.push({ source: `git config ${e.key}`, val: maskUrl(e.val), reason: "无端口" }); continue; }
    if (!isValidPort(u.port)) { skipped.push({ source: `git config ${e.key}`, val: maskUrl(e.val), reason: `非法端口 ${u.port}` }); continue; }
    if (!isLocalHost(u.hostname)) { skipped.push({ source: `git config ${e.key}`, val: maskUrl(e.val), reason: `非本机地址 ${u.hostname}（本工具限定本地代理，不作为本机端口候选）` }); continue; }
    ports.push({ port: Number(u.port), source: `git config ${e.key}` });
  }
  return { ports, skipped };
}

// 解析 Windows netstat -ano -p TCP 输出：仅 LISTENING 且本地地址为 127.* 或 0.0.0.0 的合法端口
export function parseNetstatListeners(output) {
  const out = [];
  const seen = new Set();
  for (const line of String(output || "").split("\n")) {
    const m = line.match(/^\s*TCP\s+(\S+):(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$/i);
    if (!m) continue;
    const host = m[1];
    if (!(host === "0.0.0.0" || host.startsWith("127."))) continue;
    const port = Number(m[2]);
    if (!isValidPort(port) || seen.has(port)) continue;
    seen.add(port);
    out.push(port);
  }
  return out;
}

// netstat 发现（P1-2：runner 可注入；失败=明确记录，不误判"无监听"）
function defaultNetstatRunner() {
  return new Promise((resolve) => {
    execFile("netstat", ["-ano", "-p", "TCP"], { timeout: TIMEOUTS.netstat, encoding: "utf8", windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ ok: !err, code: err && typeof err.code === "number" ? err.code : err ? 1 : 0, stdout: String(stdout || ""), stderr: String(stderr || "") });
    });
  });
}
export async function discoverNetstatPorts({ runner = defaultNetstatRunner } = {}) {
  let r;
  try { r = await runner(); } catch (e) {
    return { state: "query_failed", ports: [], detail: "runner 异常: " + squash(e && e.message, 160) };
  }
  if (!r.ok) return { state: "query_failed", ports: [], detail: `退出码=${r.code} stderr=${squash(r.stderr, 160)}` };
  return { state: "ok", ports: parseNetstatListeners(r.stdout), detail: "" };
}

// ============================================================
// 候选队列（发现序去重合并：注册表 → git config → env → --ports → netstat 末位）
// P1-3：非法端口过滤并返回 rejected（不静默）
// ============================================================
export function buildCandidateQueue({ registryPorts = [], gitConfigPorts = [], envPorts = [], cliPorts = [], netstatPorts = [], netstatLimit = 6 } = {}) {
  const byPort = new Map(); // port -> { port, sources:Set, note }
  const rejected = [];
  const add = (port, source, note) => {
    if (!isValidPort(port)) { rejected.push({ value: String(port), source, reason: `非法端口（须整数 1-65535）` }); return; }
    port = Number(port);
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
  const queue = [...byPort.values()].map((c) => ({ port: c.port, sources: [...c.sources], note: c.note }));
  return { queue, rejected };
}

// ============================================================
// 验证模块（P1-2：TCP 探测与探测序列均可注入，测试不依赖真实网络/注册表）
// ============================================================
// probePort（R2 复核 P1-1 遗留整改）：结构化三态返回，不再压缩成布尔——
//   连接成功 → { ok:true,  timedOut:false, ms, reason:"connected" }
//   连接失败（含 ECONNREFUSED 拒绝）→ { ok:false, timedOut:false, ms, reason:"连接失败（<code>）" }
//   超时   → { ok:false, timedOut:true,  ms, reason:"timeout（本次探测超时≠路径永久不可用）" }
// deps.createSocket 可注入（测试不依赖真实网络即可覆盖超时分支）。
export function probePort(port, host = "127.0.0.1", timeoutMs = TIMEOUTS.tcpProbe, { createSocket = net.connect } = {}) {
  return new Promise((resolve) => {
    const start = Date.now();
    let settled = false;
    const s = createSocket({ host, port: Number(port) });
    const done = (ok, err, timedOut) => {
      if (settled) return;
      settled = true;
      try { s.destroy(); } catch {}
      const ms = Date.now() - start;
      if (timedOut) resolve({ ok: false, timedOut: true, ms, reason: "timeout（本次探测超时≠路径永久不可用）" });
      else if (ok) resolve({ ok: true, timedOut: false, ms, reason: "connected" });
      else resolve({ ok: false, timedOut: false, ms, reason: `连接失败（${(err && err.code) || (err && err.message) || "error"}）` });
    };
    s.setTimeout(timeoutMs, () => done(false, null, true));
    s.once("connect", () => done(true));
    s.once("error", (err) => done(false, err, false));
  });
}

// 探测序列（P1-2 导出）：①直连（短超时）→ ②候选队列逐个（TCP 预筛 + dry-run，单候选失败/超时
// 记录后继续下一候选）。directProbe/candidateProbe 可注入；tried 记录来源+失败原因+timeout 标记。
export async function runProbeSequence({ candidates = [], directProbe, candidateProbe }) {
  const tried = [];
  const d = await directProbe();
  tried.push(d);
  if (d.ok) return { winner: { label: d.label, port: null }, tried };
  for (const c of candidates) {
    const r = await candidateProbe(c);
    tried.push(...r.tried);
    if (r.win) return { winner: { label: r.win.label, port: c.port }, tried };
  }
  return { winner: null, tried };
}

// 单候选验证（P1-2 导出，共识 3：监听≠代理，TCP 预筛失败不执行 dry-run）：
// tcpProbe 与 dryRun 均可注入，测试不依赖真实网络。dryRun(label) → { ok, timedOut, stderr, ms }。
// tcpProbe 兼容注入布尔（旧式）；结构化返回（probePort 本尊）时保留三态语义——
// 超时与未监听分开标注，超时≠路径永久不可用（R2 复核 P1-1 遗留整改）。
export async function probeCandidate({ candidate, tcpProbe = probePort, dryRun }) {
  const label = candidate.label || `代理 127.0.0.1:${candidate.port}（来源: ${(candidate.sources || []).join("+")}）`;
  const raw = await tcpProbe(candidate.port);
  const res = typeof raw === "boolean"
    ? { ok: raw, timedOut: false, ms: 0, reason: raw ? "connected" : null }
    : raw;
  if (!res || !res.ok) {
    const timedOut = !!(res && res.timedOut);
    const reason = res && res.reason && res.reason !== "connected" ? `（${res.reason}）` : "";
    const stderr = timedOut
      ? "TCP 探测超时（本次探测超时≠路径永久不可用）"
      : `TCP 未监听${reason}`;
    return { tried: [{ label, port: candidate.port, ok: false, timedOut, stderr, ms: (res && res.ms) || 0 }], win: null, tcpSkipped: true };
  }
  const r = await dryRun(label);
  return {
    tried: [{ label, port: candidate.port, ok: r.ok, timedOut: r.timedOut, stderr: r.stderr, ms: r.ms }],
    win: r.ok ? { label, port: candidate.port } : null,
  };
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

  // —— 定位 Git 根（不依赖启动目录）——
  const rootRes = await git(scriptDir, ["rev-parse", "--show-toplevel"], TIMEOUTS.gitQuick);
  if (!rootRes.ok) {
    console.error("[check-push] FAIL 定位 Git 根失败（脚本须在仓库内）：", squash(rootRes.stderr, 200));
    process.exit(2);
  }
  const root = rootRes.stdout.trim();

  // —— 基本信息 ——
  const branch = (await git(root, ["rev-parse", "--abbrev-ref", "HEAD"], TIMEOUTS.gitQuick)).stdout.trim();
  const upRes = await git(root, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], TIMEOUTS.gitQuick);
  const upstream = upRes.ok ? upRes.stdout.trim() : null;
  const remoteUrlRes = await git(root, ["remote", "get-url", ((upstream || "").split("/")[0] || "origin")], TIMEOUTS.gitQuick);
  const remoteUrl = remoteUrlRes.ok ? remoteUrlRes.stdout.trim() : null;
  let ahead = 0, behind = 0;
  if (upstream) {
    const c = await git(root, ["rev-list", "--left-right", "--count", `${upstream}...HEAD`], TIMEOUTS.gitQuick);
    if (c.ok) { const [b, a] = c.stdout.trim().split(/\t/).map(Number); behind = b || 0; ahead = a || 0; }
  }

  // —— 只读解析 git 代理配置（不改写）——
  const proxyEntries = [];
  const cfg = await git(root, ["config", "--get-regexp", String.raw`^http(\..+)?\.proxy$`], TIMEOUTS.gitQuick);
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
  let registry = null, netstat = null;
  if (process.platform === "win32") {
    registry = await discoverRegistryProxy();
    console.log(`[check-push] 注册表 ProxyServer 发现：state=${registry.state}${registry.preferred ? ` preferred=${registry.preferred}（${registry.format}）` : ""}${registry.state !== "ok" ? ` detail=${registry.detail}` : ""}${registry.state === "query_failed" ? "（查询失败≠无代理，不据此下结论，继续其余候选——L-016）" : ""}`);
    for (const s of registry.skipped || []) console.log(`[check-push] 注册表非候选已跳过：${s}`);
    netstat = await discoverNetstatPorts();
    if (netstat.state !== "ok") console.log(`[check-push] netstat 发现失败（记录，不误判无监听）：${netstat.detail}`);
  } else {
    console.log("[check-push] 非 Windows：跳过注册表/netstat 发现");
  }
  const gitCfg = portsFromGitConfigEntries(proxyEntries);
  for (const s of gitCfg.skipped) console.log(`[check-push] git config 候选跳过：${s.source} = ${s.val}（${s.reason}）`);
  const { queue, rejected } = buildCandidateQueue({
    registryPorts: registry && registry.state === "ok" ? registry.ports : [],
    gitConfigPorts: gitCfg.ports,
    envPorts: String(process.env.AIEO_CHECK_PORTS || "").split(",").map((s) => s.trim()).filter(Boolean),
    cliPorts: extraPorts,
    netstatPorts: netstat && netstat.state === "ok" ? netstat.ports : [],
  });
  for (const rj of rejected) console.log(`[check-push] 非法候选已过滤：${rj.value}（来源 ${rj.source}，${rj.reason}）`);
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

  const tried = []; // 仅直连用；候选条目由 runProbeSequence 汇总（seq.tried）
  const fmtFail = (r) => r.timedOut ? "timeout（本次探测超时，≠路径永久不可用）| " + squash(r.stderr, 120) : squash(r.stderr, 200);

  const directProbe = async () => {
    const t0 = Date.now();
    const r = await git(root, [...overrideArgs(null), "push", "--dry-run"], TIMEOUTS.directDryRun); // P1-1：直连短超时
    const e = { label: "直连（绕过仓库代理）", port: null, ok: r.ok, timedOut: r.timedOut, stderr: r.stderr, ms: Date.now() - t0 };
    tried.push(e);
    console.log(`[check-push] [${e.label}] ${r.ok ? "OK" : "FAIL"}（${e.ms}ms）${r.ok ? "" : "stderr=" + fmtFail(r)}`);
    return e;
  };
  const candidateProbe = async (c) => {
    const r = await probeCandidate({
      candidate: c,
      dryRun: async (label) => {
        const t0 = Date.now();
        const rr = await git(root, [...overrideArgs(c.port), "push", "--dry-run"], TIMEOUTS.proxyDryRun); // P1-1：代理候选独立短超时
        const ms = Date.now() - t0;
        console.log(`[check-push] [${label}] ${rr.ok ? "OK" : "FAIL"}（${ms}ms）${rr.ok ? "" : "stderr=" + fmtFail(rr)}`);
        return { ok: rr.ok, timedOut: rr.timedOut, stderr: rr.stderr, ms };
      },
    });
    if (r.tcpSkipped) console.log(`[check-push]   ${r.tried[0].label}：未监听 → 跳过（配置/git config 有值≠端口可用，共识 3）`);
    return r;
  };

  console.log(`[check-push] ① 直连 dry-run（绕过仓库代理，超时 ${TIMEOUTS.directDryRun / 1000}s）…`);
  const seq = await runProbeSequence({ candidates: queue, directProbe, candidateProbe });

  // —— 结果报告（L-014 三要素 + 共识"记录来源与失败原因"）——
  console.log("\n===== check-push 结果 =====");
  console.log(`操作：push ${branch} → ${upstream}（ahead=${ahead}）${doPush ? "【真实推送】" : "【dry-run 诊断】"}`);
  for (const t of seq.tried) console.log(`路径 ${t.label}：${t.ok ? "OK" : "FAIL"} ${t.ok ? "" : "| " + fmtFail(t)}`);
  console.log(`可用路径：${seq.winner ? seq.winner.label : "无"}`);

  if (!seq.winner) {
    console.log("下一步建议（L-014/L-016）：①按上方精确报告说明情况（试了哪些路径/来源/具体错误，含注册表/netstat 发现 state）；②注册表/git config 有值但端口死 ≠ 无代理——确认代理客户端是否在跑；③timeout 条目仅表示本次探测超时，不代表路径永久不可用；④继续其他工作，不得罢工；⑤网络/代理恢复后重试本命令；⑥不得擅自修改 .git/config——改配置由用户决定。");
    process.exit(1);
  }

  const winTried = seq.tried.find((t) => t.ok);
  const realArgs = [...overrideArgs(seq.winner.port), "push"];
  console.log(`真实推送命令：${displayCmd(realArgs)}   （使用端口 ${seq.winner.port ?? "（直连）"}，来源: ${winTried ? winTried.label : seq.winner.label}）`);

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

  const rr = await git(root, realArgs, TIMEOUTS.push); // P1-1：真实推送保留长超时
  if (rr.ok) {
    const c2 = await git(root, ["rev-list", "--left-right", "--count", `${upstream}...HEAD`], TIMEOUTS.gitQuick);
    const [b2, a2] = c2.ok ? c2.stdout.trim().split(/\t/).map(Number) : [NaN, NaN];
    console.log(`[check-push] 推送成功（端口 ${seq.winner.port ?? "直连"}）。复核：ahead=${isNaN(a2) ? "?" : a2} behind=${isNaN(b2) ? "?" : b2}`);
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
