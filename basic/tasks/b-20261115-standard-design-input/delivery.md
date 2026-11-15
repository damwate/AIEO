# delivery：b-20261115-standard-design-input（Standard 工作流设计输入准备，DEC-049 P2）

## 原始需求

见 `requirement.md`（2026-11-15 节点自主推进授权确认版；方案冻结=规划 R1 裁定"修改后同意"四点全采纳+节点授权增补②，reply sha256=7bd447f0…96b8c1）。

## 最终实现内容

- **standard/WORKFLOW-DESIGN-INPUT.md《Standard（中级版）工作流设计输入基线》**：编制说明四条（统计唯一基线=workflow-stats.md 直接引用不重算／区分统计事实·设计判断·待验证候选／非实施授权／与既有资产关系）+四节：①真实工作流耗时与往返数据（轮次 18+9 失败、耗时大头=修复+证据制作、一次通过率 1/4、BLOCKED 全证据获取类、可信度边界）②10 项返工问题根因分布与修复成本（根因族 5 类、代码返工 8/10、绑定类复发 3 次含 P0、最大返工 2 止损未触发）③ST-01～ST-12 逐项有效性/自动化空间/Basic-Standard 分界（ST-10/11 标注"不能推导"）④能力候选 C1-C8 统一 8 字段（绑定自动核验／检查器矩阵／反例测试自动化／证据可访问性／派单恢复状态机／MANIFEST 自动生成／轮次状态模型／语义示例库）+不能入列的信号防过度推导+汇总表。
- **边界执行**：不启动 Standard 代码开发、不复制既有资产、basic/ 现行文件零改动（验收方范围核查确认）。

## 修改文件

- standard/WORKFLOW-DESIGN-INPUT.md（新增，被测）
- basic/tasks/b-20261115-standard-design-input/（requirement/task-brief/steps/delivery/acceptance/）
- **未改动**：basic/ 现行流程文件、检查器与测试脚本、standard/ 既有资产

## 测试结果

四命令全过退出 0（归档 acceptance/）：一致性 37/37+DV1 6/6+negpos 7/7+专项 7/7（本任务无检查器演进，37 项预期不受影响实测成立）；本任务 taskpack COMPLETED ①-⑥ 全 PASS（交付 commit 后实态）。

## Git commit

- 链：96355c2（增补②节点授权成文）→a5e5fdf（任务登记）→1a6f96d（S1 被测）→8bc67ec（SHA 明文化登记）→本 commit（S2 交付登记）
- 验收绑定：被测=1a6f96d9f1148e6faf5f1f77a6262601c4428f71；S1 验收 reply sha256=7c67824a6ab5f6932e98ec8b4532daa2783f3c7e90c9c8a7c975319bfc44577c（dispatch-2026-11-15T07-19-32，五点全 PASS，采集一次成功）；规划 reply sha256=7bd447f0d9dde7fb8dbe712ea2faa773242cf4d322646bb8c2948d9fe996b8c1

## 未解决问题

无阻断项。备忘：①本任务产出为设计输入非实施授权，Standard 实施范围与验收标准须单独明确；②候选 C1-C8 的优先级为建议，实施排序属后续决策。

## 后续建议

①DEC-049 P2 完成；剩余 P1 日常任务池（待真实需求）+P3 backlog 两项（挂+重启条件）；②设计输入基线可随 Basic 实战持续增补（新任务数据沿用同口径）；③Standard 实施启动时建议从 C1（绑定自动核验，强信号+部分具备）起步单独立项。
