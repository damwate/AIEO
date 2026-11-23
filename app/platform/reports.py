"""Reports, artifacts, git commits, and audit queries (C1 §2.3 report/artifact/git/audit)."""
from __future__ import annotations

import hashlib
import json
import re
import sqlite3
from typing import Any

from .database import audit, json_text, next_scoped_id, utc_now
from .errors import (
    artifact_hash_mismatch,
    artifact_not_found,
    bad_request,
    conflict,
    duplicate_message,
    git_base_mismatch,
    invalid_transition,
    not_found,
)
from .logging_setup import PlatformLogger
from .schemas import ArtifactCreate, CommitCreate, DevReportIn, ReviewReportIn, TestReportIn
from .security import Principal
from .state_machine import apply_event

_ABSOLUTE_PATH = re.compile(r"^([A-Za-z]:|/|\\)")
ARTIFACT_PURPOSE = {
    "TEST_LOG": "TEST",
    "DEV_REPORT": "DEV",
    "REVIEW_EVIDENCE": "REV",
    "DIFF": "DIFF",
    "ATTACHMENT": "ATT",
    "OTHER": "OTH",
}


def _require_execution(conn: sqlite3.Connection, task_id: str, execution_id: str) -> sqlite3.Row:
    execution = conn.execute(
        "SELECT * FROM task_executions WHERE execution_id=?", (execution_id,)
    ).fetchone()
    if not execution:
        raise not_found("execution", execution_id)
    if execution["task_id"] != task_id:
        raise bad_request(
            f"execution {execution_id} does not belong to task {task_id}",
            details={"field": "execution_id"},
        )
    return execution


def _blocked_fields(body) -> dict[str, Any]:
    return {
        "blocked_reason": body.blocked_reason,
        "blocked_owner": body.blocked_owner,
        "unblock_condition": body.unblock_condition,
    }


def register_dev_report(conn: sqlite3.Connection, body: DevReportIn, principal: Principal,
                        correlation_id: str | None, logger: PlatformLogger | None) -> dict:
    execution = _require_execution(conn, body.task_id, body.execution_id)
    existing = conn.execute(
        "SELECT * FROM development_reports WHERE execution_id=?", (body.execution_id,)
    ).fetchone()
    if existing:
        raise duplicate_message(
            f"development report for execution {body.execution_id} already registered",
            details={"execution_id": body.execution_id, "created_at": existing["created_at"]},
        )
    task = conn.execute("SELECT * FROM tasks WHERE task_id=?", (body.task_id,)).fetchone()
    if not task:
        raise not_found("task", body.task_id)

    transition = None
    if body.status == "COMPLETED":
        if task["status"] == "IN_PROGRESS":
            transition = apply_event(
                conn, body.task_id, "DEVELOPMENT_COMPLETED", f"EVT-DEV-{body.execution_id}",
                actor_id=principal.actor_id, actor_type=principal.actor_type,
                correlation_id=correlation_id,
                details={"execution_id": body.execution_id},
            )
        elif task["status"] != "DEV_REPORTED":
            raise invalid_transition(
                f"development report requires IN_PROGRESS (task is {task['status']})",
                details={"task_id": body.task_id, "status": task["status"]},
            )
    else:  # BLOCKED
        if task["status"] == "IN_PROGRESS":
            transition = apply_event(
                conn, body.task_id, "BLOCKED", f"EVT-DEV-{body.execution_id}",
                actor_id=principal.actor_id, actor_type=principal.actor_type,
                correlation_id=correlation_id, details=_blocked_fields(body),
            )
        elif task["status"] != "BLOCKED":
            raise invalid_transition(
                f"blocked development report requires IN_PROGRESS (task is {task['status']})",
                details={"task_id": body.task_id, "status": task["status"]},
            )

    now = utc_now()
    payload = json_text(body.model_dump())
    conn.execute(
        """INSERT INTO development_reports(execution_id, task_id, status, payload, created_at)
           VALUES (?, ?, ?, ?, ?)""",
        (body.execution_id, body.task_id, body.status, payload, now),
    )
    audit(conn, actor_id=principal.actor_id, actor_type=principal.actor_type,
          action="report_registered", target_type="development_report",
          target_id=body.execution_id, correlation_id=correlation_id,
          details={"task_id": body.task_id, "report_status": body.status})
    if logger:
        logger.info("development_report_registered",
                    f"development report for {body.execution_id} registered",
                    task_id=body.task_id, execution_id=body.execution_id,
                    operation="register_dev_report", result="SUCCESS")
    return {
        "task_id": body.task_id,
        "execution_id": body.execution_id,
        "status": body.status,
        "transition": transition,
        "created_at": now,
        "duplicate": False,
    }


