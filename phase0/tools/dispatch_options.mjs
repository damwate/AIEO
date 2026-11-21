// GPT 派单参数与 M1 登记绑定的纯函数解析。
// 三 ID 要么全部缺省（通用非登记派单），要么与 --schema 同时完整提供。

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const DISPATCH_ID_RULES = Object.freeze({
  task_id: /^T-(P[0-9]+-)?[0-9]{3,}$/,
  execution_id: /^EXEC-[0-9]{3,}$/,
  correlation_id: /^(CORR-[0-9]{3,}|[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/,
});

function optionError(code, message, details = undefined) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  error.exitCode = 2;
  if (details !== undefined) error.details = details;
  return error;
}

function optionalArg(argv, flag) {
  const indices = argv.flatMap((value, index) => value === flag ? [index] : []);
  if (indices.length === 0) return null;
  if (indices.length > 1) throw optionError("DISPATCH_OPTION_DUPLICATE", `${flag} 不得重复提供`);
  const value = argv[indices[0] + 1];
  if (!value || value.startsWith("--")) {
    throw optionError("DISPATCH_OPTION_VALUE_MISSING", `${flag} 缺少值`, { flag });
  }
  return value;
}

/**
 * 是否应写 reviewer 指针（DEC-094 #4）。默认写（保持审查会话迁移语义）；
 * 显式 --no-update-pointer 时跳过。中心化以便纯函数回归。
 */
export function shouldUpdateReviewerPointer(options) {
  return options?.noUpdatePointer !== true && !options?.sessionResult;
}

/**
 * 归属校验（DEC-094 规划复审要求：确认目标页确属本次会话，校验失败 fail-closed）。
 * 新会话派单：捕获到的 sessionId 不得与 attach 时已存在的会话 UUID 相同——相同意味着
 * 复用/误捕获了既有页（wrong-session 事故形态），必须拒写 reviewer 指针。
 * 既有会话派单：捕获到的 sessionId 必须等于目标会话 UUID，否则为错页。
 */
const SESSION_ID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

export function sessionIdIsAttributable({ newSession, sessionId, targetSessionId, preexistingSessionIds = [] }) {
  if (typeof sessionId !== "string" || !SESSION_ID.test(sessionId)) return false;
  const pre = new Set(preexistingSessionIds.filter(Boolean).map((x) => String(x).toLowerCase()));
  if (newSession) {
    return !pre.has(sessionId.toLowerCase());
  }
  return typeof targetSessionId === "string" && targetSessionId.toLowerCase() === sessionId.toLowerCase();
}

function chatGptUrl(value) {
  try {
    const url = new URL(value);
    return url.origin === "https://chatgpt.com" && !url.username && !url.password ? url : null;
  } catch {
    return null;
  }
}

export function extractSessionId(value) {
  const id = chatGptUrl(value)?.pathname.match(/^\/(?:g\/[^/]+\/)?c\/([^/]+)\/?$/)?.[1];
  return id && SESSION_ID.test(id) ? id.toLowerCase() : null;
}

export function assertDispatchTarget({ url, newSession, targetSessionId, hasMessages }) {
  const page = chatGptUrl(url);
  const allowed = newSession
    ? page?.pathname === "/" && hasMessages === false
    : sessionIdIsAttributable({ newSession, sessionId: extractSessionId(url), targetSessionId });
  if (!allowed) throw new Error("SESSION_TARGET_MISMATCH: 页面与派单目标不符，发送前停止");
}

export async function assertDispatchPage(page, { newSession, targetSessionId }) {
  const hasMessages = newSession ? (await page.locator("[data-content-search-unit-key]").count()) > 0 : undefined;
  assertDispatchTarget({ url: page.url(), newSession, targetSessionId, hasMessages });
}

export async function submitDispatchMessage(page, target, beforeEnter) {
  await assertDispatchPage(page, target);
  beforeEnter();
  await page.keyboard.press("Enter");
}

// ── 实例域（DEC-123 PARA-R1 有条件通过：每 agent 一把锁+独立浏览器+可核验映射）──
// 约束（审查方裁定）：instance ID 严格校验防路径穿越/大小写歧义；default 实例逐字节
// =既有常量（C7 默认兼容）；实例身份/锁/端口/profile 构成可核验映射；非 default 实例
// 禁止写共享 reviewer 指针（单写者不变量）。

export const INSTANCE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;

export function normalizeInstanceId(raw) {
  if (raw === null || raw === undefined) return "default";
  const id = String(raw).trim().toLowerCase();
  if (!INSTANCE_ID_PATTERN.test(id)) {
    throw optionError(
      "DISPATCH_INSTANCE_INVALID",
      `--instance 格式不合法（限 [a-z0-9-]，1-32 位，字母数字开头）: ${raw}`,
      { instance: String(raw) },
    );
  }
  return id;
}

/**
 * 实例域路径派生（纯函数，零 IO）。
 * default 实例=既有常量逐字节（C7）：锁 gpt-session.lockfile、profile gpt-poc、端口 9222。
 * 命名实例：锁 gpt-session-<ID>.lockfile、profile gpt-poc-<ID>、端口走注册表分配。
 * 端口注册表为跨实例共享协调点（runtime/locks/instance-ports.json），所有实例同路径。
 */
export function deriveInstancePaths({ instanceId = "default", aieoRoot }) {
  const id = normalizeInstanceId(instanceId);
  const isDefault = id === "default";
  return {
    instanceId: id,
    isDefault,
    lockPath: join(aieoRoot, "runtime", "locks", isDefault ? "gpt-session.lockfile" : `gpt-session-${id}.lockfile`),
    profileDir: join(aieoRoot, "runtime", "chrome_profiles", isDefault ? "gpt-poc" : `gpt-poc-${id}`),
    portRegistryPath: join(aieoRoot, "runtime", "locks", "instance-ports.json"),
    defaultPort: 9222,
    portCandidates: { min: 9300, max: 9399 },
  };
}

/**
 * 端口分配（纯函数）。registry 形如 { "agent-a": 9301 }（已登记实例的稳定映射）；
 * isPortBusy(port) 返回该端口当前是否可探测到 CDP 端点（真实探测判定占用，
 * 哈希/猜测不作为唯一性证明——DEC-123 ③边界）。
 * 规则：已登记→原端口稳定返回；未登记→第一个「未被他实例登记且探测空闲」的候选；
 * 候选耗尽→INSTANCE_PORT_EXHAUSTED。
 */
export function allocateInstancePort({ instanceId, registry = {}, isPortBusy = () => false, candidates }) {
  if (Number.isInteger(registry[instanceId])) return { port: registry[instanceId], allocated: false };
  const taken = new Set(Object.values(registry));
  for (let port = candidates.min; port <= candidates.max; port += 1) {
    if (taken.has(port)) continue;
    if (isPortBusy(port)) continue;
    return { port, allocated: true };
  }
  throw optionError("INSTANCE_PORT_EXHAUSTED", `实例端口候选 ${candidates.min}-${candidates.max} 全部占用`, {
    instance: instanceId,
  });
}

/**
 * reviewer 指针单写者守卫：共享指针 phase0/logs/gpt-reviewer-session.json 只归
 * default 实例写；命名实例（任务腿）必须绑定会话或显式不写，否则 fail-closed。
 */
export function assertPointerWriterAllowed({ instanceId, options }) {
  if (instanceId === "default") return;
  if (shouldUpdateReviewerPointer(options)) {
    throw optionError(
      "POINTER_SINGLE_WRITER_VIOLATION",
      `实例 ${instanceId} 非共享 reviewer 指针写者：任务派单必须 --session-result 绑定或 --no-update-pointer`,
      { instance: instanceId },
    );
  }
}

/**
 * 进程归属判定（纯函数，PowerShell 侧同语义实现）：解析完整启动参数中的
 * --user-data-dir=<token>（支持引号包裹），与实例 profile 目录做大小写不敏感的
 * 精确 token 比对（Windows 路径语义）。禁子串通配——前缀碰撞负例
 * （gpt-poc-a vs gpt-poc-a2）不得误判（DEC-123 ③加严）。
 */
export function matchesProfileOwnership(commandLine, profileDir) {
  if (typeof commandLine !== "string" || commandLine.length === 0) return false;
  const m = commandLine.match(/--user-data-dir=(?:"([^"]*)"|(\S+))/);
  if (!m) return false;
  const dir = (m[1] ?? m[2] ?? "").trim();
  if (!dir) return false;
  return dir.toLowerCase() === String(profileDir).toLowerCase();
}

/**
 * 生成实例精确归属的进程清理脚本（PowerShell）。语义与 matchesProfileOwnership
 * 同构：仅终止 --user-data-dir 精确等于本实例 profile 的进程；无 user-data-dir 或
 * 归属不明的进程一律不杀只计数（DEC-123 ③：无法确认归属→记录并停止清理）；
 * 输出 own/foreign/remaining 供清理后核对证据。
 */
export function buildKillProfileScript(profileDir) {
  const psSingleQuoted = String(profileDir).replace(/'/g, "''");
  return `
$candidates = Get-CimInstance Win32_Process -Filter "Name='chrome.exe'"
$own = @(); $foreign = @()
foreach ($p in $candidates) {
  $m = [regex]::Match($p.CommandLine, '--user-data-dir=(?:"([^"]*)"|(\\S+))')
  if (-not $m.Success) { $foreign += $p.ProcessId; continue }
  $dir = ($m.Groups[1].Value + $m.Groups[2].Value).Trim('"')
  if ($dir -ieq '${psSingleQuoted}') { $own += $p.ProcessId } else { $foreign += $p.ProcessId }
}
$own | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
Start-Sleep -Milliseconds 300
$remaining = @(Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object {
  $m = [regex]::Match($_.CommandLine, '--user-data-dir=(?:"([^"]*)"|(\\S+))')
  $m.Success -and (($m.Groups[1].Value + $m.Groups[2].Value).Trim('"') -ieq '${psSingleQuoted}')
})
Write-Output "own=$($own.Count) foreign=$($foreign.Count) remaining=$($remaining.Count)"
`.trim();
}

/**
 * 从简报首行提取 [TAG|...] 标记，供 #3 键漂移时唯一定位起点 user unit。
 * 无标记返回 null（回退既有固定 key 路径，负例强度不降）。
 */
export function extractBriefMarker(text) {
  const first = String(text || "").split(/\r?\n/, 1)[0] || "";
  const m = first.match(/^\[([^\]]{3,80})\]/);
  return m ? `[${m[1]}]` : null;
}

/**
 * 端口复用决策（纯函数，DEC-123 验收 R1 P1-1 整改）：归属查询失败/未知（null）一律
 * fail-closed 停止；明确查到 0 个本实例进程=foreign；>0 才可复用。
 * 禁止 null 落入放行分支（原实现 `ownProcs === 0` 判断使 null 放行——fail-open，已修）。
 */
export function decidePortReuse({ ownProcs }) {
  if (ownProcs === null || ownProcs === undefined || !Number.isInteger(ownProcs)) return "UNVERIFIED_STOP";
  if (ownProcs === 0) return "FOREIGN_STOP";
  if (ownProcs > 0) return "REUSE";
  return "UNVERIFIED_STOP";
}

/**
 * 端口注册表逐项校验（纯函数，DEC-123 验收 R1 P1-2 整改）：锁只能防并发分配竞态，
 * 不能证明已有内容合法——读取时逐项验证：实例 ID 合法且非 default、端口整数且在
 * 候选域内、跨实例唯一、不得占用 default 固定端口。任一违反→INSTANCE_REGISTRY_INVALID。
 */
export function validatePortRegistry(ports, { candidates, defaultPort }) {
  // R3 复验整改：仅接受普通对象（原型=Object.prototype 或 null）——Map/Date 等异型
  // 对象经 Object.entries 得空数组会"空转通过"，必须显式拒绝（R2 的数组拒绝在此加严）。
  // 注意顺序：Object.getPrototypeOf(null/undefined) 本身抛 TypeError，须先判空再取原型。
  if (ports === null || ports === undefined || typeof ports !== "object" || Array.isArray(ports)) {
    throw optionError("INSTANCE_REGISTRY_INVALID", `注册表 ports 必须是普通对象映射（禁数组/标量/null）: ${Array.isArray(ports) ? "array" : typeof ports}`);
  }
  const proto = Object.getPrototypeOf(ports);
  if (proto !== Object.prototype && proto !== null) {
    throw optionError("INSTANCE_REGISTRY_INVALID", `注册表 ports 必须是普通对象映射（禁 Map/Date/类实例等异型对象）: ${proto?.constructor?.name ?? "unknown"}`);
  }
  const seen = new Map();
  for (const [id, port] of Object.entries(ports)) {
    if (!INSTANCE_ID_PATTERN.test(String(id))) {
      throw optionError("INSTANCE_REGISTRY_INVALID", `注册表实例 ID 不合法: ${id}`, { instance: id });
    }
    if (String(id) === "default") {
      throw optionError("INSTANCE_REGISTRY_INVALID", "注册表不得登记 default 实例（default 端口固定 9222，不走注册表）", { instance: id });
    }
    if (!Number.isInteger(port) || port < candidates.min || port > candidates.max) {
      throw optionError("INSTANCE_REGISTRY_INVALID", `注册表端口非整数或越界 ${candidates.min}-${candidates.max}: ${id}=${port}`, { instance: id });
    }
    if (port === defaultPort) {
      throw optionError("INSTANCE_REGISTRY_INVALID", `注册表不得占用 default 固定端口 ${defaultPort}: ${id}`, { instance: id });
    }
    if (seen.has(port)) {
      throw optionError("INSTANCE_REGISTRY_INVALID", `注册表端口跨实例重复: ${seen.get(port)} 与 ${id} 同为 ${port}`, { instance: id });
    }
    seen.set(port, id);
  }
  return true;
}

// ── C9 账号级风控协调（DEC-128 ①五约束：退避不缩短/缺失与损坏分治/过期归一化/
//    浏览器边界复查/观察被动）——独立于实例锁的账号级统一退避状态 ──

export const ACCOUNT_BACKOFF_MIN_MINUTES = 9;   // 手册风暴通道口径（DEC-128 ③下限）
export const ACCOUNT_BACKOFF_MAX_MINUTES = 60;  // DEC-128 ③上限

export function accountStatePath(aieoRoot) {
  return join(aieoRoot, "runtime", "locks", "account-risk-state.json");
}

/**
 * 状态归一化（纯函数）。
 * 约束B：缺失（null/undefined）=明确的 NORMAL 初始化路径；损坏（结构/类型/字段无效）
 * =ACCOUNT_STATE_INVALID fail-closed，禁静默当作 NORMAL。
 * 约束C：BACKOFF 已过期（nowMs≥until）→归一化为 NORMAL（reason=expired-normalized），
 * 调用方（可写侧）须原子写回；只读侧在内存中使用归一化结果即可。
 */
export function normalizeAccountState(raw, nowMs) {
  if (raw === null || raw === undefined) {
    return {
      version: 1, state: "NORMAL", backoff_until: null, reason: null,
      observed_by: null, observed_at: null, initialized_at: new Date(nowMs).toISOString(),
    };
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw optionError("ACCOUNT_STATE_INVALID", `账号风控状态必须为普通对象映射（禁数组/标量）: ${Array.isArray(raw) ? "array" : typeof raw}`);
  }
  const proto = Object.getPrototypeOf(raw);
  if (proto !== Object.prototype && proto !== null) {
    throw optionError("ACCOUNT_STATE_INVALID", `账号风控状态须为普通对象（禁 Map/Date/类实例）: ${proto?.constructor?.name ?? "unknown"}`);
  }
  if (raw.version !== 1 || (raw.state !== "NORMAL" && raw.state !== "BACKOFF")) {
    throw optionError("ACCOUNT_STATE_INVALID", `账号风控状态结构无效: version=${JSON.stringify(raw.version)} state=${JSON.stringify(raw.state)}`);
  }
  if (raw.state === "BACKOFF") {
    if (typeof raw.backoff_until !== "string" || Number.isNaN(Date.parse(raw.backoff_until))) {
      throw optionError("ACCOUNT_STATE_INVALID", "BACKOFF 状态缺 backoff_until 或不可解析");
    }
    if (Date.parse(raw.backoff_until) <= nowMs) {
      // 约束C：过期收敛——返回归一化 NORMAL，由可写调用方原子写回
      return {
        version: 1, state: "NORMAL", backoff_until: null, reason: "expired-normalized",
        observed_by: raw.observed_by ?? null, observed_at: raw.observed_at ?? null,
        normalized_at: new Date(nowMs).toISOString(),
      };
    }
  }
  return raw;
}

/** 启动门判定（纯函数）：NORMAL→allowed；活动 BACKOFF→blocked（含 until/reason）。 */
export function evaluateAccountGate(state) {
  if (state?.state === "BACKOFF") {
    return { allowed: false, until: state.backoff_until, reason: state.reason ?? "backoff" };
  }
  return { allowed: true };
}

/**
 * 退避写入（纯函数）。
 * 约束A：已有活动 BACKOFF 时只能延长或维持——新 until=max(旧 until, now+minutes)，
 * 不得被更短的退避覆盖（DEC-128 ①A）。
 * 约束③口径：minutes 钳位 [9,60]；低于下限拉到 9，高于上限拉到 60。
 */
export function applyAccountBackoff(state, nowMs, minutes, reason = "429-observed", observer = "unknown") {
  if (typeof state !== "object" || state === null || state.state === undefined) {
    throw optionError("ACCOUNT_STATE_INVALID", "applyAccountBackoff 需要 normalizeAccountState 产出的状态");
  }
  const clamped = Math.min(ACCOUNT_BACKOFF_MAX_MINUTES, Math.max(ACCOUNT_BACKOFF_MIN_MINUTES, Math.round(Number(minutes))));
  if (!Number.isFinite(clamped)) throw optionError("ACCOUNT_STATE_INVALID", "退避时长不可解析");
  const proposedUntil = new Date(nowMs + clamped * 60000).toISOString();
  const existingUntil = state.state === "BACKOFF" && typeof state.backoff_until === "string"
    && !Number.isNaN(Date.parse(state.backoff_until)) ? state.backoff_until : null;
  const until = existingUntil && Date.parse(existingUntil) > Date.parse(proposedUntil) ? existingUntil : proposedUntil;
  return {
    version: 1, state: "BACKOFF", backoff_until: until,
    reason: existingUntil && until === existingUntil ? (state.reason ?? reason) : reason,
    observed_by: observer, observed_at: new Date(nowMs).toISOString(),
  };
}

/** C9 验收 R2 整改：锁重试超时配置必须为有限正数；非法值明确回退 60000，禁 NaN 无界循环。 */
export function resolveAccountLockTimeoutMs(raw) {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 60000;
}

/** 状态读取（文件级）：缺失=NORMAL 初始化；损坏/异型=fail-closed（约束B）。 */
export function readAccountStateFile(path, nowMs) {
  if (!existsSync(path)) return normalizeAccountState(null, nowMs);
  let raw;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw optionError("ACCOUNT_STATE_INVALID", `账号风控状态读取/解析失败，禁静默当作 NORMAL: ${error.message}`);
  }
  return normalizeAccountState(raw, nowMs);
}

