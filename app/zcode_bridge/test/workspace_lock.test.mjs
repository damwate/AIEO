// 测试 ⑥：工作区写锁（DEC-001：OS 句柄互斥，禁止内容仲裁）
//
// 真实 OS 句柄路径用 OsHandleWorkspaceLock（PowerShell 守护进程 FileShare.None，POC v7 语义）；
// 内存假实现 InMemoryWorkspaceLock 用于注入场景语义验证。释放路径三选一全覆盖：
//   ① release 信号（stdin 一行）② 持有进程死亡（管道 EOF → 内核释放）③ TTL 到期兜底。

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { writeFileSync, rmSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { OsHandleWorkspaceLock, InMemoryWorkspaceLock, lockFileNameFor, withWorkspaceLock } from "../src/workspace_lock.mjs";
import { makeTempDir } from "./helpers.mjs";

let lockDir;
let lock;
const WS_A = "D:/AIEO/workspaces/lock-test-A";
const WS_B = "D:/AIEO/workspaces/lock-test-B";

before(() => {
  lockDir = join(makeTempDir("aieo-zb-lock-"), "locks");
  lock = new OsHandleWorkspaceLock({ lockDir });
});

after(() => {
  try { rmSync(lockDir, { recursive: true, force: true }); } catch { /* 保留现场 */ }
});

test("⑥-1 正常获取/释放/再获取（release 信号路径）", async () => {
  const h1 = await lock.acquire({ workspacePath: WS_A, taskId: "T-P1-301", sessionId: "SES-L1" });
  assert.ok(h1.lockPath.endsWith(".lockfile"));
  await h1.release();
  const h2 = await lock.acquire({ workspacePath: WS_A, taskId: "T-P1-302", sessionId: "SES-L2" });
  await h2.release();
  assert.ok(true, "释放后可重新获取（OS 句柄已释放，非内容判定）");
});

test("⑥-2 双方并发争抢：后来者 RES-0002 fail-closed（内核裁决，无内容仲裁）", async () => {
  const h1 = await lock.acquire({ workspacePath: WS_A, taskId: "T-P1-303", sessionId: "SES-L3" });
  await assert.rejects(
    () => lock.acquire({ workspacePath: WS_A, taskId: "T-P1-304", sessionId: "SES-L4" }),
    (err) => {
      assert.equal(err.c3?.code, "RES-0002");
      assert.match(err.message, /OS 句柄级互斥/);
      return true;
    }
  );
  await h1.release();
});

test("⑥-3 每工作区一把：不同工作区可并行持锁", async () => {
  const ha = await lock.acquire({ workspacePath: WS_A, taskId: "T-P1-305", sessionId: "SES-L5" });
  const hb = await lock.acquire({ workspacePath: WS_B, taskId: "T-P1-306", sessionId: "SES-L6" });
  assert.notEqual(ha.lockPath, hb.lockPath);
  await ha.release();
  await hb.release();
});

test("⑥-4 持有进程死亡：OS 句柄随进程退出释放，后来者可接管", async () => {
  // 独立子进程持有锁后硬退出（不写 release 信号），验证"持有者死亡 → 管道 EOF → 句柄释放"
  const holderScript = join(lockDir, "holder-child.mjs");
  const srcUrl = new URL("../src/workspace_lock.mjs", import.meta.url);
  writeFileSync(holderScript, `
    import { pathToFileURL } from "node:url";
    const { OsHandleWorkspaceLock } = await import(pathToFileURL(process.argv[4]).href);
    const lock = new OsHandleWorkspaceLock({ lockDir: process.argv[2] });
    const h = await lock.acquire({ workspacePath: process.argv[3], taskId: "T-P1-DEAD", sessionId: "SES-DEAD" });
    console.log("HELD:" + h.lockPath);
    // 不 release，直接硬退出
    process.exit(0);
  `, "utf8");
  const child = spawn(process.execPath, [holderScript, lockDir, WS_A, fileURLToPath(srcUrl)]);
  let heldLine = "";
  child.stdout.on("data", (d) => { heldLine += d; });
  await new Promise((resolve) => child.on("exit", resolve));
  assert.match(heldLine, /HELD:/, "子进程应已持锁");

  // 持有者已死亡 → 管道 EOF → 守护进程退出 → 句柄释放 → 本进程可获取（守护进程退出有异步延迟，短轮询重试）
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let acquired = null;
  for (let i = 0; i < 40 && !acquired; i++) {
    try {
      acquired = await lock.acquire({ workspacePath: WS_A, taskId: "T-P1-307", sessionId: "SES-L7" });
    } catch (err) {
      if (err.c3?.code !== "RES-0002") throw err;
      await sleep(150);
    }
  }
  assert.ok(acquired, "持有者死亡后应能接管锁（OS 释放，非内容判定）");
  await acquired.release();
});

test("⑥-5 TTL 到期兜底：守护进程超时自退释放句柄", async () => {
  const h = await lock.acquire({ workspacePath: WS_A, taskId: "T-P1-308", sessionId: "SES-L8", ttlMs: 600 });
  // TTL 600ms 后守护进程自退；等待后可重新获取
  await new Promise((r) => setTimeout(r, 1800));
  const h2 = await lock.acquire({ workspacePath: WS_A, taskId: "T-P1-309", sessionId: "SES-L9", ttlMs: 60_000 });
  await h2.release();
  assert.ok(true, "TTL 到期后锁已被 OS 释放");
});

test("⑥-6 janitor：残留 lockwork-* 目录按 mtime 清理", async () => {
  mkdirSync(lockDir, { recursive: true });
  const stale = join(lockDir, "lockwork-stale-1");
  mkdirSync(stale, { recursive: true });
  const { utimesSync } = await import("node:fs");
  utimesSync(stale, new Date("2020-01-01"), new Date("2020-01-01"));
  const removed = await lock.janitor(60_000);
  // ≥1：至少清理了构造的 stale 目录（此前死亡持有者遗留的 workDir 也可能一并被清）
  assert.ok(removed >= 1, `janitor 应清理至少 1 个残留目录，实际 ${removed}`);
  assert.equal(existsSync(stale), false);
});

test("⑥-7 withWorkspaceLock：异常路径也释放", async () => {
  await assert.rejects(() => withWorkspaceLock(lock, { workspacePath: WS_B, taskId: "T-P1-310", sessionId: "SES-L10" }, async () => {
    throw new Error("业务失败");
  }), /业务失败/);
  const h = await lock.acquire({ workspacePath: WS_B, taskId: "T-P1-311", sessionId: "SES-L11" });
  await h.release();
  assert.ok(true, "异常后锁已释放，可再次获取");
});

test("⑥-8 InMemoryWorkspaceLock（注入用）：冲突与释放语义一致", async () => {
  const mem = new InMemoryWorkspaceLock();
  const h = await mem.acquire({ workspacePath: WS_A, taskId: "T-P1-312", sessionId: "SES-M1" });
  assert.equal(mem.holderOf(WS_A).task_id, "T-P1-312");
  await assert.rejects(
    () => mem.acquire({ workspacePath: WS_A, taskId: "T-P1-313", sessionId: "SES-M2" }),
    (err) => {
      assert.equal(err.c3?.code, "RES-0002");
      assert.equal(err.c3.details.held_by_task, "T-P1-312");
      return true;
    }
  );
  await h.release();
  assert.equal(mem.holderOf(WS_A), null);
  const h2 = await mem.acquire({ workspacePath: WS_A, taskId: "T-P1-314", sessionId: "SES-M3" });
  await h2.release();
});

test("⑥-9 锁文件名映射稳定且防路径非法字符", () => {
  const a = lockFileNameFor("D:/AIEO/workspaces/Demo Repo");
  const b = lockFileNameFor("d:\\aieo\\workspaces\\Demo Repo\\");
  assert.equal(a, b, "大小写与尾分隔符归一");
  assert.match(a, /^[a-zA-Z0-9._-]+-[0-9a-f]{16}\.lockfile$/);
});
