"""Task services: CRUD, dependencies, state events, claim (C1 §2.3 task endpoints)."""
from __future__ import annotations

import hashlib
import json
import sqlite3
from typing import Any
from uuid import uuid4

from .database import audit, json_text, next_scoped_id, utc_now
from .errors import bad_request, conflict, invalid_transition, not_found, task_already_claimed
from .logging_setup import PlatformLogger
from .messaging import PLATFORM_AGENT_ID, register_outbox_message
from .schemas import ClaimRequest, TaskCreate, TaskEventIn
from .security import Principal
from .state_machine import allowed_events, apply_event, dependencies_ready


def _compute_task_package_hash(body: TaskCreate) -> str:
    """Freeze the task package content hash at creation (04-规范 §7)."""
    canonical = {
        "batch_id": body.batch_id,
        "parent_id": body.parent_id,
        "title": body.title,
        "description": body.description,
        "priority": body.priority,
        "weight": body.weight,
        "files_scope": body.files_scope,
        "acceptance_criteria": body.acceptance_criteria,
        "engineering_standard_items": body.engineering_standard_items,
        "engineering_standard_version": body.engineering_standard_version,
        "knowledge_base_commit": body.knowledge_base_commit,
    }
    return hashlib.sha256(json.dumps(canonical, ensure_ascii=False, sort_keys=True,
                                     separators=(",", ":")).encode("utf-8")).hexdigest()


