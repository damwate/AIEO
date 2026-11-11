// AIEO Phase 0 返工 R9 — 会话锁 v5 反向测试
//
// 审查点名场景：
//   S4（MINOR）schema 不完整锁 {"pid":...} → fail-closed 拒收 + 现场保留 + 无 tomb-undefined
//   S7（MAJOR-1）票据初始化窗口（受控屏障真实复现）：A 的票据停在"已创建未写入"窗口时，
//      B 的 createReapTicket 必须 fail-closed（TICKET_STATE_UNKNOWN）且**绝不删除** A 的票据；
//      A 解除屏障后完成写入、回收、持锁。
//   S8（MAJOR-2）双真实回收者完整交错：两个真实进程同时走生产 acquire 流程争 stale 锁
//      → 恰 1 胜（持锁窗口重叠）+ 持锁期间归属 + 第三进程 C 不得获取 + 票据零残留。
//
// 运行：node test_session_lock_v5.mjs → logs/rework9-lock-tests.json；失败 exit 1。

import { strict as assert } from "node:assert";
import { spawn } from "node:child_process";
import { writeFileSync, readFileSync, existsSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { acquireSessionLock } from "./session_lock.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const LOG_JSON = join(HERE, "..", "logs", "rework9-lock-tests.json");
const scenarios = [];

const CHILD_DIR = mkdtempSync(join(tmpdir(), "aieo-lockchild5-"));
const CHILD_FILE = join(CHILD_DIR, "lock_child5.mjs");
writeFileSync(
  CHILD_FILE,
  `import { acquireSessionLock, createReapTicket, completeReap } from ${JSON.stringify(pathToFileURL(join(HERE, "session_lock.mjs")).href)};
import { writeFileSync, readFileSync, existsSync } from "node:fs";
const mode = process.argv[2];
const out = process.argv[3];
const holdMs = Number(process.argv[4] || 0);
const lockPath = process.argv[5];
const extra = process.argv[6] || "";
const attempts = Number(process.argv[7] || 1);
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
        outcomes.push({ i, outcome: e.code || "ERROR", reason: e.reason });
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    writeFileSync(out, JSON.stringify({ pid: process.pid, outcome: "watched", outcomes }));
    process.exit(0);
  } else if (mode === "ticketflow") {
    // 完整生产回收流：票据 → 回收 → 立即获取（应在无竞争时成功）
    const staleGen = JSON.parse(readFileSync(extra, "utf8"));
    const { ticketPath } = createReapTicket(lockPath, staleGen);
    writeFileSync(out + ".stage1", JSON.stringify({ pid: process.pid, ticketPath }), "utf8");
    const reap = completeReap(lockPath, staleGen, ticketPath);
    writeFileSync(out + ".stage2", JSON.stringify(reap), "utf8");
    if (reap.outcome !== "reaped") {
      writeFileSync(out, JSON.stringify({ pid: process.pid, outcome: "reap_" + reap.outcome }));
      process.exit(0);
    }
    const lock = acquireSessionLock({ lockPath, holder: "ticketflow-" + process.pid });
    writeFileSync(out, JSON.stringify({ pid: process.pid, outcome: "acquired" }));
    if (holdMs > 0) await new Promise((r) => setTimeout(r, holdMs));
    lock.release();
    process.exit(0);
  }
  process.exit(2);
} catch (e) {
  writeFileSync(out, JSON.stringify({ pid: process.pid, outcome: e.code || "ERROR", reason: e.reason, message: String(e.message).slice(0, 200) }));
  process.exit(e.code === "SESSION_LOCK_CONFLICT" ? 3 : 2);
}
`,
  "utf8"
);

function spawnChild(args, envExtra = {}) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [CHILD_FILE, ...args], { stdio: "ignore", env: { ...process.env, ...envExtra } });
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
function tombFiles(dir) {
  try { return readdirSync(dir).filter((f) => f.startsWith("tomb-")); } catch { return []; }
}

