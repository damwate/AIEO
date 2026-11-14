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
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path, PurePosixPath

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

# task-brief.md ①项检查的 9 个必备字段（steps.md S2 冻结清单："9 必备字段非空非占位符"；
# 版本选型三要素拆为三个具体字段）。当前状态/最终结果不在本表：当前状态由阶段映射专门校验
# （冻结口径 1），最终结果设计上就是"任务完成前暂空"，作占位符检查会永久误报。
BRIEF_REQUIRED_FIELDS = (
    "任务ID",
    "需求原文",
    "执行者理解",
    "验收目标",
    "优先级",
    "当前步骤",
    "选定版本",
    "任务等级",
    "选型理由",
)

# 步骤六要素（basic/WORKFLOW.md：steps.md 每步记录六要素）
SIX_ELEMENT_NAMES = ("本步骤目标", "修改文件", "修改内容", "执行结果", "测试结果", "验收证据引用")
CIRCLED = "①②③④⑤⑥"

# delivery.md 七要素（basic/WORKFLOW.md 模块六）
DELIVERY_ELEMENTS = ("原始需求", "最终实现内容", "修改文件", "测试结果", "Git commit", "未解决问题", "后续建议")

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
RE_SHA40 = re.compile(r"(?<![0-9a-fA-F])[0-9a-fA-F]{40}(?![0-9a-fA-F])")
RE_SHA64 = re.compile(r"(?<![0-9a-fA-F])[0-9a-fA-F]{64}(?![0-9a-fA-F])")
# dispatch 证据目录引用（phase0/logs/dispatch-YYYY-MM-DDTHH-MM-SS）
RE_DISPATCH_DIR = re.compile(r"dispatch-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}")
# 步骤小节标题（## S<编号> <名称>）
RE_STEP_HEADING = re.compile(r"^##\s+(S(\d+))\s+(.*)$", re.MULTILINE)
# 同一问题返工上限：第 3 次允许通过、第 4 次及以后 FAIL（冻结口径 3）
REWORK_LIMIT = 3


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
    """读取文本文件；编码/OS 异常按冻结口径 7 必须产生可识别结果，不抛未捕获异常"""
    try:
        return path.read_text(encoding="utf-8")
    except (UnicodeDecodeError, OSError) as exc:
        raise FileDecodeError(str(path), str(exc)) from None


class FileDecodeError(Exception):
    """文件读取/解码失败，携带可识别问题文本"""

    def __init__(self, path: str, reason: str):
        super().__init__(f"文件读取失败: {path} ({reason})")
        self.path = path
        self.reason = reason


def is_placeholder(value: str) -> bool:
    """占位符判定：命中黑名单子串即无效（冻结口径 2）"""
    return any(marker in value for marker in PLACEHOLDER_MARKERS)


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


def extract_brief_field(text: str, name: str):
    """从 task-brief.md 提取必备字段值，三种形态（本仓库实际使用前两种+标题）：
    ①表格行 `| 字段 | 值 |`；②行内 `字段：值`（含 - * 与 ** 加粗前缀）；
    ③标题 `## 字段（注记）[：值]`——标题行无值时取下一个非空行。返回值或 None（不存在）"""
    table = re.search(rf"^\|\s*{re.escape(name)}\s*\|\s*(.*?)\s*\|", text, re.MULTILINE)
    if table:
        return table.group(1)
    inline = re.search(rf"^\s*(?:[-*]\s*)?\**{re.escape(name)}\**\s*[：:](.*)$", text, re.MULTILINE)
    if inline and inline.group(1).strip():
        return inline.group(1).strip()
    heading = re.search(rf"^\s*#{{1,6}}\s*{re.escape(name)}\s*(?:（[^）]*）)?\s*[：:]?\s*(.*)$", text, re.MULTILINE)
    if heading:
        rest = heading.group(1).strip()
        if rest:
            return rest
        after = text[heading.end():]
        for ln in after.split("\n"):
            s = ln.strip().lstrip("#*- ").strip()
            if s:
                return s
    return inline.group(1).strip() if inline else None


