#!/usr/bin/env python
"""全量 SHA 审计（R21 版，fail-closed）：扫描交付文档中全部 7~39 位十六进制 token，
按独立、严格的格式规则分类，唯一命中的短 commit SHA 补成完整 40 位，
自动生成 acceptance/sha-audit.txt；任何未知项使退出码非零。

用法（在仓库根执行）：
  python -I -X utf8 phase0/tools/sweep_sha.py            # 全量规整+生成清单
  python -I -X utf8 phase0/tools/sweep_sha.py --check    # 只核对不修改
  python -I -X utf8 phase0/tools/sweep_sha.py --selftest # 负向测试（临时副本，不动真实文件）

分类规则（互斥、依序判定，全部基于格式与 git 前缀映射，不依赖分类文字字符串包含）：
  1. UUID 片段：token 向两侧扩展 [0-9a-f-] 得到完整连字 run，run 整体命中
     8-4-4-4-12 UUID 格式 → 会话 UUID 片段（例外，不判失败）。
  2. 日期：token 为 8 位数字且是合法日历日期 → 日期（例外，不判失败）。
     若同时命中 git 前缀映射 → 歧义（判失败，fail-closed）。
  3. 短 commit SHA：git 前缀映射唯一命中（1 个 commit）→ 就地补成 40 位。
  4. 未知：其余一切（映射 0 命中或多命中、UUID/日期歧义、SHA256 截断片段等
     无法与 commit 前缀按格式区分者）→ 全部计入未知，退出码 2（fail-closed）。

退出码：0=无未知项（审计通过）；2=存在未知项；负向自测失败时以 3 退出。
"""
import re
import subprocess
import sys
import tempfile
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]  # phase0/tools/sweep_sha.py -> 仓库根
TASK = ROOT / "basic/tasks/b-20261116-workspace-spec"
FILES = [TASK / "delivery.md", TASK / "steps.md", TASK / "task-brief.md"]

TOKEN = re.compile(r"(?<![0-9a-fA-F])[0-9a-f]{7,39}(?![0-9a-fA-F])")
FULL40 = re.compile(r"(?<![0-9a-fA-F])[0-9a-f]{40}(?![0-9a-fA-F])")
UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
HEXPART_CHARS = set("0123456789abcdef-")
DATE_RE = re.compile(r"^\d{8}$")

CAT_UUID = "会话 UUID 片段（扩展连字 run 整体命中 8-4-4-4-12 UUID 格式）"
CAT_DATE = "日期（8 位合法日历日期）"
CAT_AMBIG_DATE = "歧义（合法日期同时命中 git 前缀映射，fail-closed 判失败）"
CAT_AMBIG_UUID = "歧义（UUID 片段同时命中 git 前缀映射，fail-closed 判失败）"
CAT_UNIQUE = "短 commit SHA（git 前缀映射唯一命中，已补全 40 位）"
CAT_MULTI = "未知（git 前缀映射命中多个 commit，无法唯一解析）"
CAT_ZERO = "未知（非 UUID/非合法日期，git 前缀映射 0 命中；SHA256 截断片段等无法与 commit 前缀按格式区分，一律判失败）"


def load_prefix_map(root):
    """git rev-list --all 构建全量提交的 7~39 位前缀映射。"""
    out = subprocess.run(["git", "rev-list", "--all"], cwd=root,
                         capture_output=True, text=True, check=True)
    commits = sorted({c.strip() for c in out.stdout.splitlines()
                      if re.fullmatch(r"[0-9a-f]{40}", c.strip())})
    prefix = {}
    for c in commits:
        for n in range(7, 40):
            prefix.setdefault(c[:n], set()).add(c)
    return commits, prefix


def is_uuid_fragment(line, start, end):
    """token 向两侧扩展 [0-9a-f-]，完整 run 整体命中 UUID 格式才算 UUID 片段。"""
    l = start
    while l > 0 and line[l - 1] in HEXPART_CHARS:
        l -= 1
    r = end
    while r < len(line) and line[r] in HEXPART_CHARS:
        r += 1
    return UUID_RE.fullmatch(line[l:r]) is not None


def classify(tok, line, start, prefix):
    """返回 (类别, 替换值或 None)。替换值非 None 表示唯一命中需补全。"""
    end = start + len(tok)
    in_uuid = is_uuid_fragment(line, start, end)
    in_prefix = prefix.get(tok)
    if in_uuid:
        if in_prefix:
            return CAT_AMBIG_UUID, None
        return CAT_UUID, None
    if DATE_RE.fullmatch(tok):
        try:
            datetime.strptime(tok, "%Y%m%d")
        except ValueError:
            pass
        else:
            if in_prefix:
                return CAT_AMBIG_DATE, None
            return CAT_DATE, None
    if in_prefix and len(in_prefix) == 1:
        return CAT_UNIQUE, next(iter(in_prefix))
    if in_prefix and len(in_prefix) > 1:
        return CAT_MULTI, None
    return CAT_ZERO, None


