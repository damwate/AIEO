# GPT-04 测试验收真实腿最小版接入——立项任务书（草案 v0.1）

> **文档身份与授权链：** 本文件=Standard 平台路线 GPT-02/03/04/05 逐角色接入的**第三张立项草案**（GPT-03 charter v1.0 已生效 DEC-057/062；GPT-02 charter 已交付闭环 DEC-088）。生效路径：charter 草案 → Gate1 草案级验证 → Gate2 会务立项评审 → 开工授权。**授权机制（用户 2026-11-17 指令）：** 立项各关口遇问题与审查方（ChatGPT）讨论并以审查方意见为准，开工授权=审查方复审通过替代用户逐项拍板（依据登记 decision-log）；DEC-010 高危红线（main 合并/生产发布/数据删除）仍须用户本人拍板，用户保留手动介入权。角色顺序决策点：草案推荐 GPT-04 先于 GPT-05（理由见 §1），评审可裁定改序。

## 1. 需求原文（拟定稿）

> "在 GPT-02 架构审核真实腿最小版（`phase1/tools/arch_review_leg.py`，b-20261116-gpt02-arch-review-leg，DEC-088）同框架基础上，接入 **GPT-04 测试验收真实腿最小版**：M1 状态机 TEST_ACCEPTANCE 态任务自动触发**一次**真实 chatgpt.com 测试验收派单（复用 M2 派单链与 fail-closed 门禁），采集验收回复并经冻结契约校验后经 M1 原生端点登记（`POST /api/v1/reports/test`），验收结论（通过/返工/阻塞）落档并按 M1 既有状态机推进（**PASS→ACCEPTED／REWORK→REWORK**）；**GPT-05、多轮返工重验自动化不在本期**。异常按 §5 分类处置，人工随时可介入。"

- **目标：** 测试验收关口（TEST_ACCEPTANCE）由停等人工升级为真实 GPT-04 验收收发与结论登记，全程证据可追溯——补齐十步流程第三道真实腿（GPT-01 计划→GPT-02 架构审核→GPT-03 代码审查→GPT-04 测试验收）。
- **非目标：** GPT-05 批次审计腿；多轮返工重验自动化；测试执行编排改造（F-003 既有能力不动）；多任务/多批次编排；契约修改；M1-M4 代码修改。
- **角色顺序推荐理由（决策点 D1）：** ①DEC-026 清单序 GPT-04 居 GPT-05 前；②GPT-04 落点=既有任务级闭环末端（TEST_ACCEPTANCE→ACCEPTED），输入=单任务测试证据，契约最清晰；③M1 已有原生结论端点 `/reports/test`（绑定 TEST_ACCEPTANCE 态），登记路线与 GPT-03 腿同构、比 GPT-02 腿路线 B 更简单。GPT-05 需批次级聚合输入与"总审计不批准生产发布"边界设计，宜后置单独立项。

## 2. 状态事实基础与缺口分析

**已具备（直接复用，不再立项）：**

| 能力 | 载体 | 证据 |
|---|---|---|
| 审查腿全框架（A0-A5 编排/白名单客户端/账本/resume/attach-reply 人工退路/RunKeyLock） | `review_leg.py`（GPT-03）+`arch_review_leg.py`（GPT-02），双矩阵 58 用例合跑 PASS | DEC-059/061/062、DEC-088 |
| M2 派单链真实收发+fail-closed+归属校验补采 | gpt_dispatch.mjs+inbound 采集+L-018 处置序 | G02 验收链与补采先例 |
| M1 TEST_ACCEPTANCE 态与合法出边 | `app/platform/state_machine.py:37`（PASS→ACCEPTED/REWORK→REWORK/BLOCKED→BLOCKED） | 状态机源码 |
| **M1 原生测试结论端点** | `POST /api/v1/reports/test`（register_test_report，`reports.py:201-250`）：任务须处 TEST_ACCEPTANCE 态；**PASS 须绑 execution_result=EXECUTED_PASS（"claims are not evidence"，03-协议 §8）**；test_reports 行插入+apply_event **同事务原子**；幂等键=(execution_id, commit_sha)，重复登记报 duplicate（非幂等返回） | reports.py 实读 |
| ACCEPTED 证据门 | `_check_accepted_evidence`（state_machine.py:76-100）：ACCEPTED 需 PASS review+EXECUTED_PASS 测试证据 | 状态机源码 |
| 登记契约 | TestReportIn（schemas.py:181-188：task_id/execution_id/commit_sha/execution_result 五值枚举/result 三态/artifact_id/payload）；冻结契约 `contracts/v1.0/test-report.schema.json`（本体）+`reports-test.schema.json`（请求/响应） | 契约文件 |
| 测试执行证据源 | F-003 测试执行 Worker 最小版（真实执行+三件套原始字节+双 SHA+契约报告，execution_result 语义=EXECUTED_PASS/EXECUTED_FAIL/NOT_EXECUTED/CLAIMED_ONLY/BLOCKED） | DEC-029、T-P1-907 |
| 03-协议 §8 执行事实语义 | NOT_EXECUTED=未执行/CLAIMED_ONLY=仅声称无证据——与 GPT-04 角色规范 §5"区分自动化实际执行/人工测试/仅声明/尚未执行"逐项对应 | 03-协议 §8、docs/立项/02 §5 |

