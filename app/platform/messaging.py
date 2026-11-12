"""Message Inbox/Outbox semantics (C1 §2.2/§2.4, 03-协议 §2/§9).

- message_id is the primary key and therefore the dedup key; duplicate
  submissions return the original processing result (RES-0003) without
  re-running side effects.
- Outbox state machine: PENDING -> SENT -> ACKED; RETRYING on failure/ACK
  timeout; DEAD_LETTER after max retries; CANCELLED only from PENDING.
- The M1 delivery channel in Phase 1 is the REST polling interface itself:
  sweep() moves pending outbound messages to SENT ("delivered to the poll
  channel"), ACK-timeout then drives retry/dead-letter.
"""
from __future__ import annotations

import json
import random
import sqlite3
from datetime import datetime, timedelta, timezone
from typing import Any

from .database import audit, json_text, to_utc, utc_now
from .errors import (
    bad_request,
    conflict,
    duplicate_message,
    not_found,
    unsupported_version,
)
from .logging_setup import PlatformLogger
from .schemas import MESSAGE_PAYLOAD_MAX_BYTES, MESSAGE_TYPE_LEVEL, MessageIn
from .security import Principal

PLATFORM_AGENT_ID = "AIEO-ORCHESTRATOR"
CONTRACT_VERSION = "1.0"

MESSAGE_STATUSES = ("PENDING", "SENT", "ACKED", "RETRYING", "DEAD_LETTER", "CANCELLED")


def generate_message_id(conn: sqlite3.Connection, now: datetime | None = None) -> str:
    moment = now or datetime.now(timezone.utc)
    prefix = f"MSG-{moment:%Y%m%d}-"
    row = conn.execute(
        "SELECT message_id FROM messages WHERE message_id LIKE ? "
        "ORDER BY LENGTH(message_id) DESC, message_id DESC LIMIT 1",
        (prefix + "%",),
    ).fetchone()
    number = 1
    if row:
        number = int(row["message_id"][len(prefix):]) + 1
    return f"{prefix}{number:06d}"


def build_envelope(
    conn: sqlite3.Connection,
    *,
    message_type: str,
    source_agent_id: str,
    target_agent_id: str,
    project_id: str,
    batch_id: str | None,
    task_id: str | None,
    correlation_id: str,
    payload: dict[str, Any],
    now: datetime | None = None,
) -> MessageIn:
    """Build a server-side envelope for messages M1 emits itself."""
    moment = now or datetime.now(timezone.utc)
    source_type = conn.execute("SELECT agent_type FROM agents WHERE agent_id=?",
                               (source_agent_id,)).fetchone()
    target_type = conn.execute("SELECT agent_type FROM agents WHERE agent_id=?",
                               (target_agent_id,)).fetchone()
    return MessageIn(
        schema_version=CONTRACT_VERSION,
        message_id=generate_message_id(conn, moment),
        message_type=message_type,  # type: ignore[arg-type]
        created_at=utc_now_from(moment),
        source={"agent_id": source_agent_id, "agent_type": source_type["agent_type"] if source_type else "system"},
        target={"agent_id": target_agent_id, "agent_type": target_type["agent_type"] if target_type else "developer"},
        project_id=project_id,
        batch_id=batch_id,
        task_id=task_id,
        correlation_id=correlation_id,
        payload=payload,
    )


