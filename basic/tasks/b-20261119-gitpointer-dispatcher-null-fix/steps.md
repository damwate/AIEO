# 步骤记录：b-20261119-gitpointer-dispatcher-null-fix

## S1 任务登记
- ①目标：按 Basic 工作流登记缺陷修复任务（requirement/task-brief/steps），基线 SHA 登记，ST-05 自检。
- ②修改文件：本任务包三件套。
- ③内容：见 requirement.md / task-brief.md；依据=c2-batch2 delivery §6/§7 + DEC-109 SEPARATE_DEFECT_CONFIRMED。
- ④执行结果：完成；基线 HEAD=`93f2119`。
- ⑤测试结果：ST-05 自检首跑 FAIL（task-brief 缺「优先级」字段）→补字段后复跑 PASS（Phase=PLANNING，Overall=IN_PROGRESS，合法态）。
- ⑥证据：基线 HEAD=`93f2119`（全 40 位见下）；ST-05 两轮输出（FAIL→PASS）已记录。
- 基线完整 SHA：见 requirement.md 依据链；开工前 `git rev-parse HEAD` 实取登记于 S2 派单简报。

## S2 规划协商（待执行）
- 待审查会话迁移简报 + R1 派单（缺陷事实/理解/草案方案→ChatGPT 复审→冻结）。
- 每轮记录 reply SHA256 + 派单目录 + 归属校验结论。

## S3 缺陷修复与双环境验证（待执行）
- 六要素逐步记录：目标/文件/内容/结果/测试/证据。

## S4 独立验收（待执行）
- 逐轮派单验收，PASS/REJECT 结论 + reply SHA 登记，绑定被测 commit（ST-01）。

## S5 收口交付（待执行）
- 完工六查 + delivery 七要素 + commit + check-push 推送。

---

## ST-05 自检记录
- （S1 阶段运行 `python -I basic/tool/check_taskpack.py basic/tasks/b-20261119-gitpointer-dispatcher-null-fix` 后回填）
