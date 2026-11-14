# 验收请求：b-20261115-phasec-workflow-stats 第 4 步（S4 整体校验交付）

**版本：v3（复验请求）。** v1 用于 R1 独立验收（REJECT 3 项=问题9/10/11）；v2 用于 R2 复验（REJECT 2 项=问题12/13，同时 R1 三问题整改全部 PASS、问题11 经验收方自查纠正=R1 误判[5580d4a 版编号 1-12 全在]）——本版为第 2 次整改后 R3 复验请求。验收标准=S4 出口条件（steps.md 冻结原文）：交付完整，等待用户拍板生效。

## 绑定（v3 复验）

- 分支：main（https://github.com/damwate/AIEO.git）
- **复验基点 commit：`d8d201a3b95e804ba6fc4f89cd3ce83f2cea02c8`**（R2 待验收对象，R2 已逐项核验双 commit 线性）
- **待验收 commit：本回填 commit（HEAD）。** Git 自引用结构性限制如实声明：commit 无法将自身 SHA 写入自身文件，本 commit SHA 由本节申报并经 `git rev-parse HEAD` 对照核验，申报后实跑结果随派单简报给出。
- **待验收 diff：d8d201a→本 commit 双 commit 线性链（多 commit 申报，按 ST-01 逐条核链）：**
  1. `8aa60e8891f3d5dc256f5a8187112430efa60bb1`（R2 两问题整改主体：问题12 三文件状态同步+⑧组实质化、问题13 三方脚本失败处理；唯一 parent=d8d201a）
  2. 本回填 commit（返工表问题12/13 修复 SHA 回填+问题12 行描述列竖线字符修正[原嵌入字面 `|` 致表格单元格错位] +本请求 v3+R2 轮证据归档+三输出档案最终态重生成；唯一 parent=8aa60e8）
  - 申报前核验已跑：`git rev-list --reverse --parents d8d201a..HEAD` 两条线性全过 ST-01 四通过条件+`git rev-list --count d8d201a..HEAD`=2；实跑输出随派单简报逐条列出。
- **R2 轮绑定完整链（问题12/13 追溯用）：** cc030ff322f6dbaf0d1222b088dfffcba73216b5（R1 请求回填）→ccc9c5570eb14d2369a7c87e45df5f3f9bc54405（R1 整改）→d8d201a3b95e804ba6fc4f89cd3ce83f2cea02c8（R1 证据回填）→8aa60e8…（R2 整改）→本 commit（R2 证据回填）——五条线性，`git rev-list --reverse --parents cc030ff..HEAD` 可逐条核。
- **绑定声明：** 本任务其后闭环/文档 commit 不属验收 diff 范围（ST-01 条款④）。S1-S3 已闭环（30b56de/0604231/09e7797）沿用 R1/R2 结论"不推翻"；R2 已认定"不要求重新做 S1、S2、S3，也不要求重新统计或重写 WORKFLOW"。
- 验收通过≠v0.3 生效——生效拍板留用户（代授权范围外）。

## R2 两问题整改对照

1. **问题12（P1）三文件交付状态矛盾：** task-brief 当前步骤已改"S4 复验中（R1 三项通过+R2 两项整改中待 R3 复验…）"实态；delivery.md 测试结果段改为"验收留痕全部由 ChatGPT 独立作出；S1/S2/S3 独立验收已闭环（R2/R3/R4 PASS），S4 独立验收进行中——R1 REJECT 3 项→整改→R2 复验 REJECT 2 项→第 2 次整改后待 R3 复验"，弃用「四步独立验收全闭环」表述；一致性脚本 ⑧ 组由存在性检查改为**实质比较**（⑧a2 task-brief 当前步骤实态含 R3 复验指向/⑧b steps S4 区段含 R2 REJECT 2 项登记/⑧c delivery 区分表述且断言「四步独立验收全闭环」不得残留）——重跑 24/24 PASS（组数 21→24=⑧ 3 组拆 6 组+⑥a 返工表随实态 11→13 行，修正记录在脚本头注）。
2. **问题13（P1）三方核验脚本失败处理缺陷：** raw 获取失败时 `three_same` 直接判 False（不降级为两方比较）；通过条件收紧为三条全过（①raw 成功获取 ②三方 SHA 全部存在且一致 ③编号序列严格=1-12），任一失败 `sys.exit(1)`；失败路径实测（invalid 域名副本）exit=1、正常路径 exit=0；历史存档输出保留，脚本修复后重跑存档（phase0/tools/s4-appendix-threeway-check.py+输出 .txt）。

## 复验重点

1. **问题12 三文件实质状态：** task-brief/delivery/steps.md 当前表述与 S4 实态（待 R3 复验）一致；⑧ 组可复跑：`python -I phase0/tools/s4-consistency-check.py`（预期 24/24 PASS）。
2. **问题13 失败处理：** `python -I phase0/tools/s4-appendix-threeway-check.py`（预期三条件全 PASS+exit=0）；失败路径可将脚本内 raw URL 临时替换为无效域名复现 exit=1。
3. **三项命令可复跑（回应 R1/R2"未验证"项）：** 检查器 `python -I basic/tool/check_taskpack.py basic/tasks/b-20261115-phasec-workflow-stats`（预期 ④ PASS/Overall=IN_PROGRESS=S4 待复验预期态）+上述两脚本——三份输出档案均随待验收 commit 在库。
4. **环境如实声明：** 本机为 Windows 10（Git Bash），无独立 Linux 环境；三项命令在本机重新执行，本机可联网（GitHub raw 直读成功=联网可达证据），完整输出已存档。如验收方需要特定 Linux 环境输出，其环境恢复后可复跑同命令核对存档。

## 结论

验收结论：PASS（S4 闭环，任务四步全完成，交用户拍板 v0.3 生效）/ REJECT（列具体问题，按"同一问题"规则计数）/ BLOCKED（环境原因如实说明）。通过≠v0.3 生效。
