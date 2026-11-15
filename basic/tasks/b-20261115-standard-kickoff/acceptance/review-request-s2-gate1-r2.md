# S2 Gate1 复验请求：b-20261115-standard-kickoff（复核 G1-03/G1-06）

> 依据 Gate1 裁定（reply sha256=dd1866336b88bdfa825b94f3dc5e3c70baaa02a741f01bcc61ba8df11743b349，dispatch-2026-11-15T12-50-59）：六项中四项 PASS（I1-I7/防膨胀/状态路径/矩阵齐备），G1-03/G1-06 两项整改后复验。

## 绑定申报（ST-01，**本次经 C1 工具机器核验**——G1-06 教训落地）

- **待验收 commit（单 commit 申报）：** `be281f0d9251647a41438cccf0e753facfba69ff`
- **diff 基线：** `bbb420a9cf5d4da99a162c9cf40c690857d709b2`（G1-06 修正=正确父 commit；前次误报 beafe77 实隔 2 commits）
- **绑定核验（工具机器输出原文）：** `python -I toolkit/check-binding.py --baseline bbb420a9cf5d4da99a162c9cf40c690857d709b2 --target be281f0d9251647a41438cccf0e753facfba69ff --count 1` → **PASS**（R1 数=1 ✓／R2 链 ✓／R4 最终 ✓）；numstat=**3／2 docs/phase1/GPT03-REVIEW-LEG-CHARTER-DRAFT.md**
- 本请求所在回填 commit 不属验收 diff 范围（ST-01 ④）。

## 两项整改对照

| 问题 | Gate1 要求 | 修正落位 |
|---|---|---|
| G1-03 授权边界冲突 | engine 的 BLOCKED 推进权限与"任务级 BLOCKED 仅 OWNER"冲突，须明确 | charter v0.5：§6 engine 可执行操作移除 BLOCKED（仅 GIT_VALIDATE/PASS/REWORK）；禁止列增"**推进 M1 任务至 BLOCKED 态**（任务级仅 OWNER 决定）"；§4 审查结论推进对齐（引擎故障=腿级 BLOCKED run 层记录，M1 任务不动） |
| G1-06 单 commit 绑定不符 | 澄清正确基线或重报准确绑定 | 重报=基线 bbb420a（e1474b3 实际父 commit），单 commit，numstat 3/2；申报全链自此强制 C1 工具机器核验（教训入 delivery 后续建议：ST-01 申报必跑 check-binding） |

## 复验范围声明

- 只复核 G1-03/G1-06；Gate1 四项 PASS 不重审；问题5/6 历史 REJECT 保留；Gate2 深度项不重审。

**回执格式：** G1-03/G1-06 逐项结论＋总结论（PASS/REJECT＋问题编号）。
