#!/usr/bin/env python3
"""T-P1-017 重开环续跑（前脚本 claim 响应形状断言过严，claim 本身已成功：
EXEC-016 attempt 2 建立并 DISPATCHED——claim 非幂等禁止重跑，本脚本从 START 续）。"""
import json
import os
import sys
import urllib.request
from pathlib import Path

REPO = Path("D:/AIEO")
M1 = os.environ.get("AIEO_SCHEDULER_M1_BASE_URL", "http://127.0.0.1:8000")
TASK = "T-P1-017"
CORR = "CORR-918014"
EXEC_ID = "EXEC-016"
FIX_SHA = "0807064e193ef566987d1cfe29fea11d919ed85c"
BASE_SHA = "fda9183dafb77ca15578abb244b3b2d15999fafb"
DIFF_PATH = f"git-worker/diffs/T-P1-017/diff-{FIX_SHA}.patch"
DIFF_SHA = "b1df094067ae3367a022c51b254d985fc9da90fb7bf6749167207f3fbb281858"
REPO_ID = "REPO-001"
BRANCH = "feature/T-P1-908-fixture"

transcript = {"ops": [], "note": "continuation after claim succeeded (EXEC-016)", "m1_url": M1}


def call(method, path, body=None, token=None, cookies=None, csrf=None):
    req = urllib.request.Request(M1 + path, method=method)
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    if cookies:
        req.add_header("Cookie", cookies)
    if csrf:
        req.add_header("X-CSRF-Token", csrf)
    try:
        with urllib.request.urlopen(req, data=data, timeout=30) as r:
            return r.status, json.loads(r.read().decode()), dict(r.headers)
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode()), dict(e.headers)


def step(name, ok, detail):
    transcript["ops"].append({"step": name, "ok": ok, "detail": detail})
    print(("PASS " if ok else "FAIL ") + name + " :: " + json.dumps(detail, ensure_ascii=False)[:400])
    if not ok:
        (REPO / "phase0/logs/t-p1-017-rework-reentry/transcript-continue.json").write_text(
            json.dumps(transcript, ensure_ascii=False, indent=2), encoding="utf-8")
        sys.exit(1)


code, r, hdr = call("POST", "/api/v1/auth/login", {
    "username": os.environ["AIEO_PLATFORM_ADMIN_USERNAME"],
    "password": os.environ["AIEO_PLATFORM_ADMIN_PASSWORD"]})
owner_cookie, owner_csrf = "", ""
for k, v in hdr.items():
    if k.lower() == "set-cookie":
        owner_cookie = v.split(";")[0]
owner_csrf = r.get("csrf_token") or ""
step("owner_login", code == 200 and bool(owner_cookie), {"http": code})

code, r, _ = call("POST", f"/api/v1/tasks/{TASK}/events",
                  {"event": "START", "event_id": "EVT-918014R-START-03",
                   "correlation_id": CORR}, cookies=owner_cookie, csrf=owner_csrf)
step("event_start", code in (200, 201) and r.get("to_status") == "IN_PROGRESS", r)

zcode_token = json.load(open(REPO / "runtime/t-p1-908/service-tokens.json", encoding="utf-8"))["ZCODE-01"]

code, r, _ = call("POST", "/api/v1/artifacts",
                  {"task_id": TASK, "type": "DIFF", "path": DIFF_PATH, "sha256": DIFF_SHA},
                  token=zcode_token)
art_id = r.get("artifact_id") or r.get("id")
step("register_diff_artifact", code in (200, 201) and art_id, {"http": code, "artifact_id": art_id})

code, r, _ = call("POST", "/api/v1/commits",
                  {"task_id": TASK, "execution_id": EXEC_ID, "repository_id": REPO_ID,
                   "branch": BRANCH, "sha": FIX_SHA, "base_commit": BASE_SHA,
                   "diff_artifact_id": art_id}, token=zcode_token)
step("register_commit", code in (200, 201), {"http": code, "resp_keys": list(r) if code in (200, 201) else r})

code, r, _ = call("POST", "/api/v1/reports/development",
                  {"task_id": TASK, "execution_id": EXEC_ID, "status": "COMPLETED",
                   "payload": {"rework_of": "EXEC-009",
                               "rework_reason": "R1 review P2: --version check placed before --help (rvl-918003)",
                               "disposal_decision": "DEC-063 (user-instructed, 2026-11-16)",
                               "fix_commit": FIX_SHA}}, token=zcode_token)
step("dev_report_completed", code in (200, 201), {"http": code, "resp_keys": list(r) if code in (200, 201) else r})

code, r, _ = call("GET", f"/api/v1/tasks/{TASK}", token=zcode_token)
final_status = r.get("status")
latest_exec = (r.get("latest_execution") or {}).get("execution_id")
step("final_status_dev_reported", final_status == "DEV_REPORTED" and latest_exec == EXEC_ID,
     {"status": final_status, "latest_execution": latest_exec})

(REPO / "phase0/logs/t-p1-017-rework-reentry/transcript-continue.json").write_text(
    json.dumps(transcript, ensure_ascii=False, indent=2), encoding="utf-8")
print("ALL_PASS status=DEV_REPORTED exec=" + EXEC_ID)
