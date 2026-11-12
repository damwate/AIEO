"""Required coverage (1): create project and batch; registry uniqueness rules."""
from __future__ import annotations

from conftest import SHA_A


def test_create_project_and_batch(harness):
    env = harness.setup_project("PROJ-B1", "Project B1")

    project = harness.get("/api/v1/projects/PROJ-B1")
    assert project["status"] == "ACTIVE"
    assert project["name"] == "Project B1"

    batch = harness.get(f"/api/v1/batches/{env['batch_id']}")
    assert batch["batch_id"].startswith("BATCH-")
    assert batch["status"] == "PLANNING"
    assert batch["engineering_standard_version"] == "v1.0"
    assert batch["knowledge_base_commit"] == SHA_A

    listing = harness.get(f"/api/v1/batches?project_id={env['project_id']}")
    assert listing["total"] == 1
    assert listing["items"][0]["batch_id"] == env["batch_id"]


def test_duplicate_project_name_conflicts(harness):
    harness.setup_project("PROJ-C1", "Same Name")
    # duplicate name -> RES-0002
    harness.post("/api/v1/projects", {"project_id": "PROJ-C2", "name": "Same Name"}, 409)
    # duplicate project_id -> RES-0002
    harness.post("/api/v1/projects", {"project_id": "PROJ-C1", "name": "Another"}, 409)


def test_repository_uniqueness(harness):
    harness.setup_project("PROJ-D1", "Project D1")
    harness.post("/api/v1/repositories", {
        "project_id": "PROJ-D1",
        "url": "https://example.com/repo.git",
        "local_path": "D:/workspaces/repo",
    })
    # same (project_id, url) -> RES-0002
    harness.post("/api/v1/repositories", {
        "project_id": "PROJ-D1",
        "url": "https://example.com/repo.git",
        "local_path": "D:/workspaces/repo2",
    }, 409)
    # unknown project -> RES-0001
    harness.post("/api/v1/repositories", {
        "project_id": "GHOST",
        "url": "https://example.com/ghost.git",
        "local_path": "D:/workspaces/ghost",
    }, 404)


def test_invalid_project_slug_rejected(harness):
    harness.post("/api/v1/projects", {"project_id": "lower-case", "name": "bad"}, 422)


def test_agent_registration(harness):
    created = harness.post("/api/v1/agents", {
        "agent_id": "GPT-01", "agent_type": "system", "role": "planner",
        "capabilities": {"web": True},
    })
    assert created["agent"]["agent_id"] == "GPT-01"
    assert created["agent"]["enabled"] == 1
    # duplicate agent -> RES-0002
    harness.post("/api/v1/agents", {"agent_id": "GPT-01", "agent_type": "system", "role": "planner"}, 409)
