#!/usr/bin/env python
"""全量 SHA 审计（R21 版，fail-closed）：扫描交付文档中全部 7~39 位十六进制 token，
按独立、严格的格式规则分类，唯一命中的短 commit SHA 补成完整 40 位，
自动生成 acceptance/sha-audit.txt；任何未知项使退出码非零。

用法（在仓库根执行）：
  python -I -X utf8 phase0/tools/sweep_sha.py            # 全量规整+生成清单
  python -I -X utf8 phase0/tools/sweep_sha.py --check    # 只核对不修改（零副作用：不写任何文件，含清单）
  python -I -X utf8 phase0/tools/sweep_sha.py --selftest # 负向测试（临时 git 仓库+子进程真实退出码断言，不动真实文件）

分类规则（互斥、依序判定，全部基于格式、上下文与 git 前缀映射，不依赖分类文字字符串包含）：
  1. UUID 片段：token 向两侧扩展 [0-9a-f-] 得到完整连字 run，run 整体命中
     8-4-4-4-12 UUID 格式 → 会话 UUID 片段（例外，不判失败）。
  2. SHA256 上下文片段：token 之前的行内文本命中 sha256/sha-256 标记（如
     `reply sha256=`）→ 无论是否命中 git 前缀映射，一律计未知（fail-closed，
     不作 commit 补全；完整 64 位 SHA256 不落入 7~39 位扫描范围，不受影响）。
  3. 日期：token 为 8 位数字且是合法日历日期 → 日期（例外，不判失败）。
     若同时命中 git 前缀映射 → 歧义（判失败，fail-closed）。
  4. 短 commit SHA：git 前缀映射唯一命中（1 个 commit）→ 就地补成 40 位。
  5. 未知：其余一切（映射 0 命中或多命中、UUID/日期歧义等）→ 全部计入未知，
     退出码 2（fail-closed）。

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
SHA256_CTX = re.compile(r"sha[-_ ]?256\s*[=:：]?\s*$", re.IGNORECASE)

CAT_UUID = "会话 UUID 片段（扩展连字 run 整体命中 8-4-4-4-12 UUID 格式）"
CAT_SHA256 = "SHA256 上下文片段（sha256 标记后的截断十六进制，不作 commit 补全，fail-closed 计失败）"
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
    if SHA256_CTX.search(line[:start]):
        # sha256 标记后的截断十六进制：与 commit 前缀按格式不可区分，无论映射
        # 结果如何一律计未知（fail-closed），绝不补全为 commit SHA。
        return CAT_SHA256, None
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
    """负向测试：临时 git 仓库+子进程真实执行，断言注入不可解析短 SHA 时
    进程退出码=2、移除后退出码=0（真实验证 main() 的退出码映射，非内部函数值）。"""
    _, prefix = load_prefix_map(ROOT)
    # 选一个前缀映射 0 命中、非日期格式的 7 位 hex
    tok = None
    for i in range(0x100000, 0xFFFFFF):
        cand = f"{i:07x}"
        if cand not in prefix and not DATE_RE.fullmatch(cand):
            tok = cand
            break
    assert tok is not None
    lines_out = [f"负向自测 token={tok}（git 前缀映射 0 命中）"]
    ok = True
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        subprocess.run(["git", "init", "-q"], cwd=root, check=True, capture_output=True)
        # 布局 <td>/p0/tools/sweep_sha.py 使 parents[2] == <td>（ROOT 动态推算）；
        # 扫描目标 <td>/basic/tasks/b-20261116-workspace-spec/（与真实仓库同相对路径）
        script = root / "p0" / "tools" / "sweep_sha.py"
        script.parent.mkdir(parents=True)
        task_dir = root / "basic" / "tasks" / "b-20261116-workspace-spec"
        task_dir.mkdir(parents=True)
        for f in FILES:
            (task_dir / f.name).write_text(f.read_text(encoding="utf-8"), encoding="utf-8", newline="\n")
        script.write_text(Path(__file__).read_text(encoding="utf-8"), encoding="utf-8", newline="\n")

        def run_check():
            return subprocess.run(
                [sys.executable, "-I", "-X", "utf8", str(script), "--check"],
                cwd=root, capture_output=True, text=True, encoding="utf-8", errors="replace",
            )

        target = task_dir / "delivery.md"
        original = target.read_text(encoding="utf-8")
        # 负向：注入不可解析短 SHA → 子进程真实退出码必须为 2
        target.write_text(original + f"\n负向测试占位 commit {tok}\n", encoding="utf-8", newline="\n")
        r1 = run_check()
        hit = r1.returncode == 2 and tok in r1.stdout
        lines_out.append(f"① 注入 {tok} 后子进程退出码={r1.returncode}（输出含注入项={tok in r1.stdout}）→ 期望 2 {'PASS' if hit else 'FAIL'}")
        ok = ok and hit
        # 正向：移除后 → 子进程真实退出码必须为 0
        target.write_text(original, encoding="utf-8", newline="\n")
        r2 = run_check()
        ok2 = r2.returncode == 0
        lines_out.append(f"② 移除后子进程退出码={r2.returncode} → 期望 0 {'PASS' if ok2 else 'FAIL'}")
        ok = ok and ok2
        if not ok:
            lines_out.append(f"诊断：r1.stderr={r1.stderr[-200:]!r} r2.stderr={r2.stderr[-200:]!r}")
    lines_out.append(f"负向自测结论：{'PASS（注入→exit 2；移除→exit 0，子进程真实执行）' if ok else 'FAIL'}")
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
    if not check_only:
        # --check 为零副作用纯核对：不写任何文件（含清单），清单仅在全量规整模式生成
        (TASK / "acceptance/sha-audit.txt").write_text("\n".join(report) + "\n",
                                                       encoding="utf-8", newline="\n")
    print("\n".join(report))
    return 2 if unknowns else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
