# 复审请求：b-20261115-phasec-workflow-stats 第 3 步（S3 统计+修订+清单整体独立复审）

**版本：v3（S3 复验请求，问题6 第 2 次整改后）。**

- **v1（R1）历史：** 复审请求首发，绑定复审基点 9a2935cabddbb29b9b8d507f48580502b5c36e41，证据包 s3-evidence-v1.zip（ce8c3d5d68ff7f8a6ca8eccdac3905ade2626374，zip sha256=3cb8f4a389127d76eab4632b2c653cbb8a8a06fab9b51510dff5f165ac83a513）。R1 BLOCKED（验收方 GitHub 读取失败请求 ZIP；附件通道经四步诊断确认根因=账号级文件附件配额耗尽，非工具故障，如实报告）→ 按精确 raw URL 直读通道解除 → **R2 复审实际完成：NEEDS RECTIFICATION 3 项**（reply sha256=14a603837fe7487848c9373965a9858a6536f36262b820fe3091728b29700b98）：问题6 ST-01 parent 核验规则不够明确（P1）/ 问题7 清单三态与 BLOCKED 衔接缺规则（P1）/ 问题8 附录 ST-10/11 与统计 §十三不一致（P1）；五模块中"版本完整性""独立结论边界"两项 PASS，31 项清单结构独立重数核对 PASS。
- **v2 历史：** 三处整改 commit 355a9b1（单 commit，parent=ce8c3d5）→ **R3 复验**（reply sha256=47c9cce7cfecbf504748ea84073a90c21e601e8d0921c1409cc701eebd9fe064）：问题7（BLOCKED 边界）、问题8（ST-10/11 对齐）**PASS**，已通过项保护复核八项全过；唯问题6 仍未闭环——git show -s 仅见首末 parent、rev-list --count 仅核数量，不能证明多 commit 区间逐条线性无 merge，缺可复跑命令与逐项判定条件。
- **本 v3：** 问题6 第 2 次整改完成（commit 09e7797，按 R3 验收方最小方案），问题7/8 已 PASS 内容未做任何改动，提交复验。问题6 返工计数=第 2 次（同问题最大 2 次）。

## 绑定（v3 更新）

- 分支：main（https://github.com/damwate/AIEO.git）
- **复验基点 commit：`a74db982484d3703cd6430edb27569034b891be4`**（R3 复验时的最新回填版本，含 v2 请求+证据归档；R3 已核验 ce8c3d5→355a9b1 单 commit 整改+将 a74db98 认定为不纳入验收 diff 的回填）
- **待验收 commit：`09e7797c565fd1bfef9cf4151e4b14c0fbd6a786`**（S3 问题6 第 2 次整改唯一 commit；申报前核验已跑：`git rev-list --count a74db98..09e7797`=1，parent=`git show -s --format='%H %P' 09e7797`=a74db98，符合 ST-01 单 commit 分支；多 commit 分支命令语义已实测演示=`git rev-list --reverse --parents 9a2935c..a74db98` 四条线性全满足新通过条件——首条唯一 parent=9a2935c、逐条 parent=上一条、末条=a74db98）
- 整改涉及文件（4）：basic/WORKFLOW.md（模块四 ST-01 条款多 commit 核链细则）、basic/templates/acceptance-request.md（申报前核验同步）、steps.md（④⑤⑥ 登记+返工表问题6 行）、task-brief.md（状态更新）。
- **绑定声明：** 其后的回填 commit（本 v3 复审请求+过程证据归档）不属验收 diff 范围（ST-01 条款④，承前任务 S4 先例 43cd5da→afecef5）。复审通过≠v0.3 生效——生效拍板留用户（代授权范围外）。
- **读取通道：** 附件配额尚未重置（11月16日 1:29），请继续用 raw 直读：`https://raw.githubusercontent.com/damwate/AIEO/09e7797c565fd1bfef9cf4151e4b14c0fbd6a786/<仓库路径>`（basic/WORKFLOW.md、basic/templates/acceptance-request.md、basic/tasks/b-20261115-phasec-workflow-stats/steps.md；问题7/8 落点未动如需复核同法读 basic/ACCEPTANCE-CHECKLIST.md）。

## 复验重点（v3，两处）

1. **问题6 第 2 次整改落地（唯一遗留）：** basic/WORKFLOW.md 模块四"绑定申报核验（ST-01）"② 多 commit 申报已增逐条核链命令 `git rev-list --reverse --parents <基线>..<待验收commit>` + 通过条件四则（第一条 commit 的唯一 parent 必须等于基线；后续每条只有一个 parent 且等于上一条 commit 的 SHA；最后一条等于待验收 commit；任一条出现多个 parent 即存在 merge commit，不得按普通线性多 commit 申报，应改报 diff 基线并单独说明），并明示 rev-list --count 仅核数量、git show -s 仅见首末 parent、均不能替代逐条链验证；basic/templates/acceptance-request.md"申报前核验"同步同套命令与条件。
2. **已通过项未受影响核验：** R3 已 PASS 的问题7（清单 BLOCKED 边界规则）与问题8（附录 ST-10/11 对齐）本轮未做任何改动（diff 仅 ST-01 条款+模板核验句+流程登记）；31 项清单结构、统计数字、v0.2 现行状态、差异记录 12 行编号、v0.3 草案状态均未动。

## 复审标准（S3 出口条件，steps.md 冻结原文照录，不变）

不仅查文字还查规则可执行性（四步流程/两道关口/止损/交付条件无内部冲突），不由执行者自宣通过。

## v1 复审重点（五处，历史存档——R2 已按此执行：模块 1/2/3 产生问题6/7/8，模块 4/5 PASS）

1. **WORKFLOW v0.3 新条款可执行性：** 模块三 ST-05 申报前检查器自检/ST-06 工具缺陷处理、模块四 ST-02 轮次口径/ST-01 绑定申报核验/ST-03 BLOCKED 解除四路径/ST-04 混合结论/ST-12 证据包结构、派单工具链 ST-08/09 双路径——逐条"执行者按文能否操作"？与既有条款（模块二两道关口/模块四两态+BLOCKED/模块五止损/模块六交付）有无冲突或重复冗余？
2. **验收清单可执行性：** 31 项×六字段——每项"检查方法"可操作？三态规则/N-A 限制/整体通过条件自洽？与检查器分工边界清晰（C-4/F-5 与检查器自检关系）？
3. **统计↔修订一致性：** WORKFLOW 附录 12 行对照表与 workflow-stats.md §十三 ST-01~ST-12 追踪表的建议修订位置吻合（含 ST-07→清单 C-3/D-2 映射、ST-10/11 维持声明、非统计驱动 1 处单独标注）？
4. **v0.2→v0.3 完整性：** 版本注记"用户拍板生效前 v0.2 仍为现行版"+生效日期/批准依据回填位+差异记录完整性；未修订模块列明是否属实。
5. **复审结论独立作出**，不以执行者自测/逐步验收结论代替。

## 结论

复验通过（S3 闭环，允许进入 S4 整体校验交付）/ 需整改（列具体问题，按"同一问题"规则计数）/ BLOCKED（环境原因如实说明）。复验通过≠v0.3 生效。
