# 任务书：Instance/Conversation Queue Service 设计

- 任务ID：b-20261121-instance-conversation-queue
- 日期：2026-11-21

## 版本选型

- 选定版本：Standard（Queue Service 设计——多任务并行的编排核心）；任务等级：S1（纯设计交付，零代码）
- 选型理由：DEC-134 立项 PASS+用户架构指令（中控/子agent 模型）；设计先行、审查后编码。
- 批准人/日期：ChatGPT DEC-134（2026-11-21）；DEC-010 红线仍用户本人。

## 执行落点

- 目标仓库：damwate/AIEO；分支：fix/parallel-stage2（设计文档交付）
- 基线：fix/parallel-stage2 tip（C9 已签+改写稿 PASS 之后）

## 需求原文

见 requirement.md（DEC-134 八件+用户追问固化的 profile 生命周期不变量）。

## 执行者理解

- 中控=本会话/中控进程：持有任务队列，按空闲实例派发；子agent/实例=执行单元；实例池管窗口、队列管任务、C9 管门禁、C6 管证据。
- 设计八件按 DEC-134 清单交付，单文档 parallel_queue_design_r1.md 承载。

## 验收目标

- 八件齐备+profile 生命周期不变量等硬约束内化+与既有裁定（DEC-128/130/132/134/136）零冲突；交 ChatGPT 架构审查。

## 优先级：高（阶段3 N=3 评估的前置编排能力）

## 边界

- 第一轮零编码；不执行清理/删除/克隆；DEC-010 红线用户本人。

## 任务状态（随进度更新）

| 字段 | 值 |
|---|---|
| 当前状态 | 开发中 |
| 当前步骤 | S1 设计八件成文 |
| 最终结果 | （任务完成前暂空） |
