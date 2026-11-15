# -*- coding: utf-8 -*-
"""A5① 实验 v5（S2-R2 NEW-P1-02 整改）：进程终止证明强化。

v4 教训：taskkill /T 后未验证进程死亡，gpt_dispatch 幸存继续完成派单
（dispatch-2026-11-15T17-12-16 log 17:15:10 COMPLETED）→断点证据链断裂。
v5 强化：kill 后轮询 tasklist 确认 review_leg 与 gpt_dispatch 均终止；
若派单进程幸存=实验判定 FAIL（不得作为 A5① 现场申报）。
"""
import json
import os
import subprocess
import sys
import time
from pathlib import Path

REPO = Path("D:/AIEO")
RUN_KEY = "918013"
RUN_DIR = REPO / "runtime" / "review-leg" / f"rvl-{RUN_KEY}"
MARKER = "【GPT03-R1|918013|T-P1-027】"
START = time.time()

cmd = [sys.executable, "phase1/tools/review_leg.py", "run",
       "--run-key", RUN_KEY, "--task-id", "T-P1-027", "--project-id", "AIEO-ORCH-908019",
       "--reviewed-commit", "fda9183dafb77ca15578abb244b3b2d15999fafb",
       "--diff-artifact-id", "ART-DIFF-010",
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

print("[v5] launching run (T-P1-027)...", flush=True)
proc = subprocess.Popen(cmd, cwd=str(REPO), env=env,
                        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
main_pid = proc.pid
print(f"[v5] pid={main_pid}", flush=True)


def tree_alive(pid: int) -> bool:
    """检查 PID 及其子进程是否仍存活（tasklist 全量 grep）。"""
    r = subprocess.run(["tasklist", "/FO", "CSV", "/NH"], capture_output=True, text=True, timeout=30)
    return str(pid) in r.stdout


def kill_tree(pid: int) -> dict:
    out = {}
    proc.kill()
    r = subprocess.run(["taskkill", "/F", "/T", "/PID", str(pid)],
                       capture_output=True, text=True, timeout=30)
    out["taskkill_rc"] = r.returncode
    out["taskkill_out"] = ((r.stdout or "") + (r.stderr or "")).strip()[:300]
    # 轮询确认死亡（最多 10s）
    for _ in range(10):
        if not tree_alive(pid):
            out["confirmed_dead"] = True
            break
        time.sleep(1)
    else:
        out["confirmed_dead"] = False
    return out


killed_dir = None
kill_evidence = {}
deadline = time.time() + 900
while time.time() < deadline:
    time.sleep(0.3)
    logs = sorted((REPO / "phase0" / "logs").glob("dispatch-*"), key=lambda p: p.stat().st_ctime)
    fresh = [d for d in logs if d.stat().st_ctime >= START - 2]
    if not fresh:
        continue
    d = max(fresh, key=lambda p: p.stat().st_ctime)
    runlog = d / "run.log"
    if not runlog.is_file():
        continue
    try:
        text = runlog.read_text(encoding="utf-8", errors="replace")
    except OSError:
        continue
    if "发送双验通过" in text and MARKER[:12] not in text:
        # gpt_dispatch log 不含正文——不因 marker 过滤漏判（v3 教训）
        pass
    if "发送双验通过" in text:
        reply_exists = (d / "reply.txt").exists()
        print(f"[v5] send double-verified (reply_captured={reply_exists}) -> kill tree NOW", flush=True)
        kill_evidence = kill_tree(main_pid)
        killed_dir = d
        break

if killed_dir is None:
    print("[v5] FAIL: window not reached", flush=True)
    sys.exit(2)

time.sleep(3)  # 给幸存进程任何残余写盘以暴露
final_reply = (killed_dir / "reply.txt").exists()
final_result = (killed_dir / "result.json").exists()
runlog = (killed_dir / "run.log").read_text(encoding="utf-8", errors="replace")
completed_after_kill = "派单完成" in runlog.split("发送双验通过", 1)[-1]

verdict = {
    "breakpoint_dir": str(killed_dir),
    "reply_captured_at_kill": final_reply,
    "result_json_at_kill": final_result,
    "kill_evidence": kill_evidence,
    "main_pid": main_pid,
    "process_tree_terminated": bool(kill_evidence.get("confirmed_dead")),
    "dispatch_completed_after_kill": completed_after_kill,
    "experiment_valid": bool(kill_evidence.get("confirmed_dead")) and not completed_after_kill and not final_result,
}
RUN_DIR.mkdir(parents=True, exist_ok=True)
(RUN_DIR / "a5-breakpoint-snapshot.json").write_text(
    json.dumps(verdict, ensure_ascii=False, indent=2), encoding="utf-8")
print("[v5] verdict:", json.dumps(verdict, ensure_ascii=False), flush=True)
if not verdict["experiment_valid"]:
    print("[v5] EXPERIMENT INVALID (process survived or dispatch completed) — not an A5① field", flush=True)
    sys.exit(3)
print("[v5] A5① FIELD VALID: sent, reply not captured, process tree terminated", flush=True)
