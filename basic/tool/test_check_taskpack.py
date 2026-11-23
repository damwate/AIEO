# -*- coding: utf-8 -*-
"""S3 unittest：正负例 + 11 类异常输入逐项断言 + JSON 一致性 + 异常可识别结果。
黑盒为主（subprocess 走 CLI 真实退出码），路径校验三规则直接调 validate_pack_path 单元验证。
仅标准库；运行：python -m unittest basic.tool.test_check_taskpack -v 或 python basic/tool/test_check_taskpack.py
"""
import hashlib
import re
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

TOOL = Path(__file__).resolve().parent / "check_taskpack.py"
sys.path.insert(0, str(TOOL.parent))
import check_taskpack as ct  # noqa: E402  （单元级直调：validate_pack_path 等）

SHA64 = hashlib.sha256(b"dispatch-reply-sample").hexdigest()  # 64 位 hex
SHA40 = "b" * 40
DISPATCH = "dispatch-2026-11-14T10-00-01"
EV_REL = "acceptance/s2-fixtures/evidence/probe.txt"

BRIEF_TMPL = """# 任务简报：b-20261114-s3-test

- **任务ID**：b-20261114-s3-test
- **需求原文**：测试用样例需求原文。
- **执行者理解**：按 Basic 流程产出记录文件。
- **验收目标**：check_taskpack 对本样例给出预期结论。
- **优先级**：普通
- **选定版本**：Basic 工作流 v0.2
- **任务等级**：S
- **选型理由**：结构化流程任务。

| 当前状态 | {status} |
| 当前步骤 | {step} |
| 最终结果 | （任务完成前暂空） |
"""

SIX_PASS = (
    "①本步骤目标：完成 S{n}。\n"
    "②修改文件：file{n}.md\n"
    "③修改内容：S{n} 实现内容。\n"
    "④执行结果：S{n} 执行完成。\n"
    "⑤测试结果：S{n} 冒烟通过。{extra}\n"
    "⑥验收证据引用：验收结论：{verdict}（{dispatch}，reply sha256={sha}）。证据包内路径 {ev}。\n"
)


def six_block(n=1, verdict="PASS", extra="", ev=EV_REL):
    return SIX_PASS.format(n=n, verdict=verdict, extra=extra, dispatch=DISPATCH,
                           sha=SHA64, ev=ev)


def rework_table(rows):
    lines = ["", "## 返工记录", "",
             "| 问题编号 | 问题 | 根因 | 修复 commit | 复验 |",
             "|---|---|---|---|---|"]
    for r in rows:
        lines.append(f"| 问题{r['num']} | {r['desc']} | {r['cause']} | `{r['sha']}` | {r['verify']} |")
    return "\n".join(lines) + "\n"


DELIVERY_OK = "\n".join(
    f"## {name}：{name}样例内容" for name in ct.DELIVERY_ELEMENTS
) + "\n"


class CLIBase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.base = Path(tempfile.mkdtemp(prefix="taskpack-s3-"))

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.base, ignore_errors=True)

    def make_task(self, name, status="开发中", step="S2 规则实现", steps=None,
                  delivery=None, brief=None, requirement="测试用样例需求原文。", files=None):
        d = self.base / name
        d.mkdir(parents=True, exist_ok=True)
        (d / "requirement.md").write_text(requirement + "\n", encoding="utf-8")
        (d / "task-brief.md").write_text(
            brief if brief is not None else BRIEF_TMPL.format(status=status, step=step),
            encoding="utf-8")
        if steps is not None:
            (d / "steps.md").write_text(steps, encoding="utf-8")
        if delivery is not None:
            (d / "delivery.md").write_text(delivery, encoding="utf-8")
        ev = d / EV_REL
        ev.parent.mkdir(parents=True, exist_ok=True)
        ev.write_text("证据样例\n", encoding="utf-8")
        for rel, content in (files or {}).items():
            fp = d / rel
            fp.parent.mkdir(parents=True, exist_ok=True)
            if isinstance(content, bytes):
                fp.write_bytes(content)
            else:
                fp.write_text(content, encoding="utf-8")
        return d

    def run_cli(self, task_path, json_mode=False, flags=()):
        argv = [sys.executable, "-I", str(TOOL), str(task_path), *flags]
        if json_mode:
            argv.append("--json")
        r = subprocess.run(argv, capture_output=True, text=True,
                           encoding="utf-8", errors="replace", timeout=60)
        self.assertNotIn("Traceback", r.stdout + r.stderr,
                         f"未捕获异常:\n{r.stdout}\n{r.stderr}")
        return r.stdout, r.returncode

    @staticmethod
    def statuses(text):
        seq = []
        for line in text.splitlines():
            s = line.strip()
            if s.startswith("[PASS]"):
                seq.append("PASS")
            elif s.startswith("[FAIL]"):
                seq.append("FAIL")
            elif s.startswith("[N/A]"):
                seq.append("N/A")
        return seq

    @staticmethod
    def item_status(text, no):
        marks = {1: "①", 2: "②", 3: "③", 4: "④", 5: "⑤", 6: "⑥"}
        for line in text.splitlines():
            m = re.match(r"^\[(PASS|FAIL|N/A)\]\s+([①②③④⑤⑥])", line.strip())
            if m and m.group(2) == marks[no]:
                return m.group(1)
        return None

    def assertOverall(self, text, expected):
        self.assertIn(f"Overall: {expected}", text)


