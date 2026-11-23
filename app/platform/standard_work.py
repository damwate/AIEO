"""The Standard task pool and review FIFO. Mutations require Database.transaction()."""
from __future__ import annotations

from graphlib import CycleError, TopologicalSorter
from hashlib import sha256
import json
from typing import Literal

from pydantic import BaseModel, Field

from . import registry, tasks
from .database import json_text, utc_now
from .errors import bad_request, conflict, not_found
from .schemas import BatchCreate, TaskCreate
from .state_machine import apply_event


class Step(BaseModel):
    key: str = Field(min_length=1, max_length=80)
    title: str = Field(min_length=1, max_length=300)
    base_commit: str = Field(pattern=r"^[a-f0-9]{40}$")
    acceptance_criteria: list[str] = Field(min_length=1)
    files_scope: list[str] = Field(default_factory=list)
    dependencies: list[str] = Field(default_factory=list)


class Plan(BatchCreate):
    plan_id: str = Field(min_length=1, max_length=100)
    version: str = Field(min_length=1, max_length=100)
    steps: list[Step] = Field(min_length=1, max_length=100)


class PriorityChange(BaseModel):
    expected_victim: str | None = None


class Checkpoint(BaseModel):
    execution_id: str
    reference: str = Field(min_length=1, max_length=2000)


class ExecutionCommand(BaseModel):
    execution_id: str


class ReviewRequest(BaseModel):
    execution_id: str
    round_id: str = Field(pattern=r"^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,99}$")
    purpose: Literal["planning", "review", "acceptance"]
    message: str = Field(min_length=1, max_length=1200)


ORDER = "urgent_order DESC NULLS LAST, seq"


def record(conn, operation, object_id, detail):
    conn.execute(
        "INSERT INTO standard_journal(operation, object_id, detail, committed_at) VALUES (?,?,?,?)",
        (operation, object_id, json_text(detail), utc_now()),
    )


def entry(conn, task_id):
    row = conn.execute("SELECT * FROM standard_tasks WHERE task_id=?", (task_id,)).fetchone()
    if row is None:
        raise not_found("standard task", task_id)
    return row


def approve(conn, body, principal, correlation_id):
    digest = sha256(json_text(body.model_dump()).encode()).hexdigest()
    previous = conn.execute(
        "SELECT * FROM standard_plans WHERE plan_id=? AND version=?", (body.plan_id, body.version)
    ).fetchone()
    if previous:
        if previous["digest"] != digest:
            raise conflict("approved plan version has different content")
        return plan_view(conn, previous["batch_id"])

    steps = {step.key: step for step in body.steps}
    if len(steps) != len(body.steps):
        raise bad_request("duplicate plan step key")
    for step in body.steps:
        for path in step.files_scope:
            if not path or path.startswith("/") or "\\" in path or ":" in path or ".." in path.split("/"):
                raise bad_request(f"invalid file scope for {step.key}")
        if not all(item.strip() for item in step.acceptance_criteria):
            raise bad_request(f"empty acceptance criterion for {step.key}")
        if set(step.dependencies) - steps.keys() or len(set(step.dependencies)) != len(step.dependencies):
            raise bad_request(f"invalid dependencies for {step.key}")
    try:
        order = tuple(TopologicalSorter({key: step.dependencies for key, step in steps.items()}).static_order())
    except CycleError as error:
        raise bad_request("plan contains a dependency cycle") from error

    batch = registry.create_batch(conn, body, principal, correlation_id)
    ids = {}
    for key in order:
        step = steps[key]
        task = tasks.create_task(conn, TaskCreate(
            batch_id=batch["batch_id"], title=step.title, files_scope=step.files_scope,
            acceptance_criteria=step.acceptance_criteria,
            engineering_standard_version=body.engineering_standard_version,
            knowledge_base_commit=body.knowledge_base_commit,
            dependencies=[ids[dep] for dep in step.dependencies],
        ), principal, correlation_id)
        ids[key] = task["task_id"]
    conn.executemany(
        "INSERT INTO standard_tasks(task_id, base_commit) VALUES (?,?)",
        [(ids[step.key], step.base_commit) for step in body.steps],
    )
    conn.execute("INSERT INTO standard_plans VALUES (?,?,?,?,?)",
                 (body.plan_id, body.version, digest, batch["batch_id"], principal.actor_id))
    record(conn, "PLAN_APPROVED", batch["batch_id"], {"steps": ids, "actor": principal.actor_id})
    return plan_view(conn, batch["batch_id"])


