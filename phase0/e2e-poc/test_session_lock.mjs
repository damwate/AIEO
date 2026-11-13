// AIEO Phase 0 返工 R5 — 会话独占锁反向测试（含审查要求的双实例竞争）
//
// 测试对象：session_lock.mjs 生产模块（e2e_orchestrate / gpt_dispatch 同源）。
// 场景 4 为真实跨进程竞争：spawn 两个独立 node 子进程同时争锁，
// 持锁者持有期间第二进程必须被拒（SESSION_LOCK_CONFLICT）；释放后可再次获取。
//
// 运行：node test_session_lock.mjs
// 输出：logs/rework5-lock-tests.json + 控制台逐场景；任何失败 exit 1。

import { strict as assert } from "node:assert";
import { spawn } from "node:child_process";
import { writeFileSync, readFileSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { acquireSessionLock } from "./session_lock.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const LOG_JSON = join(HERE, "..", "logs", "rework5-lock-tests.json");
const scenarios = [];

// 将子进程脚本写入临时 .mjs 文件（node -e 默认 CommonJS，不能跑顶层 import）
const CHILD_DIR = mkdtempSync(join(tmpdir(), "aieo-lock-child-"));
const CHILD_FILE = join(CHILD_DIR, "lock_child.mjs");
writeFileSync(
  CHILD_FILE,
  `import { acquireSessionLock } from ${JSON.stringify(pathToFileURL(join(HERE, "session_lock.mjs")).href)};
import { writeFileSync } from "node:fs";
const out = process.argv[2];
const holdMs = Number(process.argv[3] || 0);
try {
  const lock = acquireSessionLock({ lockPath: process.argv[4], holder: "child-" + process.pid });
  writeFileSync(out, JSON.stringify({ pid: process.pid, outcome: "acquired" }));
  if (holdMs > 0) await new Promise((r) => setTimeout(r, holdMs));
  lock.release();
  process.exit(0);
} catch (e) {
  writeFileSync(out, JSON.stringify({ pid: process.pid, outcome: e.code || "ERROR", message: String(e.message).slice(0, 200) }));
  process.exit(e.code === "SESSION_LOCK_CONFLICT" ? 3 : 2);
}
`,
  "utf8"
);
function record(name, pass, detail) {
  scenarios.push({ name, pass, detail });
  console.log(`[${pass ? "PASS" : "FAIL"}] ${name} — ${detail}`);
}

function spawnChild(resultFile, holdMs, lockPath) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [CHILD_FILE, resultFile, String(holdMs), lockPath], { stdio: "ignore" });
    p.on("exit", (code) => resolve({ code, result: JSON.parse(readFileSync(resultFile, "utf8")) }));
  });
}

async function main() {
  const dir = mkdtempSync(join(tmpdir(), "aieo-lock-test-"));
  const lockPath = join(dir, "gpt-session.lock");

  // ---------- 场景 1：同进程二次获取 → 冲突 ----------
  {
    const lock = acquireSessionLock({ lockPath, holder: "test-main" });
    let threw = null;
    try { acquireSessionLock({ lockPath, holder: "test-main-2" }); } catch (e) { threw = e; }
    assert.ok(threw, "必须抛出冲突");
    assert.equal(threw.code, "SESSION_LOCK_CONFLICT");
    lock.release();
    record("1 同进程二次获取被拒", true, `SESSION_LOCK_CONFLICT，holder pid=${lock.info.pid}`);
  }

  // ---------- 场景 2：释放后可重新获取 ----------
  {
    const l1 = acquireSessionLock({ lockPath, holder: "test-release" });
    l1.release();
    assert.equal(existsSync(lockPath), false, "释放后锁文件应删除");
    const l2 = acquireSessionLock({ lockPath, holder: "test-reacquire" });
    l2.release();
    record("2 释放后可重新获取", true, "release 删除锁文件，重新获取成功");
  }

  // ---------- 场景 3：死进程残留锁 → stale 回收 ----------
  {
    writeFileSync(lockPath, JSON.stringify({ pid: 999999999, holder: "dead-process", acquired_at: "2026-01-01T00:00:00Z" }), "utf8");
    const lock = acquireSessionLock({ lockPath, holder: "test-stale-reclaim" });
    assert.equal(existsSync(lockPath), true, "回收后新锁应存在");
    lock.release();
    record("3 死进程残留锁被回收", true, "pid=999999999 不存在，stale 锁被安全回收");
  }

  // ---------- 场景 4（审查要求）：真实双实例跨进程竞争 ----------
  {
    const r1 = join(dir, "child1.json");
    const r2 = join(dir, "child2.json");
    // 同时 spawn 两个子进程：child1 持锁 1200ms；child2 立即争锁
    const p1 = spawnChild(r1, 1200, lockPath);
    await new Promise((r) => setTimeout(r, 150)); // 确保 child1 先起跑（竞争仍真实存在）
    const p2 = spawnChild(r2, 0, lockPath);
    const [res1, res2] = await Promise.all([p1, p2]);
    // 持锁者必须成功；竞争者必须被拒（exit 3 = SESSION_LOCK_CONFLICT）
    const acquired = [res1, res2].find((r) => r.result.outcome === "acquired");
    const rejected = [res1, res2].find((r) => r.result.outcome === "SESSION_LOCK_CONFLICT");
    assert.ok(acquired, "必须恰好一个实例获取成功");
    assert.ok(rejected, "另一实例必须被拒");
    assert.equal(acquired.code, 0);
    assert.equal(rejected.code, 3, "竞争者 exit 3");
    // 第二实例无法在第一实例完成前发送（被拒即未进入发送流程——锁获取先于任何浏览器操作）
    record("4 双实例跨进程竞争：持锁期间第二实例被拒", true,
      `acquired pid=${acquired.result.pid}, rejected pid=${rejected.result.pid}（SESSION_LOCK_CONFLICT，先于任何浏览器操作终止）`);
  }

  // ---------- 场景 5：竞争失败者可重试成功（锁释放后） ----------
  {
    const r = join(dir, "child3.json");
    const res = await spawnChild(r, 0, lockPath);
    assert.equal(res.code, 0);
    assert.equal(res.result.outcome, "acquired");
    record("5 锁释放后新实例可正常获取", true, `child3 acquired pid=${res.result.pid}`);
  }

  const allPass = scenarios.every((s) => s.pass);
  writeFileSync(LOG_JSON, JSON.stringify({
    test_target: "phase0/e2e-poc/session_lock.mjs（生产锁模块，两个生产脚本同源接入）",
    method: "场景1-3 同进程/文件注入；场景4-5 真实 spawn 独立 node 子进程跨进程竞争",
    executed_at: new Date().toISOString(),
    all_pass: allPass,
    scenarios,
  }, null, 2), "utf8");
  console.log(allPass ? "LOCK TESTS: ALL PASS" : "LOCK TESTS: HAS FAIL");
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => {
  console.error("测试框架自身异常:", e);
  scenarios.push({ name: "测试框架异常", pass: false, detail: String(e.message || e) });
  writeFileSync(LOG_JSON, JSON.stringify({ all_pass: false, scenarios, framework_error: String(e.message || e) }, null, 2), "utf8");
  process.exit(1);
});
