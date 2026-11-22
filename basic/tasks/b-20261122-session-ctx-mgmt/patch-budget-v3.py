# 补丁 v3：瞬态 BUSY（open/读时 database is locked）按重试处理，与真损坏（UNREADABLE）分流
import io
p = r"D:\CommonProjects\agent-kit\monitor\session-budget.mjs"
t = io.open(p, encoding="utf-8").read()

# 1. readOn：locked=瞬态 BUSY_TRANSIENT；其余=UNREADABLE
old = """function readOn(db, uuid) {
  // 在既有连接上读取（recordTurn 连接复用路径）；异常映射 LEDGER_UNREADABLE
  try {
    ensureSchema(db);
    const row = db.prepare("SELECT * FROM ledger WHERE uuid=?").get(uuid);
    return row ? rowToLedger(row) : null;
  } catch (e) {
    throw new Error(`LEDGER_UNREADABLE: ${e.message}`);
  }
}"""
new = """function isTransientBusy(e) {
  return /database is locked|SQLITE_BUSY/i.test(String(e?.message || e));
}

function readOn(db, uuid) {
  // 在既有连接上读取（recordTurn 连接复用路径）；locked=瞬态 BUSY（可重试）→ BUSY_TRANSIENT；
  // 其余（损坏/IO）= LEDGER_UNREADABLE（fail-closed）
  try {
    ensureSchema(db);
    const row = db.prepare("SELECT * FROM ledger WHERE uuid=?").get(uuid);
    return row ? rowToLedger(row) : null;
  } catch (e) {
    if (isTransientBusy(e)) throw new Error(`LEDGER_BUSY_TRANSIENT: ${e.message}`);
    throw new Error(`LEDGER_UNREADABLE: ${e.message}`);
  }
}"""
assert old in t, "readOn anchor"
t = t.replace(old, new, 1)

# 2. newConn：open/ensureSchema 的 locked=瞬态（可重试）
old = "  const newConn = () => {
    try {
      conn = openConn();
      ensureSchema(conn); // 损坏库在此抛 → 统一映射 LEDGER_UNREADABLE
    } catch (e) {
      discardConn();
      throw new Error(`LEDGER_UNREADABLE: ` + (e.message || e.code || \"open_or_schema_failed\"));
    }
  };" 
new = """  const newConn = () => {
    try {
      conn = openConn();
      ensureSchema(conn);
    } catch (e) {
      discardConn();
      if (isTransientBusy(e)) throw new Error(`LEDGER_BUSY_TRANSIENT: open ${e.message}`);
      throw new Error(`LEDGER_UNREADABLE: ` + (e.message || e.code || "open_or_schema_failed"));
    }
  };"""
assert old in t, "newConn anchor"
t = t.replace(old, new, 1)

# 3. 主循环：读快照段捕获 BUSY_TRANSIENT → 按预算重试
old = """      // ① 事务外读快照（同连接；每次尝试都从最新已提交状态出发）
      const ledger = readOn(conn, uuid);"""
new = """      // ① 事务外读快照（同连接；每次尝试都从最新已提交状态出发）；并发下 open/read 可能瞬态 locked → 按预算重试
      let ledger;
      try {
        ledger = readOn(conn, uuid);
      } catch (e) {
        if (String(e.message).startsWith("LEDGER_BUSY_TRANSIENT")) {
          if (remaining() < MIN_REMAINING_MS || attempt >= MAX_ATTEMPTS) {
            discardConn();
            throw new Error(`LEDGER_BUSY_TIMEOUT: read_contention ${e.message}`);
          }
          sleepSync(RETRY_INTERVAL_MS);
          continue;
        }
        throw e;
      }"""
assert old in t, "snapshot anchor"
t = t.replace(old, new, 1)

# 4. 主循环：newConn 调用处捕获 BUSY_TRANSIENT → 重试
old = """      // 连接复用（同一次 recordTurn 内）；仅错误路径废弃后新建
      if (!conn) newConn();"""
new = """      // 连接复用（同一次 recordTurn 内）；仅错误路径废弃后新建；并发 open 争用=瞬态按预算重试
      if (!conn) {
        try {
          newConn();
        } catch (e) {
          if (String(e.message).startsWith("LEDGER_BUSY_TRANSIENT")) {
            if (remaining() < MIN_REMAINING_MS || attempt >= MAX_ATTEMPTS) {
              throw new Error(`LEDGER_BUSY_TIMEOUT: open_contention ${e.message}`);
            }
            sleepSync(RETRY_INTERVAL_MS);
            continue;
          }
          throw e;
        }
      }"""
assert old in t, "conn acquire anchor"
t = t.replace(old, new, 1)

io.open(p, "w", encoding="utf-8", newline="\n").write(t)
print("v3 patched OK")
