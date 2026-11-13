# -*- coding: utf-8 -*-
"""AIEO Phase 1 M4 Git Worker -- fail-closed Git CLI wrapper.

Contract sources (all v1.0.0 unless noted):
- docs/phase1/platform-contract-v1.0.md
    §3 C2   git_commits / artifacts / audit_logs data model
    §4 C3   unified error schema (code / message / details / retryable / correlation_id)
    §5 C4   NDJSON run logs (service=git_worker, module=M4)
    §6 C5   branch policy, commit message format, protected main
    §7 C6   AIEO_GIT_PATH / AIEO_LOG_DIR / AIEO_ENV / AIEO_LOG_RETENTION_DAYS
    §11.4   Git/DB transaction boundary (M1 registration is injected here)
- docs/phase1/module-boundaries.md §2 M4 interface draft + §7 MINOR-005
- docs/立项/04-任务状态机数据库与Git规范.md §6 (no direct writes to main)
- phase0/git-poc/git_collect.py (POC-04, 9/9 PASS -- flow reference)

Security model
--------------
1. Every git invocation goes through ``GitWorker._run_git_at``:
   - the subcommand must be in ``ALLOWED_GIT_SUBCOMMANDS`` (whitelist);
   - every argv token is type/length checked and must not contain NUL/CR/LF;
   - ``subprocess.run(..., shell=False)`` only -- no shell string anywhere.
2. ``repo`` must be an existing directory that is the top-level of a git
   work tree (``rev-parse --show-toplevel`` must resolve back to it).
3. GIT_DIR / GIT_WORK_TREE / GIT_INDEX_FILE / ... are stripped from the
   subprocess environment so a caller cannot redirect the repository.
4. Protected branches (main/master) refuse direct writes: commits and
   branch creation targeting them raise AUTH-0002; merges always fail
   closed (merge requires the human approval flow, contract §6.3).
5. Git executable path is configurable (MINOR-005): constructor ``git_path``
   > ``AIEO_GIT_PATH`` > ``"git"`` (PATH lookup). No absolute path is
   hard-coded.

C4 logging
----------
Run logs are NDJSON (one JSON object per line) written to
``<log-root>/git_worker/git_worker-YYYYMMDD.ndjson`` where ``<log-root>``
is: constructor ``log_dir`` (verbatim) > ``AIEO_LOG_DIR`` > default
``runtime/logs``.  Audit/accountability events go through the injected
``M1Client`` into M1's audit_logs; run logs never replace audit_logs (§5.3).
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import subprocess
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path, PurePosixPath
from typing import Iterable, Mapping, Protocol, Sequence, runtime_checkable

# --------------------------------------------------------------------------
# constants and validation patterns (C3/C5/C2)
# --------------------------------------------------------------------------

_FULL_SHA = re.compile(r"^[0-9a-f]{40}$")
_ERROR_CODE = re.compile(r"^[A-Z]{3,8}-\d{4}$")
_TASK_ID = re.compile(r"^T-(P\d+-)?\d{3,}$")
_EXECUTION_ID = re.compile(r"^EXEC-\d{3,}$")
_CORRELATION_ID = re.compile(r"^CORR-\d+$")
_TASK_BRANCH = re.compile(
    r"^(feature|fix)/T-(P\d+-)?\d{3,}-[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$"
)
_COMMIT_SUBJECT = re.compile(
    r"^(feat|fix|docs|test|refactor|chore)\("
    r"(platform|gpt_controller|zcode_bridge|git_worker|docs|contract|phase0|release)"
    r"\): \S.{0,71}$"
)
_PROTECTED_BRANCHES = frozenset({"main", "master"})

#: The only git subcommands this worker may ever execute (whitelist).
#: Everything that mutates remote state or rewrites history (push, pull,
#: fetch, merge, rebase, reset, checkout, filter-branch, ...) is absent
#: by design; merging is refused outright (contract §6.3).
ALLOWED_GIT_SUBCOMMANDS = frozenset(
    {
        "status",
        "rev-parse",
        "symbolic-ref",
        "show-ref",
        "switch",
        "add",
        "commit",
        "diff",
        "merge-base",
    }
)

#: GIT_* environment variables that could redirect the repository location;
#: stripped from the subprocess environment before every invocation.
_UNSAFE_GIT_ENV_VARS = (
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_INDEX_FILE",
    "GIT_OBJECT_DIRECTORY",
    "GIT_ALTERNATE_OBJECT_DIRECTORIES",
    "GIT_COMMON_DIR",
    "GIT_NAMESPACE",
)

_ACTOR_ID = "M4-GIT-WORKER"
_MAX_ARG_LENGTH = 4096
_MAX_STDERR_SNIPPET = 4000


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _same_path(left: Path, right: Path) -> bool:
    return os.path.normcase(str(left)) == os.path.normcase(str(right))


def _sha256_bytes(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def _git_env() -> dict[str, str]:
    env = dict(os.environ)
    for key in _UNSAFE_GIT_ENV_VARS:
        env.pop(key, None)
    return env


# --------------------------------------------------------------------------
# C3 unified error type
# --------------------------------------------------------------------------


class GitWorkerError(Exception):
    """Error carrying the C3 uniform schema (contract §4.2).

    ``to_dict()`` returns exactly::

        {"code", "message", "retryable", "correlation_id"[, "details"]}
    """

    def __init__(
        self,
        code: str,
        message: str,
        *,
        details: Mapping[str, object] | None = None,
        retryable: bool = False,
        correlation_id: str | None = None,
    ) -> None:
        if not _ERROR_CODE.fullmatch(code):
            raise ValueError(f"invalid C3 error code: {code!r}")
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = dict(details or {})
        self.retryable = bool(retryable)
        self.correlation_id = correlation_id or str(uuid.uuid4())

    def to_dict(self) -> dict[str, object]:
        result: dict[str, object] = {
            "code": self.code,
            "message": self.message,
            "retryable": self.retryable,
            "correlation_id": self.correlation_id,
        }
        if self.details:
            result["details"] = self.details
        return result


# --------------------------------------------------------------------------
# audit context and injected M1 boundary
# --------------------------------------------------------------------------


@dataclass(frozen=True)
class AuditContext:
    """Task/execution correlation for mutating operations (C2 IDs, §3.2).

    ``repository_id`` is the M1 ``repositories`` row ID (``REPO-...``); it is
    required for M1 ``git_commits`` registration when an ``M1Client`` is
    configured (contract §11.4).
    """

    task_id: str
    execution_id: str
    correlation_id: str
    repository_id: str | None = None

    def validate(self) -> None:
        if not _TASK_ID.fullmatch(self.task_id):
            raise GitWorkerError(
                "REQ-0001",
                "INVALID_TASK_ID",
                details={"field": "task_id"},
                correlation_id=self.correlation_id,
            )
        if not _EXECUTION_ID.fullmatch(self.execution_id):
            raise GitWorkerError(
                "REQ-0001",
                "INVALID_EXECUTION_ID",
                details={"field": "execution_id"},
                correlation_id=self.correlation_id,
            )
        try:
            is_uuid4 = uuid.UUID(self.correlation_id).version == 4
        except (ValueError, AttributeError, TypeError):
            is_uuid4 = False
        if not _CORRELATION_ID.fullmatch(self.correlation_id) and not is_uuid4:
            raise GitWorkerError(
                "REQ-0001",
                "INVALID_CORRELATION_ID",
                details={"field": "correlation_id"},
            )
        if self.repository_id is not None and (
            not isinstance(self.repository_id, str) or not self.repository_id.strip()
        ):
            raise GitWorkerError(
                "REQ-0001",
                "INVALID_REPOSITORY_ID",
                details={"field": "repository_id"},
            )


@runtime_checkable
class M1Client(Protocol):
    """Boundary towards M1 (contract §3.3 / §11.4) -- injectable, no import.

    Implementations belong to M1 (REST client) or to tests (in-memory fake).
    M4 never imports M1 code; it only depends on these method signatures.

    - ``register_commit`` mirrors the ``git_commits`` table and is idempotent
      on ``UNIQUE(repository_id, sha)`` (§11.4-④: re-registration after a
      failure must not duplicate rows).
    - ``register_artifact`` mirrors the ``artifacts`` table (``type='DIFF'``
      for commit diffs) and is idempotent on unique ``path``.  ``path`` is a
      repo-relative POSIX identity path (M1 ``validate_artifact_path`` rejects
      absolute/backslash paths); the worker's local ``diff_dir`` file stays the
      physical evidence location.
    - ``record_audit`` mirrors ``audit_logs`` (§5.3: 追责走审计，不靠运行日志).
    """

    def register_commit(
        self,
        *,
        task_id: str,
        execution_id: str,
        repository_id: str,
        branch: str,
        sha: str,
        base_commit: str,
        diff_artifact_id: str | None = None,
    ) -> str: ...

    def register_artifact(
        self,
        *,
        task_id: str | None,
        artifact_type: str,
        path: str,
        sha256: str,
    ) -> str: ...

    def record_audit(
        self,
        *,
        actor_id: str,
        actor_type: str,
        action: str,
        target_type: str,
        target_id: str,
        result: str,
        reason: str | None = None,
        correlation_id: str | None = None,
        details: Mapping[str, object] | None = None,
    ) -> str: ...


# --------------------------------------------------------------------------
# C4 NDJSON run logger
# --------------------------------------------------------------------------


class NdjsonLogger:
    """C4 §5 run logger: one JSON object per line, date-rotated, UTC.

    Required fields per record: timestamp, level, service, module, event,
    message, env (§5.1).  Optional C4 fields are passed as keyword arguments
    by the caller.  Retention default is 30 days (C6 ``AIEO_LOG_RETENTION_DAYS``).
    """

    _DEFAULT_RETENTION_DAYS = 30

    def __init__(
        self,
        log_dir: os.PathLike[str] | str,
        *,
        env: str,
        service: str = "git_worker",
        module: str = "M4",
        retention_days: int = _DEFAULT_RETENTION_DAYS,
    ) -> None:
        if not isinstance(env, str) or not env.strip():
            raise GitWorkerError("REQ-0001", "INVALID_LOG_ENV")
        if int(retention_days) < 1:
            raise GitWorkerError("REQ-0001", "INVALID_LOG_RETENTION_DAYS")
        self.log_dir = Path(log_dir)
        self.env = env
        self.service = service
        self.module = module
        self.retention_days = int(retention_days)
        self._purge_expired()

    def _log_file(self) -> Path:
        today = datetime.now(timezone.utc).strftime("%Y%m%d")
        return self.log_dir / f"{self.service}-{today}.ndjson"

    def write(self, event: str, message: str, *, level: str = "INFO", **fields: object) -> None:
        record: dict[str, object] = {
            "timestamp": _utc_now(),
            "level": level,
            "service": self.service,
            "module": self.module,
            "event": event,
            "message": message,
            "env": self.env,
        }
        for key, value in fields.items():
            if value is not None:
                record[key] = value
        line = json.dumps(record, ensure_ascii=False, default=str)
        try:
            self.log_dir.mkdir(parents=True, exist_ok=True)
            with self._log_file().open("a", encoding="utf-8") as stream:
                stream.write(line + "\n")
        except OSError as exc:
            raise GitWorkerError(
                "SYS-0001",
                "LOG_WRITE_FAILED",
                details={"log_dir": str(self.log_dir)},
            ) from exc

    def _purge_expired(self) -> None:
        """Best-effort date-based retention purge (C4 §5.2).

        Individual deletion failures are skipped so a locked stale file from
        another process cannot break logging; write failures themselves still
        raise (SYS-0001).
        """
        cutoff = datetime.now(timezone.utc) - timedelta(days=self.retention_days)
        cutoff_str = cutoff.strftime("%Y%m%d")
        try:
            candidates = list(self.log_dir.glob(f"{self.service}-*.ndjson"))
        except OSError:
            return
        for path in candidates:
            date_part = path.stem.rsplit("-", 1)[-1]
            if date_part.isdigit() and date_part < cutoff_str:
                try:
                    path.unlink()
                except OSError:
                    continue


# --------------------------------------------------------------------------
# git executable resolution (C6 / MINOR-005)
# --------------------------------------------------------------------------


def _resolve_git_executable(configured: str) -> str:
    """Resolve the configured git path: explicit file wins, then PATH lookup."""
    candidate = Path(configured)
    is_path_form = candidate.is_absolute() or "/" in configured or "\\" in configured
    if is_path_form and candidate.is_file():
        return str(candidate)
    found = shutil.which(configured)
    if found is not None:
        return found
    if candidate.is_file():
        return str(candidate.resolve())
    raise GitWorkerError(
        "SYS-0001",
        "GIT_EXECUTABLE_NOT_FOUND",
        details={"configured_git": str(configured)},
    )


# --------------------------------------------------------------------------
# the worker
# --------------------------------------------------------------------------


@dataclass(frozen=True)
class TestRunResult:
    command: tuple[str, ...]
    exit_code: int
    started_at: str
    finished_at: str
    duration_ms: int
    log_path: str
    log_sha256: str

    def to_dict(self) -> dict[str, object]:
        return {
            "command": list(self.command),
            "exit_code": self.exit_code,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
            "duration_ms": self.duration_ms,
            "log_path": self.log_path,
            "log_sha256": self.log_sha256,
        }


class GitWorker:
    """Git capability module M4 (module-boundaries §2 M4 interface draft).

    Public interface (draft signatures; keyword extras are optional):

    - ``repo_status(repo)``
    - ``record_baseline(repo)``
    - ``create_branch(repo, name)``
    - ``commit_and_collect(repo, message)`` -> sha + diff evidence
    - ``check_clean(repo)``
    - ``read_diff(repo, base, target)``

    ``repo`` is a filesystem path to an existing git work-tree top level.
    """

    ACTOR_ID = _ACTOR_ID

    def __init__(
        self,
        *,
        git_path: str | os.PathLike[str] | None = None,
        git_timeout_seconds: float = 30.0,
        log_dir: os.PathLike[str] | str | None = None,
        diff_dir: os.PathLike[str] | str | None = None,
        m1_client: M1Client | None = None,
        env: str | None = None,
        retention_days: int | None = None,
    ) -> None:
        configured_git = (
            os.fspath(git_path)
            if git_path is not None
            else (os.environ.get("AIEO_GIT_PATH") or "git")
        )
        self.git_path = _resolve_git_executable(configured_git)
        if git_timeout_seconds <= 0:
            raise GitWorkerError("REQ-0001", "INVALID_GIT_TIMEOUT")
        self.git_timeout_seconds = float(git_timeout_seconds)
        self.m1_client = m1_client
        self.env = env or os.environ.get("AIEO_ENV") or "development"
        if retention_days is None:
            raw_retention = os.environ.get("AIEO_LOG_RETENTION_DAYS", "30")
            try:
                retention_days = int(raw_retention)
            except ValueError as exc:
                raise GitWorkerError(
                    "REQ-0001",
                    "INVALID_LOG_RETENTION_DAYS",
                    details={"value": raw_retention},
                ) from exc
        # log_dir (verbatim service dir) > AIEO_LOG_DIR (root) > runtime/logs
        if log_dir is not None:
            service_log_dir = Path(log_dir)
        else:
            log_root = os.environ.get("AIEO_LOG_DIR") or "runtime/logs"
            service_log_dir = Path(log_root) / "git_worker"
        self.log_dir = service_log_dir
        self.diff_dir = Path(diff_dir) if diff_dir is not None else service_log_dir / "diffs"
        self.logger = NdjsonLogger(
            service_log_dir, env=self.env, retention_days=retention_days
        )

    # ---------------- C4 log helpers ----------------

    def _log(
        self,
        event: str,
        message: str,
        *,
        level: str = "INFO",
        operation: str | None = None,
        result: str | None = None,
        context: AuditContext | None = None,
        repo: os.PathLike[str] | str | None = None,
        error: GitWorkerError | None = None,
        duration_ms: int | None = None,
        **fields: object,
    ) -> None:
        record: dict[str, object] = {}
        if operation is not None:
            record["operation"] = operation
        if result is not None:
            record["result"] = result
        if context is not None:
            record["task_id"] = context.task_id
            record["execution_id"] = context.execution_id
            record["correlation_id"] = context.correlation_id
            if context.repository_id:
                record["repository_id"] = context.repository_id
        if repo is not None:
            record["repo"] = str(repo)
        if error is not None:
            record["error_code"] = error.code
            record["retryable"] = error.retryable
        if duration_ms is not None:
            record["duration_ms"] = max(0, int(duration_ms))
        for key, value in fields.items():
            if value is not None:
                record[key] = value
        self.logger.write(event, message, level=level, **record)

    def _m1_audit(
        self,
        *,
        context: AuditContext | None,
        action: str,
        target_type: str,
        target_id: str,
        result: str,
        reason: str | None = None,
        details: Mapping[str, object] | None = None,
    ) -> bool:
        """Write an audit_logs row through M1. Returns True when written.

        Failures are logged (never silently swallowed, §5.5) but do not
        abort the git operation; callers decide how registration failures
        surface.
        """
        if self.m1_client is None or context is None:
            return False
        try:
            self.m1_client.record_audit(
                actor_id=self.ACTOR_ID,
                actor_type="agent",
                action=action,
                target_type=target_type,
                target_id=target_id,
                result=result,
                reason=reason,
                correlation_id=context.correlation_id,
                details=details,
            )
            return True
        except Exception as exc:  # noqa: BLE001 -- boundary must not crash M4
            self._log(
                "audit.m1_write_failed",
                f"M1 audit write failed for action={action}: {exc}",
                level="ERROR",
                operation=action,
                result="FAILURE",
                context=context,
                error=GitWorkerError("SYS-0001", "M1_AUDIT_WRITE_FAILED"),
                target_id=target_id,
            )
            return False

    # ---------------- command and repository boundaries ----------------

    @staticmethod
    def _validate_git_argv(args: Sequence[str]) -> None:
        """Whitelist + argument validation (the single invocation choke point)."""
        if isinstance(args, (str, bytes)) or not args:
            raise GitWorkerError("REQ-0001", "INVALID_GIT_ARGS")
        for token in args:
            if not isinstance(token, str):
                raise GitWorkerError(
                    "REQ-0001",
                    "INVALID_GIT_ARG",
                    details={"reason": "argv token must be str"},
                )
            if not token or len(token) > _MAX_ARG_LENGTH:
                raise GitWorkerError(
                    "REQ-0001",
                    "INVALID_GIT_ARG",
                    details={"reason": "argv token length out of range"},
                )
            if any(ch in token for ch in ("\0", "\n", "\r")):
                raise GitWorkerError(
                    "REQ-0001",
                    "INVALID_GIT_ARG",
                    details={"reason": "argv token contains NUL/CR/LF"},
                )
        subcommand = args[0]
        if subcommand not in ALLOWED_GIT_SUBCOMMANDS:
            raise GitWorkerError(
                "AUTH-0002",
                "GIT_SUBCOMMAND_NOT_WHITELISTED",
                details={
                    "subcommand": subcommand,
                    "allowed": sorted(ALLOWED_GIT_SUBCOMMANDS),
                },
            )

    def _run_git_at(
        self,
        path: Path,
        args: Sequence[str],
        *,
        check: bool = True,
        timeout_seconds: float | None = None,
    ) -> subprocess.CompletedProcess[str]:
        self._validate_git_argv(args)
        command = [self.git_path, *args]
        try:
            completed = subprocess.run(
                command,
                cwd=path,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                shell=False,
                timeout=timeout_seconds or self.git_timeout_seconds,
                check=False,
                env=_git_env(),
            )
        except subprocess.TimeoutExpired as exc:
            raise GitWorkerError(
                "SYS-0003",
                "GIT_COMMAND_TIMEOUT",
                details={"git_args": list(args)},
            ) from exc
        except OSError as exc:
            raise GitWorkerError(
                "SYS-0001",
                "GIT_COMMAND_START_FAILED",
                details={"git_args": list(args), "reason": str(exc)},
            ) from exc
        if check and completed.returncode != 0:
            raise GitWorkerError(
                "SYS-0001",
                "GIT_COMMAND_FAILED",
                details={
                    "git_args": list(args),
                    "exit_code": completed.returncode,
                    "stderr": completed.stderr.strip()[:_MAX_STDERR_SNIPPET],
                },
            )
        return completed

    def _git(
        self, path: Path, args: Sequence[str], *, check: bool = True
    ) -> subprocess.CompletedProcess[str]:
        return self._run_git_at(path, args, check=check)

    def _repo_path(self, repo: os.PathLike[str] | str) -> Path:
        """Validate ``repo``: must exist, be a directory, and be a git work
        tree whose top level equals the given path itself."""
        if isinstance(repo, os.PathLike):
            raw = os.fspath(repo)
        elif isinstance(repo, str):
            raw = repo
        else:
            raise GitWorkerError(
                "REQ-0001",
                "INVALID_REPOSITORY_PATH",
                details={"field": "repo"},
            )
        if not raw or "\0" in raw:
            raise GitWorkerError(
                "REQ-0001",
                "INVALID_REPOSITORY_PATH",
                details={"field": "repo"},
            )
        try:
            path = Path(raw).expanduser().resolve(strict=True)
        except (OSError, RuntimeError) as exc:
            raise GitWorkerError(
                "RES-0001",
                "REPOSITORY_NOT_FOUND",
                details={"repo": str(raw)},
            ) from exc
        if not path.is_dir():
            raise GitWorkerError(
                "RES-0001",
                "REPOSITORY_NOT_FOUND",
                details={"repo": str(raw)},
            )
        probe = self._run_git_at(path, ["rev-parse", "--show-toplevel"], check=False)
        if probe.returncode != 0:
            raise GitWorkerError(
                "RES-0001",
                "GIT_REPOSITORY_NOT_FOUND",
                details={
                    "repo": str(raw),
                    "git_stderr": probe.stderr.strip()[:300],
                },
            )
        top_level = Path(probe.stdout.strip()).resolve()
        if not _same_path(path, top_level):
            raise GitWorkerError(
                "RES-0001",
                "GIT_REPOSITORY_ROOT_MISMATCH",
                details={"repo": str(raw), "toplevel": str(top_level)},
            )
        return path

    # ---------------- read-only status and object checks ----------------

    @staticmethod
    def _parse_status(raw: str) -> list[dict[str, str | None]]:
        records = raw.split("\0")
        changes: list[dict[str, str | None]] = []
        index = 0
        while index < len(records):
            entry = records[index]
            index += 1
            if not entry:
                continue
            if len(entry) < 4:
                raise GitWorkerError("SYS-0001", "UNEXPECTED_GIT_STATUS")
            xy = entry[:2]
            path = entry[3:]
            original_path = None
            if "R" in xy or "C" in xy:
                if index >= len(records) or not records[index]:
                    raise GitWorkerError("SYS-0001", "UNEXPECTED_GIT_RENAME_STATUS")
                original_path = records[index]
                index += 1
            changes.append(
                {
                    "index_status": xy[0],
                    "worktree_status": xy[1],
                    "path": path,
                    "original_path": original_path,
                }
            )
        return changes

    def repo_status(self, repo: os.PathLike[str] | str) -> dict[str, object]:
        path = self._repo_path(repo)
        status = self._run_git_at(
            path,
            ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
        )
        branch_probe = self._run_git_at(
            path, ["symbolic-ref", "--quiet", "--short", "HEAD"], check=False
        )
        changes = self._parse_status(status.stdout)
        return {
            "repo": str(path),
            "branch": branch_probe.stdout.strip() if branch_probe.returncode == 0 else None,
            "detached_head": branch_probe.returncode != 0,
            "clean": not changes,
            "changes": changes,
            "timestamp": _utc_now(),
        }

    def check_clean(self, repo: os.PathLike[str] | str) -> bool:
        return bool(self.repo_status(repo)["clean"])

    def _ensure_clean(self, path: Path, correlation_id: str | None = None) -> None:
        status = self.repo_status(path)
        if not status["clean"]:
            raise GitWorkerError(
                "GIT-0001",
                "GIT_WORKTREE_DIRTY",
                details={
                    "repo": str(path),
                    "changed_files": self._paths_from_status(status["changes"]),
                },
                correlation_id=correlation_id,
            )

    def _resolve_commit(self, path: Path, revision: str) -> str:
        if not isinstance(revision, str) or not revision or "\0" in revision:
            raise GitWorkerError(
                "REQ-0001", "INVALID_COMMIT_REVISION", details={"field": "commit"}
            )
        probe = self._git(
            path,
            ["rev-parse", "--verify", "--end-of-options", f"{revision}^{{commit}}"],
            check=False,
        )
        resolved = probe.stdout.strip()
        if probe.returncode != 0 or not _FULL_SHA.fullmatch(resolved):
            raise GitWorkerError(
                "RES-0001",
                "GIT_COMMIT_NOT_FOUND",
                details={"repo": str(path), "revision": revision},
            )
        return resolved

    @staticmethod
    def _require_full_sha(value: str, field: str) -> None:
        if not isinstance(value, str) or not _FULL_SHA.fullmatch(value):
            raise GitWorkerError(
                "REQ-0001",
                "FULL_COMMIT_SHA_REQUIRED",
                details={"field": field},
            )

    def commit_exists(self, repo: os.PathLike[str] | str, revision: str) -> bool:
        path = self._repo_path(repo)
        try:
            self._resolve_commit(path, revision)
            return True
        except GitWorkerError as exc:
            if exc.code == "RES-0001":
                return False
            raise

    def branch_exists(self, repo: os.PathLike[str] | str, branch: str) -> bool:
        path = self._repo_path(repo)
        return self._branch_exists(path, branch)

    def _branch_exists(self, path: Path, branch: str) -> bool:
        if not isinstance(branch, str) or not branch or "\0" in branch:
            return False
        probe = self._git(
            path,
            ["show-ref", "--verify", "--quiet", f"refs/heads/{branch}"],
            check=False,
        )
        if probe.returncode == 0:
            return True
        if probe.returncode == 1:
            return False
        raise GitWorkerError(
            "SYS-0001",
            "GIT_BRANCH_CHECK_FAILED",
            details={
                "repo": str(path),
                "branch": branch,
                "stderr": probe.stderr.strip()[:_MAX_STDERR_SNIPPET],
            },
        )

    def _require_branch(self, path: Path, branch: str) -> None:
        if not self._branch_exists(path, branch):
            raise GitWorkerError(
                "RES-0001",
                "GIT_BRANCH_NOT_FOUND",
                details={"repo": str(path), "branch": branch},
            )

    def record_baseline(
        self,
        repo: os.PathLike[str] | str,
        *,
        context: AuditContext | None = None,
    ) -> str:
        """Record the development baseline commit (04-规范 §6-2). Full 40-hex SHA."""
        if context is not None:
            self._validate_context(context)
        path = self._repo_path(repo)
        baseline = self._resolve_commit(path, "HEAD")
        branch = self.repo_status(path)["branch"]
        self._log(
            "git.baseline_recorded",
            f"baseline recorded: {baseline}",
            operation="record_baseline",
            result="SUCCESS",
            context=context,
            repo=repo,
            branch=branch,
            base_commit=baseline,
        )
        self._m1_audit(
            context=context,
            action="record_baseline",
            target_type="repository",
            target_id=context.repository_id if context and context.repository_id else str(path),
            result="SUCCESS",
            details={"base_commit": baseline, "branch": branch},
        )
        return baseline

    # ---------------- branch operations ----------------

    @staticmethod
    def _validate_context(context: AuditContext) -> None:
        if not isinstance(context, AuditContext):
            raise GitWorkerError("REQ-0001", "AUDIT_CONTEXT_REQUIRED")
        context.validate()

    @staticmethod
    def _validate_task_branch(branch: str) -> None:
        if not isinstance(branch, str) or not _TASK_BRANCH.fullmatch(branch):
            raise GitWorkerError(
                "REQ-0001",
                "INVALID_TASK_BRANCH_NAME",
                details={"field": "branch"},
            )

    def create_branch(
        self,
        repo: os.PathLike[str] | str,
        name: str,
        *,
        base_commit: str | None = None,
        context: AuditContext | None = None,
    ) -> str:
        """Create and switch to a task branch (C5 §6.1 naming, 04-规范 §6).

        Refuses protected branch names (AUTH-0002), names outside the C5
        task-branch regex (REQ-0001), dirty worktrees (GIT-0001) and
        existing branches (RES-0002).
        """
        started = time.monotonic()
        try:
            return self._create_branch(repo, name, base_commit=base_commit, context=context)
        except GitWorkerError as exc:
            self._log(
                "git.branch_created",
                f"create_branch failed: {exc.code} {exc.message}",
                level="ERROR",
                operation="create_branch",
                result="FAILURE",
                context=context,
                repo=repo,
                error=exc,
                branch=name if isinstance(name, str) else None,
                duration_ms=round((time.monotonic() - started) * 1000),
            )
            raise

    def _create_branch(
        self,
        repo: os.PathLike[str] | str,
        name: str,
        *,
        base_commit: str | None,
        context: AuditContext | None,
    ) -> str:
        if context is not None:
            self._validate_context(context)
        path = self._repo_path(repo)
        if name in _PROTECTED_BRANCHES:
            raise GitWorkerError(
                "AUTH-0002",
                "PROTECTED_BRANCH_CREATE_FORBIDDEN",
                details={"branch": name},
                correlation_id=context.correlation_id if context else None,
            )
        self._validate_task_branch(name)
        base = base_commit or self.record_baseline(repo, context=context)
        self._require_full_sha(base, "base_commit")
        base = self._resolve_commit(path, base)
        self._ensure_clean(path, context.correlation_id if context else None)
        if self._branch_exists(path, name):
            raise GitWorkerError(
                "RES-0002",
                "GIT_BRANCH_ALREADY_EXISTS",
                details={"repo": str(path), "branch": name},
                correlation_id=context.correlation_id if context else None,
            )
        started_at = time.monotonic()
        self._git(path, ["switch", "--create", name, base])
        duration_ms = round((time.monotonic() - started_at) * 1000)
        self._log(
            "git.branch_created",
            f"branch created: {name} at {base}",
            operation="create_branch",
            result="SUCCESS",
            context=context,
            repo=repo,
            branch=name,
            base_commit=base,
            duration_ms=duration_ms,
        )
        self._m1_audit(
            context=context,
            action="git.branch_created",
            target_type="repository",
            target_id=context.repository_id if context and context.repository_id else str(path),
            result="SUCCESS",
            details={"branch": name, "base_commit": base},
        )
        return name

    # ---------------- scope validation (GIT-0003) ----------------

    @staticmethod
    def _paths_from_status(changes: Iterable[Mapping[str, str | None]]) -> list[str]:
        paths: set[str] = set()
        for change in changes:
            path = change.get("path")
            original = change.get("original_path")
            if path:
                paths.add(path)
            if original:
                paths.add(original)
        return sorted(paths)

    @staticmethod
    def _path_is_safe(path: str, *, allow_directory_suffix: bool = False) -> bool:
        if not isinstance(path, str) or not path or "\0" in path or "\\" in path:
            return False
        candidate = path[:-1] if allow_directory_suffix and path.endswith("/") else path
        if not candidate or candidate.startswith("/") or re.match(r"^[A-Za-z]:", candidate):
            return False
        parts = candidate.split("/")
        if any(part in {"", ".", "..", ".git"} for part in parts):
            return False
        return PurePosixPath(candidate).as_posix() == candidate

    @classmethod
    def validate_scope(
        cls,
        changed_files: Iterable[str],
        files_scope: Sequence[str],
        *,
        correlation_id: str | None = None,
    ) -> None:
        """GIT-0003: diff must stay inside the task's allowed file scope."""
        if isinstance(files_scope, (str, bytes)) or not isinstance(files_scope, Sequence):
            raise GitWorkerError(
                "REQ-0001",
                "INVALID_FILES_SCOPE",
                details={"field": "files_scope"},
                correlation_id=correlation_id,
            )
        scopes = list(files_scope)
        if any(not cls._path_is_safe(scope, allow_directory_suffix=True) for scope in scopes):
            raise GitWorkerError(
                "REQ-0001",
                "INVALID_FILES_SCOPE_PATH",
                details={"field": "files_scope"},
                correlation_id=correlation_id,
            )
        changed = list(changed_files)
        unsafe = [path for path in changed if not cls._path_is_safe(path)]
        outside = []
        for path in changed:
            if path in unsafe:
                continue
            allowed = any(
                path == scope or (scope.endswith("/") and path.startswith(scope))
                for scope in scopes
            )
            if not allowed:
                outside.append(path)
        if unsafe or outside:
            raise GitWorkerError(
                "GIT-0003",
                "GIT_SCOPE_VIOLATION",
                details={
                    "unsafe_paths": sorted(unsafe),
                    "outside_files_scope": sorted(outside),
                    "changed_files": sorted(changed),
                    "files_scope": scopes,
                },
                correlation_id=correlation_id,
            )

    # ---------------- diff reading ----------------

    @staticmethod
    def _nul_separated_paths(raw: str) -> list[str]:
        return [item for item in raw.split("\0") if item]

    def read_diff(
        self,
        repo: os.PathLike[str] | str,
        base: str,
        target: str = "HEAD",
    ) -> dict[str, object]:
        """Read the diff between two commits (``git diff base target``).

        Both revisions are resolved to full 40-hex SHAs first, so callers
        cannot smuggle flags or range shortcuts through ``base``/``target``.
        """
        path = self._repo_path(repo)
        base_sha = self._resolve_commit(path, base)
        target_sha = self._resolve_commit(path, target)
        names = self._git(
            path,
            ["diff", "--name-only", "-z", "--no-renames", base_sha, target_sha, "--"],
        ).stdout
        changed_files = self._nul_separated_paths(names)
        diff = self._git(
            path,
            [
                "diff",
                "--no-color",
                "--no-ext-diff",
                "--no-renames",
                base_sha,
                target_sha,
                "--",
            ],
        ).stdout
        return {
            "repo": str(path),
            "base_commit": base_sha,
            "commit_sha": target_sha,
            "changed_files": changed_files,
            "diff": diff,
            "diff_sha256": _sha256_bytes(diff.encode("utf-8", errors="replace")),
            "timestamp": _utc_now(),
        }

    # ---------------- delivery validation (agent-contract §4 capability) ----

    @staticmethod
    def _is_ancestor_probe_failed(
        probe: subprocess.CompletedProcess[str],
        *,
        repo: str,
        ancestor: str,
        descendant: str,
    ) -> bool:
        """Return True when ``ancestor`` IS an ancestor of ``descendant``.

        Raises SYS-0001 when git itself failed (rc not in {0, 1}).
        """
        if probe.returncode == 0:
            return True
        if probe.returncode == 1:
            return False
        raise GitWorkerError(
            "SYS-0001",
            "GIT_ANCESTRY_CHECK_FAILED",
            details={
                "repo": repo,
                "ancestor": ancestor,
                "descendant": descendant,
                "stderr": probe.stderr.strip()[:_MAX_STDERR_SNIPPET],
            },
        )

    def validate_delivery(
        self,
        repo: os.PathLike[str] | str,
        *,
        branch: str,
        base_commit: str,
        commit_sha: str,
        files_scope: Sequence[str] | None,
        context: AuditContext | None = None,
    ) -> dict[str, object]:
        """Independent delivery validation: branch binding, base binding,
        scope binding (GIT-0002 / GIT-0003)."""
        if context is not None:
            self._validate_context(context)
        path = self._repo_path(repo)
        if branch in _PROTECTED_BRANCHES:
            raise GitWorkerError(
                "AUTH-0002",
                "PROTECTED_BRANCH_DELIVERY_FORBIDDEN",
                details={"branch": branch},
                correlation_id=context.correlation_id if context else None,
            )
        self._validate_task_branch(branch)
        self._require_branch(path, branch)
        self._require_full_sha(base_commit, "base_commit")
        self._require_full_sha(commit_sha, "commit_sha")
        base = self._resolve_commit(path, base_commit)
        commit = self._resolve_commit(path, commit_sha)
        if base != base_commit or commit != commit_sha:
            raise GitWorkerError("REQ-0001", "FULL_COMMIT_SHA_REQUIRED")

        on_branch = self._git(
            path, ["merge-base", "--is-ancestor", commit, branch], check=False
        )
        if not self._is_ancestor_probe_failed(
            on_branch,
            repo=str(path),
            ancestor=commit,
            descendant=branch,
        ):
            raise GitWorkerError(
                "RES-0002",
                "GIT_COMMIT_NOT_ON_TASK_BRANCH",
                details={"branch": branch, "commit_sha": commit},
                correlation_id=context.correlation_id if context else None,
            )
        based_on_expected = self._git(
            path, ["merge-base", "--is-ancestor", base, commit], check=False
        )
        if not self._is_ancestor_probe_failed(
            based_on_expected,
            repo=str(path),
            ancestor=base,
            descendant=commit,
        ):
            raise GitWorkerError(
                "GIT-0002",
                "GIT_BASE_MISMATCH",
                details={
                    "expected_base_commit": base,
                    "commit_sha": commit,
                    "branch": branch,
                },
                correlation_id=context.correlation_id if context else None,
            )
        evidence = self.read_diff(path, base, commit)
        if files_scope is not None:
            self.validate_scope(
                evidence["changed_files"],
                files_scope,
                correlation_id=context.correlation_id if context else None,
            )
        if context is not None:
            evidence.update(
                {
                    "task_id": context.task_id,
                    "execution_id": context.execution_id,
                    "correlation_id": context.correlation_id,
                }
            )
        evidence.update({"branch": branch, "validation": "PASS"})
        return evidence

    # ---------------- optional test command gate ----------------

    def run_tests(
        self,
        repo: os.PathLike[str] | str,
        command: Sequence[str],
        *,
        log_path: os.PathLike[str] | str,
        context: AuditContext | None = None,
        timeout_seconds: float = 120.0,
    ) -> TestRunResult:
        """Run a test command inside the repo work tree (no shell), capturing
        an NDJSON-friendly evidence log outside the repository."""
        if context is not None:
            self._validate_context(context)
        path = self._repo_path(repo)
        if (
            isinstance(command, (str, bytes))
            or not command
            or any(
                not isinstance(part, str) or not part or "\0" in part
                for part in command
            )
        ):
            raise GitWorkerError(
                "REQ-0001",
                "INVALID_TEST_COMMAND",
                correlation_id=context.correlation_id if context else None,
            )
        if timeout_seconds <= 0:
            raise GitWorkerError(
                "REQ-0001",
                "INVALID_TEST_TIMEOUT",
                correlation_id=context.correlation_id if context else None,
            )
        output_path = Path(log_path).expanduser().resolve()
        try:
            output_path.relative_to(path)
        except ValueError:
            pass
        else:
            raise GitWorkerError(
                "REQ-0001",
                "TEST_LOG_MUST_BE_OUTSIDE_REPOSITORY",
                correlation_id=context.correlation_id if context else None,
            )

        started_at = _utc_now()
        started = time.monotonic()
        timed_out = False
        try:
            completed = subprocess.run(
                list(command),
                cwd=path,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                shell=False,
                timeout=timeout_seconds,
                check=False,
            )
            stdout = completed.stdout
            stderr = completed.stderr
            exit_code: int | None = completed.returncode
            start_error = None
        except subprocess.TimeoutExpired as exc:
            stdout = exc.stdout or ""
            stderr = exc.stderr or ""
            if isinstance(stdout, bytes):
                stdout = stdout.decode("utf-8", errors="replace")
            if isinstance(stderr, bytes):
                stderr = stderr.decode("utf-8", errors="replace")
            exit_code = None
            timed_out = True
        except OSError:
            stdout = ""
            stderr = "command failed to start"
            exit_code = None
        finished_at = _utc_now()
        duration_ms = round((time.monotonic() - started) * 1000)
        content = (
            f"started_at={started_at}\n"
            f"finished_at={finished_at}\n"
            f"duration_ms={duration_ms}\n"
            f"command_json={json.dumps(list(command), ensure_ascii=False)}\n"
            f"exit_code={exit_code if exit_code is not None else 'NOT_COMPLETED'}\n"
            "\n--- stdout ---\n"
            f"{stdout}"
            "\n--- stderr ---\n"
            f"{stderr}"
            "\n--- end ---\n"
        ).encode("utf-8")
        try:
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_bytes(content)
        except OSError as exc:
            raise GitWorkerError(
                "SYS-0001",
                "TEST_LOG_WRITE_FAILED",
                details={"operation": "run_tests"},
                correlation_id=context.correlation_id if context else None,
            ) from exc
        log_hash = _sha256_bytes(content)
        result = TestRunResult(
            command=tuple(command),
            exit_code=exit_code if exit_code is not None else -1,
            started_at=started_at,
            finished_at=finished_at,
            duration_ms=duration_ms,
            log_path=str(output_path),
            log_sha256=log_hash,
        )
        if timed_out:
            error = GitWorkerError(
                "SYS-0003",
                "TEST_COMMAND_TIMEOUT",
                details={"log_path": str(output_path), "log_sha256": log_hash},
                correlation_id=context.correlation_id if context else None,
            )
            self._log(
                "git.test_command_finished",
                "test command timed out",
                level="ERROR",
                operation="run_tests",
                result="FAILURE",
                context=context,
                repo=repo,
                error=error,
                duration_ms=duration_ms,
                exit_code=None,
                test_log=str(output_path),
                test_log_sha256=log_hash,
            )
            raise error
        if exit_code is None:
            raise GitWorkerError(
                "SYS-0001",
                "TEST_COMMAND_START_FAILED",
                details={"log_path": str(output_path), "log_sha256": log_hash},
                correlation_id=context.correlation_id if context else None,
            )
        self._log(
            "git.test_command_finished",
            f"test command exit={exit_code}",
            level="INFO" if exit_code == 0 else "ERROR",
            operation="run_tests",
            result="SUCCESS" if exit_code == 0 else "FAILURE",
            context=context,
            repo=repo,
            duration_ms=duration_ms,
            exit_code=exit_code,
            test_log=str(output_path),
            test_log_sha256=log_hash,
        )
        if exit_code != 0:
            raise GitWorkerError(
                "SYS-0001",
                "TEST_COMMAND_FAILED",
                details=result.to_dict(),
                correlation_id=context.correlation_id if context else None,
            )
        return result

    # ---------------- commit + collection ----------------

    def _default_baseline(self, path: Path) -> str:
        """Default base commit: HEAD at call time.

        The new commit is created on top of the current HEAD, so the
        post-commit diff ``base..HEAD`` covers exactly the collected work.
        Callers that recorded an older baseline (intermediate commits made
        outside this worker) pass ``base_commit`` explicitly.
        """
        return self._resolve_commit(path, "HEAD")

    def commit_and_collect(
        self,
        repo: os.PathLike[str] | str,
        message: str,
        *,
        base_commit: str | None = None,
        files_scope: Sequence[str] | None = None,
        context: AuditContext | None = None,
        test_command: Sequence[str] | None = None,
        test_log_path: os.PathLike[str] | str | None = None,
        test_timeout_seconds: float = 120.0,
    ) -> dict[str, object]:
        """Commit staged-able work on a task branch and collect sha + diff.

        Fail-closed rules enforced before any write:
        - current branch must not be a protected branch (04-规范 §6-3);
        - current branch must match the C5 task-branch regex;
        - worktree must have changes, all inside ``files_scope`` when given;
        - ``base_commit`` (default: parent of HEAD) must be an ancestor of HEAD.

        M1 registration (``git_commits`` + ``artifacts`` + ``audit_logs``) is
        attempted through the injected ``M1Client`` after the git side has
        succeeded; per contract §11.4-④ the git operation is never rolled
        back when registration fails -- the evidence dict carries an
        ``m1_registration`` status instead.
        """
        started = time.monotonic()
        try:
            evidence = self._commit_and_collect(
                repo,
                message,
                base_commit=base_commit,
                files_scope=files_scope,
                context=context,
                test_command=test_command,
                test_log_path=test_log_path,
                test_timeout_seconds=test_timeout_seconds,
            )
        except GitWorkerError as exc:
            self._log(
                "git.commit_collected",
                f"commit_and_collect failed: {exc.code} {exc.message}",
                level="ERROR",
                operation="commit_and_collect",
                result="FAILURE",
                context=context,
                repo=repo,
                error=exc,
                duration_ms=round((time.monotonic() - started) * 1000),
            )
            raise
        duration_ms = round((time.monotonic() - started) * 1000)
        self._log(
            "git.commit_collected",
            f"commit collected: {evidence['commit_sha']}",
            operation="commit_and_collect",
            result="SUCCESS",
            context=context,
            repo=repo,
            branch=evidence.get("branch"),
            base_commit=evidence.get("base_commit"),
            commit_sha=evidence.get("commit_sha"),
            changed_files=evidence.get("changed_files"),
            diff_sha256=evidence.get("diff_sha256"),
            duration_ms=duration_ms,
        )
        return evidence

    def _commit_and_collect(
        self,
        repo: os.PathLike[str] | str,
        message: str,
        *,
        base_commit: str | None,
        files_scope: Sequence[str] | None,
        context: AuditContext | None,
        test_command: Sequence[str] | None,
        test_log_path: os.PathLike[str] | str | None,
        test_timeout_seconds: float,
    ) -> dict[str, object]:
        path = self._repo_path(repo)
        if self.m1_client is not None and context is None:
            # Fail closed: without a task binding there is nothing to
            # register in git_commits/audit_logs (contract §11.4).
            raise GitWorkerError("REQ-0001", "AUDIT_CONTEXT_REQUIRED")
        if context is not None:
            self._validate_context(context)
        correlation_id = context.correlation_id if context else None
        if not isinstance(message, str) or not _COMMIT_SUBJECT.fullmatch(message):
            raise GitWorkerError(
                "REQ-0001",
                "INVALID_COMMIT_MESSAGE",
                details={"field": "message"},
                correlation_id=correlation_id,
            )
        # Branch checks come BEFORE any baseline resolution so that a write
        # attempt on a protected branch is refused first (04-规范 §6-3).
        status = self.repo_status(path)
        branch = status["branch"]
        if status["detached_head"] or not isinstance(branch, str):
            raise GitWorkerError(
                "RES-0002",
                "DETACHED_HEAD_NOT_SUPPORTED",
                correlation_id=correlation_id,
            )
        if branch in _PROTECTED_BRANCHES:
            raise GitWorkerError(
                "AUTH-0002",
                "PROTECTED_BRANCH_COMMIT_FORBIDDEN",
                details={"branch": branch},
                correlation_id=correlation_id,
            )
        self._validate_task_branch(branch)
        self._require_branch(path, branch)
        if base_commit is not None:
            self._require_full_sha(base_commit, "base_commit")
            base = self._resolve_commit(path, base_commit)
        else:
            base = self._default_baseline(path)
        based_on_expected = self._git(
            path, ["merge-base", "--is-ancestor", base, "HEAD"], check=False
        )
        if not self._is_ancestor_probe_failed(
            based_on_expected, repo=str(path), ancestor=base, descendant="HEAD"
        ):
            raise GitWorkerError(
                "GIT-0002",
                "GIT_BASE_MISMATCH",
                details={"expected_base_commit": base, "branch": branch},
                correlation_id=correlation_id,
            )

        changes = self._paths_from_status(status["changes"])
        if not changes:
            raise GitWorkerError(
                "RES-0002",
                "NO_TASK_CHANGES_TO_COMMIT",
                details={"repo": str(path), "branch": branch},
                correlation_id=correlation_id,
            )
        if files_scope is not None:
            self.validate_scope(changes, files_scope, correlation_id=correlation_id)

        test_result: TestRunResult | None = None
        if test_command is not None:
            if test_log_path is None:
                raise GitWorkerError(
                    "REQ-0001",
                    "TEST_LOG_PATH_REQUIRED",
                    correlation_id=correlation_id,
                )
            test_result = self.run_tests(
                path,
                test_command,
                log_path=test_log_path,
                context=context,
                timeout_seconds=test_timeout_seconds,
            )

        # Recheck after tests: test-generated files cannot bypass scope checks.
        changes = self._paths_from_status(self.repo_status(path)["changes"])
        if files_scope is not None:
            self.validate_scope(changes, files_scope, correlation_id=correlation_id)
        self._git(path, ["add", "-A", "--", *changes])
        staged = self._nul_separated_paths(
            self._git(
                path,
                ["diff", "--cached", "--name-only", "-z", "--no-renames", "--"],
            ).stdout
        )
        if not staged:
            raise GitWorkerError(
                "RES-0002",
                "NO_STAGED_CHANGES_TO_COMMIT",
                correlation_id=correlation_id,
            )
        if files_scope is not None:
            self.validate_scope(staged, files_scope, correlation_id=correlation_id)

        self._git(path, ["commit", "-m", message])
        commit_sha = self._resolve_commit(path, "HEAD")
        evidence = self.validate_delivery(
            path,
            branch=branch,
            base_commit=base,
            commit_sha=commit_sha,
            files_scope=files_scope,
            context=context,
        )
        if not self.check_clean(path):
            raise GitWorkerError(
                "GIT-0001",
                "GIT_WORKTREE_DIRTY_AFTER_COMMIT",
                details={"commit_sha": commit_sha},
                correlation_id=correlation_id,
            )
        timestamp = _utc_now()
        evidence.update(
            {
                "repo": str(path),
                "branch": branch,
                "base_commit": base,
                "commit_sha": commit_sha,
                "commit_message": message,
                "test_run": test_result.to_dict() if test_result is not None else None,
                "timestamp": timestamp,
            }
        )

        # ---- M1 registration (git_commits / artifacts / audit_logs) ----
        evidence["m1_registration"] = self._register_with_m1(
            path,
            context=context,
            branch=branch,
            base_commit=base,
            commit_sha=commit_sha,
            diff=evidence["diff"],
            diff_sha256=evidence["diff_sha256"],
        )
        return evidence

    def _register_with_m1(
        self,
        path: Path,
        *,
        context: AuditContext | None,
        branch: str,
        base_commit: str,
        commit_sha: str,
        diff: str,
        diff_sha256: str,
    ) -> dict[str, object]:
        if self.m1_client is None:
            return {"status": "SKIPPED", "reason": "M1_CLIENT_NOT_CONFIGURED"}
        if context is None:
            return {"status": "SKIPPED", "reason": "AUDIT_CONTEXT_MISSING"}
        if not context.repository_id:
            self._log(
                "git.m1_registration_skipped",
                "repository_id missing in audit context; git_commits row not registered",
                level="WARNING",
                operation="commit_and_collect",
                result="SKIPPED",
                context=context,
                repo=path,
                commit_sha=commit_sha,
            )
            return {"status": "SKIPPED", "reason": "REPOSITORY_ID_REQUIRED"}
        diff_bytes = diff.encode("utf-8", errors="replace")
        artifact_path = self.diff_dir / f"diff-{commit_sha}.patch"
        try:
            self.diff_dir.mkdir(parents=True, exist_ok=True)
            artifact_path.write_bytes(diff_bytes)
        except OSError as exc:
            raise GitWorkerError(
                "SYS-0001",
                "DIFF_ARTIFACT_WRITE_FAILED",
                details={"diff_path": str(artifact_path)},
                correlation_id=context.correlation_id,
            ) from exc
        # T-P1-902 集成缝隙修复：M1 validate_artifact_path（app/platform/reports.py）
        # 要求登记 path 为仓库相对 POSIX 路径（拒绝盘符/绝对/反斜杠路径），而本模块
        # 此前把本地 diff_dir 的绝对物理路径原样登记，真实 M1 会以 REQ-0001 拒收。
        # 登记改为确定性身份路径（task_id 与 commit sha 均不含路径分隔符，无碰撞）；
        # 本地 diff_dir 仍是物理证据落盘位置，语义不变（M1 artifacts.path 为登记标识，
        # 内容字节由 sha256 锚定，M1 按需以 inline content 存 blob）。
        artifact_relpath = f"git-worker/diffs/{context.task_id}/diff-{commit_sha}.patch"
        if _sha256_bytes(diff_bytes) != diff_sha256:
            raise GitWorkerError(
                "ART-0002",
                "ARTIFACT_HASH_MISMATCH",
                details={"diff_path": str(artifact_path)},
                correlation_id=context.correlation_id,
            )
        try:
            artifact_id = self.m1_client.register_artifact(
                task_id=context.task_id,
                artifact_type="DIFF",
                path=artifact_relpath,
                sha256=diff_sha256,
            )
            git_commit_id = self.m1_client.register_commit(
                task_id=context.task_id,
                execution_id=context.execution_id,
                repository_id=context.repository_id,
                branch=branch,
                sha=commit_sha,
                base_commit=base_commit,
                diff_artifact_id=artifact_id,
            )
        except Exception as exc:  # noqa: BLE001 -- §11.4-④: never roll back git
            self._log(
                "git.m1_registration_failed",
                f"M1 registration failed for {commit_sha}: {exc}",
                level="ERROR",
                operation="commit_and_collect",
                result="FAILURE",
                context=context,
                repo=path,
                commit_sha=commit_sha,
                error=GitWorkerError("SYS-0001", "M1_REGISTRATION_FAILED"),
                retryable=True,
            )
            return {
                "status": "FAILED",
                "error": str(exc)[:500],
                "note": (
                    "Git operation NOT rolled back (contract §11.4-④); "
                    "registration is idempotent on UNIQUE(repository_id, sha) "
                    "and can be retried"
                ),
            }
        audit_id = self._m1_audit(
            context=context,
            action="commit_and_collect",
            target_type="repository",
            target_id=context.repository_id,
            result="SUCCESS",
            details={
                "branch": branch,
                "sha": commit_sha,
                "base_commit": base_commit,
                "diff_artifact_id": artifact_id,
                "diff_sha256": diff_sha256,
            },
        )
        return {
            "status": "REGISTERED",
            "artifact_id": artifact_id,
            "git_commit_id": git_commit_id,
            "audit_id": audit_id,
        }

    # ---------------- merge boundary (always fail closed) ----------------

    def merge(
        self,
        repo: os.PathLike[str] | str,
        *,
        source_branch: str,
        target_branch: str,
        context: AuditContext | None = None,
    ) -> None:
        """Fail closed: M4 performs no automatic merges in Phase 1.

        Merging into main/master requires the human approval flow
        (contract §6.3-2, 04-规范 §6-9).  The explicit method makes that
        boundary testable without touching any branch.
        """
        if context is not None:
            self._validate_context(context)
        path = self._repo_path(repo)
        if target_branch in _PROTECTED_BRANCHES:
            error = GitWorkerError(
                "AUTH-0002",
                "PROTECTED_BRANCH_MERGE_REQUIRES_HUMAN_APPROVAL",
                details={
                    "source_branch": source_branch,
                    "target_branch": target_branch,
                },
                correlation_id=context.correlation_id if context else None,
            )
        else:
            error = GitWorkerError(
                "AUTH-0002",
                "AUTOMATIC_MERGE_NOT_IMPLEMENTED",
                details={
                    "source_branch": source_branch,
                    "target_branch": target_branch,
                },
                correlation_id=context.correlation_id if context else None,
            )
        self._log(
            "git.merge_blocked",
            f"merge refused: {source_branch} -> {target_branch}",
            level="WARNING",
            operation="merge",
            result="BLOCKED",
            context=context,
            repo=repo,
            error=error,
            branch=target_branch,
        )
        self._m1_audit(
            context=context,
            action="git.merge_blocked",
            target_type="repository",
            target_id=context.repository_id if context and context.repository_id else str(path),
            result="BLOCKED",
            reason=error.message,
            details={"source_branch": source_branch, "target_branch": target_branch},
        )
        raise error
