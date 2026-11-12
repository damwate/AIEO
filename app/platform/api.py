"""REST wiring: /api/v1 routers over the platform services (C1 §2.3 endpoint table)."""
from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from fastapi import Depends, FastAPI, Request
from fastapi.responses import JSONResponse

from . import board as board_svc
from . import messaging, registry, reports, tasks
from .config import Settings
from .database import Database, audit, to_utc, utc_now
from .errors import APIError, bad_request, install_error_handlers
from .logging_setup import PlatformLogger
from .security import forbidden
from .schemas import (
    AckRequest,
    AgentCreate,
    ApprovalCreate,
    ArtifactCreate,
    BatchCreate,
    ClaimRequest,
    CommitCreate,
    DevReportIn,
    LoginIn,
    MessageIn,
    ProjectCreate,
    RequeueRequest,
    RepositoryCreate,
    ReviewReportIn,
    TaskCreate,
    TaskEventIn,
    TestReportIn,
)
from .security import (
    SESSION_COOKIE,
    Principal,
    authenticate,
    bootstrap_admin,
    create_session,
    enforce_csrf,
    revoke,
    verify_login,
)
from .state_machine import STATUSES

SORT_WHITELIST = {
    "projects": {"created_at": "created_at", "project_id": "project_id", "name": "name"},
    "repositories": {"created_at": "created_at", "repository_id": "repository_id"},
    "batches": {"created_at": "created_at", "batch_id": "batch_id"},
    "tasks": {"created_at": "created_at", "task_id": "task_id", "status": "status", "priority": "priority"},
    "messages": {"created_at": "created_at", "message_id": "message_id"},
    "commits": {"created_at": "created_at", "sha": "sha"},
    "audit": {"timestamp": "timestamp"},
    "approvals": {"created_at": "created_at", "approval_id": "approval_id"},
}


class PlatformContext:
    def __init__(self, settings: Settings, db: Database, logger: PlatformLogger) -> None:
        self.settings = settings
        self.db = db
        self.logger = logger

    def log(self, event: str, message: str, **fields: Any) -> None:
        self.logger.info(event, message, **fields)


def _paging(request: Request, resource: str) -> tuple[int, int, int, str]:
    params = request.query_params
    try:
        page = int(params.get("page", "1"))
        page_size = int(params.get("page_size", "50"))
    except ValueError:
        raise bad_request("page and page_size must be integers", details={"field": "page"})
    if page < 1:
        raise bad_request("page must be >= 1", details={"field": "page"})
    if not 1 <= page_size <= 200:
        raise bad_request("page_size must be between 1 and 200", details={"field": "page_size"})
    sort_raw = params.get("sort", "created_at:desc" if resource != "audit" else "timestamp:desc")
    field, _, direction = sort_raw.partition(":")
    allowed = SORT_WHITELIST[resource]
    if field not in allowed:
        raise bad_request(f"sort field must be one of {sorted(allowed)}", details={"field": "sort"})
    direction = direction or "desc"
    if direction not in {"asc", "desc"}:
        raise bad_request("sort direction must be asc or desc", details={"field": "sort"})
    return page, page_size, (page - 1) * page_size, f"{allowed[field]} {direction.upper()}"


def _envelope(items: list, page: int, page_size: int, total: int) -> dict:
    return {"items": items, "page": page, "page_size": page_size, "total": total}


def _paging_simple(request: Request) -> tuple[int, int, int]:
    params = request.query_params
    try:
        page = int(params.get("page", "1"))
        page_size = int(params.get("page_size", "50"))
    except ValueError:
        raise bad_request("page and page_size must be integers", details={"field": "page"})
    if page < 1:
        raise bad_request("page must be >= 1", details={"field": "page"})
    if not 1 <= page_size <= 200:
        raise bad_request("page_size must be between 1 and 200", details={"field": "page_size"})
    return page, page_size, (page - 1) * page_size


