# 任务书：派单可靠性整改·真实 ChatGPT 试跑（DEC-118 F06 验收边界闭环）

- 任务ID：b-20261121-dispatch-reliability-trial
- 日期：2026-11-21

## 版本选型

- 选定版本：Basic（作业流程=WORKFLOW v0.3；工作产品=真实 ChatGPT 现场试跑证据链 + L-018 补采驱动/审计脚本三件）
- 任务等级：S2（按风险定：真实平台现场观测+进程 kill+错页导航注入，零生产代码修改，风险=现场副作用可控）
- 选型理由：DEC-119 ChatGPT 拍板"方案 R1 有条件通过"（reply 555f8fe5…）+ L-020 节点自主推进授权；纯试跑观测，无代码/契约/运行时变更。
- 批准人/日期：ChatGPT 方案拍板（DEC-119，2026-11-21）+ 用户 L-020 授权（2026-11-15 两次指令）；DEC-010 红线仍用户本人。

## 执行落点

- 目标仓库：damwate/AIEO（本地 d:/AIEO，远程 https://github.com/damwate/AIEO.git）
- 目标分支：fix/dispatch-reliability（试跑登记流；每步完成后单独 commit，不合并、不发布）
- 工作目录：d:/AIEO
- 基线 commit：c8b3d042d61209f29c8cff48923e700c5a6b2980（被测整改提交，全程未漂移；生产代码零修改）

## 需求原文

见 requirement.md（用户指令逐字 + DEC-119 拍板）。

## 执行者理解（与原文分开，便于对账）

- DEC-118 F06 把"真实 ChatGPT 错页拦截、现场 marker 回退、原会话补采"划为试跑项（开发自测只覆盖纯函数与本地仿真）；本任务=按 DEC-119 冻结执行序 T1b→T1a→T2甲→T2乙→T3 逐项真实现场构造并留证，每项独立 PASS/FAIL/BLOCKED。
- T1a 的"错页"=导航不存在 UUID 的真实重定向（DEC-117 事故形态重放）；其零 Enter 证据必须四项独立（回执 NOT_SENT/指针 SHA 不变/派单 1 次/落点 DOM 零新增对照），缺一=证据不足。
- T2甲 的中断=SEND_CONFIRMED 回执出现后立即 kill（外置回执 AIEO_DISPATCH_SEND_RECEIPT 轮询）；T3 补采必须绑定该回执（键形对照：回执相对键 fallback-turn-N:M:user 与物化键 <uuid>:N:user 尾段一致性）。
- T2乙 不可稳定构造时如实登记"未能构造"，不重试不延长。
- 独立复核为尾项：试跑结论交 ChatGPT 复核后另行登记；main 合并（DEC-010）不在本任务范围。

## 边界

- 零生产代码修改（phase0/phase1/contracts/M1 冻结）；仅新增方案/驱动/审计/简报/任务包文件。
- 全程简报一次性非敏感；副作用会话只登记留置（本试跑实测未产生副作用会话）。

## 任务状态（随进度更新）

| 字段 | 值 |
|---|---|
| 当前状态 | 试跑执行完成，待独立复核 |
| 当前步骤 | S1 方案拍板 PASS（DEC-119）/ S2 T1b PASS / S3 T1a PASS / S4 T2甲 PASS / S5 T2乙 BLOCKED=未能构造 / S6 T3 PASS / S7 交付登记进行中（DEC-120 已登记，独立复核派单待回）；被测 commit c8b3d042d61209f29c8cff48923e700c5a6b2980 未漂移，生产代码零修改 |
| 最终结果 | 试跑 4 PASS + 1 BLOCKED（未能构造，非缺陷）；独立复核结论待回（本表随复核更新） |