def sweep(files, prefix, check_only):
    """单轮扫描：分类、补全、统计同轮完成（报告即最终文件状态）。

    返回 (report_lines, exceptions, unknowns, replaced_total)。
    exceptions=[(file, line, tok, cat)]；unknowns 同构。
    """
    report = ["# SHA 审计清单（由 phase0/tools/sweep_sha.py 自动生成，R21 版）", ""]
    report.append(f"- 仓库根：{ROOT}")
    report.append(f"- 运行模式：{'--check（只核对不修改）' if check_only else '全量规整'}")
    report.append("- 分类规则：UUID 片段（扩展 run 整体命中 UUID 格式）／日期（8 位合法日历日期）／"
                  "短 commit SHA（前缀映射唯一命中）／其余一律未知（fail-closed，退出码 2）")
    report.append("")
    exceptions, unknowns = [], []
    replaced_total = 0
    for f in files:
        text = f.read_text(encoding="utf-8")
        lines = text.split("\n")
        file_replaced = 0
        file_exc, file_unk = [], []
        for i, line in enumerate(lines, 1):
            def rep(m, line_no=i, line_text=line):
                nonlocal file_replaced
                tok = m.group(0)
                cat, repl = classify(tok, line_text, m.start(), prefix)
                if repl is not None:
                    file_replaced += 1
                    return repl
                entry = (f.name, line_no, tok, cat)
                if cat in (CAT_UUID, CAT_DATE):
                    file_exc.append(entry)
                else:
                    file_unk.append(entry)
                return tok
            lines[i - 1] = TOKEN.sub(rep, line)
        new_text = "\n".join(lines)
        if not check_only and new_text != text:
            f.write_text(new_text, encoding="utf-8", newline="\n")
        # 统计取自最终态文本（与替换同轮之后重读），报告反映最终文件状态
        final_text = new_text if not check_only else text
        n40 = len(FULL40.findall(final_text))
        exceptions.extend(file_exc)
        unknowns.extend(file_unk)
        replaced_total += file_replaced
        report.append(f"## {f.name}")
        report.append(f"- 完整 40 位 commit SHA 出现次数（最终态）：{n40}")
        report.append(f"- 本文件补全的短 SHA 数：{file_replaced}")
        report.append(f"- 例外项（UUID 片段/日期，格式识别通过）：{len(file_exc)}")
        for name, no, tok, cat in file_exc:
            report.append(f"  - `{tok}`（{name} 第 {no} 行）：{cat}")
        report.append(f"- 未知项（必须为 0，否则退出码 2）：{len(file_unk)}")
        for name, no, tok, cat in file_unk:
            report.append(f"  - `{tok}`（{name} 第 {no} 行）：{cat}")
        report.append("")
    report.append(f"- 全文补全总数：{replaced_total if not check_only else 0}"
                  f"{'（--check 模式不修改）' if check_only else ''}")
    report.append("## 结论")
    report.append(f"- 未知项合计：{len(unknowns)} 处（0=审计通过；>0 退出码 2）")
    report.append(f"- 例外项合计：{len(exceptions)} 处（UUID 片段/日期，均经严格格式识别）")
    return report, exceptions, unknowns, replaced_total


def selftest():
    """负向测试：临时副本中放入不可解析短 SHA 须退出码 2；移除后须退出码 0。"""
    _, prefix = load_prefix_map(ROOT)
    # 选一个前缀映射 0 命中、非日期格式的 7 位 hex
    tok = None
    for i in range(0x100000, 0xFFFFFF):
        cand = f"{i:07x}"
        if cand not in prefix and not DATE_RE.fullmatch(cand):
            tok = cand
            break
    assert tok is not None
    src = TASK / "delivery.md"
    text = src.read_text(encoding="utf-8")
    lines_out = [f"负向自测 token={tok}（git 前缀映射 0 命中）"]
    ok = True
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td) / "delivery.md"
        # 负向：插入不可解析短 SHA → 须存在未知项
        tmp.write_text(text + f"\n负向测试占位 commit {tok}\n", encoding="utf-8", newline="\n")
        _, _, unk, _ = sweep([tmp], prefix, check_only=True)
        hit = any(t == tok for _, _, t, _ in unk)
        lines_out.append(f"① 注入 {tok} 后未知项={len(unk)}（含注入项={hit}）→ 期望非零退出语义 {'PASS' if hit else 'FAIL'}")
        ok = ok and hit
        # 正向：移除后 → 须 0 未知项
        tmp.write_text(text, encoding="utf-8", newline="\n")
        _, _, unk2, _ = sweep([tmp], prefix, check_only=True)
        lines_out.append(f"② 移除后未知项={len(unk2)} → 期望 0 {'PASS' if not unk2 else 'FAIL'}")
        ok = ok and not unk2
    lines_out.append(f"负向自测结论：{'PASS（注入→未知项非零；移除→0）' if ok else 'FAIL'}")
    return ok, lines_out


def main(argv):
    check_only = "--check" in argv
    do_selftest = "--selftest" in argv
    if do_selftest:
        ok, lines_out = selftest()
        print("\n".join(lines_out))
        return 0 if ok else 3
    commits, prefix = load_prefix_map(ROOT)
    report, exceptions, unknowns, _ = sweep(FILES, prefix, check_only)
    report.insert(3, f"- git rev-list --all 提交数：{len(commits)}（前缀映射覆盖 7~39 位）")
    (TASK / "acceptance/sha-audit.txt").write_text("\n".join(report) + "\n",
                                                   encoding="utf-8", newline="\n")
    print("\n".join(report))
    return 2 if unknowns else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