class TestPositive(CLIBase):
    def test_completed_pack_all_pass(self):
        """正例：COMPLETED 完整任务包 → 六项全 PASS exit=0（④⑤ 无返工空满足）"""
        steps = "# 步骤清单：t\n\n## 拍板方案要点\n\n要点。\n\n## S1 骨架\n" + six_block(1)
        d = self.make_task("good", status="完成", step="S1 骨架", steps=steps,
                           delivery=DELIVERY_OK)
        out, code = self.run_cli(d)
        self.assertEqual(self.statuses(out), ["PASS"] * 6)
        self.assertEqual(code, 0)
        self.assertOverall(out, "PASS")

    def test_in_progress_own_pack_shape(self):
        """正例：IN_PROGRESS 当前=S2，S1 完整 PASS → ③ N/A 未到期，整体 IN_PROGRESS exit=1"""
        steps = "# 步骤清单：t\n\n## S1 骨架\n" + six_block(1) + "\n## S2 规则实现\n" + six_block(2)
        d = self.make_task("inprog", steps=steps)
        out, code = self.run_cli(d)
        self.assertEqual(self.item_status(out, 3), "N/A")
        self.assertEqual(code, 1)
        self.assertOverall(out, "IN_PROGRESS")


class TestPhaseBoundary(CLIBase):
    def test_planning_all_na_even_with_prefilled_pass(self):
        """P1-1 回归：PLANNING 预填完整 PASS 记录 → ③ 全 N/A 不提前 PASS"""
        steps = "# 步骤清单：t\n\n## S1 骨架\n" + six_block(1)
        d = self.make_task("planning", status="待规划", step="S1 骨架（待开工）", steps=steps)
        out, _ = self.run_cli(d)
        self.assertEqual(self.item_status(out, 3), "N/A")
        self.assertIn("未到期", out)

    def test_in_progress_not_due_steps_na(self):
        """P1-1 回归：IN_PROGRESS 当前=S2，S2/S3 预填完整 PASS 记录 → N/A（编号>=当前）"""
        steps = ("# 步骤清单：t\n\n## S1 骨架\n" + six_block(1)
                 + "\n## S2 规则实现\n" + six_block(2)
                 + "\n## S3 交付\n" + six_block(3))
        d = self.make_task("boundary", steps=steps)
        out, _ = self.run_cli(d)
        self.assertEqual(self.item_status(out, 3), "N/A")
        self.assertIn("1 步记录完整 PASS", out)
        self.assertIn("未到期", out)

    def test_current_step_unresolvable_is_fail_not_guess(self):
        """当前步骤解析不出 S 编号 → ③ FAIL 不猜"""
        steps = "# 步骤清单：t\n\n## S1 骨架\n" + six_block(1)
        d = self.make_task("nocur", step="尚未排定", steps=steps)
        out, code = self.run_cli(d)
        self.assertEqual(self.item_status(out, 3), "FAIL")
        self.assertIn("无法解析出 S 编号", out)
        self.assertIn("不猜", out)
        self.assertEqual(code, 1)

    def test_illegal_phase_is_unknown_fail(self):
        """非法阶段值（不在映射表）→ ①③ FAIL 可识别原因，不猜阶段"""
        steps = "# 步骤清单：t\n\n## S1 骨架\n" + six_block(1)
        d = self.make_task("badphase", status="挂起中", steps=steps)
        out, code = self.run_cli(d)
        self.assertEqual(self.item_status(out, 1), "FAIL")
        self.assertEqual(self.item_status(out, 3), "FAIL")
        self.assertIn("非法值", out)
        self.assertEqual(code, 1)


