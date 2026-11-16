# 需求原文：GPT-04 测试验收真实腿最小版接入

- 任务ID：b-20261117-gpt04-test-acceptance-leg
- 日期：2026-11-17
- 立项链：DEC-026 决议二路线 → charter `docs/phase1/GPT04-TEST-ACCEPTANCE-LEG-CHARTER-DRAFT.md` v0.3（Gate1 PASS_WITH_CONSTRAINTS reply sha256=fc9ffcbe7522c3c44a0b722feee2895b5ea30441f0cfa88e8cd6171b82a4076c→G1-01/02/03 整改 v0.2@bd899e1ff477eecccff75f4695fa1197c54f1ecf→Gate2 终裁 reply sha256=763cf463e01a2fd0199691244669ba869bfa782960af31bb292c7be39301da9f）→ **开工授权生效（Gate2 复审通过，DEC-090 登记；授权依据=用户 2026-11-17 授权机制"遇问题与 ChatGPT 讨论并以 ChatGPT 意见为准，不用我拍板"——DEC-089 登记，DEC-010 高危红线仍须用户本人）**

## 开工授权记录（2026-11-17）

- 授权方式：Gate2 复审通过（PASS_WITH_CONSTRAINTS+开工授权生效），授权依据=用户 2026-11-17 授权机制（DEC-089/DEC-090 登记）——用户 2026-11-17 交接指令明示"接下来的工作如遇到问题你与chatgpt讨论，以chatgpt的意见为准，不用我拍板"。
- 授权范围（Gate2 定稿）：新增 phase1/tools/test_acceptance_leg.py+GPT-04 回复契约文件+简报/账本/恢复/测试/验收证据+ENGINE-03 bootstrap 与运行期七端点白名单+复用既有 M2 派单链和公共工具+GPT-02/03/04 三腿回归验证。
- 绑定限制（Gate2 定稿）：M1-M4 代码零修改；既有 v1.0.0 冻结契约零修改；不抽取公共 runner、不重构已 PASS 的 GPT-02/03；不扩展多轮返工重验/GPT-05/F-003 测试执行编排；不解除 DEC-017 门禁；DEC-010 红线（main 合并/生产发布/数据删除）须用户本人拍板。

## 需求原文（charter v0.3 §1 冻结版，逐字）

> "在 GPT-02 架构审核真实腿最小版（`phase1/tools/arch_review_leg.py`，b-20261116-gpt02-arch-review-leg，DEC-088）同框架基础上，接入 **GPT-04 测试验收真实腿最小版**：M1 状态机 TEST_ACCEPTANCE 态任务自动触发**一次**真实 chatgpt.com 测试验收派单（复用 M2 派单链与 fail-closed 门禁），采集验收回复并经冻结契约校验后经 M1 原生端点登记（`POST /api/v1/reports/test`），验收结论（通过/返工/阻塞）落档并按 M1 既有状态机推进（**PASS→ACCEPTED／REWORK→REWORK**）；**GPT-05、多轮返工重验自动化不在本期**。异常按 §5 分类处置，人工随时可介入。"

## 边界约束（charter v0.3 §9 不在范围清单，逐字）

GPT-05 批次审计真实腿；多轮返工重验自动化；测试执行编排扩展（F-003 多环境/并发/重试）；scheduler.py 修改；多任务/多批次编排；新 commit 重审触发；既有契约文件修改；M1-M4 代码修改；管理后台；公共 runner 抽取与前两腿重构。
