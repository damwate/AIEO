"""AIEO Phase 1 M4: minimal, fail-closed Git Worker.

Exports the module-boundaries §2 M4 capability surface plus the injected
M1 boundary (``M1Client`` protocol) and the C4 NDJSON run logger.
M1 implementations are NOT imported here -- only the contract interface.
"""

from .worker import (
    ALLOWED_GIT_SUBCOMMANDS,
    AuditContext,
    GitWorker,
    GitWorkerError,
    M1Client,
    NdjsonLogger,
    TestRunResult,
)

__all__ = [
    "ALLOWED_GIT_SUBCOMMANDS",
    "AuditContext",
    "GitWorker",
    "GitWorkerError",
    "M1Client",
    "NdjsonLogger",
    "TestRunResult",
]
