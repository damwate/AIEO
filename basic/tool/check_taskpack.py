#!/usr/bin/env python3
"""任务包完整性检查工具（AIEO Basic，b-20261114-taskpack-checker 交付物）

检查一个 Basic 任务目录的任务记录完整性：单项 PASS/FAIL/N/A，
整体 PASS/FAIL/IN_PROGRESS（存在未到期检查项时）。

方案依据（2026-11-14 用户拍板冻结，basic/tasks/b-20261114-taskpack-checker/steps.md）：
七点共识+四项附加约束——两层校验（结构+有限规则，不做 AI 语义判断）、
PASS 关联具体步骤小节、REJECT/返工/问题编号三方关联（第 4 次及以后 FAIL）、
六项独立检查函数、证据路径防穿越防符号链接、--json 与文本共用同一结果对象、
退出码 PASS=0 / FAIL=1 / IN_PROGRESS=1、异常输入必须产生可识别结果。

仅用 Python 标准库（argparse/dataclasses/json/re/pathlib）。
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

# ---- 冻结口径常量 ----

# task-brief.md「当前状态」→ 阶段映射（steps.md 冻结口径 1）
PHASE_MAP = {
    "待规划": "PLANNING",
    "开发中": "IN_PROGRESS",
    "验收中": "IN_PROGRESS",
    "返工": "IN_PROGRESS",
    "阻塞": "IN_PROGRESS",
    "完成": "COMPLETED",
}

# 占位符黑名单（steps.md 冻结口径 2）：字段值命中即判无效内容
PLACEHOLDER_MARKERS = ("待填写", "TODO", "TBD", "待拍板后填写", "暂空")

# task-brief.md 必备字段（basic/WORKFLOW.md 模块一）
BRIEF_REQUIRED_FIELDS = (
    "任务ID",
    "需求原文",
    "执行者理解",
    "验收目标",
    "优先级",
    "当前状态",
    "当前步骤",
    "最终结果",
    "选定版本",
    "任务等级",
    "选型理由",
)

ITEM_NAMES = {
    1: "需求记录",
    2: "步骤清单",
    3: "步骤验收记录",
    4: "REJECT返工记录",
    5: "返工次数",
    6: "交付记录",
}

STATUS_PASS = "PASS"
STATUS_FAIL = "FAIL"
STATUS_NA = "N/A"
OVERALL_IN_PROGRESS = "IN_PROGRESS"
PHASE_UNKNOWN = "UNKNOWN"

# commit SHA=40 位 hex；dispatch reply SHA256=64 位 hex（steps.md 冻结口径 5）
RE_SHA40 = re.compile(r"^[0-9a-fA-F]{40}$")
RE_SHA64 = re.compile(r"^[0-9a-fA-F]{64}$")


@dataclass
class ItemResult:
    """单项检查结果（steps.md 冻结口径 4：统一字段，汇总层算整体状态）"""

    no: int
    name: str
    status: str = STATUS_NA
    problems: list = field(default_factory=list)
    files: list = field(default_factory=list)
    steps: list = field(default_factory=list)
    evidence: list = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "no": self.no,
            "name": self.name,
            "status": self.status,
            "problems": list(self.problems),
            "files": list(self.files),
            "steps": list(self.steps),
            "evidence": list(self.evidence),
        }


@dataclass
class PhaseInfo:
    """阶段读取结果：phase ∈ PHASE_MAP 值 ∪ {UNKNOWN}；UNKNOWN 时 problems 给原因"""

    phase: str = PHASE_UNKNOWN
    problems: list = field(default_factory=list)


def read_file_safe(path: Path) -> str:
    """读取文本文件；编码异常按冻结口径 7 必须产生可识别结果，不抛未捕获异常"""
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError as exc:
        raise FileDecodeError(str(path), str(exc)) from None
    except OSError as exc:
        raise FileDecodeError(str(path), str(exc)) from None


class FileDecodeError(Exception):
    """文件读取/解码失败，携带可识别问题文本"""

    def __init__(self, path: str, reason: str):
        super().__init__(f"文件读取失败: {path} ({reason})")
        self.path = path
        self.reason = reason


def read_phase(task_dir: Path) -> PhaseInfo:
    """从 task-brief.md 状态表读取当前状态并映射阶段；缺失/非法=UNKNOWN（不猜阶段）"""
    brief_path = task_dir / "task-brief.md"
    if not brief_path.is_file():
        return PhaseInfo(problems=[f"task-brief.md 不存在: {brief_path}"])
    try:
        text = read_file_safe(brief_path)
    except FileDecodeError as exc:
        return PhaseInfo(problems=[str(exc)])
    match = re.search(r"^\|\s*当前状态\s*\|\s*([^|]*?)\s*\|", text, re.MULTILINE)
    if not match:
        return PhaseInfo(problems=["task-brief.md 状态表缺少「当前状态」行"])
    value = match.group(1).strip()
    if not value or value in PLACEHOLDER_MARKERS:
        return PhaseInfo(problems=[f"「当前状态」为空或占位符: {value!r}"])
    phase = PHASE_MAP.get(value)
    if phase is None:
        return PhaseInfo(problems=[f"「当前状态」非法值（不在映射表）: {value!r}"])
    return PhaseInfo(phase=phase)


def is_placeholder(value: str) -> bool:
    """占位符判定：命中黑名单子串即无效（冻结口径 2）"""
    return any(marker in value for marker in PLACEHOLDER_MARKERS)


def _na_item(no: int) -> ItemResult:
    """S1 桩：未到期/未实现的检查项返回 N/A（S2 逐项替换实现）"""
    return ItemResult(no=no, name=ITEM_NAMES[no], status=STATUS_NA,
                      problems=["检查规则实现于 S2（当前为 S1 骨架桩）"])


# ---- 六项独立检查函数（冻结口径 4：互不依赖执行顺序，各自结构化返回） ----

def check_requirement(task_dir: Path) -> ItemResult:
    """①需求记录：requirement.md 原文非空 + task-brief.md 必备字段非空非占位符"""
    return _na_item(1)


def check_steps(task_dir: Path) -> ItemResult:
    """②步骤清单：steps.md 存在且含有效步骤编号与名称"""
    return _na_item(2)


def check_step_acceptance(task_dir: Path) -> ItemResult:
    """③步骤验收记录：每步骤小节内六要素+PASS 结论+证据引用（关联具体小节）"""
    return _na_item(3)


def check_rework_records(task_dir: Path) -> ItemResult:
    """④REJECT 返工记录：REJECT/返工记录/问题编号三方关联"""
    return _na_item(4)


def check_rework_limit(task_dir: Path) -> ItemResult:
    """⑤返工次数：同编号有效返工记录计数，第 3 次允许通过、第 4 次及以后 FAIL"""
    return _na_item(5)


def check_delivery(task_dir: Path, phase: str) -> ItemResult:
    """⑥交付记录：任务完成时 delivery.md 七要素必须存在（按阶段矩阵 N/A 除外）"""
    return _na_item(6)


CHECK_FUNCS = (
    check_requirement,
    check_steps,
    check_step_acceptance,
    check_rework_records,
    check_rework_limit,
    check_delivery,
)


def summarize(results: list, phase: str) -> tuple:
    """汇总层（冻结口径 4/6）：单项不自行决定整体；PASS=0，FAIL/IN_PROGRESS=1"""
    if any(r.status == STATUS_FAIL for r in results):
        overall = STATUS_FAIL
    elif any(r.status == STATUS_NA for r in results):
        overall = OVERALL_IN_PROGRESS
    else:
        overall = STATUS_PASS
    return overall, (0 if overall == STATUS_PASS else 1)


def render_text(task_dir: Path, phase: str, results: list, overall: str) -> str:
    """人类可读文本输出（共识样例样式）"""
    lines = [f"Taskpack: {task_dir.name}", f"Phase: {phase}"]
    for r in results:
        marker = f"[{r.status}]"
        circled = "①②③④⑤⑥"[r.no - 1]
        lines.append(f"{marker} {circled} {r.name}")
        for problem in r.problems:
            lines.append(f"       - {problem}")
    lines.append(f"Overall: {overall}")
    return "\n".join(lines)


def main(argv: list) -> int:
    parser = argparse.ArgumentParser(
        prog="check_taskpack.py",
        description="检查 Basic 任务目录的任务记录完整性（AIEO Basic）",
    )
    parser.add_argument("task_dir", help="Basic 任务目录路径（basic/tasks/<任务ID>）")
    parser.add_argument("--json", action="store_true",
                        help="输出机器可读 JSON（与文本共用同一检查结果对象）")
    args = parser.parse_args(argv)

    task_dir = Path(args.task_dir)
    # 冻结口径 7：异常输入产生可识别结果，不抛未捕获异常
    if not task_dir.is_dir():
        result = {
            "taskpack": args.task_dir,
            "phase": PHASE_UNKNOWN,
            "items": [],
            "problems": [f"任务目录不存在: {task_dir}"],
            "overall": STATUS_FAIL,
        }
        print(json.dumps(result, ensure_ascii=False, indent=2) if args.json
              else f"Taskpack: {task_dir.name}\nPhase: {PHASE_UNKNOWN}\nOverall: {STATUS_FAIL}\n"
                   f"       - 任务目录不存在: {task_dir}")
        return 1

    phase_info = read_phase(task_dir)
    results = [fn(task_dir) for fn in CHECK_FUNCS[:5]]
    results.append(check_delivery(task_dir, phase_info.phase))
    overall, exit_code = summarize(results, phase_info.phase)

    data = {
        "taskpack": task_dir.name,
        "phase": phase_info.phase,
        "phase_problems": phase_info.problems,
        "items": [r.to_dict() for r in results],
        "overall": overall,
    }
    if args.json:
        print(json.dumps(data, ensure_ascii=False, indent=2))
    else:
        print(render_text(task_dir, phase_info.phase, results, overall))
    return exit_code


if __name__ == "__main__":
    # Windows 控制台默认 GBK：统一 UTF-8 输出，编码失败不静默
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except AttributeError:
        pass
    sys.exit(main(sys.argv[1:]))
