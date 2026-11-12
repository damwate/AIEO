"""Required coverage (7): audit records (append-only, in-transaction) plus
artifact sha256 semantics (C2 artifacts table, C3 ART-000x codes)."""
from __future__ import annotations

import hashlib

from conftest import SHA_A


def _sha(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def test_artifact_inline_content_hash_and_roundtrip(harness):
    env = harness.setup_project("PROJ-C1", "Project C1")
    task = harness.create_task(env["batch_id"], "Artifact host")
    content = "hello aieo artifact\n"
    digest = _sha(content)

    created = harness.post("/api/v1/artifacts", {
        "task_id": task["task_id"], "type": "TEST_LOG",
        "path": "reports/run-001.log", "sha256": digest, "content": content,
    })
    assert created["artifact_id"].startswith("ART-")
    assert created["duplicate"] is False

    # same path + same sha -> idempotent, no new artifact id
    again = harness.post("/api/v1/artifacts", {
        "task_id": task["task_id"], "type": "TEST_LOG",
        "path": "reports/run-001.log", "sha256": digest, "content": content,
    })
    assert again["duplicate"] is True
    assert again["artifact_id"] == created["artifact_id"]

    # same path + different sha -> conflict
    other = harness.post("/api/v1/artifacts", {
        "task_id": task["task_id"], "type": "TEST_LOG",
        "path": "reports/run-001.log", "sha256": _sha("other"), "content": "other",
    }, 409)
    assert other["code"] == "RES-0002"

    # sha mismatch between declared and actual content -> ART-0002
    mismatch = harness.post("/api/v1/artifacts", {
        "task_id": task["task_id"], "type": "ATTACHMENT",
        "path": "reports/run-002.log", "sha256": "0" * 64, "content": content,
    }, 422)
    assert mismatch["code"] == "ART-0002"

    # read back: content is served from the sha-addressed blob store
    view = harness.get(f"/api/v1/artifacts/{created['artifact_id']}")
    assert view["content"] == content
    assert view["content_size_bytes"] == len(content.encode("utf-8"))

    # unsafe paths are refused
    for path in ("/abs/path.log", "a/../b.log", "x/.git/config", "a\\b.log"):
        result = harness.raw("POST", "/api/v1/artifacts", {
            "task_id": task["task_id"], "type": "OTHER",
            "path": path, "sha256": digest,
        })
        assert result.status_code == 400, path

    # unknown artifact id -> ART-0001
    harness.get("/api/v1/artifacts/ART-OTHER-999", 404)


def test_audit_records_appended_for_key_actions(harness):
    env = harness.setup_project("PROJ-C2", "Project C2")
    task = harness.create_task(env["batch_id"], "Audited task")
    harness.event(task["task_id"], "PLAN", "c2-plan")

    # task creation, state transition and message dispatch are all audited
    audit_created = harness.get("/api/v1/audit?action=task_created")
    assert audit_created["total"] == 1
    assert audit_created["items"][0]["target_id"] == task["task_id"]

    audit_transition = harness.get(
        f"/api/v1/audit?action=task_transition&target_id={task['task_id']}")
    transitions = [item["details"]["to"] for item in audit_transition["items"]]
    assert transitions == ["PLANNING"]

    # a failed transition leaves NO task_transition audit row (atomic rollback)
    harness.raw("POST", f"/api/v1/tasks/{task['task_id']}/events",
                {"event": "DISPATCH", "event_id": "c2-illegal"})
    audit_transition = harness.get(
        f"/api/v1/audit?action=task_transition&target_id={task['task_id']}")
    assert audit_transition["total"] == 1  # unchanged

    harness.drive_to_ready(task["task_id"], "c2")
    harness.claim(task["task_id"])
    audit_claim = harness.get("/api/v1/audit?action=claim_task")
    assert audit_claim["total"] == 1
    assert audit_claim["items"][0]["details"]["execution_id"].startswith("EXEC-")

    # message registration is audited with the message id as target
    audit_message = harness.get("/api/v1/audit?action=message_registered")
    assert audit_message["total"] >= 1  # the TASK_ASSIGNED dispatch message

    # unknown action filter simply matches nothing
    assert harness.get("/api/v1/audit?action=does_not_exist")["total"] == 0

    # target_type filter works too
    audit_tasks = harness.get("/api/v1/audit?target_type=task")
    assert {item["action"] for item in audit_tasks["items"]} >= {"task_created"}


def test_audit_login_failure_recorded(client):
    # unauthenticated login failure is audited (security trail, C4)
    response = client.post("/api/v1/auth/login",
                           json={"username": "OWNER", "password": "wrong-password"})
    assert response.status_code == 401
    # audit endpoint requires auth; log in properly and inspect
    csrf = client.post("/api/v1/auth/login",
                       json={"username": "OWNER", "password": "unit-test-password"}
                       ).json()["csrf_token"]
    audit = client.get("/api/v1/audit?action=login_failed",
                       headers={"X-CSRF-Token": csrf}).json()
    assert audit["total"] == 1
    assert audit["items"][0]["result"] == "FAILURE"
    assert audit["items"][0]["actor_id"] == "OWNER"