def utc_now_from(moment: datetime) -> str:
    return moment.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def register_outbox_message(
    conn: sqlite3.Connection,
    *,
    message_type: str,
    source_agent_id: str,
    target_agent_id: str,
    project_id: str,
    batch_id: str | None,
    task_id: str | None,
    correlation_id: str,
    payload: dict[str, Any],
    actor_id: str,
    actor_type: str,
    max_retries: int | None,
    logger: PlatformLogger | None = None,
    settings: Any = None,
    created_at: str | None = None,
) -> dict:
    """Register a platform-emitted OUTBOUND message; caller holds the transaction.

    Same-transaction outbox registration point for business state changes
    (03-协议 §9-2): claim/dispatch and other flows call this inside their
    own business transaction.
    """
    envelope = build_envelope(
        conn,
        message_type=message_type,
        source_agent_id=source_agent_id,
        target_agent_id=target_agent_id,
        project_id=project_id,
        batch_id=batch_id,
        task_id=task_id,
        correlation_id=correlation_id,
        payload=payload,
    )
    return _insert_message(
        conn, envelope, direction="OUTBOUND",
        max_retries=max_retries if max_retries is not None else (settings.msg_max_retries if settings else 8),
        actor_id=actor_id, actor_type=actor_type,
        logger=logger, created_at=created_at,
    )


def _insert_message(
    conn: sqlite3.Connection,
    envelope: MessageIn,
    *,
    direction: str,
    max_retries: int,
    actor_id: str,
    actor_type: str,
    logger: PlatformLogger | None,
    created_at: str | None = None,
) -> dict:
    existing = conn.execute("SELECT * FROM messages WHERE message_id=?", (envelope.message_id,)).fetchone()
    if existing:
        raise duplicate_message(
            f"message {envelope.message_id} already registered; returning original result",
            details={
                "message_id": existing["message_id"],
                "status": existing["status"],
                "processing_status": existing["processing_status"],
                "delivered_at": existing["delivered_at"],
                "acked_at": existing["acked_at"],
                "created_at": existing["created_at"],
            },
        )
    created = created_at or utc_now()
    processing_status = "PENDING" if direction == "INBOUND" else None
    conn.execute(
        """INSERT INTO messages(message_id, schema_version, message_type, direction,
               source_agent_id, target_agent_id, project_id, batch_id, task_id,
               correlation_id, payload, status, retry_count, max_retries,
               processing_status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 0, ?, ?, ?, ?)""",
        (envelope.message_id, envelope.schema_version, envelope.message_type, direction,
         envelope.source.agent_id, envelope.target.agent_id, envelope.project_id,
         envelope.batch_id, envelope.task_id, envelope.correlation_id,
         json_text(envelope.payload), max_retries, processing_status, created, created),
    )
    audit(conn, actor_id=actor_id, actor_type=actor_type,
          action="message_registered", target_type="message", target_id=envelope.message_id,
          correlation_id=envelope.correlation_id,
          details={"message_type": envelope.message_type, "direction": direction})
    if logger:
        logger.info("message_registered", f"message {envelope.message_id} registered ({direction})",
                    message_id=envelope.message_id, correlation_id=envelope.correlation_id,
                    project_id=envelope.project_id, batch_id=envelope.batch_id,
                    task_id=envelope.task_id, operation="register_message",
                    result="SUCCESS", message_type=envelope.message_type, direction=direction)
    row = conn.execute("SELECT * FROM messages WHERE message_id=?", (envelope.message_id,)).fetchone()
    return message_view(row)


