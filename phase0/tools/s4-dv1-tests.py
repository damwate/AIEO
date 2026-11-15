# -*- coding: utf-8 -*-
"""S4-DV1 测试矩阵（会商3 授权的降档方案验证，不入问题12 返工计数）。
会商3 裁定的测试条件：
  负向 N1/N2/N3 = delivery 正文新增裸露 21/21 / 24/24 / 30/30 各自必须 FAIL（指名拦截 ⑧j）；
  整体测试 NT   = 三种旧数字分别放在不同正文位置，每个出现位置都必须被识别（viol 逐位置报告，非只拦截第一个）；
  正向 P1       = 当前 36/36 与历史演进记录同时存在且语义正确（仓库基线）→ PASS；
  正向 P2       = 三种旧数字均在正确历史快照区域内（追加显式区段+轮次标注句）→ PASS。
全部注入只作用于内存中的文件内容副本，不修改任何仓库文件。
用法：python -X utf8 -I phase0/tools/s4-dv1-tests.py （在仓库根目录执行）
"""
import io, sys, importlib.machinery, importlib.util

def load_checker():
    loader = importlib.machinery.SourceFileLoader("s4cc_dv1", "phase0/tools/s4-consistency-check.py")
    spec = importlib.util.spec_from_loader("s4cc_dv1", loader)
    m = importlib.util.module_from_spec(spec)
    loader.exec_module(m)
    return m

def _read(p):
    return io.open(p, encoding='utf-8').read()

def main():
    cc = load_checker()
    base = 'basic/tasks/b-20261115-phasec-workflow-stats/'
    wf = _read('basic/WORKFLOW.md'); cl = _read('basic/ACCEPTANCE-CHECKLIST.md')
    tpl = _read('basic/templates/acceptance-request.md')
    st = _read(base+'steps.md'); tb = _read(base+'task-brief.md')
    ws = _read(base+'workflow-stats.md'); dl = _read(base+'delivery.md')
    results = []

    def run(name, expect, mutate):
        dl2 = mutate(dl)
        ok, fail = cc.run_checks(wf, cl, tpl, st, tb, ws, dl2)
        fnames = [f.split(" ")[0] for f in fail]
        if callable(expect):
            hit = expect(fnames, fail)
        else:
            hit = all(any(f.startswith(e) for f in fnames) for e in expect)
        full = " || ".join(fail) if fail else "（无）"
        results.append((name, hit, f"实际FAIL={fnames} 完整明细={full}"))

    # ---- 负向 3 数字（每数字一个注入）----
    run("N1 正文新增裸露21/21", ["⑧j"], lambda d: d + "\n（当次一致性核验结果：21/21，全部通过。）")
    run("N2 正文新增裸露24/24", ["⑧j"], lambda d: d + "\n（当次一致性核验结果：24/24，全部通过。）")
    run("N3 正文新增裸露30/30", ["⑧j"], lambda d: d + "\n（当次一致性核验结果：30/30，全部通过。）")

    # ---- 整体测试：三旧数字分别放不同正文位置（S1 段尾/S2 段尾/文末），逐位置识别 ----
    def inject_three(d):
        i2 = d.find("**S2 修订草案**"); i3 = d.find("**S3 整体独立复审**")
        p1 = d[:i2] + "\n（当次一致性核验结果：21/21，全部通过。）" + d[i2:]
        i2b = p1.find("**S2 修订草案**"); i3b = p1.find("**S3 整体独立复审**")
        p2 = p1[:i3b] + "\n（当次一致性核验结果：24/24，全部通过。）" + p1[i3b:]
        return p2 + "\n（当次一致性核验结果：30/30，全部通过。）"
    def nt_expect(fnames, fail):
        if not any(f.startswith("⑧j") for f in fnames):
            return False
        viol_items = [f for f in fail if f.startswith("⑧j") and "区段外裸露" in f]
        if len(viol_items) != 1:
            return False
        detail = viol_items[0]
        return detail.count("(区段外裸露)") >= 3 and all(k in detail for k in ("21/21", "24/24", "30/30"))
    run("NT 整体三位置注入(S1尾21/21+S2尾24/24+文末30/30)", nt_expect, inject_three)

    # ---- 正向 2 项 ----
    ok, fail = cc.run_checks(wf, cl, tpl, st, tb, ws, dl)
    results.append(("P1 基线(当前36/36与历史演进链共存)全过", len(ok)==36 and len(fail)==0,
                    f"实际 PASS={len(ok)}/FAIL={len(fail)} fail={fail}"))
    dl_legal = dl + "\n<!--hist-snap-start-->历史快照补充标注示例：R1 时点核验 21/21，R2 时点核验 24/24，R3/R4 时点核验 30/30，均已由演进链区段标注为历史记录。<!--hist-snap-end-->"
    ok2, fail2 = cc.run_checks(wf, cl, tpl, st, tb, ws, dl_legal)
    results.append(("P2 三旧数字均在正确历史快照区域内追加仍全过", len(ok2)==36 and len(fail2)==0,
                    f"实际 PASS={len(ok2)}/FAIL={len(fail2)} fail={fail2}"))

    npass = sum(1 for _, hit, _ in results if hit)
    print(f"DV1 TESTS PASS {npass} / FAIL {len(results)-npass}（负向3+整体1+正向2=6）")
    for name, hit, detail in results:
        print((" [PASS] " if hit else " [FAIL] ") + name + " | " + detail)
    sys.exit(0 if npass == len(results) else 1)

if __name__ == "__main__":
    main()
