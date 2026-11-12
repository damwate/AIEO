"""Pytest fixtures for M1 platform tests: temp SQLite, in-process TestClient.

No network access is required; everything runs against a temporary SQLite file.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from fastapi.testclient import TestClient  # noqa: E402

from app.platform.config import Settings  # noqa: E402
from app.platform.main import create_app  # noqa: E402

SHA_A = "a" * 40
SHA_B = "b" * 40
SHA_C = "c" * 40
SHA_D = "d" * 40


def make_settings(tmp_path: Path, **overrides) -> Settings:
    values = {
        "AIEO_ENV": "test",
        "AIEO_SESSION_SECRET": "unit-test-session-secret-0123456789abcdef",
        "AIEO_PLATFORM_ADMIN_PASSWORD": "unit-test-password",
        "AIEO_DB_PATH": str(tmp_path / "aieo.db"),
        "AIEO_LOG_DIR": str(tmp_path / "logs"),
        "AIEO_ARTIFACT_DIR": str(tmp_path / "artifacts"),
        "AIEO_MSG_ACK_TIMEOUT": "300",
        "AIEO_MSG_MAX_RETRIES": "8",
        "AIEO_MSG_RETRY_BASE_SECONDS": "30",
    }
    values.update(overrides)
    return Settings.from_environ(overrides=values)


class PlatformHarness:
    """Convenience wrapper: a logged-in OWNER client plus helpers."""

    def __init__(self, client: TestClient) -> None:
        self.client = client
        self.csrf = client.post(
            "/api/v1/auth/login",
            json={"username": "OWNER", "password": "unit-test-password"},
        ).json()["csrf_token"]

    def post(self, url: str, json_body: dict, expect: int = 201) -> dict:
        response = self.client.post(url, json=json_body, headers=self._headers())
        assert response.status_code == expect, (url, response.status_code, response.text)
        return response.json()

    def get(self, url: str, expect: int = 200) -> dict:
        response = self.client.get(url)
        assert response.status_code == expect, (url, response.status_code, response.text)
        return response.json()

    def raw(self, method: str, url: str, json_body: dict | None = None, csrf: bool = True):
        headers = self._headers() if csrf else {}
        return self.client.request(method, url, json=json_body, headers=headers)

    def _headers(self) -> dict:
        return {"X-CSRF-Token": self.csrf}

    # ---- domain helpers ----
    def setup_project(self, project_id: str = "PROJ-A", name: str = "Project A") -> dict:
        self.post("/api/v1/agents", {"agent_id": "ZCODE-01", "agent_type": "developer", "role": "developer"})
        self.post("/api/v1/agents", {"agent_id": "GPT-03", "agent_type": "reviewer", "role": "code-reviewer"})
        self.post("/api/v1/projects", {"project_id": project_id, "name": name})
        self.post("/api/v1/repositories", {
            "project_id": project_id,
            "url": f"https://example.com/{project_id.lower()}.git",
            "local_path": f"D:/workspaces/{project_id.lower()}",
        })
        batch = self.post("/api/v1/batches", {
            "project_id": project_id,
            "requirement": "Implement the requirement",
            "engineering_standard_version": "v1.0",
            "knowledge_base_commit": SHA_A,
        })
        return {"project_id": project_id, "batch_id": batch["batch_id"]}

    def create_task(self, batch_id: str, title: str, expect: int = 201, **extra) -> dict:
        body = {
            "batch_id": batch_id,
            "title": title,
            "engineering_standard_version": "v1.0",
            "knowledge_base_commit": SHA_A,
        }
        body.update(extra)
        return self.post("/api/v1/tasks", body, expect)

    def event(self, task_id: str, event: str, event_id: str, expect: int = 200, **extra) -> dict:
        body = {"event": event, "event_id": event_id}
        body.update(extra)
        return self.post(f"/api/v1/tasks/{task_id}/events", body, expect)

    def drive_to_ready(self, task_id: str, prefix: str) -> None:
        self.event(task_id, "PLAN", f"{prefix}-plan")
        self.event(task_id, "ARCH_REVIEW", f"{prefix}-arch")
        self.event(task_id, "PASS", f"{prefix}-pass")

    def claim(self, task_id: str, agent_id: str = "ZCODE-01", expect: int = 200,
              base_commit: str = SHA_B) -> dict:
        return self.post(f"/api/v1/tasks/{task_id}/claim", {
            "agent_id": agent_id, "base_commit": base_commit,
        }, expect)


@pytest.fixture()
def settings(tmp_path) -> Settings:
    return make_settings(tmp_path)


@pytest.fixture()
def client(settings) -> TestClient:
    app = create_app(settings)
    return TestClient(app)


@pytest.fixture()
def harness(client) -> PlatformHarness:
    return PlatformHarness(client)
