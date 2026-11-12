"""Required coverage (6): the board counts only ACCEPTED tasks toward completion.

Also covers the report-driven happy path to ACCEPTED and report idempotency.
"""
from __future__ import annotations

from conftest import SHA_A, SHA_B, SHA_C


def _accept_task(harness, env, task, commit_sha):
    harness.drive_to_ready(task["task_id"], task["task_id"].lower())
    claim = harness.claim(task["task_id"])
    harness.event(task["task_id"], "START", f"{task['task_id']}-start")
    harness.post("/api/v1/reports/development", {
        "task_id": task["task_id"], "execution_id": claim["execution_id"],
        "status": "COMPLETED", "payload": {},
    })
    harness.post("/api/v1/commits", {
        "task_id": task["task_id"], "execution_id": claim["execution_id"],
        "repository_id": "REPO-001", "branch": f"feature/{task['task_id']}-work",
        "sha": commit_sha, "base_commit": SHA_B,
    })
    harness.event(task["task_id"], "GIT_VALIDATE", f"{task['task_id']}-gitval")
    harness.event(task["task_id"], "PASS", f"{task['task_id']}-gitpass")
    harness.post("/api/v1/reports/review", {
        "task_id": task["task_id"], "execution_id": claim["execution_id"],
        "reviewed_commit": commit_sha, "reviewer": "GPT-03", "result": "PASS",
        "task_package_hash": task["task_package_hash"], "base_commit": SHA_B,
        "engineering_standard_version": "v1.0", "knowledge_base_commit": SHA_A,
        "payload": {},
    })
    harness.post("/api/v1/reports/test", {
        "task_id": task["task_id"], "execution_id": claim["execution_id"],
        "commit_sha": commit_sha, "execution_result": "EXECUTED_PASS",
        "result": "PASS", "payload": {},
    })


def test_board_completion_counts_only_accepted(harness):
    env = harness.setup_project("PROJ-G1", "Project G1")
    accepted_task = harness.create_task(env["batch_id"], "Will be accepted", weight=3.0)
    in_progress = harness.create_task(env["batch_id"], "Will stay in progress", weight=1.0)
    blocked = harness.create_task(env["batch_id"], "Will be blocked", weight=2.0)
    cancelled = harness.create_task(env["batch_id"], "Will be cancelled", weight=4.0)

    _accept_task(harness, env, accepted_task, SHA_C)
    assert harness.get(f"/api/v1/tasks/{accepted_task['task_id']}")["status"] == "ACCEPTED"

    # in-progress task: DRAFT -> ... -> DISPATCHED -> IN_PROGRESS
    harness.drive_to_ready(in_progress["task_id"], in_progress["task_id"].lower())
    claim = harness.claim(in_progress["task_id"])
    harness.event(in_progress["task_id"], "START", f"{in_progress['task_id']}-start")

    # blocked task with mandatory fields (BLOCKED is legal from ARCH_REVIEW)
    harness.event(blocked["task_id"], "PLAN", "g1-blocked-plan")
    harness.event(blocked["task_id"], "ARCH_REVIEW", "g1-blocked-arch")
    harness.event(blocked["task_id"], "BLOCKED", "g1-blocked",
                  blocked_reason="needs decision", blocked_owner="user",
                  unblock_condition="decision recorded")

    # cancelled task
    harness.event(cancelled["task_id"], "CANCEL", "g1-cancel",
                  cancelled_by="OWNER", cancelled_reason="no longer needed")

    board = harness.get(f"/api/v1/board?project_id={env['project_id']}")["items"][0]
    # valid = all tasks except CANCELLED: 3.0 + 1.0 + 2.0 = 6.0
    # completion = ACCEPTED weight (3.0) / valid weight (6.0) = 50%
    assert board["total_tasks"] == 4
    assert board["valid_tasks"] == 3
    assert board["cancelled_tasks"] == 1
    assert board["accepted_weight"] == 3.0
    assert board["valid_weight"] == 6.0
    assert board["completion_percent"] == 50.0
    assert board["status_counts"]["ACCEPTED"] == 1
    assert board["status_counts"]["IN_PROGRESS"] == 1
    assert board["status_counts"]["BLOCKED"] == 1
    assert board["status_counts"]["CANCELLED"] == 1
    assert board["blocked_tasks"] == [blocked["task_id"]]
    assert board["batches"][0]["completion_percent"] == 50.0
    # DEV_REPORTED/GIT_VALIDATING/CODE_REVIEW etc. would not count as complete;
    # here IN_PROGRESS is already in the denominator but not the numerator.


