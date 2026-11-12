"""Required coverage (4): duplicate messages are not double-processed.

Also covers ACK semantics, envelope validation (C1 §2.2), the outbox sweep
(ACK timeout -> RETRYING -> DEAD_LETTER) and manual requeue.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from conftest import PlatformHarness, make_settings


def _envelope(harness: PlatformHarness, env: dict, task_id: str, message_id: str,
              message_type: str = "PROGRESS_UPDATED", **overrides) -> dict:
    body = {
        "schema_version": "1.0",
        "message_id": message_id,
        "message_type": message_type,
        "created_at": "2026-11-12T20:00:00+08:00",
        "source": {"agent_id": "ZCODE-01", "agent_type": "developer"},
        "target": {"agent_id": "AIEO-ORCHESTRATOR", "agent_type": "system"},
        "project_id": env["project_id"],
        "batch_id": env["batch_id"],
        "task_id": task_id,
        "correlation_id": "CORR-001",
        "payload": {"progress": 50},
    }
    body.update(overrides)
    return body


def test_duplicate_message_not_double_processed(harness):
    env = harness.setup_project("PROJ-F1", "Project F1")
    task = harness.create_task(env["batch_id"], "Message target")
    envelope = _envelope(harness, env, task["task_id"], "MSG-20261112-000201")

    first = harness.post("/api/v1/messages", envelope, 202)
    assert first["message_id"] == "MSG-20261112-000201"
    assert first["status"] == "PENDING"
    assert first["direction"] == "INBOUND"

    duplicate = harness.post("/api/v1/messages", envelope, 409)
    assert duplicate["code"] == "RES-0003"
    # the original processing result is returned, no duplicate row created
    assert duplicate["details"]["status"] == "PENDING"

    listing = harness.get("/api/v1/messages?correlation_id=CORR-001")
    assert listing["total"] == 1

    # stored created_at is UTC (input was +08:00)
    detail = harness.get("/api/v1/messages/MSG-20261112-000201")
    assert detail["created_at"].endswith("Z")
    assert detail["payload"] == {"progress": 50}


def test_unknown_fields_are_ignored_and_version_checked(harness):
    env = harness.setup_project("PROJ-F2", "Project F2")
    task = harness.create_task(env["batch_id"], "Version target")
    envelope = _envelope(harness, env, task["task_id"], "MSG-20261112-000202",
                         extra_top_level_field={"anything": 1})
    accepted = harness.post("/api/v1/messages", envelope, 202)
    assert accepted["message_id"] == "MSG-20261112-000202"

    # major version mismatch -> REQ-0003
    bad = _envelope(harness, env, task["task_id"], "MSG-20261112-000203",
                    schema_version="2.0")
    result = harness.raw("POST", "/api/v1/messages", bad)
    assert result.status_code == 400
    assert result.json()["code"] == "REQ-0003"

    # unknown message_type -> REQ-0002 (schema validation)
    bad = _envelope(harness, env, task["task_id"], "MSG-20261112-000204",
                    message_type="NEW_FANCY_TYPE")
    result = harness.raw("POST", "/api/v1/messages", bad)
    assert result.status_code == 422
    assert result.json()["code"] == "REQ-0002"

    # unregistered source agent -> RES-0001
    bad = _envelope(harness, env, task["task_id"], "MSG-20261112-000205",
                    source={"agent_id": "GHOST-9", "agent_type": "developer"})
    result = harness.raw("POST", "/api/v1/messages", bad)
    assert result.status_code == 404
    assert result.json()["code"] == "RES-0001"


def test_conditional_mandatory_fields_by_message_type(harness):
    env = harness.setup_project("PROJ-F3", "Project F3")
    task = harness.create_task(env["batch_id"], "Conditional target")
    # task-level type without task_id -> REQ-0001
    body = _envelope(harness, env, task["task_id"], "MSG-20261112-000206")
    body.pop("task_id")
    result = harness.raw("POST", "/api/v1/messages", body)
    assert result.status_code == 400
    assert result.json()["code"] == "REQ-0001"

    # batch-level type carrying task_id -> REQ-0001
    body = _envelope(harness, env, task["task_id"], "MSG-20261112-000207",
                     message_type="TASK_PLAN_SUBMITTED")
    result = harness.raw("POST", "/api/v1/messages", body)
    assert result.status_code == 400
    assert result.json()["code"] == "REQ-0001"


def test_ack_is_idempotent_and_dead_letter_requeue_requires_human(harness):
    env = harness.setup_project("PROJ-F4", "Project F4")
    task = harness.create_task(env["batch_id"], "Ack target")
    envelope = _envelope(harness, env, task["task_id"], "MSG-20261112-000208")
    harness.post("/api/v1/messages", envelope, 202)

    acked = harness.post("/api/v1/messages/MSG-20261112-000208/ack", {}, 200)
    assert acked["status"] == "ACKED"
    assert acked["acked_at"] is not None
    assert acked["processing_status"] == "PROCESSED"  # inbound processing state machine
    again = harness.post("/api/v1/messages/MSG-20261112-000208/ack", {}, 200)
    assert again["status"] == "ACKED"


def test_outbox_sweep_retry_then_dead_letter_then_requeue(tmp_path):
    """max_retries=1: deliver, ACK-timeout -> retry, ACK-timeout -> dead letter,
    then the human-owner-only requeue path (C1 §2.4)."""
    from fastapi.testclient import TestClient

    from app.platform.main import create_app
    from app.platform.messaging import sweep

    settings = make_settings(tmp_path, AIEO_MSG_MAX_RETRIES="1",
                             AIEO_MSG_RETRY_BASE_SECONDS="30",
                             AIEO_MSG_ACK_TIMEOUT="1")
    client = TestClient(create_app(settings))
    harness = PlatformHarness(client)
    env = harness.setup_project("PROJ-F5", "Project F5")
    task = harness.create_task(env["batch_id"], "Sweep target")
    harness.drive_to_ready(task["task_id"], "f5")
    claim = harness.claim(task["task_id"])
    message_id = claim["dispatch_message_id"]

    t0 = datetime(2026, 11, 12, 12, 0, 0, tzinfo=timezone.utc)

    def run_sweep(moment):
        with client.app.state.ctx.db.transaction() as conn:
            return sweep(conn, settings, now=moment, jitter=False)

    # first sweep delivers the pending outbox message
    counts = run_sweep(t0)
    assert counts["delivered"] == 1
    view = harness.get(f"/api/v1/messages/{message_id}")
    assert view["status"] == "SENT"
    assert view["delivered_at"] is not None

    # no ACK -> ACK timeout (MSG-0002) -> RETRYING with backoff
    counts = run_sweep(t0 + timedelta(seconds=2))
    assert counts["retrying"] == 1
    view = harness.get(f"/api/v1/messages/{message_id}")
    assert view["status"] == "RETRYING"
    assert view["retry_count"] == 1
    assert view["last_error_code"] == "MSG-0002"

    # backoff expires -> next delivery round
    counts = run_sweep(t0 + timedelta(seconds=40))
    assert counts["redispatched"] == 1
    assert counts["delivered"] == 1

    # second timeout exceeds max_retries=1 -> DEAD_LETTER
    counts = run_sweep(t0 + timedelta(seconds=42))
    assert counts["dead_lettered"] == 1
    view = harness.get(f"/api/v1/messages/{message_id}")
    assert view["status"] == "DEAD_LETTER"
    assert view["dead_lettered_at"] is not None

    # ACK on a dead-letter message is refused
    result = harness.raw("POST", f"/api/v1/messages/{message_id}/ack", {})
    assert result.status_code == 409

    # dead-letter queue lists the message
    dlq = harness.get("/api/v1/messages/dead-letter")
    assert dlq["total"] == 1
    assert dlq["items"][0]["message_id"] == message_id

    # agent (service) identity may not requeue; the human owner may
    token_response = harness.post("/api/v1/agents", {
        "agent_id": "M3-BRIDGE", "agent_type": "system", "role": "bridge",
        "issue_service_token": True,
    })
    agent_headers = {"Authorization": f"Bearer {token_response['service_token']}"}
    forbidden = harness.client.post(
        f"/api/v1/messages/{message_id}/requeue",
        json={"actor": "M3-BRIDGE", "reason": "should fail"},
        headers=agent_headers,
    )
    assert forbidden.status_code == 403
    assert forbidden.json()["code"] == "AUTH-0002"

    requeued = harness.post(f"/api/v1/messages/{message_id}/requeue", {
        "actor": "OWNER", "reason": "receiver recovered",
    }, 200)
    assert requeued["status"] == "PENDING"
    assert requeued["dead_lettered_at"] is None
    # retry history is kept in audit_logs
    audit = harness.get("/api/v1/audit?action=requeue_message")
    assert audit["total"] == 1
    assert audit["items"][0]["details"]["previous_status"] == "DEAD_LETTER"