def register_review_report(conn: sqlite3.Connection, body: ReviewReportIn, principal: Principal,
                           correlation_id: str | None, logger: PlatformLogger | None) -> dict:
    execution = _require_execution(conn, body.task_id, body.execution_id)
    if not conn.execute("SELECT 1 FROM agents WHERE agent_id=?", (body.reviewer,)).fetchone():
        raise not_found("agent", body.reviewer)
    existing = conn.execute(
        "SELECT * FROM review_reports WHERE execution_id=? AND reviewed_commit=?",
        (body.execution_id, body.reviewed_commit),
    ).fetchone()
    if existing:
        raise duplicate_message(
            f"review report for ({body.execution_id}, {body.reviewed_commit[:12]}..) already registered",
            details={"execution_id": body.execution_id, "created_at": existing["created_at"]},
        )
    task = conn.execute("SELECT * FROM tasks WHERE task_id=?", (body.task_id,)).fetchone()
    if not task:
        raise not_found("task", body.task_id)
    # Version binding (03-协议 §10): the reviewed package hash must match the task's frozen hash.
    if body.task_package_hash != task["task_package_hash"]:
        raise bad_request(
            "review task_package_hash does not match the task package hash; re-review required",
            details={"field": "task_package_hash",
                     "expected": task["task_package_hash"], "got": body.task_package_hash},
        )

    transition = None
    if task["status"] == "CODE_REVIEW":
        event = body.result  # PASS -> TEST_ACCEPTANCE, REWORK -> REWORK, BLOCKED -> BLOCKED
        details: dict[str, Any] = {"reviewed_commit": body.reviewed_commit}
        if body.result == "BLOCKED":
            details.update(_blocked_fields(body))
        transition = apply_event(
            conn, body.task_id, event, f"EVT-REVIEW-{body.execution_id}-{body.reviewed_commit[:12]}",
            actor_id=principal.actor_id, actor_type=principal.actor_type,
            correlation_id=correlation_id, details=details,
        )
    elif not (task["status"] in {"TEST_ACCEPTANCE", "REWORK"} and body.result in {"PASS", "REWORK"}):
        raise invalid_transition(
            f"review report requires CODE_REVIEW (task is {task['status']})",
            details={"task_id": body.task_id, "status": task["status"]},
        )

    now = utc_now()
    conn.execute(
        """INSERT INTO review_reports(task_id, execution_id, reviewed_commit, reviewer_agent_id,
               result, task_package_hash, base_commit, engineering_standard_version,
               knowledge_base_commit, payload, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (body.task_id, body.execution_id, body.reviewed_commit, body.reviewer, body.result,
         body.task_package_hash, body.base_commit, body.engineering_standard_version,
         body.knowledge_base_commit, json_text(body.model_dump()), now),
    )
    audit(conn, actor_id=principal.actor_id, actor_type=principal.actor_type,
          action="report_registered", target_type="review_report",
          target_id=body.execution_id, correlation_id=correlation_id,
          details={"task_id": body.task_id, "result": body.result,
                   "reviewed_commit": body.reviewed_commit})
    if logger:
        logger.info("review_report_registered",
                    f"review report for {body.execution_id} registered ({body.result})",
                    task_id=body.task_id, execution_id=body.execution_id,
                    commit_sha=body.reviewed_commit,
                    operation="register_review_report", result="SUCCESS")
    return {
        "task_id": body.task_id,
        "execution_id": body.execution_id,
        "reviewed_commit": body.reviewed_commit,
        "result": body.result,
        "transition": transition,
        "created_at": now,
        "duplicate": False,
    }


def register_test_report(conn: sqlite3.Connection, body: TestReportIn, principal: Principal,
                         correlation_id: str | None, logger: PlatformLogger | None) -> dict:
    execution = _require_execution(conn, body.task_id, body.execution_id)
    if body.artifact_id and not conn.execute(
        "SELECT 1 FROM artifacts WHERE artifact_id=?", (body.artifact_id,)
    ).fetchone():
        raise artifact_not_found(body.artifact_id)
    existing = conn.execute(
        "SELECT * FROM test_reports WHERE execution_id=? AND commit_sha=?",
        (body.execution_id, body.commit_sha),
    ).fetchone()
    if existing:
        raise duplicate_message(
            f"test report for ({body.execution_id}, {body.commit_sha[:12]}..) already registered",
            details={"execution_id": body.execution_id, "created_at": existing["created_at"]},
        )
    task = conn.execute("SELECT * FROM tasks WHERE task_id=?", (body.task_id,)).fetchone()
    if not task:
        raise not_found("task", body.task_id)
    if body.result == "PASS" and body.execution_result != "EXECUTED_PASS":
        raise bad_request(
            "test PASS requires execution_result EXECUTED_PASS (claims are not evidence, 03-协议 §8)",
            details={"field": "execution_result", "got": body.execution_result},
        )

    transition = None
    if task["status"] == "TEST_ACCEPTANCE":
        details: dict[str, Any] = {"commit_sha": body.commit_sha}
        if body.result == "BLOCKED":
            details["blocked_reason"] = body.payload.get("blocked_reason")
            details["blocked_owner"] = body.payload.get("blocked_owner")
            details["unblock_condition"] = body.payload.get("unblock_condition")
    elif not (task["status"] == "ACCEPTED" and body.result == "PASS"):
        raise invalid_transition(
            f"test report requires TEST_ACCEPTANCE (task is {task['status']})",
            details={"task_id": body.task_id, "status": task["status"]},
        )

    # Insert the evidence row before the ACCEPTED transition so the state
    # machine's evidence check can see it; everything commits or rolls back
    # in the same transaction.
    now = utc_now()
    conn.execute(
        """INSERT INTO test_reports(task_id, execution_id, commit_sha, execution_result,
               result, artifact_id, payload, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (body.task_id, body.execution_id, body.commit_sha, body.execution_result,
         body.result, body.artifact_id, json_text(body.model_dump()), now),
    )
    if task["status"] == "TEST_ACCEPTANCE":
        details: dict[str, Any] = {"commit_sha": body.commit_sha}
        if body.result == "BLOCKED":
            details["blocked_reason"] = body.payload.get("blocked_reason")
            details["blocked_owner"] = body.payload.get("blocked_owner")
            details["unblock_condition"] = body.payload.get("unblock_condition")
        transition = apply_event(
            conn, body.task_id, body.result, f"EVT-TEST-{body.execution_id}-{body.commit_sha[:12]}",
            actor_id=principal.actor_id, actor_type=principal.actor_type,
            correlation_id=correlation_id, details=details,
        )
    audit(conn, actor_id=principal.actor_id, actor_type=principal.actor_type,
          action="report_registered", target_type="test_report",
          target_id=body.execution_id, correlation_id=correlation_id,
          details={"task_id": body.task_id, "result": body.result,
                   "execution_result": body.execution_result, "commit_sha": body.commit_sha})
    if logger:
        logger.info("test_report_registered",
                    f"test report for {body.execution_id} registered ({body.result})",
                    task_id=body.task_id, execution_id=body.execution_id,
                    commit_sha=body.commit_sha,
                    operation="register_test_report", result="SUCCESS")
    return {
        "task_id": body.task_id,
        "execution_id": body.execution_id,
        "commit_sha": body.commit_sha,
        "execution_result": body.execution_result,
        "result": body.result,
        "transition": transition,
        "created_at": now,
        "duplicate": False,
    }


def list_reports(conn: sqlite3.Connection, *, task_id: str | None, report_type: str | None,
                 page: int, page_size: int, offset: int) -> tuple[list[dict], int]:
    items: list[dict] = []
    wanted = {report_type} if report_type else {"development", "review", "test"}
    if "development" in wanted:
        rows = conn.execute(
            "SELECT execution_id, task_id, status, payload, created_at FROM development_reports "
            + ("WHERE task_id=? " if task_id else "")
            + "ORDER BY created_at DESC",
            (task_id,) if task_id else (),
        ).fetchall()
        for row in rows:
            items.append({"type": "development", "task_id": row["task_id"],
                          "execution_id": row["execution_id"], "result": row["status"],
                          "payload": json.loads(row["payload"]), "created_at": row["created_at"]})
    if "review" in wanted:
        rows = conn.execute(
            "SELECT execution_id, task_id, reviewed_commit, reviewer_agent_id, result, "
            "task_package_hash, base_commit, payload, created_at FROM review_reports "
            + ("WHERE task_id=? " if task_id else "")
            + "ORDER BY created_at DESC",
            (task_id,) if task_id else (),
        ).fetchall()
        for row in rows:
            items.append({"type": "review", "task_id": row["task_id"],
                          "execution_id": row["execution_id"],
                          "reviewed_commit": row["reviewed_commit"],
                          "reviewer": row["reviewer_agent_id"], "result": row["result"],
                          "task_package_hash": row["task_package_hash"],
                          "base_commit": row["base_commit"],
                          "payload": json.loads(row["payload"]), "created_at": row["created_at"]})
    if "test" in wanted:
        rows = conn.execute(
            "SELECT execution_id, task_id, commit_sha, execution_result, result, artifact_id, "
            "payload, created_at FROM test_reports "
            + ("WHERE task_id=? " if task_id else "")
            + "ORDER BY created_at DESC",
            (task_id,) if task_id else (),
        ).fetchall()
        for row in rows:
            items.append({"type": "test", "task_id": row["task_id"],
                          "execution_id": row["execution_id"], "commit_sha": row["commit_sha"],
                          "execution_result": row["execution_result"], "result": row["result"],
                          "artifact_id": row["artifact_id"],
                          "payload": json.loads(row["payload"]), "created_at": row["created_at"]})
    items.sort(key=lambda item: item["created_at"], reverse=True)
    total = len(items)
    return items[offset:offset + page_size], total


def validate_artifact_path(path: str) -> None:
    if _ABSOLUTE_PATH.match(path):
        raise bad_request("artifact path must be repo-relative", details={"field": "path"})
    segments = path.split("/")
    if any(segment in {"..", ""} for segment in segments):
        raise bad_request("artifact path must not contain empty or '..' segments",
                          details={"field": "path"})
    if any(segment == ".git" or segment.endswith(".git") for segment in segments):
        raise bad_request("artifact path must not reference .git content", details={"field": "path"})
    if "\\" in path:
        raise bad_request("artifact path must use POSIX separators", details={"field": "path"})


def register_artifact(conn: sqlite3.Connection, body: ArtifactCreate, settings: Any,
                      principal: Principal, correlation_id: str | None,
                      logger: PlatformLogger | None) -> dict:
    validate_artifact_path(body.path)
    if body.task_id and not conn.execute(
        "SELECT 1 FROM tasks WHERE task_id=?", (body.task_id,)
    ).fetchone():
        raise not_found("task", body.task_id)

    content_bytes: bytes | None = None
    if body.content is not None:
        content_bytes = body.content.encode("utf-8")
        if len(content_bytes) > settings.artifact_max_inline_bytes:
            raise bad_request(
                f"inline content exceeds limit ({len(content_bytes)} > {settings.artifact_max_inline_bytes})",
                details={"field": "content"},
            )
        actual_sha = hashlib.sha256(content_bytes).hexdigest()
        if actual_sha != body.sha256:
            raise artifact_hash_mismatch(
                f"content sha256 {actual_sha} does not match registered {body.sha256}",
                details={"field": "sha256", "expected": body.sha256, "actual": actual_sha},
            )

    existing = conn.execute("SELECT * FROM artifacts WHERE path=?", (body.path,)).fetchone()
    if existing:
        if existing["sha256"] == body.sha256:
            return {**dict(existing), "duplicate": True}
        raise conflict("artifact path already registered with a different sha256",
                       details={"field": "path", "artifact_id": existing["artifact_id"]})

    purpose = ARTIFACT_PURPOSE[body.type]
    artifact_id = next_scoped_id(conn, "artifacts", "artifact_id", f"ART-{purpose}-")
    now = utc_now()
    conn.execute(
        "INSERT INTO artifacts(artifact_id, task_id, type, path, sha256, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (artifact_id, body.task_id, body.type, body.path, body.sha256, now),
    )
    if content_bytes is not None:
        blob_path = settings.artifact_dir / body.sha256
        blob_path.parent.mkdir(parents=True, exist_ok=True)
        blob_path.write_bytes(content_bytes)
    audit(conn, actor_id=principal.actor_id, actor_type=principal.actor_type,
          action="artifact_registered", target_type="artifact", target_id=artifact_id,
          correlation_id=correlation_id,
          details={"task_id": body.task_id, "path": body.path, "type": body.type,
                   "artifact_sha256": body.sha256})
    if logger:
        logger.info("artifact_registered", f"artifact {artifact_id} registered",
                    artifact_id=artifact_id, artifact_sha256=body.sha256,
                    task_id=body.task_id, operation="register_artifact", result="SUCCESS")
    row = conn.execute("SELECT * FROM artifacts WHERE artifact_id=?", (artifact_id,)).fetchone()
    return {**dict(row), "duplicate": False}


def get_artifact(conn: sqlite3.Connection, artifact_id: str, settings: Any) -> dict:
    row = conn.execute("SELECT * FROM artifacts WHERE artifact_id=?", (artifact_id,)).fetchone()
    if not row:
        raise artifact_not_found(artifact_id)
    view = dict(row)
    blob_path = settings.artifact_dir / row["sha256"]
    if blob_path.is_file():
        raw = blob_path.read_bytes()
        view["content"] = raw.decode("utf-8", errors="replace")
        view["content_size_bytes"] = len(raw)
    else:
        view["content"] = None
        view["content_size_bytes"] = None
    return view


def register_commit(conn: sqlite3.Connection, body: CommitCreate, principal: Principal,
                    correlation_id: str | None, logger: PlatformLogger | None) -> dict:
    if not conn.execute("SELECT 1 FROM tasks WHERE task_id=?", (body.task_id,)).fetchone():
        raise not_found("task", body.task_id)
    execution = _require_execution(conn, body.task_id, body.execution_id)
    if not conn.execute("SELECT 1 FROM repositories WHERE repository_id=?",
                        (body.repository_id,)).fetchone():
        raise not_found("repository", body.repository_id)
    if body.diff_artifact_id and not conn.execute(
        "SELECT 1 FROM artifacts WHERE artifact_id=?", (body.diff_artifact_id,)
    ).fetchone():
        raise artifact_not_found(body.diff_artifact_id)
    if body.base_commit != execution["base_commit"]:
        raise git_base_mismatch(
            f"commit base {body.base_commit} does not match execution baseline {execution['base_commit']}",
            details={"field": "base_commit", "expected": execution["base_commit"],
                     "got": body.base_commit},
        )
    existing = conn.execute(
        "SELECT * FROM git_commits WHERE repository_id=? AND sha=?", (body.repository_id, body.sha)
    ).fetchone()
    if existing:
        return {**dict(existing), "duplicate": True}  # UNIQUE(repository_id, sha): idempotent re-collection

    now = utc_now()
    conn.execute(
        """INSERT INTO git_commits(task_id, execution_id, repository_id, branch, sha,
               base_commit, diff_artifact_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (body.task_id, body.execution_id, body.repository_id, body.branch, body.sha,
         body.base_commit, body.diff_artifact_id, now),
    )
    audit(conn, actor_id=principal.actor_id, actor_type=principal.actor_type,
          action="git_commit_registered", target_type="git_commit", target_id=body.sha,
          correlation_id=correlation_id,
          details={"task_id": body.task_id, "execution_id": body.execution_id,
                   "repository_id": body.repository_id, "branch": body.branch,
                   "base_commit": body.base_commit})
    if logger:
        logger.info("git_commit_registered", f"commit {body.sha[:12]} collected for {body.execution_id}",
                    task_id=body.task_id, execution_id=body.execution_id,
                    repository_id=body.repository_id, branch=body.branch, commit_sha=body.sha,
                    base_commit=body.base_commit, operation="register_commit", result="SUCCESS")
    row = conn.execute(
        "SELECT * FROM git_commits WHERE repository_id=? AND sha=?", (body.repository_id, body.sha)
    ).fetchone()
    return {**dict(row), "duplicate": False}


def list_commits(conn: sqlite3.Connection, *, task_id: str | None, execution_id: str | None,
                 page: int, page_size: int, offset: int, sort_clause: str) -> tuple[list[dict], int]:
    clauses, params = [], []
    if task_id:
        clauses.append("task_id=?")
        params.append(task_id)
    if execution_id:
        clauses.append("execution_id=?")
        params.append(execution_id)
    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
    total = conn.execute(f"SELECT COUNT(*) AS c FROM git_commits {where}", params).fetchone()["c"]
    rows = conn.execute(
        f"SELECT * FROM git_commits {where} ORDER BY {sort_clause} LIMIT ? OFFSET ?",
        (*params, page_size, offset),
    ).fetchall()
    return [dict(row) for row in rows], total


def list_audit(conn: sqlite3.Connection, *, target_type: str | None, target_id: str | None,
               action: str | None = None, from_ts: str | None = None, to_ts: str | None = None,
               page: int = 1, page_size: int = 50, offset: int = 0) -> tuple[list[dict], int]:
    clauses, params = [], []
    if action:
        clauses.append("action=?")
        params.append(action)
    if target_type:
        clauses.append("target_type=?")
        params.append(target_type)
    if target_id:
        clauses.append("target_id=?")
        params.append(target_id)
    if from_ts:
        clauses.append("timestamp >= ?")
        params.append(from_ts)
    if to_ts:
        clauses.append("timestamp <= ?")
        params.append(to_ts)
    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
    total = conn.execute(f"SELECT COUNT(*) AS c FROM audit_logs {where}", params).fetchone()["c"]
    rows = conn.execute(
        f"""SELECT * FROM audit_logs {where}
            ORDER BY timestamp DESC, audit_id DESC LIMIT ? OFFSET ?""",
        (*params, page_size, offset),
    ).fetchall()
    items = []
    for row in rows:
        view = dict(row)
        view["details"] = json.loads(view["details"]) if view["details"] else None
        items.append(view)
    return items, total
