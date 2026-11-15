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
    # 逐项1：当前复验轮次指向——task-brief 当前步骤实态=R5 复验中，且完整承载 R4 轮终态与问题编号
    chk("⑧a2 tb当前步骤指向R5实态(R5复验中+R4 REJECT 1项+问题12第3次)",
        ("S4 R5 复验中" in step_txt) and ("R4 复验 REJECT 1 项" in step_txt) and ("问题12 第 3 次" in step_txt))
    chk("⑧b steps S4⑥含R4裁定+止损+R5待回填登记",
        ("S4 R4 复验" in s4_sec) and ("问题12 第 3 次 REJECT" in s4_sec)
        and ("ST-10 止损触发" in s4_sec) and ("S4 R5 复验结论待回填" in s4_sec))
    # 逐项2：delivery 主状态句结构化解析（提取加粗句逐项核对，非全文短语包含）
    mst = re.search(r"\*\*S1/S2/S3 独立验收已闭环[^*]*\*\*", dl)
    m0 = mst.group(0) if mst else ""
    chk("⑧c1 主状态句存在且指向R5实态(R5复验中+结论待回填)",
        bool(mst) and ("S4 独立验收 R5 复验中" in m0) and ("R5 复验结论待回填" in m0))
    chk("⑧c2 主状态句含R4轮终态(REJECT 1项+问题12第3次)",
        bool(mst) and ("R4 复验 REJECT 1 项" in m0) and ("问题12 第 3 次" in m0))
    chk("⑧c3 主状态句无过期残留(待R3/待R4复验/24-24/30-30/止损交用户)",
        bool(mst) and not any(x in m0 for x in ("待 R3 复验","待 R4 复验","24/24","30/30","止损交用户")))
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
    # 逐项5：当前核验数字与历史快照分离——当前=36/36+演进链完整标注+旧数字仅存于历史标注语境
    hist = re.search(r"历轮核验数字[^。；\n]*", dl)
    occ = [mm.start() for mm in re.finditer("24/24", dl)]
    labeled = all(("历史" in dl[max(0,i-40):i]) or ("快照" in dl[max(0,i-40):i]) or ("演进" in dl[max(0,i-40):i]) for i in occ)
    chk("⑧j delivery当前核验数字=36/36+问题1-13+历史快照标注+演进链完整+旧数字无裸露当前态",
        ("当前=36/36" in dl) and ("问题 1-13" in dl) and ("历史快照" in dl)
        and bool(hist) and all(k in hist.group(0) for k in ("21/21","24/24","30/30","36/36")) and labeled)
    # （原⑧k「历史快照显式标注」独立项已并入⑧j 复合断言，⑧组 18 项）
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