def register_inbound_message(
    conn: sqlite3.Connection,
    envelope: MessageIn,
    *,
    actor_id: str,
    actor_type: str,
    logger: PlatformLogger | None,
    settings: Any,
) -> dict:
    """Validate and register an externally submitted message (POST /messages)."""
    if envelope.schema_version.split(".")[0] != CONTRACT_VERSION.split(".")[0]:
        raise unsupported_version(
            f"schema_version major {envelope.schema_version} is not supported; supported major is 1",
            details={"supported_versions": ["1.0"], "minimum_supported_version": "1.0"},
        )
    try:
        created_utc = to_utc(envelope.created_at)
    except (ValueError, TypeError):
        raise bad_request("created_at must be an ISO 8601 timestamp with timezone",
                          details={"field": "created_at"})

    project = conn.execute("SELECT 1 FROM projects WHERE project_id=?", (envelope.project_id,)).fetchone()
    if not project:
        raise not_found("project", envelope.project_id)
    source = conn.execute("SELECT 1 FROM agents WHERE agent_id=?", (envelope.source.agent_id,)).fetchone()
    if not source:
        raise not_found("source agent", envelope.source.agent_id)
    target = conn.execute("SELECT 1 FROM agents WHERE agent_id=?", (envelope.target.agent_id,)).fetchone()
    if not target:
        raise not_found("target agent", envelope.target.agent_id)

    level = MESSAGE_TYPE_LEVEL[envelope.message_type]
    if level == "task":
        if not envelope.task_id or not envelope.batch_id:
            raise bad_request(
                f"message_type {envelope.message_type} requires batch_id and task_id",
                details={"field": "task_id", "required": ["batch_id", "task_id"]},
            )
    elif level == "batch":
        if not envelope.batch_id:
            raise bad_request(f"message_type {envelope.message_type} requires batch_id",
                              details={"field": "batch_id"})
        if envelope.task_id is not None:
            raise bad_request(f"message_type {envelope.message_type} must not carry task_id",
                              details={"field": "task_id"})
    else:
        if envelope.batch_id is not None or envelope.task_id is not None:
            raise bad_request(f"message_type {envelope.message_type} is project-level; batch_id/task_id must be null",
                              details={"field": "batch_id"})

    if envelope.batch_id:
        batch = conn.execute("SELECT * FROM batches WHERE batch_id=?", (envelope.batch_id,)).fetchone()
        if not batch:
            raise not_found("batch", envelope.batch_id)
        if batch["project_id"] != envelope.project_id:
            raise bad_request("batch does not belong to the message project",
                              details={"field": "batch_id"})
    if envelope.task_id:
        task = conn.execute("SELECT * FROM tasks WHERE task_id=?", (envelope.task_id,)).fetchone()
        if not task:
            raise not_found("task", envelope.task_id)
        if envelope.batch_id and task["batch_id"] != envelope.batch_id:
            raise bad_request("task does not belong to the message batch",
                              details={"field": "task_id"})
        task_batch = conn.execute("SELECT * FROM batches WHERE batch_id=?", (task["batch_id"],)).fetchone()
        if task_batch["project_id"] != envelope.project_id:
            raise bad_request("task does not belong to the message project",
                              details={"field": "task_id"})

    payload_bytes = len(json.dumps(envelope.payload, ensure_ascii=False).encode("utf-8"))
    if payload_bytes > MESSAGE_PAYLOAD_MAX_BYTES:
        raise bad_request(
            f"payload exceeds the 256 KB M1 message limit ({payload_bytes} bytes)",
            details={"field": "payload", "limit_bytes": MESSAGE_PAYLOAD_MAX_BYTES, "actual_bytes": payload_bytes},
        )

    direction = "INBOUND" if envelope.target.agent_id == PLATFORM_AGENT_ID else "OUTBOUND"
    return _insert_message(
        conn, envelope, direction=direction, max_retries=settings.msg_max_retries,
        actor_id=actor_id, actor_type=actor_type, logger=logger, created_at=created_utc,
    )


def message_view(row: sqlite3.Row) -> dict:
    view = dict(row)
    view["payload"] = json.loads(view["payload"])
    return view


def get_message(conn: sqlite3.Connection, message_id: str) -> dict:
    row = conn.execute("SELECT * FROM messages WHERE message_id=?", (message_id,)).fetchone()
    if not row:
        raise not_found("message", message_id)
    return message_view(row)


def list_messages(conn: sqlite3.Connection, *, direction: str | None, target_agent_id: str | None,
                  status: str | None, task_id: str | None, correlation_id: str | None,
                  page: int, page_size: int, offset: int, sort_clause: str) -> tuple[list[dict], int]:
    clauses, params = [], []
    if direction:
        clauses.append("direction=?")
        params.append(direction)
    if target_agent_id:
        clauses.append("target_agent_id=?")
        params.append(target_agent_id)
    if status:
        clauses.append("status=?")
        params.append(status)
    if task_id:
        clauses.append("task_id=?")
        params.append(task_id)
    if correlation_id:
        clauses.append("correlation_id=?")
        params.append(correlation_id)
    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
    total = conn.execute(f"SELECT COUNT(*) AS c FROM messages {where}", params).fetchone()["c"]
    rows = conn.execute(
        f"SELECT * FROM messages {where} ORDER BY {sort_clause} LIMIT ? OFFSET ?",
        (*params, page_size, offset),
    ).fetchall()
    return [message_view(row) for row in rows], total


