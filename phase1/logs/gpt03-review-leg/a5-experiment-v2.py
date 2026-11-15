# -*- coding: utf-8 -*-
"""A5① 真实现场 v2（S2-R1 P1-02 整改）：发送双验成功、reply 未落盘即终止进程。

监测修正（v1 教训）：只认实验启动后创建、run.log 含本次 marker 的 dispatch 目录；
"发送双验通过"出现且 reply.txt 未落盘 → kill 进程树 → 断点 S1 现场成立。
对象=T-P1-023（EXEC-012，ART-DIFF-007）；发送复用会话（长会话，兼 P2-01 长会话场景）。
"""
import json
import os
import subprocess
import sys
import time
from pathlib import Path

REPO = Path("D:/AIEO")
RUN_KEY = "918010"
RUN_DIR = REPO / "runtime" / "review-leg" / f"rvl-{RUN_KEY}"
MARKER = "【GPT03-R1|918010|T-P1-023】"
START = time.time()

cmd = [sys.executable, "phase1/tools/review_leg.py", "run",
       "--run-key", RUN_KEY, "--task-id", "T-P1-023", "--project-id", "AIEO-ORCH-908019",
       "--reviewed-commit", "fda9183dafb77ca15578abb244b3b2d15999fafb",
       "--diff-artifact-id", "ART-DIFF-007",
       "--diff-file", "runtime/t-p1-908/diffs-m4/diff-fda9183dafb77ca15578abb244b3b2d15999fafb.patch",
       "--fixture-repo", "runtime/t-p1-908/wt-fixture",
       "--m1-url", "http://127.0.0.1:8000",
       "--marker-text", MARKER,
       "--brief-mode", "pointer",
       "--material-repo-path", "basic/tasks/b-20261115-gpt03-review-leg/acceptance/s2-a5-material-t-p1-018.md",
       "--material-base-commit", "73a4a02650c6c94cf2f0466f6fb19d38c41a1ff4"]

env = {**os.environ,
       "AIEO_PLATFORM_ADMIN_USERNAME": "OWNER",
       "AIEO_PLATFORM_ADMIN_PASSWORD": "T908-admin-pw-2026-1114x",
       "AIEO_GPT_CONTROLLER_GENERATION_TIMEOUT_MS": "600000"}

print("[a5v2] launching run (T-P1-023, reuse-session dispatch)...")
proc = subprocess.Popen(cmd, cwd=str(REPO), env=env,
                        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
print("[a5v2] pid =", proc.pid)

killed_dir = None
deadline = time.time() + 900
while time.time() < deadline:
    time.sleep(0.5)
    logs = sorted((REPO / "phase0" / "logs").glob("dispatch-*"), key=lambda p: p.stat().st_mtime)
    # 仅认实验启动后创建的目录
    fresh = [d for d in logs if d.stat().st_ctime >= START - 2]
    if not fresh:
        continue
    d = max(fresh, key=lambda p: p.stat().st_mtime)
    runlog = d / "run.log"
    if not runlog.is_file():
        continue
    try:
        text = runlog.read_text(encoding="utf-8", errors="replace")
    except OSError:
        continue
    if MARKER[:20] not in text:
        continue  # 非本轮目录
    if "发送双验通过" in text:
        reply_exists = (d / "reply.txt").exists()
        if not reply_exists:
            print(f"[a5v2] BREAKPOINT S1: send double-verified, reply NOT captured -> kill pid {proc.pid}")
            proc.kill()
            subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)],
                           capture_output=True, timeout=20)
            killed_dir = d
            break
        else:
            print("[a5v2] reply captured before kill window (will treat as A5② form); killing anyway")
            proc.kill()
            subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)],
                           capture_output=True, timeout=20)
            killed_dir = d
            break

if killed_dir is None:
    print("[a5v2] FAIL: window not reached")
    sys.exit(2)

snap = {"breakpoint_dir": str(killed_dir),
        "reply_captured": (killed_dir / "reply.txt").exists(),
        "result_json": (killed_dir / "result.json").exists(),
        "marker": MARKER}
RUN_DIR.mkdir(parents=True, exist_ok=True)
(RUN_DIR / "a5-breakpoint-snapshot.json").write_text(
    json.dumps(snap, ensure_ascii=False, indent=2), encoding="utf-8")
print("[a5v2] breakpoint snapshot:", snap)
