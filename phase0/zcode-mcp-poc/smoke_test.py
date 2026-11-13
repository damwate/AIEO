# -*- coding: utf-8 -*-
"""POC-01 冒烟测试：以标准 MCP stdio 客户端方式直连 server.mjs，
完成 initialize -> tools/list -> 调用三个工具 -> shutdown，输出每步结果。"""
import json
import subprocess
import sys
from pathlib import Path

SERVER = r"D:\AIEO\phase0\zcode-mcp-poc\server.mjs"

def send(proc, obj):
    proc.stdin.write((json.dumps(obj) + "\n").encode())
    proc.stdin.flush()

def recv(proc):
    line = proc.stdout.readline()
    if not line:
        raise RuntimeError("服务器无响应（stdout 已关闭）")
    return json.loads(line)

def main():
    proc = subprocess.Popen(
        [sys.executable.replace("python.exe", "python.exe"), ],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE
    ) if False else subprocess.Popen(
        ["node", SERVER],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE
    )
    results = []
    try:
        # 1. initialize
        send(proc, {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {
            "protocolVersion": "2025-06-18",
            "capabilities": {},
            "clientInfo": {"name": "aieo-smoke-client", "version": "0.1.0"}
        }})
        resp = recv(proc)
        ok1 = resp.get("result", {}).get("serverInfo", {}).get("name") == "aieo-poc"
        results.append(("initialize", ok1, f"serverInfo={resp.get('result', {}).get('serverInfo')}"))

        # notifications/initialized
        send(proc, {"jsonrpc": "2.0", "method": "notifications/initialized"})

        # 2. tools/list
        send(proc, {"jsonrpc": "2.0", "id": 2, "method": "tools/list"})
        resp = recv(proc)
        tools = [t["name"] for t in resp.get("result", {}).get("tools", [])]
        ok2 = set(tools) == {"aieo_poc_ping", "aieo_poc_get_test_task", "aieo_poc_submit_result"}
        results.append(("tools/list", ok2, f"tools={tools}"))

        # 3. ping
        send(proc, {"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {
            "name": "aieo_poc_ping", "arguments": {}}})
        resp = recv(proc)
        text = resp["result"]["content"][0]["text"]
        ok3 = '"status": "ok"' in text
        results.append(("call aieo_poc_ping", ok3, text.replace("\n", " ")[:120]))

        # 4. get_test_task
        send(proc, {"jsonrpc": "2.0", "id": 4, "method": "tools/call", "params": {
            "name": "aieo_poc_get_test_task", "arguments": {}}})
        resp = recv(proc)
        text = resp["result"]["content"][0]["text"]
        ok4 = "T-POC-001" in text
        results.append(("call aieo_poc_get_test_task", ok4, text.replace("\n", " ")[:120]))

        # 5. submit_result（正确 task_id）
        send(proc, {"jsonrpc": "2.0", "id": 5, "method": "tools/call", "params": {
            "name": "aieo_poc_submit_result", "arguments": {
                "task_id": "T-POC-001", "result": "SUCCESS", "summary": "冒烟测试提交"}}})
        resp = recv(proc)
        text = resp["result"]["content"][0]["text"]
        ok5 = '"accepted": true' in text
        results.append(("call aieo_poc_submit_result", ok5, text.replace("\n", " ")[:120]))

        # 6. submit_result（错误 task_id，应 isError）
        send(proc, {"jsonrpc": "2.0", "id": 6, "method": "tools/call", "params": {
            "name": "aieo_poc_submit_result", "arguments": {
                "task_id": "T-WRONG", "result": "SUCCESS", "summary": "错误ID测试"}}})
        resp = recv(proc)
        ok6 = resp.get("result", {}).get("isError") is True
        results.append(("call submit(错误task_id) -> isError", ok6, str(resp.get("result", {}).get("isError"))))
    finally:
        try:
            proc.stdin.close()
        except Exception:
            pass
        proc.wait(timeout=5)
        err = proc.stderr.read().decode("utf-8", "replace").strip()

    print(f"服务器 stderr: {err[:300] if err else '(无)'}")
    all_pass = True
    for name, ok, detail in results:
        all_pass = all_pass and ok
        print(f"[{'PASS' if ok else 'FAIL'}] {name}: {detail}")
    print("SMOKE:", "ALL PASS" if all_pass else "HAS FAIL")
    return 0 if all_pass else 1

if __name__ == "__main__":
    sys.exit(main())
