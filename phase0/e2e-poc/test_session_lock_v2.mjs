// AIEO Phase 0 返工 R6 — 会话锁 v2 反向测试（审查要求的多进程竞争覆盖）
//
// 测试对象：session_lock.mjs v2（生产模块）。场景 5-8 为真实多进程 spawn：
//   5. 空/损坏锁文件 → fail-closed（LOCK_CORRUPT_OR_INITIALIZING）且**不删除**文件
//   6. 并发 stale 回收：4 个子进程同时争死锁 → 恰好 1 胜，锁内容 pid == 胜者
//   7. 临界区独占：胜者持锁 800ms 期间，观察者子进程每 100ms 尝试获取——全部冲突
//   8. 多轮竞争：3 轮 × 3 竞争者，每轮恰好一个持有者，绝无同时双持
//
// 运行：node test_session_lock_v2.mjs → logs/rework6-lock-tests.json；失败 exit 1。

import { strict as assert } from "node:assert";
import { spawn } from "node:child_process";
import { writeFileSync, readFileSync, existsSync, mkdtempSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { acquireSessionLock } from "./session_lock.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const LOG_JSON = join(HERE, "..", "logs", "rework6-lock-tests.json");
const scenarios = [];

const CHILD_DIR = mkdtempSync(join(tmpdir(), "aieo-lockchild2-"));
const CHILD_FILE = join(CHILD_DIR, "lock_child2.mjs");
writeFileSync(
  CHILD_FILE,
  `import { acquireSessionLock } from ${JSON.stringify(pathToFileURL(join(HERE, "session_lock.mjs")).href)};
import { writeFileSync } from "node:fs";
const mode = process.argv[2];       // race | watch
const out = process.argv[3];
const holdMs = Number(process.argv[4] || 0);
const lockPath = process.argv[5];
const attempts = Number(process.argv[6] || 1);
try {
  if (mode === "race") {
    const lock = acquireSessionLock({ lockPath, holder: "child-" + process.pid });
    writeFileSync(out, JSON.stringify({ pid: process.pid, outcome: "acquired" }));
    if (holdMs > 0) await new Promise((r) => setTimeout(r, holdMs));
    lock.release();
    process.exit(0);
  } else if (mode === "watch") {
    // 反复尝试获取，记录每次结果（不持有——冲突即退出本轮）
    const outcomes = [];
    for (let i = 0; i < attempts; i++) {
      try {
        const lock = acquireSessionLock({ lockPath, holder: "watch-" + process.pid });
        outcomes.push({ i, outcome: "acquired" });
        lock.release();
      } catch (e) {
        outcomes.push({ i, outcome: e.code || "ERROR" });
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    writeFileSync(out, JSON.stringify({ pid: process.pid, outcome: "watched", outcomes }));
    process.exit(0);
  }
  process.exit(2);
} catch (e) {
  writeFileSync(out, JSON.stringify({ pid: process.pid, outcome: e.code || "ERROR", message: String(e.message).slice(0, 200) }));
  process.exit(e.code === "SESSION_LOCK_CONFLICT" ? 3 : 2);
}
`,
  "utf8"
);

function spawnChild(args) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [CHILD_FILE, ...args], { stdio: "ignore" });
    p.on("exit", (code) => {
      let result = null;
      try { result = JSON.parse(readFileSync(args[1], "utf8")); } catch { /* 无输出=崩溃 */ }
      resolve({ code, result });
    });
  });
}
function record(name, pass, detail) {
  scenarios.push({ name, pass, detail });
  console.log(`[${pass ? "PASS" : "FAIL"}] ${name} — ${detail}`);
}

