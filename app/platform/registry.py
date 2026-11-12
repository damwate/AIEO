"""Registry services: projects, repositories, batches, agents (C2 tables 1-3, 7)."""
from __future__ import annotations

import sqlite3

from .database import audit, json_text, next_scoped_id, row_dict, utc_now
from .errors import conflict, not_found
from .schemas import AgentCreate, BatchCreate, ProjectCreate, RepositoryCreate
from .security import Principal, issue_service_token


def create_project(conn: sqlite3.Connection, body: ProjectCreate, principal: Principal,
                   correlation_id: str | None) -> dict:
    if conn.execute("SELECT 1 FROM projects WHERE project_id=?", (body.project_id,)).fetchone():
        raise conflict(f"project_id {body.project_id} already registered", details={"field": "project_id"})
    if conn.execute("SELECT 1 FROM projects WHERE name=?", (body.name,)).fetchone():
        raise conflict(f"project name {body.name} already registered", details={"field": "name"})
    now = utc_now()
    conn.execute(
        """INSERT INTO projects(project_id, name, description, status, knowledge_version, created_at, updated_at)
           VALUES (?, ?, ?, 'ACTIVE', ?, ?, ?)""",
        (body.project_id, body.name, body.description, body.knowledge_version, now, now),
    )
    audit(conn, actor_id=principal.actor_id, actor_type=principal.actor_type,
          action="project_created", target_type="project", target_id=body.project_id,
          correlation_id=correlation_id)
    return get_project(conn, body.project_id)


def get_project(conn: sqlite3.Connection, project_id: str) -> dict:
    row = conn.execute("SELECT * FROM projects WHERE project_id=?", (project_id,)).fetchone()
    if not row:
        raise not_found("project", project_id)
    return dict(row)


def list_projects(conn: sqlite3.Connection, page: int, page_size: int, offset: int,
                  sort_clause: str) -> tuple[list[dict], int]:
    total = conn.execute("SELECT COUNT(*) AS c FROM projects").fetchone()["c"]
    rows = conn.execute(
        f"SELECT * FROM projects ORDER BY {sort_clause} LIMIT ? OFFSET ?",
        (page_size, offset),
    ).fetchall()
    return [dict(row) for row in rows], total


