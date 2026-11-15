# -*- coding: utf-8 -*-
"""S4-DV1-EV1 测试证据快照绑定补验驱动（会商4 第二级裁定授权，一次性，不入问题12 返工计数）。

裁定依据：会商4（会商2 第二级评估）reply sha256=2c32b00705d2340803d6a8b507122dc464da9e3bf256e2475394e72ebbb0fbce
（phase0/logs/recoll-2026-11-15T01-21-48-400Z/reply.txt，7554B）。裁定核心=根因为证据归档/申报未同步
（深层=证据缺自动版本溯源绑定），非⑧j 算法缺陷，不判 BLOCKED；授权一次性快照绑定补验。

裁定六环节落实：
  被测快照  = 固定 e309474dc85a8040506bd71347b03aa299384e1d（DV1 整改主体 commit，git worktree --detach 干净检出）；
  工作区状态 = 记录 git rev-parse HEAD 与 git status --porcelain（应空=干净）；
  输入身份  = 输出记录 delivery.md、检查器、测试脚本的 SHA256（自被测快照读取）；
  执行记录  = 输出记录 Python 版本、完整命令、逐项结果及退出码；
  归档方式  = 测试输出独立证据文件 + MANIFEST 记录证据文件 SHA256；
  版本变动  = 被测 delivery 任何修改都必须重跑本驱动重新生成证据，不得沿用旧输出。
验收请求约定：只引用最终归档文件路径、SHA256 及被测源 commit，不再手工复制 NT 位置作为主要证据。

四命令（裁定指定）：
  1 phase0/tools/s4-consistency-check.py   预期 36/36            退出 0
  2 phase0/tools/s4-dv1-tests.py           预期 6/6              退出 0
  3 phase0/tools/s4-check-negpos-tests.py  预期 7/7              退出 0
  4 basic/tool/check_taskpack.py <task>    预期 ④ PASS+Overall=IN_PROGRESS 退出 1（IN_PROGRESS 既定语义）

用法：python -X utf8 -I phase0/tools/s4-ev1-run.py （在主仓库根执行；被测快照只读，运行结束即移除 worktree）
"""
import hashlib
import io
import platform
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

SNAP = "e309474dc85a8040506bd71347b03aa299384e1d"
TASK = "basic/tasks/b-20261115-phasec-workflow-stats"
OUT_DIR = Path(TASK) / "acceptance" / "s4-ev1"
REPLY = "phase0/logs/recoll-2026-11-15T01-21-48-400Z/reply.txt"
REPLY_SHA = "2c32b00705d2340803d6a8b507122dc464da9e3bf256e2475394e72ebbb0fbce"
INPUT_FILES = [
    TASK + "/delivery.md",
    "phase0/tools/s4-consistency-check.py",
    "phase0/tools/s4-dv1-tests.py",
    "phase0/tools/s4-check-negpos-tests.py",
    "basic/tool/check_taskpack.py",
]
# (名称, argv(cwd=被测快照), 预期退出码, 预期摘要断言)
CMDS = [
    ("s4-consistency-check", ["python", "-X", "utf8", "-I", "phase0/tools/s4-consistency-check.py"], 0,
     ("PASS 36 / FAIL 0",)),
    ("s4-dv1-tests", ["python", "-X", "utf8", "-I", "phase0/tools/s4-dv1-tests.py"], 0,
     ("PASS 6 / FAIL 0",)),
    ("s4-check-negpos-tests", ["python", "-X", "utf8", "-I", "phase0/tools/s4-check-negpos-tests.py"], 0,
     ("PASS 7 / FAIL 0",)),
    ("check_taskpack", ["python", "-X", "utf8", "-I", "basic/tool/check_taskpack.py", TASK], 1,
     ("[PASS] ④", "Overall: IN_PROGRESS")),
]


def sha256_file(p: Path) -> str:
    h = hashlib.sha256()
    with io.open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 16), b""):
            h.update(chunk)
    return h.hexdigest()


def git(args, cwd=None):
    r = subprocess.run(["git"] + args, capture_output=True, encoding="utf-8", errors="replace", cwd=cwd)
    if r.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)} 失败: {r.stderr.strip()}")
    return r.stdout


