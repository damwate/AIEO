"""C3 error boundary for every M1 HTTP response."""
from __future__ import annotations

import logging
from typing import Any
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger("aieo.platform")


class APIError(Exception):
    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        *,
        details: dict[str, Any] | None = None,
        retryable: bool = False,
        correlation_id: str | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details
        self.retryable = retryable
        self.correlation_id = correlation_id


def error_body(
    request: Request,
    code: str,
    message: str,
    *,
    details: dict[str, Any] | None = None,
    retryable: bool = False,
    correlation_id: str | None = None,
) -> dict[str, Any]:
    body: dict[str, Any] = {
        "code": code,
        "message": message,
        "retryable": retryable,
        "correlation_id": correlation_id
        or getattr(request.state, "correlation_id", None)
        or str(uuid4()),
    }
    if details is not None:
        body["details"] = details
    return body


def install_error_handlers(app: FastAPI) -> None:
    @app.middleware("http")
    async def correlation_middleware(request: Request, call_next):
        correlation_id = request.headers.get("X-Correlation-ID") or str(uuid4())
        request.state.correlation_id = correlation_id
        response = await call_next(request)
        response.headers["X-Correlation-ID"] = correlation_id
        return response

    @app.exception_handler(APIError)
    async def api_error_handler(request: Request, exc: APIError) -> JSONResponse:
        response = JSONResponse(
            status_code=exc.status_code,
            content=error_body(
                request,
                exc.code,
                exc.message,
                details=exc.details,
                retryable=exc.retryable,
                correlation_id=exc.correlation_id,
            ),
        )
        response.headers["X-Correlation-ID"] = exc.correlation_id or request.state.correlation_id
        return response

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        fields = []
        for item in exc.errors():
            fields.append(
                {
                    "field": ".".join(str(part) for part in item.get("loc", ())),
                    "reason": item.get("msg", "invalid value"),
                    "type": item.get("type", "validation_error"),
                }
            )
        return JSONResponse(
            status_code=422,
            content=error_body(
                request,
                "REQ-0002",
                "SCHEMA_VALIDATION_FAILED: request validation failed",
                details={"fields": fields},
            ),
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_error_handler(
        request: Request, exc: StarletteHTTPException
    ) -> JSONResponse:
        if exc.status_code == 404:
            code, message = "RES-0001", "RESOURCE_NOT_FOUND: endpoint or resource not found"
        elif exc.status_code == 405:
            code, message = "REQ-0001", "INVALID_ARGUMENT: method not allowed"
        else:
            code, message = "REQ-0001", "INVALID_ARGUMENT: invalid HTTP request"
        return JSONResponse(
            status_code=exc.status_code,
            content=error_body(request, code, message),
        )

    @app.exception_handler(Exception)
    async def internal_error_handler(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled M1 request error", exc_info=exc)
        return JSONResponse(
            status_code=500,
            content=error_body(
                request,
                "SYS-0001",
                "INTERNAL_ERROR: platform request failed",
            ),
        )


def not_found(resource: str, resource_id: str) -> APIError:
    return APIError(
        404,
        "RES-0001",
        f"RESOURCE_NOT_FOUND: {resource} {resource_id} does not exist",
        details={"resource": resource, "id": resource_id},
    )


def conflict(message: str, details: dict[str, Any] | None = None) -> APIError:
    return APIError(409, "RES-0002", f"RESOURCE_CONFLICT: {message}", details=details)


def bad_request(message: str, details: dict[str, Any] | None = None) -> APIError:
    return APIError(400, "REQ-0001", f"INVALID_ARGUMENT: {message}", details=details)


def schema_validation(message: str, details: dict[str, Any] | None = None) -> APIError:
    return APIError(422, "REQ-0002", f"SCHEMA_VALIDATION_FAILED: {message}", details=details)


def unsupported_version(message: str, details: dict[str, Any] | None = None) -> APIError:
    return APIError(400, "REQ-0003", f"UNSUPPORTED_VERSION: {message}", details=details)


def duplicate_message(message: str, details: dict[str, Any] | None = None) -> APIError:
    return APIError(409, "RES-0003", f"DUPLICATE_MESSAGE: {message}", details=details)


def invalid_transition(message: str, details: dict[str, Any] | None = None) -> APIError:
    return APIError(409, "TASK-0001", f"INVALID_STATE_TRANSITION: {message}", details=details)


def dependency_not_ready(message: str, details: dict[str, Any] | None = None) -> APIError:
    return APIError(409, "TASK-0002", f"DEPENDENCY_NOT_READY: {message}", details=details)


def task_already_claimed(message: str, details: dict[str, Any] | None = None) -> APIError:
    return APIError(409, "TASK-0003", f"TASK_ALREADY_CLAIMED: {message}", details=details)


def artifact_not_found(artifact_id: str) -> APIError:
    return APIError(
        404,
        "ART-0001",
        f"ARTIFACT_NOT_FOUND: artifact {artifact_id} does not exist",
        details={"artifact_id": artifact_id},
    )


def artifact_hash_mismatch(message: str, details: dict[str, Any] | None = None) -> APIError:
    return APIError(422, "ART-0002", f"ARTIFACT_HASH_MISMATCH: {message}", details=details)


def git_base_mismatch(message: str, details: dict[str, Any] | None = None) -> APIError:
    return APIError(409, "GIT-0002", f"GIT_BASE_MISMATCH: {message}", details=details)