def count_brief_field_rows(text: str, name: str) -> int:
    """统计字段在 task-brief.md 中作为字段行出现的次数，覆盖 extract_brief_field
    支持的全部三种书写形式（表格行+行内键+标题行，计数口径与提取口径一致——
    复验R1 P1-1 整改：标题形式漏计致跨格式重复漏判），
    用于重复字段检测（拍板异常类"重复字段或编号"：重复字段不允许静默接受）"""
    table = len(re.findall(rf"^\|\s*{re.escape(name)}\s*\|", text, re.MULTILINE))
    inline = len(re.findall(rf"^\s*(?:[-*]\s*)?\**{re.escape(name)}\**\s*[：:]", text, re.MULTILINE))
    heading = len(re.findall(
        rf"^\s*#{{1,6}}\s*{re.escape(name)}\s*(?:（[^）]*）)?\s*[：:]?", text, re.MULTILINE))
    return table + inline + heading


def parse_current_step(task_dir: Path):
    """从 task-brief.md「当前步骤」解析当前步骤编号（S<数字>→int）；无法解析返回 None"""
    brief_path = task_dir / "task-brief.md"
    if not brief_path.is_file():
        return None
    try:
        text = read_file_safe(brief_path)
    except FileDecodeError:
        return None
    value = extract_brief_field(text, "当前步骤")
    if not value:
        return None
    m = re.search(r"S(\d+)", value)
    return int(m.group(1)) if m else None


def split_h2_sections(text: str) -> list:
    """按 `## ` 标题切分小节，返回 [(标题, 正文)]；标题前内容忽略"""
    matches = list(re.finditer(r"^##\s+(.*)$", text, re.MULTILINE))
    sections = []
    for i, m in enumerate(matches):
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        sections.append((m.group(1).strip(), text[start:end]))
    return sections


def get_step_sections(text: str) -> list:
    """提取步骤小节 [(编号:int, 标题, 正文)]（标题形如 `S1 骨架：...`）"""
    steps = []
    for title, body in split_h2_sections(text):
        m = re.match(r"^S(\d+)\s+(.*)$", title)
        if m:
            steps.append((int(m.group(1)), m.group(2).strip(), body))
    return steps


def extract_six_elements(body: str) -> dict:
    """提取六要素：标记为 ①-⑥+要素名（允许"（说明）"后缀+冒号），值为标记后到下一标记前
    的文本；标记缺失=None；返回 {要素全名: str|None}"""
    result = {}
    spans = []  # (element_full_name, marker_start, value_start)
    for i, name in enumerate(SIX_ELEMENT_NAMES):
        full = CIRCLED[i] + name
        m = re.search(re.escape(CIRCLED[i]) + re.escape(name) + r"(?:\s*（[^）]*）)?\s*[：:]", body)
        spans.append((full, m.start(), m.end()) if m else (full, None, None))
    for i, (full, start, vstart) in enumerate(spans):
        if vstart is None:
            result[full] = None
            continue
        # 值边界=下一个已找到标记的 start（不含），否则小节末尾
        end = len(body)
        for j in range(i + 1, len(spans)):
            if spans[j][1] is not None:
                end = spans[j][1]
                break
        result[full] = body[vstart:end].strip()
    return result


def validate_pack_path(task_dir: Path, rel: str):
    """证据路径校验（冻结口径 5）：相对路径、禁 .. 穿越、解析实际路径防符号链接绕过、
    必须存在于任务包内。返回问题文本或 None（通过）"""
    rel_norm = rel.replace("\\", "/").strip()
    if not rel_norm:
        return "空路径"
    if re.match(r"^[A-Za-z]:", rel_norm) or rel_norm.startswith(("/", "\\")):
        return f"绝对路径不允许: {rel}"
    parts = PurePosixPath(rel_norm).parts
    if ".." in parts:
        return f"路径穿越（..）不允许: {rel}"
    base = task_dir.resolve()
    try:
        target = (base / rel_norm).resolve()
    except OSError as exc:
        return f"路径解析失败: {rel} ({exc})"
    if not target.is_relative_to(base):
        return f"实际路径越出任务目录（疑似符号链接绕过）: {rel}"
    if not target.exists():
        return f"证据路径不存在: {rel}"
    return None


def pack_paths_in_text(text: str) -> list:
    """从证据文本提取任务包内相对证据路径 token（acceptance/ 开头；含 * 时截断为目录前缀）"""
    tokens = []
    for m in re.finditer(r"acceptance/[\w.\-/\\]+", text):
        tok = m.group(0).rstrip("。，；、）)\"'`")
        tok = tok.replace("\\", "/")
        star = tok.find("*")
        if star >= 0:
            tok = tok[:star]
        if tok.endswith("/"):
            tok = tok[:-1]
        if tok and tok not in tokens:
            tokens.append(tok)
    return tokens


