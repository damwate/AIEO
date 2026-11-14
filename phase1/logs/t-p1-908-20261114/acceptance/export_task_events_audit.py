# -*- coding: utf-8 -*-
"""A1 独立审计导出（验收第1轮 REJECT 补证，2026-11-14）。

只读导出，零业务副作用：
- M1 REST 只读拉取（复用调度器同款 urllib+cookiejar 形态；GET 无需 CSRF）
- M1 服务端结构化日志（platform-20261114.ndjson）中 run 域任务的全部行原文
输出：task-events-audit.json + task-events-audit-serverlog.ndjson（本目录）。
任务书 §11 A1：task_events 审计含 run 全部事件；证据源=M1 服务侧（独立于调度器自身记录）。
"""
import json
import os
import sys
import urllib.request
import urllib.error
from pathlib import Path

BASE = "http://127.0.0.1:8000"
OUT_DIR = Path(__file__).resolve().parent
M1_LOG = Path(r"D:\AIEO\runtime\t-p1-908\logs\platform-20261114.ndjson")
TASKS = ["T-P1-018", "T-P1-019", "T-P1-020"]  # 018=PASS run 主任务；019/020=A4 演示 run（908020/908021）


def main() -> int:
    import http.cookiejar
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

    def call(method: str, path: str, body: dict | None = None):
        data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
        r = urllib.request.Request(BASE + path, data=data, method=method,
                                   headers={"Accept": "application/json",
                                            "Content-Type": "application/json"})
        try:
            with opener.open(r, timeout=30) as resp:
                return resp.status, json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            try:
                return e.code, json.loads(e.read().decode("utf-8"))
            except Exception:
                return e.code, {}

    code, login = call("POST", "/api/v1/auth/login", {
        "username": os.environ["AIEO_PLATFORM_ADMIN_USERNAME"],
        "password": os.environ["AIEO_PLATFORM_ADMIN_PASSWORD"],
    })
    if code != 200:
        print("LOGIN-FAILED", code)
        return 1
    audit: dict = {"exported_at_utc": __import__("datetime").datetime.now(
        __import__("datetime").timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": "M1 REST read-only + M1 server ndjson audit log",
        "tasks": {}, "messages": {}, "artifacts": {}}

    for tid in TASKS:
        c, t = call("GET", f"/api/v1/tasks/{tid}")
        c2, deps = call("GET", f"/api/v1/tasks/{tid}/dependencies")
        audit["tasks"][tid] = {"task_detail": t, "dependencies": deps,
                               "http": [c, c2]}

    for direction in ("INBOUND", "OUTBOUND"):
        c, msgs = call("GET", f"/api/v1/messages?direction={direction}&page_size=200")
        audit["messages"][direction] = {"http": c, "response": msgs}

    for art in ("ART-OTH-011", "ART-DIFF-005"):
        c, a = call("GET", f"/api/v1/artifacts/{art}")
        audit["artifacts"][art] = {"http": c, "response": a}

    # 服务端审计日志：包含 run 域任务的全部行（含 task_event_submitted/claim/report 等事件）
    server_lines = []
    if M1_LOG.exists():
        for i, raw in enumerate(M1_LOG.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
            if any(t in raw for t in TASKS):
                server_lines.append({"line_no": i, "raw": raw})
    audit["server_log_line_count"] = len(server_lines)
    (OUT_DIR / "task-events-audit-serverlog.ndjson").write_text(
        "\n".join(l["raw"] for l in server_lines) + "\n", encoding="utf-8")
    (OUT_DIR / "task-events-audit.json").write_text(
        json.dumps(audit, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"AUDIT-OK tasks={list(audit['tasks'])} server_lines={len(server_lines)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
