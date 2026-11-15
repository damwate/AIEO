# steps：b-20261115-basic-dod（Basic 产品级完成标准 DoD 固化）

- 方案冻结记录：规划协商 R1 裁定"修改后同意"（reply sha256=b01107a3a234acfecf7a96a12a25982f78fc3a607a7ed18d5df1fd9b905b5612），要点全采纳：四要素结构+状态定义表（PASS/FAIL/BLOCKED/未验证）/BC-03=BLOCKED 标 G5 未验证不包装/BC-06=FAIL（零代码类实战）/BC-12=BLOCKED+独立六步签核流程/双口径统计（历史实战 7 包 vs 当前目录 8 包，统计截止点规则）/12 条主体不增不减+逐条定向修订/三处落位（dod 文件+review-request 修正+decision-log 澄清）；"修改后同意"不是预验收，文档成文后仍需 ChatGPT 复审；**DoD 文档验收 PASS≠Basic 整体完成**
- 规划协商证据：dispatch-2026-11-15T09-47-02（fail-closed）→recoll_dod_plan.mjs 补采 recoll-2026-11-15T09-49-56-724Z（reply sha256=b01107a3…b5612）。规划材料绑定 commit=61fe67b

## S1 DoD 文档成文与统计口径修正

- ①本步骤目标：docs/phase1/basic-completion-dod.md 成文（12 条四要素+状态定义+双口径统计+BC-12 签核流程）；review-request 计数修正；decision-log 澄清
- ②修改文件：docs/phase1/basic-completion-dod.md（新增）、docs/phase1/basic-completion-review-request.md（计数修正）、basic/tasks/b-20261115-basic-dod/
- ③修改内容：见 ④
- ④执行结果：DoD 文件成文（12 条四要素+四态状态定义+双口径统计头部+BC-12 六步签核流程+完成路径表；BC-03=BLOCKED/BC-06=FAIL/BC-12=BLOCKED 如实标注）；review-request 计数修正（双口径）；DEC-051 澄清条目登记。**待验收 commit 完整 SHA：见本 commit（S1 成文）**
- ⑤测试结果：四命令全过退出 0（37/37+DV1 6/6+negpos 7/7+专项 7/7，检查器零修改）
- ⑥验收证据引用：待验收派单后登记

## S2 独立验收与交付

- ①本步骤目标：ChatGPT 复审通过，交付登记
- ②修改文件：本任务包 delivery.md
- ③修改内容：待执行后登记
- ④执行结果：待登记
- ⑤测试结果：待登记
- ⑥验收证据引用：待验收派单后登记