def parse_rework_table(text: str) -> tuple:
    """解析返工记录表（表头含「问题编号」的 markdown 表格）。
    返回 (found:bool, rows:[{problem, sha, problems:[...]})"""
    lines = text.split("\n")
    header_idx = None
    for i, ln in enumerate(lines):
        if re.match(r"^\s*\|.*问题编号.*\|", ln):
            header_idx = i
            break
    if header_idx is None:
        return False, []
    cols = [c.strip() for c in lines[header_idx].strip().strip("|").split("|")]
    try:
        pi = cols.index("问题编号")
        fi = next(i for i, c in enumerate(cols) if "修复" in c)
    except (ValueError, StopIteration):
        return True, [{"problem": "", "sha": None,
                       "problems": ["返工记录表表头须含「问题编号」与「修复 commit」列"]}]
    rows = []
    for ln in lines[header_idx + 1:]:
        if not ln.strip().startswith("|"):
            break
        cells = [c.strip() for c in ln.strip().strip("|").split("|")]
        if all(re.fullmatch(r":?-{2,}:?", c) for c in cells if c):
            continue  # 表头分隔行
        problems = []
        if len(cells) < len(cols):
            problems.append(f"列数({len(cells)})少于表头({len(cols)})")
        problem = cells[pi] if pi < len(cells) else ""
        sha = None
        if fi < len(cells):
            m = RE_SHA40.search(cells[fi])
            sha = m.group(0) if m else None
            if not sha:
                problems.append("修复 commit 列缺 40 位 hex SHA")
        if not problem or is_placeholder(problem):
            problems.append("问题编号缺失或为占位符")
        num_m = re.search(r"问题\s*(\d+)", problem)
        rows.append({"problem": problem, "sha": sha,
                     "num": int(num_m.group(1)) if num_m else None,
                     "problems": problems})
    return True, rows


def extract_problem_numbers(text: str) -> set:
    """提取文本中引用的问题编号集合（「问题<N>」，容许空白）；编号级三方关联用"""
    return {int(m) for m in re.findall(r"问题\s*(\d+)", text)}


def summarize(results: list, phase: str) -> tuple:
    """汇总层（冻结口径 4/6）：单项不自行决定整体；PASS=0，FAIL/IN_PROGRESS=1"""
    if any(r.status == STATUS_FAIL for r in results):
        overall = STATUS_FAIL
    elif any(r.status == STATUS_NA for r in results):
        overall = OVERALL_IN_PROGRESS
    else:
        overall = STATUS_PASS
    return overall, (0 if overall == STATUS_PASS else 1)


def build_result(taskpack_label: str, phase: str, phase_problems: list,
                 results: list, problems: list, overall: str) -> dict:
    """统一完整结果对象（冻结口径 6）：文本与 JSON、正常与异常路径共用同一 schema"""
    return {
        "taskpack": taskpack_label,
        "phase": phase,
        "phase_problems": list(phase_problems),
        "items": [r.to_dict() if isinstance(r, ItemResult) else r for r in results],
        "problems": list(problems),
        "overall": overall,
    }


def render_text(result: dict) -> str:
    """人类可读文本输出（消费统一结果对象，共识样例样式）"""
    lines = [f"Taskpack: {result['taskpack']}", f"Phase: {result['phase']}"]
    for problem in result["phase_problems"]:
        lines.append(f"       - 阶段读取: {problem}")
    for problem in result["problems"]:
        lines.append(f"       - {problem}")
    for r in result["items"]:
        lines.append(f"[{r['status']}] {CIRCLED[r['no'] - 1]} {r['name']}")
        for problem in r["problems"]:
            lines.append(f"       - {problem}")
    lines.append(f"Overall: {result['overall']}")
    return "\n".join(lines)


# ---- 六项独立检查函数（冻结口径 4：互不依赖执行顺序，各自结构化返回） ----