class TestEvidencePath(CLIBase):
    def test_unit_relative_ok(self):
        self.assertIsNone(ct.validate_pack_path(self.base, "acceptance/x/probe.txt") if False else None)
        d = self.make_task("unitrel")
        self.assertIsNone(ct.validate_pack_path(d, EV_REL))

    def test_unit_traversal_rejected(self):
        d = self.make_task("unitdotdot")
        problem = ct.validate_pack_path(d, "acceptance/../../outside.txt")
        self.assertIsNotNone(problem)
        self.assertIn("穿越", problem)

    def test_unit_absolute_rejected(self):
        d = self.make_task("unitabs")
        problem = ct.validate_pack_path(d, "C:/Windows/notepad.exe")
        self.assertIsNotNone(problem)
        self.assertIn("绝对路径", problem)

    def test_unit_symlink_escape_rejected(self):
        d = self.make_task("unitsym")
        outside = self.base / "outside-secret.txt"
        outside.write_text("secret", encoding="utf-8")
        link = d / "acceptance" / "s2-fixtures" / "evidence" / "link.txt"
        try:
            os.symlink(outside, link)
        except (OSError, NotImplementedError):
            self.skipTest("当前环境无符号链接权限（Windows 非开发者模式）")
        problem = ct.validate_pack_path(d, "acceptance/s2-fixtures/evidence/link.txt")
        os.remove(link)
        self.assertIsNotNone(problem)
        self.assertIn("越出任务目录", problem)

    def test_cli_missing_evidence_file_fails(self):
        """⑥引用包内路径不存在 → ③ FAIL"""
        steps = "# 步骤清单：t\n\n## S1 骨架\n" + six_block(1, ev="acceptance/s2-fixtures/evidence/absent.txt")
        d = self.make_task("missingev", steps=steps)
        (d / EV_REL).unlink()
        out, code = self.run_cli(d)
        self.assertEqual(self.item_status(out, 3), "FAIL")
        self.assertIn("证据路径不存在", out)
        self.assertEqual(code, 1)

    def test_cli_traversal_in_evidence_fails(self):
        """⑥引用 acceptance/../ 穿越 → ③ FAIL"""
        steps = "# 步骤清单：t\n\n## S1 骨架\n" + six_block(1, ev="acceptance/../outside.txt")
        d = self.make_task("evdotdot", steps=steps)
        out, code = self.run_cli(d)
        self.assertEqual(self.item_status(out, 3), "FAIL")
        self.assertIn("穿越", out)
        self.assertEqual(code, 1)


class TestMissingBrokenFiles(CLIBase):
    def test_missing_requirement(self):
        d = self.make_task("noreq")
        (d / "requirement.md").unlink()
        out, code = self.run_cli(d)
        self.assertEqual(self.item_status(out, 1), "FAIL")
        self.assertIn("requirement.md 不存在", out)
        self.assertEqual(code, 1)

    def test_missing_brief(self):
        d = self.make_task("nobrief")
        (d / "task-brief.md").unlink()
        out, code = self.run_cli(d)
        self.assertEqual(self.item_status(out, 1), "FAIL")
        self.assertIn("task-brief.md 不存在", out)
        self.assertEqual(code, 1)

    def test_missing_steps(self):
        d = self.make_task("nosteps", steps="占位")
        (d / "steps.md").unlink()
        out, code = self.run_cli(d)
        self.assertEqual(self.item_status(out, 3), "FAIL")
        self.assertIn("steps.md 不存在", out)
        self.assertEqual(code, 1)

    def test_empty_requirement(self):
        d = self.make_task("emptyreq", requirement="")
        out, code = self.run_cli(d)
        self.assertEqual(self.item_status(out, 1), "FAIL")
        self.assertIn("内容为空", out)
        self.assertEqual(code, 1)

    def test_invalid_encoding_is_identifiable(self):
        """编码异常（无效 UTF-8 字节）→ 对应项 FAIL 可识别，不抛未捕获异常"""
        d = self.make_task("badenc")
        (d / "steps.md").write_bytes(b"\xff\xfe\xfa\x01S1 bad bytes")
        out, code = self.run_cli(d)
        self.assertEqual(self.item_status(out, 3), "FAIL")
        self.assertEqual(code, 1)

    def test_placeholder_requirement(self):
        d = self.make_task("phreq", requirement="待填写")
        out, code = self.run_cli(d)
        self.assertEqual(self.item_status(out, 1), "FAIL")
        self.assertIn("占位符", out)
        self.assertEqual(code, 1)


