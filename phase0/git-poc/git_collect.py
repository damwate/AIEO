# -*- coding: utf-8 -*-
"""
AIEO Phase 0 - POC-04 Git 自动采集 Demo
========================================
在专用一次性测试仓库（runtime/git-poc-test-repo）上验证 Git Worker 的核心能力链：

  1. 检查工作区状态
  2. 记录基线 Commit
  3. 创建 feature/AIEO-POC-001 分支
  4. 修改一个无业务风险的测试文件
  5. 执行一个简单测试
  6. 提交 Git
  7. 读取 Commit SHA
  8. 读取 Git Diff
  9. 检查工作区是否干净

输出：
  - 结构化证据 JSON -> phase0/logs/git-poc-result.json
  - 执行日志       -> phase0/logs/git-poc-run.log

约束：只在脚本自建的测试仓库上操作，不碰任何真实生产分支。
"""
import json
import os
import stat
import subprocess
import sys
import time
from pathlib import Path
from datetime import datetime, timezone, timedelta


def _force_remove(func, path, exc_info=()):
    """Windows 下 git 对象带只读属性时，去除只读后重试删除。"""
    try:
        os.chmod(path, stat.S_IWRITE)
        func(path)
    except Exception:
        if exc_info:
            raise

# ---- 路径 ----
AIEO_ROOT = Path(r"D:\AIEO")
TEST_REPO = AIEO_ROOT / "runtime" / "git-poc-test-repo"
LOG_DIR = AIEO_ROOT / "phase0" / "logs"
RESULT_JSON = LOG_DIR / "git-poc-result.json"
RUN_LOG = LOG_DIR / "git-poc-run.log"
TZ = timezone(timedelta(hours=8))  # UTC+8

log_lines = []


def log(msg: str) -> None:
    line = f"[{datetime.now(TZ).strftime('%H:%M:%S')}] {msg}"
    log_lines.append(line)
    print(line)


def run_git(args, cwd=TEST_REPO, check=True):
    """执行 git 命令，返回 (returncode, stdout, stderr)。"""
    cmd = ["git"] + args
    p = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if check and p.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)} 失败: {p.stderr.strip()}")
    return p.returncode, p.stdout.strip(), p.stderr.strip()


