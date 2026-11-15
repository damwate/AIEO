# -*- coding: utf-8 -*-
"""推进 T-P1-024（DRAFT 空壳）至 DEV_REPORTED：event_id 加任务维度避免全局幂等冲突。"""
import hashlib
import sys

sys.path.insert(0, "phase1/tools")
from scheduler import M1Client

m1 = M1Client("http://127.0.0.1:8000")
m1.login("OWNER", "T908-admin-pw-2026-1114x")
TASK = "T-P1-024"
BASE = "67c177c4f9c96a13cf21f0d882ae6b59b302a721"
COMMIT = "fda9183dafb77ca15578abb244b3b2d15999fafb"

for ev, tail in (("PLAN", "01"), ("ARCH_REVIEW", "02"), ("PASS", "03")):
    code, resp = m1.post(f"/api/v1/tasks/{TASK}/events",
                         {"event": ev, "event_id": f"EVT-A5B-{TASK}-{tail}"})
    assert code in (200, 201), f"{ev}: {resp}"
code, resp = m1.post(f"/api/v1/tasks/{TASK}/claim", {
    "agent_id": "ZCODE-01", "base_commit": BASE, "correlation_id": "CORR-918011"})
assert code in (200, 201), f"claim: {resp}"
execution_id = resp.get("execution_id") or ((resp.get("task") or {}).get("latest_execution") or {}).get("execution_id")
code, resp = m1.post(f"/api/v1/tasks/{TASK}/events",
                     {"event": "START", "event_id": f"EVT-A5B-{TASK}-START"})
assert code in (200, 201), f"START: {resp}"
sha256 = hashlib.sha256(open("runtime/t-p1-908/diffs-m4/diff-fda9183dafb77ca15578abb244b3b2d15999fafb.patch", "rb").read()).hexdigest()
code, art = m1.post("/api/v1/artifacts", {
    "task_id": TASK, "type": "DIFF",
    "path": f"git-worker/diffs/{TASK}/diff-{COMMIT}.patch", "sha256": sha256})
assert code in (200, 201, 202), f"artifact: {art}"
artifact_id = art.get("artifact_id") or art.get("id")
code, resp = m1.post("/api/v1/commits", {
    "task_id": TASK, "execution_id": execution_id, "repository_id": "REPO-001",
    "branch": "feature/T-P1-908-fixture", "sha": COMMIT, "base_commit": BASE,
    "diff_artifact_id": artifact_id})
assert code in (200, 201, 202), f"commit: {resp}"
code, resp = m1.post(f"/api/v1/tasks/{TASK}/events",
                     {"event": "DEVELOPMENT_COMPLETED", "event_id": f"EVT-A5B-{TASK}-DEV"})
assert code in (200, 201), f"DEV: {resp}"
code, task = m1.get(f"/api/v1/tasks/{TASK}")
print("status:", task.get("status"))
print("ADVANCED_OK", TASK, execution_id, artifact_id)
