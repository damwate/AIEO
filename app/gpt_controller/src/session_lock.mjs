// M2 浏览器会话锁（自 phase0/e2e-poc/session_lock.mjs v7 整理，DEC-001）。
//
// 核心语义保持不变：**竞争与释放完全不依赖文件内容，只依赖 OS 句柄与进程生命周期**——
//   - 持锁 = PowerShell 守护进程持有锁文件的 FileShare.None 独占句柄（内核原子）；
//   - 竞争 = 他人 Open 同一文件 → 共享冲突 → fail-closed 拒绝（内核裁决，无可竞争面）；
//   - 释放 = 父进程向守护进程 stdin 写入一行（管道信号）；
//   - 持有者死亡 = 管道 EOF（内核保证）→ 守护进程退出 → 句柄释放。
// 锁文件内容仅作审计（holder pid 等），从不参与竞争判定（DEC-001：禁止内容仲裁）。
//
// 已知边界（module-boundaries §6，如实声明）：锁只约束接入了锁机制的自动化操作；
// 手工操作与未接入锁的进程可绕过，人工边界是强制性约定，不依赖代码。

import { spawn } from "node:child_process";
import { writeFileSync, readFileSync, existsSync, mkdirSync, rmSync, createWriteStream } from "node:fs";
import { dirname, join } from "node:path";
import { AIEO_ROOT } from "./config.mjs";
import { controllerError } from "./errors.mjs";

export const LOCK_PATH_DEFAULT = join(AIEO_ROOT, "runtime", "locks", "gpt-session.lockfile");
const ACQUIRE_TIMEOUT_MS = 30000;

const DAEMON_PS1 = `
param($LockFile,$ResultFile,$HolderJson)
$ErrorActionPreference = 'Stop'
try {
  $fs = [System.IO.File]::Open($LockFile, [System.IO.FileMode]::OpenOrCreate, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
} catch {
  [System.IO.File]::WriteAllText($ResultFile, (ConvertTo-Json @{ outcome = 'conflict'; error = $_.Exception.Message.Substring(0, [Math]::Min(120, $_.Exception.Message.Length)) }))
  exit 3
}
try {
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($HolderJson)
  $fs.SetLength(0)
  $fs.Write($bytes, 0, $bytes.Length)
  $fs.Flush()
  [System.IO.File]::WriteAllText($ResultFile, (ConvertTo-Json @{ outcome = 'acquired' }))
  # 阻塞等待：父进程写一行（release 信号）或父进程死亡（管道 EOF）——两者皆退出并释放句柄
  $null = [Console]::In.ReadLine()
} finally {
  $fs.Close()
}
[System.IO.File]::WriteAllText($ResultFile, (ConvertTo-Json @{ outcome = 'released' }))
exit 0
`;

function randTag() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function lockConflict(message, details = undefined) {
  return controllerError("SESSION_LOCK_CONFLICT", message, { details, retryable: false });
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * 获取会话独占锁（v7，OS 句柄 + stdin 生命周期）。
 * @returns {{lockPath: string, info: object, release: () => void}}
 * @throws GptControllerError(code=SESSION_LOCK_CONFLICT)（句柄被其他进程持有，fail-closed 拒绝执行）
 */
export function acquireSessionLock(opts = {}) {
  const lockPath = opts.lockPath ?? LOCK_PATH_DEFAULT;
  mkdirSync(dirname(lockPath), { recursive: true });
  const workDir = join(dirname(lockPath), `lockwork-${randTag()}`);
  mkdirSync(workDir, { recursive: true });
  const resultFile = join(workDir, "result.json");
  const daemonFile = join(workDir, "daemon.ps1");
  writeFileSync(daemonFile, DAEMON_PS1, "utf8");
  const info = { pid: process.pid, holder: opts.holder ?? "unknown", born_at: new Date().toISOString(), rand: randTag() };

  // 守护进程 stderr 落盘（诊断；正常为空；workDir 被清理时静默丢弃）
  const child = spawn("powershell", [
    "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", daemonFile,
    lockPath, resultFile, JSON.stringify(info),
  ], { stdio: ["pipe", "ignore", "pipe"], windowsHide: true });
  try {
    const es = createWriteStream(join(workDir, "daemon-stderr.txt"));
    es.on("error", () => { /* workDir 已清理等场景：诊断流失败不影响锁语义 */ });
    child.stderr.pipe(es);
  } catch { /* 诊断失败不影响锁语义 */ }

  // 等待守护进程结果（acquired / conflict）
  const t0 = Date.now();
  for (;;) {
    if (existsSync(resultFile)) break;
    if (Date.now() - t0 > ACQUIRE_TIMEOUT_MS) {
      try { child.kill(); } catch { /* 已退出 */ }
      try { rmSync(workDir, { recursive: true, force: true }); } catch { /* 诊断残留 */ }
      throw lockConflict(`获取锁超时（${ACQUIRE_TIMEOUT_MS}ms），本次拒绝执行。`);
    }
    sleepSync(100);
  }
  let result;
  try { result = JSON.parse(readFileSync(resultFile, "utf8")); } catch { result = { outcome: "unknown" }; }
  if (result.outcome !== "acquired") {
    try { child.kill(); } catch { /* 已退出 */ }
    try { rmSync(workDir, { recursive: true, force: true }); } catch { /* 诊断残留 */ }
    throw lockConflict(
      `锁文件句柄被其他进程持有（OS 级互斥）。同一 ChatGPT 会话同一时刻只允许一个在途任务，本次拒绝执行。${result.error ? " 详情: " + result.error : ""}`,
      { holder: result },
    );
  }

  let released = false;
  return {
    lockPath,
    info,
    workDir,
    daemonPid: child.pid,
    release() {
      if (released) return;
      released = true;
      // release 信号：向守护进程 stdin 写一行 → 其 ReadLine 返回 → 关句柄退出
      try { child.stdin.write("release\n"); } catch { /* 管道已断 */ }
      try { child.stdin.end(); } catch { /* 管道已断 */ }
      // 等待守护进程退出（≤3s 兜底强杀；正常路径守护进程自行退出并写 released）
      const t = Date.now();
      for (;;) {
        let done = false;
        try { if (readFileSync(resultFile, "utf8").includes("released")) done = true; } catch { done = true; }
        if (done) break;
        if (Date.now() - t > 3000) { try { child.kill(); } catch { /* 兜底 */ } break; }
        sleepSync(100);
      }
      try { rmSync(workDir, { recursive: true, force: true }); } catch { /* 诊断残留 */ }
    },
  };
}

/** 便捷封装 */
export async function withSessionLock(fn, opts = {}) {
  const lock = acquireSessionLock(opts);
  try {
    return await fn(lock);
  } finally {
    lock.release();
  }
}
