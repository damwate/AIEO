# -*- coding: utf-8 -*-
"""M4 Git Worker tests (contract v1.0.0 C3/C4/C5/C6, module-boundaries §2 M4).

Scenario mapping (task list):
①  repo_status normal / non-repo          -> test_repo_status_*
②  record_baseline full 40-hex SHA        -> test_record_baseline_returns_full_sha
③  create_branch new / conflict           -> test_create_branch_*
④  commit_and_collect sha+diff correct    -> test_commit_and_collect_*
⑤  check_clean dirty / clean              -> test_check_clean_dirty_and_clean
⑥  read_diff range base..target           -> test_read_diff_*
⑦  main protection refuses direct writes  -> test_main_commit_rejected /
                                             test_create_branch_rejects_... /
                                             test_merge_fail_closed
⑧  non-whitelisted subcommand refused     -> test_subcommand_whitelist_rejects
⑨  AIEO_GIT_PATH injection honoured       -> test_git_path_injection_... /
                                             test_git_command_timeout_... /
                                             test_missing_git_executable_...
⑩  C3 error schema mapping                -> test_c3_error_schema /
                                             test_c3_mappings_git_group

Extra: M1 injectable boundary (in-memory fake), C4 NDJSON default log dir.
"""
from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path

import pytest

from app.git_worker import (
    ALLOWED_GIT_SUBCOMMANDS,
    AuditContext,
    GitWorker,
    GitWorkerError,
)

from conftest import (
    AlwaysFailingM1Client,
    InMemoryM1Client,
    commit_all,
    head_sha,
    read_fake_invocations,
    run_git,
)

TASK_BRANCH = "feature/T-P1-001-add-worker"


# ---------------------------------------------------------------------------
# ① repo_status
# ---------------------------------------------------------------------------


def test_repo_status_clean_and_branch(worker, make_repo):
    repo = make_repo()
    status = worker.repo_status(repo)
    assert status["branch"] == "main"
    assert status["detached_head"] is False
    assert status["clean"] is True
    assert status["changes"] == []
    assert re.match(r"\d{4}-\d{2}-\d{2}T", status["timestamp"])


def test_repo_status_rejects_non_repo(worker, tmp_path):
    not_repo = tmp_path / "not-a-repo"
    not_repo.mkdir()  # exists, but not a git repository
    with pytest.raises(GitWorkerError) as ei:
        worker.repo_status(not_repo)
    assert ei.value.code == "RES-0001"
    assert ei.value.message == "GIT_REPOSITORY_NOT_FOUND"
    # missing directory is rejected as well
    with pytest.raises(GitWorkerError) as ei:
        worker.repo_status(tmp_path / "missing-dir")
    assert ei.value.code == "RES-0001"
    assert ei.value.message == "REPOSITORY_NOT_FOUND"


def test_repo_path_must_be_repo_root(worker, make_repo):
    repo = make_repo()
    sub = repo / "src"
    sub.mkdir()
    with pytest.raises(GitWorkerError) as ei:
        worker.repo_status(sub)
    assert ei.value.code == "RES-0001"
    assert ei.value.message == "GIT_REPOSITORY_ROOT_MISMATCH"


# ---------------------------------------------------------------------------
# ② record_baseline
# ---------------------------------------------------------------------------


def test_record_baseline_returns_full_sha(worker, make_repo):
    repo = make_repo()
    expected = head_sha(repo)
    sha = worker.record_baseline(repo)
    assert re.fullmatch(r"[0-9a-f]{40}", sha)
    assert sha == expected
    # after moving HEAD the baseline follows
    run_git(repo, "switch", "-c", "feature/T-P1-010-baseline")
    (repo / "b.txt").write_text("b\n", encoding="utf-8")
    new_sha = commit_all(repo, "second commit")
    assert worker.record_baseline(repo) == new_sha


# ---------------------------------------------------------------------------
# ③ create_branch
# ---------------------------------------------------------------------------


