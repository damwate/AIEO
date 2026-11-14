# S4 交付物一致性核验脚本（b-20261115-phasec-workflow-stats）
# 用法：python -I phase0/tools/s4-consistency-check.py （在仓库根目录执行）
# 修正记录：①c 正则锚定收紧至附录差异记录表区域（避免跨表匹配）；⑤ 断言口径=30b56de（S1 R2 PASS 验收对象）；⑥c 仅查过期残留「待 S3 复验」（复验列口径，描述列引述不算）
# R2 问题12 整改：⑥a 返工表随实态 11→13 行；⑧ 组从存在性检查改为实质比较（task-brief 当前步骤实态/steps S4 R2 登记/delivery S1-S3 闭环与 S4 待定区分）
import io, re, subprocess, sys, os
ok=[]; fail=[]
def chk(name, cond, detail=""):
    (ok if cond else fail).append(f"{name}{(' | '+detail) if detail else ''}")

wf = io.open('basic/WORKFLOW.md', encoding='utf-8').read()
cl = io.open('basic/ACCEPTANCE-CHECKLIST.md', encoding='utf-8').read()
tpl = io.open('basic/templates/acceptance-request.md', encoding='utf-8').read()
st = io.open('basic/tasks/b-20261115-phasec-workflow-stats/steps.md', encoding='utf-8').read()
tb = io.open('basic/tasks/b-20261115-phasec-workflow-stats/task-brief.md', encoding='utf-8').read()
ws = io.open('basic/tasks/b-20261115-phasec-workflow-stats/workflow-stats.md', encoding='utf-8').read()
dl = io.open('basic/tasks/b-20261115-phasec-workflow-stats/delivery.md', encoding='utf-8').read()

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

# ⑧ task-brief ↔ steps ↔ delivery 实质一致（问题12 整改：真正比较状态与结论内容，非仅标题存在）
tb_step = [l for l in tb.splitlines() if l.startswith("| 当前步骤 |")]
chk("⑧a task-brief当前步骤行唯一", len(tb_step)==1, f"n={len(tb_step)}")
step_txt = tb_step[0] if tb_step else ""
chk("⑧a2 当前步骤实态=S4复验中(含R3复验指向)", "S4" in step_txt and "R3 复验" in step_txt and "复验" in step_txt, step_txt[:60])
s4_sec = st.split("## S4", 1)[1] if "## S4" in st else ""
chk("⑧b steps S4区段含R2复验REJECT2项登记", ("REJECT 2 项" in s4_sec or "REJECT 2项" in s4_sec))
chk("⑧c delivery区分S1-S3闭环与S4待定", ("S4 独立验收进行中" in dl) and ("四步独立验收全闭环" not in dl))
chk("⑧d delivery七要素标题齐全", all(h in dl for h in ["## 原始需求","## 最终实现内容","## 修改文件","## 测试结果","## Git commit","## 未解决问题","## 后续建议"]))
chk("⑧e delivery声明12行附录", "12 行" in dl)

print(f"PASS {len(ok)} / FAIL {len(fail)}")
for x in ok: print(" [PASS]", x)
for x in fail: print(" [FAIL]", x)
sys.exit(0 if not fail else 1)
