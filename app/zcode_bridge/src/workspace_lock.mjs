// AIEO Phase 1 M3 ZCode Bridge — 工作区写锁（module-boundaries §6 + DEC-001）
//
// 资源边界（module-boundaries §6）：工作区写锁保护"模块工作目录 / 代码写入"，
// 持有者 = M3 派生的执行进程，单会话单任务、每工作区一把；超时 = 任务单交付期限 +
// CLI 超时兜底；异常释放 = 进程树终止兜底时同步释放；janitor 清理残留。
//
// DEC-001 核心教训：互斥必须交给内核，内容仲裁必有竞态。实现参照
// phase0/e2e-poc/session_lock.mjs（v7：PowerShell 守护进程持有锁文件 FileShare.None
// 独占句柄 + stdin 管道生命周期）——竞争与释放完全不依赖文件内容：
//   持锁 = 守护进程持有 FileShare.None 独占句柄（内核原子）；
//   竞争 = 后来者 Open 同一文件 → 共享冲突 → fail-closed 拒绝（内核裁决）；
//   释放 = 父进程写一行 release 信号 / 持有者死亡 → 管道 EOF / TTL 到期（守护进程自退）。
// 锁文件内容仅作审计（holder pid 等），从不参与竞争判定。
//
// 锁服务可用性以可注入接口提供（本模块接口 LockService）：
//   - OsHandleWorkspaceLock：默认实现（Windows 内置 PowerShell，每次获取 ~0.3-1s 开销）；
//   - InMemoryWorkspaceLock：单进程内假实现（单元测试 / 与 MCP Server 组合测试注入用），
//     不提供跨进程互斥，只模拟冲突判定语义。

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { aieoError } from "./errors.mjs";

const ACQUIRE_TIMEOUT_MS = 30_000;
const RELEASE_WAIT_MS = 3_000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randTag() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 工作区路径 → 锁文件名（哈希防非法字符；内容不参与仲裁，只作文件名）。 */
export function lockFileNameFor(workspacePath) {
  const norm = String(workspacePath).replace(/[\\/]+/g, "/").replace(/\/+$/, "").toLowerCase();
  const digest = createHash("sha256").update(norm).digest("hex").slice(0, 16);
  const base = norm.split("/").filter(Boolean).pop() ?? "workspace";
  const safe = base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 32);
  return `${safe}-${digest}.lockfile`;
}

const DAEMON_PS1 = `
param($LockFile,$ResultFile,$HolderJson,$TtlMs)
$ErrorActionPreference = 'Stop'
try {
  $fs = [System.IO.File]::Open($LockFile, [System.IO.FileMode]::OpenOrCreate, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
} catch {
  [System.IO.File]::WriteAllText($ResultFile, (ConvertTo-Json @{ outcome = 'conflict'; error = $_.Exception.Message.Substring(0, [Math]::Min(160, $_.Exception.Message.Length)) }))
  exit 3
}
try {
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($HolderJson)
  $fs.SetLength(0)
  $fs.Write($bytes, 0, $bytes.Length)
  $fs.Flush()
  [System.IO.File]::WriteAllText($ResultFile, (ConvertTo-Json @{ outcome = 'acquired' }))
  # 阻塞等待三选一：父进程写一行（release 信号）/ 管道 EOF（持有者死亡）/ TTL 到期（兜底释放）。
  # 实现注记（R10 教训同源：不赌框架语义，逐项探针验证）：
  #   - [Console]::In 的 ReadLineAsync 在 Windows PowerShell 中是同步阻塞，Wait 超时永不触发；
  #   - StreamReader.ReadLineAsync().Wait(int) 在无控制台宿主（Node spawn + windowsHide）中
  #     超时同样不可靠（实测 >80s 不返回，仅在继承控制台时正常）；
  #   - 改用 BeginRead + AsyncWaitHandle.WaitOne(250ms 分片)：内核 WaitForSingleObject，
  #     超时 / release 信号（n>0）/ EOF（n=0，持有者死亡）三路径均确定性触发。
  $stdin = [Console]::OpenStandardInput()
  $buf = New-Object byte[] 64
  $ar = $stdin.BeginRead($buf, 0, $buf.Length, $null, $null)
  $wait = $ar.AsyncWaitHandle
  $deadline = [DateTime]::UtcNow.AddMilliseconds([int]$TtlMs)
  $signaled = $false
  while ([DateTime]::UtcNow -lt $deadline) {
    if ($wait.WaitOne(250)) { $signaled = $true; break }
  }
  if ($signaled) {
    # EndRead：release 信号（n>0）或管道 EOF（n=0，持有者死亡）→ 两者都走释放路径
    $null = $stdin.EndRead($ar)
  }
} finally {
  $fs.Close()
}
[System.IO.File]::WriteAllText($ResultFile, (ConvertTo-Json @{ outcome = 'released' }))
exit 0
`;

