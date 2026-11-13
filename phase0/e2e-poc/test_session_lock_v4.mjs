// AIEO Phase 0 返工 R8 — 会话锁 v4 反向测试（tombstone 票据 + unlink 前世代复核）
//
// 审查点名场景：
//   B7 **屏障交错测试**：回收者先取得 stale 世代 S 的票据并暂停（屏障）；
//      此时外部（模拟并发回收者 B 完成）在锁路径写入新活锁 N（持有者存活）；
//      放行后回收者 completeReap 必须 outcome="changed"——**绝不 unlink N**，
//      N 字节级不变；随后第三进程 C 在 N 存活期间获取必须冲突。
//   其余：基础互斥、fail-closed、并发回收、临界区独占、多轮无双持。
//
// 运行：node test_session_lock_v4.mjs → logs/rework8-lock-tests.json；失败 exit 1。

import { strict as assert } from "node:assert";
import { spawn } from "node:child_process";
import { writeFileSync, readFileSync, existsSync, mkdtempSync, readdirSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { acquireSessionLock, createReapTicket, completeReap } from "./session_lock.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const LOG_JSON = join(HERE, "..", "logs", "rework8-lock-tests.json");
const scenarios = [];

const CHILD_DIR = mkdtempSync(join(tmpdir(), "aieo-lockchild4-"));
const CHILD_FILE = join(CHILD_DIR, "lock_child4.mjs");
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

// 屏障子进程：取得 S 世代票据 → 写 marker → 等 go → completeReap → 写结果
const BARRIER_CHILD = join(CHILD_DIR, "reap_barrier_child.mjs");
writeFileSync(
  BARRIER_CHILD,
  `import { createReapTicket, completeReap } from ${JSON.stringify(pathToFileURL(join(HERE, "session_lock.mjs")).href)};
import { writeFileSync, readFileSync, existsSync } from "node:fs";
const out = process.argv[2];
const lockPath = process.argv[3];
const marker = process.argv[4];
const goFile = process.argv[5];
const staleGen = JSON.parse(readFileSync(process.argv[6], "utf8"));
try {
  const { ticketPath } = createReapTicket(lockPath, staleGen);
  writeFileSync(marker, JSON.stringify({ pid: process.pid, ticketPath }), "utf8");
  for (let i = 0; i < 600 && !existsSync(goFile); i++) await new Promise((r) => setTimeout(r, 100));
  const result = completeReap(lockPath, staleGen, ticketPath);
  writeFileSync(out, JSON.stringify({ pid: process.pid, outcome: result.outcome, lockNow: result.lockNow || null }), "utf8");
  process.exit(0);
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
function tombFiles(dir) {
  try { return readdirSync(dir).filter((f) => f.startsWith("tomb-")); } catch { return []; }
}

async function main() {
  const dir = mkdtempSync(join(tmpdir(), "aieo-lockv4-test-"));

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
    assert.equal(readFileSync(lockPath, "utf8"), "", "字节原样保留");
    record("S2 空/初始化中锁 fail-closed", true, "不删除");
  }

  // ---------- S3：损坏锁 fail-closed ----------
  {
    const lockPath = join(dir, "l3.lock");
    writeFileSync(lockPath, "{{{bad!!!", "utf8");
    let threw = null;
    try { acquireSessionLock({ lockPath, holder: "t3" }); } catch (e) { threw = e; }
    assert.ok(threw && threw.code === "LOCK_CORRUPT_OR_INITIALIZING");
    record("S3 损坏锁 fail-closed", true, "不删除，等待人工");
  }

  // ---------- S4：stale 单进程回收（票据清理） ----------
  {
    const lockPath = join(dir, "l4.lock");
    writeFileSync(lockPath, JSON.stringify({ pid: 999999999, holder: "dead", born_at: "2026-01-01T00:00:00Z", rand: "s4-rand" }), "utf8");
    const lock = acquireSessionLock({ lockPath, holder: "t4" });
    assert.equal(JSON.parse(readFileSync(lockPath, "utf8")).pid, process.pid);
    lock.release();
    assert.equal(tombFiles(dir).length, 0, "回收后票据应清理");
    record("S4 stale 回收 + 票据清理", true, "唯一回收者完成 unlink 并清理自己的票据");
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
    assert.ok(duringHold && duringHold.pid === winners[0].result.pid, "持锁期间锁内容归属唯一胜者");
    assert.equal(existsSync(lockPath), false);
    record("S5 并发 stale 回收", true, `1 胜（pid=${winners[0].result.pid}）3 拒；票据唯一性保证单回收者`);
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
    assert.equal(w.result.outcomes.filter((o) => o.outcome === "acquired").length, 0, "持锁期间 0 获取");
    record("S6 临界区独占", true, "持锁 800ms 观察者 0 获取");
  }

  // ---------- S7（审查点名）：屏障交错——票据持有者面对"已替换的新活锁"必须放弃 unlink ----------
  {
    const lockPath = join(dir, "l7.lock");
    const staleGen = { pid: 999999999, holder: "dead", born_at: "2026-01-01T00:00:00Z", rand: "s7-stale-gen" };
    writeFileSync(lockPath, JSON.stringify(staleGen), "utf8");
    const marker = join(dir, "s7-ticket-held.marker");
    const goFile = join(dir, "s7-go.marker");
    const out = join(dir, "c7-reaper.json");
    // 启动屏障子进程：取得 S 的票据后暂停
    const reaperP = spawn(process.execPath, [BARRIER_CHILD, out, lockPath, marker, goFile, join(dir, "s7-stalegen.json")], { stdio: "ignore" });
    writeFileSync(join(dir, "s7-stalegen.json"), JSON.stringify(staleGen), "utf8");
    for (let i = 0; i < 100 && !existsSync(marker); i++) await new Promise((r) => setTimeout(r, 100));
    assert.ok(existsSync(marker), "子进程应已取得票据");
    // 模拟并发回收者 B 完成：在锁路径写入新活锁 N（持有者 = 当前存活的主进程）
    const newLock = { pid: process.pid, holder: "simulated-B", born_at: new Date().toISOString(), rand: "s7-new-gen-N" };
    const nBytes = JSON.stringify(newLock, null, 2);
    writeFileSync(lockPath, nBytes, "utf8");
    writeFileSync(goFile, "go", "utf8"); // 放行
    const reaperExit = await new Promise((resolve) => reaperP.on("exit", resolve));
    const reaperResult = JSON.parse(readFileSync(out, "utf8"));
    assert.equal(reaperResult.outcome, "changed", `回收者必须检测世代变化并放弃（实际 ${reaperResult.outcome}）`);
    // N 必须字节级留在 lockPath（A 不得移走它）
    assert.equal(readFileSync(lockPath, "utf8"), nBytes, "新活锁 N 字节级不变");
    // C 在 N 存活（holder 存活）期间获取必须冲突
    let cThrew = null;
    try { acquireSessionLock({ lockPath, holder: "simulated-C" }); } catch (e) { cThrew = e; }
    assert.ok(cThrew && cThrew.code === "SESSION_LOCK_CONFLICT", "C 在 N 持锁期间必须冲突");
    // 清理模拟锁（本测试即其持有者进程）
    unlinkSync(lockPath);
    record("S7 屏障交错：票据持有者对已替换新锁放弃 unlink", true,
      `outcome=changed；N 字节级不变；C 获取冲突（B 的锁始终留在 lockPath）`);
  }

  // ---------- S8：多轮竞争绝无同时双持 ----------
  {
    const lockPath = join(dir, "l8.lock");
    for (let round = 1; round <= 3; round++) {
      const outs = [1, 2, 3].map((i) => join(dir, `c8-r${round}-${i}.json`));
      const results = await Promise.all(outs.map((o) => spawnChild(["race", o, 150, lockPath])));
      const winners = results.filter((r) => r.result?.outcome === "acquired");
      assert.equal(winners.length, 1, `第 ${round} 轮恰 1 持有者`);
    }
    assert.equal(tombFiles(dir).length, 0, "多轮结束后票据零残留");
    record("S8 多轮竞争 + 票据零残留", true, "3 轮 × 3 竞争者，绝无同时双持");
  }

  const allPass = scenarios.every((s) => s.pass);
  writeFileSync(LOG_JSON, JSON.stringify({
    test_target: "phase0/e2e-poc/session_lock.mjs v4（tombstone 确定性票据 + unlink 前世代复核）",
    method: "真实多进程 spawn；S7 为屏障可控交错测试（票据先行→外部写入新活锁→放行）",
    executed_at: new Date().toISOString(),
    all_pass: allPass,
    scenarios,
  }, null, 2), "utf8");
  console.log(allPass ? "LOCK V4 TESTS: ALL PASS" : "LOCK V4 TESTS: HAS FAIL");
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => {
  console.error("测试框架自身异常:", e);
  scenarios.push({ name: "测试框架异常", pass: false, detail: String(e.message || e) });
  writeFileSync(LOG_JSON, JSON.stringify({ all_pass: false, scenarios, framework_error: String(e.message || e) }, null, 2), "utf8");
  process.exit(1);
});
