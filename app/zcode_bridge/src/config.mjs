// AIEO Phase 1 M3 ZCode Bridge — C6 配置解析（platform-contract-v1.0 §7）
//
// 规则（C6 §7.1）：环境变量 > 配置文件 > 内置默认值；环境变量全大写 AIEO_ 前缀，
// 模块级为 AIEO_ZCODE_BRIDGE_<KEY>，跨模块公共项为 AIEO_<KEY>。
//
// 边界（如实声明）：config/aieo.yaml 配置文件层未在 M3 落地（归属主会话/开工会议定稿的
// 工作区路径等未定），本模块只实现 环境变量 > 内置默认值 两级；AIEO_ENV 按 C6 为必填，
// 但 M3 尚未接入统一启动校验，缺省时回退 "development" 并由调用方打 WARNING（见
// loadConfig 返回的 configWarnings），不伪造"已做 fail-fast"。

import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** 项目根（app/zcode_bridge/src → 上溯三级）。只用于解析相对默认路径，禁止硬编码机器绝对路径。 */
export const PROJECT_ROOT = resolve(__dirname, "..", "..", "..");

/** ZCode CLI 权限模式白名单（MINOR-004 落地；POC-02 实测 --mode 默认 yolo，生产禁用）。 */
export const ZCODE_MODE_WHITELIST = ["build", "edit", "guarded"];

function intFromEnv(name, fallback, { min = 0 } = {}) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < min) {
    throw new Error(`AIEO_CONFIG_INVALID: ${name} 必须为 ≥${min} 的整数，实际值 "${raw}"`);
  }
  return n;
}

function listFromEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

/**
 * 解析 M3 配置。任何缺失/非法项收集进 configWarnings（不抛异常、不静默），
 * 由启动方决定是否 fail-fast（见 bin/aieo-zcode-mcp.mjs）。
 */
export function loadConfig(env = process.env) {
  const warnings = [];

  const aieoEnv = env.AIEO_ENV;
  if (!aieoEnv) {
    warnings.push("AIEO_ENV 未设置（C6 必填项）；M3 本地回退 development，统一 fail-fast 校验待平台接入");
  }
  const effectiveEnv = aieoEnv || "development";
  if (!["development", "test", "production"].includes(effectiveEnv)) {
    throw new Error(`AIEO_CONFIG_INVALID: AIEO_ENV 只允许 development/test/production，实际 "${effectiveEnv}"`);
  }

  // 日志目录：模块级 > 共享级（AIEO_LOG_DIR/zcode_bridge）> 默认 runtime/logs/zcode_bridge
  let logDir;
  if (env.AIEO_ZCODE_BRIDGE_LOG_DIR) {
    logDir = resolve(PROJECT_ROOT, env.AIEO_ZCODE_BRIDGE_LOG_DIR);
  } else if (env.AIEO_LOG_DIR) {
    logDir = join(resolve(PROJECT_ROOT, env.AIEO_LOG_DIR), "zcode_bridge");
  } else {
    logDir = join(PROJECT_ROOT, "runtime", "logs", "zcode_bridge");
  }

  // 锁目录：默认 runtime/locks/zcode_bridge
  const lockDir = env.AIEO_ZCODE_BRIDGE_LOCK_DIR
    ? resolve(PROJECT_ROOT, env.AIEO_ZCODE_BRIDGE_LOCK_DIR)
    : join(PROJECT_ROOT, "runtime", "locks", "zcode_bridge");

  const allowedModes = listFromEnv("AIEO_ZCODE_BRIDGE_ALLOWED_MODES", ZCODE_MODE_WHITELIST);
  for (const m of allowedModes) {
    if (!ZCODE_MODE_WHITELIST.includes(m)) {
      throw new Error(`AIEO_CONFIG_INVALID: AIEO_ZCODE_BRIDGE_ALLOWED_MODES 含白名单外模式 "${m}"（允许 ${ZCODE_MODE_WHITELIST.join("/")}）`);
    }
  }

  // M1 服务身份凭证（C7 §8.6）：只从环境读取，绝不进日志/配置文件
  const m1ServiceToken = env.AIEO_ZCODE_BRIDGE_M1_SERVICE_TOKEN ?? null;
  if (m1ServiceToken) {
    warnings.push("AIEO_ZCODE_BRIDGE_M1_SERVICE_TOKEN 已设置；M1 本机服务身份认证语义待 C7 实现，当前仅随请求透传 Authorization 头");
  }

  const config = {
    env: effectiveEnv,
    logDir,
    lockDir,
    // M1 REST 基址（C1：默认仅绑定 127.0.0.1）
    m1BaseUrl: env.AIEO_ZCODE_BRIDGE_M1_BASE_URL ?? "http://127.0.0.1:8000",
    m1ServiceToken,
    // M1Client 形态：http（默认，对接 M1 REST）/ fake-file（测试：内存假实现 + 状态文件落盘）
    m1ClientMode: env.AIEO_ZCODE_BRIDGE_M1_MODE ?? "http",
    m1FakeStatePath: env.AIEO_ZCODE_BRIDGE_M1_FAKE_STATE
      ? resolve(PROJECT_ROOT, env.AIEO_ZCODE_BRIDGE_M1_FAKE_STATE)
      : null,
    // ZCode CLI（MINOR-005 同类思路：可执行路径配置化）
    zcodeCliPath: env.AIEO_ZCODE_BRIDGE_CLI_PATH ?? "zcode",
    allowedModes,
    // DEC-006 取消链路
    taskTimeoutMs: intFromEnv("AIEO_ZCODE_BRIDGE_TASK_TIMEOUT_MS", 1_800_000, { min: 1_000 }),
    cancelGraceMs: intFromEnv("AIEO_ZCODE_BRIDGE_CANCEL_GRACE_MS", 10_000, { min: 0 }),
    // 日志保留天数（C4 §5.2，轮转清理为尽力而为）
    logRetentionDays: intFromEnv("AIEO_LOG_RETENTION_DAYS", 30, { min: 1 }),
  };

  return { ...config, configWarnings: warnings };
}

/** 确保目录存在（幂等）。 */
export function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}