def test_create_branch_new_and_conflict(worker, make_repo):
    repo = make_repo()
    name = "feature/T-P1-011-create"
    returned = worker.create_branch(repo, name)
    assert returned == name
    assert worker.branch_exists(repo, name) is True
    assert worker.repo_status(repo)["branch"] == name
    # same name again -> conflict
    with pytest.raises(GitWorkerError) as ei:
        worker.create_branch(repo, name)
    assert ei.value.code == "RES-0002"
    assert ei.value.message == "GIT_BRANCH_ALREADY_EXISTS"


def test_create_branch_rejects_invalid_and_protected_names(worker, make_repo):
    repo = make_repo()
    # ⑦ branch side of main protection: creating main/master is refused
    for protected in ("main", "master"):
        with pytest.raises(GitWorkerError) as ei:
            worker.create_branch(repo, protected)
        assert ei.value.code == "AUTH-0002"
        assert ei.value.message == "PROTECTED_BRANCH_CREATE_FORBIDDEN"
    # C5 §6.1 naming violations
    for bad in (
        "hacker",
        "hotfix/T-P1-012-x",
        "feature/T-p1-012-x",
        "feature/T-P1-12-x",
        "feature/T-P1-012--x",
        "feature/T-P1-012-x_y",
        "feature/T-P1-012-Add",
    ):
        with pytest.raises(GitWorkerError) as ei:
            worker.create_branch(repo, bad)
        assert ei.value.code == "REQ-0001"
        assert ei.value.message == "INVALID_TASK_BRANCH_NAME"


# ---------------------------------------------------------------------------
# ④ commit_and_collect
# ---------------------------------------------------------------------------


def test_commit_and_collect_sha_and_diff(worker, make_repo, context):
    repo = make_repo()
    base = head_sha(repo)
    worker.create_branch(repo, TASK_BRANCH, context=context)
    (repo / "src").mkdir()
    (repo / "src" / "calc.py").write_text(
        "def add(a, b):\n    return a + b\n", encoding="utf-8"
    )
    evidence = worker.commit_and_collect(
        repo, "feat(git_worker): add calc module", files_scope=["src/"], context=context
    )
    assert re.fullmatch(r"[0-9a-f]{40}", evidence["commit_sha"])
    assert evidence["commit_sha"] != base
    assert evidence["base_commit"] == base
    assert evidence["branch"] == TASK_BRANCH
    assert evidence["changed_files"] == ["src/calc.py"]
    assert "+def add(a, b):" in evidence["diff"]
    assert evidence["diff_sha256"] == hashlib.sha256(
        evidence["diff"].encode("utf-8")
    ).hexdigest()
    assert evidence["validation"] == "PASS"
    assert evidence["test_run"] is None
    assert evidence["commit_message"] == "feat(git_worker): add calc module"
    assert worker.check_clean(repo) is True


def test_commit_and_collect_default_signature(worker, make_repo):
    """module-boundaries §2 M4 draft signature: commit_and_collect(repo, message)."""
    repo = make_repo()
    initial = head_sha(repo)
    worker.create_branch(repo, "feature/T-P1-002-default-sig")
    (repo / "note.txt").write_text("first change\n", encoding="utf-8")
    ev1 = worker.commit_and_collect(repo, "feat(git_worker): first note")
    assert ev1["base_commit"] == initial
    assert ev1["changed_files"] == ["note.txt"]
    (repo / "note.txt").write_text("first change\nsecond change\n", encoding="utf-8")
    ev2 = worker.commit_and_collect(repo, "feat(git_worker): second note")
    assert ev2["base_commit"] == ev1["commit_sha"]
    assert ev2["changed_files"] == ["note.txt"]
    assert "+second change" in ev2["diff"]
    assert worker.check_clean(repo) is True


# ---------------------------------------------------------------------------
# ⑤ check_clean
# ---------------------------------------------------------------------------