/**
 * 默认锁服务：OS 句柄互斥（DEC-001）。
 * @param {{lockDir: string}} opts 锁目录（C6：AIEO_ZCODE_BRIDGE_LOCK_DIR，默认 runtime/locks/zcode_bridge）
 */
export class OsHandleWorkspaceLock {
  constructor(opts) {
    if (!opts?.lockDir) throw new Error("SYS-0001: OsHandleWorkspaceLock 需要 lockDir");
    this.lockDir = opts.lockDir;
    this._held = new Map(); // lockPath → handle（供 release 与兜底终止时同步释放）
  }

  /**
   * 获取工作区写锁。
   * @param {{workspacePath: string, taskId: string, sessionId: string, ttlMs?: number}} req
   * @returns {Promise<{lockPath: string, info: object, release: () => Promise<void>}>}
   * @throws RES-0002（句柄被其他进程持有，fail-closed）
   */
  async acquire(req) {
    if (!req?.workspacePath || !req?.taskId || !req?.sessionId) {
      throw aieoError("REQ-0001", "INVALID_ARGUMENT: acquire 需要 workspacePath/taskId/sessionId");
    }
    mkdirSync(this.lockDir, { recursive: true });
    const lockPath = join(this.lockDir, lockFileNameFor(req.workspacePath));
    const workDir = join(this.lockDir, `lockwork-${randTag()}`);
    mkdirSync(workDir, { recursive: true });
    const resultFile = join(workDir, "result.json");
    const daemonFile = join(workDir, "daemon.ps1");
    // 必须带 UTF-8 BOM：Windows PowerShell 5.1 对无 BOM 的 .ps1 按 ANSI(GBK) 误读，
    // 中文注释字节会把相邻换行吞进双字节配对，导致紧随其后的代码行被并入注释
    // （实测：$stdin 赋值行被吞 → 守护进程写完 acquired 即崩溃 → 锁静默失效）。
    writeFileSync(daemonFile, "\uFEFF" + DAEMON_PS1, "utf8");
    const info = {
      pid: process.pid,
      task_id: req.taskId,
      session_id: req.sessionId,
      workspace: String(req.workspacePath),
      ttl_ms: req.ttlMs ?? null,
      born_at: new Date().toISOString(),
      rand: randTag(),
    };

    const child = spawn("powershell", [
      "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", daemonFile,
      lockPath, resultFile, JSON.stringify(info), String(req.ttlMs ?? 2147483647),
    ], { stdio: ["pipe", "ignore", "pipe"], windowsHide: true });
    child.stderr.on("data", () => { /* 守护进程诊断：静默（result 文件为准） */ });

    // 等待守护进程结果（acquired / conflict）——result 文件只是守护进程→父进程信令，不参与仲裁
    const t0 = Date.now();
    let result = null;
    for (;;) {
      if (child.exitCode !== null) break; // 守护进程异常退出
      try {
        if (existsSync(resultFile)) { result = JSON.parse(readFileSync(resultFile, "utf8")); break; }
      } catch { /* 写入中，下一轮再读 */ }
      if (Date.now() - t0 > ACQUIRE_TIMEOUT_MS) {
        try { child.kill(); } catch { /* 已退出 */ }
        try { rmSync(workDir, { recursive: true, force: true }); } catch { /* 残留交 janitor */ }
        throw aieoError("RES-0002", `RESOURCE_CONFLICT: 获取工作区写锁超时（${ACQUIRE_TIMEOUT_MS}ms），fail-closed 拒绝执行`, {
          details: { lock_path: lockPath, workspace: String(req.workspacePath) },
        });
      }
      await sleep(50);
    }

    if (!result || result.outcome !== "acquired") {
      try { child.kill(); } catch { /* 已退出 */ }
      try { rmSync(workDir, { recursive: true, force: true }); } catch { /* 残留交 janitor */ }
      throw aieoError("RES-0002", `RESOURCE_CONFLICT: 工作区写锁被其他进程持有（OS 句柄级互斥），单工作区同一时刻只允许一个任务写入${result?.error ? `。详情: ${result.error}` : ""}`, {
        details: { lock_path: lockPath, workspace: String(req.workspacePath) },
      });
    }
    // fail-closed 防御：守护进程写完 acquired 后若立即死亡（脚本崩溃/编码陷阱），
    // 句柄已随之关闭，此刻返回的"锁"并不成立 → 拒绝发放（不伪造持锁状态）
    if (child.exitCode !== null) {
      try { rmSync(workDir, { recursive: true, force: true }); } catch { /* 残留交 janitor */ }
      throw aieoError("RES-0002", `RESOURCE_CONFLICT: 写锁守护进程在获取后异常退出（exit=${child.exitCode}），锁不成立，fail-closed 拒绝执行`, {
        details: { lock_path: lockPath, workspace: String(req.workspacePath), daemon_exit: child.exitCode },
      });
    }

    const handle = {
      lockPath,
      info,
      release: async () => {
        if (this._held.get(lockPath) !== handle) return; // 幂等 release
        this._held.delete(lockPath);
        try { child.stdin.write("release\n"); } catch { /* 管道已断（持有者死亡路径） */ }
        try { child.stdin.end(); } catch { /* 管道已断 */ }
        const t = Date.now();
        for (;;) {
          let done = false;
          try { if (readFileSync(resultFile, "utf8").includes("released")) done = true; } catch { done = true; }
          if (done || child.exitCode !== null) break;
          if (Date.now() - t > RELEASE_WAIT_MS) { try { child.kill(); } catch { /* 兜底 */ } break; }
          await sleep(50);
        }
        try { rmSync(workDir, { recursive: true, force: true }); } catch { /* 残留交 janitor */ }
      },
    };
    this._held.set(lockPath, handle);
    return handle;
  }