def check_requirement(task_dir: Path) -> ItemResult:
    """①需求记录：requirement.md 原文非空非占位符 + task-brief.md 必备字段非空非占位符
    且不重复（重复字段 FAIL，拍板异常类"重复字段或编号"）。
    阶段读取失败（缺失/非法/占位符）=FAIL+可识别原因（冻结口径 1，不猜阶段）"""
    item = ItemResult(no=1, name=ITEM_NAMES[1])
    phase_info = read_phase(task_dir)
    if phase_info.phase == PHASE_UNKNOWN:
        item.status = STATUS_FAIL
        item.problems = list(phase_info.problems)
        item.files = ["task-brief.md"]
        return item
    problems = []
    files = []
    req_path = task_dir / "requirement.md"
    if not req_path.is_file():
        problems.append("requirement.md 不存在")
    else:
        files.append("requirement.md")
        try:
            req_text = read_file_safe(req_path).strip()
            if not req_text:
                problems.append("requirement.md 内容为空")
            elif is_placeholder(req_text):
                problems.append(f"requirement.md 内容为占位符: {req_text[:60]!r}")
        except FileDecodeError as exc:
            problems.append(str(exc))
    brief_path = task_dir / "task-brief.md"
    if not brief_path.is_file():
        problems.append("task-brief.md 不存在")
    else:
        files.append("task-brief.md")
        try:
            brief_text = read_file_safe(brief_path)
        except FileDecodeError as exc:
            brief_text = None
            problems.append(str(exc))
        if brief_text is not None:
            for fname in BRIEF_REQUIRED_FIELDS:
                value = extract_brief_field(brief_text, fname)
                if value is None:
                    problems.append(f"task-brief.md 缺少必备字段「{fname}」")
                elif not value.strip():
                    problems.append(f"task-brief.md 字段「{fname}」为空")
                elif is_placeholder(value):
                    problems.append(f"task-brief.md 字段「{fname}」为占位符: {value!r}")
                else:
                    n = count_brief_field_rows(brief_text, fname)
                    if n > 1:
                        problems.append(
                            f"task-brief.md 字段「{fname}」重复出现 {n} 次（重复字段不允许静默接受）")
    item.files = files
    item.problems = problems
    item.status = STATUS_FAIL if problems else STATUS_PASS
    return item


def check_steps(task_dir: Path) -> ItemResult:
    """②步骤清单：steps.md 存在且含有效步骤编号与名称（`## S<编号> <名称>` 小节），编号唯一
    （重复编号 FAIL，拍板异常类"重复字段或编号"）"""
    item = ItemResult(no=2, name=ITEM_NAMES[2])
    path = task_dir / "steps.md"
    if not path.is_file():
        item.status = STATUS_FAIL
        item.problems = ["steps.md 不存在"]
        item.files = ["steps.md"]
        return item
    item.files = ["steps.md"]
    try:
        text = read_file_safe(path)
    except FileDecodeError as exc:
        item.status = STATUS_FAIL
        item.problems = [str(exc)]
        return item
    steps = get_step_sections(text)
    if not steps:
        item.status = STATUS_FAIL
        item.problems = ["steps.md 未找到任何步骤小节（须含 `## S<编号> <名称>` 标题）"]
        return item
    item.steps = [f"S{sid} {title}" for sid, title, _ in steps]
    dup = {sid: n for sid, n in Counter(s for s, _, _ in steps).items() if n > 1}
    if dup:
        item.status = STATUS_FAIL
        item.problems = [
            "步骤编号重复（重复编号不允许静默接受）: "
            + "、".join(f"S{sid} 出现 {n} 个小节" for sid, n in sorted(dup.items()))
        ]
        return item
    item.status = STATUS_PASS
    return item


