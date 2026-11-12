"""C7 §8.6 service-identity permission whitelist (T-P1-901 F-403).

Local service agents get a default-deny allowlist covering only their task/
report/artifact/commit/message-ack workflow; management operations (agent
registration, service-token issuance, project creation, message requeue,
approvals, audit) stay human-only.
"""
from __future__ import annotations

from fastapi.testclient import TestClient

from conftest import PlatformHarness, make_settings


def service_client(tmp_path):
    """Fresh app + harness; returns (client, harness, service_token)."""
    from app.platform.main import create_app

    settings = make_settings(tmp_path)
    client = TestClient(create_app(settings))
    harness = PlatformHarness(client)
    created = harness.post("/api/v1/agents", {
        "agent_id": "M4-WORKER", "agent_type": "system", "role": "git-worker",
        "issue_service_token": True,
    })
    return client, harness, created["service_token"]


def bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_service_token_can_read_session_and_board(tmp_path):
    client, _, token = service_client(tmp_path)
    whoami = client.get("/api/v1/auth/session", headers=bearer(token))
    assert whoami.status_code == 200
    assert whoami.json()["kind"] == "service"
    assert client.get("/api/v1/board", headers=bearer(token)).status_code == 200


def test_service_token_blocked_from_agent_registration_and_token_issuance(tmp_path):
    client, harness, token = service_client(tmp_path)
    # F-403 core: a service token must not register agents nor self-issue new tokens.
    response = client.post("/api/v1/agents", json={
        "agent_id": "ROGUE", "agent_type": "system", "role": "agent",
        "issue_service_token": True,
    }, headers=bearer(token))
    assert response.status_code == 403
    assert response.json()["code"] == "AUTH-0002"
    assert "whitelist" in response.json()["message"]
    # the rogue agent must not exist
    listed = harness.get("/api/v1/agents")
    assert all(agent["agent_id"] != "ROGUE" for agent in listed["items"])


def test_service_token_blocked_from_project_creation_and_audit(tmp_path):
    client, _, token = service_client(tmp_path)
    assert client.post("/api/v1/projects", json={"project_id": "P-S", "name": "s"},
                       headers=bearer(token)).status_code == 403
    assert client.get("/api/v1/audit", headers=bearer(token)).status_code == 403


def test_service_token_blocked_from_message_admin_operations(tmp_path):
    client, harness, token = service_client(tmp_path)
    # requeue/cancel/sweep are human-only management operations (contract §message).
    assert client.post("/api/v1/messages/sweep", headers=bearer(token)).status_code == 403
    assert client.post("/api/v1/messages/MSG-X/requeue", json={"reason": "x"},
                       headers=bearer(token)).status_code == 403
    assert client.post("/api/v1/messages/MSG-X/cancel", json={"reason": "x"},
                       headers=bearer(token)).status_code == 403


def test_service_token_allowed_workflow_end_to_end(tmp_path):
    client, harness, token = service_client(tmp_path)
    task_id = harness.create_task(harness.setup_project()["batch_id"], "whitelisted flow")["task_id"]
    harness.drive_to_ready(task_id, "T-WL")
    # claim + event submission are whitelisted for the service identity
    claimed = client.post(f"/api/v1/tasks/{task_id}/claim",
                          json={"agent_id": "M4-WORKER", "base_commit": "c" * 40},
                          headers=bearer(token))
    assert claimed.status_code == 200
    # state machine: READY→(claim)DISPATCHED→START→IN_PROGRESS→DEVELOPMENT_COMPLETED→DEV_REPORTED
    started = client.post(f"/api/v1/tasks/{task_id}/events", json={
        "event": "START", "event_id": "EVT-WL-START",
    }, headers=bearer(token))
    assert started.status_code == 200
    event = client.post(f"/api/v1/tasks/{task_id}/events", json={
        "event": "DEVELOPMENT_COMPLETED", "event_id": "EVT-WL-DEV",
        "payload": {"evidence": "63/63"},
    }, headers=bearer(token))
    assert event.status_code == 200
    # artifact + commit registration are whitelisted (M4 Git Worker flow)
    import hashlib

    log_content = "63/63 passed"
    artifact = client.post("/api/v1/artifacts", json={
        "task_id": task_id, "type": "TEST_LOG",
        "path": "artifacts/art-wl-1.log",
        "sha256": hashlib.sha256(log_content.encode("utf-8")).hexdigest(),
        "content": log_content,
    }, headers=bearer(token))
    assert artifact.status_code == 201
    artifact_id = artifact.json()["artifact_id"]
    commit = client.post("/api/v1/commits", json={
        "task_id": task_id, "execution_id": claimed.json()["execution_id"],
        "repository_id": "REPO-001", "branch": "feature/wl",
        "sha": "b" * 40, "base_commit": "c" * 40, "diff_artifact_id": artifact_id,
    }, headers=bearer(token))
    assert commit.status_code == 201
    # message ack is whitelisted; requeue is not
    assert client.get("/api/v1/messages", headers=bearer(token)).status_code == 200


def test_service_token_blocked_from_approval_creation(tmp_path):
    client, harness, token = service_client(tmp_path)
    assert client.post("/api/v1/approvals", json={
        "approval_id": "APR-S", "target_type": "task", "target_id": "T-X",
        "decision": "APPROVED", "approver": "M4-WORKER",
    }, headers=bearer(token)).status_code == 403


def test_human_session_keeps_full_access(tmp_path):
    client, harness, _ = service_client(tmp_path)
    # the human OWNER session is unaffected by the service whitelist
    created = harness.post("/api/v1/agents", {
        "agent_id": "HUMAN-MADE", "agent_type": "system", "role": "agent",
    })
    assert created["agent"]["agent_id"] == "HUMAN-MADE"
    assert harness.post("/api/v1/projects", {"project_id": "P-H", "name": "h"})["project_id"] == "P-H"