  /** janitor（module-boundaries §6 待办落位）：清理残留 lockwork-* 目录（release 崩溃等场景，尽力而为）。 */
  async janitor(olderThanMs = 3_600_000) {
    let removed = 0;
    try {
      if (!existsSync(this.lockDir)) return 0;
      const cutoff = Date.now() - olderThanMs;
      for (const name of readdirSync(this.lockDir)) {
        if (!name.startsWith("lockwork-")) continue;
        const full = join(this.lockDir, name);
        try {
          if (statSync(full).mtimeMs < cutoff) { rmSync(full, { recursive: true, force: true }); removed += 1; }
        } catch { /* 正被使用或权限问题：跳过 */ }
      }
    } catch { /* 尽力而为 */ }
    return removed;
  }
}

/**
 * 内存假锁服务（测试注入用）：模拟 OS 句柄冲突判定语义（同 key 二次获取 → RES-0002），
 * 不提供跨进程互斥；进程退出锁即消失（对应 OS 句柄随进程死亡释放的语义）。
 */
export class InMemoryWorkspaceLock {
  constructor() {
    this._held = new Map(); // key → {info, release}
  }

  _key(workspacePath) {
    return lockFileNameFor(workspacePath);
  }

  async acquire(req) {
    const key = this._key(req.workspacePath);
    if (this._held.has(key)) {
      const prev = this._held.get(key).info;
      throw aieoError("RES-0002", `RESOURCE_CONFLICT: 工作区写锁被其他任务持有（task=${prev.task_id}/session=${prev.session_id}），单工作区同一时刻只允许一个任务写入`, {
        details: { workspace: String(req.workspacePath), held_by_task: prev.task_id, held_by_session: prev.session_id },
      });
    }
    const handle = {
      lockPath: key,
      info: { task_id: req.taskId, session_id: req.sessionId, born_at: new Date().toISOString() },
      release: async () => {
        if (this._held.get(key) === handle) this._held.delete(key);
      },
    };
    this._held.set(key, handle);
    return handle;
  }

  /** 测试辅助：当前持锁信息。 */
  holderOf(workspacePath) {
    return this._held.get(this._key(workspacePath))?.info ?? null;
  }
}

/** 便捷封装：withWorkspaceLock(fn) —— 持锁执行，异常/正常路径都释放。 */
export async function withWorkspaceLock(lockService, req, fn) {
  const handle = await lockService.acquire(req);
  try {
    return await fn(handle);
  } finally {
    await handle.release();
  }
}
