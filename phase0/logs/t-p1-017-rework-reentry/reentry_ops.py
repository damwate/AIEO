#!/usr/bin/env python3
"""T-P1-017 REWORK 处置重开环（DEC-063 处置①，2026-11-16）。

合法链（state_machine.py 出边）：REWORK --ARCH_REVIEW--> ARCH_REVIEW --PASS--> READY
--claim(DISPATCH)--> DISPATCHED --START--> IN_PROGRESS --dev report COMPLETED--> DEV_REPORTED。
凭据：OWNER（env.sh admin，状态事件）+ ZCODE-01 服务令牌（claim/登记，先例=EXEC-009 actor）。
每步响应全量落 transcript JSON（fail 即停，不重试不猜测）。
"""
import json
import os
import sys
import urllib.request
from pathlib import Path

REPO = Path("D:/AIEO")
M1 = os.environ.get("AIEO_SCHEDULER_M1_BASE_URL", "http://127.0.0.1:8000")
TASK = "T-P1-017"
CORR = "CORR-918014"
FIX_SHA = "0807064e193ef566987d1cfe29fea11d919ed85c"
BASE_SHA = "fda9183dafb77ca15578abb244b3b2d15999fafb"
DIFF_PATH = f"git-worker/diffs/T-P1-017/diff-{FIX_SHA}.patch"
DIFF_SHA = "b1df094067ae3367a022c51b254d985fc9da90fb7bf6749167207f3fbb281858"
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
        out = REPO / "phase0/logs/t-p1-017-rework-reentry/transcript.json"
        out.write_text(json.dumps(transcript, ensure_ascii=False, indent=2), encoding="utf-8")
        sys.exit(1)


# 1) OWNER login
code, r, hdr = call("POST", "/api/v1/auth/login", {
    "username": os.environ["AIEO_PLATFORM_ADMIN_USERNAME"],
    "password": os.environ["AIEO_PLATFORM_ADMIN_PASSWORD"]})
owner_sess = r.get("session_id") or ""
setcookie = ""
for k, v in hdr.items():
    if k.lower() == "set-cookie":
        setcookie = v
        break
owner_cookie = setcookie.split(";")[0] if setcookie else ""
owner_csrf = r.get("csrf_token") or ""
step("owner_login", code == 200 and bool(owner_cookie), {"http": code, "keys": list(r)})

# 2) ARCH_REVIEW: REWORK -> ARCH_REVIEW
code, r, _ = call("POST", f"/api/v1/tasks/{TASK}/events",
                  {"event": "ARCH_REVIEW", "event_id": "EVT-918014R-ARCH_REVIEW-01",
                   "correlation_id": CORR}, cookies=owner_cookie, csrf=owner_csrf)
step("event_arch_review", code in (200, 201) and r.get("to_status") == "ARCH_REVIEW", r)

# 3) PASS: ARCH_REVIEW -> READY
code, r, _ = call("POST", f"/api/v1/tasks/{TASK}/events",
                  {"event": "PASS", "event_id": "EVT-918014R-PASS-02",
                   "correlation_id": CORR}, cookies=owner_cookie, csrf=owner_csrf)
step("event_pass_to_ready", code in (200, 201) and r.get("to_status") == "READY", r)

# 4) ZCODE-01 claim: READY -> DISPATCHED + new execution (attempt 2)
zcode_token = json.load(open(REPO / "runtime/t-p1-908/service-tokens.json", encoding="utf-8"))["ZCODE-01"]
code, r, _ = call("POST", f"/api/v1/tasks/{TASK}/claim",
                  {"agent_id": "ZCODE-01", "base_commit": BASE_SHA, "correlation_id": CORR},
                  token=zcode_token)
exec_id = (r.get("execution") or {}).get("execution_id") or r.get("execution_id")
step("zcode_claim", code in (200, 201) and r.get("to_status") == "DISPATCHED" and exec_id,
     {"http": code, "to_status": r.get("to_status"), "execution_id": exec_id,
      "attempt": (r.get("execution") or {}).get("attempt")})

# 5) OWNER START: DISPATCHED -> IN_PROGRESS
code, r, _ = call("POST", f"/api/v1/tasks/{TASK}/events",
                  {"event": "START", "event_id": "EVT-918014R-START-03",
                   "correlation_id": CORR}, cookies=owner_cookie, csrf=owner_csrf)
step("event_start", code in (200, 201) and r.get("to_status") == "IN_PROGRESS", r)

# 6) ZCODE-01 register DIFF artifact
code, r, _ = call("POST", "/api/v1/artifacts",
                  {"task_id": TASK, "type": "DIFF", "path": DIFF_PATH, "sha256": DIFF_SHA},
                  token=zcode_token)
art_id = r.get("artifact_id") or r.get("id")
step("register_diff_artifact", code in (200, 201) and art_id, {"http": code, "artifact_id": art_id})

# 7) ZCODE-01 register commit
code, r, _ = call("POST", "/api/v1/commits",
                  {"task_id": TASK, "execution_id": exec_id, "repository_id": REPO_ID,
                   "branch": BRANCH, "sha": FIX_SHA, "base_commit": BASE_SHA,
                   "diff_artifact_id": art_id}, token=zcode_token)
step("register_commit", code in (200, 201), {"http": code, "resp": r if code not in (200, 201) else {"sha": FIX_SHA}})

# 8) ZCODE-01 dev report COMPLETED (auto-applies DEVELOPMENT_COMPLETED -> DEV_REPORTED)
code, r, _ = call("POST", "/api/v1/reports/development",
                  {"task_id": TASK, "execution_id": exec_id, "status": "COMPLETED",
                   "payload": {"rework_of": "EXEC-009", "rework_reason":
                               "R1 review P2: --version check placed before --help (rvl-918003)",
                               "disposal_decision": "DEC-063 (user-instructed, 2026-11-16)",
                               "fix_commit": FIX_SHA}}, token=zcode_token)
step("dev_report_completed", code in (200, 201), {"http": code, "resp": r if code != 201 else {"transition": r.get("transition")}})

# 9) verify final task status
code, r, _ = call("GET", f"/api/v1/tasks/{TASK}", token=zcode_token)
final_status = r.get("status") or (r.get("task") or {}).get("status")
latest_exec = (r.get("latest_execution") or {}).get("execution_id")
step("final_status_dev_reported", final_status == "DEV_REPORTED" and latest_exec == exec_id,
     {"status": final_status, "latest_execution": latest_exec})

out = REPO / "phase0/logs/t-p1-017-rework-reentry/transcript.json"
out.write_text(json.dumps(transcript, ensure_ascii=False, indent=2), encoding="utf-8")
print("ALL_PASS execution_id=" + str(exec_id))