def create_task(conn: sqlite3.Connection, body: TaskCreate, principal: Principal,
                correlation_id: str | None) -> dict:
    batch = conn.execute("SELECT * FROM batches WHERE batch_id=?", (body.batch_id,)).fetchone()
    if not batch:
        raise not_found("batch", body.batch_id)
    if body.parent_id and not conn.execute("SELECT 1 FROM tasks WHERE task_id=?", (body.parent_id,)).fetchone():
        raise not_found("parent task", body.parent_id)
    for dep in body.dependencies:
        if not conn.execute("SELECT 1 FROM tasks WHERE task_id=?", (dep,)).fetchone():
            raise not_found("dependency task", dep)
    if len(set(body.dependencies)) != len(body.dependencies):
        raise bad_request("duplicate dependency entries", details={"field": "dependencies"})

    task_id = next_scoped_id(conn, "tasks", "task_id", "T-P1-")
    now = utc_now()
    conn.execute(
        """INSERT INTO tasks(task_id, batch_id, parent_id, title, description, status,
               priority, weight, files_scope, acceptance_criteria, engineering_standard_items,
               task_package_hash, engineering_standard_version, knowledge_base_commit,
               created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (task_id, body.batch_id, body.parent_id, body.title, body.description,
         body.priority, body.weight,
         json_text(body.files_scope), json_text(body.acceptance_criteria),
         json_text(body.engineering_standard_items),
         _compute_task_package_hash(body), body.engineering_standard_version,
         body.knowledge_base_commit, now, now),
    )
    for dep in set(body.dependencies):
        conn.execute(
            "INSERT INTO task_dependencies(task_id, depends_on_task_id) VALUES (?, ?)",
            (task_id, dep),
        )
    audit(conn, actor_id=principal.actor_id, actor_type=principal.actor_type,
          action="task_created", target_type="task", target_id=task_id,
          correlation_id=correlation_id,
          details={"batch_id": body.batch_id, "parent_id": body.parent_id,
                   "dependencies": sorted(set(body.dependencies))})
    return get_task(conn, task_id)


def _task_view(conn: sqlite3.Connection, row: sqlite3.Row) -> dict:
    task = dict(row)
    for field in ("files_scope", "acceptance_criteria", "engineering_standard_items"):
        task[field] = json.loads(task[field])
    task["dependencies"] = [
        {"depends_on_task_id": r["depends_on_task_id"], "status": r["status"]}
        for r in conn.execute(
            """SELECT d.depends_on_task_id, t.status FROM task_dependencies d
               JOIN tasks t ON t.task_id=d.depends_on_task_id
               WHERE d.task_id=? ORDER BY d.depends_on_task_id""",
            (task["task_id"],),
        ).fetchall()
    ]
    latest = conn.execute(
        "SELECT * FROM task_executions WHERE task_id=? ORDER BY attempt DESC LIMIT 1",
        (task["task_id"],),
    ).fetchone()
    task["latest_execution"] = dict(latest) if latest else None
    task["allowed_events"] = allowed_events(task["status"])
    return task


def get_task(conn: sqlite3.Connection, task_id: str) -> dict:
    row = conn.execute("SELECT * FROM tasks WHERE task_id=?", (task_id,)).fetchone()
    if not row:
        raise not_found("task", task_id)
    return _task_view(conn, row)


def list_tasks(conn: sqlite3.Connection, *, batch_id: str | None, status: str | None,
               parent_id: str | None, page: int, page_size: int, offset: int,
               sort_clause: str) -> tuple[list[dict], int]:
    clauses, params = [], []
    if batch_id:
        clauses.append("batch_id=?")
        params.append(batch_id)
    if status:
        clauses.append("status=?")
        params.append(status)
    if parent_id:
        clauses.append("parent_id=?")
        params.append(parent_id)
    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
    total = conn.execute(f"SELECT COUNT(*) AS c FROM tasks {where}", params).fetchone()["c"]
    rows = conn.execute(
        f"SELECT * FROM tasks {where} ORDER BY {sort_clause} LIMIT ? OFFSET ?",
        (*params, page_size, offset),
    ).fetchall()
    return [_task_view(conn, row) for row in rows], total


def list_dependencies(conn: sqlite3.Connection, task_id: str) -> dict:
    if not conn.execute("SELECT 1 FROM tasks WHERE task_id=?", (task_id,)).fetchone():
        raise not_found("task", task_id)
    ready, pending = dependencies_ready(conn, task_id)
    rows = conn.execute(
        """SELECT d.depends_on_task_id, t.status, t.title FROM task_dependencies d
           JOIN tasks t ON t.task_id=d.depends_on_task_id
           WHERE d.task_id=? ORDER BY d.depends_on_task_id""",
        (task_id,),
    ).fetchall()
    return {
        "task_id": task_id,
        "dependencies": [dict(row) for row in rows],
        "dependencies_satisfied": ready,
        "pending": pending,
    }


def submit_event(conn: sqlite3.Connection, task_id: str, body: TaskEventIn, principal: Principal,
                 correlation_id: str | None) -> dict:
    details = {
        "blocked_reason": body.blocked_reason,
        "blocked_owner": body.blocked_owner,
        "unblock_condition": body.unblock_condition,
        "cancelled_by": body.cancelled_by or principal.actor_id,
        "cancelled_reason": body.cancelled_reason,
    }
    return apply_event(
        conn, task_id, body.event, body.event_id,
        actor_id=principal.actor_id, actor_type=principal.actor_type,
        correlation_id=correlation_id, details=details,
    )


def claim_task(conn: sqlite3.Connection, task_id: str, body: ClaimRequest, principal: Principal,
               correlation_id: str | None, settings: Any = None,
               logger: PlatformLogger | None = None) -> dict:
    task = conn.execute("SELECT * FROM tasks WHERE task_id=?", (task_id,)).fetchone()
    if not task:
        raise not_found("task", task_id)
    if task["status"] != "READY":
        running = conn.execute(
            "SELECT 1 FROM task_executions WHERE task_id=? AND status='RUNNING'", (task_id,)
        ).fetchone()
        if running or task["status"] == "DISPATCHED":
            raise task_already_claimed(
                f"task {task_id} is not claimable (status={task['status']})",
                details={"task_id": task_id, "status": task["status"]},
            )
        raise invalid_transition(
            f"task {task_id} must be READY to claim (status={task['status']})",
            details={"task_id": task_id, "status": task["status"]},
        )

    agent = conn.execute("SELECT * FROM agents WHERE agent_id=?", (body.agent_id,)).fetchone()
    if not agent:
        raise not_found("agent", body.agent_id)
    if not agent["enabled"]:
        raise conflict(f"agent {body.agent_id} is disabled", details={"field": "agent_id"})

    attempt_row = conn.execute(
        "SELECT COALESCE(MAX(attempt), 0) AS a FROM task_executions WHERE task_id=?", (task_id,)
    ).fetchone()
    attempt = attempt_row["a"] + 1
    execution_id = next_scoped_id(conn, "task_executions", "execution_id", "EXEC-")
    now = utc_now()
    conn.execute(
        """INSERT INTO task_executions(execution_id, task_id, agent_id, attempt, base_commit,
               status, started_at, created_at)
           VALUES (?, ?, ?, ?, ?, 'RUNNING', ?, ?)""",
        (execution_id, task_id, body.agent_id, attempt, body.base_commit, now, now),
    )

    transition = apply_event(
        conn, task_id, "DISPATCH", f"EVT-CLAIM-{uuid4().hex}",
        actor_id=principal.actor_id, actor_type=principal.actor_type,
        correlation_id=correlation_id,
        details={"claimed_by": body.agent_id, "execution_id": execution_id},
    )

    batch = conn.execute("SELECT * FROM batches WHERE batch_id=?", (task["batch_id"],)).fetchone()
    correlation = correlation_id or str(uuid4())
    message = register_outbox_message(
        conn,
        message_type="TASK_ASSIGNED",
        source_agent_id=PLATFORM_AGENT_ID,
        target_agent_id=body.agent_id,
        project_id=batch["project_id"],
        batch_id=task["batch_id"],
        task_id=task_id,
        correlation_id=correlation,
        payload={
            "task_id": task_id,
            "execution_id": execution_id,
            "attempt": attempt,
            "base_commit": body.base_commit,
            "task_package_hash": task["task_package_hash"],
            "title": task["title"],
        },
        actor_id=principal.actor_id,
        actor_type=principal.actor_type,
        max_retries=None,
        logger=logger,
        settings=settings,
    )
    audit(conn, actor_id=principal.actor_id, actor_type=principal.actor_type,
          action="claim_task", target_type="task", target_id=task_id,
          correlation_id=correlation,
          details={"agent_id": body.agent_id, "execution_id": execution_id,
                   "attempt": attempt, "base_commit": body.base_commit})
    return {
        "task": get_task(conn, task_id),
        "execution_id": execution_id,
        "attempt": attempt,
        "transition": transition,
        "dispatch_message_id": message["message_id"],
    }
