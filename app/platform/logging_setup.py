"""C4 structured logging: one JSON object per line (NDJSON), date-rotated files.

Run logs are diagnostics only; audit responsibility stays in audit_logs (C4 §5.3).
Audit rows are written in the same DB transaction as the business change, so a
runtime-log failure must never swallow an audit event: logging errors fall back
to stderr and are never raised into business code paths.
"""
from __future__ import annotations

import json
import sys
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

SERVICE = "platform"
MODULE = "M1"

REQUIRED_FIELD_ORDER = (
    "timestamp", "level", "service", "module", "event", "message", "env",
)

# C4 §5.4: secrets must never reach the log files.
SENSITIVE_KEY_FRAGMENTS = (
    "password", "secret", "token", "authorization", "cookie", "api_key",
    "apikey", "credential", "session_key",
)
_REDACTED = "[REDACTED]"


def redact(value: Any) -> Any:
    """Recursively scrub sensitive-looking keys; keep only safe structure."""
    if isinstance(value, dict):
        clean: dict[str, Any] = {}
        for key, item in value.items():
            if any(fragment in key.lower() for fragment in SENSITIVE_KEY_FRAGMENTS):
                clean[key] = _REDACTED
            else:
                clean[key] = redact(item)
        return clean
    if isinstance(value, list):
        return [redact(item) for item in value]
    return value


class PlatformLogger:
    """NDJSON run logger with daily rotation and retention cleanup."""

    def __init__(self, log_dir: Path, env: str, retention_days: int = 30) -> None:
        self.log_dir = Path(log_dir)
        self.env = env
        self.retention_days = retention_days
        self._lock = threading.Lock()
        self._handle = None
        self._handle_date: str | None = None
        self.log_dir.mkdir(parents=True, exist_ok=True)
        self._cleanup_expired()

    def _cleanup_expired(self) -> None:
        cutoff = datetime.now(timezone.utc) - timedelta(days=self.retention_days)
        for file in self.log_dir.glob("platform-*.ndjson"):
            try:
                stem_date = file.stem.removeprefix("platform-")
                file_date = datetime.strptime(stem_date, "%Y%m%d").replace(tzinfo=timezone.utc)
            except ValueError:
                continue
            if file_date < cutoff:
                try:
                    file.unlink()
                except OSError:
                    print(f"aieo.platform: failed to remove expired log {file}", file=sys.stderr)

    def _file_for(self, now: datetime) -> Path:
        return self.log_dir / f"platform-{now:%Y%m%d}.ndjson"

    def log(self, level: str, event: str, message: str, **fields: Any) -> None:
        now = datetime.now(timezone.utc)
        record: dict[str, Any] = {
            "timestamp": now.isoformat(timespec="milliseconds").replace("+00:00", "Z"),
            "level": level,
            "service": SERVICE,
            "module": MODULE,
            "event": event,
            "message": message,
            "env": self.env,
        }
        for key, value in fields.items():
            if value is None:
                continue
            record[key] = redact(value)
        line = json.dumps(record, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
        with self._lock:
            try:
                date_key = f"{now:%Y%m%d}"
                if self._handle is None or self._handle_date != date_key:
                    if self._handle is not None:
                        try:
                            self._handle.close()
                        except OSError:
                            pass
                    self._handle = open(self._file_for(now), "a", encoding="utf-8")
                    self._handle_date = date_key
                self._handle.write(line + "\n")
                self._handle.flush()
            except OSError as exc:
                # Never raise into business/audit code paths (C4 §5.5).
                print(f"aieo.platform log write failed: {exc}", file=sys.stderr)
                print(line, file=sys.stderr)

    def info(self, event: str, message: str, **fields: Any) -> None:
        self.log("INFO", event, message, **fields)

    def warning(self, event: str, message: str, **fields: Any) -> None:
        self.log("WARNING", event, message, **fields)

    def error(self, event: str, message: str, **fields: Any) -> None:
        self.log("ERROR", event, message, **fields)

    def close(self) -> None:
        with self._lock:
            if self._handle is not None:
                try:
                    self._handle.close()
                except OSError:
                    pass
                self._handle = None
                self._handle_date = None