def test_check_clean_dirty_and_clean(worker, make_repo):
    repo = make_repo()
    assert worker.check_clean(repo) is True
    (repo / "untracked.txt").write_text("u\n", encoding="utf-8")
    assert worker.check_clean(repo) is False
    status = worker.repo_status(repo)
    assert status["changes"][0]["path"] == "untracked.txt"
    run_git(repo, "add", "-A")
    run_git(repo, "commit", "-m", "track it")
    assert worker.check_clean(repo) is True
    # tracked modification is detected too
    (repo / "untracked.txt").write_text("modified\n", encoding="utf-8")
    assert worker.check_clean(repo) is False


# ---------------------------------------------------------------------------
# ⑥ read_diff
# ---------------------------------------------------------------------------


def test_read_diff_between_two_commits(worker, make_repo):
    repo = make_repo()
    base = head_sha(repo)
    (repo / "src").mkdir()
    calc = repo / "src" / "calc.py"
    calc.write_text("def add(a, b):\n    return a + b\n", encoding="utf-8")
    mid = commit_all(repo, "add calc")
    calc.write_text(
        "def add(a, b):\n    return a + b\n\ndef sub(a, b):\n    return a - b\n",
        encoding="utf-8",
    )
    target = commit_all(repo, "extend calc")
    full = worker.read_diff(repo, base, target)
    assert full["base_commit"] == base
    assert full["commit_sha"] == target
    assert full["changed_files"] == ["src/calc.py"]
    assert "+def add" in full["diff"] and "+def sub" in full["diff"]
    # restricted range mid..target contains only the second change
    second = worker.read_diff(repo, mid, target)
    assert second["changed_files"] == ["src/calc.py"]
    assert "+def sub" in second["diff"] and "+def add" not in second["diff"]
    first = worker.read_diff(repo, base, mid)
    assert "+def add" in first["diff"] and "+def sub" not in first["diff"]
    # target defaults to HEAD
    assert worker.read_diff(repo, base)["commit_sha"] == target


def test_read_diff_rejects_unknown_revision(worker, make_repo):
    repo = make_repo()
    base = head_sha(repo)
    (repo / "f.txt").write_text("f\n", encoding="utf-8")
    target = commit_all(repo, "f")
    with pytest.raises(GitWorkerError) as ei:
        worker.read_diff(repo, "deadbeef" * 5, target)
    assert ei.value.code == "RES-0001"
    assert ei.value.message == "GIT_COMMIT_NOT_FOUND"
    with pytest.raises(GitWorkerError) as ei:
        worker.read_diff(repo, base, "no-such-ref")
    assert ei.value.code == "RES-0001"
    # revision strings that look like flags cannot pass through
    with pytest.raises(GitWorkerError) as ei:
        worker.read_diff(repo, "--exec=calc", target)
    assert ei.value.code == "RES-0001"


# ---------------------------------------------------------------------------
# ⑦ main protection
# ---------------------------------------------------------------------------


def test_main_commit_rejected(worker, make_repo):
    repo = make_repo()
    (repo / "evil.txt").write_text("x\n", encoding="utf-8")
    with pytest.raises(GitWorkerError) as ei:
        worker.commit_and_collect(repo, "feat(git_worker): try main")
    assert ei.value.code == "AUTH-0002"
    assert ei.value.message == "PROTECTED_BRANCH_COMMIT_FORBIDDEN"
    # no commit was created on main
    assert run_git(repo, "rev-list", "--count", "main").stdout.strip() == "1"


def test_merge_fail_closed(worker, make_repo, context):
    repo = make_repo()
    with pytest.raises(GitWorkerError) as ei:
        worker.merge(
            repo, source_branch="feature/T-P1-013-a", target_branch="main", context=context
        )
    assert ei.value.code == "AUTH-0002"
    assert ei.value.message == "PROTECTED_BRANCH_MERGE_REQUIRES_HUMAN_APPROVAL"
    with pytest.raises(GitWorkerError) as ei:
        worker.merge(
            repo,
            source_branch="feature/T-P1-013-a",
            target_branch="integration/phase1",
            context=context,
        )
    assert ei.value.code == "AUTH-0002"
    assert ei.value.message == "AUTOMATIC_MERGE_NOT_IMPLEMENTED"


