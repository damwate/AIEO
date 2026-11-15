# S1 验收请求：b-20261115-standard-kickoff（阶段 A 治理基线）

## 绑定申报（ST-01，机器预检已过）

- **验收基线：** `965491411b53102b62c08f5c5a0a6e22091ab11a`（规划冻结+DEC-053 commit）
- **待验收 commit（单 commit 申报）：** `a5d0afdc8712cc38fa70663f239cb74d8d6fec0d`
- **绑定核验：** parent=965491411b53…（=基线 ✓）；`git rev-list --count 基线..待验收`=1 ✓；diff=恰 3 文件（standard/WORKFLOW.md 新增 62 行／standard/parallel-governance-draft.md +16-4／docs/PHASE-STATUS.md +12-1）
- **本请求所在回填 commit 不属验收 diff 范围**（ST-01 ④声明：steps.md SHA 回填+本请求文件）

## 验收标准与对照材料

按 `standard/development-plan.md`（v0.2，@a5d0afd 同样可读）阶段 A 验收标准 A1~A5：

| 项 | 标准 | 对照位置 |
|---|---|---|
| A1 | 六模块＋并行治理入口＋版本定档逐项映射表（差异条款溯源=设计输入①②③或用户指令＋落位文件） | standard/WORKFLOW.md 版本头/§1-§5/附录 A（D1-D12） |
| A2 | 决议红线核对清单：DEC-010/011/017/026/037/044/045/049-052 | standard/WORKFLOW.md §2/§3/附录 A 来源列 |
| A3 | 四状态机制（草案→复审通过→用户批准→生效），当前标注草案 | standard/WORKFLOW.md 状态头；M2 文件状态块 |
| A4 | Basic 兼容与资产纪律：Basic 文件未被不必要修改/无 Basic→Standard 运行时依赖/phase0/logs 未动/契约未动/资产映射未动 | 本 commit diff 实查（3 文件均在 standard/ 与 docs/） |
| A5 | M2 文件元数据：版本号 v0.1/状态"规范候选待用户批准"/未经批准不生效标注/版本记录注明 Basic 草案→Standard 规范候选 | standard/parallel-governance-draft.md 状态块+§6 |

## 本步骤边界声明

- WORKFLOW 与 M2 均=草案/规范候选态，**未生效**（H5/H6）；生效另待用户拍板。
- 本步骤不动代码（纯文档）；不涉及契约修改（H2）/DEC-017 门禁（H3）/main 合并类操作。
- S2/S3 未开工（步骤清单冻结序：S1 验收 PASS 后才进 S2）。

## 请验收方执行（验收六查）

①是否符合 S1 目标（三件产出）②是否符合规划 v0.2 阶段 A 设计③修改是否超范围（diff=3 文件）④文档质量与内部一致性（条款间无冲突、引用路径实存）⑤"测试"=A1-A5 逐项对照判定⑥证据可核查（GitHub 直读指定 commit）。

**回执格式：** 六查逐项结论＋A1-A5 逐项判定＋总结论（PASS/REJECT＋问题编号）。
