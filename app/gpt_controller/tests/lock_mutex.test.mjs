// ⑨ 会话锁互斥测试（真实执行，DEC-001：OS 句柄互斥，禁止文件内容仲裁）：
//   - 两进程竞争同一把锁：一胜一 SESSION_LOCK_CONFLICT（fail-closed）；
//   - 持有者释放（stdin 信号）后，第三方可立即获取（无内容仲裁、无 TTL 等待）；
//   - 预先写入的锁文件垃圾内容不影响竞争结果（内容仅审计）；
//   - 同进程重复获取同样被拒。
// 每个子进程跑真实的 PowerShell 守护进程（session_lock.mjs v7 路径），不 mock 内核语义。

import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { acquireSessionLock, LOCK_PATH_DEFAULT } from "../src/session_lock.mjs";

const TEST_DIR = fileURLToPath(new URL(".", import.meta.url));
const CHILD_SCRIPT = join(TEST_DIR, "lock_child.mjs");

function spawnChild(lockPath, { holdMs = 500 } = {}) {
  const child = spawn(process.execPath, [CHILD_SCRIPT, "--lock-path", lockPath, "--hold-ms", String(holdMs)], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let buffer = "";
  child.stdout.setEncoding("utf8");
  const waitEvent = (name, timeoutMs = 30000) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`等待事件 ${name} 超时；已收到缓冲: ${buffer}`)), timeoutMs);
      const onData = (chunk) => {
        buffer += chunk;
        let newlineIndex;
        while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);
          if (!line) continue;
          let event;
          try { event = JSON.parse(line); } catch { continue; }
          if (event.event === name) {
            clearTimeout(timer);
            resolve(event);
            return;
          }
        }
      };
      child.stdout.on("data", onData);
      child.once("close", () => { clearTimeout(timer); reject(new Error(`子进程退出仍未等到 ${name}；缓冲: ${buffer}`)); });
    });
  const close = () => new Promise((resolve) => child.once("close", (code) => resolve(code)));
  return { child, waitEvent, close };
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

test("⑨ 两进程竞争同一把锁：一胜一 SESSION_LOCK_CONFLICT；释放后第三方立即可获取", async () => {
  const dir = mkdtempSync(join(tmpdir(), "gptc-lock-"));
  const lockPath = join(dir, "mutex.lockfile");
  try {
    // 预先写入垃圾内容：锁文件内容只作审计，绝不参与竞争判定（DEC-001）。
    writeFileSync(lockPath, "TAMPERED-CONTENT-SHOULD-NOT-MATTER\n", "utf8");

    const first = spawnChild(lockPath, { holdMs: 2500 });
    const acquired = await first.waitEvent("acquired");
    assert.equal(acquired.event, "acquired");

    // 竞争者：OS 句柄共享冲突 → fail-closed，不等待、不重试、不读内容。
    const contender = spawnChild(lockPath, { holdMs: 100 });
    const conflict = await contender.waitEvent("conflict");
    assert.equal(conflict.code, "SESSION_LOCK_CONFLICT");
    assert.equal(await contender.close(), 0);

    // 持有者释放（stdin 一行信号）→ 句柄关闭 → 第三方立即可获取。
    await first.waitEvent("released");
    assert.equal(await first.close(), 0);

    const third = spawnChild(lockPath, { holdMs: 100 });
    const thirdAcquired = await third.waitEvent("acquired");
    assert.equal(thirdAcquired.event, "acquired");
    await third.waitEvent("released");
    assert.equal(await third.close(), 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("⑨ 同进程：持锁期间重复获取被拒；释放后可重新获取（内容不被仲裁）", () => {
  const dir = mkdtempSync(join(tmpdir(), "gptc-lock-same-"));
  const lockPath = join(dir, "same-process.lockfile");
  try {
    const lock = acquireSessionLock({ lockPath, holder: "test:holder" });
    assert.equal(lock.lockPath, lockPath);

    // 同进程第二个守护进程竞争同一句柄 → 冲突。
    assert.throws(() => acquireSessionLock({ lockPath, holder: "test:contender" }), (error) => error.code === "SESSION_LOCK_CONFLICT");

    // 篡改内容不影响已持有的锁语义；释放后重新获取成功。
    try { writeFileSync(lockPath, "tampered-while-held", "utf8"); } catch { /* FileShare.None 下写入失败属预期 */ }
    lock.release();
    let reacquired = null;
    for (let attempt = 0; attempt < 25 && !reacquired; attempt += 1) {
      try {
        reacquired = acquireSessionLock({ lockPath, holder: "test:reacquire" });
      } catch (error) {
        if (error?.code !== "SESSION_LOCK_CONFLICT") throw error;
        sleepSync(200);
      }
    }
    assert.ok(reacquired, "释放后必须能重新获取（内核句柄，非内容仲裁）");
    reacquired.release();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("⑨ 锁错误映射：SESSION_LOCK_CONFLICT → RES-0002，status=BLOCKED，不可重试", () => {
  const dir = mkdtempSync(join(tmpdir(), "gptc-lock-map-"));
  const lockPath = join(dir, "map.lockfile");
  try {
    mkdirSync(dir, { recursive: true });
    const lock = acquireSessionLock({ lockPath, holder: "test:map" });
    try {
      assert.throws(() => acquireSessionLock({ lockPath, holder: "test:map-2" }), (error) => {
        assert.equal(error.code, "SESSION_LOCK_CONFLICT");
        assert.equal(error.c3_code, "RES-0002");
        assert.equal(error.status, "BLOCKED");
        assert.equal(error.retryable, false);
        return true;
      });
    } finally {
      lock.release();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("⑨ 默认锁路径指向 runtime/locks/gpt-session.lockfile", () => {
  assert.ok(LOCK_PATH_DEFAULT.endsWith(join("runtime", "locks", "gpt-session.lockfile")));
});