def plan_view(conn, batch_id):
    return {
        "batch_id": batch_id,
        "task_ids": [row[0] for row in conn.execute(
            "SELECT s.task_id FROM standard_tasks s JOIN tasks t USING(task_id) WHERE t.batch_id=? ORDER BY s.seq",
            (batch_id,),
        )],
    }


def dependency_outputs(conn, task_id):
    dependencies = conn.execute("""
        SELECT t.task_id, t.status, s.execution_id
        FROM task_dependencies d JOIN tasks t ON t.task_id=d.depends_on_task_id
        LEFT JOIN standard_tasks s ON s.task_id=t.task_id WHERE d.task_id=?
    """, (task_id,)).fetchall()
    result = {}
    for dep in dependencies:
        if dep["status"] != "ACCEPTED":
            return None
        commits = conn.execute("""
            SELECT DISTINCT r.reviewed_commit FROM review_reports r JOIN test_reports t
            ON t.execution_id=r.execution_id AND t.commit_sha=r.reviewed_commit
            WHERE r.execution_id=? AND r.result='PASS' AND t.result='PASS'
            AND t.execution_result='EXECUTED_PASS'
        """, (dep["execution_id"],)).fetchall()
        if len(commits) != 1:
            return None
        result[dep["task_id"]] = commits[0][0]
    return result


def candidates(conn):
    return [row for row in conn.execute(f"""
        SELECT s.*, t.title, t.batch_id, t.status, b.project_id FROM standard_tasks s
        JOIN tasks t USING(task_id) JOIN batches b USING(batch_id)
        WHERE s.phase!='CLOSED' AND t.status!='CANCELLED' ORDER BY {ORDER}
    """)]


def occupied(conn):
    return conn.execute(
        "SELECT count(*) FROM standard_tasks WHERE phase IN ('ACTIVE','DRAINING','RESERVED')"
    ).fetchone()[0]


def next_task(conn):
    reservations = {row[0] for row in conn.execute(
        "SELECT next_task_id FROM standard_tasks WHERE phase='DRAINING'"
    )}
    return next((row for row in candidates(conn)
                 if row["phase"] in ("WAITING", "PAUSED", "RESERVED") and row["task_id"] not in reservations
                 and dependency_outputs(conn, row["task_id"]) is not None), None)