class TestDuplicates(CLIBase):
    def test_duplicate_brief_field(self):
        """task-brief 重复字段行（两个「任务ID」）→ ① FAIL+可识别重复原因，不因未到期项掩盖"""
        brief = BRIEF_TMPL.format(status="开发中", step="S2 规则实现")
        brief += "| 任务ID | b-20261114-s3-test-dup |\n"
        steps = "# 步骤清单：t\n\n## S1 骨架\n" + six_block(1)
        d = self.make_task("dupfield", brief=brief, steps=steps)
        out, code = self.run_cli(d)
        self.assertEqual(self.item_status(out, 1), "FAIL")
        self.assertIn("重复", out)
        self.assertIn("任务ID", out)
        self.assertNotIn("Overall: PASS", out)
        self.assertEqual(code, 1)

    def test_duplicate_brief_field_cross_format(self):
        """跨格式重复字段（表格行+标题形式「任务ID」，无行内）→ ① FAIL+重复原因；
        旧计数函数只统计表格+行内时此场景计数=1 漏判（复验R1 P1-1：计数须覆盖
        extract_brief_field 支持的全部三种书写形式）"""
        brief = BRIEF_TMPL.format(status="开发中", step="S2 规则实现")
        brief = brief.replace("- **任务ID**：b-20261114-s3-test\n", "| 任务ID | b-20261114-s3-test |\n")
        brief += "\n## 任务ID\nb-20261114-s3-test-dup2\n"
        steps = "# 步骤清单：t\n\n## S1 骨架\n" + six_block(1)
        d = self.make_task("dupcross", brief=brief, steps=steps)
        out, code = self.run_cli(d)
        self.assertEqual(self.item_status(out, 1), "FAIL")
        self.assertIn("重复", out)
        self.assertIn("任务ID", out)
        self.assertNotIn("Overall: PASS", out)
        self.assertEqual(code, 1)

    def test_duplicate_step_number(self):
        """steps.md 重复步骤编号（两个 S1 小节）→ ② FAIL+可识别重复编号原因，不静默接受"""
        steps = ("# 步骤清单：t\n\n## S1 骨架\n" + six_block(1)
                 + "\n## S1 重复小节\n" + six_block(1) + "\n## S2 规则实现\n" + six_block(2))
        d = self.make_task("dupstep", steps=steps)
        out, code = self.run_cli(d)
        self.assertEqual(self.item_status(out, 2), "FAIL")
        self.assertIn("重复", out)
        self.assertIn("S1", out)
        self.assertNotIn("Overall: PASS", out)
        self.assertEqual(code, 1)


class TestRecordStepMismatch(CLIBase):
    def test_step_missing_six_elements(self):
        """记录与步骤不对应：小节缺六要素 → ③ FAIL 列缺失要素"""
        steps = "# 步骤清单：t\n\n## S1 骨架\n只有一句话，没有六要素。\n## S2 规则实现\n" + six_block(2)
        d = self.make_task("misssix", steps=steps)
        out, code = self.run_cli(d)
        self.assertEqual(self.item_status(out, 3), "FAIL")
        self.assertIn("六要素缺失", out)
        self.assertEqual(code, 1)

    def test_six_element_placeholder(self):
        steps = "# 步骤清单：t\n\n## S1 骨架\n" + six_block(1, extra="").replace(
            "①本步骤目标：完成 S1。", "①本步骤目标：TODO")
        d = self.make_task("phsix", steps=steps)
        out, code = self.run_cli(d)
        self.assertEqual(self.item_status(out, 3), "FAIL")
        self.assertIn("占位符", out)
        self.assertEqual(code, 1)

    def test_missing_dispatch_or_sha_in_ev(self):
        """⑥缺 dispatch 目录或 reply SHA256 → ③ FAIL"""
        bad1 = six_block(1).replace(DISPATCH, "验收会话")
        steps = "# 步骤清单：t\n\n## S1 骨架\n" + bad1
        d = self.make_task("nodisp", steps=steps)
        out, _ = self.run_cli(d)
        self.assertIn("dispatch 目录", out)
        bad2 = six_block(1).replace(SHA64, "短哈希abc123")
        steps2 = "# 步骤清单：t\n\n## S1 骨架\n" + bad2
        d2 = self.make_task("nosha", steps=steps2)
        out2, _ = self.run_cli(d2)
        self.assertIn("reply SHA256", out2)


