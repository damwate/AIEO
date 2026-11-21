# 任务书：Queue Service Phase B 骨架

- 任务ID：b-20261121-queue-phaseb
- 日期：2026-11-21

## 版本选型

- 选定版本：Standard（Queue Service 编排核心——DEC-141 Phase B 授权执行）；任务等级：S2（新组件纯增量，零已验收实现修改）
- 批准人/日期：ChatGPT DEC-141（2026-11-21）+ 用户"开工吧，不要等我"指令；DEC-010 红线仍用户本人。

## 执行落点

- 目标仓库：damwate/AIEO；分支：fix/parallel-stage2（Phase B 交付）；基线=6e0a26a3646577f4a95421307ccd7ade21433a38（授权基线）

## 需求原文

见 requirement.md（DEC-141 授权边界+用户指令逐字）。

## 执行者理解

- 骨架=TaskQueue 权威账本+InstancePool+Execution 记录+原子认领接口+C9_CHECKING 调用+崩溃恢复窗口表——全部按 parallel_queue_design_r1.md R6 终验版实现。
- 双入口=同一 claimTask CLI（人工中控与未来 Queue 进程同接口）；Phase B EXECUTING 由外部实际派单驱动（影子语义），Queue 记账与恢复。
- 五项测试=DEC-137 §⑧ 机器化标准逐项（双入口并发认领/崩溃五点/C9 BLOCKED 零浏览器/C6 四方追溯/回滚演练）。

## 验收目标

- 五项测试全 PASS+phase0 回归零回归+既有约束零修改；交 ChatGPT 独立验收（Phase B 验收，通过后阶段3/N=3 另行申请）。

## 优先级：高（DEC-141 授权链当前节点）

## 边界

- 零修改已验收实现；零运行态变更；DEC-010 红线用户本人。

## 任务状态（随进度更新）

| 字段 | 值 |
|---|---|
| 当前状态 | 开发中 |
| 当前步骤 | S1 实现 |
| 最终结果 | （任务完成前暂空） |
