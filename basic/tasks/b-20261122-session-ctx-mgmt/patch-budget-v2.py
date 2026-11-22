# 一次性补丁脚本 v2：session-budget.mjs（CTX-CODE R1 七项整改）
import io, re
p = r"D:\CommonProjects\agent-kit\monitor\session-budget.mjs"
t = io.open(p, encoding="utf-8").read()

# 1. schema 加 open_turn_bytes
old = "    total_bytes INTEGER NOT NULL,\n    max_turn_bytes INTEGER NOT NULL,\n    gen INTEGER NOT NULL,"
new = "    total_bytes INTEGER NOT NULL,\n    max_turn_bytes INTEGER NOT NULL,\n    open_turn_bytes INTEGER NOT NULL DEFAULT 0,\n    gen INTEGER NOT NULL,"
assert old in t, "schema anchor"
t = t.replace(old, new, 1)

# 2. rowToLedger
old = "    totalBytes: row.total_bytes, maxTurnBytes: row.max_turn_bytes, gen: row.gen,"
new = "    totalBytes: row.total_bytes, maxTurnBytes: row.max_turn_bytes, openTurnBytes: row.open_turn_bytes, gen: row.gen,"
assert old in t, "rowToLedger anchor"
t = t.replace(old, new, 1)

# 3. 语义注释
old = "export function recordTurn(uuid, { inBytes = 0, outBytes = 0 }, opts = {}) {"
new = ("export function recordTurn(uuid, { inBytes = 0, outBytes = 0 }, opts = {}) {\n"
       "  // opts.completeOpenTurn=true：完成已开启的逻辑轮（发送时点已记 in）——更新该轮而非新建：\n"
       "  // turns 不变、out_bytes/total 累加、max_turn_bytes=max(峰值, open_turn+out)、open_turn 归零。\n"
       "  // 无开启轮（发送侧 UNCERTAIN/崩溃未记）→ 回落新轮语义（out 单独计，少记 in 如实承认）。")
assert old in t, "signature anchor"
t = t.replace(old, new, 1)

# 4. 计算段
old = ("      const turnBytes = inBytes + outBytes;\n"
       "      const next = ledger\n"
       "        ? {\n"
       "            turns: ledger.turns + 1, inBytes: ledger.inBytes + inBytes, outBytes: ledger.outBytes + outBytes,\n"
       "            totalBytes: ledger.totalBytes + turnBytes, maxTurnBytes: Math.max(ledger.maxTurnBytes, turnBytes),\n"
       "            gen: ledger.gen + 1, firstAt: ledger.firstAt,\n"
       "          }\n"
       "        : {\n"
       "            turns: 1, inBytes, outBytes, totalBytes: turnBytes, maxTurnBytes: turnBytes,\n"
       "            gen: 1, firstAt: now(),\n"
       "          };\n"
       "      next.lastAt = now();")
new = ("      const completing = Boolean(opts.completeOpenTurn && ledger && ledger.openTurnBytes > 0);\n"
       "      const turnBytes = completing ? ledger.openTurnBytes + outBytes : inBytes + outBytes;\n"
       "      const next = ledger\n"
       "        ? {\n"
       "            turns: completing ? ledger.turns : ledger.turns + 1,\n"
       "            inBytes: ledger.inBytes + inBytes, outBytes: ledger.outBytes + outBytes,\n"
       "            totalBytes: ledger.totalBytes + turnBytes,\n"
       "            maxTurnBytes: Math.max(ledger.maxTurnBytes, turnBytes),\n"
       "            openTurnBytes: completing ? 0 : inBytes,\n"
       "            gen: ledger.gen + 1, firstAt: ledger.firstAt,\n"
       "          }\n"
       "        : {\n"
       "            turns: 1, inBytes, outBytes, totalBytes: turnBytes, maxTurnBytes: turnBytes,\n"
       "            openTurnBytes: inBytes,\n"
       "            gen: 1, firstAt: now(),\n"
       "          };\n"
       "      next.lastAt = now();")
assert old in t, "calc anchor"
t = t.replace(old, new, 1)