# ---------------------------------------------------------------------------
# ⑧ subcommand whitelist
# ---------------------------------------------------------------------------


def test_subcommand_whitelist_rejects(worker, make_repo):
    assert not (
        {"push", "pull", "fetch", "merge", "rebase", "reset", "checkout",
         "filter-branch", "remote", "config", "init"} & ALLOWED_GIT_SUBCOMMANDS
    )
    repo = make_repo()
    path = worker._repo_path(repo)
    for bad_args in (
        ["push", "origin", "main"],
        ["reset", "--hard", "HEAD~1"],
        ["rebase", "main"],
        ["filter-branch", "--all"],
        ["remote", "add", "origin", "https://example.invalid/x.git"],
    ):
        with pytest.raises(GitWorkerError) as ei:
            worker._run_git_at(path, bad_args)
        assert ei.value.code == "AUTH-0002"
        assert ei.value.message == "GIT_SUBCOMMAND_NOT_WHITELISTED"
        assert ei.value.details["subcommand"] == bad_args[0]
    # a whitelisted read-only command still executes
    probe = worker._run_git_at(path, ["status", "--porcelain=v1"])
    assert probe.returncode == 0
    # malformed argv is rejected before touching git
    with pytest.raises(GitWorkerError) as ei:
        worker._run_git_at(path, ["status", "bad\0nul"])
    assert ei.value.code == "REQ-0001"


# ---------------------------------------------------------------------------
# ⑨ git path configuration (MINOR-005)
# ---------------------------------------------------------------------------


def test_git_path_injection_uses_configured_executable(
    tmp_path, monkeypatch, make_repo, fake_git_launcher
):
    monkeypatch.delenv("AIEO_GIT_PATH", raising=False)
    monkeypatch.delenv("AIEO_LOG_DIR", raising=False)
    monkeypatch.setenv("AIEO_ENV", "test")
    repo = make_repo()
    # 1) explicit constructor parameter
    w = GitWorker(
        git_path=str(fake_git_launcher),
        log_dir=tmp_path / "logs-a",
        git_timeout_seconds=60.0,
    )
    assert Path(w.git_path) == fake_git_launcher
    status = w.repo_status(repo)
    assert status["clean"] is True
    assert status["branch"] == "main"
    subcommands = [rec["argv"][0] for rec in read_fake_invocations(fake_git_launcher)]
    assert "rev-parse" in subcommands
    assert "status" in subcommands
    assert "symbolic-ref" in subcommands
    # 2) AIEO_GIT_PATH environment injection
    monkeypatch.setenv("AIEO_GIT_PATH", str(fake_git_launcher))
    w2 = GitWorker(log_dir=tmp_path / "logs-b", git_timeout_seconds=60.0)
    assert Path(w2.git_path) == fake_git_launcher
    assert w2.check_clean(repo) is True


def test_git_command_timeout_maps_to_sys_0003(
    tmp_path, monkeypatch, make_repo, fake_git_launcher
):
    repo = make_repo()
    monkeypatch.setenv("AIEO_FAKE_GIT_SLEEP", "2")
    w = GitWorker(
        git_path=str(fake_git_launcher),
        git_timeout_seconds=0.4,
        log_dir=tmp_path / "logs-t",
    )
    with pytest.raises(GitWorkerError) as ei:
        w.repo_status(repo)
    assert ei.value.code == "SYS-0003"
    assert ei.value.message == "GIT_COMMAND_TIMEOUT"


def test_missing_git_executable_fails_fast(tmp_path, monkeypatch):
    monkeypatch.delenv("AIEO_GIT_PATH", raising=False)
    with pytest.raises(GitWorkerError) as ei:
        GitWorker(git_path="aieo-missing-git-binary", log_dir=tmp_path / "logs")
    assert ei.value.code == "SYS-0001"
    assert ei.value.message == "GIT_EXECUTABLE_NOT_FOUND"
    # same via AIEO_GIT_PATH environment variable
    monkeypatch.setenv("AIEO_GIT_PATH", "aieo-missing-git-binary")
    with pytest.raises(GitWorkerError) as ei:
        GitWorker(log_dir=tmp_path / "logs2")
    assert ei.value.code == "SYS-0001"


