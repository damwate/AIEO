# -*- coding: utf-8 -*-
# R5 问题12 整改：一致性核验负向/正向测试（会商1 执行约束，非可选自选动作）
# 负向 5 类注入（对应会商1指定清单：轮次冲突/问题编号错配/S1-S3单项状态错误/当前数字过期/主状态与正文冲突），
#   每类断言被【指名】拦截（对应 ⑧ 编号出现在 fail 名单），非仅整体 FAIL；
# 正向 2 项：P1 三文件实态完全一致→37/37 全过；P2 历史记录存在但标注正确→仍 37/37 全过。
# 全部注入只作用于内存中的文件内容副本，不修改任何仓库文件。
# 用法：python -X utf8 -I phase0/tools/s4-check-negpos-tests.py （在仓库根目录执行）
import io, sys, importlib.machinery, importlib.util

def load_checker():
    # 文件名含连字符不能常规 import，用 SourceFileLoader 加载（__main__ 守卫防止副作用）
    loader = importlib.machinery.SourceFileLoader("s4cc", "phase0/tools/s4-consistency-check.py")
    spec = importlib.util.spec_from_loader("s4cc", loader)
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
    results = []; aborted = []

    def run(name, expect_fail_names, mutate):
        tb2, dl2 = mutate(tb, dl)
        ok, fail = cc.run_checks(wf, cl, tpl, st, tb2, ws, dl2)
        fnames = [f.split(" ")[0] for f in fail]
        hit = all(any(f.startswith(e) for f in fnames) for e in expect_fail_names)
        results.append((name, hit, f"期望拦截={expect_fail_names} 实际FAIL={fnames}"))

    # ---- 负向 5 类 ----
    # N1 轮次冲突：task-brief 当前步骤实态与已登记轮结论冲突（R5 REJECT 改写为 PASS），三文件轮次指向冲突
    run("N1 轮次冲突(tb当前步骤R5 REJECT→PASS改写)", ["⑧a2"],
        lambda tb, dl: (tb.replace("S4 R5 复验 REJECT", "S4 R5 复验 PASS"), dl))
    # N2 问题编号错配：delivery 全文 R2/R3 轮对应问题编号全部错写（⑧d 按轮逐项核对应双双拦截）
    run("N2 问题编号错配(dl 问题12/13 全部错写)", ["⑧d2", "⑧d3"],
        lambda tb, dl: (tb, dl.replace("问题12/13", "问题12与13")))
    # N3 S1-S3 单项状态错误：delivery S2 段 R3 PASS 改 REJECT
    run("N3 S1-S3单项状态错误(dl S2段R3 PASS→REJECT)", ["⑧f3"],
        lambda tb, dl: (tb, dl.replace("补正 0604231→R3 PASS", "补正 0604231→R3 REJECT")))
    # N4 当前数字过期：当前=36/36 改回旧值 30/30（复刻 R4 抓到的缺陷形态）
    run("N4 当前数字过期(dl 当前=36/36→30/30)", ["⑧j"],
        lambda tb, dl: (tb, dl.replace("当前=36/36", "当前=30/30")))
    # N5 主状态与正文冲突：主状态 R4 轮 REJECT 1 项 改成 PASS（与 steps/delivery 正文记录冲突）
    run("N5 主状态与正文冲突(dl主状态R4 REJECT→PASS)", ["⑧c2", "⑧d4"],
        lambda tb, dl: (tb, dl.replace("R4 复验 REJECT 1 项[问题12 第 3 次 REJECT", "R4 复验 PASS[问题12 第 3 次 REJECT")))

    # ---- 正向 2 项 ----
    # P1 三文件实态完全一致（仓库当前态）
    ok, fail = cc.run_checks(wf, cl, tpl, st, tb, ws, dl)
    results.append(("P1 三文件实态一致全过(37/37)", len(ok)==37 and len(fail)==0,
                    f"实际 PASS={len(ok)}/FAIL={len(fail)} fail={fail}"))
    # P2 历史记录存在但归属正确：追加带显式历史快照区段标记+轮次标注的旧数字句，仍应全过
    dl_hist = dl + "\n<!--hist-snap-start-->历史快照补充标注示例：R2 时点一致性核验 24/24，已由上方演进链区段标注为历史记录，非当前实态。<!--hist-snap-end-->"
    ok2, fail2 = cc.run_checks(wf, cl, tpl, st, tb, ws, dl_hist)
    results.append(("P2 历史记录标注正确时通过", len(ok2)==37 and len(fail2)==0,
                    f"实际 PASS={len(ok2)}/FAIL={len(fail2)} fail={fail2}"))

    # ---- 汇总 ----
    npass = sum(1 for _, hit, _ in results if hit)
    print(f"NEG/POS TESTS PASS {npass} / FAIL {len(results)-npass}（负向5+正向2=7）")
    for name, hit, detail in results:
        print((" [PASS] " if hit else " [FAIL] ") + name + " | " + detail)
    sys.exit(0 if npass == len(results) else 1)

if __name__ == "__main__":
    main()
