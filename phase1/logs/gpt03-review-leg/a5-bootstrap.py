# -*- coding: utf-8 -*-
"""A6 前置：bootstrap 新造 DEV_REPORTED 任务 T-P1-022（908 复用环境，OWNER 引导）。
复用 fixture commit fda9183（与 T-P1-018 同一已验收 diff，SHA 已核验）；
新 execution/新 diff artifact 关联，保证审查报告自然键 (EXEC-011, fda9183) 唯一。"""
import json
import sys

sys.path.insert(0, "phase1/tools")
from scheduler import M1Client

m1 = M1Client("http://127.0.0.1:8000")
m1.login("OWNER", "T908-admin-pw-2026-1114x")

code, resp = m1.post("/api/v1/tasks", {
    "batch_id": "BATCH-019",
    "title": "bundle_gate --version 版本输出（A5① 断点实验任务）",
    "description": "A5(1) drill: sent-but-not-captured breakpoint (charter §7 A5①)",
    "priority": "P1",
    "files_scope": ["phase1/tools/bundle_gate.mjs"],
    "acceptance_criteria": [
        "node phase1/tools/bundle_gate.mjs --version 输出版本行且退出码 0",
        "无参调用维持既有 exit 2 报错行为",
        "--help 行为不变",
        "仅修改 phase1/tools/bundle_gate.mjs 单文件",
    ],
    "engineering_standard_version": "1.0.0",
    "knowledge_base_commit": "67c177c4f9c96a13cf21f0d882ae6b59b302a721",
    "dependencies": [],
})
assert code in (200, 201), f"task create {code}: {resp}"
task_id = resp.get("task_id") or resp.get("id")
print("task created:", task_id)

for ev, tail in (("PLAN", "01"), ("ARCH_REVIEW", "02"), ("PASS", "03")):
    code, resp = m1.post(f"/api/v1/tasks/{task_id}/events",
                         {"event": ev, "event_id": f"EVT-A5-{tail}"})
    assert code in (200, 201), f"{ev}: {resp}"
code, resp = m1.post(f"/api/v1/tasks/{task_id}/claim", {
    "agent_id": "ZCODE-01", "base_commit": "67c177c4f9c96a13cf21f0d882ae6b59b302a721",
    "correlation_id": "CORR-918010"})
assert code in (200, 201), f"claim: {resp}"
execution_id = resp.get("execution_id") or ((resp.get("task") or {}).get("latest_execution") or {}).get("execution_id")
print("execution:", execution_id)
code, resp = m1.post(f"/api/v1/tasks/{task_id}/events",
                     {"event": "START", "event_id": "EVT-A5-START"})
assert code in (200, 201)

patch_path = "runtime/t-p1-908/diffs-m4/diff-fda9183dafb77ca15578abb244b3b2d15999fafb.patch"
import hashlib
sha256 = hashlib.sha256(open(patch_path, "rb").read()).hexdigest()
code, art = m1.post("/api/v1/artifacts", {
    "task_id": task_id, "type": "DIFF",
    "path": f"git-worker/diffs/{task_id}/diff-fda9183dafb77ca15578abb244b3b2d15999fafb.patch",
    "sha256": sha256})
assert code in (200, 201, 202), f"artifact: {art}"
artifact_id = art.get("artifact_id") or art.get("id")
print("diff artifact:", artifact_id)

code, resp = m1.post("/api/v1/commits", {
    "task_id": task_id, "execution_id": execution_id,
    "repository_id": "REPO-001", "branch": "feature/T-P1-908-fixture",
    "sha": "fda9183dafb77ca15578abb244b3b2d15999fafb",
    "base_commit": "67c177c4f9c96a13cf21f0d882ae6b59b302a721",
    "diff_artifact_id": artifact_id})
assert code in (200, 201, 202), f"commit: {resp}"

code, resp = m1.post(f"/api/v1/tasks/{task_id}/events",
                     {"event": "DEVELOPMENT_COMPLETED", "event_id": "EVT-A5-DEV"})
assert code in (200, 201), f"dev completed: {resp}"
code, task = m1.get(f"/api/v1/tasks/{task_id}")
print("final status:", task.get("status"), "| allowed:", task.get("allowed_events"))
print("BOOTSTRAP_A5_OK", task_id, execution_id, artifact_id)