def check_step_acceptance(task_dir: Path) -> ItemResult:
    """③步骤验收记录：每步骤小节六要素齐全+PASS 结论（验收结论：PASS）+证据引用
    （dispatch 目录+reply SHA256 64位hex+包内证据路径校验），关联具体步骤小节。
    阶段规则：COMPLETED→全部步骤须 PASS；IN_PROGRESS→编号小于当前步骤的须 PASS、
    当前及以后未到期 N/A；PLANNING→全部 N/A；当前步骤无法解析→FAIL（不猜）"""
    item = ItemResult(no=3, name=ITEM_NAMES[3])
    path = task_dir / "steps.md"
    if not path.is_file():
        item.status = STATUS_FAIL
        item.problems = ["steps.md 不存在，无法核验步骤验收记录"]
        item.files = ["steps.md"]
        return item
    item.files = ["steps.md", "task-brief.md"]
    try:
        text = read_file_safe(path)
    except FileDecodeError as exc:
        item.status = STATUS_FAIL
        item.problems = [str(exc)]
        return item
    step_secs = get_step_sections(text)
    if not step_secs:
        item.status = STATUS_FAIL
        item.problems = ["steps.md 无步骤小节"]
        return item
    phase_info = read_phase(task_dir)
    phase = phase_info.phase
    current = parse_current_step(task_dir)
    problems = []
    pass_steps, na_steps = [], []
    item.steps = [f"S{sid} {title}" for sid, title, _ in step_secs]
    if phase == PHASE_UNKNOWN:
        item.status = STATUS_FAIL
        item.problems = ["任务阶段读取失败，无法判定步骤是否到期（冻结口径 1 不猜阶段）"] + list(phase_info.problems)
        return item
    for sid, title, body in step_secs:
        label = f"S{sid} {title}"
        # P1-1 整改（S2 首验 REJECT）：先判到期（阶段规则），再评估记录——
        # 未到期步骤一律 N/A，不因预填完整 PASS 记录而提前 PASS；
        # PLANNING 全部 N/A；IN_PROGRESS 编号<当前才到期；COMPLETED 全部到期
        if phase == PHASE_PLANNING:
            na_steps.append(label)
            continue
        if phase == PHASE_IN_PROGRESS:
            if current is None:
                problems.append(f"{label}: 「当前步骤」无法解析出 S 编号，无法判定步骤是否到期（不猜）")
                continue
            if sid >= current:
                na_steps.append(label)
                continue
        elems = extract_six_elements(body)
        missing = [CIRCLED[i] + SIX_ELEMENT_NAMES[i] for i in range(6) if elems.get(CIRCLED[i] + SIX_ELEMENT_NAMES[i]) is None]
        empty = [CIRCLED[i] + SIX_ELEMENT_NAMES[i] for i in range(6)
                 if elems.get(CIRCLED[i] + SIX_ELEMENT_NAMES[i]) is not None
                 and (not elems[CIRCLED[i] + SIX_ELEMENT_NAMES[i]].strip()
                      or is_placeholder(elems[CIRCLED[i] + SIX_ELEMENT_NAMES[i]]))]
        ev = elems.get(CIRCLED[5] + SIX_ELEMENT_NAMES[5]) or ""
        conclusion_pass = bool(re.search(r"验收结论[：:]\s*\**\s*PASS", ev))
        step_problems = []
        if missing:
            step_problems.append(f"六要素缺失: {'、'.join(missing)}")
        if empty:
            step_problems.append(f"六要素为空/占位符: {'、'.join(empty)}")
        if ev.strip() and not is_placeholder(ev):
            if not RE_DISPATCH_DIR.search(ev):
                step_problems.append("⑥缺 dispatch 目录引用（dispatch-YYYY-MM-DDTHH-MM-SS）")
            if not RE_SHA64.search(ev):
                step_problems.append("⑥缺 reply SHA256（64 位 hex）")
            for tok in pack_paths_in_text(ev):
                problem = validate_pack_path(task_dir, tok)
                if problem:
                    step_problems.append(problem)
                else:
                    item.evidence.append(tok)
        if elems and not missing and not empty and conclusion_pass and not step_problems:
            pass_steps.append(label)
            continue
        if not conclusion_pass and not missing and not empty:
            step_problems.append("缺「验收结论：PASS」")
        problems.append(f"{label}: " + "；".join(step_problems))
    if problems:
        item.problems = problems
        item.status = STATUS_FAIL
    elif na_steps:
        item.problems = [f"{len(pass_steps)} 步记录完整 PASS；未到期步骤（{len(na_steps)} 个）: {'、'.join(na_steps)}"]
        item.status = STATUS_NA
    else:
        item.status = STATUS_PASS
    return item


