# 任务书：GPT-04 测试验收真实腿最小版接入

- 任务ID：b-20261117-gpt04-test-acceptance-leg
- 日期：2026-11-17
- **版本选型：**
  - 选定版本：Standard（工作产品=平台真实腿接入；作业流程=Basic 工作流 v0.3）
  - 任务等级：M3（同构先例=b-20261115-gpt03-review-leg、b-20261116-gpt02-arch-review-leg 均 M3）
  - 选型理由：平台代码类任务（charter v0.3 Gate2 定稿立项，开工授权=审查方复审通过 DEC-090，用户 2026-11-17 授权机制）
  - 批准人/日期：审查方 Gate2 复审通过（DEC-090，2026-11-17；授权依据=用户 2026-11-17 授权机制）

## 需求原文

见 requirement.md（charter v0.3 §1 冻结版逐字照录，开工授权 DEC-090）。

## 执行者理解（与原文分开，便于对账）

- 新增 `phase1/tools/test_acceptance_leg.py`：**D2 终裁=同构复制**——以 arch_review_leg.py 为主要结构参考，复用既有公共件（EngineM1Client/ReviewLedger/derive_recoll_driver/公共常量），**不抽新公共 runner、不重构已 PASS 两腿**；落点=TEST_ACCEPTANCE 关口真实验收收发与结论登记；**RunKeyLock 跨进程互斥必须沿用**（GPT-02 先例；review_leg 无锁不可照搬）。
- 契约=新增 `contracts/v1.0/test-acceptance-review.schema.json`（charter A-2 定稿字段；新增文件不改既有冻结契约，H2）；结论域 PASS/REWORK/BLOCKED；**登记路线=M1 原生端点 POST /reports/test**（PASS/REWORK 提交，端点内同事务原子推进 PASS→ACCEPTED/REWORK→REWORK；幂等键=(execution_id,commit_sha)，duplicate 非幂等返回按实际代码行为设计恢复）。
- 事实×结论 15 组合矩阵（charter §4 定稿）：execution_result 由腿从 F-003 证据事实读入（回复 execution_result_observed 仅为交叉核对字段，不一致 fail-closed）；EXECUTED_FAIL+PASS 与 NOT_EXECUTED/CLAIMED_ONLY/BLOCKED+PASS/REWORK 均禁止登记→腿级 BLOCKED。
- BLOCKED 结论（不论事实）一律 artifacts+messages 留证+腿级停止，M1 保持 TEST_ACCEPTANCE（不调 /reports/test——其 BLOCKED 分支会推进任务级 BLOCKED，ENGINE-03 不替 OWNER 决定）。
- M1 白名单=charter A-1 定稿 7 端点（ENGINE-03 身份，客户端层 method+path 校验）；/agents、events、approvals、messages cancel/requeue/ack、projects/batches 写、/reports/test BLOCKED 分支全排除。
- D3 终裁：简报显式绑定 execution_id/测试报告 artifact_id/三件套 SHA256/固定 40 位 commit；latest_execution 仅发现入口，运行期漂移→停止转人工禁静默切换。
- M2 派单链零修改复用；scheduler.py 零修改（独立触发=M1 轮询 TEST_ACCEPTANCE 态）；M1-M4 零修改；出站 ≤1200B 不截断不拆分；敏感信息不入日志不入 Git（令牌走 gitignored runtime）。
- 恢复=charter A-3 定稿 12 行矩阵（发送意图无确认→fail-closed 腿级 BLOCKED；duplicate 恢复先 GET /api/v1/reports?type=test&task_id= 五字段核对）；回滚不退回 M1 状态。

## 验收目标（charter v0.3 §7 冻结；可观察结果口径）

- A1 正常验收轮：TEST_ACCEPTANCE 态任务→简报组装→真实派单→PASS 结论→ACCEPTED 推进（含 ACCEPTED 证据门核验），逐步证据落档；
- A2 REWORK 结论：REWORK→REWORK 态推进，停等人工不自动重验；
- A3 采集 fail-closed 注入：禁重发证明（L-018 处置序）；
- A4 幂等重放：同键重复登记→raise duplicate 且无第二次推进、无新派单；
- A5 两类断点恢复：已发送未采集/已采集未登记（A-3 矩阵行为）；
- A6 人工退路：attach-reply 同契约同幂等键；
- A7 BLOCKED 结论：仅 artifacts+messages 登记，M1 保持 TEST_ACCEPTANCE，腿级停止；
- 工程四项：①GPT-03/GPT-02 既有 58 用例回归全绿（同构复制不破坏已验收行为）②GPT-04 新增测试矩阵（A1~A7+负例：白名单越权/契约失败/简报超限/材料锚定/矩阵禁止组合 fail-closed/发送状态不确定）③零 mock 红线（真实 chatgpt.com 收发，DEC-028 口径）④100% 白名单外端点拒绝（ENGINE-03 越权负例）。
- ST-05 检查器对本任务包自检无 FAIL 缺口；交付证据绑定被测 commit 完整 40 位 SHA。

## 优先级：高

## 任务状态（随进度更新）
| 字段 | 值 |
|---|---|
| 当前状态 | 完成 |
| 当前步骤 | 全部完成：S1-S4+零 mock 实战+问题16 整改（19f7eea8）+G04-R1/R2 复核（R2 五项全 PASS）+收口 commit（R3 极窄复核确认） |
| 最终结果 | PASS（G04-R1 PASS_WITH_CONSTRAINTS 四项交付整改全过→G04-R2 五项核验全 PASS→收口 commit；零 mock 实战真实 REWORK 三指认对账属实+整改闭环；三腿合跑 89/89；C1 绑定 PASS；M1-M4/冻结契约/两腿零修改维持） |
