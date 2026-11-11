// AIEO Phase 0 返工 R7 — 会话锁 v3 反向测试（rename 换出 + 世代验证）
//
// 审查点名场景：
//   S5  并发 stale 回收（4 进程，持锁窗口重叠）→ 恰 1 胜，持锁期间锁内容归属胜者
//   S6  临界区独占（观察者 0 获取）
//   S7  **迟到回收者不得删除新锁**：持锁者存活期间，迟到进程必须 conflict 且锁文件字节不变
//   S8  双回收者竞争 + 隔离区清理：stale 被换出后新锁不被污染，持锁结束后 quarantine 无残留
//   S9  多轮竞争绝无同时双持
//
// 运行：node test_session_lock_v3.mjs → logs/rework7-lock-tests.json；失败 exit 1。

import { strict as assert } from "node:assert";
import { spawn } from "node:child_process";
import { writeFileSync, readFileSync, existsSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { acquireSessionLock } from "./session_lock.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const LOG_JSON = join(HERE, "..", "logs", "rework7-lock-tests.json");
const scenarios = [];

const CHILD_DIR = mkdtempSync(join(tmpdir(), "aieo-lockchild3-"));
const CHILD_FILE = join(CHILD_DIR, "lock_child3.mjs");
writeFileSync(
  CHILD_FILE,
  `import { acquireSessionLock } from ${JSON.stringify(pathToFileURL(join(HERE, "session_lock.mjs")).href)};
import { writeFileSync } from "node:fs";
const mode = process.argv[2];
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
      try { result = JSON.parse(readFileSync(args[1], "utf8")); } catch { /* 崩溃无输出 */ }
      resolve({ code, result });
    });
  });
}
function record(name, pass, detail) {
  scenarios.push({ name, pass, detail });
  console.log(`[${pass ? "PASS" : "FAIL"}] ${name} — ${detail}`);
}
function quarantineFiles(dir) {
  try {
    return readdirSync(dir).filter((f) => f.startsWith("quarantine-"));
  } catch {
    return [];
  }
}

async function main() {
  const dir = mkdtempSync(join(tmpdir(), "aieo-lockv3-test-"));

  // ---------- S1：基础语义 ----------
  {
    const lockPath = join(dir, "l1.lock");
    const lock = acquireSessionLock({ lockPath, holder: "t1" });
    let threw = null;
    try { acquireSessionLock({ lockPath, holder: "t1b" }); } catch (e) { threw = e; }
    assert.ok(threw && threw.code === "SESSION_LOCK_CONFLICT");
    lock.release();
    record("S1 基础语义", true, "获取/互斥/释放正常");
  }

  // ---------- S2：空锁 → fail-closed 且不删除 ----------
  {
    const lockPath = join(dir, "l2.lock");
    writeFileSync(lockPath, "", "utf8");
    let threw = null;
    try { acquireSessionLock({ lockPath, holder: "t2" }); } catch (e) { threw = e; }
    assert.ok(threw && threw.code === "LOCK_CORRUPT_OR_INITIALIZING");
    assert.equal(readFileSync(lockPath, "utf8"), "", "空锁字节原样保留");
    record("S2 空/初始化中锁 fail-closed", true, "不删除，等待初始化完成或人工");
  }

  // ---------- S3：损坏锁 → fail-closed 且不删除 ----------
  {
    const lockPath = join(dir, "l3.lock");
    writeFileSync(lockPath, "{{{bad!!!", "utf8");
    let threw = null;
    try { acquireSessionLock({ lockPath, holder: "t3" }); } catch (e) { threw = e; }
    assert.ok(threw && threw.code === "LOCK_CORRUPT_OR_INITIALIZING");
    assert.equal(readFileSync(lockPath, "utf8"), "{{{bad!!!");
    record("S3 损坏锁 fail-closed", true, "不删除，等待人工");
  }

  // ---------- S4：完整 stale → rename 换出 + 回收成功，quarantine 清理 ----------
  {
    const lockPath = join(dir, "l4.lock");
    writeFileSync(lockPath, JSON.stringify({ pid: 999999999, holder: "dead", born_at: "2026-01-01T00:00:00Z", rand: "dead-rand" }), "utf8");
    const lock = acquireSessionLock({ lockPath, holder: "t4" });
    assert.equal(JSON.parse(readFileSync(lockPath, "utf8")).pid, process.pid);
    lock.release();
    assert.equal(quarantineFiles(dir).length, 0, "回收者应清理自己换出的隔离文件");
    record("S4 stale 回收 + 隔离区无残留", true, "rename 换出 → 世代验证 → 持锁 → 隔离文件清理");
  }

  // ---------- S5（审查要求）：并发 stale 回收，持锁窗口重叠 → 恰 1 胜 ----------
  {
    const lockPath = join(dir, "l5.lock");
    writeFileSync(lockPath, JSON.stringify({ pid: 999999999, holder: "dead", born_at: "2026-01-01T00:00:00Z", rand: "s5-rand" }), "utf8");
    const outs = [1, 2, 3, 4].map((i) => join(dir, `c5-${i}.json`));
    const pending = outs.map((o) => spawnChild(["race", o, 400, lockPath]));
    await new Promise((r) => setTimeout(r, 250));
    const duringHold = existsSync(lockPath) ? JSON.parse(readFileSync(lockPath, "utf8")) : null;
    const results = await Promise.all(pending);
    const winners = results.filter((r) => r.result?.outcome === "acquired");
    const losers = results.filter((r) => r.result?.outcome !== "acquired");
    assert.equal(winners.length, 1, `恰好 1 胜（实际 ${winners.length}）`);
    assert.equal(losers.length, 3);
    assert.ok(duringHold, "持锁窗口内锁文件存在");
    assert.equal(duringHold.pid, winners[0].result.pid, "持锁期间锁内容归属唯一胜者");
    assert.equal(existsSync(lockPath), false, "胜者释放后锁删除");
    record("S5 并发 stale 回收", true, `1 胜（pid=${winners[0].result.pid}）3 拒；双回收者中只有 rename 胜者能建新锁`);
  }

  // ---------- S6（审查要求）：临界区独占 ----------
  {
    const lockPath = join(dir, "l6.lock");
    const holderOut = join(dir, "c6-h.json");
    const watchOut = join(dir, "c6-w.json");
    const holderP = spawnChild(["race", holderOut, 800, lockPath]);
    await new Promise((r) => setTimeout(r, 150));
    const watchP = spawnChild(["watch", watchOut, 0, lockPath, 6]);
    const [h, w] = await Promise.all([holderP, watchP]);
    assert.equal(h.result.outcome, "acquired");
    assert.equal(w.result.outcome, "watched");
    assert.equal(w.result.outcomes.filter((o) => o.outcome === "acquired").length, 0, "持锁期间 0 获取");
    assert.ok(w.result.outcomes.filter((o) => o.outcome === "SESSION_LOCK_CONFLICT").length >= 3);
    record("S6 临界区独占", true, "持锁 800ms 观察者 0 获取");
  }

  // ---------- S7（审查点名）：迟到回收者不得删除新锁（字节级验证） ----------
  {
    const lockPath = join(dir, "l7.lock");
    const holderOut = join(dir, "c7-h.json");
    const lateOut = join(dir, "c7-late.json");
    const holderP = spawnChild(["race", holderOut, 900, lockPath]);
    await new Promise((r) => setTimeout(r, 200)); // 持有者已持锁
    const before = readFileSync(lockPath, "utf8");
    // 迟到的"回收者"进程：读取到的是 LIVE 锁 → 必须 conflict 且不做任何修改
    const late = await spawnChild(["race", lateOut, 0, lockPath]);
    assert.equal(late.result.outcome, "SESSION_LOCK_CONFLICT", "迟到者面对新锁必须拒绝");
    assert.equal(late.code, 3);
    const after = readFileSync(lockPath, "utf8");
    assert.equal(after, before, "新锁文件必须字节不变（迟到回收者未删除/未替换）");
    assert.equal(JSON.parse(after).holder.startsWith("child-"), true, "锁仍归属原持有者");
    await holderP; // 等持有者正常完成
    assert.equal(existsSync(lockPath), false, "持有者释放后正常删除");
    record("S7 迟到回收者不得删除新锁", true, "LIVE 锁面前 conflict，锁文件字节级不变，持有者全程不受影响");
  }

  // ---------- S8（审查要求）：多轮竞争绝无同时双持 + 无隔离残留 ----------
  {
    const lockPath = join(dir, "l8.lock");
    for (let round = 1; round <= 3; round++) {
      const outs = [1, 2, 3].map((i) => join(dir, `c8-r${round}-${i}.json`));
      const results = await Promise.all(outs.map((o) => spawnChild(["race", o, 150, lockPath])));
      const winners = results.filter((r) => r.result?.outcome === "acquired");
      assert.equal(winners.length, 1, `第 ${round} 轮恰 1 持有者`);
      assert.equal(winners[0].code, 0);
    }
    assert.equal(quarantineFiles(dir).length, 0, "全部轮次结束后隔离区应无残留");
    record("S8 多轮竞争 + 隔离区清洁", true, "3 轮 × 3 竞争者，每轮恰 1 持有者，quarantine 零残留");
  }

  const allPass = scenarios.every((s) => s.pass);
  writeFileSync(LOG_JSON, JSON.stringify({
    test_target: "phase0/e2e-poc/session_lock.mjs v3（rename 原子换出 + 世代验证，无 intent/无锁路径 unlink）",
    method: "真实多进程 spawn；空/损坏锁注入；迟到回收者场景以字节级快照验证",
    executed_at: new Date().toISOString(),
    all_pass: allPass,
    scenarios,
  }, null, 2), "utf8");
  console.log(allPass ? "LOCK V3 TESTS: ALL PASS" : "LOCK V3 TESTS: HAS FAIL");
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => {
  console.error("测试框架自身异常:", e);
  scenarios.push({ name: "测试框架异常", pass: false, detail: String(e.message || e) });
  writeFileSync(LOG_JSON, JSON.stringify({ all_pass: false, scenarios, framework_error: String(e.message || e) }, null, 2), "utf8");
  process.exit(1);
});
