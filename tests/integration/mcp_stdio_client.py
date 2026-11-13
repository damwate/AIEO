"""MCP stdio 行分隔 JSON-RPC 客户端（集成验收夹具，语义对照 app/zcode_bridge/test/helpers.mjs）。

仅服务 T-P1-902 集成验收 E2E：与真实 M3 MCP server 子进程
（app/zcode_bridge/bin/aieo-zcode-mjs，经 StdioServerTransport）通信。
不是生产代码；协议形态与 M3 测试夹具 StdioMcpClient 一致：
每次请求一行 JSON，响应按 id 匹配，容忍乱序通知。
"""

from __future__ import annotations

import json
import subprocess
import threading
import time
from typing import Any


class McpStdioError(RuntimeError):
    pass


class McpStdioClient:
    """与 MCP stdio server 子进程的行分隔 JSON-RPC 客户端。"""

    def __init__(self, argv: list[str], env: dict[str, str] | None = None,
                 cwd: str | None = None, timeout_s: float = 30.0) -> None:
        self._proc = subprocess.Popen(
            argv,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=env,
            cwd=cwd,
            text=True,
            encoding="utf-8",
            bufsize=1,
        )
        self._timeout_s = timeout_s
        self._id = 0
        self._responses: dict[int, dict[str, Any]] = {}
        self._lock = threading.Lock()
        self._stderr_parts: list[str] = []
        self._closed = False
        self._reader = threading.Thread(target=self._pump, daemon=True)
        self._reader.start()

    # ---------- 后台读取线程 ----------

    def _pump(self) -> None:
        assert self._proc.stdout is not None
        for line in self._proc.stdout:
            line = line.strip()
            if not line:
                continue
            try:
                message = json.loads(line)
            except json.JSONDecodeError:
                self._stderr_parts.append(f"[non-json-stdout] {line}\n")
                continue
            if isinstance(message, dict) and isinstance(message.get("id"), int):
                with self._lock:
                    self._responses[message["id"]] = message

    def _drain_stderr(self) -> str:
        assert self._proc.stderr is not None
        while True:
            chunk = self._proc.stderr.read(4096) if not self._closed else ""
            if not chunk:
                break
            self._stderr_parts.append(chunk)
        return "".join(self._stderr_parts)

    # ---------- 协议 ----------

    def request(self, method: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        self._id += 1
        message_id = self._id
        payload = {"jsonrpc": "2.0", "id": message_id, "method": method}
        if params is not None:
            payload["params"] = params
        self._send(payload)
        return self._wait(message_id)

    def notify(self, method: str, params: dict[str, Any] | None = None) -> None:
        payload: dict[str, Any] = {"jsonrpc": "2.0", "method": method}
        if params is not None:
            payload["params"] = params
        self._send(payload)

    def _send(self, payload: dict[str, Any]) -> None:
        assert self._proc.stdin is not None
        try:
            self._proc.stdin.write(json.dumps(payload, ensure_ascii=False) + "\n")
            self._proc.stdin.flush()
        except (BrokenPipeError, ValueError) as exc:
            raise McpStdioError(f"MCP 子进程 stdin 已关闭: {exc}; stderr={self._stderr_text()}") from exc

    def _wait(self, message_id: int) -> dict[str, Any]:
        deadline = time.monotonic() + self._timeout_s
        while time.monotonic() < deadline:
            with self._lock:
                response = self._responses.pop(message_id, None)
            if response is not None:
                return response
            if self._proc.poll() is not None:
                raise McpStdioError(
                    f"MCP 子进程已退出（exit={self._proc.returncode}），等待 id={message_id} 超时; "
                    f"stderr={self._stderr_text()}"
                )
            time.sleep(0.02)
        raise McpStdioError(f"等待 JSON-RPC id={message_id} 超时（{self._timeout_s}s）; stderr={self._stderr_text()}")

    # ---------- MCP 语义 ----------

    def initialize(self) -> dict[str, Any]:
        resp = self.request("initialize", {
            "protocolVersion": "2025-06-18",
            "capabilities": {},
            "clientInfo": {"name": "aieo-integration-e2e", "version": "0.1.0"},
        })
        self.notify("notifications/initialized")
        return resp["result"]

    def tools_list(self) -> list[str]:
        resp = self.request("tools/list")
        return sorted(t["name"] for t in resp["result"]["tools"])

    def call_tool(self, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        """调用工具；返回 {"isError": bool, "payload": dict, "raw": result}。

        payload 为 content[0].text 的 JSON 解析结果（M3 服务端工具统一返回 JSON 文本）。
        """
        resp = self.request("tools/call", {"name": name, "arguments": arguments})
        result = resp.get("result") or {}
        content = result.get("content") or []
        text = content[0].get("text") if content else ""
        try:
            payload = json.loads(text)
        except (json.JSONDecodeError, TypeError):
            payload = {"_raw_text": text}
        return {"isError": bool(result.get("isError")), "payload": payload, "raw": result}

    # ---------- 生命周期 ----------

    def _stderr_text(self) -> str:
        return "".join(self._stderr_parts)[-2000:]

    def close(self, timeout_s: float = 10.0) -> None:
        self._closed = True
        if self._proc.stdin and not self._proc.stdin.closed:
            try:
                self._proc.stdin.close()
            except (BrokenPipeError, OSError):
                pass
        try:
            self._proc.wait(timeout=timeout_s)
        except subprocess.TimeoutExpired:
            self._proc.terminate()
            try:
                self._proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self._proc.kill()
        # 读取剩余 stderr（非阻塞式尽力而为）
        try:
            self._drain_stderr()
        except (OSError, ValueError):
            pass

    def stderr_text(self) -> str:
        return self._stderr_text()