class TestRework(CLIBase):
    ROW = {"num": 1, "desc": "样例缺陷", "cause": "样例根因", "sha": SHA40, "verify": "PASS"}

    def test_rework_3_times_pass(self):
        """第 3 次返工：允许（冻结口径 3）→ ⑤ PASS"""
        rows = [dict(self.ROW, verify=v) for v in ("R1 PASS", "R2 PASS", "R3 PASS")]
        steps = ("# 步骤清单：t\n\n## S1 骨架\n" + six_block(1, extra="（问题1 返工 3 次）")
                 + rework_table(rows))
        d = self.make_task("rw3", steps=steps)
        out, code = self.run_cli(d)
        self.assertEqual(self.item_status(out, 4), "PASS")
        self.assertEqual(self.item_status(out, 5), "PASS")
        jout, _ = self.run_cli(d, json_mode=True)
        item5 = next(i for i in json.loads(jout)["items"] if i["no"] == 5)
        self.assertEqual(item5["steps"], ["问题1×3"])

    def test_rework_4_times_fail(self):
        """第 4 次及以后：⑤ FAIL"""
        rows = [dict(self.ROW, verify=v) for v in ("R1 PASS", "R2 PASS", "R3 PASS", "R4 PASS")]
        steps = ("# 步骤清单：t\n\n## S1 骨架\n" + six_block(1, extra="（问题1 返工 4 次）")
                 + rework_table(rows))
        d = self.make_task("rw4", steps=steps)
        out, code = self.run_cli(d)
        self.assertEqual(self.item_status(out, 4), "PASS")
        self.assertEqual(self.item_status(out, 5), "FAIL")
        self.assertIn("达 4 次", out)
        self.assertEqual(code, 1)

    def test_rework_row_unreferenced(self):
        """返工行未被任何步骤小节引用 → ④ FAIL（编号级关联缺失）"""
        rows = [dict(self.ROW)]
        steps = "# 步骤清单：t\n\n## S1 骨架\n" + six_block(1) + rework_table(rows)
        d = self.make_task("rwunref", steps=steps)
        out, code = self.run_cli(d)
        self.assertEqual(self.item_status(out, 4), "FAIL")
        self.assertIn("未被任何步骤", out)
        self.assertEqual(code, 1)

    def test_reject_without_number_fails(self):
        """R2 反例回归：④ 含 REJECT 无编号，其他要素提及问题1，表有问题1行 → ④ FAIL"""
        rows = [dict(self.ROW)]
        s2 = six_block(2, verdict="REJECT")
        s2 = s2.replace("⑤测试结果：S2 冒烟通过。", "⑤测试结果：S2 冒烟通过。问题1 修复验证通过。")
        steps = ("# 步骤清单：t\n\n## S1 骨架\n" + six_block(1)
                 + "\n## S2 规则实现\n" + s2 + rework_table(rows))
        d = self.make_task("rejnonum", steps=steps)
        out, code = self.run_cli(d)
        self.assertEqual(self.item_status(out, 4), "FAIL")
        self.assertIn("REJECT 所在要素值与⑥验收证据引用均未引用问题编号", out)
        self.assertEqual(self.item_status(out, 5), "PASS")
        self.assertEqual(code, 1)


class TestStartup(CLIBase):
    def pack(self, name, *, version="Basic", skill="basic", lesson="L-018",
             action="记录本轮 user unit，断言不重发"):
        text = BRIEF_TMPL.format(status="待规划", step="S1")
        text = text.replace("Basic 工作流 v0.2", version)
        record = (
            f"\n## 开工核对\n- 已读技能：`.github/skills/aieo-{skill}/SKILL.md`\n"
            f"| 已读经验 | 本任务的防错动作或验收断言 |\n|---|---|\n| {lesson} | {action} |\n"
        )
        return self.make_task(name, brief=text + record)

    def test_startup_only_allows_both_versions_before_steps_exist(self):
        for version in ("Basic", "Standard"):
            with self.subTest(version=version):
                task = self.pack(version, version=version, skill=version.lower(), action="断言占额 <= 3")
                out, code = self.run_cli(task, json_mode=True, flags=("--startup",))
                data = json.loads(out)
                self.assertEqual(code, 0)
                self.assertEqual(data["startup"]["status"], "PASS")
                self.assertEqual(data["items"], [])

    def test_missing_section_fails_explicit_startup_and_acceptance(self):
        task = self.make_task("missing-startup", status="完成", steps="## S1 交付\n" + six_block(),
                              delivery=DELIVERY_OK)
        self.assertEqual(self.run_cli(task)[1], 0)
        for mode in ("--startup", "--require-startup"):
            out, code = self.run_cli(task, flags=(mode,))
            self.assertEqual(code, 1)
            self.assertIn("缺少「## 开工核对」", out)

    def test_check_identifies_wrong_skill_fake_lesson_and_empty_action(self):
        task = self.pack("wrong-everything", version="Standard", lesson="L-999", action="已读。")
        for mode in ("--startup", None):
            out, code = self.run_cli(task, flags=(mode,) if mode else ())
            self.assertEqual(code, 1)
            self.assertIn("与选定版本一致", out)
            self.assertIn("开发经验库没有 L-999", out)
            self.assertIn("缺少本任务可检查的防错动作", out)

    def test_no_match_can_record_search_and_action(self):
        brief = BRIEF_TMPL.format(status="待规划", step="S1") + (
            "\n## 开工核对\n- 已读技能：.github/skills/aieo-basic/SKILL.md\n"
            "- 未命中关键词：前端键盘焦点\n- 本次防错动作：验证 Tab 键顺序\n"
        )
        task = self.make_task("no-lesson", brief=brief)
        self.assertEqual(self.run_cli(task, flags=("--startup",))[1], 0)