**待工程化（本草案立项对象）：** GPT-04 测试验收真实腿——当前 TEST_ACCEPTANCE 关口停等人工，无真实验收收发。待建=验收简报组装（验收标准+测试证据指针+执行事实）+GPT-04 网页回复契约（新增冻结契约）+结论映射与 `/reports/test` 登记+GPT-04 agent 身份（bootstrap）。

## 3. 架构边界

- **职责：** 新增 `phase1/tools/test_acceptance_leg.py`（复用 review_leg/arch_review_leg 框架件——抽公共 runner 或同构复制为立项评审决策点 D2，推荐沿 GPT-02 先例抽公共件防三头维护）；**M1/M2/M3/M4 代码零修改**；scheduler.py 零修改（触发方式=M1 轮询 TEST_ACCEPTANCE 态任务，与 GPT-02 腿同模式）。
- **验收输入：** M1 任务字段（acceptance_criteria/files_scope）+latest_execution+测试证据 artifacts（F-003 三件套+报告；证据 artifact 定位机制=沿 review_leg diff_artifact_id 显式注入模式或 latest_execution 派生——决策点 D3）；GitHub 指针模式固定 commit（L-007；出站 ≤1200B，1200B 口径冻结同 GPT-02 附录 A-2）。
- **接口：** 上行=M1 白名单（附录 A-1 精化）；下行=M2 工具链零修改复用；**契约 v1.0.0 冻结文本不修改**（H2；新增 GPT-04 回复契约=新增文件，不改动既有文件）。

## 4. 状态与流程

一期流程（单任务、每进入 TEST_ACCEPTANCE 态一次验收轮）：TEST_ACCEPTANCE 态任务存在 → A0 前置只读核查（态+allowed_events+acceptance_criteria/测试证据齐备）→ A1 简报组装（任务身份/验收标准/测试证据指针+执行事实/固定 commit 锚定）→ A2 真实派单（M2）→ A3 采集+Ajv 冻结契约校验（envelope+新增回复契约，失败=保留原始 artifact 不登记，L-008 语义）→ A4 结论登记：**PASS/REWORK→`POST /reports/test` 原生登记**（test_reports 表=结论权威记录，同事务原子推进；execution_result 由腿从 F-003 测试证据事实读入【与 GPT-04 回复中执行事实判定的一致性校验=fail-closed，规则见附录 A-2 决策点 D4】）→ A5 终态：PASS→ACCEPTED／REWORK→REWORK。
**BLOCKED 结论处置（决策点 D5，草案推荐方案）：** 沿 GPT-02 腿 BLOCKED 先例——**不调用 /reports/test**（避免腿代 OWNER 触发任务级 BLOCKED 推进），结论经 artifacts+messages 登记（报告证据）+腿级停止，M1 任务保持 TEST_ACCEPTANCE 态停等人工。与 /reports/test 端点内建 BLOCKED 推进能力（reports.py:227-233）的关系=leg 调用层禁用该分支（同 GPT-02 附录 A-1"状态机接受某事件≠engine 有权提交"纪律）。
**BLOCKED 双语义（沿 GPT-02 charter §4 全文，不得混用）：** 腿级 BLOCKED=验收腿内部停止（run 记录），M1 任务状态不动；M1 任务级 BLOCKED 仅 OWNER 决定。全文默认指腿级。
**一期边界：** ①自动触发=每任务进入 TEST_ACCEPTANCE 态**一次**；②REWORK 不自动重验（M1 REWORK→REWORK 出边后的重开开发轮属人工流程，不在本期）；③腿任何环节失败→任务保持 TEST_ACCEPTANCE 态停等人工（腿级 BLOCKED）。

