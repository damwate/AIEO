# -*- coding: utf-8 -*-
"""A3 message-replay 探针（验收第5轮 REJECT 补证，2026-11-14）。

背景：ORCH-908019 S4 重放证据 s4-replay-a3.json 的 error_code=null——
scheduler.py:748 读取 msg2["error"]["code"]，而 M1 错误体为平级结构
{"code": "RES-0003", ...}（app/platform/errors.py:36-51 error_body），
且 scheduler.py:757 的 "409 RES-0003" 为静态模板行，均非捕获事实。
本探针用 ORCH-908019 原始 envelope（ajv-input-envelope.json）对运行中的
M1 重发同 message_id 请求，完整捕获响应体——幂等重放不新增行（只读副作用）。
"""
import json
import os
import sys
import urllib.error
import urllib.request
import http.cookiejar
import datetime
import hashlib
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent          # .../t-p1-908-20261114
ENVELOPE = BASE / "executions" / "ORCH-908019" / "ajv-input-envelope.json"
OUT = BASE / "acceptance" / "a3-message-replay-probe.json"
M1 = os.environ.get("AIEO_M1_BASE_URL", "http://127.0.0.1:8000").rstrip("/")
USERNAME = os.environ.get("AIEO_PLATFORM_ADMIN_USERNAME", "admin")
PASSWORD = os.environ["AIEO_PLATFORM_ADMIN_PASSWORD"]

jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
csrf = None


def req(method, path, body=None):
    global csrf
    headers = {"Accept": "application/json"}
    data = None
    if body is not None:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json"
    if csrf and method in ("POST", "PUT", "PATCH", "DELETE"):
        headers["X-CSRF-Token"] = csrf
    r = urllib.request.Request(M1 + path, data=data, headers=headers, method=method)
    try:
        with opener.open(r, timeout=30) as resp:
            return resp.getcode(), json.loads(resp.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as exc:
        return exc.code, json.loads(exc.read().decode("utf-8") or "{}")


def main():
    global csrf
    env = json.loads(ENVELOPE.read_text(encoding="utf-8"))
    code, resp = req("POST", "/api/v1/auth/login",
                     {"username": USERNAME, "password": PASSWORD})
    assert code == 200, f"login HTTP {code}"
    csrf = resp.get("csrf_token")

    code, body = req("POST", "/api/v1/messages", env)
    record = {
        "probe": "A3 message-replay（验收第5轮 REJECT 补证）",
        "at_utc": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "m1_base": M1,
        "envelope_file": "executions/ORCH-908019/ajv-input-envelope.json",
        "envelope_sha256": hashlib.sha256(ENVELOPE.read_bytes()).hexdigest(),
        "message_id": env.get("message_id"),
        "correlation_id": env.get("correlation_id"),
        "replay_http": code,
        "replay_body": body,
        "body_code": body.get("code") if isinstance(body, dict) else None,
        "note": "同 message_id 幂等重放：M1 按主键去重 409 RES-0003 返回原处理结果，"
                "不重复执行副作用不新增行（messaging.py:3-5,146；errors.py:160）。"
                "响应体为平级错误结构（errors.py error_body），scheduler.py:748 "
                "误读嵌套 error.code 致 s4-replay-a3.json error_code=null。",
    }
    OUT.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n",
                   encoding="utf-8", newline="\n")
    print(f"replay_http={code} body_code={record['body_code']} message_id={record['message_id']}")
    return 0 if (code == 409 and record["body_code"] == "RES-0003") else 1


if __name__ == "__main__":
    sys.exit(main())
