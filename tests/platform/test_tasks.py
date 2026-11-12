"""Required coverage (2)(3): parent-child dependencies and state transitions.

The state machine is the sole owner of task status (04-规范 §3); agents may
only submit events. Direct ACCEPTED is impossible: there is no event edge
from READY (or any non TEST_ACCEPTANCE state) to ACCEPTED.
"""
from __future__ import annotations

import pytest

from conftest import SHA_A, SHA_B, SHA_C


def test_parent_child_dependency_blocks_child_until_parent_accepted(harness):
    env = harness.setup_project("PROJ-E1", "Project E1")
    parent = harness.create_task(env["batch_id"], "Parent task", weight=2.0)
    child = harness.create_task(env["batch_id"], "Child task",
                                dependencies=[parent["task_id"]])

    # dependency listing shows the pending parent
    deps = harness.get(f"/api/v1/tasks/{child['task_id']}/dependencies")
    assert deps["dependencies_satisfied"] is False
    assert deps["pending"][0]["task_id"] == parent["task_id"]

    # planning may proceed in parallel, but the child cannot become READY
    # while the parent is not ACCEPTED -> TASK-0002 (also blocks DISPATCH)
    harness.event(child["task_id"], "PLAN", "child-plan")
    harness.event(child["task_id"], "ARCH_REVIEW", "child-arch")
    result = harness.raw("POST", f"/api/v1/tasks/{child['task_id']}/events",
                         {"event": "PASS", "event_id": "child-ready"})
    assert result.status_code == 409
    assert result.json()["code"] == "TASK-0002"
    harness.claim(child["task_id"], expect=409)

    # advance parent to ACCEPTED via the full evidence chain
    harness.drive_to_ready(parent["task_id"], "parent")
    claim = harness.claim(parent["task_id"])
    harness.event(parent["task_id"], "START", "parent-start")
    harness.post("/api/v1/reports/development", {
        "task_id": parent["task_id"], "execution_id": claim["execution_id"],
        "status": "COMPLETED", "payload": {},
    })
    harness.event(parent["task_id"], "GIT_VALIDATE", "parent-git")
    harness.event(parent["task_id"], "PASS", "parent-git-pass")
    harness.post("/api/v1/reports/review", {
        "task_id": parent["task_id"], "execution_id": claim["execution_id"],
        "reviewed_commit": SHA_C, "reviewer": "GPT-03", "result": "PASS",
        "task_package_hash": parent["task_package_hash"], "base_commit": SHA_B,
        "engineering_standard_version": "v1.0", "knowledge_base_commit": SHA_A,
        "payload": {},
    })
    harness.post("/api/v1/reports/test", {
        "task_id": parent["task_id"], "execution_id": claim["execution_id"],
        "commit_sha": SHA_C, "execution_result": "EXECUTED_PASS", "result": "PASS",
        "payload": {},
    })
    assert harness.get(f"/api/v1/tasks/{parent['task_id']}")["status"] == "ACCEPTED"

    deps = harness.get(f"/api/v1/tasks/{child['task_id']}/dependencies")
    assert deps["dependencies_satisfied"] is True
    # child can now become READY and dispatch (claim)
    harness.event(child["task_id"], "PASS", "child-ready-ok")
    claim_child = harness.claim(child["task_id"])
    assert claim_child["task"]["status"] == "DISPATCHED"
    assert claim_child["attempt"] == 1


def test_unknown_dependency_rejected(harness):
    env = harness.setup_project("PROJ-E2", "Project E2")
    harness.create_task(env["batch_id"], "Orphan", dependencies=["T-P1-999"], expect=404)


def test_parent_must_exist(harness):
    env = harness.setup_project("PROJ-E3", "Project E3")
    harness.create_task(env["batch_id"], "Orphan", parent_id="T-P1-999", expect=404)


def test_legal_transition_chain_and_duplicate_event_idempotency(harness):
    env = harness.setup_project("PROJ-E4", "Project E4")
    task = harness.create_task(env["batch_id"], "Chain task")
    assert task["status"] == "DRAFT"

    first = harness.event(task["task_id"], "PLAN", "chain-1")
    assert (first["from_status"], first["to_status"]) == ("DRAFT", "PLANNING")
    second = harness.event(task["task_id"], "ARCH_REVIEW", "chain-2")
    assert second["to_status"] == "ARCH_REVIEW"

    # replaying the same event_id returns the original result without side effects
    replay = harness.event(task["task_id"], "ARCH_REVIEW", "chain-2")
    assert replay["to_status"] == "ARCH_REVIEW"
    assert replay["processed_at"] == second["processed_at"]
    status = harness.get(f"/api/v1/tasks/{task['task_id']}")["status"]
    assert status == "ARCH_REVIEW"

    passed = harness.event(task["task_id"], "PASS", "chain-3")
    assert passed["to_status"] == "READY"


def test_illegal_transitions_rejected_with_task_0001(harness):
    env = harness.setup_project("PROJ-E5", "Project E5")
    task = harness.create_task(env["batch_id"], "Illegal target")

    # DRAFT has no ACCEPTED, DISPATCH or DEVELOPMENT_COMPLETED edges
    for event in ("ACCEPTED", "DISPATCH", "DEVELOPMENT_COMPLETED", "PASS"):
        result = harness.raw("POST", f"/api/v1/tasks/{task['task_id']}/events",
                             {"event": event, "event_id": f"illegal-{event}"})
        assert result.status_code == 409
        assert result.json()["code"] == "TASK-0001"


