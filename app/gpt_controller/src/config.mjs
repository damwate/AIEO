import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { controllerError } from "./errors.mjs";

const MODULE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
export const AIEO_ROOT = join(MODULE_DIR, "..", "..");

export const CONTROLLER_DEFAULTS = Object.freeze({
  maxReplyBytes: 1024 * 1024,
  generationTimeoutMs: 300000,
  confirmWindowMs: 75000,
  stableReadIntervalMs: 3000,
  sendAcceptTimeoutMs: 30000,
  readyTimeoutMs: 40000,
  pollIntervalMs: 1000,
});

const ENV_KEYS = Object.freeze({
  runtimeDir: "AIEO_GPT_CONTROLLER_RUNTIME_DIR",
  maxReplyBytes: "AIEO_GPT_CONTROLLER_MAX_REPLY_BYTES",
  generationTimeoutMs: "AIEO_GPT_CONTROLLER_GENERATION_TIMEOUT_MS",
  confirmWindowMs: "AIEO_GPT_CONTROLLER_CONFIRM_WINDOW_MS",
  stableReadIntervalMs: "AIEO_GPT_CONTROLLER_STABLE_READ_INTERVAL_MS",
  sendAcceptTimeoutMs: "AIEO_GPT_CONTROLLER_SEND_ACCEPT_TIMEOUT_MS",
  readyTimeoutMs: "AIEO_GPT_CONTROLLER_READY_TIMEOUT_MS",
  pollIntervalMs: "AIEO_GPT_CONTROLLER_POLL_INTERVAL_MS",
});

function integerConfig(field, value, minimum) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum) {
    throw controllerError("GPT_CONTROLLER_CONFIG_INVALID", `${field} 必须是 >=${minimum} 的整数`, { details: { field } });
  }
  return parsed;
}

// 优先级严格为 env > 显式覆盖（测试/包内调用） > 内置默认值。
export function resolveControllerConfig(overrides = {}, env = process.env) {
  const runtimeDir = resolve(env[ENV_KEYS.runtimeDir] ?? overrides.runtimeDir ?? join(AIEO_ROOT, "runtime", "gpt_controller"));
  const config = { runtimeDir };
  for (const [field, defaultValue] of Object.entries(CONTROLLER_DEFAULTS)) {
    const minimum = field === "confirmWindowMs" || field === "pollIntervalMs" ? 0 : 1;
    config[field] = integerConfig(field, env[ENV_KEYS[field]] ?? overrides[field] ?? defaultValue, minimum);
  }
  if (config.stableReadIntervalMs < 3000) {
    throw controllerError("GPT_CONTROLLER_CONFIG_INVALID", "stableReadIntervalMs 不得小于合同规定的 3000ms");
  }
  config.sessionStorePath = resolve(overrides.sessionStorePath ?? join(runtimeDir, "sessions.json"));
  config.artifactDir = resolve(overrides.artifactDir ?? join(runtimeDir, "artifacts"));
  config.dispatchDir = resolve(overrides.dispatchDir ?? join(runtimeDir, "dispatches"));
  config.registryPath = resolve(overrides.registryPath ?? join(runtimeDir, "m1-artifact-registry.json"));
  config.lockDir = resolve(overrides.lockDir ?? join(runtimeDir, "locks"));
  return Object.freeze(config);
}
