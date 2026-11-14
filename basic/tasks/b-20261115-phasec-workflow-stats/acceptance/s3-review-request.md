# 复审请求：b-20261115-phasec-workflow-stats 第 3 步（S3 统计+修订+清单整体独立复审）

**版本：v2（S3 复验请求）。**

- **v1（R1）历史：** 复审请求首发，绑定复审基点 9a2935cabddbb29b9b8d507f48580502b5c36e41，证据包 s3-evidence-v1.zip（ce8c3d5d68ff7f8a6ca8eccdac3905ade2626374，zip sha256=3cb8f4a389127d76eab4632b2c653cbb8a8a06fab9b51510dff5f165ac83a513）。R1 BLOCKED（验收方 GitHub 读取失败请求 ZIP；附件通道经四步诊断确认根因=账号级文件附件配额耗尽，非工具故障，如实报告）→ 按精确 raw URL 直读通道解除 → **R2 复审实际完成：NEEDS RECTIFICATION 3 项**（reply sha256=14a603837fe7487848c9373965a9858a6536f36262b820fe3091728b29700b98）：问题6 ST-01 parent 核验规则不够明确（P1）/ 问题7 清单三态与 BLOCKED 衔接缺规则（P1）/ 问题8 附录 ST-10/11 与统计 §十三不一致（P1）；五模块中"版本完整性""独立结论边界"两项 PASS，31 项清单结构独立重数核对 PASS。
- **本 v2：** 三处整改已完成（整改 commit 355a9b146e6e2fabc7de37f90a6174ae438e749e），遵验收方整改边界指令（只改三问题/不重写 WORKFLOW/不改 31 项清单总体结构/不修改已通过统计数字/不改变 v0.2 现行状态），提交复验。

## 绑定（v2 更新）

- 分支：main（https://github.com/damwate/AIEO.git）
- **复验基点 commit：`ce8c3d5d68ff7f8a6ca8eccdac3905ade2626374`**（R2 复审时的证据提交版本；原复审基点 9a2935c 的直接后继，R2 已核验 9a2935c→ce8c3d5 仅增复审请求+ZIP 证据两 commit）
- **待验收 commit：`355a9b146e6e2fabc7de37f90a6174ae438e749e`**（S3 整改唯一 commit；申报前核验已跑：`git rev-list --count ce8c3d5..355a9b1`=1，parent=`git show -s --format='%H %P' 355a9b1`=ce8c3d5，符合 ST-01 单 commit 细则——本细则即问题6 整改内容，首次实操自证）
- 整改涉及文件（5）：basic/WORKFLOW.md（模块四 ST-01 条款细化+附录 ST-10/11 行对齐统计）、basic/templates/acceptance-request.md（申报前核验条款同步）、basic/ACCEPTANCE-CHECKLIST.md（文件头增 BLOCKED 边界总体规则）、basic/tasks/b-20261115-phasec-workflow-stats/steps.md（S3 ④⑥ 登记+返工表问题6/7/8 行）、basic/tasks/b-20261115-phasec-workflow-stats/task-brief.md（状态更新）。
- **绑定声明：** 其后的回填 commit（本 v2 复审请求+过程证据归档）不属验收 diff 范围（ST-01 条款④，承前任务 S4 先例 43cd5da→afecef5）。复审通过≠v0.3 生效——生效拍板留用户（代授权范围外）。
- **读取通道：** 附件配额尚未重置（11月16日 1:29），请继续用 raw 直读：`https://raw.githubusercontent.com/damwate/AIEO/355a9b146e6e2fabc7de37f90a6174ae438e749e/<仓库路径>`（上表五文件+workflow-stats.md）。

## 复验重点（v2，四处）

1. **问题6 整改落地：** basic/WORKFLOW.md 模块四"绑定申报核验（ST-01）"条款已补 parent 核验细则——`git show -s --format='%H %P' <待验收commit>`；单 commit 申报 parent 必须等于申报基线；多 commit 申报首端=基线、尾端=待验收 commit 且链上无 merge commit（出现 merge 改报 diff 基线并单独说明）。basic/templates/acceptance-request.md"申报前核验"同步同样细则。
2. **问题7 整改落地：** basic/ACCEPTANCE-CHECKLIST.md 文件头增第 4 条总体规则"BLOCKED 边界"——BLOCKED 是任务级验收阻断状态（WORKFLOW 模块四），不是清单第四种项目判定状态；环境原因无法完成检查时不得标 N/A 或 PASS，如实记录阻断原因，任务整体维持 BLOCKED，解除后继续检查。
3. **问题8 整改落地：** basic/WORKFLOW.md 文末附录 ST-10/11 行已对齐 workflow-stats.md §十三 原文——ST-10=同问题最大返工次数 2、三轮止损未触发（维持）；ST-11=规划 2 轮 12 分钟收敛、效率良好（无修订信号，维持）；"六查机制有效性 10/10 集中独立验收"表述改归属为发现来源统计观察，不属 ST 编号条目。
4. **已通过项未受影响核验：** v0.3 草案状态与版本管理未动（生效状态 blockquote 原文保留）；31 项清单总体结构未动（仅文件头增 1 条规则）；统计数字未动（workflow-stats.md 未修改）；v0.2 现行状态未动；附录差异记录 12 行编号未动。

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