def claim(conn, task_id, body, principal, correlation_id, settings, logger=None):
    managed = conn.execute("SELECT * FROM standard_tasks WHERE task_id=?", (task_id,)).fetchone()
    if not managed:
        return tasks.claim_task(conn, task_id, body, principal, correlation_id, settings, logger)
    if settings.env != "test":
        raise conflict("standard execution requires isolated test mode until 906⑥ authorization")
    if principal.kind == "service" and (
        principal.agent_type != "developer" or principal.agent_id != body.agent_id
    ):
        raise conflict("service must claim with its own agent identity")
    status = tasks.get_task(conn, task_id)["status"]
    rework = managed["phase"] == "ACTIVE" and status == "REWORK"
    candidate = next_task(conn)
    if not rework and (candidate is None or candidate["task_id"] != task_id or
                       managed["phase"] not in ("WAITING", "RESERVED")):
        raise conflict("task is not the next eligible unclaimed task")
    if rework and review_pending(conn, task_id):
        raise conflict("review round has not been reconciled")
    if not rework and managed["phase"] != "RESERVED" and occupied(conn) >= settings.standard_limit:
        raise conflict("standard task capacity is full")
    inputs = dependency_outputs(conn, task_id)
    if inputs is None:
        raise conflict("dependencies no longer have accepted outputs")
    if rework and conn.execute("SELECT base_commit FROM task_executions WHERE execution_id=?",
                              (managed["execution_id"],)).fetchone()[0] != body.base_commit:
        raise conflict("rework must retain its execution base")
    if len(set(inputs.values())) <= 1:
        allowed = set(inputs.values()) or {managed["base_commit"]}
        if allowed != {body.base_commit}:
            raise conflict("base commit must match the approved base or accepted dependency commit")
    elif body.base_commit != managed["base_commit"]:
        raise conflict("integration task must use the approved base and consume the bound dependency commits")
    for _ in range(3):
        current = tasks.get_task(conn, task_id)["status"]
        event = {"DRAFT": "PLAN", "PLANNING": "ARCH_REVIEW", "REWORK": "ARCH_REVIEW",
                 "ARCH_REVIEW": "PASS"}.get(current)
        if event is None:
            break
        apply_event(conn, task_id, event, f"STD-{task_id}-{managed['execution_id'] or 'initial'}-{current}", actor_id=principal.actor_id,
                    actor_type=principal.actor_type, correlation_id=correlation_id)
    if rework:
        conn.execute("UPDATE task_executions SET status='FAILED', ended_at=? WHERE execution_id=?",
                     (utc_now(), managed["execution_id"]))
    conn.execute("UPDATE standard_tasks SET phase='ACTIVE' WHERE task_id=?", (task_id,))
    result = tasks.claim_task(conn, task_id, body, principal, correlation_id, settings, logger)
    conn.execute("UPDATE standard_tasks SET execution_id=? WHERE task_id=?",
                 (result["execution_id"], task_id))
    record(conn, "CLAIMED", task_id, {"execution_id": result["execution_id"], "inputs": inputs})
    task = result["task"]
    project = registry.get_batch(conn, task["batch_id"])["project_id"]
    return {**result, "dependency_commits": inputs, "project_id": project, "batch_id": task["batch_id"]}


def preview(conn, task_id, limit):
    target = entry(conn, task_id)
    if target["phase"] != "WAITING" or dependency_outputs(conn, task_id) is None:
        raise conflict("only a ready waiting task may be promoted")
    rows = candidates(conn)
    if any(row["phase"] in ("DRAINING", "RESERVED") for row in rows):
        raise conflict("an urgent handoff is already in progress")
    victim = None
    if occupied(conn) >= limit:
        victim = next((row["task_id"] for row in reversed(rows) if row["phase"] == "ACTIVE"), None)
        if victim is None:
            raise conflict("no active task is available to pause")
    return {"task_id": task_id, "victim": victim}


def promote(conn, task_id, body, limit, actor):
    result = preview(conn, task_id, limit)
    if result["victim"] != body.expected_victim:
        raise conflict("victim changed; refresh the urgent preview")
    conn.execute("""UPDATE standard_tasks SET urgent_order=
                 (SELECT coalesce(max(urgent_order),0)+1 FROM standard_tasks) WHERE task_id=?""", (task_id,))
    if result["victim"]:
        conn.execute("UPDATE standard_tasks SET phase='DRAINING', next_task_id=? WHERE task_id=?",
                     (task_id, result["victim"]))
    record(conn, "PROMOTED", task_id, {**result, "actor": actor})
    return result


def review_pending(conn, task_id):
    return conn.execute("SELECT 1 FROM standard_reviews WHERE task_id=? AND state!='DONE'",
                        (task_id,)).fetchone() is not None


def pause(conn, task_id, body, actor):
    row = entry(conn, task_id)
    if row["phase"] != "DRAINING" or row["execution_id"] != body.execution_id:
        raise conflict("stale or unavailable pause")
    if review_pending(conn, task_id):
        raise conflict("review round has not been reconciled")
    conn.execute("""UPDATE standard_tasks SET phase='PAUSED', checkpoint=?, next_task_id=NULL
                 WHERE task_id=?""", (body.reference, task_id))
    conn.execute("UPDATE standard_tasks SET phase='RESERVED' WHERE task_id=? AND phase='WAITING'",
                 (row["next_task_id"],))
    record(conn, "PAUSED", task_id, {"execution_id": body.execution_id, "checkpoint": body.reference,
                                      "actor": actor, "next_task_id": row["next_task_id"]})
    return {"phase": "PAUSED"}


