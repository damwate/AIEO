"""Fail-fast AIEO_ configuration with environment > YAML > defaults."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]


def _nested(data: Mapping[str, Any], path: str) -> Any:
    value: Any = data
    for key in path.split("."):
        if not isinstance(value, Mapping) or key not in value:
            return None
        value = value[key]
    return value


@dataclass(frozen=True)
class Settings:
    env: str
    db_path: Path
    log_dir: Path
    artifact_dir: Path
    server_host: str
    server_port: int
    session_secret: str
    admin_username: str
    admin_password: str
    msg_ack_timeout: int
    msg_max_retries: int
    msg_retry_base_seconds: int
    log_retention_days: int
    session_idle_seconds: int
    session_absolute_seconds: int
    artifact_max_inline_bytes: int

    @classmethod
    def from_environ(cls, overrides: Mapping[str, str] | None = None) -> "Settings":
        source = dict(os.environ)
        if overrides:
            source.update(overrides)
        config_path = Path(source.get("AIEO_CONFIG_FILE", REPO_ROOT / "config" / "aieo.yaml"))
        file_data: Mapping[str, Any] = {}
        if config_path.is_file():
            loaded = yaml.safe_load(config_path.read_text(encoding="utf-8")) or {}
            if not isinstance(loaded, Mapping):
                raise ValueError(f"AIEO_CONFIG_FILE must contain a mapping: {config_path}")
            file_data = loaded

        def value(env_key: str, file_key: str, default: Any = None) -> Any:
            if env_key in source:
                return source[env_key]
            file_value = _nested(file_data, file_key)
            return default if file_value is None else file_value

        errors: list[str] = []
        env = value("AIEO_ENV", "env")
        secret = value("AIEO_SESSION_SECRET", "session.secret")
        password = value("AIEO_PLATFORM_ADMIN_PASSWORD", "platform.admin_password")
        if env not in {"development", "test", "production"}:
            errors.append("AIEO_ENV is required and must be development, test, or production")
        if not isinstance(secret, str) or len(secret) < 32:
            errors.append("AIEO_SESSION_SECRET is required and must contain at least 32 characters")
        if not isinstance(password, str) or len(password) < 12:
            errors.append("AIEO_PLATFORM_ADMIN_PASSWORD is required and must contain at least 12 characters")

        bind = str(value("AIEO_SERVER_BIND", "server.bind", "127.0.0.1:8000"))
        try:
            host, port_text = bind.rsplit(":", 1)
            port = int(port_text)
            if host not in {"127.0.0.1", "localhost", "::1"} or not 1 <= port <= 65535:
                raise ValueError
        except ValueError:
            errors.append("AIEO_SERVER_BIND must be a loopback host and valid port (default 127.0.0.1:8000)")
            host, port = "127.0.0.1", 8000

        def integer(env_key: str, file_key: str, default: int, minimum: int) -> int:
            raw = value(env_key, file_key, default)
            try:
                parsed = int(raw)
                if parsed < minimum:
                    raise ValueError
                return parsed
            except (TypeError, ValueError):
                errors.append(f"{env_key} must be an integer >= {minimum}")
                return default

        def path_value(env_key: str, file_key: str, default: Path) -> Path:
            raw = Path(str(value(env_key, file_key, str(default))))
            return raw if raw.is_absolute() else (REPO_ROOT / raw).resolve()

        if errors:
            raise ValueError("Invalid AIEO configuration:\n- " + "\n- ".join(errors))

        return cls(
            env=env,
            db_path=path_value("AIEO_DB_PATH", "platform.db_path", REPO_ROOT / "runtime" / "aieo.db"),
            log_dir=path_value("AIEO_LOG_DIR", "log.dir", REPO_ROOT / "runtime" / "logs" / "platform"),
            artifact_dir=path_value("AIEO_ARTIFACT_DIR", "platform.artifact_dir", REPO_ROOT / "runtime" / "artifacts"),
            server_host=host,
            server_port=port,
            session_secret=secret,
            admin_username=str(value("AIEO_PLATFORM_ADMIN_USERNAME", "platform.admin_username", "OWNER")),
            admin_password=password,
            msg_ack_timeout=integer("AIEO_MSG_ACK_TIMEOUT", "messaging.ack_timeout", 300, 1),
            msg_max_retries=integer("AIEO_MSG_MAX_RETRIES", "messaging.max_retries", 8, 0),
            msg_retry_base_seconds=integer("AIEO_MSG_RETRY_BASE_SECONDS", "messaging.retry_base_seconds", 30, 1),
            log_retention_days=integer("AIEO_LOG_RETENTION_DAYS", "log.retention_days", 30, 1),
            session_idle_seconds=integer("AIEO_SESSION_IDLE_SECONDS", "session.idle_seconds", 28800, 60),
            session_absolute_seconds=integer("AIEO_SESSION_ABSOLUTE_SECONDS", "session.absolute_seconds", 86400, 60),
            artifact_max_inline_bytes=integer("AIEO_ARTIFACT_MAX_INLINE_BYTES", "platform.artifact_max_inline_bytes", 1048576, 1),
        )