def test_dev_report_and_duplicate_report_idempotency(harness):
    env = harness.setup_project("PROJ-G2", "Project G2")
    task = harness.create_task(env["batch_id"], "Report idempotency")
    harness.drive_to_ready(task["task_id"], "g2")
    claim = harness.claim(task["task_id"])
    harness.event(task["task_id"], "START", "g2-start")

    first = harness.post("/api/v1/reports/development", {
        "task_id": task["task_id"], "execution_id": claim["execution_id"],
        "status": "COMPLETED", "payload": {},
    })
    assert first["transition"]["to_status"] == "DEV_REPORTED"
    # duplicate execution_id -> RES-0003
    duplicate = harness.post("/api/v1/reports/development", {
        "task_id": task["task_id"], "execution_id": claim["execution_id"],
        "status": "COMPLETED", "payload": {},
    }, 409)
    assert duplicate["code"] == "RES-0003"

    # review with mismatched task_package_hash is rejected (03-协议 §10 binding)
    harness.event(task["task_id"], "GIT_VALIDATE", "g2-gitval")
    harness.event(task["task_id"], "PASS", "g2-gitpass")
    result = harness.raw("POST", "/api/v1/reports/review", {
        "task_id": task["task_id"], "execution_id": claim["execution_id"],
        "reviewed_commit": SHA_C, "reviewer": "GPT-03", "result": "PASS",
        "task_package_hash": "0" * 64, "base_commit": SHA_B,
        "engineering_standard_version": "v1.0", "knowledge_base_commit": SHA_A,
        "payload": {},
    })
    assert result.status_code == 400
    assert result.json()["code"] == "REQ-0001"

    # test PASS without EXECUTED_PASS is refused (claims are not evidence)
    harness.post("/api/v1/reports/review", {
        "task_id": task["task_id"], "execution_id": claim["execution_id"],
        "reviewed_commit": SHA_C, "reviewer": "GPT-03", "result": "PASS",
        "task_package_hash": task["task_package_hash"], "base_commit": SHA_B,
        "engineering_standard_version": "v1.0", "knowledge_base_commit": SHA_A,
        "payload": {},
    })
    result = harness.raw("POST", "/api/v1/reports/test", {
        "task_id": task["task_id"], "execution_id": claim["execution_id"],
        "commit_sha": SHA_C, "execution_result": "CLAIMED_ONLY", "result": "PASS",
        "payload": {},
    })
    assert result.status_code == 400
    assert result.json()["code"] == "REQ-0001"
    assert harness.get(f"/api/v1/tasks/{task['task_id']}")["status"] == "TEST_ACCEPTANCE"


def test_review_rework_creates_new_execution_round(harness):
    env = harness.setup_project("PROJ-G3", "Project G3")
    task = harness.create_task(env["batch_id"], "Reworked task")
    harness.drive_to_ready(task["task_id"], "g3")
    first_claim = harness.claim(task["task_id"])
    harness.event(task["task_id"], "START", "g3-start")
    harness.post("/api/v1/reports/development", {
        "task_id": task["task_id"], "execution_id": first_claim["execution_id"],
        "status": "COMPLETED", "payload": {},
    })
    harness.post("/api/v1/commits", {
        "task_id": task["task_id"], "execution_id": first_claim["execution_id"],
        "repository_id": "REPO-001", "branch": f"feature/{task['task_id']}-work",
        "sha": SHA_C, "base_commit": SHA_B,
    })
    harness.event(task["task_id"], "GIT_VALIDATE", "g3-gitval")
    harness.event(task["task_id"], "PASS", "g3-gitpass")
    # review says REWORK -> REWORK state
    harness.post("/api/v1/reports/review", {
        "task_id": task["task_id"], "execution_id": first_claim["execution_id"],
        "reviewed_commit": SHA_C, "reviewer": "GPT-03", "result": "REWORK",
        "task_package_hash": task["task_package_hash"], "base_commit": SHA_B,
        "engineering_standard_version": "v1.0", "knowledge_base_commit": SHA_A,
        "payload": {},
    })
    assert harness.get(f"/api/v1/tasks/{task['task_id']}")["status"] == "REWORK"

    # rework: REWORK -> ARCH_REVIEW -> READY -> claim again (attempt 2)
    harness.event(task["task_id"], "ARCH_REVIEW", "g3-re-arch")
    harness.event(task["task_id"], "PASS", "g3-re-pass")
    second_claim = harness.claim(task["task_id"])
    assert second_claim["attempt"] == 2
    assert second_claim["execution_id"] != first_claim["execution_id"]

    # old execution and reports remain (append-only history, 04-规范 §2)
    reports = harness.get(f"/api/v1/reports?type=review&task_id={task['task_id']}")
    assert reports["total"] == 1  # first-round review retained
    commits = harness.get(f"/api/v1/commits?task_id={task['task_id']}")
    assert commits["total"] == 1


def test_board_requires_known_project(harness):
    harness.get("/api/v1/board?project_id=GHOST", 404)
