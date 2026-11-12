"""C7 single-machine authentication: Argon2id admin, sessions, service identity.

- Human users: session cookie (HttpOnly, SameSite=Lax, Secure in production)
  plus a CSRF token that must accompany every state-changing request.
- MCP/CLI service agents: independent local service identity authenticated by
  a bearer token; only the SHA-256 hash of the token is stored.
"""
from __future__ import annotations

import hashlib
import secrets
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, VerificationError, InvalidHashError
from fastapi import Request

from .database import audit, utc_now
from .errors import APIError

SESSION_COOKIE = "aieo_session"
CSRF_HEADER = "X-CSRF-Token"

_hasher = PasswordHasher()


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def sha256_hex(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class Principal:
    kind: str  # 'user' or 'service'
    username: str | None = None
    agent_id: str | None = None
    agent_type: str | None = None
    session_id: str | None = None
    csrf_token: str | None = None

    @property
    def actor_id(self) -> str:
        return self.username or self.agent_id or "unknown"

    @property
    def actor_type(self) -> str:
        return "user" if self.kind == "user" else "agent"


class SecurityError(APIError):
    pass


def unauthorized(message: str = "AUTH-0001 UNAUTHENTICATED: valid credentials required") -> SecurityError:
    return SecurityError(401, "AUTH-0001", message)


def forbidden(message: str = "AUTH-0002 FORBIDDEN: not allowed for this principal") -> SecurityError:
    return SecurityError(403, "AUTH-0002", message)


def session_expired() -> SecurityError:
    return SecurityError(401, "AUTH-0003", "AUTH-0003 SESSION_EXPIRED: session has expired, please log in again")


def bootstrap_admin(conn: sqlite3.Connection, username: str, password: str) -> bool:
    """One-time OWNER initialization on first startup; returns True if created."""
    row = conn.execute("SELECT username FROM platform_users LIMIT 1").fetchone()
    if row:
        return False
    now = utc_now()
    conn.execute(
        "INSERT INTO platform_users(username, password_hash, role, created_at, updated_at) VALUES (?, ?, 'OWNER', ?, ?)",
        (username, hash_password(password), now, now),
    )
    return True


def verify_login(conn: sqlite3.Connection, username: str, password: str) -> bool:
    row = conn.execute("SELECT password_hash FROM platform_users WHERE username=?", (username,)).fetchone()
    if not row:
        # Constant-ish work to blunt user enumeration timing.
        verify_password("$argon2id$placeholder" + "x" * 32, password)
        return False
    return verify_password(row["password_hash"], password)


def create_session(
    conn: sqlite3.Connection,
    *,
    settings: Any,
    username: str,
    kind: str = "user",
    agent_id: str | None = None,
    now: datetime | None = None,
) -> tuple[str, str, str]:
    """Create a session; returns (session_id, csrf_token, expires_at ISO)."""
    moment = now or datetime.now(timezone.utc)
    session_id = secrets.token_urlsafe(32)
    csrf_token = secrets.token_urlsafe(32)
    created = utc_now_from(moment)
    expires = utc_now_from(moment + timedelta(seconds=settings.session_absolute_seconds))
    conn.execute(
        """INSERT INTO user_sessions(session_id, username, csrf_token, kind, agent_id,
               created_at, last_seen_at, expires_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (session_id, username, csrf_token, kind, agent_id, created, created, expires),
    )
    return session_id, csrf_token, expires


def utc_now_from(moment: datetime) -> str:
    return moment.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def get_session(conn: sqlite3.Connection, session_id: str, settings: Any, now: datetime | None = None):
    moment = now or datetime.now(timezone.utc)
    row = conn.execute("SELECT * FROM user_sessions WHERE session_id=?", (session_id,)).fetchone()
    if not row or row["revoked_at"] is not None:
        return None
    expires = datetime.fromisoformat(row["expires_at"].replace("Z", "+00:00"))
    if moment > expires:
        revoke(conn, session_id)
        raise session_expired()
    last_seen = datetime.fromisoformat(row["last_seen_at"].replace("Z", "+00:00"))
    if moment - last_seen > timedelta(seconds=settings.session_idle_seconds):
        revoke(conn, session_id)
        raise session_expired()
    conn.execute("UPDATE user_sessions SET last_seen_at=? WHERE session_id=?",
                 (utc_now_from(moment), session_id))
    return row


def revoke(conn: sqlite3.Connection, session_id: str) -> bool:
    cursor = conn.execute(
        "UPDATE user_sessions SET revoked_at=? WHERE session_id=? AND revoked_at IS NULL",
        (utc_now(), session_id),
    )
    return cursor.rowcount > 0


def issue_service_token(conn: sqlite3.Connection, agent_id: str) -> str:
    """Issue a bearer token for a local service agent; only the hash is stored."""
    token = "ait_" + secrets.token_urlsafe(32)
    conn.execute(
        "INSERT INTO service_credentials(agent_id, token_hash, created_at) VALUES (?, ?, ?)",
        (agent_id, sha256_hex(token), utc_now()),
    )
    return token


def resolve_service_token(conn: sqlite3.Connection, token: str) -> sqlite3.Row | None:
    return conn.execute(
        """SELECT a.* FROM service_credentials c JOIN agents a ON a.agent_id=c.agent_id
           WHERE c.token_hash=? AND a.enabled=1""",
        (sha256_hex(token),),
    ).fetchone()


def authenticate(request, conn: sqlite3.Connection, settings: Any) -> Principal:
    """Resolve the request principal via cookie or bearer token (C1 §2.5)."""
    now = datetime.now(timezone.utc)

    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header.removeprefix("Bearer ").strip()
        agent = resolve_service_token(conn, token) if token else None
        if not agent:
            raise unauthorized("AUTH-0001 UNAUTHENTICATED: invalid service token")
        return Principal(kind="service", agent_id=agent["agent_id"], agent_type=agent["agent_type"])

    session_id = request.cookies.get(SESSION_COOKIE)
    if session_id:
        row = get_session(conn, session_id, settings, now)
        if row is None:
            raise unauthorized("AUTH-0001 UNAUTHENTICATED: unknown or revoked session")
        return Principal(
            kind=row["kind"],
            username=row["username"],
            agent_id=row["agent_id"],
            session_id=session_id,
            csrf_token=row["csrf_token"],
        )

    raise unauthorized()


def enforce_csrf(request: Request, principal: Principal) -> None:
    """CSRF for state-changing requests made with cookie auth (C7 §8.4)."""
    if request.method in {"GET", "HEAD", "OPTIONS"}:
        return
    if principal.kind != "user":
        return  # bearer-token service identity is not cookie-attached
    supplied = request.headers.get(CSRF_HEADER, "")
    if not supplied or not principal.csrf_token or not secrets.compare_digest(supplied, principal.csrf_token):
        raise forbidden("AUTH-0002 FORBIDDEN: missing or invalid CSRF token for state-changing request")


def audit_login(conn: sqlite3.Connection, *, username: str, success: bool, correlation_id: str | None,
                details: dict[str, Any] | None = None) -> None:
    audit(
        conn,
        actor_id=username,
        actor_type="user",
        action="login_success" if success else "login_failed",
        target_type="platform_user",
        target_id=username,
        result="SUCCESS" if success else "FAILURE",
        correlation_id=correlation_id,
        details=details,
    )
