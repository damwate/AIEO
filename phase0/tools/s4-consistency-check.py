# -*- coding: utf-8 -*-
# S4 交付物一致性核验脚本（b-20261115-phasec-workflow-stats）——R5 问题12 整改版
# 用法：python -X utf8 -I phase0/tools/s4-consistency-check.py （在仓库根目录执行）
# 历史演进：R2 问题12 整改=⑥a 返工表 11→13 行+⑧组从存在性检查改实质比较；
#           R3 整改=⑧组升级三文件交叉比较（轮次指向/轮结论/S1-S3 闭环/delivery 实态 24/24+历史快照标注）；
#           R4 裁定登记=⑧b⑧c 随止损态更新（R4 复验 REJECT 1 项+ST-10 止损触发交用户）；
#           R5 整改（会商1授权范围，问题12 最后一次常规整改机会）=⑧组从短语包含升级为逐项精确核对（12→18 项，总 30→36）：
#             ⑧d1-4 轮次链 R1-R4 逐轮三文件逐项核对（轮结论+对应问题编号，缺一即 FAIL）；
#             ⑧f1-4 S1-S3 逐步闭环核对（delivery 各步段落内核对各自 PASS 结论，非"S1"+"PASS"关键词同现）；
#             ⑧c1-3 delivery 主状态句结构化解析（R5 实态指向/R4 轮终态/过期残留禁入）；
#             ⑧j 当前核验数字与历史快照分离（当前=36/36+演进链完整标注+旧数字仅可存于历史标注语境）；
#             重构为参数化 run_checks() 以支持负向测试（5 类注入全指名拦截）+正向测试（2 项），见 s4-check-negpos-tests.py。
# R4 复验教训：存在性断言（短语包含/关键词同现）≠一致性证明——错误状态曾以 30/30 PASS 通过；本版按逐项核对收紧。
# R5 裁定登记（REJECT，⑧j 覆盖缺口）=⑧a2⑧b⑧c1-3 随 REJECT 态演进（R5 复验 REJECT+停止原方案循环进降档阶梯）；
#   ⑧j 检查逻辑本轮保持原样未修复——修复属降档方案，待降档会商（会商3）授权，缺口已由 s4-gap-probe-8j.py 实证存档。
# DV1（会商3 授权的降档方案验证，不入问题12 返工计数）=⑧j 重写为全文扫描+显式历史快照区段归属（弃 40 字符窗口）：
#   三旧数字每个出现位置须落在 <!--hist-snap-start--><!--hist-snap-end--> 区段内且所在行含对应轮次标注，
#   区段外裸露直接 FAIL，违规位置全量收集逐位置报告；负向 3 数字+整体三位置测试见 s4-dv1-tests.py。
import io, re, subprocess, sys

