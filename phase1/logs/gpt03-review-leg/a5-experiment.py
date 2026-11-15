# -*- coding: utf-8 -*-
"""A5① 真实断点实验：发送双验通过、reply 未落盘时终止进程 → resume 补采恢复（禁重发）。

监测 gpt_dispatch 现场目录 run.log 中"发送双验通过"字样出现即 kill 整个进程树
（此时 reply.txt 尚未落盘=断点 S1 形态）；随后 resume 走补采路径恢复。
"""
import os
import subprocess
import sys
import time
from pathlib import Path

REPO = Path("D:/AIEO")
RUN_KEY = "918005"
RUN_DIR = REPO / "runtime" / "review-leg" / f"rvl-{RUN_KEY}"

cmd = [sys.executable, "phase1/tools/review_leg.py", "run",
       "--run-key", RUN_KEY, "--task-id", "T-P1-018", "--project-id", "AIEO-ORCH-908019",
       "--reviewed-commit", "fda9183dafb77ca15578abb244b3b2d15999fafb",
       "--diff-artifact-id", "ART-DIFF-005",
       "--diff-file", "runtime/t-p1-908/diffs-m4/diff-fda9183dafb77ca15578abb244b3b2d15999fafb.patch",
       "--fixture-repo", "runtime/t-p1-908/wt-fixture",
       "--m1-url", "http://127.0.0.1:8000",
       "--marker-text", "【GPT03-R1|918005|T-P1-018】",
       "--brief-mode", "pointer",
       "--material-repo-path", "basic/tasks/b-20261115-gpt03-review-leg/acceptance/s2-a5-material-t-p1-018.md",
       "--material-base-commit", "c199cf45a7d45a9c90e12652d0e9d4a0efd797f7"]

env = {**os.environ,
       "AIEO_PLATFORM_ADMIN_USERNAME": "OWNER",
       "AIEO_PLATFORM_ADMIN_PASSWORD": "T908-admin-pw-2026-1114x",
       "AIEO_GPT_CONTROLLER_GENERATION_TIMEOUT_MS": "600000"}

print("[a5] launching review_leg run (T-P1-018)...")
proc = subprocess.Popen(cmd, cwd=str(REPO), env=env,
                        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
print("[a5] pid =", proc.pid)

# 监测：最新 dispatch 目录 run.log 出现"发送双验通过"且 reply.txt 未落盘 → kill
killed_at = None
deadline = time.time() + 600
while time.time() < deadline:
    time.sleep(1.0)
    logs = sorted((REPO / "phase0" / "logs").glob("dispatch-*"), key=lambda p: p.stat().st_mtime)
    fresh = [d for d in logs if d.stat().st_mtime >= time.time() - 600]
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
    if "发送双验通过" in text and not (d / "reply.txt").exists():
        killed_at = d
        print(f"[a5] breakpoint reached: send double-verified, reply NOT captured -> killing pid {proc.pid}")
        proc.kill()  # 终止 review_leg（gpt_dispatch 为其子进程，一并终止）
        try:
            subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)],
                           capture_output=True, timeout=20)
        except Exception as exc:
            print("[a5] taskkill note:", exc)
        break
    if (d / "reply.txt").exists() and "发送双验通过" in text:
        # reply 已落盘——超出 A5① 窗口（本轮改测 A5② 形态），kill 并如实登记
        print("[a5] reply already captured before kill -> A5② breakpoint (captured, not registered)")
        proc.kill()
        try:
            subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)],
                           capture_output=True, timeout=20)
        except Exception as exc:
            print("[a5] taskkill note:", exc)
        killed_at = d
        break

if killed_at is None:
    print("[a5] FAIL: breakpoint window not reached within 600s")
    sys.exit(2)

print("[a5] breakpoint dir:", killed_at)
print("[a5] reply.txt exists at breakpoint:", (killed_at / "reply.txt").exists())
print("[a5] result.json exists at breakpoint:", (killed_at / "result.json").exists())
# 断点现场快照
snap = {"breakpoint_dir": str(killed_at),
        "reply_captured": (killed_at / "reply.txt").exists(),
        "result_json": (killed_at / "result.json").exists()}
(RUN_DIR / "a5-breakpoint-snapshot.json").write_text(
    json.dumps(snap, ensure_ascii=False, indent=2), encoding="utf-8")
print("[a5] breakpoint snapshot saved")
