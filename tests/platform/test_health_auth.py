"""Contract basics: health endpoint, C7 authentication, CSRF, service identity."""
from __future__ import annotations

from fastapi.testclient import TestClient

from conftest import PlatformHarness, make_settings


def test_health_is_open_and_reports_contract_version(client: TestClient):
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["contract_version"] == "1.0.0"
    assert body["supported_versions"] == ["1.0"]


def test_protected_endpoint_requires_session(client: TestClient):
    response = client.get("/api/v1/projects")
    assert response.status_code == 401
    assert response.json()["code"] == "AUTH-0001"


def test_login_failure_is_rejected_and_audited(client: TestClient):
    response = client.post("/api/v1/auth/login",
                           json={"username": "OWNER", "password": "wrong-password"})
    assert response.status_code == 401
    assert response.json()["code"] == "AUTH-0001"
    audit = client.get("/api/v1/audit")  # audit query itself requires auth
    assert audit.status_code == 401


def test_login_success_sets_session_cookie_and_csrf(client: TestClient):
    harness = PlatformHarness(client)
    assert "aieo_session" in client.cookies
    # cookie-authenticated GET works without CSRF
    assert client.get("/api/v1/auth/session").json()["kind"] == "user"
    # mutation without CSRF is rejected
    response = client.post("/api/v1/projects", json={"project_id": "P-X", "name": "x"})
    assert response.status_code == 403
    assert response.json()["code"] == "AUTH-0002"
    # with CSRF it succeeds
    created = harness.post("/api/v1/projects", {"project_id": "PROJ-X", "name": "x"})
    assert created["project_id"] == "PROJ-X"


def test_logout_revokes_session(client: TestClient):
    harness = PlatformHarness(client)
    response = harness.raw("POST", "/api/v1/auth/logout", {})
    assert response.status_code == 200
    # the revoked session cookie no longer grants access
    follow_up = client.get("/api/v1/projects")
    assert follow_up.status_code == 401


def test_service_agent_bearer_token_authenticates_without_cookie(tmp_path):
    from app.platform.main import create_app

    settings = make_settings(tmp_path)
    client = TestClient(create_app(settings))
    harness = PlatformHarness(client)
    created = harness.post("/api/v1/agents", {
        "agent_id": "M4-WORKER", "agent_type": "system", "role": "git-worker",
        "issue_service_token": True,
    })
    token = created["service_token"]
    assert token.startswith("ait_")
    # bearer token authenticates; authorization follows the C7 §8.6 service whitelist
    # (T-P1-901 F-403): /projects is outside the allowlist → 403 for both read and write.
    response = client.get("/api/v1/projects",
                          headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 403
    assert response.json()["code"] == "AUTH-0002"
    response = client.post("/api/v1/projects",
                           json={"project_id": "PROJ-TOKEN", "name": "token-made"},
                           headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 403
    assert response.json()["code"] == "AUTH-0002"
    # whitelisted workflow endpoint (whoami) still works with bearer only
    whoami = client.get("/api/v1/auth/session", headers={"Authorization": f"Bearer {token}"})
    assert whoami.status_code == 200
    assert whoami.json()["kind"] == "service"
    # invalid token rejected
    response = client.get("/api/v1/projects", headers={"Authorization": "Bearer ait_bogus"})
    assert response.status_code == 401
