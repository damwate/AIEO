# 需求原文：GPT-02 架构审核真实腿最小版接入

- 任务ID：b-20261116-gpt02-arch-review-leg
- 日期：2026-11-16
- 立项链：DEC-026 路线 → charter `docs/phase1/GPT02-ARCH-REVIEW-LEG-CHARTER-DRAFT.md` v0.3（Gate1+Gate2 全闭环 DEC-067）→ **Gate3 用户拍板（2026-11-16 主会话，选择"确认原文，批准开工"）→ DEC-087 登记**

## 用户 Gate3 拍板记录（2026-11-16）

- 拍板方式：主会话 Gate3 问答（AskUserQuestion），用户选择 **"确认原文，批准开工"**。
- 确认对象：charter v0.3 §1 需求原文拟定稿（冻结为用户确认版）。
- 授权范围：实施+验收派单链；PASS≠合并授权（DEC-010）、不改冻结契约文本（H2）、M1-M4 代码零修改（charter §9）。

## 需求原文（charter §1 冻结版，逐字）

> "在 GPT-03 审查真实腿最小版（`phase1/tools/review_leg.py`，b-20261115-gpt03-review-leg，DEC-058~062）同框架基础上，接入 **GPT-02 架构审核真实腿最小版**：M1 状态机 ARCH_REVIEW 态任务自动触发**一次**真实 chatgpt.com 架构审核派单（复用 M2 派单链与 fail-closed 门禁），采集审核回复并经冻结契约校验后登记 M1，审核结论（通过/返工/阻塞）落档并按 M1 既有状态机推进（PASS→READY／REWORK→REWORK）；**GPT-04/05、多轮返工重审自动化不在本期**。异常按 §5 分类处置，人工随时可介入。"

## 边界约束（charter §9 不在范围清单，逐字）

GPT-04/GPT-05 真实腿；多轮返工重审自动化；规划流（PLANNING 前）改造与任务分解生成；scheduler.py 修改；多任务/多批次编排；新 commit 重审触发；契约修改（既有冻结文本）；M1-M4 代码修改；管理后台。
