"""SQLite persistence, forward migrations, transactions, and UTC helpers."""
from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def to_utc(value: str) -> str:
    normalized = value.replace("Z", "+00:00")
    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is None:
        raise ValueError("timestamp must include a timezone")
    return parsed.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def json_text(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def row_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    return dict(row) if row is not None else None


class Database:
    def __init__(self, path: Path) -> None:
        self.path = Path(path)

    def connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.path, timeout=30, isolation_level=None)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("PRAGMA busy_timeout=30000")
        return conn

    def initialize(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        conn = self.connect()
        try:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute(
                "CREATE TABLE IF NOT EXISTS schema_migrations "
                "(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)"
            )
            migration_dir = Path(__file__).resolve().parent / "migrations"
            for migration in sorted(migration_dir.glob("[0-9][0-9][0-9]_*.sql")):
                version = int(migration.name[:3])
                applied = conn.execute(
                    "SELECT version FROM schema_migrations WHERE version=?", (version,)
                ).fetchone()
                if applied:
                    continue
                conn.executescript(migration.read_text(encoding="utf-8"))
                conn.execute(
                    "INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)",
                    (version, utc_now()),
                )
        finally:
            conn.close()

    @contextmanager
    def transaction(self) -> Iterator[sqlite3.Connection]:
        conn = self.connect()
        try:
            conn.execute("BEGIN IMMEDIATE")
            yield conn
            conn.execute("COMMIT")
        except Exception:
            if conn.in_transaction:
                conn.execute("ROLLBACK")
            raise
        finally:
            conn.close()

    @contextmanager
    def reading(self) -> Iterator[sqlite3.Connection]:
        conn = self.connect()
        try:
            yield conn
        finally:
            conn.close()


def next_id(conn: sqlite3.Connection, table: str, column: str, prefix: str, width: int = 3) -> str:
    # The caller must hold BEGIN IMMEDIATE; this makes read-allocate-insert atomic.
    row = conn.execute(f"SELECT {column} FROM {table} ORDER BY LENGTH({column}) DESC, {column} DESC LIMIT 1").fetchone()
    number = 1
    if row:
        number = int(row[column].rsplit("-", 1)[1]) + 1
    return f"{prefix}{number:0{width}d}"


def next_scoped_id(conn: sqlite3.Connection, table: str, column: str, prefix: str, width: int = 3) -> str:
    """Allocate the next `<prefix><NNN>` id, counting only ids sharing the prefix.

    The caller must hold BEGIN IMMEDIATE. Sequences with different prefixes
    (e.g. ART-TEST-* vs ART-DEV-*) stay independent.
    """
    row = conn.execute(
        f"SELECT {column} FROM {table} WHERE {column} LIKE ? "
        f"ORDER BY LENGTH({column}) DESC, {column} DESC LIMIT 1",
        (prefix + "%",),
    ).fetchone()
    number = 1
    if row:
        number = int(row[column][len(prefix):]) + 1
    return f"{prefix}{number:0{width}d}"


def audit(
    conn: sqlite3.Connection,
    *,
    actor_id: str,
    actor_type: str,
    action: str,
    target_type: str,
    target_id: str,
    result: str = "SUCCESS",
    reason: str | None = None,
    correlation_id: str | None = None,
    details: dict[str, Any] | None = None,
) -> None:
    conn.execute(
        """INSERT INTO audit_logs(
               timestamp, actor_id, actor_type, action, target_type, target_id,
               result, reason, correlation_id, details
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            utc_now(), actor_id, actor_type, action, target_type, target_id,
            result, reason, correlation_id, json_text(details) if details is not None else None,
        ),
    )
