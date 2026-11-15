#!/usr/bin/env python3
"""T-P1-017 第二次重开环（R2 复验 REWORK→R3 复验，DEC-063 处置①续）。

R2（rvl-918014）结论 REWORK=提交身份核验 404（fixture 分支未推送）；分支已推 origin。
合法链同前：REWORK→ARCH_REVIEW→PASS(READY)→claim(EXEC attempt3)→START→dev report→DEV_REPORTED。
DIFF artifact 复用 ART-DIFF-011（diff 内容零变更）；claim 非幂等——响应解析容错但断言收紧。
"""
import json
import os
import sys
import urllib.request
from pathlib import Path

REPO = Path("D:/AIEO")
M1 = os.environ.get("AIEO_SCHEDULER_M1_BASE_URL", "http://127.0.0.1:8000")
TASK = "T-P1-017"
CORR = "CORR-918015"
FIX_SHA = "0807064e193ef566987d1cfe29fea11d919ed85c"
BASE_SHA = "fda9183dafb77ca15578abb244b3b2d15999fafb"
DIFF_ART = "ART-DIFF-011"
REPO_ID = "REPO-001"
BRANCH = "feature/T-P1-908-fixture"

transcript = {"ops": [], "m1_url": M1}


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
        (REPO / "phase0/logs/t-p1-017-rework-reentry/transcript-r3.json").write_text(
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
                  {"event": "ARCH_REVIEW", "event_id": "EVT-918015R-ARCH_REVIEW-01",
                   "correlation_id": CORR}, cookies=owner_cookie, csrf=owner_csrf)
step("event_arch_review", code in (200, 201) and r.get("to_status") == "ARCH_REVIEW", r)

code, r, _ = call("POST", f"/api/v1/tasks/{TASK}/events",
                  {"event": "PASS", "event_id": "EVT-918015R-PASS-02",
                   "correlation_id": CORR}, cookies=owner_cookie, csrf=owner_csrf)
step("event_pass_to_ready", code in (200, 201) and r.get("to_status") == "READY", r)

zcode_token = json.load(open(REPO / "runtime/t-p1-908/service-tokens.json", encoding="utf-8"))["ZCODE-01"]
code, r, _ = call("POST", f"/api/v1/tasks/{TASK}/claim",
                  {"agent_id": "ZCODE-01", "base_commit": BASE_SHA, "correlation_id": CORR},
                  token=zcode_token)
exec_id = ""
if isinstance(r, dict):
    exec_id = (r.get("execution") or {}).get("execution_id") or r.get("execution_id") or ""
if not exec_id:
    code2, t, _ = call("GET", f"/api/v1/tasks/{TASK}", token=zcode_token)
    le = (t.get("latest_execution") or {})
    exec_id = le.get("execution_id") or ""
    r_verify = {"status": t.get("status"), "latest": le}
else:
    r_verify = {"claim_http": code}
step("zcode_claim", code in (200, 201) and exec_id.startswith("EXEC-"),
     dict(r_verify, exec_id=exec_id, attempt_hint=r.get("attempt") if isinstance(r, dict) else None))

code, r, _ = call("POST", f"/api/v1/tasks/{TASK}/events",
                  {"event": "START", "event_id": "EVT-918015R-START-03",
                   "correlation_id": CORR}, cookies=owner_cookie, csrf=owner_csrf)
step("event_start", code in (200, 201) and r.get("to_status") == "IN_PROGRESS", r)

code, r, _ = call("POST", "/api/v1/commits",
                  {"task_id": TASK, "execution_id": exec_id, "repository_id": REPO_ID,
                   "branch": BRANCH, "sha": FIX_SHA, "base_commit": BASE_SHA,
                   "diff_artifact_id": DIFF_ART}, token=zcode_token)
step("register_commit", code in (200, 201), {"http": code, "resp_keys": list(r) if code in (200, 201) else r})

code, r, _ = call("POST", "/api/v1/reports/development",
                  {"task_id": TASK, "execution_id": exec_id, "status": "COMPLETED",
                   "payload": {"rework_of": "EXEC-009",
                               "rework_reason": "R2 review P1: reviewed commit not resolvable on GitHub (fixture branch not pushed); branch pushed fda9183..0807064",
                               "disposal_decision": "DEC-063 (user-instructed, 2026-11-16)",
                               "fix_commit": FIX_SHA, "prior_rounds": ["918003", "918014"]}},
                  token=zcode_token)
step("dev_report_completed", code in (200, 201), {"http": code, "resp_keys": list(r) if code in (200, 201) else r})

code, r, _ = call("GET", f"/api/v1/tasks/{TASK}", token=zcode_token)
final_status = r.get("status")
latest_exec = (r.get("latest_execution") or {}).get("execution_id")
step("final_status_dev_reported", final_status == "DEV_REPORTED" and latest_exec == exec_id,
     {"status": final_status, "latest_execution": latest_exec})

(REPO / "phase0/logs/t-p1-017-rework-reentry/transcript-r3.json").write_text(
    json.dumps(transcript, ensure_ascii=False, indent=2), encoding="utf-8")
print("ALL_PASS status=DEV_REPORTED exec=" + exec_id)