def resume(conn, task_id, body, limit, actor):
    row = entry(conn, task_id)
    candidate = next_task(conn)
    if row["phase"] != "PAUSED" or row["execution_id"] != body.execution_id or (
        candidate is None or candidate["task_id"] != task_id or occupied(conn) >= limit
    ):
        raise conflict("paused task is not eligible to resume")
    conn.execute("UPDATE standard_tasks SET phase='ACTIVE' WHERE task_id=?", (task_id,))
    record(conn, "RESUMED", task_id, {"execution_id": body.execution_id, "actor": actor})
    return {"phase": "ACTIVE", "checkpoint": row["checkpoint"]}


def recycle(conn, task_id, execution_id, actor):
    row = entry(conn, task_id)
    if row["phase"] == "CLOSED" and row["execution_id"] == execution_id:
        return {"phase": "CLOSED"}
    if row["execution_id"] != execution_id or tasks.get_task(conn, task_id)["status"] != "ACCEPTED":
        raise conflict("agent recycling requires the accepted execution")
    if review_pending(conn, task_id):
        raise conflict("review round has not been reconciled")
    if row["next_task_id"]:
        conn.execute("UPDATE standard_tasks SET phase='RESERVED' WHERE task_id=? AND phase='WAITING'",
                     (row["next_task_id"],))
    conn.execute("UPDATE standard_tasks SET phase='CLOSED', next_task_id=NULL WHERE task_id=?", (task_id,))
    conn.execute("UPDATE task_executions SET status='COMPLETED', ended_at=? WHERE execution_id=?",
                 (utc_now(), execution_id))
    record(conn, "RECYCLED", task_id, {"execution_id": execution_id, "actor": actor})
    return {"phase": "CLOSED"}


def enqueue_review(conn, task_id, body):
    values = (task_id, body.round_id, body.execution_id, body.purpose, body.message)
    row = conn.execute("SELECT * FROM standard_reviews WHERE task_id=? AND round_id=?", values[:2]).fetchone()
    if row:
        if (row["execution_id"], row["purpose"], row["message"]) != values[2:]:
            raise conflict("review key already refers to different content")
        return {"seq": row["seq"], "state": row["state"]}
    task = entry(conn, task_id)
    if task["phase"] != "ACTIVE" or task["execution_id"] != body.execution_id:
        raise conflict("review requires an active execution")
    if not body.message.strip() or len(body.message.encode("utf-8")) > 1200:
        raise bad_request("review message must contain 1–1200 UTF-8 bytes")
    seq = conn.execute(
        "INSERT INTO standard_reviews(task_id,round_id,execution_id,purpose,message) VALUES (?,?,?,?,?)", values
    ).lastrowid
    record(conn, "REVIEW_QUEUED", str(seq), {"task_id": task_id, "round_id": body.round_id})
    return {"seq": seq, "state": "QUEUED"}


def review_status(conn, task_id, round_id):
    row = conn.execute("""
        SELECT seq, execution_id, state, purpose, evidence
        FROM standard_reviews WHERE task_id=? AND round_id=?
    """, (task_id, round_id)).fetchone()
    if row is None:
        raise not_found("standard review round", round_id)
    return {**dict(row), "evidence": json.loads(row["evidence"]) if row["evidence"] else None}


def snapshot(conn, limit):
    return {
        "limit": limit, "occupied": occupied(conn),
        "tasks": [{**dict(row), "dependency_commits": dependency_outputs(conn, row["task_id"])}
                  for row in candidates(conn)],
        "reviews": [dict(row) for row in conn.execute("""
            SELECT seq, task_id, round_id, purpose, state FROM standard_reviews
            WHERE state!='DONE' ORDER BY seq
        """)],
        "batches": [dict(row) for row in conn.execute("""
            SELECT p.batch_id,p.plan_id,p.version,count(*) AS total,sum(t.status='ACCEPTED') AS accepted
            FROM standard_plans p JOIN tasks t USING(batch_id) GROUP BY p.batch_id
        """)],
    }
