# steps：b-20261115-standard-design-input（Standard 工作流设计输入准备）

- 方案冻结记录：规划协商 R1 裁定"修改后同意"（reply sha256=7bd447f0d9dde7fb8dbe712ea2faa773242cf4d322646bb8c2948d9fe996b8c1），四点修改全采纳（四节结构+文件落位 standard/WORKFLOW-DESIGN-INPUT.md+候选统一 8 字段与推导口径+既有资产关系三原则），**依节点自主推进授权（WORKFLOW 增补②，96355c2）以"ChatGPT 复审通过+节点授权"替代用户逐项拍板**；边界保持=统计数字只引用不重算/basic 现行零改动/不启动 Standard 代码/设计输入复审通过≠Standard 实施授权
- 规划协商证据：dispatch-2026-11-15T07-11-12（发送双验通过，采集 fail-closed，禁重发）→ recoll_sd_plan.mjs 归属校验型补采 recoll-2026-11-15T07-14-15-472Z（七查全过，reply sha256=7bd447f0d9dde7fb8dbe712ea2faa773242cf4d322646bb8c2948d9fe996b8c1）。规划材料绑定 commit=a5e5fdf1aabbdab1fd89779e7606674de29990b4

## S1 设计输入文档成文

- ①本步骤目标：standard/WORKFLOW-DESIGN-INPUT.md 成文（编制说明+四节+能力候选清单），三类信息齐备且每项数据溯源 workflow-stats.md
- ②修改文件：standard/WORKFLOW-DESIGN-INPUT.md（新增）、本任务包 task-brief/steps/acceptance/
- ③修改内容：编制说明四条（统计唯一基线+直接引用不重算+区分统计事实/设计判断/待验证候选+非实施授权）；一、耗时与往返（轮次结构+耗时结构表+结果与阻塞分布，含口径教训与可信度边界）；二、根因分布与修复成本（等级/根因族/成本表+可避免性）；三、ST-01~ST-12 逐项表（信号/现行措施/前移空间/Basic-Standard 分界判断，ST-10/11 标注"不能推导"）；四、能力候选 C1-C8 统一 8 字段（名称/统计依据/解决的问题/预期改善/Basic 已有及不足/为何需要 Standard/尚缺验证/现有资产+优先级建议）+不能入列的信号防过度推导+汇总表。**待验收 commit 完整 SHA：1a6f96d9f1148e6faf5f1f77a6262601c4428f71（S1 文档成文+任务包登记，内容定格；本任务无检查器演进）**
- ④执行结果：文档成文；R1 四点修改全落实（四节/落位/8 字段/资产关系"已具备/部分具备/尚未具备"标注）；检查器与 basic 现行文件零改动（task-brief 四节结构同步更新）
- ⑤测试结果：四命令全过退出 0=一致性 37/37+DV1 6/6+negpos 7/7+专项 7/7（归档 acceptance/；本任务不含检查器演进，37 项预期不受影响实测成立）
- ⑥验收证据引用：dispatch-2026-11-15T07-19-32（采集一次成功），reply sha256=7c67824a6ab5f6932e98ec8b4532daa2783f3c7e90c9c8a7c975319bfc44577c，五点全 PASS+数字抽核一致+范围核查（被测绑定 1a6f96d 未混入 8bc67ec）；**S1 验收结论：PASS**

## S2 独立验收与交付

- ①本步骤目标：ChatGPT 独立复审通过，登记交付
- ②修改文件：本任务包 delivery.md（交付时）
- ③修改内容：delivery.md 七要素成文；task-brief 转完成态；本⑥证据链登记
- ④执行结果：S2 交付登记完成；任务 COMPLETED
- ⑤测试结果：四命令全过（同 S1，无检查器演进）
- ⑥验收证据引用：S1 验收 dispatch-2026-11-15T07-19-32（reply sha256=7c67824a6ab5f6932e98ec8b4532daa2783f3c7e90c9c8a7c975319bfc44577c，五点全 PASS）；**S2/交付登记 commit=本 commit；S1 验收结论：PASS 已由验收方签发**