def check_rework_records(task_dir: Path) -> ItemResult:
    """④REJECT 返工记录（编号级三方关联）：步骤含 REJECT 时，REJECT 所在要素值与⑥验收证据引用
    须引用问题编号（其他无关要素的编号不替代，复验 R2 整改），且返工表须有该编号的有效行
    （问题编号+修复 commit 40位SHA）；返工行也须被某步骤小节引用；
    无 REJECT 无表=N/A（COMPLETED 空满足 PASS）。无关行不能替代缺失关联"""
    item = ItemResult(no=4, name=ITEM_NAMES[4])
    path = task_dir / "steps.md"
    if not path.is_file():
        item.status = STATUS_FAIL
        item.problems = ["steps.md 不存在，无法核验 REJECT 返工记录"]
        item.files = ["steps.md"]
        return item
    item.files = ["steps.md"]
    try:
        text = read_file_safe(path)
    except FileDecodeError as exc:
        item.status = STATUS_FAIL
        item.problems = [str(exc)]
        return item
    reject_steps = []
    reject_nums = set()
    referenced_nums = set()
    problems = []
    for sid, title, body in get_step_sections(text):
        elems = extract_six_elements(body)
        # 编号引用源=整个步骤小节（六要素任一要素提及均可构成行关联）
        referenced_nums.update(extract_problem_numbers(body))
        # REJECT 关联编号=含 REJECT 的各要素值+⑥（验收结论所在），判定范围与提取范围一致；
        # 不允许用同一小节其他无关要素中的编号替代（复验 R2 遗留 P1 整改）
        step_reject_nums = set()
        has_reject = False
        for v in elems.values():
            if v and "REJECT" in v:
                has_reject = True
                step_reject_nums.update(extract_problem_numbers(v))
        if has_reject:
            ev = elems.get(CIRCLED[5] + SIX_ELEMENT_NAMES[5]) or ""
            step_reject_nums.update(extract_problem_numbers(ev))
            reject_nums.update(step_reject_nums)
            reject_steps.append(f"S{sid}")
            if not step_reject_nums:
                problems.append(
                    f"S{sid} 含 REJECT 但 REJECT 所在要素值与⑥验收证据引用均未引用问题编号（须如「问题1」），无法三方关联"
                )
    found, rows = parse_rework_table(text)
    valid_rows = [r for r in rows if not r["problems"]]
    for r in rows:
        problems.extend(r["problems"])
    # P1-2：返工行须被步骤⑥引用（编号级），未被引用的行不构成有效关联
    for r in valid_rows:
        if r["num"] is None or r["num"] not in referenced_nums:
            problems.append(f"返工行「{r['problem']}」未被任何步骤⑥验收记录引用（编号级三方关联缺失）")
    # P1-2：REJECT 引用的每个问题编号都须有对应有效返工行，无关行不能替代
    for num in sorted(reject_nums):
        if not any(r["num"] == num for r in valid_rows):
            problems.append(f"REJECT 关联的「问题{num}」无有效返工记录行（问题编号+修复 commit 40 位 SHA）")
    if not found and reject_steps:
        problems.append(f"步骤 {'、'.join(reject_steps)} 含 REJECT 结论但未找到返工记录表（表头须含「问题编号」）")
    if problems:
        item.problems = problems
        item.status = STATUS_FAIL
    elif found:
        # 表存在（有效行或暂无行且均关联）：记录结构就绪即 PASS
        item.steps = [r["problem"] for r in valid_rows]
        item.status = STATUS_PASS
    elif read_phase(task_dir).phase == PHASE_COMPLETED:
        # COMPLETED 且无 REJECT、无返工表：零返工空满足 PASS（保证整体 PASS 可达）
        item.status = STATUS_PASS
    else:
        item.problems = ["无 REJECT 结论且无返工记录表（无返工发生，开发期未到期）"]
        item.status = STATUS_NA
    return item


