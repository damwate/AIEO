"""The sole owner of formal task status transitions (04-规范 §1/§2/§3).

Agents may only submit events/reports; they can never set a status directly
(04-规范 §3). Transition edges follow 04-规范 §2 state diagram; in addition a
CANCEL event is accepted from every non-terminal state because §3 requires
"取消任务必须记录操作者和原因" (operator + reason are mandatory then).
"""
from __future__ import annotations

import json
import sqlite3
from typing import Any

from .database import audit, json_text, utc_now
from .errors import APIError, invalid_transition, not_found

STATUSES = (
    "DRAFT", "PLANNING", "ARCH_REVIEW", "READY", "DISPATCHED", "IN_PROGRESS",
    "DEV_REPORTED", "GIT_VALIDATING", "CODE_REVIEW", "TEST_ACCEPTANCE", "REWORK",
    "BLOCKED", "ACCEPTED", "CANCELLED",
)

TERMINAL_STATUSES = ("ACCEPTED", "CANCELLED")

# event name -> destination per source status; no direct target_status input exists.
BASE_TRANSITIONS: dict[str, dict[str, str]] = {
    "DRAFT": {"PLAN": "PLANNING"},
    "PLANNING": {"ARCH_REVIEW": "ARCH_REVIEW"},
    "ARCH_REVIEW": {"PASS": "READY", "REWORK": "REWORK", "BLOCKED": "BLOCKED"},
    "REWORK": {"ARCH_REVIEW": "ARCH_REVIEW", "DISPATCH": "DISPATCHED"},
    "READY": {"DISPATCH": "DISPATCHED"},
    "DISPATCHED": {"START": "IN_PROGRESS", "BLOCKED": "BLOCKED"},
    "IN_PROGRESS": {"DEVELOPMENT_COMPLETED": "DEV_REPORTED", "BLOCKED": "BLOCKED"},
    "DEV_REPORTED": {"GIT_VALIDATE": "GIT_VALIDATING"},
    "GIT_VALIDATING": {"PASS": "CODE_REVIEW", "BLOCKED": "BLOCKED"},
    "CODE_REVIEW": {"PASS": "TEST_ACCEPTANCE", "REWORK": "REWORK", "BLOCKED": "BLOCKED"},
    "TEST_ACCEPTANCE": {"PASS": "ACCEPTED", "REWORK": "REWORK", "BLOCKED": "BLOCKED"},
    # 04-规范 §2: BLOCKED has no forward work edges; a blocked task can only
    # be CANCELLED by the owner (CANCEL from any non-terminal state, §3).
    "BLOCKED": {"CANCEL": "CANCELLED"},
}

# 04-规范 §3: cancellation is allowed from any non-terminal state.
for _status, edges in BASE_TRANSITIONS.items():
    if _status not in TERMINAL_STATUSES:
        edges["CANCEL"] = "CANCELLED"

TRANSITIONS: dict[str, dict[str, str]] = BASE_TRANSITIONS


def allowed_events(status: str) -> list[str]:
    return sorted(TRANSITIONS.get(status, {}).keys())


def dependencies_ready(conn: sqlite3.Connection, task_id: str) -> tuple[bool, list[dict[str, str]]]:
    rows = conn.execute(
        """SELECT t.task_id, t.status FROM task_dependencies d
           JOIN tasks t ON t.task_id=d.depends_on_task_id
           WHERE d.task_id=? AND t.status != 'ACCEPTED' ORDER BY t.task_id""",
        (task_id,),
    ).fetchall()
    return not rows, [dict(row) for row in rows]


def assert_dependencies_ready(conn: sqlite3.Connection, task_id: str) -> None:
    ready, pending = dependencies_ready(conn, task_id)
    if not ready:
        raise APIError(
            409,
            "TASK-0002",
            "DEPENDENCY_NOT_READY: every dependency must be ACCEPTED",
            details={"task_id": task_id, "pending_dependencies": pending},
        )


