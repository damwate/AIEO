# 任务书：AI-Image-Service F1-F4修复 ChatGPT 终审派单（补强终审补发）

- 任务ID：b-20261119-aisvc-gpt-accept
- 日期：2026-11-19
- **版本选型：**
  - 选定版本：Basic
  - 任务等级：S1
  - 选型理由：本任务为 AIEO 控制层派单动作（登记+派单+采集+归档），不修改任何业务代码；S1（材料提交/派单执行）对应 Basic。
  - 批准人/日期：用户拍板，2026-11-19（用户指令原文见 requirement.md）

## 需求原文（用户原话，不加工）

见 `requirement.md`。

## 执行者理解（与原文分开，便于对账）

- 用户要求：完成 F1-F4 修复终审核对后，用 AIEO 项目的 basic 功能把终审提交 ChatGPT 验收；派单前先读 AIEO 开发经验文档（docs/AI-DEV-LESSONS.md）。
- 现场事实（2026-11-19 实查 phase0/logs/）：昨天（2026-11-18）共有 11 轮派单；其中三条简报**发送双验通过但回复未采回**（14-49-45 发版拓扑补充终判、15-37-07 流式读体缺口终审、16-03-21 F1-F4修复终审，均 INBOUND_WINDOW_COMPLETENESS_UNPROVEN）；最后一条 **[F2F3F4补强终审|AI-Image-Service]（dispatch-2026-11-18T16-28-13）因 page.goto ERR_TIMED_OUT 从未送达**。
- 本任务动作＝把从未送达的 [F2F3F4补强终审] 简报（1139 字节，冻结于 dispatch-2026-11-18T16-28-13/request.txt，被审SHA 47f2ecc）经 `phase0/tools/gpt_dispatch.mjs` 向现有审查会话派发并采集回复归档。
- 按 L-018 红线：三条已送达未采集的历史回复**不在本轮重发**；本轮回复采集采用归属校验三件套（L-018 第 4 条）。
- 执行者的独立终审核对（ZCode 本地实跑：四目标测试文件 64 passed；全量 580 passed/11 failed 且 11 个失败在预修复 commit b5efcac 原样复现=基线存量）已在会话中报告用户，不并入派单简报；简报保持冻结原文。

## 落点登记（WORKFLOW 增补④§二）

- 被审对象（只读，本任务不改其代码）：github.com/YotinGarden/AI-Image-Service，分支 fix/yuanqiao-http1-20261117，被审 commit 47f2ecc1f17f51cc1cbb2e326602f9447ed3407e
- 执行工作目录：D:\AIEO（控制层：任务登记/派单/证据归档）

## 验收目标（最终要实现什么）

- 新 dispatch 目录产出 request.txt + reply.txt + result.json；reply 为简报要求的合法 JSON（result=PASS|REWORK），并经归属校验确认属于本轮（简报标记文本唯一定位）；
- reply SHA256 与 dispatch 目录登记于 steps.md ⑥；任务包通过 check_taskpack 自检。

## 优先级：普通

## 任务状态（随进度更新）

| 字段 | 值 |
|---|---|
| 当前状态 | 开发中 |
| 当前步骤 | S1 |
| 最终结果 | （任务完成前暂空） |

## 步骤清单（用户直接指令拍板，2026-11-19 冻结）

1. S1 派单执行：向现有 ChatGPT 审查会话派发 [F2F3F4补强终审] 冻结简报原文 → 采集回复 → SHA256 归档 → steps.md 六要素登记。
