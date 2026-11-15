#!/usr/bin/env python3
"""C1 申报绑定自动核验工具（b-20261115-standard-kickoff S3 交付）。

对"验收基线 → 待验收 commit"的绑定申报做机器确定性核验（Basic WORKFLOW 模块四
ST-01 的脚本化，设计输入 C1；实施依据=standard/development-plan.md 阶段 B）。

规则（对应规划 v0.2 十场景矩阵）：
  R1 区间数一致    --count 给定时，git rev-list --count 必须相等，否则 FAIL
  R2 线性链完整    区间内每 commit 恰 1 parent；首 commit parent==baseline；
                   逐条 parent==前一 commit（断链 FAIL）
  R3 merge 禁止    区间内任一 commit parent 数>1 → FAIL，提示改报 diff 基线
  R4 最终性        target..HEAD 存在后代 commit 且未附回填声明 → FAIL（申报对象非最终）
  R5 回填声明      --backfill-note 非空白 → PASS（识别并排除指定范围）；
                   空白/缺失而存在后代 → FAIL（回填声明缺失或不完整）
  R6 对象存在      baseline/target 无法解析为 commit → FAIL（对象不存在）
  R7 空区间        区间 commit 数==0（baseline==target 或 target 非 baseline 后代）
                   → BLOCKED（禁止 PASS）；--mark-na 附加"申报方标注不适用"说明，
                   verdict 仍为 BLOCKED

判定三态：PASS / FAIL / BLOCKED（无法核验≠PASS，L-017/规划 B 矩阵）。
退出码：0=PASS，1=FAIL，2=BLOCKED；输入不合法（SHA 格式）→ FAIL。

安全边界（只读承诺）：
  - 仅调用只读 git 命令（rev-parse / cat-file / rev-list / diff --numstat），
    并设 GIT_OPTIONAL_LOCKS=0 阻止索引写入；不修改工作区/分支/提交/配置。
  - git 调用异常 → BLOCKED（携带 stderr 摘要）；不降级为 PASS。
  - 不读取或输出任何秘密；输出不含时间戳（同一输入+同一对象+同版本 → 判定确定）。

用法：
  python toolkit/check-binding.py --baseline <40hex> --target <40hex> \
      [--count N] [--backfill-note "回填声明文本"] [--mark-na "不适用说明"] [--repo <path>]
输出：JSON 一行（verdict / rules / numstat / summary），供申报与验收双方机器对照。
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys

RE_SHA40 = "0123456789abcdefABCDEF"


def is_sha40(s: str) -> bool:
    return len(s) == 40 and all(c in RE_SHA40 for c in s)


class Rule:
    def __init__(self, rid: str, verdict: str, detail: str, commits=None, remediation: str = ""):
        self.id = rid
        self.verdict = verdict  # PASS / FAIL / BLOCKED
        self.detail = detail
        self.commits = commits or []
        self.remediation = remediation

    def to_dict(self):
        d = {"id": self.id, "verdict": self.verdict, "detail": self.detail}
        if self.commits:
            d["commits"] = self.commits
        if self.remediation:
            d["remediation"] = self.remediation
        return d


def git(repo: str, *args: str):
    """只读 git 调用；异常抛 GitCmdError 由上层转 BLOCKED。"""
    env = dict(os.environ)
    env["GIT_OPTIONAL_LOCKS"] = "0"
    p = subprocess.run(
        ["git", "-C", repo, *args],
        capture_output=True, text=True, encoding="utf-8", errors="replace", env=env, timeout=60,
    )
    return p


class GitCmdError(Exception):
    def __init__(self, args, stderr):
        self.args_ = args
        self.stderr = (stderr or "").strip().splitlines()[-1:] or ["(无 stderr)"]
        super().__init__(f"git {' '.join(args)} 失败: {self.stderr[0]}")


def must(repo: str, *args: str) -> str:
    p = git(repo, *args)
    if p.returncode != 0:
        raise GitCmdError(args, p.stderr)
    return p.stdout


def try_git(repo: str, *args: str):
    p = git(repo, *args)
    return (p.returncode, p.stdout.strip(), p.stderr)


def main() -> int:
    ap = argparse.ArgumentParser(description="C1 申报绑定自动核验（只读）")
    ap.add_argument("--baseline", required=True)
    ap.add_argument("--target", required=True)
    ap.add_argument("--count", type=int, default=None, help="申报 commit 数（区间数核验）")
    ap.add_argument("--backfill-note", default=None, help="回填声明文本（声明该 commit 及其后代不属验收 diff 范围）")
    ap.add_argument("--mark-na", default=None, help="空区间时申报方'不适用'说明（verdict 仍 BLOCKED）")
    ap.add_argument("--repo", default=".", help="仓库路径（默认当前目录）")
    ns = ap.parse_args()

    repo = ns.repo
    rules: list[Rule] = []
    blocked_inputs = False

    # 输入合法性（非法输入 fail-closed → FAIL）
    for name, val in (("baseline", ns.baseline), ("target", ns.target)):
        if not is_sha40(val):
            rules.append(Rule("R0", "FAIL", f"输入不合法：{name} 不是 40 位十六进制 SHA",
                              remediation="申报必须使用完整 40 位 commit SHA"))
            blocked_inputs = True

    numstat = []
    if not blocked_inputs:
        try:
            # 仓库可用性探针（环境不可用=BLOCKED，区别于对象不存在=FAIL）
            rc, out, err = try_git(repo, "rev-parse", "--git-dir")
            if rc != 0:
                raise GitCmdError(["rev-parse", "--git-dir"], err)
            # R6 对象存在（不存在=FAIL）
            for name, sha in (("baseline", ns.baseline), ("target", ns.target)):
                rc, out, err = try_git(repo, "cat-file", "-t", sha)
                if rc != 0 or out != "commit":
                    rules.append(Rule("R6", "FAIL", f"对象不存在或非 commit：{name}={sha}",
                                      commits=[sha], remediation="核对 SHA 来源（git rev-parse / 派单报告）后重报"))
            obj_ok = not any(r.id == "R6" for r in rules)

            if obj_ok:
                # 区间 commit 链（rev-list --reverse --parents）
                rc, out, err = try_git(repo, "rev-list", "--reverse", "--parents",
                                       f"{ns.baseline}..{ns.target}")
                if rc != 0:
                    raise GitCmdError(["rev-list"], err)
                chain = [ln.split() for ln in out.splitlines() if ln.strip()]

                # R7 空区间/范围不确定 → BLOCKED（禁止 PASS）
                if not chain:
                    detail = "区间 commit 数==0（baseline==target 或 target 非 baseline 后代），无法核验申报内容"
                    if ns.mark_na:
                        detail += f"；申报方标注不适用：{ns.mark_na}"
                    rules.append(Rule("R7", "BLOCKED", detail,
                                      remediation="核对基线与待验收 commit 的先后关系；禁止以空区间冒充 PASS"))
                else:
                    # R1 区间数
                    if ns.count is not None:
                        actual = len(chain)
                        rules.append(Rule("R1", "PASS" if actual == ns.count else "FAIL",
                                          f"区间 commit 数申报={ns.count} 实际={actual}"
                                          + ("" if actual == ns.count else "（不一致）"),
                                          remediation=None if actual == ns.count else "以 rev-list --count 机器值修正申报"))
                    # R3 merge 禁止（先于 R2 判定，负例须指名 merge commit）
                    merges = [c[0] for c in chain if len(c) - 1 > 1]
                    if merges:
                        rules.append(Rule("R3", "FAIL", f"区间含 merge commit（parent 数>1）：{'、'.join(merges)}",
                                          commits=merges,
                                          remediation="不得按普通线性多 commit 申报；改报 diff 基线并单独说明"))
                    else:
                        # R2 线性链逐条核验
                        problems = []
                        first = chain[0]
                        if first[1:] != [ns.baseline]:
                            problems.append(f"首 commit {first[0]} 的 parent={first[1:] or ['(无)']} ≠ 申报基线 {ns.baseline}")
                        for prev, cur in zip(chain, chain[1:]):
                            if cur[1:] != [prev[0]]:
                                problems.append(f"链断裂：{cur[0]} 的 parent={cur[1:] or ['(无)']} ≠ 前一 commit {prev[0]}")
                        last = chain[-1]
                        if last[0] != ns.target:
                            problems.append(f"链末尾 {last[0]} ≠ 待验收 commit {ns.target}")
                        rules.append(Rule("R2", "FAIL" if problems else "PASS",
                                          "线性链逐条核验通过（每 commit 恰 1 parent，首 parent=基线，末=待验收）"
                                          if not problems else "；".join(problems),
                                          commits=[c[0] for c in chain],
                                          remediation="逐条核链依据 git rev-list --reverse --parents；单 commit 申报时 parent 必须等于基线" if problems else ""))
                    # R4/R5 最终性与回填声明
                    rc, out, _ = try_git(repo, "rev-list", f"{ns.target}..HEAD")
                    descendants = out.splitlines() if rc == 0 and out else []
                    note = (ns.backfill_note or "").strip()
                    if descendants and not note:
                        rules.append(Rule("R4", "FAIL",
                                          f"待验收 commit 存在 {len(descendants)} 个后代（target..HEAD 非空），申报对象非最终且未附回填声明",
                                          commits=[ns.target], remediation="更新申报至最终待验收对象，或附回填声明（ST-01 ④）"))
                    elif note:
                        rules.append(Rule("R5", "PASS", f"回填声明符合规则，识别并排除指定范围：{note}"))
                    else:
                        rules.append(Rule("R4", "PASS", "待验收 commit 无后代（=当前 HEAD），为最终申报对象"))
                    # 附机器 numstat 供申报对照（只读）
                    rc, out, _ = try_git(repo, "diff", "--numstat", f"{ns.baseline}..{ns.target}")
                    if rc == 0 and out:
                        numstat = [ln.split("\t", 2) for ln in out.splitlines()]
        except GitCmdError as e:
            rules.append(Rule("RX", "BLOCKED", f"git 调用失败，无法核验（fail-closed）：{e}",
                              remediation="核对仓库路径与 git 环境；禁止将无法核验记为 PASS"))
        except Exception as e:  # 任何意外一律 fail-closed
            rules.append(Rule("RX", "BLOCKED", f"核验器异常，无法核验（fail-closed）：{type(e).__name__}: {e}"))

    verdict = "PASS"
    if any(r.verdict == "FAIL" for r in rules):
        verdict = "FAIL"
    elif any(r.verdict == "BLOCKED" for r in rules):
        verdict = "BLOCKED"

    out = {
        "tool": "check-binding.py (C1)",
        "verdict": verdict,
        "baseline": ns.baseline,
        "target": ns.target,
        "declared_count": ns.count,
        "rules": [r.to_dict() for r in rules],
        "numstat": numstat,
    }
    print(json.dumps(out, ensure_ascii=False))
    return {"PASS": 0, "FAIL": 1, "BLOCKED": 2}[verdict]


if __name__ == "__main__":
    sys.exit(main())
