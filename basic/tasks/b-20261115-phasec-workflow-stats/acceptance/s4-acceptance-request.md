# 验收请求：b-20261115-phasec-workflow-stats 第 4 步（S4 整体校验交付）

**版本：v2（复验请求）。** v1 用于 R1 独立验收（基点 6cf01df→待验收 5580d4aacfc34d89e4ea674cdea0204a7b1d25ac，其后回填 cc030ff），R1 裁定 **REJECT 3 项**（问题9/10/11；Git 绑定核验/需求四项交付物/S1-S3 历史结论/版本边界/清单结构均 PASS）——本版为整改后复验请求。验收标准=S4 出口条件（steps.md 冻结原文）：交付完整，等待用户拍板生效。

## 绑定（v2 复验）

- 分支：main（https://github.com/damwate/AIEO.git）
- **复验基点 commit：`cc030ff322f6dbaf0d1222b088dfffcba73216b5`**（S4 R1 验收请求回填后）
- **待验收 commit：本回填 commit（HEAD）。** Git 自引用结构性限制如实声明：commit 无法将自身 SHA 写入自身文件，本 commit SHA 由本节申报并经 `git rev-parse HEAD` 对照核验，申报后实跑核验结果随派单简报给出。
- **待验收 diff：cc030ff→本 commit 双 commit 线性链（多 commit 申报，按 ST-01 多 commit 分支逐条核链）：**
  1. `ccc9c5570eb14d2369a7c87e45df5f3f9bc54405`（R1 三问题整改主体：问题9 ③ 绑定链重写、问题10 返工表问题7/8 复验列同步、问题11 三方核验+脚本存档+S4 checklist 勾选；唯一 parent=cc030ff）
  2. 本回填 commit（返工表问题9/10/11 修复 SHA 回填+问题8 行尾双 CR 修复[插入污染致检查器 ④ 解析断裂，修复后 ④ PASS]+一致性脚本 ⑥c 口径修正+两输出档案 UTF-8 重生成+三方核验脚本可复跑存档+本请求 v2；唯一 parent=ccc9c55）
  - 申报前核验已跑：`git rev-list --reverse --parents cc030ff..HEAD` 两条线性全过 ST-01 四通过条件（首条唯一 parent=cc030ff；次条唯一 parent=ccc9c55；末条=待验收 commit；无 merge）+ `git rev-list --count cc030ff..HEAD`=2；实跑输出随派单简报逐条列出。
- **R1 轮绑定完整链（问题9 追溯用）：** 6cf01df13556acc83c04b489107369691092b1af（S3 闭环基点）→5580d4aacfc34d89e4ea674cdea0204a7b1d25ac（S4 交付内容）→cc030ff（验收请求回填）→ccc9c55（整改）→本 commit（证据回填）——五条线性，`git rev-list --reverse --parents 6cf01df..HEAD` 可逐条核。
- **绑定声明：** 本任务其后闭环/文档 commit 不属验收 diff 范围（ST-01 条款④，承首任务先例 43cd5da→afecef5）。S1-S3 三件交付物内容层已分别闭环（30b56de R2 PASS/0604231 R3 PASS/09e7797 R4 PASS），R1 结论"只审查 S4 交付，不推翻 S1/S2/S3 已通过的验收结论"沿用。
- 验收通过≠v0.3 生效——生效拍板留用户（代授权范围外）。

## R1 三问题整改对照

1. **问题9（P1）③ 绑定记录缺于待验收 commit：** 整改=steps.md S4 ③ 重写为完整绑定链记录（内容 commit 5580d4a 完整 SHA+五条绑定链+Git 自引用限制如实声明+本 commit SHA 由复验请求申报对照）；本节绑定与 ③ 逐字一致。
2. **问题10（P1）返工表问题7/8 复验列过期：** 已同步为"R3 复验 PASS（dispatch-20-36-58，reply 47c9cce7…e064）+S3 R4 沿用确认（recoll-20-47-47-462Z，reply 1d6d365a…da47）"；根因如实登记（S3 闭环回填只更新了问题6 行——多行返工闭环缺逐行同步核查动作）。
3. **问题11（P1）判附录缺编号 11：** 经三方程序核验=验收方读取偏差——存档 `phase0/tools/s4-appendix-threeway-check.py`+输出 `.txt` 可复跑：git 对象 5580d4a 与 GitHub raw 逐字节一致 sha256=df5d1f21968ce01c1634709ce2adc2901a1bcc2f60ffaefe66920ed0424114cc，编号序列 1-12 全在无重号；本地工作区原始字节差异=纯行尾（git autocrlf checkout CRLF），行尾归一后三方一致。原始证据不动；验收方自报本轮 DNS 解析失败——如复核仍有读取异常请先重试 raw 直读通道。

## 复验重点

1. **问题9 绑定链可追溯：** steps.md S4 ③ 与本节绑定一致；五条链逐条核（命令见上）。
2. **问题10 状态同步：** 返工表问题 1-11 复验列全部与实际验收历史一致（问题9/10/11 行复验列=待本轮复验）。
3. **问题11 三方核验复核：** 运行 `python -I phase0/tools/s4-appendix-threeway-check.py`（或对 raw 直读核验），对照附录实际编号序列。
4. **S4 自校验可复跑（R1 未验证项）：** 检查器 `python -I basic/tool/check_taskpack.py basic/tasks/b-20261115-phasec-workflow-stats`（预期 ①②④⑤ PASS/③⑥ N/A/Overall=IN_PROGRESS=S4 待复验预期态，输出存档 phase0/tools/s4-checker-output.txt）+一致性核验 `python -I phase0/tools/s4-consistency-check.py`（预期 21/21 PASS，存档 s4-consistency-check-output.txt）——两档案均随待验收 commit 在库，可对 5580d4a 版步骤逐字节复跑。

## 结论

验收结论：PASS（S4 闭环，任务四步全完成，交用户拍板 v0.3 生效）/ REJECT（列具体问题，按"同一问题"规则计数）/ BLOCKED（环境原因如实说明）。通过≠v0.3 生效。