def ack_message(conn: sqlite3.Connection, message_id: str, principal: Principal,
                logger: PlatformLogger | None) -> dict:
    row = conn.execute("SELECT * FROM messages WHERE message_id=?", (message_id,)).fetchone()
    if not row:
        raise not_found("message", message_id)
    if row["status"] == "ACKED":
        return message_view(row)  # idempotent: repeated ACK returns current state
    if row["status"] in {"CANCELLED", "DEAD_LETTER"}:
        raise conflict(
            f"message {message_id} in status {row['status']} cannot be ACKed",
            details={"message_id": message_id, "status": row["status"]},
        )
    now = utc_now()
    processing_status = "PROCESSED" if row["direction"] == "INBOUND" else row["processing_status"]
    processed_at = now if row["direction"] == "INBOUND" else row["processed_at"]
    conn.execute(
        """UPDATE messages SET status='ACKED', acked_at=?, delivered_at=COALESCE(delivered_at, ?),
               next_retry_at=NULL, processing_status=?, processed_at=?, updated_at=?
           WHERE message_id=?""",
        (now, now, processing_status, processed_at, now, message_id),
    )
    audit(conn, actor_id=principal.actor_id, actor_type=principal.actor_type,
          action="message_ack", target_type="message", target_id=message_id,
          correlation_id=row["correlation_id"])
    if logger:
        logger.info("message_acked", f"message {message_id} ACKed",
                    message_id=message_id, correlation_id=row["correlation_id"],
                    operation="ack_message", result="SUCCESS")
    return get_message(conn, message_id)


def cancel_message(conn: sqlite3.Connection, message_id: str, principal: Principal,
                   logger: PlatformLogger | None) -> dict:
    """Sender-side cancellation, only while PENDING (C1 §2.4)."""
    row = conn.execute("SELECT * FROM messages WHERE message_id=?", (message_id,)).fetchone()
    if not row:
        raise not_found("message", message_id)
    if row["status"] != "PENDING":
        raise conflict(f"only PENDING messages can be cancelled (current {row['status']})",
                       details={"message_id": message_id, "status": row["status"]})
    conn.execute("UPDATE messages SET status='CANCELLED', updated_at=? WHERE message_id=?",
                 (utc_now(), message_id))
    audit(conn, actor_id=principal.actor_id, actor_type=principal.actor_type,
          action="message_cancelled", target_type="message", target_id=message_id,
          correlation_id=row["correlation_id"])
    if logger:
        logger.info("message_cancelled", f"message {message_id} cancelled",
                    message_id=message_id, operation="cancel_message", result="SUCCESS")
    return get_message(conn, message_id)


def requeue_message(conn: sqlite3.Connection, message_id: str, actor: str, reason: str | None,
                    logger: PlatformLogger | None) -> dict:
    """Manual Dead Letter re-dispatch; only humans may call it (C1 §2.4-4)."""
    row = conn.execute("SELECT * FROM messages WHERE message_id=?", (message_id,)).fetchone()
    if not row:
        raise not_found("message", message_id)
    if row["status"] != "DEAD_LETTER":
        raise conflict(f"only DEAD_LETTER messages can be requeued (current {row['status']})",
                       details={"message_id": message_id, "status": row["status"]})
    conn.execute(
        """UPDATE messages SET status='PENDING', retry_count=0, next_retry_at=NULL,
               dead_lettered_at=NULL, updated_at=? WHERE message_id=?""",
        (utc_now(), message_id),
    )
    audit(conn, actor_id=actor, actor_type="user",
          action="requeue_message", target_type="message", target_id=message_id,
          correlation_id=row["correlation_id"],
          details={"reason": reason, "previous_retry_count": row["retry_count"],
                   "previous_status": row["status"]})
    if logger:
        logger.info("message_requeued", f"dead-letter message {message_id} requeued by {actor}",
                    message_id=message_id, operation="requeue_message", result="SUCCESS",
                    attempt=row["retry_count"])
    return get_message(conn, message_id)