# ---------------------------------------------------------------------------
# ⑩ C3 error schema / mappings
# ---------------------------------------------------------------------------


def test_c3_error_schema(worker, make_repo, tmp_path):
    errors = []
    # RES-0001: not a repository
    with pytest.raises(GitWorkerError) as ei:
        worker.repo_status(tmp_path / "no-such-dir")
    assert ei.value.code == "RES-0001"
    errors.append(ei.value)
    # RES-0002: branch conflict
    repo = make_repo()
    name = "feature/T-P1-004-conflict"
    worker.create_branch(repo, name)
    with pytest.raises(GitWorkerError) as ei:
        worker.create_branch(repo, name)
    assert ei.value.code == "RES-0002"
    errors.append(ei.value)
    # AUTH-0002: protected branch commit
    repo2 = make_repo()
    with pytest.raises(GitWorkerError) as ei:
        worker.commit_and_collect(repo2, "feat(git_worker): try main")
    assert ei.value.code == "AUTH-0002"
    errors.append(ei.value)
    # AUTH-0002: non-whitelisted subcommand
    path = worker._repo_path(repo2)
    with pytest.raises(GitWorkerError) as ei:
        worker._run_git_at(path, ["push", "origin", "main"])
    assert ei.value.code == "AUTH-0002"
    errors.append(ei.value)
    # uniform C3 schema for every error
    for err in errors:
        payload = err.to_dict()
        expected_keys = {"code", "message", "retryable", "correlation_id"}
        if err.details:
            expected_keys.add("details")
        assert set(payload.keys()) == expected_keys
        assert re.fullmatch(r"[A-Z]{3,8}-\d{4}", payload["code"])
        assert isinstance(payload["retryable"], bool)
        assert isinstance(payload["message"], str) and payload["message"]
        assert isinstance(payload["correlation_id"], str) and payload["correlation_id"]
        if "details" in payload:
            assert isinstance(payload["details"], dict) and payload["details"]
    # explicit construction keeps the schema, invalid codes are refused
    e = GitWorkerError(
        "GIT-0003",
        "GIT_SCOPE_VIOLATION",
        details={"outside_files_scope": ["docs/x"]},
        correlation_id="CORR-009",
    )
    payload = e.to_dict()
    assert payload["code"] == "GIT-0003"
    assert payload["correlation_id"] == "CORR-009"
    assert payload["details"]["outside_files_scope"] == ["docs/x"]
    assert payload["retryable"] is False
    with pytest.raises(ValueError):
        GitWorkerError("BAD", "missing dash")


def test_c3_mappings_git_group(worker, make_repo, context):
    # GIT-0001: dirty worktree blocks create_branch
    repo = make_repo()
    (repo / "dirty.txt").write_text("dirty\n", encoding="utf-8")
    with pytest.raises(GitWorkerError) as ei:
        worker.create_branch(repo, "feature/T-P1-005-dirty", context=context)
    assert ei.value.code == "GIT-0001"
    assert ei.value.details["changed_files"] == ["dirty.txt"]

    # GIT-0002: explicit base_commit is not an ancestor of HEAD
    repo2 = make_repo()
    worker.create_branch(repo2, "feature/T-P1-006-base")
    run_git(repo2, "switch", "main")
    (repo2 / "main-side.txt").write_text("on main\n", encoding="utf-8")
    main_sha = commit_all(repo2, "main side commit")
    run_git(repo2, "switch", "feature/T-P1-006-base")
    (repo2 / "src").mkdir()
    (repo2 / "src" / "calc.py").write_text("a = 1\n", encoding="utf-8")
    with pytest.raises(GitWorkerError) as ei:
        worker.commit_and_collect(
            repo2, "feat(git_worker): calc", base_commit=main_sha, files_scope=["src/"]
        )
    assert ei.value.code == "GIT-0002"
    assert ei.value.message == "GIT_BASE_MISMATCH"

    # GIT-0003: change outside files_scope
    repo3 = make_repo()
    worker.create_branch(repo3, "feature/T-P1-007-scope")
    (repo3 / "src").mkdir()
    (repo3 / "src" / "a.py").write_text("a = 1\n", encoding="utf-8")
    (repo3 / "docs").mkdir()
    (repo3 / "docs" / "out-of-scope.md").write_text("outside\n", encoding="utf-8")
    with pytest.raises(GitWorkerError) as ei:
        worker.commit_and_collect(repo3, "feat(git_worker): mixed", files_scope=["src/"])
    assert ei.value.code == "GIT-0003"
    assert "docs/out-of-scope.md" in ei.value.details["outside_files_scope"]