def main() -> int:
    steps = []          # 每步 {step, name, pass, detail}
    evidence = {}       # 关键证据

    def step(no, name, ok, detail):
        steps.append({"step": no, "name": name, "pass": bool(ok), "detail": detail})
        log(f"步骤{no} [{name}] {'PASS' if ok else 'FAIL'} - {detail}")

    t0 = time.time()
    log("=== POC-04 Git 自动采集开始 ===")

    # 0. 准备一次性测试仓库
    import shutil
    if TEST_REPO.exists():
        shutil.rmtree(TEST_REPO, onexc=_force_remove)
    TEST_REPO.mkdir(parents=True)
    run_git(["init", "-b", "main"])
    run_git(["config", "user.name", "AIEO-POC"])
    run_git(["config", "user.email", "aieo-poc@example.local"])
    (TEST_REPO / "README.md").write_text("# AIEO POC-04 测试仓库\n", encoding="utf-8")
    run_git(["add", "."])
    run_git(["commit", "-m", "init: POC-04 一次性测试仓库"])
    log(f"一次性测试仓库已建立: {TEST_REPO}")

    # 1. 检查工作区状态
    rc, out, _ = run_git(["status", "--porcelain"])
    step(1, "检查工作区状态", rc == 0 and out == "", f"git status --porcelain 输出为空（干净），rc={rc}")

    # 2. 记录基线 Commit
    rc, base_sha, _ = run_git(["rev-parse", "HEAD"])
    rc2, base_branch, _ = run_git(["rev-parse", "--abbrev-ref", "HEAD"])
    evidence["base_commit"] = base_sha
    evidence["base_branch"] = base_branch
    step(2, "记录基线 Commit", rc == 0 and len(base_sha) == 40, f"基线={base_sha} 分支={base_branch}")

    # 3. 创建任务分支
    rc, out, err = run_git(["checkout", "-b", "feature/AIEO-POC-001"])
    rc3, cur_branch, _ = run_git(["rev-parse", "--abbrev-ref", "HEAD"])
    evidence["task_branch"] = cur_branch
    step(3, "创建任务分支", rc == 0 and cur_branch == "feature/AIEO-POC-001", f"当前分支={cur_branch}")

    # 4. 修改无业务风险测试文件
    test_file = TEST_REPO / "src" / "calc.py"
    test_file.parent.mkdir(exist_ok=True)
    test_file.write_text(
        "# AIEO POC-04 无风险测试文件\n"
        "def add(a, b):\n"
        "    return a + b\n",
        encoding="utf-8",
    )
    rc, out, _ = run_git(["status", "--porcelain"])
    changed = "?? src/" in out or "?? src/" in out
    step(4, "修改测试文件", test_file.exists() and changed, f"新增 src/calc.py，status 显示: {out!r}")

    # 5. 执行简单测试
    t_probe = TEST_REPO / "test_calc.py"
    t_probe.write_text(
        "import sys; sys.path.insert(0, 'src')\n"
        "from calc import add\n"
        "assert add(2, 3) == 5\n"
        "assert add(-1, 1) == 0\n"
        "print('TEST PASS: 2/2 assertions')\n",
        encoding="utf-8",
    )
    p = subprocess.run([sys.executable, str(t_probe)], cwd=TEST_REPO, capture_output=True, text=True, encoding="utf-8", errors="replace")
    test_ok = p.returncode == 0 and "TEST PASS" in p.stdout
    evidence["test"] = {"command": f"python test_calc.py", "exit_code": p.returncode, "stdout": p.stdout.strip()}
    step(5, "执行简单测试", test_ok, f"exit={p.returncode}, stdout={p.stdout.strip()!r}")

    # 6. 提交 Git（测试文件本身不入库，仅提交 src/calc.py）
    run_git(["add", "src/calc.py"])
    rc, out, _ = run_git(["commit", "-m", "feat(POC-001): add calc.py add() 实现与自测"])
    step(6, "提交 Git", rc == 0, out.splitlines()[0] if out else err)

    # 7. 读取 Commit SHA
    rc, head_sha, _ = run_git(["rev-parse", "HEAD"])
    rc, head_short, _ = run_git(["log", "-1", "--format=%h %s"])
    evidence["commit_sha"] = head_sha
    evidence["commit_log"] = head_short
    step(7, "读取 Commit SHA", rc == 0 and len(head_sha) == 40 and head_sha != base_sha, f"SHA={head_sha}")

    # 8. 读取 Git Diff
    rc, diff_stat, _ = run_git(["diff", "--stat", base_sha, head_sha])
    rc, diff_full, _ = run_git(["diff", base_sha, head_sha])
    rc, changed_files, _ = run_git(["diff", "--name-only", base_sha, head_sha])
    evidence["diff_stat"] = diff_stat
    evidence["changed_files"] = [f for f in changed_files.splitlines() if f]
    evidence["diff_full_lines"] = len(diff_full.splitlines())
    step(8, "读取 Git Diff", rc == 0 and "calc.py" in diff_stat, f"变更文件={evidence['changed_files']}")

    # 9. 检查工作区是否干净（test_calc.py 是未提交的新文件，应能被检测出来）
    rc, out, _ = run_git(["status", "--porcelain"])
    detected_dirty = "test_calc.py" in out
    # 清理运行测试产生的临时文件（测试脚本 + __pycache__），还原干净工作区
    t_probe.unlink(missing_ok=True)
    shutil.rmtree(TEST_REPO / "src" / "__pycache__", ignore_errors=True)
    rc2, out2, _ = run_git(["status", "--porcelain"])
    step(9, "工作区干净检查", detected_dirty and out2 == "", f"能检出未提交文件={detected_dirty}; 清理后干净={out2 == ''!r}")

    # 汇总
    all_pass = all(s["pass"] for s in steps)
    result = {
        "poc": "POC-04 Git 自动采集",
        "executed_at": datetime.now(TZ).isoformat(),
        "duration_sec": round(time.time() - t0, 2),
        "repo": str(TEST_REPO),
        "all_pass": all_pass,
        "steps": steps,
        "evidence": evidence,
    }
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    RESULT_JSON.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    RUN_LOG.write_text("\n".join(log_lines), encoding="utf-8")
    log(f"=== POC-04 结束：{'全部通过' if all_pass else '存在失败'}，证据={RESULT_JSON} ===")
    return 0 if all_pass else 1


if __name__ == "__main__":
    sys.exit(main())