async function main() {
  const dir = mkdtempSync(join(tmpdir(), "aieo-lockv2-test-"));

  // ---------- 场景 1：v2 基础——获取/释放/同进程二次拒 ----------
  {
    const lockPath = join(dir, "l1.lock");
    const lock = acquireSessionLock({ lockPath, holder: "t1" });
    let threw = null;
    try { acquireSessionLock({ lockPath, holder: "t1b" }); } catch (e) { threw = e; }
    assert.ok(threw && threw.code === "SESSION_LOCK_CONFLICT");
    lock.release();
    record("1 v2 基础语义（获取/互斥/释放）", true, "同进程二次获取 SESSION_LOCK_CONFLICT");
  }

  // ---------- 场景 2（审查要求）：空锁文件（初始化窗口模拟）→ fail-closed 且不删除 ----------
  {
    const lockPath = join(dir, "l2.lock");
    writeFileSync(lockPath, "", "utf8"); // 模拟初始化窗口内的空锁
    let threw = null;
    try { acquireSessionLock({ lockPath, holder: "t2" }); } catch (e) { threw = e; }
    assert.ok(threw, "必须 fail-closed");
    assert.equal(threw.code, "LOCK_CORRUPT_OR_INITIALIZING");
    const after = readFileSync(lockPath, "utf8");
    assert.equal(after, "", "空锁文件必须原样保留（未被删除/未被子写入）");
    record("2 空/初始化中锁 → LOCK_CORRUPT_OR_INITIALIZING 且不删除", true, "fail-closed 生效，文件字节未变");
  }

  // ---------- 场景 3：损坏锁（非 JSON）→ fail-closed 且不删除 ----------
  {
    const lockPath = join(dir, "l3.lock");
    writeFileSync(lockPath, "{{{corrupted!!!", "utf8");
    let threw = null;
    try { acquireSessionLock({ lockPath, holder: "t3" }); } catch (e) { threw = e; }
    assert.ok(threw && threw.code === "LOCK_CORRUPT_OR_INITIALIZING");
    assert.equal(readFileSync(lockPath, "utf8"), "{{{corrupted!!!");
    record("3 损坏锁 → fail-closed 且不删除", true, "无 sideload 清理，等待人工");
  }

  // ---------- 场景 4：完整 stale（死 PID）→ 单进程回收成功 ----------
  {
    const lockPath = join(dir, "l4.lock");
    writeFileSync(lockPath, JSON.stringify({ pid: 999999999, holder: "dead", born_at: "2026-01-01T00:00:00Z" }), "utf8");
    const lock = acquireSessionLock({ lockPath, holder: "t4" });
    assert.equal(JSON.parse(readFileSync(lockPath, "utf8")).pid, process.pid);
    lock.release();
    record("4 完整 stale 锁回收", true, "死 PID 锁被唯一回收者替换");
  }

  // ---------- 场景 5（审查要求）：并发 stale 回收——4 子进程同时争死锁 ----------
  {
    const lockPath = join(dir, "l5.lock");
    writeFileSync(lockPath, JSON.stringify({ pid: 999999999, holder: "dead", born_at: "2026-01-01T00:00:00Z" }), "utf8");
    // 各胜者持锁 300ms：若锁实现有缺陷导致双人同时持锁，将出现 >=2 个 acquired
    const outs = [1, 2, 3, 4].map((i) => join(dir, `c5-${i}.json`));
    const pending = outs.map((o) => spawnChild(["race", o, 400, lockPath]));
    await new Promise((r) => setTimeout(r, 250)); // 处于胜者持锁窗口内
    const duringHold = existsSync(lockPath) ? JSON.parse(readFileSync(lockPath, "utf8")) : null;
    const results = await Promise.all(pending);
    const winners = results.filter((r) => r.result?.outcome === "acquired");
    const losers = results.filter((r) => r.result?.outcome !== "acquired");
    assert.equal(winners.length, 1, `必须恰好 1 个获取成功（实际 ${winners.length}）`);
    assert.equal(losers.length, 3);
    assert.ok(duringHold, "持锁窗口内锁文件必须存在");
    assert.equal(duringHold.pid, winners[0].result.pid, "持锁期间锁内容必须归属唯一胜者");
    assert.equal(existsSync(lockPath), false, "胜者释放后锁文件应已删除");
    record("5 并发 stale 回收（4 进程）", true, `恰好 1 胜（pid=${winners[0].result.pid}），3 拒；终态锁归属胜者，无双持`);
  }

  // ---------- 场景 6（审查要求）：临界区独占——持锁 800ms 期间观察者全部冲突 ----------
  {
    const lockPath = join(dir, "l6.lock");
    const holderOut = join(dir, "c6-holder.json");
    const watchOut = join(dir, "c6-watch.json");
    const holderP = spawnChild(["race", holderOut, 800, lockPath]);
    await new Promise((r) => setTimeout(r, 120)); // holder 先拿到锁
    const watchP = spawnChild(["watch", watchOut, 0, lockPath, 6]); // 6 次 × 100ms 覆盖持锁窗口
    const [h, w] = await Promise.all([holderP, watchP]);
    assert.equal(h.result.outcome, "acquired");
    assert.equal(w.result.outcome, "watched");
    const conflictCount = w.result.outcomes.filter((o) => o.outcome === "SESSION_LOCK_CONFLICT").length;
    const acquiredCount = w.result.outcomes.filter((o) => o.outcome === "acquired").length;
    assert.ok(conflictCount >= 3, `持锁窗口内观察者应大量冲突（实际冲突 ${conflictCount}/6）`);
    assert.equal(acquiredCount, 0, "持锁期间观察者绝不能获取成功");
    record("6 临界区独占（持锁 800ms 期间观察者 0 获取）", true, `冲突 ${conflictCount}/6，获取 0`);
  }

  // ---------- 场景 7（审查要求）：多轮竞争，绝无同时双持 ----------
  {
    const lockPath = join(dir, "l7.lock");
    for (let round = 1; round <= 3; round++) {
      const outs = [1, 2, 3].map((i) => join(dir, `c7-r${round}-${i}.json`));
      const results = await Promise.all(outs.map((o) => spawnChild(["race", o, 150, lockPath])));
      const winners = results.filter((r) => r.result?.outcome === "acquired");
      assert.equal(winners.length, 1, `第 ${round} 轮必须恰好 1 个持有者`);
      assert.ok(winners[0].code === 0, "胜者应完成持有+释放并 exit 0");
    }
    record("7 多轮竞争（3 轮 × 3 竞争者）", true, "每轮恰好 1 持有者，全部正常释放，绝无同时双持");
  }

  // ---------- 场景 8：双实例互斥（R5 场景回归，v2 语义下仍成立） ----------
  {
    const lockPath = join(dir, "l8.lock");
    const r1 = join(dir, "c8-1.json");
    const r2 = join(dir, "c8-2.json");
    const p1 = spawnChild(["race", r1, 600, lockPath]);
    await new Promise((r) => setTimeout(r, 150));
    const p2 = spawnChild(["race", r2, 0, lockPath]);
    const [a, b] = await Promise.all([p1, p2]);
    const acquired = [a, b].find((r) => r.result.outcome === "acquired");
    const rejected = [a, b].find((r) => r.result.outcome === "SESSION_LOCK_CONFLICT");
    assert.ok(acquired && rejected);
    record("8 双实例竞争回归（R5 语义）", true, `acquired pid=${acquired.result.pid}，rejected pid=${rejected.result.pid}`);
  }

  const allPass = scenarios.every((s) => s.pass);
  writeFileSync(LOG_JSON, JSON.stringify({
    test_target: "phase0/e2e-poc/session_lock.mjs v2（fd 写入 + fail-closed + 意图票据仲裁）",
    method: "真实多进程 spawn；空/损坏锁由测试注入；并发与临界区场景为真实跨进程",
    executed_at: new Date().toISOString(),
    all_pass: allPass,
    scenarios,
  }, null, 2), "utf8");
  console.log(allPass ? "LOCK V2 TESTS: ALL PASS" : "LOCK V2 TESTS: HAS FAIL");
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => {
  console.error("测试框架自身异常:", e);
  scenarios.push({ name: "测试框架异常", pass: false, detail: String(e.message || e) });
  writeFileSync(LOG_JSON, JSON.stringify({ all_pass: false, scenarios, framework_error: String(e.message || e) }, null, 2), "utf8");
  process.exit(1);
});