## 5. 异常处理

沿 GPT-02 charter §5 全表（网页发送失败 1 次换会话重派/采集 fail-closed 禁重发补采/契约校验失败 L-008/平台故障幂等纪律/状态非法停止不绕过/人工介入），差异两处：

| 差异点 | 规则 |
|---|---|
| `/reports/test` 重复登记 | 端点幂等键=(execution_id, commit_sha)，重复报 duplicate（非幂等返回）——恢复路径=先 `GET /api/v1/reports` 只读核实已登记行；已生效接续；确认未生效才可按原键重试，无法确认→腿级 BLOCKED（禁凭超时重提交） |
| PASS↔EXECUTED_PASS 证据门 | 回复 result=PASS 而证据事实 execution_result≠EXECUTED_PASS（或反之）→契约一致性校验 fail-closed，不登记，腿级 BLOCKED 停等人工（该矛盾本身即"claims are not evidence"要拦截的形态） |

## 6. 安全与审计

沿 GPT-02 charter §6 主体—操作—授权边界表全文（凭据三类/OWNER 固定角色/engine §8.6 白名单/审计 C7 §8.7），差异：engine 身份=**ENGINE-03**（GPT-04 腿独立服务身份，bootstrap 一次性 OWNER 注册，先例=ENGINE-01/02 setup-agents）；**leg 不直接 POST /tasks/{task_id}/events**（状态推进由 /reports/test 端点内 apply_event 原子完成，事件合法性由 M1 状态机最终裁定——比 GPT-02 腿少一个写入口）；派单出站 ≤1200B；敏感信息不入日志不入 Git。

## 7. 验收与回滚

沿 GPT-03 charter §7 矩阵框架改写：A1 正常验收轮（TEST_ACCEPTANCE→简报→派单→PASS→ACCEPTED 逐步证据，含 ACCEPTED 证据门核验）；A2 REWORK 结论（→REWORK 态停等人工）；A3 采集 fail-closed 注入（禁重发证明，注入点=采集层只读构造同 GPT-03 A3）；A4 幂等重放（duplicate 语义：重放同键登记→报 duplicate 且无第二次推进、无新派单）；A5 两类断点恢复（已发送未采集/已采集未登记）；A6 人工退路（attach-reply 同契约同幂等键人工登记）；A7 BLOCKED 结论（仅 artifacts+messages 登记，M1 保持 TEST_ACCEPTANCE 不动）。回滚=恢复矩阵按 TEST_ACCEPTANCE 态重排（附录 A-3 初稿），不退回 M1 状态原则不变。零 mock 红线（真实 chatgpt.com 收发）沿用 DEC-028 口径。测试矩阵=双矩阵合跑（GPT-03/GPT-02/GPT-04 三腿回归，沿 G02 58 合跑先例扩展）。

## 8. 授权与红线

生效链：本草案 → Gate1 草案级验证 → Gate2 会务立项评审 → 开工授权（用户 2026-11-17 授权机制=审查方复审通过；登记 decision-log）；开工后 PASS≠合并授权（DEC-010）。红线沿用：DEC-010/DEC-011（契约冻结）/DEC-017（扩展门禁不解除）/H2（新增契约文件不改既有文件）。

## 9. 不在范围清单（防膨胀）

GPT-05 批次审计真实腿；多轮返工重验自动化；测试执行编排扩展（F-003 多环境/并发/重试）；scheduler.py 修改；多任务/多批次编排；新 commit 重审触发；既有契约文件修改；M1-M4 代码修改；管理后台。

## 附录 A：Gate2 评审输入初稿

### A-1 ENGINE-03 运行期 M1 白名单端点表（初稿，Gate2 精化）

