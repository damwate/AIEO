#!/usr/bin/env python
"""全量 SHA 审计：把交付文档中所有"可唯一解析的短 commit SHA"补成完整 40 位，
并自动生成 acceptance/sha-audit.txt（统计、未解析项、例外分类）。

用法：python -I phase0/tools/sweep_sha.py [--check]
  --check  只核对不修改（用于证据复跑）
退出码：0=无未解析项；2=存在未解析的非 UUID 片段。
"""
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]  # phase0/tools/sweep_sha.py -> 仓库根
TASK = ROOT / "basic/tasks/b-20261116-workspace-spec"
FILES = [TASK / "delivery.md", TASK / "steps.md", TASK / "task-brief.md"]
CHECK_ONLY = "--check" in sys.argv

out = subprocess.run(["git", "rev-list", "--all"], cwd=ROOT, capture_output=True, text=True, check=True)
commits = sorted({c.strip() for c in out.stdout.splitlines() if re.fullmatch(r"[0-9a-f]{40}", c.strip())})
# 7~39 位前缀全部入映射，覆盖审计声称的全部范围
prefix = {}
for c in commits:
    for n in range(7, 40):
        prefix.setdefault(c[:n], set()).add(c)

TOKEN = re.compile(r"(?<![0-9a-fA-F])[0-9a-f]{7,39}(?![0-9a-fA-F])")

report = ["# SHA 审计清单（由 phase0/tools/sweep_sha.py 自动生成）", ""]
report.append(f"- 仓库根：{ROOT}")
report.append(f"- git rev-list --all 提交数：{len(commits)}（前缀映射覆盖 7~39 位）")
report.append(f"- 运行模式：{'--check（只核对不修改）' if CHECK_ONLY else '全量核规整'}")
report.append("")

replaced_total = 0
unresolved = []   # (file, lineno, token, 类别)

for f in FILES:
    text = f.read_text(encoding="utf-8")
    n40 = len(re.findall(r"(?<![0-9a-fA-F])[0-9a-f]{40}(?![0-9a-fA-F])", text))
    file_replaced = 0
    file_unresolved = []
    for i, line in enumerate(text.splitlines(), 1):
        for m in list(TOKEN.finditer(line)):
            tok = m.group(0)
            if tok.startswith("2026"):
                cat = "日期（20261116）"
                unresolved.append((f.name, i, tok, cat))
                file_unresolved.append((tok, cat))
                continue
            tail = line[m.end():m.end() + 5]
            if re.match(r"-[0-9a-f]{4}-", tail):
                cat = "会话 UUID 片段（完整 UUID 含连字符分段，非 commit）"
                unresolved.append((f.name, i, tok, cat))
                file_unresolved.append((tok, cat))
                continue
            cands = prefix.get(tok)
            if cands and len(cands) == 1:
                if not CHECK_ONLY:
                    full = next(iter(cands))
                    # 在整文中按行内偏移替换（避免跨行偏移失效，逐行重建）
                    line = line[:m.start()] + full + line[m.end():]
                    file_replaced += 1
            else:
                cat = "未知（既非日期/UUID，也无法由 git 前缀映射唯一解析）"
                unresolved.append((f.name, i, tok, cat))
                file_unresolved.append((tok, cat))
    if file_replaced:
        text = "\n".join(
            new_line if not isinstance(new_line, str) else new_line
            for new_line in [None]
        )  # placeholder，不使用
    report.append(f"## {f.name}")
    report.append(f"- 完整 40 位 commit SHA 出现次数：{n40}")
    report.append(f"- 本文件修正的短 SHA 数：{file_replaced}")
    report.append(f"- 未解析 token（全部带类别）：{len(file_unresolved)}")
    for tok, cat in file_unresolved:
        report.append(f"  - `{tok}`：{cat}")
    report.append("")

# 上面逐行替换未落盘（避免行内偏移跨行失效），这里统一做一次整文替换并落盘
if not CHECK_ONLY:
    changed_total = 0
    for f in FILES:
        text = f.read_text(encoding="utf-8")

        def _sub(m):
            global changed_total
            tok = m.group(0)
            cands = prefix.get(tok)
            if cands and len(cands) == 1:
                changed_total += 1
                return next(iter(cands))
            return tok

        new_text = TOKEN.sub(_sub, text)
        if new_text != text:
            f.write_text(new_text, encoding="utf-8", newline="\n")
    report.append(f"- 全文替换数：{changed_total}")
else:
    report.append("- 全文替换数：0（--check 模式）")

bad = [u for u in unresolved if "UUID" not in u[3] and "日期" not in u[3]]
report.append("## 结论")
report.append(f"- 未解析的非 UUID/非日期片段：{len(bad)} 处（0=审计通过）")

(TASK / "acceptance/sha-audit.txt").write_text("\n".join(report) + "\n", encoding="utf-8", newline="\n")
print("\n".join(report))
if bad:
    sys.exit(2)
