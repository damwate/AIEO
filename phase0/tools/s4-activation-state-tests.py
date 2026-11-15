# -*- coding: utf-8 -*-
# v0.3 生效态专项回归测试（b-20261115-v03-activation 冻结方案 S2 新增；R1 验收 REJECT 整改后负向扩至 5）。
# 覆盖"生效状态"专用断言（检查器 ①a/①b）能否拦截旧草案态回流与记录信息缺失：
#   负向 5 注入（各自断言被【指名】拦截）：
#     NT1 = WORKFLOW 标题回退草案态（"草案，待用户拍板生效"回流）→ ①a 拦截；
#     NT2 = 生效状态 blockquote 回退旧草案态（"v0.2 仍为现行版"回流）→ ①b 拦截；
#     NT3 = ACCEPTANCE-CHECKLIST 头部正式生效声明被删除 → ①a 拦截（清单声明部分）；
#     NT4 = blockquote 删除交接包记录位置引用（handoff/...HANDOFF.md §5）→ ①b 拦截（P1-1 整改新增）；
#     NT5 = 清单头部生效声明被移出头部（追加到文件尾）→ ①a 拦截（P2 整改新增，①a 定位头部声明行）。
#   正向 2 项：
#     P1 = 仓库当前生效实态 → 37/37 全过；
#     P2 = 历史草案记录保留情形（wf 追加含"草案"字样的显式历史快照注释，模拟历史区扩写）→ 仍 37/37 全过
#          （验证检查器不要求全文无差别清除"草案"字样，附录/历史区保留合规）。
# 全部注入只作用于内存中的文件内容副本，不修改任何仓库文件（隔离注入，不污染正式工作区）。
# 用法：python -X utf8 -I phase0/tools/s4-activation-state-tests.py （在仓库根目录执行）
import io, sys, importlib.machinery, importlib.util

def load_checker():
    loader = importlib.machinery.SourceFileLoader("s4cc_act", "phase0/tools/s4-consistency-check.py")
    spec = importlib.util.spec_from_loader("s4cc_act", loader)
    m = importlib.util.module_from_spec(spec)
    loader.exec_module(m)
    return m

def _read(p):
    return io.open(p, encoding='utf-8').read()

OLD_TITLE = "# AIEO Basic 工作流（初级版规范）v0.3 阶段C统计修订版（草案，待用户拍板生效）"
OLD_BQ = "> **v0.3 生效状态（拍板风险控制⑤，ST 依据见附录）：** 本版为阶段 C 统计修订**草案**——**用户拍板生效前 v0.2 仍为现行版**；生效日期与批准依据于拍板时回填。修订依据=阶段 C 统计报告 `tasks/b-20261115-phasec-workflow-stats/workflow-stats.md`（ST-01~ST-12），核心原则：不把工作流写得更复杂，用真实数据让 Basic 更简单、更可靠、更容易复制。v0.2↔v0.3 差异记录见文末附录。"
NEW_TITLE = "# AIEO Basic 工作流（初级版规范）v0.3 阶段C统计修订版（已生效 2026-11-15）"
CL_DECL = "> **生效状态（正式版）：** 本清单为正式版，已随 WORKFLOW.md v0.3 于 2026-11-15 经用户拍板**正式生效**；批准依据与记录位置见 WORKFLOW.md v0.3 生效状态 blockquote。\n"

