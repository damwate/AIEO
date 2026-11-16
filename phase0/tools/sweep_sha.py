# 全量 SHA 规整：把交付文档中所有"可唯一解析的短 commit SHA"补成完整 40 位
# 规则：只替换独立的十六进制 token（7..39 位）；跳过日期、DEC/ST/R 编号、UUID 片段、回复 sha256 片段（无法从 git 解析者）
import re
import subprocess
import pathlib
import sys

ROOT = pathlib.Path(r"d:/AIEO")
FILES = [
    ROOT / "basic/tasks/b-20261116-workspace-spec/delivery.md",
    ROOT / "basic/tasks/b-20261116-workspace-spec/steps.md",
    ROOT / "basic/tasks/b-20261116-workspace-spec/task-brief.md",
]

out = subprocess.run(["git", "rev-list", "--all"], cwd=ROOT, capture_output=True, text=True, check=True)
commits = [c.strip() for c in out.stdout.splitlines() if re.fullmatch(r"[0-9a-f]{40}", c.strip())]
prefix = {}
for c in commits:
    for n in (7, 8, 9, 10, 11, 12):
        prefix.setdefault(c[:n], set()).add(c)

TOKEN = re.compile(r"(?<![0-9a-fA-F])[0-9a-f]{7,39}(?![0-9a-fA-F])")

unresolved = []
changed_total = 0

for f in FILES:
    text = f.read_text(encoding="utf-8")
    orig = text
    for m in list(TOKEN.finditer(text)):
        tok = m.group(0)
        if tok.startswith("2026"):
            continue
        # UUID 片段（后接 -xxxx 形态）跳过
        tail = text[m.end():m.end() + 5]
        if re.match(r"-[0-9a-f]{4}-", tail) or re.match(r"-[0-9a-f]{4}$", tail):
            continue
        cands = prefix.get(tok)
        if cands and len(cands) == 1:
            full = next(iter(cands))
            text = text[:m.start()] + full + text[m.end():]
            changed_total += 1
        else:
            unresolved.append((f.name, tok, len(cands) if cands else 0))

    if text != orig:
        f.write_text(text, encoding="utf-8", newline="\n")

print("replaced:", changed_total)
for name, tok, n in unresolved:
    print("UNRESOLVED", name, tok, "matches", n)