# 5. SQL+COMMIT 段整体替换
start = t.find("      // \u2463\u2464 条件更新 → COMMIT / ROLLBACK")
assert start >= 0, "start anchor"
tail = t[start:]
m = re.search(r"        throw e;\n      \}\n", tail)
assert m, "old catch end anchor"
end = start + m.end()
new_block = (
"      // 语句阶段（INSERT/UPDATE）错误：保留各自语义（唯一约束首写竞态/BUSY 重试），其余原样上抛\n"
"      try {\n"
"        if (!ledger) {\n"
"          conn.prepare(\n"
'            "INSERT INTO ledger(uuid,turns,in_bytes,out_bytes,total_bytes,max_turn_bytes,open_turn_bytes,gen,first_at,last_at,budget_version) VALUES(?,?,?,?,?,?,?,?,?,?,?)"\n'
"          ).run(uuid, next.turns, next.inBytes, next.outBytes, next.totalBytes, next.maxTurnBytes, next.openTurnBytes, next.gen, next.firstAt, next.lastAt, BUDGET_VERSION);\n"
"        } else {\n"
"          const sql = completing\n"
'            ? "UPDATE ledger SET out_bytes=?,total_bytes=?,max_turn_bytes=?,open_turn_bytes=0,gen=gen+1,last_at=?,budget_version=? WHERE uuid=? AND gen=?"\n'
'            : "UPDATE ledger SET turns=?,in_bytes=?,out_bytes=?,total_bytes=?,max_turn_bytes=?,open_turn_bytes=?,gen=gen+1,last_at=?,budget_version=? WHERE uuid=? AND gen=?";\n'
"          const r = completing\n"
"            ? conn.prepare(sql).run(next.outBytes, next.totalBytes, next.maxTurnBytes, next.lastAt, BUDGET_VERSION, uuid, ledger.gen)\n"
"            : conn.prepare(sql).run(next.turns, next.inBytes, next.outBytes, next.totalBytes, next.maxTurnBytes, next.openTurnBytes, next.lastAt, BUDGET_VERSION, uuid, ledger.gen);\n"
"          if (r.changes === 0) {\n"
'            conn.exec("ROLLBACK"); // 显式结束本事务\n'
"            genConflictRounds += 1;\n"
"            if (genConflictRounds >= GEN_CONFLICT_MAX_ROUNDS) {\n"
"              discardConn();\n"
"              throw new Error(`LEDGER_GEN_CONFLICT_EXHAUSTED: rounds=${genConflictRounds}`);\n"
"            }\n"
"            sleepSync(RETRY_INTERVAL_MS);\n"
"            continue; // ROLLBACK 成功事务已结束，同连接复用\n"
"          }\n"
"        }\n"
"      } catch (e) {\n"
'        if (String(e.message).startsWith("LEDGER_GEN_CONFLICT_EXHAUSTED")) throw e;\n'
"        let inTx = true;\n"
"        try { inTx = conn.isTransaction === true; } catch {}\n"
'        if (inTx) { try { conn.exec("ROLLBACK"); } catch {} }\n'
"        discardConn(); // ROLLBACK 失败也废弃（v8 第 6 步分支）\n"
"        if (isUniqueConstraintError(e) && !ledger) {\n"
"          if (remaining() < MIN_REMAINING_MS || attempt >= MAX_ATTEMPTS) {\n"
"            throw new Error(`LEDGER_BUSY_TIMEOUT: first_write_conflict_race`);\n"
"          }\n"
"          sleepSync(RETRY_INTERVAL_MS);\n"
"          continue;\n"
"        }\n"
"        if (/database is locked|SQLITE_BUSY/i.test(String(e.message)) && remaining() >= MIN_REMAINING_MS && attempt < MAX_ATTEMPTS) {\n"
"          sleepSync(RETRY_INTERVAL_MS);\n"
"          continue;\n"
"        }\n"
"        throw e; // 语句阶段其余错误保留原语义（P0-1 整改：不与 COMMIT 阶段混淆）\n"
"      }\n"
"\n"
"      // COMMIT 阶段独立（P0-1）：报错=LEDGER_COMMIT_UNCERTAIN，连接一律废弃，不计成功不重放\n"
"      try {\n"
'        conn.exec("COMMIT");\n'
"      } catch (e) {\n"
"        let inTx = true;\n"
"        try { inTx = conn.isTransaction === true; } catch {}\n"
'        if (inTx) { try { conn.exec("ROLLBACK"); } catch {} } // 释放写锁供他人；连接仍废弃\n'
"        discardConn();\n"
"        throw new Error(`LEDGER_COMMIT_UNCERTAIN: ${e.message}（提交结果不确定：不计成功、不重放本轮、连接已废弃）`);\n"
"      }\n"
"\n"
"      discardConn();\n"
"      return { ...next, uuid, budgetVersion: BUDGET_VERSION };\n"
"      }")
t = t[:start] + new_block + t[end:]

# 6. PRAGMA 失败 fail-closed（P0-2）
old = "      try { conn.exec(`PRAGMA busy_timeout=${busyMs}`); } catch {}"
new = ("      try {\n"
       "        conn.exec(`PRAGMA busy_timeout=${busyMs}`);\n"
       "      } catch (e) {\n"
       "        discardConn(); // P0-2：设置失败不得静默吞掉——否则连接用默认等待参数可能突破 3000ms 硬上限\n"
       "        throw new Error(`LEDGER_BUSY_TIMEOUT: busy_pragma_failed ${e.message}`);\n"
       "      }")
assert old in t, "pragma anchor"
t = t.replace(old, new, 1)

io.open(p, "w", encoding="utf-8", newline="\n").write(t)
print("session-budget v2 patched OK")
