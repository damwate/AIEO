// 锁互斥测试子进程（⑨）。协议：stdout 每行一个 JSON 事件。
//   node tests/lock_child.mjs --lock-path <path> --hold-ms <n> [--mode acquire|try-once]
//   事件: {"event":"acquired"} → 持锁 hold-ms → {"event":"released"} → exit 0
//         {"event":"conflict","code":"SESSION_LOCK_CONFLICT"} → exit 0
//         {"event":"error","code":...} → exit 1

import { acquireSessionLock } from "../src/session_lock.mjs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function emit(event) {
  process.stdout.write(`${JSON.stringify(event)}\n`);
}

function arg(flag, fallback = null) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const lockPath = arg("--lock-path");
const holdMs = Number(arg("--hold-ms", "1000"));
const mode = arg("--mode", "acquire");

try {
  const lock = acquireSessionLock({ lockPath, holder: `lock_child:${process.pid}` });
  emit({ event: "acquired", pid: process.pid });
  await sleep(holdMs);
  lock.release();
  emit({ event: "released", pid: process.pid });
  process.exit(0);
} catch (error) {
  if (error?.code === "SESSION_LOCK_CONFLICT") {
    if (mode === "try-once") emit({ event: "conflict", code: error.code });
    else emit({ event: "conflict", code: error.code });
    process.exit(0);
  }
  emit({ event: "error", code: error?.code ?? "UNKNOWN", message: error?.message });
  process.exit(1);
}