def sweep(conn: sqlite3.Connection, settings: Any, *, now: datetime | None = None,
          jitter: bool = True, logger: PlatformLogger | None = None) -> dict:
    """Outbox maintenance sweep with injected clock (ACK timeout, retry, dead letter)."""
    moment = now or datetime.now(timezone.utc)
    now_iso = utc_now_from(moment)
    counts = {"delivered": 0, "redispatched": 0, "retrying": 0, "dead_lettered": 0}

    # 1. RETRYING whose backoff expired -> PENDING for the next delivery round.
    cursor = conn.execute(
        """UPDATE messages SET status='PENDING', updated_at=?
           WHERE direction='OUTBOUND' AND status='RETRYING' AND next_retry_at IS NOT NULL
             AND next_retry_at <= ?""",
        (now_iso, now_iso),
    )
    counts["redispatched"] = cursor.rowcount

    # 2. Deliver: the REST poll channel is the Phase 1 transport, so pending
    #    outbound messages handed to pollers are marked SENT. delivered_at
    #    records the latest delivery round (reset on every redelivery).
    cursor = conn.execute(
        """UPDATE messages SET status='SENT', delivered_at=?, updated_at=?
           WHERE direction='OUTBOUND' AND status='PENDING'""",
        (now_iso, now_iso),
    )
    counts["delivered"] = cursor.rowcount

    # 3. ACK timeout (MSG-0002): not a task failure; schedule retries, then dead-letter.
    timeout_iso = utc_now_from(moment - timedelta(seconds=settings.msg_ack_timeout))
    stale = conn.execute(
        """SELECT * FROM messages WHERE direction='OUTBOUND' AND status='SENT'
             AND acked_at IS NULL AND delivered_at IS NOT NULL AND delivered_at <= ?""",
        (timeout_iso,),
    ).fetchall()
    for row in stale:
        if row["retry_count"] >= row["max_retries"]:
            conn.execute(
                """UPDATE messages SET status='DEAD_LETTER', dead_lettered_at=?,
                       last_error_code='MSG-0002', last_error_message=?,
                       next_retry_at=NULL, updated_at=? WHERE message_id=?""",
                (now_iso, f"ACK timeout after {row['retry_count']} retries", now_iso, row["message_id"]),
            )
            counts["dead_lettered"] += 1
            if logger:
                logger.warning("message_dead_lettered",
                               f"message {row['message_id']} moved to dead letter (ACK timeout)",
                               message_id=row["message_id"], error_code="MSG-0002",
                               retryable=False, attempt=row["retry_count"], operation="sweep",
                               result="FAILURE")
        else:
            new_count = row["retry_count"] + 1
            delay = settings.msg_retry_base_seconds * (2 ** (new_count - 1))
            if jitter:
                delay *= random.uniform(0.8, 1.2)
            next_retry = utc_now_from(moment + timedelta(seconds=delay))
            conn.execute(
                """UPDATE messages SET status='RETRYING', retry_count=?, next_retry_at=?,
                       last_error_code='MSG-0002', last_error_message=?,
                       dead_lettered_at=NULL, updated_at=? WHERE message_id=?""",
                (new_count, next_retry, "ACK timeout, retry scheduled", now_iso, row["message_id"]),
            )
            counts["retrying"] += 1
            if logger:
                logger.warning("message_retry_scheduled",
                               f"message {row['message_id']} ACK timed out; retry {new_count} scheduled",
                               message_id=row["message_id"], error_code="MSG-0002", retryable=True,
                               attempt=new_count, operation="sweep", result="RETRY")
    return counts