class TestJsonConsistency(CLIBase):
    def assert_json_matches_text(self, d):
        text, code = self.run_cli(d)
        jout, jcode = self.run_cli(d, json_mode=True)
        data = json.loads(jout)
        self.assertEqual(self.statuses(text), [i["status"] for i in sorted(data["items"], key=lambda x: x["no"])])
        self.assertEqual(code, jcode)
        self.assertEqual((data["overall"] == "PASS"), (jcode == 0))
        return data

    def test_json_matches_text_completed(self):
        steps = "# 步骤清单：t\n\n## S1 骨架\n" + six_block(1)
        d = self.make_task("jgood", status="完成", step="S1 骨架", steps=steps,
                           delivery=DELIVERY_OK)
        data = self.assert_json_matches_text(d)
        self.assertEqual(data["overall"], "PASS")

    def test_json_matches_text_rework4(self):
        rows = [dict(TestRework.ROW, verify=v) for v in ("R1", "R2", "R3", "R4")]
        steps = ("# 步骤清单：t\n\n## S1 骨架\n" + six_block(1, extra="（问题1 返工 4 次）")
                 + rework_table(rows))
        d = self.make_task("jrw4", steps=steps)
        data = self.assert_json_matches_text(d)
        item5 = next(i for i in data["items"] if i["no"] == 5)
        self.assertEqual(item5["status"], "FAIL")

    def test_json_missing_dir(self):
        """目录不存在：文本与 JSON 判定一致（P2-1 补第三场景对照）+JSON phase=UNKNOWN、
        问题可识别、exit=1"""
        data = self.assert_json_matches_text(self.base / "does-not-exist")
        self.assertEqual(data["phase"], "UNKNOWN")
        self.assertEqual(data["overall"], "FAIL")
        self.assertTrue(any("不存在" in p for p in data["problems"]))


class TestIdentifiableResults(CLIBase):
    """异常输入产生可识别结果：exit!=0、stdout 含 FAIL/问题文本，绝不静默跳过或错误 PASS"""

    def test_all_abnormal_inputs_identifiable(self):
        cases = []
        d = self.make_task("id_noreq"); (d / "requirement.md").unlink(); cases.append(d)
        d = self.make_task("id_emptyreq", requirement=""); cases.append(d)
        d = self.make_task("id_badphase", status="外星阶段"); cases.append(d)
        d = self.make_task("id_nosteps", steps="占位"); (d / "steps.md").unlink(); cases.append(d)
        d = self.make_task("id_badbytes")
        (d / "task-brief.md").write_bytes(b"\x00\xff\xfebroken"); cases.append(d)
        d = self.make_task("id_traversal",
                           steps="# 步骤清单：t\n\n## S1 骨架\n" + six_block(1, ev="acceptance/../../x"))
        cases.append(d)
        for d in cases:
            with self.subTest(task=d.name):
                out, code = self.run_cli(d)
                self.assertEqual(code, 1)
                self.assertIn("FAIL", out)
                self.assertGreater(len(out.strip()), 0)

    def test_directory_not_exist(self):
        out, code = self.run_cli(self.base / "missing-dir")
        self.assertEqual(code, 1)
        self.assertIn("任务目录不存在", out)


if __name__ == "__main__":
    unittest.main(verbosity=2)