def run_checks(wf, cl, tpl, st, tb, ws, dl):
    """参数化核验入口：传入七文件内容，返回 (ok, fail) 两个断言结果名列表。
    供 __main__ 与 s4-check-negpos-tests.py（负向注入/正向验证）共同调用。"""
    ok=[]; fail=[]
    def chk(name, cond, detail=""):
        (ok if cond else fail).append(f"{name}{(' | '+detail) if detail else ''}")

    # ① WORKFLOW 版本头/生效状态/附录 12 行（锚定附录表区域）
    chk("①a v0.3草案版本头", "v0.3 阶段C统计修订版（草案，待用户拍板生效）" in wf)
    chk("①b v0.2现行状态blockquote", "v0.2" in wf and "现行" in wf)
    ai = wf.rfind("v0.2↔v0.3 差异记录")  # 取最后一次出现=附录表本体（正文前文亦有引用）
    assert ai > 0, "附录区域未找到"
    # 附录表区域=从附录标题到下一个二级标题（或文件尾）
    tail = wf[ai:]
    nxt = tail.find("\n## ", 10)
    sec = tail[:nxt] if nxt > 0 else tail
    rows = re.findall(r"^\| (\d+) \|", sec, re.M)
    chk("①c 附录差异记录12行无重号(锚定附录区域)", rows == [str(i) for i in range(1,13)], f"rows={rows}")

    # ② 清单 31 项×6 字段+BLOCKED 边界
    items = re.findall(r"^\| (?:[A-G]-\d+) \|", cl, re.M)
    chk("②a 清单31项", len(items)==31, f"n={len(items)}")
    bad = sum(1 for line in cl.splitlines() if re.match(r"^\| [A-G]-\d+ \|", line) and line.count("|") != 7)
    chk("②b 每项6字段(7竖线)", bad==0, f"bad={bad}")
    chk("②c BLOCKED边界规则", "BLOCKED 边界" in cl)

    # ③ ST-01 两处同步
    chk("③a WORKFLOW含核链命令", "git rev-list --reverse --parents" in wf)
    chk("③b 模板含核链命令", "git rev-list --reverse --parents" in tpl)

    # ④ 附录 ST-10/11 ↔ 统计 §十三
    chk("④a ST-10止损未触发对齐", ("ST-10" in wf) and ("未触发" in wf) and ("未触发" in ws))
    chk("④b ST-11规划效率对齐", "规划 2 轮 12 分钟收敛" in wf and "规划 2 轮 12 分钟收敛" in ws)
    chk("④c 六查不属ST条目", "不属 ST 编号条目" in wf)

    # ⑤ 统计报告最后修改=30b56de（S1 R2 PASS 验收对象；S2/S3 全程未动）
    r = subprocess.run(['git','log','--oneline','--follow','--','basic/tasks/b-20261115-phasec-workflow-stats/workflow-stats.md'], capture_output=True, encoding='utf-8', errors='replace')
    commits = r.stdout.strip().splitlines()
    chk("⑤ workflow-stats 最后修改=30b56de(S1 R2 PASS 对象)", commits and commits[0].startswith("30b56de"), f"last={commits[0][:30] if commits else 'none'}")

    # ⑥ 返工表 13 行（问题1-13，R2 复验后实态）全 SHA/状态闭环
    rework = re.findall(r"^\| 问题(\d+) \|", st, re.M)
    chk("⑥a 返工表13行(问题1-13)", sorted(map(int,rework))==list(range(1,14)), f"n={rework}")
    chk("⑥b 无占位符残留", "PLACEHOLDER" not in st)
    # ⑥c 返工表复验列无过期残留（问题描述列引述旧缺陷不算；「待 S4 复验」为复验发出前合法中间态）
    rw_rows = [l for l in st.splitlines() if re.match(r"^\| 问题\d+ \|", l)]
    stale = [l.split("|")[-2].strip() for l in rw_rows if "待 S3 复验" in l.split("|")[-2]]
    chk("⑥c 复验列无过期残留", not stale, f"stale={stale}")

    # ⑦ S1/S2/S3/S4 六要素字面验收结论（S4 闭环后应有）
    for sid, nxtid in [("S1","S2"),("S2","S3"),("S3","S4")]:
        sec_i = st.split(f"## {sid}")[1].split(f"## {nxtid}")[0]
        chk(f"⑦ {sid}含字面验收结论PASS", "验收结论：PASS" in sec_i)

    # ⑧ task-brief ↔ steps ↔ delivery 三文件状态逐项精确核对（R5 问题12 整改：
    #    R4 复验证实存在性断言≠一致性证明，本组全部改为逐项核对+fail-closed）
    tb_step = [l for l in tb.splitlines() if l.startswith("| 当前步骤 |")]
    chk("⑧a task-brief当前步骤行唯一", len(tb_step)==1, f"n={len(tb_step)}")
    step_txt = tb_step[0] if tb_step else ""
    s4_sec = st.split("## S4", 1)[1] if "## S4" in st else ""
    # 逐项1：当前复验轮次指向——task-brief 当前步骤实态=R5 复验 REJECT+降档阶梯启动，完整承载 R4 轮终态与问题编号
    chk("⑧a2 tb当前步骤指向R5 REJECT实态(R5 REJECT+问题12第4次+R4 REJECT 1项+问题12第3次)",
        ("S4 R5 复验 REJECT" in step_txt) and ("问题12 第 4 次" in step_txt)
        and ("R4 复验 REJECT 1 项" in step_txt) and ("问题12 第 3 次" in step_txt))
    chk("⑧b steps S4⑥含R5裁定登记+降档阶梯启动(R5 REJECT+问题12第4次)+R4裁定+止损历史",
        ("S4 R5 复验 REJECT" in s4_sec) and ("问题12 第 4 次" in s4_sec)
        and ("停止原方案整改循环进入止损降档阶梯" in s4_sec)
        and ("S4 R4 复验" in s4_sec) and ("ST-10 止损触发" in s4_sec))
    # 逐项2：delivery 主状态句结构化解析（提取加粗句逐项核对，非全文短语包含）
    mst = re.search(r"\*\*S1/S2/S3 独立验收已闭环[^*]*\*\*", dl)
    m0 = mst.group(0) if mst else ""
    chk("⑧c1 主状态句存在且指向R5 REJECT实态(R5复验REJECT+停止原方案循环进降档阶梯+R6不安排)",
        bool(mst) and ("S4 独立验收 R5 复验 REJECT" in m0)
        and ("停止原方案整改循环进入止损降档阶梯" in m0) and ("R6 不安排" in m0))
    chk("⑧c2 主状态句含R4轮终态(REJECT 1项+问题12第3次)",
        bool(mst) and ("R4 复验 REJECT 1 项" in m0) and ("问题12 第 3 次" in m0))
    chk("⑧c3 主状态句无过期残留(待R3/待R4复验/24-24/30-30/止损交用户/R5结论待回填)",
        bool(mst) and not any(x in m0 for x in ("待 R3 复验","待 R4 复验","24/24","30/30","止损交用户","R5 复验结论待回填")))
    # 逐项3：轮次链 R1-R4 逐轮三文件逐项核对（轮结论+对应问题编号缺一即 FAIL）
    for _n,_v,_p in [("⑧d1","REJECT 3 项","问题9/10/11"),("⑧d2","REJECT 2 项","问题12/13"),
                     ("⑧d3","REJECT 保留 2 项","问题12/13"),("⑧d4","REJECT 1 项","问题12 第 3 次")]:
        chk(f"{_n} 轮结论三文件逐项({_v}+{_p})", all((_v in x) and (_p in x) for x in (step_txt, s4_sec, dl)))
    # 逐项4：S1-S3 逐步闭环核对——三文件声明沿用+delivery 各步段落内核对各自 PASS 结论
    chk("⑧f1 S1-S3 PASS沿用三文件声明", all("S1-S3 PASS 沿用" in x for x in (step_txt, s4_sec, dl)))
    s1_i = dl.find("**S1 统计报告**"); s2_i = dl.find("**S2 修订草案**"); s3_i = dl.find("**S3 整体独立复审**")
    seg1 = dl[s1_i:s2_i] if 0 <= s1_i < s2_i else ""
    seg2 = dl[s2_i:s3_i] if 0 <= s2_i < s3_i else ""
    seg3 = dl[s3_i:] if s3_i >= 0 else ""
    chk("⑧f2 delivery S1段逐步(R2 PASS)", ("R2 PASS" in seg1))
    chk("⑧f3 delivery S2段逐步(R3 PASS+S2 正式闭环)", ("R3 PASS" in seg2) and ("S2 正式闭环" in seg2))
    chk("⑧f4 delivery S3段逐步(R4 PASS+S3 正式闭环)", ("R4 PASS" in seg3) and ("S3 正式闭环" in seg3))
    chk("⑧g delivery无「四步独立验收全闭环」残留", "四步独立验收全闭环" not in dl)
    chk("⑧h delivery七要素标题齐全", all(h in dl for h in ["## 原始需求","## 最终实现内容","## 修改文件","## 测试结果","## Git commit","## 未解决问题","## 后续建议"]))
    chk("⑧i delivery声明12行附录", "12 行" in dl)
    # 逐项5（DV1 版，会商3 修订方法授权）：历史核验数字全文扫描+显式历史快照区段归属——
    #   弃"前 40 字符含历史/快照/演进"窗口判断（R5 裁定实证该规则放行 21/21、30/30 裸露）；
    #   改为：21/21、24/24、30/30 每个出现位置必须落在 <!--hist-snap-start-->…<!--hist-snap-end-->
    #   显式历史快照区段内，且所在行含对应轮次标注（21/21↔R1；24/24↔R2；30/30↔R3 或 R4）；
    #   区段外裸露原则上直接 FAIL；违规位置全量收集逐位置报告（非只拦截第一个）；
    #   当前数字 36/36 按当前实态单独核验（不属历史数字清单，无区段归属要求）；
    #   ⑧c3 继续负责主状态句过期状态检查，⑧j 负责 delivery 全文历史数字归属——职责分开。
    snap_spans = [(m.start(), m.end()) for m in re.finditer(r"<!--hist-snap-start-->.*?<!--hist-snap-end-->", dl, re.S)]
    snap_segs = re.findall(r"<!--hist-snap-start-->(.*?)<!--hist-snap-end-->", dl, re.S)
    viol = []
    for _num, _rounds in (("21/21", ("R1",)), ("24/24", ("R2",)), ("30/30", ("R3", "R4"))):
        for mm in re.finditer(re.escape(_num), dl):
            _i = mm.start()
            if not any(_s <= _i < _e for _s, _e in snap_spans):
                viol.append(f"{_num}@{_i}(区段外裸露)")
            else:
                _ls = dl.rfind("\n", 0, _i) + 1
                _le = dl.find("\n", _i)
                _le = _le if _le >= 0 else len(dl)
                if not any(_r in dl[_ls:_le] for _r in _rounds):
                    viol.append(f"{_num}@{_i}(区段内缺轮次{'/'.join(_rounds)}标注)")
    hist = re.search(r"历轮核验数字[^。；\n]*", dl)
    chk("⑧j(DV1) delivery当前=36/36+历史数字全文扫描区段归属(区段外裸露/区段内缺轮次标注即FAIL,逐位置报告)",
        ("当前=36/36" in dl) and ("问题 1-13" in dl) and len(snap_segs) >= 1
        and bool(hist) and all(k in hist.group(0) for k in ("21/21","24/24","30/30","36/36"))
        and not viol,
        f"viol={viol} segs={len(snap_segs)}")
    # （原⑧k「历史快照显式标注」独立项已并入⑧j 复合断言，⑧组 18 项；
    #   原 40 字符窗口版 ⑧j 及其缺口复现见 s4-gap-probe-8j.py 与 R5 裁定登记 commit ac08520）
    return ok, fail

def _read(p):
    return io.open(p, encoding='utf-8').read()

if __name__ == "__main__":
    base = 'basic/tasks/b-20261115-phasec-workflow-stats/'
    wf = _read('basic/WORKFLOW.md'); cl = _read('basic/ACCEPTANCE-CHECKLIST.md')
    tpl = _read('basic/templates/acceptance-request.md')
    st = _read(base+'steps.md'); tb = _read(base+'task-brief.md')
    ws = _read(base+'workflow-stats.md'); dl = _read(base+'delivery.md')
    ok, fail = run_checks(wf, cl, tpl, st, tb, ws, dl)
    print(f"PASS {len(ok)} / FAIL {len(fail)}")
    for x in ok: print(" [PASS]", x)
    for x in fail: print(" [FAIL]", x)
    sys.exit(0 if not fail else 1)
