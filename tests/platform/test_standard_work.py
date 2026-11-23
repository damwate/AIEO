from copy import deepcopy

from fastapi.testclient import TestClient

from app.platform.database import Database
from app.platform.main import create_app
from app.platform.standard_review_worker import run_one, settle_review, take_review
from conftest import PlatformHarness, SHA_A, SHA_B, make_settings


def plan(steps):
    return {
        "plan_id": "feature", "version": "1", "project_id": "PROJ-A",
        "requirement": "implement feature", "engineering_standard_version": "v1.0",
        "knowledge_base_commit": SHA_A,
        "steps": [{"key": key, "title": key, "base_commit": SHA_B,
                   "acceptance_criteria": ["verified"], "dependencies": dependencies}
                  for key, dependencies in steps],
    }


def test_plan_approval_and_fifo_preemption(tmp_path):
    settings = make_settings(tmp_path, AIEO_STANDARD_LIMIT="3")
    db = Database(settings.db_path)
    with TestClient(create_app(settings)) as client:
        owner = PlatformHarness(client)
        owner.setup_project()
        body = plan([("a", []), ("b", []), ("c", []), ("urgent", []), ("integration", ["a", "b"])])
        published = owner.post("/api/v1/standard/plans", body, 200)
        assert owner.post("/api/v1/standard/plans", body, 200) == published
        changed = deepcopy(body)
        changed["steps"][0]["title"] = "changed"
        owner.post("/api/v1/standard/plans", changed, 409)
        a, b, c, urgent, integration = published["task_ids"]
        owner.claim(integration, expect=409)
        a_exec = owner.claim(a)["execution_id"]
        owner.claim(b)
        c_exec = owner.claim(c)["execution_id"]
        owner.claim(urgent, expect=409)
        review_a = {"execution_id": a_exec, "round_id": "r1", "purpose": "review", "message": "review A"}
        review_c = {"execution_id": c_exec, "round_id": "r1", "purpose": "review", "message": "review C"}
        first = owner.post(f"/api/v1/standard/tasks/{a}/reviews", review_a, 200)
        assert owner.post(f"/api/v1/standard/tasks/{a}/reviews", review_a, 200) == first
        second = owner.post(f"/api/v1/standard/tasks/{c}/reviews", review_c, 200)
        url = f"/api/v1/standard/tasks/{urgent}/urgent"
        assert owner.get(url)["victim"] == c
        owner.post(url, {"expected_victim": b}, 409)
        owner.post(url, {"expected_victim": c}, 200)
        pause = f"/api/v1/standard/tasks/{c}/pause"
        proof = {"execution_id": c_exec, "reference": "checkpoint/c"}
        owner.post(pause, proof, 409)
        owner.claim(urgent, expect=409)
        assert take_review(db)["seq"] == first["seq"]
        assert take_review(Database(settings.db_path)) is None
        settle_review(db, first["seq"], {"reply_sha256": "a" * 64})

        def lost_response(job, directory):
            assert job["seq"] == second["seq"]
            raise OSError("result lost")

        assert run_one(db, tmp_path, lost_response) is False
        assert take_review(Database(settings.db_path)) is None
        owner.post(pause, proof, 409)
        settle_review(db, second["seq"], {"reply_sha256": "b" * 64})
        owner.post(pause, proof, 200)
        assert owner.get("/api/v1/standard/work")["occupied"] == 3
        assert owner.get("/api/v1/standard/next")["task"]["phase"] == "RESERVED"
        owner.claim(urgent)

    with TestClient(create_app(settings)) as client:
        owner = PlatformHarness(client)
        snapshot = owner.get("/api/v1/standard/work")
        assert snapshot["occupied"] == 3
        assert next(row for row in snapshot["tasks"] if row["task_id"] == c)["phase"] == "PAUSED"
        assert owner.get("/api/v1/standard/next") == {"task": None}


def test_cycle_never_creates_a_partial_batch(harness):
    harness.setup_project()
    before = harness.get("/api/v1/standard/work")
    harness.post("/api/v1/standard/plans", plan([("a", ["b"]), ("b", ["a"])]), 400)
    assert harness.get("/api/v1/standard/work") == before


def test_accepted_commit_unlocks_downstream_with_bound_base(settings, harness):
    from conftest import SHA_C

    harness.setup_project()
    a, b = harness.post("/api/v1/standard/plans", plan([("a", []), ("b", ["a"])]), 200)["task_ids"]
    claim = harness.claim(a)
    execution_id = claim["execution_id"]
    harness.event(a, "START", "standard-a-start")
    harness.post("/api/v1/reports/development", {
        "task_id": a, "execution_id": execution_id, "status": "COMPLETED", "payload": {},
    })
    harness.post("/api/v1/commits", {
        "task_id": a, "execution_id": execution_id, "repository_id": "REPO-001",
        "branch": "feature/standard-a", "sha": SHA_C, "base_commit": SHA_B,
    })
    harness.event(a, "GIT_VALIDATE", "standard-a-git")
    harness.event(a, "PASS", "standard-a-git-pass")
    review = harness.post(f"/api/v1/standard/tasks/{a}/reviews", {
        "execution_id": execution_id, "round_id": "r1", "purpose": "review", "message": "check a"
    }, 200)
    db = Database(settings.db_path)
    assert take_review(db)["seq"] == review["seq"]
    settle_review(db, review["seq"], {"reply_sha256": "a" * 64})
    harness.post("/api/v1/reports/review", {
        "task_id": a, "execution_id": execution_id, "reviewed_commit": SHA_C, "reviewer": "GPT-03",
        "result": "PASS", "task_package_hash": claim["task"]["task_package_hash"],
        "base_commit": SHA_B, "engineering_standard_version": "v1.0",
        "knowledge_base_commit": SHA_A, "payload": {},
    })
    harness.post("/api/v1/reports/test", {
        "task_id": a, "execution_id": execution_id, "commit_sha": SHA_C,
        "execution_result": "EXECUTED_PASS", "result": "PASS", "payload": {},
    })
    harness.post(f"/api/v1/standard/tasks/{a}/recycle", {"execution_id": execution_id}, 200)
    expected = {"phase": "CLOSED"}
    assert harness.post(f"/api/v1/standard/tasks/{a}/recycle", {"execution_id": execution_id}, 200) == expected
    next_task = harness.get("/api/v1/standard/next")
    assert next_task["task"]["task_id"] == b
    assert next_task["task"]["base_commit"] == SHA_C
    harness.claim(b, expect=409)
    assert harness.claim(b, base_commit=SHA_C)["dependency_commits"] == {a: SHA_C}