# ---------------------------------------------------------------------------
# M1 injectable boundary (in-memory fake, no M1 import)
# ---------------------------------------------------------------------------


def test_m1_registration_records_commit_artifact_audit(
    tmp_path, monkeypatch, make_repo, context
):
    monkeypatch.delenv("AIEO_GIT_PATH", raising=False)
    monkeypatch.delenv("AIEO_LOG_DIR", raising=False)
    monkeypatch.setenv("AIEO_ENV", "test")
    repo = make_repo()
    m1 = InMemoryM1Client()
    w = GitWorker(
        log_dir=tmp_path / "logs", m1_client=m1, git_timeout_seconds=60.0
    )
    w.create_branch(repo, TASK_BRANCH, context=context)
    (repo / "src").mkdir()
    (repo / "src" / "calc.py").write_text("a = 1\n", encoding="utf-8")
    evidence = w.commit_and_collect(
        repo, "feat(git_worker): add calc", files_scope=["src/"], context=context
    )
    reg = evidence["m1_registration"]
    assert reg["status"] == "REGISTERED"
    # git_commits row: UNIQUE(repository_id, sha), full 40-hex sha
    assert len(m1.commits) == 1
    (repository_id, sha), row = next(iter(m1.commits.items()))
    assert repository_id == "REPO-TEST-001"
    assert sha == evidence["commit_sha"] and re.fullmatch(r"[0-9a-f]{40}", sha)
    assert row["task_id"] == "T-P1-001"
    assert row["execution_id"] == "EXEC-001"
    assert row["branch"] == TASK_BRANCH
    assert row["base_commit"] == evidence["base_commit"]
    # artifacts row: DIFF with matching sha256, file really written
    arts = list(m1.artifacts.values())
    assert len(arts) == 1
    assert arts[0]["type"] == "DIFF"
    assert arts[0]["sha256"] == evidence["diff_sha256"]
    assert row["diff_artifact_id"] == arts[0]["artifact_id"]
    diff_file = Path(arts[0]["path"])
    assert diff_file.exists()
    assert hashlib.sha256(diff_file.read_bytes()).hexdigest() == evidence["diff_sha256"]
    # audit trail covers branch creation and commit collection
    actions = [a["action"] for a in m1.audits]
    assert "git.branch_created" in actions
    assert "commit_and_collect" in actions
    # idempotent re-registration (UNIQUE(repository_id, sha)) adds no row
    again = m1.register_commit(
        task_id="T-P1-001",
        execution_id="EXEC-001",
        repository_id=repository_id,
        branch=row["branch"],
        sha=sha,
        base_commit=row["base_commit"],
        diff_artifact_id=row["diff_artifact_id"],
    )
    assert again == row["git_commit_id"]
    assert len(m1.commits) == 1
    assert m1.commit_call_count == 2


