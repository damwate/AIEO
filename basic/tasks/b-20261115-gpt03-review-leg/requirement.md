# requirement：b-20261115-gpt03-review-leg

## 需求原文（用户 Gate3 拍板原意，2026-11-15，DEC-057 登记）

> 确认 docs/phase1/GPT03-REVIEW-LEG-CHARTER-DRAFT.md §1 需求原文并批准开工（AskUserQuestion 选择"确认需求原文并批准开工（推荐）"）。

## 需求正文（定稿任务书 §1，已过 Gate1/Gate2 评审，生效链闭环）

> 在 T-P1-908 单任务编排闭环（DRAFT→DEV_REPORTED，phase1/tools/scheduler.py）基础上，接入 GPT-03 审查真实腿最小版：DEV_REPORTED 任务自动触发一次真实 chatgpt.com 审查派单（复用 M2 派单链与 fail-closed 门禁），采集审查回复并经冻结契约校验后登记 M1，审查结论（通过/返工建议）落档并按 M1 既有状态机推进；多轮返工重审、GPT-02/04/05 其余角色不在本期。异常按任务书 §5 分类处置，人工随时可介入。

## 任务书依据

- 定稿：docs/phase1/GPT03-REVIEW-LEG-CHARTER-DRAFT.md v0.7（R3-01 修订）@d0c2d92ea88017397753d2072bb28407b7684956（Gate1 PASS+Gate2 定稿认可+Gate3 用户拍板，DEC-055~057）
- 硬约束：H1~H12（development-plan.md §五）；附录 B-E 为实施直接依据