/** 状态原子写入（M1/端口注册表同模式：临时文件+回读+rename）。 */
export function writeAccountStateFileAtomic(path, state) {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.${Date.now()}.tmp`;
  try {
    writeFileSync(temp, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    const readback = JSON.parse(readFileSync(temp, "utf8"));
    if (JSON.stringify(readback) !== JSON.stringify(state)) throw new Error("state readback mismatch");
    renameSync(temp, path);
  } catch (error) {
    try { renameSync(temp, `${temp}.orphan`); } catch {}
    if (error.code === "ACCOUNT_STATE_INVALID") throw error;
    throw optionError("ACCOUNT_STATE_WRITE_FAILED", `账号风控状态原子写入失败: ${error.message}`);
  }
}

export function parseDispatchOptions(argv, { readMessageFile = (path) => readFileSync(path, "utf8") } = {}) {
  if (!Array.isArray(argv)) throw new TypeError("argv 必须是数组");
  const newSession = argv.includes("--new-session");
  // DEC-123：--instance 派生实例域（锁/端口/profile/清理归属）；缺省=default（原行为）。
  const instanceId = normalizeInstanceId(optionalArg(argv, "--instance"));
  const sessionResult = optionalArg(argv, "--session-result");
  if (newSession && sessionResult !== null) {
    throw optionError("DISPATCH_SESSION_AMBIGUOUS", "--new-session 与 --session-result 只能提供一项");
  }
  const registerM1Flag = argv.includes("--register-m1");
  // DEC-094 #4：任务腿/一次性 --new-session 派单不得覆盖 reviewer 指针（实战两次
  // 误覆盖→简报错发实战会话）。默认仍更新（保持审查会话迁移既有语义）；显式
  // --no-update-pointer 才跳过写盘，纯增量、零默认行为变化。
  const noUpdatePointer = argv.includes("--no-update-pointer");
  const messageValue = optionalArg(argv, "--message");
  const messageFile = optionalArg(argv, "--message-file");
  if (messageValue !== null && messageFile !== null) {
    throw optionError("DISPATCH_MESSAGE_AMBIGUOUS", "--message 与 --message-file 只能提供一项");
  }
  const requestText = messageFile !== null ? readMessageFile(messageFile) : messageValue;
  const message = messageFile !== null ? requestText.trim() : requestText;
  if (!message) {
    throw optionError(
      "DISPATCH_MESSAGE_REQUIRED",
      "用法: node gpt_dispatch.mjs [--new-session] (--message-file <txt> | --message <文本>) [--task-id <id> --execution-id <id> --correlation-id <id> --schema <path> | --schema <path>]",
    );
  }

  const ids = {
    task_id: optionalArg(argv, "--task-id"),
    execution_id: optionalArg(argv, "--execution-id"),
    correlation_id: optionalArg(argv, "--correlation-id"),
  };
  const schemaPath = optionalArg(argv, "--schema");
  for (const [field, value] of Object.entries(ids)) {
    if (value !== null && !DISPATCH_ID_RULES[field].test(value)) {
      throw optionError("DISPATCH_ID_INVALID", `${field} 格式不合法: ${value}`, { field });
    }
  }

  const providedIds = Object.entries(ids).filter(([, value]) => value !== null).map(([field]) => field);
  const m1RegistrationRequested = registerM1Flag || providedIds.length > 0;
  if (m1RegistrationRequested) {
    const missing = Object.entries(ids).filter(([, value]) => value === null).map(([field]) => field);
    if (missing.length > 0 || schemaPath === null) {
      throw optionError(
        "DISPATCH_M1_BINDING_INCOMPLETE",
        "请求 M1 登记或提供任一 task_id/execution_id/correlation_id 时，三 ID 与 --schema 必须全部提供；缺少任一项均在派单前失败",
        { missing_ids: missing, schema_provided: schemaPath !== null },
      );
    }
  }

  return {
    message,
    requestText,
    newSession,
    sessionResult,
    noUpdatePointer,
    instanceId,
    ids,
    schemaPath,
    m1RegistrationRequested,
    m1RegistrationStatus: m1RegistrationRequested ? "REQUESTED" : "NOT_REQUESTED",
  };
}