def test_agent_cannot_set_accepted_directly(harness):
    env = harness.setup_project("PROJ-E6", "Project E6")
    task = harness.create_task(env["batch_id"], "Evidence-less task")
    # even from TEST_ACCEPTANCE, PASS without evidence is refused by the machine
    harness.drive_to_ready(task["task_id"], "e6")
    harness.claim(task["task_id"])
    harness.event(task["task_id"], "START", "e6-start")
    harness.event(task["task_id"], "DEVELOPMENT_COMPLETED", "e6-dev")
    harness.event(task["task_id"], "GIT_VALIDATE", "e6-git")
    harness.event(task["task_id"], "PASS", "e6-git-pass")  # -> CODE_REVIEW
    harness.event(task["task_id"], "PASS", "e6-review-pass")  # -> TEST_ACCEPTANCE
    # even from TEST_ACCEPTANCE, PASS without evidence is refused by the machine
    result = harness.raw("POST", "/api/v1/tasks/%s/events" % task["task_id"],
                         {"event": "PASS", "event_id": "e6-accept-attempt"})
    assert result.status_code == 409
    assert result.json()["code"] == "TASK-0001"
    assert harness.get(f"/api/v1/tasks/{task['task_id']}")["status"] == "TEST_ACCEPTANCE"
    assert "review_pass" in result.json()["details"]


def test_blocked_requires_reason_owner_and_condition(harness):
    env = harness.setup_project("PROJ-E7", "Project E7")
    task = harness.create_task(env["batch_id"], "Blocked candidate")
    harness.event(task["task_id"], "PLAN", "e7-plan")
    harness.event(task["task_id"], "ARCH_REVIEW", "e7-arch")
    # missing fields -> REQ-0002
    result = harness.raw("POST", f"/api/v1/tasks/{task['task_id']}/events",
                         {"event": "BLOCKED", "event_id": "e7-blocked-bad"})
    assert result.status_code == 422
    assert result.json()["code"] == "REQ-0002"
    fields = {f["field"] for f in result.json()["details"]["fields"]}
    assert fields == {"blocked_reason", "blocked_owner", "unblock_condition"}
    # complete fields -> BLOCKED
    ok = harness.event(task["task_id"], "BLOCKED", "e7-blocked-ok",
                       blocked_reason="waiting decision", blocked_owner="user",
                       unblock_condition="decision recorded")
    assert ok["to_status"] == "BLOCKED"
    detail = harness.get(f"/api/v1/tasks/{task['task_id']}")
    assert detail["blocked_reason"] == "waiting decision"
    assert detail["allowed_events"] == ["CANCEL"]


def test_cancel_records_operator_and_reason(harness):
    env = harness.setup_project("PROJ-E8", "Project E8")
    task = harness.create_task(env["batch_id"], "To cancel")
    result = harness.raw("POST", f"/api/v1/tasks/{task['task_id']}/events",
                         {"event": "CANCEL", "event_id": "e8-cancel-bad"})
    assert result.status_code == 422  # cancelled_by/reason mandatory
    ok = harness.event(task["task_id"], "CANCEL", "e8-cancel-ok",
                       cancelled_by="OWNER", cancelled_reason="requirement withdrawn")
    assert ok["to_status"] == "CANCELLED"
    detail = harness.get(f"/api/v1/tasks/{task['task_id']}")
    assert detail["status"] == "CANCELLED"
    assert detail["cancelled_by"] == "OWNER"
    assert detail["cancelled_reason"] == "requirement withdrawn"
    # terminal state: no further transitions
    result = harness.raw("POST", f"/api/v1/tasks/{task['task_id']}/events",
                         {"event": "PLAN", "event_id": "e8-after-terminal"})
    assert result.status_code == 409


def test_claim_conflict_and_dependency_not_ready_codes(harness):
    env = harness.setup_project("PROJ-E9", "Project E9")
    task = harness.create_task(env["batch_id"], "Claimable")
    # claim from DRAFT -> TASK-0001 (no edge)
    harness.claim(task["task_id"], expect=409)
    harness.drive_to_ready(task["task_id"], "e9")
    first = harness.claim(task["task_id"])
    assert first["task"]["status"] == "DISPATCHED"
    assert first["dispatch_message_id"].startswith("MSG-")
    # second claim -> TASK-0003
    result = harness.raw("POST", f"/api/v1/tasks/{task['task_id']}/claim",
                         {"agent_id": "ZCODE-01", "base_commit": SHA_B})
    assert result.status_code == 409
    assert result.json()["code"] == "TASK-0003"


def test_task_listing_filters(harness):
    env = harness.setup_project("PROJ-EA", "Project EA")
    parent = harness.create_task(env["batch_id"], "Parent listing", weight=3.0)
    child = harness.create_task(env["batch_id"], "Child listing",
                                parent_id=parent["task_id"])
    listing = harness.get(f"/api/v1/tasks?batch_id={env['batch_id']}&parent_id={parent['task_id']}")
    assert listing["total"] == 1
    assert listing["items"][0]["task_id"] == child["task_id"]
    listing = harness.get(f"/api/v1/tasks?batch_id={env['batch_id']}&status=DRAFT")
    assert listing["total"] == 2
