# 任务书：会话上下文管理根治（账本+预检门+上限态检测）

- 任务ID：b-20261122-session-ctx-mgmt
- 日期：2026-11-22
- **版本选型：**
  - 选定版本：Standard
  - 任务等级：S3（平台工具链代码修改——phase0/tools 派单工具+经验库规范）
  - 选型理由：用户点名"改下标准版会话上下文管理…一定要解决"；涉及 gpt_dispatch.mjs/check_conv_units.mjs 代码修改与 L-018 规范修订；流程基座=Basic v0.3 六模块。
  - 批准人/日期：用户指令（2026-11-22，requirement.md）

## 需求原文

见 requirement.md。

## 执行者理解（与原文分开，便于对账）

1. **记录**：三次审查会话上下文事故（6afe8e59/6aff4117/6b009b70）进 AI-DEV-LESSONS（L-018§6 增强），登记 decision-log。
2. **根治**（用户强调"一定要解决"）：把"程序没能检测到"变成"程序能检测到"——
   a. **会话用量账本**：phase0/logs/session-usage/<uuid>.json，每次派单后累计 turns/in_bytes/out_bytes（数据源=result.json 现成字段）；
   b. **发送前预检门**：gpt_dispatch.mjs 发送前读账本，超阈值告警（超硬阈值拒发并提示 --new-session），阈值可配置；
   c. **上限态结构化检测**：check_conv_units.mjs --diagnose（已实现侦察版：横幅关键词扫描+控件态），并入 UNCERTAIN 诊断路径——本次实拍签名=持久横幅「上下文窗口已达上限」（composer 仍可输入，发送端不拦）；
   d. **计数规则修正**：L-018§6 的"4 条 user 消息"规则按消息数计数，本次 6b009b70 撞上限时 user 消息仅 ~8 条——**按数计不按量计是规则缺陷**，增补字节预算规则。
3. 边界：ChatGPT 上下文窗口阈值非公开，首版阈值（warn 24KB/hard 48KB 累计 in+out 文本）为估计值，可配置+随数据校准，如实登记。

## 验收目标

- 三次事故根因分析成文；账本+预检门+诊断增强实现并自测（含真实 6b009b70 上限态实测）；L-018§6 修订；ChatGPT 方案裁定归档；独立验收 PASS。
- 分支交付：fix/session-ctx-mgmt；main 合并待用户拍板（DEC-010）。

## 当前状态

| 字段 | 值 |
|---|---|
| 优先级 | 高 |
| 当前状态 | 开发中 |
| 当前步骤 | S2 本地分析（侦察已得 DOM 签名） |
| 最终结果 | （完成时填写） |

## M2 并行登记

- 单任务串行（不涉并行）；目标仓库=AIEO 本仓（工具链），分支 fix/session-ctx-mgmt，基线=59da346174ce96ad26929595b05423a125e20a25 之后当前 main HEAD。