def _time_filter(request: Request, name: str) -> str | None:
    raw = request.query_params.get(name)
    if raw is None:
        return None
    try:
        return to_utc(raw)
    except (ValueError, TypeError):
        raise bad_request(f"{name} must be an ISO 8601 UTC timestamp", details={"field": name})


def build_app(ctx: PlatformContext) -> FastAPI:
    app = FastAPI(title="AIEO Platform (M1)", version="0.1.0", docs_url=None, redoc_url=None)
    install_error_handlers(app)

    @app.middleware("http")
    async def request_log_middleware(request: Request, call_next):
        started = time.perf_counter()
        trace_id = str(uuid4())
        request.state.trace_id = trace_id
        response = await call_next(request)
        duration_ms = int((time.perf_counter() - started) * 1000)
        ctx.logger.info(
            "http_request", f"{request.method} {request.url.path}",
            trace_id=trace_id,
            correlation_id=getattr(request.state, "correlation_id", None),
            operation=f"{request.method} {request.url.path}",
            http_status=response.status_code, duration_ms=duration_ms,
        )
        return response

    def get_principal(request: Request) -> Principal:
        with ctx.db.transaction() as conn:
            principal = authenticate(request, conn, ctx.settings)
            enforce_csrf(request, principal)
        return principal

    # ---- health (no auth, C1 §2.1 / C8 §9.3) ----
    @app.get("/api/v1/health")
    def health() -> dict:
        return {
            "status": "ok",
            "contract_version": "1.0.0",
            "supported_versions": ["1.0"],
            "minimum_supported_version": "1.0",
            "service": "platform",
            "module": "M1",
            "env": ctx.settings.env,
        }

    # ---- C7 auth ----
    @app.post("/api/v1/auth/login")
    def login(body: LoginIn, request: Request):
        correlation_id = getattr(request.state, "correlation_id", None)
        login_failed = False
        with ctx.db.transaction() as conn:
            if not verify_login(conn, body.username, body.password):
                # The failure audit must outlive the rolled-back auth attempt,
                # so it is committed in its own transaction below (C4 audit trail).
                login_failed = True
            else:
                session_id, csrf_token, expires_at = create_session(
                    conn, settings=ctx.settings, username=body.username,
                )
                audit(conn, actor_id=body.username, actor_type="user",
                      action="login_success", target_type="platform_user",
                      target_id=body.username, correlation_id=correlation_id)
        if login_failed:
            with ctx.db.transaction() as conn:
                audit(conn, actor_id=body.username, actor_type="user",
                      action="login_failed", target_type="platform_user",
                      target_id=body.username, result="FAILURE",
                      correlation_id=correlation_id)
            ctx.logger.warning("login_failed", f"failed login for {body.username}",
                               operation="login", result="FAILURE")
            raise APIError(401, "AUTH-0001",
                           "AUTH-0001 UNAUTHENTICATED: invalid username or password")
        response = JSONResponse({
            "username": body.username, "csrf_token": csrf_token, "expires_at": expires_at,
        })
        response.set_cookie(
            SESSION_COOKIE, session_id, httponly=True, samesite="lax",
            secure=ctx.settings.env == "production", path="/",
        )
        ctx.logger.info("login_success", f"user {body.username} logged in",
                        operation="login", result="SUCCESS")
        return response

    @app.post("/api/v1/auth/logout")
    def logout(request: Request, principal: Principal = Depends(get_principal)):
        with ctx.db.transaction() as conn:
            if principal.session_id:
                revoke(conn, principal.session_id)
            audit(conn, actor_id=principal.actor_id, actor_type=principal.actor_type,
                  action="logout", target_type="platform_user",
                  target_id=principal.actor_id,
                  correlation_id=getattr(request.state, "correlation_id", None))
        response = JSONResponse({"status": "logged_out"})
        response.delete_cookie(SESSION_COOKIE, path="/")
        return response

    @app.get("/api/v1/auth/session")
    def whoami(principal: Principal = Depends(get_principal)):
        return {
            "kind": principal.kind,
            "username": principal.username,
            "agent_id": principal.agent_id,
            "agent_type": principal.agent_type,
        }

    # ---- projects ----
    @app.post("/api/v1/projects", status_code=201)
    def create_project(body: ProjectCreate, request: Request,
                       principal: Principal = Depends(get_principal)):
        correlation_id = getattr(request.state, "correlation_id", None)
        with ctx.db.transaction() as conn:
            return registry.create_project(conn, body, principal, correlation_id)

    @app.get("/api/v1/projects")
    def list_projects(request: Request, principal: Principal = Depends(get_principal)):
        page, size, offset, sort = _paging(request, "projects")
        with ctx.db.reading() as conn:
            items, total = registry.list_projects(conn, page, size, offset, sort)
        return _envelope(items, page, size, total)

    @app.get("/api/v1/projects/{project_id}")
    def get_project(project_id: str, principal: Principal = Depends(get_principal)):
        with ctx.db.reading() as conn:
            return registry.get_project(conn, project_id)

    # ---- repositories ----
    @app.post("/api/v1/repositories", status_code=201)
    def create_repository(body: RepositoryCreate, request: Request,
                          principal: Principal = Depends(get_principal)):
        correlation_id = getattr(request.state, "correlation_id", None)
        with ctx.db.transaction() as conn:
            return registry.create_repository(conn, body, principal, correlation_id)

    @app.get("/api/v1/repositories")
    def list_repositories(request: Request, principal: Principal = Depends(get_principal)):
        page, size, offset, sort = _paging(request, "repositories")
        with ctx.db.reading() as conn:
            items, total = registry.list_repositories(
                conn, request.query_params.get("project_id"), page, size, offset, sort)
        return _envelope(items, page, size, total)

    # ---- batches ----
    @app.post("/api/v1/batches", status_code=201)
    def create_batch(body: BatchCreate, request: Request,
                     principal: Principal = Depends(get_principal)):
        correlation_id = getattr(request.state, "correlation_id", None)
        with ctx.db.transaction() as conn:
            return registry.create_batch(conn, body, principal, correlation_id)

    @app.get("/api/v1/batches")
    def list_batches(request: Request, principal: Principal = Depends(get_principal)):
        page, size, offset, sort = _paging(request, "batches")
        with ctx.db.reading() as conn:
            items, total = registry.list_batches(
                conn, request.query_params.get("project_id"), page, size, offset, sort)
        return _envelope(items, page, size, total)

    @app.get("/api/v1/batches/{batch_id}")
    def get_batch(batch_id: str, principal: Principal = Depends(get_principal)):
        with ctx.db.reading() as conn:
            return registry.get_batch(conn, batch_id)

    # ---- agents ----
    @app.post("/api/v1/agents", status_code=201)
    def create_agent(body: AgentCreate, request: Request,
                     principal: Principal = Depends(get_principal)):
        correlation_id = getattr(request.state, "correlation_id", None)
        with ctx.db.transaction() as conn:
            return registry.create_agent(conn, body, principal, correlation_id)

    @app.get("/api/v1/agents")
    def list_agents(request: Request, principal: Principal = Depends(get_principal)):
        page, size, offset, sort = _paging(request, "projects")
        with ctx.db.reading() as conn:
            items, total = registry.list_agents(conn, page, size, offset, sort)
        return _envelope(items, page, size, total)

    # ---- tasks ----
    @app.post("/api/v1/tasks", status_code=201)
    def create_task(body: TaskCreate, request: Request,
                    principal: Principal = Depends(get_principal)):
        correlation_id = getattr(request.state, "correlation_id", None)
        with ctx.db.transaction() as conn:
            return tasks.create_task(conn, body, principal, correlation_id)

    @app.get("/api/v1/tasks")
    def list_tasks(request: Request, principal: Principal = Depends(get_principal)):
        page, size, offset, sort = _paging(request, "tasks")
        params = request.query_params
        status = params.get("status")
        if status is not None and status not in STATUSES:
            raise bad_request("unknown task status filter", details={"field": "status"})
        with ctx.db.reading() as conn:
            items, total = tasks.list_tasks(
                conn, batch_id=params.get("batch_id"), status=status,
                parent_id=params.get("parent_id"), page=page, page_size=size,
                offset=offset, sort_clause=sort)
        return _envelope(items, page, size, total)

    @app.get("/api/v1/tasks/{task_id}")
    def get_task(task_id: str, principal: Principal = Depends(get_principal)):
        with ctx.db.reading() as conn:
            return tasks.get_task(conn, task_id)

    @app.get("/api/v1/tasks/{task_id}/dependencies")
    def get_dependencies(task_id: str, principal: Principal = Depends(get_principal)):
        with ctx.db.reading() as conn:
            return tasks.list_dependencies(conn, task_id)

    @app.post("/api/v1/tasks/{task_id}/events")
    def submit_event(task_id: str, body: TaskEventIn, request: Request,
                     principal: Principal = Depends(get_principal)):
        correlation_id = body.correlation_id or getattr(request.state, "correlation_id", None)
        with ctx.db.transaction() as conn:
            result = tasks.submit_event(conn, task_id, body, principal, correlation_id)
        ctx.logger.info("task_event_submitted",
                        f"event {body.event} on {task_id} -> {result.get('to_status')}",
                        task_id=task_id, correlation_id=correlation_id,
                        operation="submit_event", result="SUCCESS")
        return result

    @app.post("/api/v1/tasks/{task_id}/claim")
    def claim_task(task_id: str, body: ClaimRequest, request: Request,
                   principal: Principal = Depends(get_principal)):
        correlation_id = getattr(request.state, "correlation_id", None)
        with ctx.db.transaction() as conn:
            return tasks.claim_task(conn, task_id, body, principal, correlation_id,
                                    settings=ctx.settings, logger=ctx.logger)

    # ---- messages ----
    @app.post("/api/v1/messages", status_code=202)
    def submit_message(body: MessageIn, request: Request,
                       principal: Principal = Depends(get_principal)):
        correlation_id = getattr(request.state, "correlation_id", None)
        with ctx.db.transaction() as conn:
            return messaging.register_inbound_message(
                conn, body, actor_id=principal.actor_id, actor_type=principal.actor_type,
                logger=ctx.logger, settings=ctx.settings)

    @app.get("/api/v1/messages")
    def list_messages(request: Request, principal: Principal = Depends(get_principal)):
        page, size, offset, sort = _paging(request, "messages")
        params = request.query_params
        status = params.get("status")
        if status is not None and status not in messaging.MESSAGE_STATUSES:
            raise bad_request("unknown message status filter", details={"field": "status"})
        direction = params.get("direction")
        if direction is not None and direction not in {"INBOUND", "OUTBOUND"}:
            raise bad_request("direction must be INBOUND or OUTBOUND", details={"field": "direction"})
        with ctx.db.reading() as conn:
            items, total = messaging.list_messages(
                conn, direction=direction, target_agent_id=params.get("target_agent_id"),
                status=status, task_id=params.get("task_id"),
                correlation_id=params.get("correlation_id"),
                page=page, page_size=size, offset=offset, sort_clause=sort)
        return _envelope(items, page, size, total)

    @app.get("/api/v1/messages/dead-letter")
    def dead_letter(request: Request, principal: Principal = Depends(get_principal)):
        page, size, offset, sort = _paging(request, "messages")
        with ctx.db.transaction() as conn:
            counts = messaging.sweep(conn, ctx.settings, logger=ctx.logger)
            items, total = messaging.list_messages(
                conn, direction=None, target_agent_id=None, status="DEAD_LETTER",
                task_id=None, correlation_id=None,
                page=page, page_size=size, offset=offset, sort_clause=sort)
        if any(counts.values()):
            ctx.logger.info("outbox_swept", f"dead-letter sweep delivered={counts['delivered']} retrying={counts['retrying']} dead={counts['dead_lettered']}",
                            operation="sweep", result="SUCCESS")
        return _envelope(items, page, size, total)

    @app.get("/api/v1/messages/{message_id}")
    def get_message(message_id: str, principal: Principal = Depends(get_principal)):
        with ctx.db.reading() as conn:
            return messaging.get_message(conn, message_id)

    @app.post("/api/v1/messages/{message_id}/ack")
    def ack_message(message_id: str, body: AckRequest,
                    principal: Principal = Depends(get_principal)):
        with ctx.db.transaction() as conn:
            return messaging.ack_message(conn, message_id, principal, ctx.logger)

    @app.post("/api/v1/messages/{message_id}/requeue")
    def requeue_message(message_id: str, body: RequeueRequest,
                        principal: Principal = Depends(get_principal)):
        if principal.kind != "user":
            raise forbidden("AUTH-0002 FORBIDDEN: dead-letter requeue is restricted to the human owner session")
        with ctx.db.transaction() as conn:
            return messaging.requeue_message(
                conn, message_id, body.actor or principal.actor_id, body.reason, ctx.logger)

    @app.post("/api/v1/messages/{message_id}/cancel")
    def cancel_message(message_id: str, principal: Principal = Depends(get_principal)):
        with ctx.db.transaction() as conn:
            return messaging.cancel_message(conn, message_id, principal, ctx.logger)

    @app.post("/api/v1/messages/sweep")
    def sweep_outbox(principal: Principal = Depends(get_principal)):
        """Operational endpoint (additive to C1): run one outbox maintenance sweep."""
        with ctx.db.transaction() as conn:
            counts = messaging.sweep(conn, ctx.settings, logger=ctx.logger)
        return {"counts": counts, "swept_at": datetime.now(timezone.utc).isoformat()}

    # ---- reports ----
    @app.post("/api/v1/reports/development", status_code=201)
    def register_dev_report(body: DevReportIn, request: Request,
                            principal: Principal = Depends(get_principal)):
        correlation_id = getattr(request.state, "correlation_id", None)
        with ctx.db.transaction() as conn:
            return reports.register_dev_report(conn, body, principal, correlation_id, ctx.logger)

    @app.post("/api/v1/reports/review", status_code=201)
    def register_review_report(body: ReviewReportIn, request: Request,
                               principal: Principal = Depends(get_principal)):
        correlation_id = getattr(request.state, "correlation_id", None)
        with ctx.db.transaction() as conn:
            return reports.register_review_report(conn, body, principal, correlation_id, ctx.logger)

    @app.post("/api/v1/reports/test", status_code=201)
    def register_test_report(body: TestReportIn, request: Request,
                             principal: Principal = Depends(get_principal)):
        correlation_id = getattr(request.state, "correlation_id", None)
        with ctx.db.transaction() as conn:
            return reports.register_test_report(conn, body, principal, correlation_id, ctx.logger)

    @app.get("/api/v1/reports")
    def list_reports(request: Request, principal: Principal = Depends(get_principal)):
        page, size, offset = _paging_simple(request)
        report_type = request.query_params.get("type")
        if report_type is not None and report_type not in {"development", "review", "test"}:
            raise bad_request("type must be development, review or test", details={"field": "type"})
        with ctx.db.reading() as conn:
            items, total = reports.list_reports(
                conn, task_id=request.query_params.get("task_id"), report_type=report_type,
                page=page, page_size=size, offset=offset)
        return _envelope(items, page, size, total)

    # ---- artifacts ----
    @app.post("/api/v1/artifacts", status_code=201)
    def register_artifact(body: ArtifactCreate, request: Request,
                          principal: Principal = Depends(get_principal)):
        correlation_id = getattr(request.state, "correlation_id", None)
        with ctx.db.transaction() as conn:
            return reports.register_artifact(conn, body, ctx.settings, principal,
                                             correlation_id, ctx.logger)

    @app.get("/api/v1/artifacts/{artifact_id}")
    def get_artifact(artifact_id: str, principal: Principal = Depends(get_principal)):
        with ctx.db.reading() as conn:
            return reports.get_artifact(conn, artifact_id, ctx.settings)

    # ---- git commits ----
    @app.post("/api/v1/commits", status_code=201)
    def register_commit(body: CommitCreate, request: Request,
                        principal: Principal = Depends(get_principal)):
        correlation_id = getattr(request.state, "correlation_id", None)
        with ctx.db.transaction() as conn:
            return reports.register_commit(conn, body, principal, correlation_id, ctx.logger)

    @app.get("/api/v1/commits")
    def list_commits(request: Request, principal: Principal = Depends(get_principal)):
        page, size, offset, sort = _paging(request, "commits")
        with ctx.db.reading() as conn:
            items, total = reports.list_commits(
                conn, task_id=request.query_params.get("task_id"),
                execution_id=request.query_params.get("execution_id"),
                page=page, page_size=size, offset=offset, sort_clause=sort)
        return _envelope(items, page, size, total)

    # ---- audit ----
    @app.get("/api/v1/audit")
    def query_audit(request: Request, principal: Principal = Depends(get_principal)):
        page, size, offset, _sort = _paging(request, "audit")
        params = request.query_params  # noqa: F841 (filters resolved via _time_filter and params.get)
        with ctx.db.reading() as conn:
            items, total = reports.list_audit(
                conn, target_type=params.get("target_type"),
                target_id=params.get("target_id"),
                action=params.get("action"),
                from_ts=_time_filter(request, "from"), to_ts=_time_filter(request, "to"),
                page=page, page_size=size, offset=offset)
        return _envelope(items, page, size, total)

    # ---- board ----
    @app.get("/api/v1/board")
    def get_board(request: Request, principal: Principal = Depends(get_principal)):
        with ctx.db.reading() as conn:
            return board_svc.get_board(conn, request.query_params.get("project_id"))

    # ---- approvals ----
    @app.post("/api/v1/approvals", status_code=201)
    def create_approval(body: ApprovalCreate, request: Request,
                        principal: Principal = Depends(get_principal)):
        correlation_id = getattr(request.state, "correlation_id", None)
        with ctx.db.transaction() as conn:
            now = utc_now()
            decided_at = now if body.decision != "PENDING" else None
            cursor = conn.execute(
                """INSERT INTO approvals(target_type, target_id, decision, actor, reason, decided_at, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (body.target_type, body.target_id, body.decision, body.actor,
                 body.reason, decided_at, now),
            )
            audit(conn, actor_id=principal.actor_id, actor_type=principal.actor_type,
                  action="approval_submitted", target_type="approval",
                  target_id=str(cursor.lastrowid), correlation_id=correlation_id,
                  details={"approval_target_type": body.target_type,
                           "approval_target_id": body.target_id,
                           "decision": body.decision, "actor": body.actor})
            row = conn.execute("SELECT * FROM approvals WHERE approval_id=?",
                               (cursor.lastrowid,)).fetchone()
        ctx.logger.info("approval_submitted",
                        f"approval {cursor.lastrowid} ({body.target_type}/{body.target_id}) = {body.decision}",
                        operation="create_approval", result="SUCCESS")
        return dict(row)

    @app.get("/api/v1/approvals")
    def list_approvals(request: Request, principal: Principal = Depends(get_principal)):
        page, size, offset, sort = _paging(request, "approvals")
        params = request.query_params
        clauses, values = [], []
        if params.get("decision"):
            clauses.append("decision=?")
            values.append(params["decision"])
        if params.get("target_type"):
            clauses.append("target_type=?")
            values.append(params["target_type"])
        if params.get("target_id"):
            clauses.append("target_id=?")
            values.append(params["target_id"])
        where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
        with ctx.db.reading() as conn:
            total = conn.execute(f"SELECT COUNT(*) AS c FROM approvals {where}", values).fetchone()["c"]
            rows = conn.execute(
                f"SELECT * FROM approvals {where} ORDER BY {sort} LIMIT ? OFFSET ?",
                (*values, size, offset)).fetchall()
        return _envelope([dict(row) for row in rows], page, size, total)

    return app
