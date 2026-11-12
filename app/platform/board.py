"""Progress board: completion counts ACCEPTED tasks only (04-规范 §4)."""
from __future__ import annotations

import sqlite3

from .errors import not_found
from .state_machine import STATUSES


def _board_for(conn: sqlite3.Connection, project_row: sqlite3.Row) -> dict:
    project_id = project_row["project_id"]
    rows = conn.execute(
        """SELECT t.task_id, t.status, t.weight, t.batch_id FROM tasks t
           JOIN batches b ON b.batch_id=t.batch_id WHERE b.project_id=?""",
        (project_id,),
    ).fetchall()

    status_counts = {status: 0 for status in STATUSES}
    for row in rows:
        status_counts[row["status"]] += 1

    total_tasks = len(rows)
    cancelled = status_counts["CANCELLED"]
    valid_tasks = total_tasks - cancelled
    accepted = status_counts["ACCEPTED"]
    accepted_weight = sum(row["weight"] for row in rows if row["status"] == "ACCEPTED")
    valid_weight = sum(row["weight"] for row in rows if row["status"] != "CANCELLED")
    completion = round(accepted_weight / valid_weight * 100, 2) if valid_weight > 0 else None

    batch_rows = conn.execute(
        """SELECT b.batch_id, b.status, COUNT(t.task_id) AS total,
               COALESCE(SUM(CASE WHEN t.status='ACCEPTED' THEN 1 ELSE 0 END), 0) AS accepted,
               COALESCE(SUM(CASE WHEN t.status != 'CANCELLED' THEN t.weight ELSE 0 END), 0) AS valid_weight,
               COALESCE(SUM(CASE WHEN t.status='ACCEPTED' THEN t.weight ELSE 0 END), 0) AS accepted_weight
           FROM batches b LEFT JOIN tasks t ON t.batch_id=b.batch_id
           WHERE b.project_id=? GROUP BY b.batch_id ORDER BY b.batch_id""",
        (project_id,),
    ).fetchall()
    batches = []
    for batch in batch_rows:
        batch_completion = (
            round(batch["accepted_weight"] / batch["valid_weight"] * 100, 2)
            if batch["valid_weight"] > 0 else None
        )
        batches.append({
            "batch_id": batch["batch_id"],
            "batch_status": batch["status"],
            "total_tasks": batch["total"],
            "accepted_tasks": batch["accepted"],
            "completion_percent": batch_completion,
        })

    blocked_tasks = [row["task_id"] for row in rows if row["status"] == "BLOCKED"]
    return {
        "project_id": project_id,
        "project_name": project_row["name"],
        "total_tasks": total_tasks,
        "valid_tasks": valid_tasks,
        "cancelled_tasks": cancelled,
        "accepted_tasks": accepted,
        "accepted_weight": accepted_weight,
        "valid_weight": valid_weight,
        # 完成率 = ACCEPTED 权重和 / 全部有效（未取消）任务权重和 (04-规范 §4)
        "completion_percent": completion,
        "status_counts": status_counts,
        "blocked_tasks": blocked_tasks,
        "batches": batches,
    }


def get_board(conn: sqlite3.Connection, project_id: str | None) -> dict:
    if project_id:
        project = conn.execute("SELECT * FROM projects WHERE project_id=?", (project_id,)).fetchone()
        if not project:
            raise not_found("project", project_id)
        return {"items": [_board_for(conn, project)], "total": 1}
    projects = conn.execute("SELECT * FROM projects WHERE status='ACTIVE' ORDER BY project_id").fetchall()
    return {"items": [_board_for(conn, project) for project in projects], "total": len(projects)}