def _check_accepted_evidence(conn: sqlite3.Connection, task_id: str, correlation_id: str | None) -> str:
    """ACCEPTED requires PASS code review and EXECUTED_PASS test evidence (04-规范 §3)."""
    execution = conn.execute(
        "SELECT execution_id FROM task_executions WHERE task_id=? ORDER BY attempt DESC LIMIT 1",
        (task_id,),
    ).fetchone()
    if not execution:
        raise invalid_transition(
            "ACCEPTED requires at least one execution round with review and test evidence",
            details={"task_id": task_id, "reason": "no execution recorded"},
        )
    review = conn.execute(
        """SELECT 1 FROM review_reports
           WHERE task_id=? AND execution_id=? AND result='PASS'""",
        (task_id, execution["execution_id"]),
    ).fetchone()
    test = conn.execute(
        """SELECT 1 FROM test_reports
           WHERE task_id=? AND execution_id=? AND result='PASS'
             AND execution_result='EXECUTED_PASS'""",
        (task_id, execution["execution_id"]),
    ).fetchone()
    if not review or not test:
        raise invalid_transition(
            "ACCEPTED requires PASS code review and EXECUTED_PASS test evidence",
            details={
                "task_id": task_id,
                "execution_id": execution["execution_id"],
                "review_pass": bool(review),
                "executed_test_pass": bool(test),
            },
        )
    return execution["execution_id"]


def apply_event(
    conn: sqlite3.Connection,
    task_id: str,
    event: str,
    event_id: str,
    *,
    actor_id: str,
    actor_type: str,
    correlation_id: str | None,
    details: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Apply one state-transition event. Idempotent by event_id.

    The caller must run this inside an open transaction so the status update,
    the event record and the audit row commit atomically.
    """
    if not isinstance(event, str) or not event:
        raise APIError(400, "REQ-0001", "INVALID_ARGUMENT: event is required")
    if not isinstance(event_id, str) or not event_id.strip():
        raise APIError(400, "REQ-0001", "INVALID_ARGUMENT: event_id is required for idempotency")
    event_id = event_id.strip()
    details = dict(details or {})

    duplicate = conn.execute(
        "SELECT response FROM task_events WHERE event_id=?", (event_id,)
    ).fetchone()
    if duplicate:
        return json.loads(duplicate["response"])

    task = conn.execute("SELECT * FROM tasks WHERE task_id=?", (task_id,)).fetchone()
    if not task:
        raise not_found("task", task_id)
    current = task["status"]
    destination = TRANSITIONS.get(current, {}).get(event)
    if destination is None:
        raise invalid_transition(
            f"{current} does not accept {event}",
            details={"field": "event", "current_status": current, "event": event},
        )

    if destination in {"READY", "DISPATCHED"}:
        assert_dependencies_ready(conn, task_id)

    if destination == "BLOCKED":
        required = ("blocked_reason", "blocked_owner", "unblock_condition")
        missing = [field for field in required if not details.get(field)]
        if missing:
            raise APIError(
                422,
                "REQ-0002",
                "SCHEMA_VALIDATION_FAILED: BLOCKED requires blocked_reason, blocked_owner, unblock_condition",
                details={"fields": [{"field": field, "reason": "required when entering BLOCKED"} for field in missing]},
            )

    if destination == "CANCELLED":
        required = ("cancelled_by", "cancelled_reason")
        missing = [field for field in required if not details.get(field)]
        if missing:
            raise APIError(
                422,
                "REQ-0002",
                "SCHEMA_VALIDATION_FAILED: CANCELLED requires cancelled_by and cancelled_reason",
                details={"fields": [{"field": field, "reason": "required when cancelling"} for field in missing]},
            )

    if destination == "ACCEPTED":
        _check_accepted_evidence(conn, task_id, correlation_id)

    assignments = ["status=?", "updated_at=?"]
    values: list[Any] = [destination, utc_now()]
    if destination == "BLOCKED":
        for field in ("blocked_reason", "blocked_owner", "unblock_condition"):
            assignments.append(f"{field}=?")
            values.append(details[field])
    if destination == "CANCELLED":
        for field in ("cancelled_by", "cancelled_reason"):
            assignments.append(f"{field}=?")
            values.append(details[field])

    conn.execute(f"UPDATE tasks SET {', '.join(assignments)} WHERE task_id=?", (*values, task_id))
    now = utc_now()
    response = {
        "task_id": task_id,
        "event_id": event_id,
        "event": event,
        "from_status": current,
        "to_status": destination,
        "duplicate": False,
        "processed_at": now,
    }
    conn.execute(
        """INSERT INTO task_events(
               event_id, task_id, event, from_status, to_status, actor_id,
               correlation_id, response, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (event_id, task_id, event, current, destination, actor_id, correlation_id, json_text(response), now),
    )
    audit(
        conn,
        actor_id=actor_id,
        actor_type=actor_type,
        action="task_transition",
        target_type="task",
        target_id=task_id,
        correlation_id=correlation_id,
        details={"event": event, "event_id": event_id, "from": current, "to": destination},
    )
    return response