| Method | 路径 | 操作范围 | 拒绝条件 | identity_scope | idempotency_scope |
|---|---|---|---|---|---|
| GET | /api/v1/tasks/{task_id} | 读取任务与验收输入字段（acceptance_criteria/latest_execution/allowed_events） | 任务不存在/非目标态任务 | ENGINE-03 | 按任务 |
| GET | /api/v1/tasks/{task_id}/dependencies | 读取依赖与状态 | 任务不匹配 | ENGINE-03 | 按任务 |
| GET | /api/v1/artifacts/{artifact_id} | 读取测试证据 artifact | 非任务关联材料 | ENGINE-03 | 按资源 ID |
| GET | /api/v1/reports | 只读核实 test_reports 已登记行（重复登记恢复路径用） | 非核实目的批量读取 | ENGINE-03 | 只读幂等 |
| POST | /api/v1/artifacts | 登记验收简报与证据产物 | 登记契约不符/幂等冲突 | ENGINE-03 | 路径+SHA（M1 语义） |
| POST | /api/v1/messages | 验收结果相关消息记录 | 非指定消息类型/身份不匹配 | ENGINE-03 | message_id 确定性键 |
| POST | /api/v1/reports/test | **结论登记+状态推进（原子）**：PASS/REWORK 提交；BLOCKED 分支调用层禁用（§4 决策点 D5） | 任务非 TEST_ACCEPTANCE 态/PASS 而 execution_result≠EXECUTED_PASS/execution 不匹配/duplicate | ENGINE-03 | (execution_id, commit_sha)（端点内建） |

- **明确排除：** POST /tasks/{task_id}/events（推进由端点内原子完成）/POST /agents（bootstrap 一次性 OWNER 操作）/approvals 类/messages cancel-requeue-ack/projects、batches 写操作/BLOCKED 经 /reports/test 提交（D5）。
- **POST /api/v1/agents 不入运行期白名单**：GPT-04/ENGINE-03 身份注册=一次性 OWNER bootstrap（先例=ENGINE-01/02）。

### A-2 验收简报组装与回复契约（初稿）

**回复契约=新增 `test-acceptance-review.schema.json`（新增文件，H2 纪律）**，字段草案：contract_version/task_id/review_round_id/reviewer_agent_id(GPT-04)/engine_agent_id(ENGINE-03)/commit_sha(40hex)/execution_id/execution_result_observed(GPT-04 对证据的事实判定，五值枚举与 TestReportIn 同源)/result(PASS/REWORK/BLOCKED)/summary/findings/required_boundaries。登记映射：result→TestReportIn.result；execution_result→**由腿从 F-003 证据事实读入**（不采信回复自述）；一致性校验=回复 execution_result_observed 与证据事实不一致→fail-closed 腿级 BLOCKED【决策点 D4：校验方向与宽严度（仅 PASS↔EXECUTED_PASS 硬门为 M1 内建；其余错位是否也 fail-closed 由 Gate2 裁定）】。

**简报输入四组**：任务身份（task_id/title/acceptance_criteria 原始语义不扩展）/执行事实（latest_execution+execution_result 事实值+证据来源）/测试证据（F-003 三件套+报告 GitHub 指针，固定 commit 禁隐式读最新 main）/验收边界（files_scope）。新增绑定字段：review_round_id/input_material_commit/brief_sha256/brief_schema_version。

### A-3 恢复矩阵初稿（TEST_ACCEPTANCE 态，Gate2 精化）

| 断点 | 恢复动作 | 重新派单 |
|---|---|---|
| 简报组装前 | 重读任务与证据，核对输入版本 | 允许首次派单 |
| 简报已组装未发送 | 校验 brief SHA，继续发送 | 允许 |
| 已发送未采集 | 原会话补采（归属校验型），核验发送证明 | **禁止重发** |
| 已采集未登记 | 校验 reply SHA/契约，按原幂等键登记 | **禁止重发** |
| /reports/test 提交结果不确定 | 只读核实 GET /reports/test_reports 行；已生效接续；未生效按原键重试；无法确定→腿级 BLOCKED | **禁止重发** |
| 登记成功推进失败 | 端点同事务原子设计下不应出现；出现=登记 BUG→腿级 BLOCKED 上报（不绕过） | **禁止重发** |
| ACCEPTED/REWORK 已推进 | 只读核验，认定本轮完成 | 禁止 |
| BLOCKED 结论（腿级） | artifacts+messages 已登记，M1 保持 TEST_ACCEPTANCE，人工接管 | 禁止 |

## 版本记录

| 版本 | 日期 | 状态 | 变更 | 依据 |
|---|---|---|---|---|
| v0.1 | 2026-11-17 | 草案（待 Gate1） | 初稿成文（GPT-02 charter v0.3 同构框架，落点 TEST_ACCEPTANCE 关口；登记路线=/reports/test 原生端点；决策点 D1-D5 汇总见 §1/§3/§4/附录 A-2） | 用户 2026-11-17 交接指令；DEC-026 决议二；DEC-088 遗留④迁移先行；角色规范 docs/立项/02 §5；state_machine.py:37/reports.py:201-250/schemas.py:181-188 实读 |
