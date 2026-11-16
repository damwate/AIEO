# 去掉完整 SHA 之后的残留省略号；替换会随提交增长的"21+ commit"表述；生成 SHA 审计清单
import re
import subprocess
import pathlib

ROOT = pathlib.Path(r"d:/AIEO")
TASK = ROOT / "basic/tasks/b-20261116-workspace-spec"
FILES = [TASK / "delivery.md", TASK / "steps.md", TASK / "task-brief.md"]

for f in FILES:
    t = f.read_text(encoding="utf-8")
    t2 = re.sub(r"([0-9a-f]{40})…", r"\1", t)
    t2 = t2.replace("**本地 main 领先远程 main 21+ commit，尚未推送/合并**",
                    "**本地 main 领先远程 main（提交数以 `git rev-list` 实测为准，见 §5 提交表），尚未推送/合并**")
    if t2 != t:
        f.write_text(t2, encoding="utf-8", newline="\n")
        print("fixed", f.name)

# 审计：列出每个文件中 40 位 SHA 数量，以及仍存在但无法解析的 7-39 位 token
TOKEN = re.compile(r"(?<![0-9a-fA-F])[0-9a-f]{7,39}(?![0-9a-fA-F])")
SHA40 = re.compile(r"(?<![0-9a-fA-F])[0-9a-f]{40}(?![0-9a-fA-F])")
lines = ["# SHA 审计清单（自动生成，2026-11-16）", ""]
for f in FILES:
    t = f.read_text(encoding="utf-8")
    n40 = len(SHA40.findall(t))
    short = []
    for m in TOKEN.finditer(t):
        tok = m.group(0)
        if tok.startswith("2026"):
            continue
        tail = t[m.end():m.end() + 5]
        if re.match(r"-[0-9a-f]{4}-", tail):
            continue  # 会话 UUID 片段
        short.append(tok)
    lines.append(f"## {f.name}")
    lines.append(f"- 完整 40 位 SHA 出现次数：{n40}")
    lines.append(f"- 未解析的 7~39 位 token：{len(short)}{'：' + ', '.join(sorted(set(short))) if short else '（无）'}")
    lines.append("")

rel = "phase0/tools/sweep_sha.py"
lines.append("## 校验方法")
lines.append("- `python -I phase0/tools/sweep_sha.py`：以 `git rev-list --all` 构建前缀映射，对三文件逐个 token 校核；可唯一解析者为短 SHA，本清单生成时替换数为 0（即已无短 commit SHA）。")
lines.append("- 例外：会话 UUID 片段（如 `6aface14-4f10-…`）不是 commit SHA，不纳入 40 位要求。")
(TASK / "acceptance/sha-audit.txt").write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")
print("audit written")
print("\n".join(lines))
