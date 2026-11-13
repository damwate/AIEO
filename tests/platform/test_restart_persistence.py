"""Required coverage (5): state survives a restart.

A brand-new FastAPI/Database engine instance is opened on the same SQLite
file (the "restart"); tasks, executions, messages, audit and idempotency
behaviour must all be preserved.
"""
from __future__ import annotations

from fastapi.testclient import TestClient

from conftest import PlatformHarness, make_settings
from app.platform.main import create_app


def test_state_persists_across_engine_restart(tmp_path):
    # ---- first engine instance ----
    settings = make_settings(tmp_path)
    client1 = TestClient(create_app(settings))
    harness1 = PlatformHarness(client1)
    env = harness1.setup_project("PROJ-D1", "Project D1")
    task = harness1.create_task(env["batch_id"], "Persistent task")
    harness1.event(task["task_id"], "PLAN", "d1-plan")
    harness1.drive_to_ready(task["task_id"], "d1")
    claim = harness1.claim(task["task_id"])
    message_id = claim["dispatch_message_id"]

    # ---- "restart": second engine instance on the same DB file ----
    settings2 = make_settings(tmp_path)
    assert settings2.db_path == settings.db_path
    client2 = TestClient(create_app(settings2))
    harness2 = PlatformHarness(client2)

    # task state and execution history survive
    view = harness2.get(f"/api/v1/tasks/{task['task_id']}")
    assert view["status"] == "DISPATCHED"
    assert view["latest_execution"]["execution_id"] == claim["execution_id"]
    assert view["latest_execution"]["attempt"] == 1

    # project/batch/repository/agent registries survive
    assert harness2.get(f"/api/v1/projects/{env['project_id']}")["project_id"] == env["project_id"]
    agents = harness2.get("/api/v1/agents")
    assert any(agent["agent_id"] == "ZCODE-01" for agent in agents["items"])

    # outbox message state survives (PENDING: no sweep ran before the restart)
    message = harness2.get(f"/api/v1/messages/{message_id}")
    assert message["status"] == "PENDING"

    # audit trail survives
    audit = harness2.get("/api/v1/audit?action=claim_task")
    assert audit["total"] == 1

    # idempotency still enforced against pre-restart rows:
    # duplicate event replay returns the original result (no side effects)
    replay = harness2.event(task["task_id"], "PLAN", "d1-plan")
    assert replay["to_status"] == "PLANNING"
    assert replay["processed_at"].endswith("Z")
    # 2) duplicate message registration -> RES-0003, not a second row
    #    (the dispatch message_id from before the restart is the dedup key)
    envelope = {
        "schema_version": "1.0",
        "message_id": message_id,
        "message_type": "PROGRESS_UPDATED",
        "created_at": "2026-11-12T20:00:00+08:00",
        "source": {"agent_id": "ZCODE-01", "agent_type": "developer"},
        "target": {"agent_id": "AIEO-ORCHESTRATOR", "agent_type": "system"},
        "project_id": env["project_id"],
        "batch_id": env["batch_id"],
        "task_id": task["task_id"],
        "correlation_id": "CORR-101",
        "payload": {"progress": 10},
    }
    duplicate = harness2.post("/api/v1/messages", envelope, 409)
    assert duplicate["code"] == "RES-0003"
    assert duplicate["details"]["message_id"].startswith("MSG-")

    # the restarted engine can keep driving the state machine
    harness2.event(task["task_id"], "START", "d1-start")
    assert harness2.get(f"/api/v1/tasks/{task['task_id']}")["status"] == "IN_PROGRESS"


def test_admin_rebootstrap_is_idempotent(tmp_path):
    client1 = TestClient(create_app(make_settings(tmp_path)))
    csrf1 = client1.post("/api/v1/auth/login",
                         json={"username": "OWNER", "password": "unit-test-password"}
                         ).json()["csrf_token"]

    # second engine bootstrap on the same DB must not duplicate the admin user
    client2 = TestClient(create_app(make_settings(tmp_path)))
    csrf2 = client2.post("/api/v1/auth/login",
                         json={"username": "OWNER", "password": "unit-test-password"}
                         ).json()["csrf_token"]
    assert csrf2

    # sessions issued by engine 1 were stored in the DB; but sessions are
    # process-bound in Phase 1 (cookie value is signed per secret), so a fresh
    # login is the supported path and must work on both engines.
    me = client1.get("/api/v1/auth/session", headers={"X-CSRF-Token": csrf1})
    assert me.status_code == 200
    assert me.json()["username"] == "OWNER"
