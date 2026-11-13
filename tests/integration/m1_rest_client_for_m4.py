"""M4 M1Client Protocol 的 HTTP（REST）实现 —— 集成验收夹具。

背景：app/git_worker/worker.py 只定义 ``M1Client`` Protocol（register_commit /
register_artifact / record_audit），契约注明实现归属 M1（REST 客户端）或测试
（内存假实现）。T-P1-902 集成验收需要 M4 对真实 M1 服务（uvicorn + FastAPI +
SQLite）落库，故在此提供 REST 实现——不改 M4 模块代码。

语义对齐（worker.py Protocol docstring + M1 api.py 实测行为）：
- register_commit  → POST /api/v1/commits（幂等键 UNIQUE(repository_id, sha)，重复 → duplicate=true）
- register_artifact → POST /api/v1/artifacts（path 全局唯一，同 sha 重复 → duplicate=true）
- record_audit     → M1 无 POST /audit 端点（audit 由 M1 服务端随操作写入，
  如 POST /commits 自带 audit 行）。本方法落本地 NDJSON 证据文件并返回本地 ID，
  如实标注 AUDIT_LOCAL_ONLY，不伪造服务端审计。
"""

from __future__ import annotations

import json
import threading
import time
from pathlib import Path
from typing import Any, Mapping

import httpx


class M1RestError(RuntimeError):
    """非 2xx 且未按幂等语义处理的 M1 响应。"""

    def __init__(self, status_code: int, code: str, message: str, details: Any = None) -> None:
        super().__init__(f"M1 HTTP {status_code} {code}: {message}")
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details


class HttpM1ClientForM4:
    """实现 M4 ``M1Client`` Protocol，经 HTTP 对接真实 M1 平台服务。"""

    def __init__(
        self,
        *,
        base_url: str,
        service_token: str,
        audit_log_path: str | Path,
        timeout_s: float = 30.0,
    ) -> None:
        self._client = httpx.Client(
            base_url=base_url,
            headers={
                "Authorization": f"Bearer {service_token}",
                "Content-Type": "application/json; charset=utf-8",
            },
            timeout=timeout_s,
        )
        self._audit_path = Path(audit_log_path)
        self._audit_path.parent.mkdir(parents=True, exist_ok=True)
        self._audit_lock = threading.Lock()
        self._audit_seq = 0

    # ---------- 内部 ----------

    def _post(self, path: str, body: Mapping[str, Any]) -> dict[str, Any]:
        response = self._client.post(path, content=json.dumps(body, ensure_ascii=False))
        try:
            payload = response.json()
        except ValueError:
            payload = {"_raw": response.text}
        if response.status_code >= 400:
            code = payload.get("code") if isinstance(payload, dict) else None
            if not isinstance(code, str):
                code = f"HTTP-{response.status_code}"
            raise M1RestError(
                response.status_code,
                code,
                str(payload.get("message", response.text[:200])) if isinstance(payload, dict) else response.text[:200],
                payload.get("details") if isinstance(payload, dict) else None,
            )
        return payload

    def _append_audit(self, record: Mapping[str, Any]) -> str:
        with self._audit_lock:
            self._audit_seq += 1
            audit_id = f"AUD-LOCAL-{self._audit_seq:06d}"
            line = json.dumps(
                {"audit_id": audit_id, "recorded_at": time.strftime("%Y-%m-%dT%H:%M:%S+00:00", time.gmtime()),
                 "scope": "AUDIT_LOCAL_ONLY_M1_HAS_NO_POST_AUDIT_ENDPOINT", **record},
                ensure_ascii=False,
            )
            with self._audit_path.open("a", encoding="utf-8") as handle:
                handle.write(line + "\n")
        return audit_id

    # ---------- M4 M1Client Protocol ----------

    def register_commit(self, *, task_id: str, execution_id: str, repository_id: str,
                        branch: str, sha: str, base_commit: str,
                        diff_artifact_id: str | None = None) -> str:
        body: dict[str, Any] = {
            "task_id": task_id,
            "execution_id": execution_id,
            "repository_id": repository_id,
            "branch": branch,
            "sha": sha,
            "base_commit": base_commit,
        }
        if diff_artifact_id is not None:
            body["diff_artifact_id"] = diff_artifact_id
        payload = self._post("/api/v1/commits", body)
        # M1 返回 git_commits 行（git_commit_id INTEGER）；duplicate=true 为幂等返回原行
        return str(payload.get("git_commit_id") or "")

    def register_artifact(self, *, task_id: str | None, artifact_type: str,
                          path: str, sha256: str) -> str:
        body: dict[str, Any] = {"type": artifact_type, "path": path, "sha256": sha256}
        if task_id is not None:
            body["task_id"] = task_id
        payload = self._post("/api/v1/artifacts", body)
        return str(payload.get("artifact_id") or payload.get("id") or "")

    def record_audit(self, *, actor_id: str, actor_type: str, action: str,
                     target_type: str, target_id: str, result: str,
                     reason: str | None = None, correlation_id: str | None = None,
                     details: Mapping[str, object] | None = None) -> str:
        record: dict[str, Any] = {
            "actor_id": actor_id,
            "actor_type": actor_type,
            "action": action,
            "target_type": target_type,
            "target_id": target_id,
            "result": result,
        }
        if reason is not None:
            record["reason"] = reason
        if correlation_id is not None:
            record["correlation_id"] = correlation_id
        if details is not None:
            record["details"] = dict(details)
        return self._append_audit(record)

    def close(self) -> None:
        self._client.close()