def check_rework_limit(task_dir: Path) -> ItemResult:
    """⑤返工次数：按返工记录表同编号有效行计数，第 3 次允许通过、第 4 次及以后 FAIL；
    无表/无有效行时：COMPLETED 阶段=PASS（0 返工空满足），否则 N/A 未到期"""
    item = ItemResult(no=5, name=ITEM_NAMES[5])
    path = task_dir / "steps.md"
    if not path.is_file():
        item.status = STATUS_FAIL
        item.problems = ["steps.md 不存在，无法核验返工次数"]
        item.files = ["steps.md"]
        return item
    item.files = ["steps.md"]
    try:
        text = read_file_safe(path)
    except FileDecodeError as exc:
        item.status = STATUS_FAIL
        item.problems = [str(exc)]
        return item
    found, rows = parse_rework_table(text)
    valid_rows = [r for r in rows if not r["problems"] and r["problem"] and r["sha"]]
    # P1-3 整改（S2 首验 REJECT）：只计通过④编号级关联的行——行编号须被某步骤小节引用，
    # 未被引用的行不参与计数（其关联缺陷由④单独 FAIL，不静默）
    referenced_nums = set()
    for _, _, body in get_step_sections(text):
        referenced_nums.update(extract_problem_numbers(body))
    linked_rows = [r for r in valid_rows if r["num"] is not None and r["num"] in referenced_nums]
    if not found or not linked_rows:
        phase = read_phase(task_dir).phase
        if phase == PHASE_COMPLETED:
            item.status = STATUS_PASS
        else:
            item.problems = ["无已关联的有效返工记录行，返工次数未到期可计数"]
            item.status = STATUS_NA
        return item
    counts = Counter(r["num"] for r in linked_rows)
    over = sorted(n for n, c in counts.items() if c > REWORK_LIMIT)
    item.steps = [f"问题{n}×{c}" for n, c in sorted(counts.items())]
    if over:
        item.problems = [f"问题{n} 有效返工记录达 {counts[n]} 次（第 {REWORK_LIMIT + 1} 次及以后 FAIL，冻结口径 3）" for n in over]
        item.status = STATUS_FAIL
    else:
        item.status = STATUS_PASS
    return item


def check_delivery(task_dir: Path, phase: str) -> ItemResult:
    """⑥交付记录：COMPLETED 时 delivery.md 七要素必须齐全非空；其余阶段 N/A 未到期"""
    item = ItemResult(no=6, name=ITEM_NAMES[6])
    if phase != PHASE_COMPLETED:
        item.problems = [f"阶段={phase}，交付记录未到期（COMPLETED 时检查 delivery.md 七要素）"]
        item.status = STATUS_NA
        return item
    path = task_dir / "delivery.md"
    if not path.is_file():
        item.status = STATUS_FAIL
        item.problems = ["任务已完成但 delivery.md 不存在（七要素完工总结）"]
        item.files = ["delivery.md"]
        return item
    item.files = ["delivery.md"]
    try:
        text = read_file_safe(path)
    except FileDecodeError as exc:
        item.status = STATUS_FAIL
        item.problems = [str(exc)]
        return item
    lines = [ln for ln in text.split("\n")]
    problems = []
    for name in DELIVERY_ELEMENTS:
        value = None
        for i, ln in enumerate(lines):
            idx = ln.find(name)
            if idx < 0:
                continue
            rest = ln[idx + len(name):].strip().lstrip("：:#*- ").strip()
            if rest and not is_placeholder(rest):
                value = rest
                break
            # 标题行：向后找第一个非空内容行作为值
            for j in range(i + 1, min(i + 4, len(lines))):
                nxt = lines[j].strip().lstrip("#*- ").strip()
                if nxt:
                    value = nxt if not is_placeholder(nxt) else None
                    break
            break
        if value is None:
            problems.append(f"delivery.md 七要素缺失或为空: {name}")
        elif is_placeholder(value):
            problems.append(f"delivery.md 七要素「{name}」为占位符")
    if problems:
        item.problems = problems
        item.status = STATUS_FAIL
    else:
        item.status = STATUS_PASS
    return item


CHECK_FUNCS = (
    check_requirement,
    check_steps,
    check_step_acceptance,
    check_rework_records,
    check_rework_limit,
)

# 阶段常量（与 PHASE_MAP 值一致）
PHASE_COMPLETED = "COMPLETED"
PHASE_IN_PROGRESS = "IN_PROGRESS"
PHASE_PLANNING = "PLANNING"


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
        data = build_result(task_dir.name, PHASE_UNKNOWN, [], [],
                            [f"任务目录不存在: {task_dir}"], STATUS_FAIL)
        exit_code = 1
    else:
        phase_info = read_phase(task_dir)
        results = [fn(task_dir) for fn in CHECK_FUNCS[:5]]
        results.append(check_delivery(task_dir, phase_info.phase))
        overall, exit_code = summarize(results, phase_info.phase)
        data = build_result(task_dir.name, phase_info.phase, phase_info.problems,
                            results, [], overall)

    if args.json:
        print(json.dumps(data, ensure_ascii=False, indent=2))
    else:
        print(render_text(data))
    return exit_code


if __name__ == "__main__":
    # Windows 控制台默认 GBK：统一 UTF-8 输出，编码失败不静默
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except AttributeError:
        pass
    sys.exit(main(sys.argv[1:]))
