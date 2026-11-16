# 交付记录：b-20261116-gpt02-arch-review-leg

## 1. 交付概览（IN_PROGRESS 实态，随进度回填）

| 项 | 值 |
|---|---|
| 立项链 | DEC-026 → charter v0.3（DEC-067 Gate1+Gate2 闭环）→ Gate3 用户拍板（DEC-087） |
| 立项契约 | contracts/v1.0/arch-review-report.schema.json（Gate3 后落位冻结，来源=Gate2 定稿草案） |
| 交付物 | phase1/tools/arch_review_leg.py（新增）+公共件抽取（按 S1 设计裁定）+测试矩阵 |
| 验收模式 | A1~A7 验收矩阵（charter §7）+零 mock 实战+独立验收派单链 |
| 授权边界 | 开工授权≠合并授权（DEC-010）；M1-M4 零修改；H2 契约冻结 |

## 2. 阶段验收链（逐轮登记，见 steps.md 返工记录表）

（待验收派单后逐轮登记）

## 3. 证据路径索引（事实）

- 立项：charter v0.3=docs/phase1/GPT02-ARCH-REVIEW-LEG-CHARTER-DRAFT.md（77ff794）；Gate 复审现场 dispatch-2026-11-15T22-*（DEC-065/067）；Gate3 拍板=DEC-087。
- 契约：contracts/v1.0/arch-review-report.schema.json（本轮落位）；草案 docs/phase1/arch-review-report.schema.draft.json（立项评审历史，保留不改）。
- 实施：待填（S2 后）。
- 实战：待填（S3 后）。

## 4. ST-05 自检记录

- IN_PROGRESS 期：待自检（S1 期首跑）。
- COMPLETED 态：待最终取证。

## 5. 范围与授权边界

- 不修改：app/（M1-M4）、contracts/ 既有冻结文件、phase1/tools/scheduler.py、review_leg.py 已验收行为（公共件抽取以 29 用例回归全绿为硬门槛）、docs/立项/ 冻结设计包。
- 本任务登记：basic/tasks/b-20261116-gpt02-arch-review-leg/ 四件套+acceptance/ 证据。

## 6. 交付索引（§3 对账）

| 提交 | 内容 | 归属 |
|---|---|---|
| （待交付 commit） | 四件套+契约落位+DEC-086/087 登记 | 立项与开工登记 |
