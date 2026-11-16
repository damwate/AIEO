# 任务书：GPT-02 架构审核真实腿最小版接入

- 任务ID：b-20261116-gpt02-arch-review-leg
- 日期：2026-11-16
- **版本选型：**
  - 选定版本：Standard（工作产品=平台真实腿接入；作业流程=Basic 工作流 v0.3）
  - 任务等级：M3（纪要 §五；同构先例=b-20261115-gpt03-review-leg M3）
  - 选型理由：平台代码类任务（charter 定稿立项，Gate3 用户拍板开工 DEC-087）
  - 批准人/日期：用户（Gate3 拍板 2026-11-16）

## 需求原文

见 requirement.md（charter §1 冻结版逐字照录，DEC-087）。

## 执行者理解（与原文分开，便于对账）

- 新增 `phase1/tools/arch_review_leg.py`：复用 review_leg.py 框架件（charter §3 决策点：推荐抽公共件防双头维护，Gate2 定稿认可该推荐方向）；落点=ARCH_REVIEW 关口（PLANNING→ARCH_REVIEW→READY）真实审核收发与结论登记。
- 契约=`contracts/v1.0/arch-review-report.schema.json`（Gate3 后已落位冻结，DEC-087；草案 docs/phase1/arch-review-report.schema.draft.json 保留为立项评审历史记录）；结论域 PASS/REWORK/BLOCKED；登记=artifacts+messages 路线 B（不经 /reports/review）。
- M1 白名单=charter A-1 表 7 端点（ENGINE-02 身份）；事件白名单=PASS/REWORK；BLOCKED 结论仅登记+腿级停止（不代提交 M1 BLOCKED 事件——腿级/任务级双语义不混用，charter §4）。
- M2 派单链零修改复用（gpt_dispatch 同源能力经 review_leg 框架件）；scheduler.py 零修改（独立于 scheduler 触发，M1 轮询 ARCH_REVIEW 态任务）；M1-M4 代码零修改。
- 1200B 口径冻结：单次发往 chatgpt.com 完整用户消息 UTF-8 ≤1200B（charter A-2）；审核材料 GitHub 指针模式+固定 commit 锚定（禁隐式读最新 main）。
- 异常沿 charter §5（GPT-03 §5 全表+结论域差异）；恢复按 A-3 九行矩阵；回滚不退回 M1 状态。

## 验收目标（charter §7 冻结；可观察结果口径）

- A1 正常审核轮：ARCH_REVIEW 态任务→简报组装（四组输入+绑定字段）→真实派单→PASS 结论→READY 推进，逐步证据落档；
- A2 返工结论：REWORK→REWORK 态推进，停等人工不自动重审；
- A3 采集 fail-closed 注入：禁重发证明（L-018 处置序）；
- A4 幂等重放：同输入重复登记→M1 幂等拦截/幂等键稳定；
- A5 两类断点恢复：已发送未采集/已采集未登记（A-3 矩阵行为）；
- A6 人工退路：attach-reply 同契约同幂等键；
- A7 BLOCKED 结论：仅登记报告，M1 任务保持 ARCH_REVIEW，腿级停止；
- 工程四项：①review_leg.py 既有 29 用例回归全绿（抽公共件不破坏已验收行为）②arch_review_leg 新增测试矩阵（含 A1~A7+负例 fail-closed）③零 mock 红线（真实 chatgpt.com 收发，DEC-028 口径）④100% 白名单外端点拒绝（ENGINE-02 越权负例）。
- ST-05 检查器对本任务包自检无 FAIL 缺口；交付证据绑定被测 commit 完整 40 位 SHA。

## 优先级：高

## 任务状态（随进度更新）
| 字段 | 值 |
|---|---|
| 当前状态 | 开发中 |
| 当前步骤 | S1 设计（公共件抽取边界与 arch_review_leg 编排结构） |
| 最终结果 | （完成后回填） |

## Git 操作批准记录（DEC-071 硬约束：commit 前须用户明文批准）

| 时间 | 事项 | 依据/性质 |
|---|---|---|
| 2026-11-16 | Gate3 拍板开工（DEC-087） | 用户主会话拍板；实施+验收派单链授权；commit/push 按 L-020 节点自主推进授权+check-push.mjs 执行，DEC-010 高危红线（main 合并）仍须用户本人拍板 |
