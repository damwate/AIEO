# 补丁 v4（修正版）：CTX-CODE R2 四项整改
import io
p = r"D:\CommonProjects\agent-kit\monitor\session-budget.mjs"
t = io.open(p, encoding="utf-8").read()

# P0-1：ensureSchema 幂等迁移
old = """function ensureSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS ledger(
    uuid TEXT PRIMARY KEY,
    turns INTEGER NOT NULL,
    in_bytes INTEGER NOT NULL,
    out_bytes INTEGER NOT NULL,
    total_bytes INTEGER NOT NULL,
    max_turn_bytes INTEGER NOT NULL,
    open_turn_bytes INTEGER NOT NULL DEFAULT 0,
    gen INTEGER NOT NULL,
    first_at TEXT NOT NULL,
    last_at TEXT NOT NULL,
    budget_version INTEGER NOT NULL
  )`);
}"""
new = """const REQUIRED_COLUMNS = ["uuid","turns","in_bytes","out_bytes","total_bytes","max_turn_bytes","open_turn_bytes","gen","first_at","last_at","budget_version"];

function ensureSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS ledger(
    uuid TEXT PRIMARY KEY,
    turns INTEGER NOT NULL,
    in_bytes INTEGER NOT NULL,
    out_bytes INTEGER NOT NULL,
    total_bytes INTEGER NOT NULL,
    max_turn_bytes INTEGER NOT NULL,
    open_turn_bytes INTEGER NOT NULL DEFAULT 0,
    gen INTEGER NOT NULL,
    first_at TEXT NOT NULL,
    last_at TEXT NOT NULL,
    budget_version INTEGER NOT NULL
  )`);
  // P0-1 幂等迁移：旧版表补新增列；迁移失败=LEDGER_UNREADABLE，不得用旧 schema 数据继续放行
  const cols = db.prepare("PRAGMA table_info(ledger)").all().map((r) => r.name);
  for (const col of REQUIRED_COLUMNS) {
    if (!cols.includes(col)) {
      db.exec(`ALTER TABLE ledger ADD COLUMN ${col} INTEGER NOT NULL DEFAULT 0`);
    }
  }
  const colsAfter = db.prepare("PRAGMA table_info(ledger)").all().map((r) => r.name);
  for (const col of REQUIRED_COLUMNS) {
    if (!colsAfter.includes(col)) throw new Error(`schema_migration_failed: missing ${col}`);
  }
}"""
assert old in t, "ensureSchema anchor"
t = t.replace(old, new, 1)

# P1-1：完成阶段 totalBytes 只加 outBytes
old = """            totalBytes: ledger.totalBytes + turnBytes,
            maxTurnBytes: Math.max(ledger.maxTurnBytes, turnBytes),
            openTurnBytes: completing ? 0 : inBytes,"""
new = """            totalBytes: ledger.totalBytes + (completing ? outBytes : turnBytes), // complete 只加 out（in 已在发送时点入账，P1-1 去重）
            maxTurnBytes: Math.max(ledger.maxTurnBytes, turnBytes),
            openTurnBytes: completing ? 0 : inBytes,"""
assert old in t, "totalBytes anchor"
t = t.replace(old, new, 1)

# onEvent 基础设施
old = "  let genConflictRounds = 0;\n  let attempt = 0;"
new = "  let genConflictRounds = 0;\n  let attempt = 0;\n  const emit = (type, detail = {}) => { try { opts.onEvent?.({ type, uuid, ...detail }); } catch {} };"
assert old in t, "emit anchor"
t = t.replace(old, new, 1)

# C8 分支证据：唯一约束路径 emit
old = """        if (isUniqueConstraintError(e) && !ledger) {
          if (remaining() < MIN_REMAINING_MS || attempt >= MAX_ATTEMPTS) {
            throw new Error(`LEDGER_BUSY_TIMEOUT: first_write_conflict_race`);
          }
          sleepSync(RETRY_INTERVAL_MS);
          continue;
        }"""
new = """        if (isUniqueConstraintError(e) && !ledger) {
          emit("first_write_constraint_retry", { attempt }); // C8 分支证据：唯一约束冲突路径确实执行
          if (remaining() < MIN_REMAINING_MS || attempt >= MAX_ATTEMPTS) {
            throw new Error(`LEDGER_BUSY_TIMEOUT: first_write_conflict_race`);
          }
          sleepSync(RETRY_INTERVAL_MS);
          continue;
        }"""
assert old in t, "constraint emit anchor"
t = t.replace(old, new, 1)

# GEN 冲突路径 emit
old = """            genConflictRounds += 1;
            if (genConflictRounds >= GEN_CONFLICT_MAX_ROUNDS) {"""
new = """            genConflictRounds += 1;
            emit("gen_conflict_retry", { attempt, round: genConflictRounds });
            if (genConflictRounds >= GEN_CONFLICT_MAX_ROUNDS) {"""
assert old in t, "gen emit anchor"
t = t.replace(old, new, 1)

io.open(p, "w", encoding="utf-8", newline="\n").write(t)
print("v4 patched OK")
