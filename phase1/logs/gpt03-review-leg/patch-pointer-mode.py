# -*- coding: utf-8 -*-
"""S2 前置：r2 简报 pointer 模式（charter §3/L-007；长材料走 GitHub 指针）。"""
p = "phase1/tools/review_leg.py"
s = open(p, encoding="utf-8").read()

OLD_R2 = '''    def r2_compose_brief(self, task: dict) -> str:
        patch = self.diff_file.read_text(encoding="utf-8", errors="replace")
        if len(patch.encode("utf-8")) > 950:
            raise OrchestrationError(2, f"diff patch {len(patch.encode('utf-8'))}B too large for inline brief "
                                        "(1200B outbound limit; pointer variant not in minimal leg scope)")
        ac_lines = "".join(f"\\n- {a}" for a in (task.get("acceptance_criteria") or [])[:4])
        brief = (
            f"【代码审查请求·GPT-03】{self.marker_text}\\n"
            f"任务{self.task_id} 审查commit={self.reviewed_commit}（仅此单提交）。\\n"
            f"验收标准：{ac_lines}\\n"
            f"--- diff（已核验 SHA，逐行审查）---\\n"
            f"{patch}\\n"
            "--- 回复格式：仅一个```json围栏对象："
            '{"result":"PASS|REWORK","summary":"<一句话>","issues":["<具体问题>…"],"reviewed_commit":"<原commit>"}'
            "；result 仅 PASS/REWORK；总回复<=600字。"
        )
        size = len(brief.encode("utf-8"))
        if size > OUTBOUND_LIMIT:
            raise OrchestrationError(2, f"brief {size}B exceeds {OUTBOUND_LIMIT}B hard limit (no truncation)")
        (self.run_dir / "brief.txt").write_text(brief, encoding="utf-8")
        self.ledger.append({"kind": "R2_BRIEF", "bytes": size, "limit": OUTBOUND_LIMIT,
                            "marker_text": self.marker_text, "outcome": "PASS"})
        return brief'''

NEW_R2 = '''    def r2_compose_brief(self, task: dict) -> str:
        """简报组装（≤1200B 硬限，不截断不拆分）。
        inline 模式：diff 内联（小 diff）；pointer 模式（charter §3/L-007）：diff+AC
        材料文件已入库，简报给 GitHub 裸域名指针（防 Composer 链接化，908 先例）+
        审查 commit，由审查方按基线 SHA 读文件。"""
        patch = self.diff_file.read_text(encoding="utf-8", errors="replace")
        reply_fmt = ('回复仅一个```json对象：{"result":"PASS|REWORK","summary":"<一句话>",'
                     '"issues":["<具体问题>…"],"reviewed_commit":"' + self.reviewed_commit + '"}'
                     '；result仅PASS/REWORK。')
        if self.brief_mode == "pointer":
            if not self.material_repo_path or not self.material_base_commit:
                raise OrchestrationError(2, "pointer mode requires --material-repo-path and "
                                            "--material-base-commit (material file must be pushed)")
            brief = (
                f"【代码审查请求·GPT-03】{self.marker_text}\\n"
                f"任务{self.task_id} 审查commit={self.reviewed_commit}（fixture分支单提交）。\\n"
                f"读仓库 github.com/damwate/AIEO（基线main={self.material_base_commit}）文件 "
                f"{self.material_repo_path}：含验收标准与diff全文（已核验SHA）。逐行审查后回复。\\n"
                f"{reply_fmt}"
            )
        else:
            if len(patch.encode("utf-8")) > 950:
                raise OrchestrationError(2, f"diff patch {len(patch.encode('utf-8'))}B too large for inline brief "
                                            "(1200B outbound limit; use --brief-mode pointer per L-007)")
            ac_lines = "".join(f"\\n- {a}" for a in (task.get("acceptance_criteria") or [])[:4])
            brief = (
                f"【代码审查请求·GPT-03】{self.marker_text}\\n"
                f"任务{self.task_id} 审查commit={self.reviewed_commit}（仅此单提交）。\\n"
                f"验收标准：{ac_lines}\\n"
                f"--- diff（已核验 SHA，逐行审查）---\\n"
                f"{patch}\\n"
                f"{reply_fmt}"
            )
        size = len(brief.encode("utf-8"))
        if size > OUTBOUND_LIMIT:
            raise OrchestrationError(2, f"brief {size}B exceeds {OUTBOUND_LIMIT}B hard limit (no truncation)")
        (self.run_dir / "brief.txt").write_text(brief, encoding="utf-8")
        self.ledger.append({"kind": "R2_BRIEF", "bytes": size, "limit": OUTBOUND_LIMIT,
                            "mode": self.brief_mode,
                            "marker_text": self.marker_text, "outcome": "PASS"})
        return brief'''

assert OLD_R2 in s, "r2 block not found"
s = s.replace(OLD_R2, NEW_R2, 1)

OLD_INIT = '''    def __init__(self, run_key: str, task_id: str, project_id: str, reviewed_commit: str,
                 diff_artifact_id: str, diff_file: Path, fixture_repo: Path,
                 m1_url: str, token: str, marker_text: str | None = None) -> None:'''
NEW_INIT = '''    def __init__(self, run_key: str, task_id: str, project_id: str, reviewed_commit: str,
                 diff_artifact_id: str, diff_file: Path, fixture_repo: Path,
                 m1_url: str, token: str, marker_text: str | None = None,
                 brief_mode: str = "inline", material_repo_path: str | None = None,
                 material_base_commit: str | None = None) -> None:'''
assert OLD_INIT in s, "init signature not found"
s = s.replace(OLD_INIT, NEW_INIT, 1)

OLD_MARK = '''        self.marker_text = marker_text or f"[GPT03-R1|{run_key}|{task_id}]"'''
NEW_MARK = '''        self.marker_text = marker_text or f"[GPT03-R1|{run_key}|{task_id}]"
        if brief_mode not in ("inline", "pointer"):
            raise OrchestrationError(-1, "brief_mode must be inline|pointer")
        self.brief_mode = brief_mode
        self.material_repo_path = material_repo_path
        self.material_base_commit = material_base_commit'''
assert OLD_MARK in s, "marker assign not found"
s = s.replace(OLD_MARK, NEW_MARK, 1)

OLD_CLI = '''        p.add_argument("--token-file", type=Path, default=RUNTIME_DIR / "service-tokens.json")
        p.add_argument("--marker-text", default=None)'''
NEW_CLI = '''        p.add_argument("--token-file", type=Path, default=RUNTIME_DIR / "service-tokens.json")
        p.add_argument("--marker-text", default=None)
        p.add_argument("--brief-mode", choices=["inline", "pointer"], default="inline")
        p.add_argument("--material-repo-path", default=None,
                       help="pointer mode: material file repo-relative path (must be pushed)")
        p.add_argument("--material-base-commit", default=None,
                       help="pointer mode: baseline main full SHA containing the material file")'''
assert OLD_CLI in s, "cli args not found"
s = s.replace(OLD_CLI, NEW_CLI, 1)

OLD_CONS = '''                    m1_url=args.m1_url, token=token, marker_text=args.marker_text)'''
NEW_CONS = '''                    m1_url=args.m1_url, token=token, marker_text=args.marker_text,
                    brief_mode=args.brief_mode, material_repo_path=args.material_repo_path,
                    material_base_commit=args.material_base_commit)'''
assert OLD_CONS in s, "leg construction not found"
s = s.replace(OLD_CONS, NEW_CONS, 1)

open(p, "w", encoding="utf-8", newline="\n").write(s)
print("pointer mode implemented (5 edits)")