def main():
    cc = load_checker()
    base = 'basic/tasks/b-20261115-phasec-workflow-stats/'
    wf = _read('basic/WORKFLOW.md'); cl = _read('basic/ACCEPTANCE-CHECKLIST.md')
    tpl = _read('basic/templates/acceptance-request.md')
    st = _read(base+'steps.md'); tb = _read(base+'task-brief.md')
    ws = _read(base+'workflow-stats.md'); dl = _read(base+'delivery.md')
    results = []

    def run(name, expect_fail_names, mutate):
        wf2, cl2 = mutate(wf, cl)
        ok, fail = cc.run_checks(wf2, cl2, tpl, st, tb, ws, dl)
        fnames = [f.split(" ")[0] for f in fail]
        hit = all(any(f.startswith(e) for f in fnames) for e in expect_fail_names)
        results.append((name, hit, f"期望拦截={expect_fail_names} 实际FAIL={fnames}"))

    # ---- 负向 3 注入 ----
    # NT1 标题回草案态：新标题被换回旧草案标题（生效态丢失）
    run("NT1 标题回退草案态", ["①a"],
        lambda w, c: (w.replace(NEW_TITLE, OLD_TITLE, 1), c))
    # NT2 blockquote 回旧草案态：生效状态行整行被换回"v0.2 仍为现行版"旧文案
    def nt2(w, c):
        lines = w.splitlines()
        idx = next(i for i, l in enumerate(lines) if l.startswith("> **v0.3 生效状态"))
        lines[idx] = OLD_BQ
        return ("\n".join(lines) + ("\n" if w.endswith("\n") else ""), c)
    run("NT2 blockquote回退v0.2现行旧草案态", ["①b"], nt2)
    # NT3 清单正式生效声明删除：头部生效状态行被移除
    run("NT3 清单生效声明删除", ["①a"],
        lambda w, c: (w, c.replace(CL_DECL, "", 1)))
    # NT4 blockquote 删除交接包记录位置引用（P1-1 整改覆盖：记录位置不完整必须被 ①b 拦截）
    def nt4(w, c):
        lines = w.splitlines()
        idx = next(i for i, l in enumerate(lines) if l.startswith("> **v0.3 生效状态"))
        lines[idx] = lines[idx].replace(" 与 `handoff/BASIC-PHASE-C-V03-ACTIVATION-HANDOFF.md` §5", "")
        return ("\n".join(lines) + ("\n" if w.endswith("\n") else ""), c)
    run("NT4 blockquote删交接包记录位置引用", ["①b"], nt4)
    # NT5 清单头部生效声明移出头部（P2 整改覆盖：①a 须定位头部声明行，移至文尾即拦截）
    def nt5(w, c):
        c2 = c.replace(CL_DECL, "", 1) + "\n" + CL_DECL.rstrip("\n") + "（移出头部示例）\n"
        return (w, c2)
    run("NT5 清单生效声明移出头部", ["①a"], nt5)

    # ---- 正向 2 项 ----
    # P1 仓库当前生效实态全过
    ok, fail = cc.run_checks(wf, cl, tpl, st, tb, ws, dl)
    results.append(("P1 生效实态全过(37/37)", len(ok)==37 and len(fail)==0,
                    f"实际 PASS={len(ok)}/FAIL={len(fail)} fail={fail}"))
    # P2 历史草案记录保留情形：wf 追加含"草案"字样的显式历史快照注释（模拟历史区扩写），仍应全过
    wf_hist = wf + "\n<!--hist-snap-start-->历史快照补充标注示例：v0.3 曾为草案（草案，待用户拍板生效），2026-11-15 经用户拍板正式生效，本行仅属历史记录。<!--hist-snap-end-->"
    ok2, fail2 = cc.run_checks(wf_hist, cl, tpl, st, tb, ws, dl)
    results.append(("P2 历史草案记录保留仍全过(37/37)", len(ok2)==37 and len(fail2)==0,
                    f"实际 PASS={len(ok2)}/FAIL={len(fail2)} fail={fail2}"))

    npass = sum(1 for _, hit, _ in results if hit)
    print(f"ACTIVATION-STATE TESTS PASS {npass} / FAIL {len(results)-npass}（负向5+正向2=7）")
    for name, hit, detail in results:
        print((" [PASS] " if hit else " [FAIL] ") + name + " | " + detail)
    sys.exit(0 if npass == len(results) else 1)

if __name__ == "__main__":
    main()