def main():
    # ---- 被测快照：从固定 commit 干净检出（worktree，只读使用） ----
    wt = Path(tempfile.mkdtemp(prefix="ev1-wt-"))
    out_lines = []
    try:
        git(["worktree", "add", "--detach", str(wt), SNAP])
        head = git(["rev-parse", "HEAD"], cwd=str(wt)).strip()
        status = git(["status", "--porcelain"], cwd=str(wt)).strip()
        clean = (status == "")
        if not clean:
            raise RuntimeError(f"被测快照非干净检出: {status!r}")

        out_lines.append("=== S4-DV1-EV1 测试证据快照绑定补验输出 ===")
        out_lines.append("裁定依据：会商4（会商2 第二级评估）reply sha256=" + REPLY_SHA)
        out_lines.append("          " + REPLY + "（已入库归档）")
        out_lines.append("被测快照（裁定固定，DV1 整改主体 commit）：" + SNAP)
        out_lines.append("git rev-parse HEAD（被测 worktree）：" + head)
        out_lines.append("git status --porcelain（被测 worktree）：空（干净检出）")
        out_lines.append("Python 版本：" + sys.version.replace("\n", " "))
        out_lines.append("platform：" + platform.platform())
        out_lines.append("生成时间（UTC）：" + datetime.now(timezone.utc).isoformat(timespec="seconds"))
        out_lines.append("驱动脚本（本文件生成者）SHA256："
                         + sha256_file(Path("phase0/tools/s4-ev1-run.py")))
        out_lines.append("")
        out_lines.append("---- 输入身份：被测快照内文件 SHA256 ----")
        for rel in INPUT_FILES:
            out_lines.append(sha256_file(wt / rel) + "  " + rel)
        out_lines.append("")

        # ---- 四命令逐项执行（cwd=被测快照；全部输入取自快照内部） ----
        results = []
        for i, (name, argv, want_code, want_strs) in enumerate(CMDS, 1):
            out_lines.append(f"---- 命令 {i}/4：{' '.join(argv)}（cwd=被测快照） ----")
            r = subprocess.run(argv, capture_output=True, encoding="utf-8", errors="replace", cwd=str(wt))
            out_lines.append("退出码：" + str(r.returncode))
            out_lines.append("stdout：")
            out_lines.append(r.stdout.rstrip() if r.stdout else "（空）")
            if r.stderr.strip():
                out_lines.append("stderr：")
                out_lines.append(r.stderr.rstrip())
            ok_code = r.returncode == want_code
            ok_str = all(s in (r.stdout or "") for s in want_strs)
            results.append((name, ok_code and ok_str))
            out_lines.append(f"判定：{'符合预期' if results[-1][1] else '不符合预期'}"
                             f"（退出码 {'=' if ok_code else '!'}= {want_code}；"
                             f"关键输出 {'齐全' if ok_str else '缺失: ' + ','.join(want_strs)}）")
            out_lines.append("")

        # ---- EV1 判定 ----
        all_ok = all(hit for _, hit in results)
        out_lines.append("---- EV1 判定 ----")
        out_lines.append("①一致性核验=36/36 ②DV1测试=6/6 ③negpos=7/7 "
                         "④任务包④PASS/Overall=IN_PROGRESS/退出1（既定语义）")
        for name, hit in results:
            out_lines.append(f"  [{ 'PASS' if hit else 'FAIL' }] {name}")
        out_lines.append("EV1 结果：" + ("PASS（四命令全部符合预期，输出绑定上述快照身份；"
                                          "申报引用=本归档文件路径+本文件顶部 SHA256+被测源 commit）"
                                          if all_ok else "REJECT（存在不符合预期命令，见逐项判定）"))
        out_lines.append("版本变动条款：被测 delivery 任何修改后必须重跑本驱动重新生成本文件，不得沿用旧输出。")

        OUT_DIR.mkdir(parents=True, exist_ok=True)
        out_path = OUT_DIR / "s4-ev1-output.txt"
        io.open(out_path, "w", encoding="utf-8", newline="\n").write("\n".join(out_lines) + "\n")

        # ---- MANIFEST：记录证据文件 SHA256 ----
        manifest = [
            "=== S4-DV1-EV1 证据 MANIFEST ===",
            "生成时间（UTC）：" + datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "被测快照：" + SNAP,
            "裁定依据 reply sha256：" + REPLY_SHA,
            "驱动脚本 SHA256：" + sha256_file(Path("phase0/tools/s4-ev1-run.py")) + "  phase0/tools/s4-ev1-run.py",
            "证据文件清单：",
            sha256_file(out_path) + "  s4-ev1-output.txt（EV1 主证据）",
            "约定：验收请求只引用本 MANIFEST 所列归档文件路径、SHA256 及被测源 commit；"
            "被测文件修改后须重跑驱动，旧输出不得沿用。",
        ]
        io.open(OUT_DIR / "s4-ev1-MANIFEST.txt", "w", encoding="utf-8", newline="\n").write("\n".join(manifest) + "\n")

        print(f"EV1 结果: {'PASS' if all_ok else 'REJECT'} | 输出={out_path}")
        for name, hit in results:
            print(f"  [{'PASS' if hit else 'FAIL'}] {name}")
        sys.exit(0 if all_ok else 1)
    finally:
        subprocess.run(["git", "worktree", "remove", "--force", str(wt)], capture_output=True)
        shutil.rmtree(wt, ignore_errors=True)


if __name__ == "__main__":
    main()