def create_repository(conn: sqlite3.Connection, body: RepositoryCreate, principal: Principal,
                      correlation_id: str | None) -> dict:
    if not conn.execute("SELECT 1 FROM projects WHERE project_id=?", (body.project_id,)).fetchone():
        raise not_found("project", body.project_id)
    if conn.execute(
        "SELECT 1 FROM repositories WHERE project_id=? AND url=?", (body.project_id, body.url)
    ).fetchone():
        raise conflict("repository url already registered for project",
                       details={"field": "url", "project_id": body.project_id})
    if conn.execute("SELECT 1 FROM repositories WHERE local_path=?", (body.local_path,)).fetchone():
        raise conflict("repository local_path already registered", details={"field": "local_path"})
    repository_id = next_scoped_id(conn, "repositories", "repository_id", "REPO-")
    now = utc_now()
    conn.execute(
        """INSERT INTO repositories(repository_id, project_id, url, local_path, default_branch, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (repository_id, body.project_id, body.url, body.local_path, body.default_branch, now, now),
    )
    audit(conn, actor_id=principal.actor_id, actor_type=principal.actor_type,
          action="repository_created", target_type="repository", target_id=repository_id,
          correlation_id=correlation_id, details={"project_id": body.project_id, "url": body.url})
    return get_repository(conn, repository_id)


def get_repository(conn: sqlite3.Connection, repository_id: str) -> dict:
    row = conn.execute("SELECT * FROM repositories WHERE repository_id=?", (repository_id,)).fetchone()
    if not row:
        raise not_found("repository", repository_id)
    return dict(row)


def list_repositories(conn: sqlite3.Connection, project_id: str | None, page: int, page_size: int,
                      offset: int, sort_clause: str) -> tuple[list[dict], int]:
    where, params = "", []
    if project_id:
        where = "WHERE project_id=?"
        params.append(project_id)
    total = conn.execute(f"SELECT COUNT(*) AS c FROM repositories {where}", params).fetchone()["c"]
    rows = conn.execute(
        f"SELECT * FROM repositories {where} ORDER BY {sort_clause} LIMIT ? OFFSET ?",
        (*params, page_size, offset),
    ).fetchall()
    return [dict(row) for row in rows], total


def create_batch(conn: sqlite3.Connection, body: BatchCreate, principal: Principal,
                 correlation_id: str | None) -> dict:
    if not conn.execute("SELECT 1 FROM projects WHERE project_id=?", (body.project_id,)).fetchone():
        raise not_found("project", body.project_id)
    batch_id = next_scoped_id(conn, "batches", "batch_id", "BATCH-")
    now = utc_now()
    conn.execute(
        """INSERT INTO batches(batch_id, project_id, requirement, status,
               engineering_standard_version, knowledge_base_commit, created_at, updated_at)
           VALUES (?, ?, ?, 'PLANNING', ?, ?, ?, ?)""",
        (batch_id, body.project_id, body.requirement,
         body.engineering_standard_version, body.knowledge_base_commit, now, now),
    )
    audit(conn, actor_id=principal.actor_id, actor_type=principal.actor_type,
          action="batch_created", target_type="batch", target_id=batch_id,
          correlation_id=correlation_id, details={"project_id": body.project_id})
    return get_batch(conn, batch_id)


def get_batch(conn: sqlite3.Connection, batch_id: str) -> dict:
    row = conn.execute("SELECT * FROM batches WHERE batch_id=?", (batch_id,)).fetchone()
    if not row:
        raise not_found("batch", batch_id)
    return dict(row)


def list_batches(conn: sqlite3.Connection, project_id: str | None, page: int, page_size: int,
                 offset: int, sort_clause: str) -> tuple[list[dict], int]:
    where, params = "", []
    if project_id:
        where = "WHERE project_id=?"
        params.append(project_id)
    total = conn.execute(f"SELECT COUNT(*) AS c FROM batches {where}", params).fetchone()["c"]
    rows = conn.execute(
        f"SELECT * FROM batches {where} ORDER BY {sort_clause} LIMIT ? OFFSET ?",
        (*params, page_size, offset),
    ).fetchall()
    return [dict(row) for row in rows], total


def create_agent(conn: sqlite3.Connection, body: AgentCreate, principal: Principal,
                 correlation_id: str | None) -> dict:
    if conn.execute("SELECT 1 FROM agents WHERE agent_id=?", (body.agent_id,)).fetchone():
        raise conflict(f"agent {body.agent_id} already registered", details={"field": "agent_id"})
    now = utc_now()
    conn.execute(
        """INSERT INTO agents(agent_id, agent_type, role, enabled, capabilities, created_at, updated_at)
           VALUES (?, ?, ?, 1, ?, ?, ?)""",
        (body.agent_id, body.agent_type, body.role,
         json_text(body.capabilities) if body.capabilities is not None else None, now, now),
    )
    audit(conn, actor_id=principal.actor_id, actor_type=principal.actor_type,
          action="agent_registered", target_type="agent", target_id=body.agent_id,
          correlation_id=correlation_id)
    result = {"agent": get_agent(conn, body.agent_id)}
    if body.issue_service_token:
        token = issue_service_token(conn, body.agent_id)
        audit(conn, actor_id=principal.actor_id, actor_type=principal.actor_type,
              action="service_credential_issued", target_type="agent", target_id=body.agent_id,
              correlation_id=correlation_id)
        result["service_token"] = token  # shown once; only the hash is stored
    return result


def get_agent(conn: sqlite3.Connection, agent_id: str) -> dict:
    row = conn.execute("SELECT * FROM agents WHERE agent_id=?", (agent_id,)).fetchone()
    if not row:
        raise not_found("agent", agent_id)
    return row_dict(row)  # type: ignore[return-value]


def list_agents(conn: sqlite3.Connection, page: int, page_size: int, offset: int,
                sort_clause: str) -> tuple[list[dict], int]:
    total = conn.execute("SELECT COUNT(*) AS c FROM agents").fetchone()["c"]
    rows = conn.execute(
        f"SELECT * FROM agents ORDER BY {sort_clause} LIMIT ? OFFSET ?", (page_size, offset)
    ).fetchall()
    return [dict(row) for row in rows], total