async function main() {
  const dir = mkdtempSync(join(tmpdir(), "aieo-lockv5-test-"));

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

  // ---------- S2：空锁 fail-closed ----------
  {
    const lockPath = join(dir, "l2.lock");
    writeFileSync(lockPath, "", "utf8");
    let threw = null;
    try { acquireSessionLock({ lockPath, holder: "t2" }); } catch (e) { threw = e; }
    assert.ok(threw && threw.code === "LOCK_CORRUPT_OR_INITIALIZING");
    assert.equal(readFileSync(lockPath, "utf8"), "");
    record("S2 空/初始化中锁 fail-closed", true, "不删除");
  }

  // ---------- S3：损坏锁 fail-closed ----------
  {
    const lockPath = join(dir, "l3.lock");
    writeFileSync(lockPath, "{{{bad!!!", "utf8");
    let threw = null;
    try { acquireSessionLock({ lockPath, holder: "t3" }); } catch (e) { threw = e; }
    assert.ok(threw && threw.code === "LOCK_CORRUPT_OR_INITIALIZING");
    record("S3 损坏锁 fail-closed", true, "不删除");
  }

  // ---------- S4（点名 MINOR）：schema 不完整锁 → fail-closed + 无 tomb-undefined ----------
  {
    const lockPath = join(dir, "l4.lock");
    writeFileSync(lockPath, JSON.stringify({ pid: 999999999 }), "utf8"); // 只有 pid，缺 rand/born_at
    let threw = null;
    try { acquireSessionLock({ lockPath, holder: "t4" }); } catch (e) { threw = e; }
    assert.ok(threw, "必须 fail-closed");
    assert.equal(threw.code, "LOCK_CORRUPT_OR_INITIALIZING", `实际 ${threw.code}: ${threw.message.slice(0, 80)}`);
    assert.equal(readFileSync(lockPath, "utf8"), JSON.stringify({ pid: 999999999 }), "现场保留");
    assert.equal(tombFiles(dir).length, 0, "绝不能产生 tomb-undefined 票据");
    record("S4 schema 不完整锁拒收", true, "LOCK_CORRUPT_OR_INITIALIZING；现场保留；无 tomb-undefined");
  }

  // ---------- S5：并发 stale 回收（4 进程，持锁窗口重叠） ----------
  {
    const lockPath = join(dir, "l5.lock");
    writeFileSync(lockPath, JSON.stringify({ pid: 999999999, holder: "dead", born_at: "2026-01-01T00:00:00Z", rand: "s5-rand" }), "utf8");
    const outs = [1, 2, 3, 4].map((i) => join(dir, `c5-${i}.json`));
    const pending = outs.map((o) => spawnChild(["race", o, 400, lockPath]));
    await new Promise((r) => setTimeout(r, 250));
    const duringHold = existsSync(lockPath) ? JSON.parse(readFileSync(lockPath, "utf8")) : null;
    const results = await Promise.all(pending);
    const winners = results.filter((r) => r.result?.outcome === "acquired");
    assert.equal(winners.length, 1, `恰 1 胜（实际 ${winners.length}）`);
    assert.ok(duringHold && duringHold.pid === winners[0].result.pid);
    assert.equal(existsSync(lockPath), false, "释放后锁删除");
    assert.equal(tombFiles(dir).length, 0, "票据零残留");
    record("S5 并发 stale 回收", true, `1 胜（pid=${winners[0].result.pid}）3 拒，票据归属胜者并清理`);
  }

  // ---------- S6：临界区独占 ----------
  {
    const lockPath = join(dir, "l6.lock");
    const holderOut = join(dir, "c6-h.json");
    const watchOut = join(dir, "c6-w.json");
    const holderP = spawnChild(["race", holderOut, 800, lockPath]);
    await new Promise((r) => setTimeout(r, 150));
    const watchP = spawnChild(["watch", watchOut, 0, lockPath, 6]);
    const [h, w] = await Promise.all([holderP, watchP]);
    assert.equal(w.result.outcomes.filter((o) => o.outcome === "acquired").length, 0);
    record("S6 临界区独占", true, "持锁 800ms 观察者 0 获取");
  }

  // ---------- S7（点名 MAJOR-1）：票据初始化窗口——B 不得删除 A 未写完的票据 ----------
  {
    const lockPath = join(dir, "l7.lock");
    const staleGen = { pid: 999999999, holder: "dead", born_at: "2026-01-01T00:00:00Z", rand: "s7-stale-gen" };
    writeFileSync(lockPath, JSON.stringify(staleGen), "utf8");
    const staleGenFile = join(dir, "s7-stalegen.json");
    writeFileSync(staleGenFile, JSON.stringify(staleGen), "utf8"); // 必须先于子进程
    const goA = join(dir, "s7-goA.marker"); // 不创建——A 将暂停等待它出现
    const outA = join(dir, "c7-a.json");
    const outB = join(dir, "c7-b.json");
    // A：带屏障钩子启动（票据 wx 创建后、writeSync 前暂停）
    const aP = spawnChild(["ticketflow", outA, 300, lockPath, staleGenFile], { AIEO_LOCK_PAUSE_FILE: goA });
    // 等 A 的空票据出现在磁盘（初始化窗口真实存在）
    let sawEmpty = false;
    for (let i = 0; i < 100; i++) {
      await new Promise((r) => setTimeout(r, 50));
      if (existsSync(join(dir, "tomb-s7-stale-gen.json"))) {
        sawEmpty = readFileSync(join(dir, "tomb-s7-stale-gen.json"), "utf8") === "";
        break;
      }
    }
    assert.ok(sawEmpty, "应观察到 A 的空票据（初始化窗口真实存在）");
    // B：另一个真实回收者撞上状态不明的票据 → 必须 fail-closed 且不删除
    const b = await spawnChild(["race", outB, 0, lockPath]);
    assert.equal(b.result.outcome, "SESSION_LOCK_CONFLICT", `B 必须 fail-closed（实际 ${b.result.outcome}）`);
    assert.equal(b.result.reason, "TICKET_STATE_UNKNOWN", `reason 应为 TICKET_STATE_UNKNOWN（实际 ${b.result.reason}）`);
    assert.equal(readFileSync(join(dir, "tomb-s7-stale-gen.json"), "utf8"), "", "B 未删除 A 的未完成票据（字节仍为空）");
    // 放行 A → 完成写入 → 回收 → 持锁
    writeFileSync(goA, "go", "utf8");
    const a = await aP;
    assert.equal(a.result.outcome, "acquired", `A 解除屏障后应完成回收并持锁（实际 ${a.result.outcome}）`);
    assert.equal(existsSync(lockPath), false, "A 释放后锁删除");
    assert.equal(tombFiles(dir).length, 0, "A 完成后票据清理");
    record("S7 票据初始化窗口 fail-closed（受控屏障真实复现）", true,
      "B 撞上未完成票据 → TICKET_STATE_UNKNOWN 拒绝且零删除；A 完成回收并持锁");
  }

  // ---------- S8（点名 MAJOR-2）：双真实回收者完整交错 ----------
  {
    const lockPath = join(dir, "l8.lock");
    writeFileSync(lockPath, JSON.stringify({ pid: 999999999, holder: "dead", born_at: "2026-01-01T00:00:00Z", rand: "s8-rand" }), "utf8");
    const staleGenFile = join(dir, "s8-stalegen.json");
    writeFileSync(staleGenFile, JSON.stringify({ pid: 999999999, holder: "dead", born_at: "2026-01-01T00:00:00Z", rand: "s8-rand" }), "utf8");
    const outs = [1, 2, 3].map((i) => join(dir, `c8-${i}.json`));
    // 三个真实进程走完整生产 acquire（含票据阶段）竞争，胜者持锁 900ms
    const pending = outs.map((o) => spawnChild(["ticketflow", o, 900, lockPath, staleGenFile]));
    await new Promise((r) => setTimeout(r, 300)); // 进入胜者持锁窗口
    const duringHold = existsSync(lockPath) ? JSON.parse(readFileSync(lockPath, "utf8")) : null;
    // 第三进程 C 在胜者持锁窗口内启动并尝试获取（必须冲突）
    const cOut = join(dir, "c8-c.json");
    const cP = spawnChild(["race", cOut, 0, lockPath]);
    const results = await Promise.all(pending);
    const c = await cP;
    const acquired = results.filter((r) => r.result?.outcome === "acquired");
    const conflicted = results.filter((r) => r.result?.outcome === "SESSION_LOCK_CONFLICT");
    assert.equal(acquired.length, 1, `恰 1 进程完成回收并持锁（实际 ${acquired.length}）`);
    assert.ok(conflicted.length >= 1, "其余进程必须 conflict（实际 " + conflicted.length + "）");
    assert.ok(duringHold, "持锁窗口内锁存在");
    assert.equal(duringHold.pid, acquired[0].result.pid, "持锁期间归属唯一胜者");
    assert.equal(c.result.outcome, "SESSION_LOCK_CONFLICT", "C 在胜者持锁期间必须冲突");
    assert.equal(existsSync(lockPath), false, "胜者释放后锁删除");
    assert.equal(tombFiles(dir).length, 0, "票据零残留");
    record("S8 双真实回收者完整交错", true,
      `完整生产 acquire 竞争：1 胜（pid=${acquired[0].result.pid}）+ ${conflicted.length} conflict；持锁归属唯一；C 冲突；票据零残留`);
  }

  // ---------- S9：多轮竞争绝无同时双持 ----------
  {
    const lockPath = join(dir, "l9.lock");
    for (let round = 1; round <= 3; round++) {
      const outs = [1, 2, 3].map((i) => join(dir, `c9-r${round}-${i}.json`));
      const results = await Promise.all(outs.map((o) => spawnChild(["race", o, 150, lockPath])));
      assert.equal(results.filter((r) => r.result?.outcome === "acquired").length, 1, `第 ${round} 轮恰 1 持有者`);
    }
    record("S9 多轮竞争", true, "3 轮 × 3 竞争者绝无同时双持");
  }

  const allPass = scenarios.every((s) => s.pass);
  writeFileSync(LOG_JSON, JSON.stringify({
    test_target: "phase0/e2e-poc/session_lock.mjs v5（票据 fail-closed + 严格 schema + 受控屏障钩子）",
    method: "真实多进程 spawn；S7 以 AIEO_LOCK_PAUSE_FILE 受控屏障复现票据初始化窗口（生产不启用钩子）",
    executed_at: new Date().toISOString(),
    all_pass: allPass,
    scenarios,
  }, null, 2), "utf8");
  console.log(allPass ? "LOCK V5 TESTS: ALL PASS" : "LOCK V5 TESTS: HAS FAIL");
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => {
  console.error("测试框架自身异常:", e);
  scenarios.push({ name: "测试框架异常", pass: false, detail: String(e.message || e) });
  writeFileSync(LOG_JSON, JSON.stringify({ all_pass: false, scenarios, framework_error: String(e.message || e) }, null, 2), "utf8");
  process.exit(1);
});