def test_m1_registration_failure_does_not_rollback_git(
    tmp_path, monkeypatch, make_repo, context
):
    monkeypatch.delenv("AIEO_GIT_PATH", raising=False)
    monkeypatch.delenv("AIEO_LOG_DIR", raising=False)
    monkeypatch.setenv("AIEO_ENV", "test")
    repo = make_repo()
    m1 = AlwaysFailingM1Client()
    w = GitWorker(
        log_dir=tmp_path / "logs", m1_client=m1, git_timeout_seconds=60.0
    )
    w.create_branch(repo, "feature/T-P1-014-m1-down", context=context)
    (repo / "src").mkdir()
    (repo / "src" / "calc.py").write_text("a = 2\n", encoding="utf-8")
    evidence = w.commit_and_collect(
        repo, "feat(git_worker): calc", files_scope=["src/"], context=context
    )
    # contract §11.4-④: registration failure must NOT roll back git
    assert evidence["m1_registration"]["status"] == "FAILED"
    assert "simulated M1 outage" in evidence["m1_registration"]["error"]
    assert w.commit_exists(repo, evidence["commit_sha"]) is True
    assert w.check_clean(repo) is True
    run_git(repo, "rev-parse", "--verify", evidence["commit_sha"])


def test_m1_registration_skipped_without_client(worker, make_repo):
    repo = make_repo()
    worker.create_branch(repo, "feature/T-P1-008-no-m1")
    (repo / "note.md").write_text("note\n", encoding="utf-8")
    evidence = worker.commit_and_collect(repo, "docs(git_worker): note")
    assert evidence["m1_registration"]["status"] == "SKIPPED"
    assert evidence["m1_registration"]["reason"] == "M1_CLIENT_NOT_CONFIGURED"


def test_m1_without_context_fails_closed(tmp_path, monkeypatch, make_repo):
    monkeypatch.delenv("AIEO_GIT_PATH", raising=False)
    monkeypatch.delenv("AIEO_LOG_DIR", raising=False)
    monkeypatch.setenv("AIEO_ENV", "test")
    repo = make_repo()
    m1 = InMemoryM1Client()
    w = GitWorker(
        log_dir=tmp_path / "logs", m1_client=m1, git_timeout_seconds=60.0
    )
    w.create_branch(repo, "feature/T-P1-009-ctx")
    (repo / "x.txt").write_text("x\n", encoding="utf-8")
    with pytest.raises(GitWorkerError) as ei:
        w.commit_and_collect(repo, "feat(git_worker): no ctx")
    assert ei.value.code == "REQ-0001"
    assert ei.value.message == "AUDIT_CONTEXT_REQUIRED"
    assert m1.commits == {}
    assert m1.audits == []


# ---------------------------------------------------------------------------
# C4 NDJSON logging to the default runtime/logs/git_worker directory
# ---------------------------------------------------------------------------


def test_c4_ndjson_default_log_dir(monkeypatch, make_repo):
    repo = make_repo()
    monkeypatch.delenv("AIEO_LOG_DIR", raising=False)
    monkeypatch.delenv("AIEO_GIT_PATH", raising=False)
    monkeypatch.setenv("AIEO_ENV", "test")
    w = GitWorker()  # default log root: runtime/logs under CWD
    sha = w.record_baseline(repo)
    assert re.fullmatch(r"[0-9a-f]{40}", sha)
    log_file = (
        Path.cwd() / "runtime" / "logs" / "git_worker"
        / f"git_worker-{datetime.now(timezone.utc).strftime('%Y%m%d')}.ndjson"
    )
    assert log_file.exists(), f"expected C4 NDJSON log at {log_file}"
    lines = log_file.read_text(encoding="utf-8").splitlines()
    assert lines
    record = json.loads(lines[-1])
    for key in ("timestamp", "level", "service", "module", "event", "message", "env"):
        assert key in record
    assert record["service"] == "git_worker"
    assert record["module"] == "M4"
    assert record["event"] == "git.baseline_recorded"
    assert record["operation"] == "record_baseline"
    assert record["result"] == "SUCCESS"
    assert record["base_commit"] == sha
    assert record["env"] == "test"
    assert re.match(r"\d{4}-\d{2}-\d{2}T", record["timestamp"])
