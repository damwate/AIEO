# -*- coding: utf-8 -*-
"""Pytest fixtures for M4 git_worker tests.

Every test repository is created by real ``git init``/``git commit``
subprocess calls under pytest's system-temp ``tmp_path``; the D:\\AIEO
main repository's git state is never touched.  No network access needed.
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from app.git_worker import AuditContext, GitWorker  # noqa: E402


def run_git(cwd: Path, *args: str, check: bool = True) -> subprocess.CompletedProcess:
    """Direct git call used ONLY to build test scenarios (bypasses the worker)."""
    completed = subprocess.run(
        ["git", *args],
        cwd=cwd,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        shell=False,
    )
    if check and completed.returncode != 0:
        raise AssertionError(
            f"git {' '.join(args)} failed rc={completed.returncode}: {completed.stderr.strip()}"
        )
    return completed


def head_sha(repo: Path) -> str:
    return run_git(repo, "rev-parse", "HEAD").stdout.strip()


def commit_all(repo: Path, message: str) -> str:
    run_git(repo, "add", "-A")
    run_git(repo, "commit", "-m", message)
    return head_sha(repo)


@pytest.fixture()
def make_repo(tmp_path: Path):
    """Factory: create a disposable git repository with one initial commit."""
    counter = {"n": 0}

    def _make(name: str = "repo") -> Path:
        counter["n"] += 1
        repo = tmp_path / f"{name}-{counter['n']}"
        repo.mkdir(parents=True)
        run_git(repo, "init", "-b", "main")
        run_git(repo, "config", "user.name", "AIEO Test")
        run_git(repo, "config", "user.email", "aieo-test@example.local")
        (repo / "README.md").write_text("# AIEO M4 test repo\n", encoding="utf-8")
        run_git(repo, "add", ".")
        run_git(repo, "commit", "-m", "initial commit")
        return repo

    return _make


@pytest.fixture()
def worker(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> GitWorker:
    """Worker with hermetic temp log dir and default (PATH-resolved) git."""
    monkeypatch.delenv("AIEO_GIT_PATH", raising=False)
    monkeypatch.delenv("AIEO_LOG_DIR", raising=False)
    monkeypatch.setenv("AIEO_ENV", "test")
    return GitWorker(log_dir=tmp_path / "logs", git_timeout_seconds=60.0)


@pytest.fixture()
def context() -> AuditContext:
    return AuditContext(
        task_id="T-P1-001",
        execution_id="EXEC-001",
        correlation_id="CORR-001",
        repository_id="REPO-TEST-001",
    )


FAKE_GIT_PY = r'''# -*- coding: utf-8 -*-
"""Record-and-passthrough fake git: logs argv, then runs the real git."""
import json
import os
import subprocess
import sys
import time

args = sys.argv[1:]
here = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(here, "invocations.jsonl"), "a", encoding="utf-8") as fh:
    fh.write(json.dumps({"argv": args, "cwd": os.getcwd()}) + "\n")
sleep_s = os.environ.get("AIEO_FAKE_GIT_SLEEP")
if sleep_s:
    time.sleep(float(sleep_s))
real = os.environ["AIEO_FAKE_GIT_REAL"]
proc = subprocess.run([real] + args, capture_output=True)
sys.stdout.buffer.write(proc.stdout)
sys.stdout.flush()
sys.stderr.buffer.write(proc.stderr)
sys.stderr.flush()
sys.exit(proc.returncode)
'''


@pytest.fixture()
def fake_git_launcher(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Create a fake git executable that records invocations and proxies
    to the real git binary; returns the launcher path."""
    import shutil

    real_git = shutil.which("git")
    assert real_git, "real git must be on PATH for the passthrough fake"
    fake_dir = tmp_path / "fakebin"
    fake_dir.mkdir()
    (fake_dir / "fake_git.py").write_text(FAKE_GIT_PY, encoding="utf-8")
    monkeypatch.setenv("AIEO_FAKE_GIT_REAL", real_git)
    if sys.platform == "win32":
        launcher = fake_dir / "fake_git.cmd"
        launcher.write_text(
            '@echo off\n"' + sys.executable + '" "%~dp0fake_git.py" %*\n',
            encoding="utf-8",
        )
    else:
        launcher = fake_dir / "fake_git"
        launcher.write_text(
            '#!/bin/sh\nexec "' + sys.executable + '" "$(dirname "$0")/fake_git.py" "$@"\n',
            encoding="utf-8",
        )
        launcher.chmod(0o755)
    return launcher


def read_fake_invocations(launcher: Path) -> list[dict]:
    import json

    log_file = launcher.parent / "invocations.jsonl"
    if not log_file.exists():
        return []
    return [
        json.loads(line)
        for line in log_file.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


class InMemoryM1Client:
    """In-memory stand-in for M1's git_commits / artifacts / audit_logs APIs.

    Idempotency mirrors contract §11.4-④ / C2: register_commit deduplicates
    on (repository_id, sha); register_artifact deduplicates on path.
    """

    def __init__(self) -> None:
        self.commits: dict[tuple[str, str], dict] = {}
        self.commit_call_count = 0
        self.artifacts: dict[str, dict] = {}
        self.audits: list[dict] = []
        self._next_id = 0

    def _id(self, prefix: str) -> str:
        self._next_id += 1
        return f"{prefix}-{self._next_id:04d}"

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
    ) -> str:
        self.commit_call_count += 1
        key = (repository_id, sha)
        if key in self.commits:
            return self.commits[key]["git_commit_id"]
        row = {
            "git_commit_id": self._id("GC"),
            "task_id": task_id,
            "execution_id": execution_id,
            "repository_id": repository_id,
            "branch": branch,
            "sha": sha,
            "base_commit": base_commit,
            "diff_artifact_id": diff_artifact_id,
        }
        self.commits[key] = row
        return row["git_commit_id"]

    def register_artifact(
        self, *, task_id: str | None, artifact_type: str, path: str, sha256: str
    ) -> str:
        if path in self.artifacts:
            return self.artifacts[path]["artifact_id"]
        row = {
            "artifact_id": self._id("ART"),
            "task_id": task_id,
            "type": artifact_type,
            "path": path,
            "sha256": sha256,
        }
        self.artifacts[path] = row
        return row["artifact_id"]

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
        details: dict | None = None,
    ) -> str:
        row = {
            "audit_id": self._id("AUD"),
            "actor_id": actor_id,
            "actor_type": actor_type,
            "action": action,
            "target_type": target_type,
            "target_id": target_id,
            "result": result,
            "reason": reason,
            "correlation_id": correlation_id,
            "details": details,
        }
        self.audits.append(row)
        return row["audit_id"]


class AlwaysFailingM1Client(InMemoryM1Client):
    """Simulates an M1 outage: every registration call raises."""

    def _outage(self) -> None:
        raise RuntimeError("simulated M1 outage")

    def register_commit(self, **kwargs):  # noqa: ANN003 -- test double
        self._outage()
        return ""

    def register_artifact(self, **kwargs):  # noqa: ANN003 -- test double
        self._outage()
        return ""

    def record_audit(self, **kwargs):  # noqa: ANN003 -- test double
        self._outage()
        return ""
