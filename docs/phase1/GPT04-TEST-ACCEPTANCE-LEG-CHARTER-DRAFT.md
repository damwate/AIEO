# GPT-04 测试验收真实腿最小版接入——立项任务书（草案 v0.3·Gate2 定稿）

> **定稿与开工授权声明（2026-11-17，Gate2）：** Gate2 终裁 **PASS_WITH_CONSTRAINTS+开工授权生效**（reply sha256=763cf463e01a2fd0199691244669ba869bfa782960af31bb292c7be39301da9f，dispatch-2026-11-16T18-02-49 补采七查全过，被测对象=v0.2@bd899e1ff477eecccff75f4695fa1197c54f1ecf）。Gate2 五项终裁（15 组合矩阵/同构复制/白名单 7 端点定稿/12 行恢复矩阵/显式证据指针）作为绑定决议执行；G2-01~04 文档修订纳入实现任务书落实，不阻断开工。授权依据=用户 2026-11-17 授权机制（遇问题以审查方意见为准，DEC-089 登记）+Gate2 复审通过。授权范围与绑定限制见 Gate2 reply 原文（M1-M4 零修改/冻结契约零修改/不抽公共 runner/DEC-017 不解除/DEC-010 红线仍用户本人）。**Gate1 链：** PASS_WITH_CONSTRAINTS（reply sha256=fc9ffcbe7522c3c44a0b722feee2895b5ea30441f0cfa88e8cd6171b82a4076c，dispatch-2026-11-16T17-55-13 补采七查全过，blob 31ef0f98…22aa3）→G1-01/02/03 整改（v0.2）→Gate2。

> **文档身份与授权链：** 本文件=Standard 平台路线 GPT-02/03/04/05 逐角色接入的**第三张立项草案**（GPT-03 charter v1.0 已生效 DEC-057/062；GPT-02 charter 已交付闭环 DEC-088）。生效路径：charter 草案 → Gate1 草案级验证 → Gate2 会务立项评审 → 开工授权（用户 2026-11-17 授权机制=审查方复审通过替代用户逐项拍板，登记 DEC-089；DEC-010 高危红线仍须用户本人拍板）。角色顺序终裁：GPT-04 先于 GPT-05（D1，Gate1 接受+Gate2 维持）；GPT-05 待 GPT-04 形成可验收闭环后再立项（Gate2 裁定）。

## 1. 需求原文（拟定稿）

> "在 GPT-02 架构审核真实腿最小版（`phase1/tools/arch_review_leg.py`，b-20261116-gpt02-arch-review-leg，DEC-088）同框架基础上，接入 **GPT-04 测试验收真实腿最小版**：M1 状态机 TEST_ACCEPTANCE 态任务自动触发**一次**真实 chatgpt.com 测试验收派单（复用 M2 派单链与 fail-closed 门禁），采集验收回复并经冻结契约校验后经 M1 原生端点登记（`POST /api/v1/reports/test`），验收结论（通过/返工/阻塞）落档并按 M1 既有状态机推进（**PASS→ACCEPTED／REWORK→REWORK**）；**GPT-05、多轮返工重验自动化不在本期**。异常按 §5 分类处置，人工随时可介入。"

- **目标：** 测试验收关口（TEST_ACCEPTANCE）由停等人工升级为真实 GPT-04 验收收发与结论登记，全程证据可追溯——补齐十步流程第三道真实腿（GPT-01 计划→GPT-02 架构审核→GPT-03 代码审查→GPT-04 测试验收）。
- **非目标：** GPT-05 批次审计腿；多轮返工重验自动化；测试执行编排改造（F-003 既有能力不动）；多任务/多批次编排；契约修改；M1-M4 代码修改。

## 2. 状态事实基础与缺口分析

**已具备（直接复用，不再立项）：**

| 能力 | 载体 | 证据 |
|---|---|---|
| 审查腿全框架（A0-A5 编排/白名单客户端/账本/resume/attach-reply 人工退路/RunKeyLock） | `review_leg.py`（GPT-03）+`arch_review_leg.py`（GPT-02），双矩阵 58 用例合跑 PASS | DEC-059/061/062、DEC-088 |
| M2 派单链真实收发+fail-closed+归属校验补采 | gpt_dispatch.mjs+inbound 采集+L-018 处置序 | G02 验收链与补采先例 |
| M1 TEST_ACCEPTANCE 态与合法出边 | `app/platform/state_machine.py:37`（PASS→ACCEPTED/REWORK→REWORK/BLOCKED→BLOCKED） | 状态机源码 |
| **M1 原生测试结论端点** | `POST /api/v1/reports/test`（register_test_report，`reports.py:201-250`）：任务须处 TEST_ACCEPTANCE 态；**PASS 须绑 execution_result=EXECUTED_PASS（"claims are not evidence"，03-协议 §8）**；test_reports 行插入+apply_event **同事务原子**；幂等键=(execution_id, commit_sha)，重复登记 raise duplicate（**非幂等返回**） | reports.py 实读（Gate1/2 双核） |
| ACCEPTED 证据门 | `_check_accepted_evidence`（state_machine.py:76-100）：ACCEPTED 需 PASS review+EXECUTED_PASS 测试证据 | 状态机源码 |
| 登记契约 | TestReportIn（schemas.py:181-188）+冻结契约 `contracts/v1.0/test-report.schema.json`/`reports-test.schema.json` | 契约文件 |
| 测试执行证据源 | F-003 测试执行 Worker 最小版（真实执行+三件套原始字节+双 SHA+契约报告，execution_result 五值语义） | DEC-029、T-P1-907 |

**待工程化（本草案立项对象）：** GPT-04 测试验收真实腿——待建=验收简报组装+GPT-04 网页回复契约（新增冻结契约）+结论映射与 `/reports/test` 登记+GPT-04 agent 身份（bootstrap）。

**既有契约描述与实现不一致（G1-02 登记遗留，Gate2 维持）：** `reports-test.schema.json` description 称"重复→返回原登记结果 duplicate=true"，与实现 raise duplicate_message 不符——本任务不改冻结契约（H2），恢复设计以实际代码行为为准；后续另走契约演进流程。

## 3. 架构边界

- **职责（D2 终裁=同构复制）：** 新增 `phase1/tools/test_acceptance_leg.py`，**以 arch_review_leg.py 为主要结构参考同构新增**；复用既有公共件（EngineM1Client/ReviewLedger/derive_recoll_driver/公共常量与时间工具，blob 先例=review_leg 018b0fd8…、arch_review_leg 6cb08423…），**不抽取新的公共 runner、不重构已 PASS 的 GPT-02/03 腿**（Gate2 实读两腿后裁定：流程编排/M1 状态判断/结论登记/恢复逻辑保持角色独立；抽取带入回归风险且 /reports/test 登记语义不同）。**M1/M2/M3/M4 代码零修改**；scheduler.py 零修改（触发方式=M1 轮询 TEST_ACCEPTANCE 态任务，与 GPT-02 腿同模式）。**RunKeyLock 跨进程互斥纪律必须沿用**（GPT-02 腿先例；review_leg.py 自身无此锁，不得照搬 GPT-03 并发控制方式——Gate2 特别要求）。
- **验收输入（D3 终裁=显式证据指针）：** 每轮简报固定绑定 task_id/execution_id+F-003 测试报告 artifact_id+三件套原始证据各自 artifact 标识与 SHA256+GitHub 固定 commit SHA（完整 40 位，禁隐式读最新 main）+input_material_commit+brief_sha256/brief_schema_version/review_round_id；latest_execution 仅作发现入口，**运行中重读 latest_execution 与本轮已固定 execution 不一致→停止转人工，不得静默切换证据**。出站 ≤1200B（1200B 口径冻结同 GPT-02 附录 A-2）。
- **接口：** 上行=M1 白名单（附录 A-1 定稿 7 端点）；下行=M2 工具链零修改复用；**契约 v1.0.0 冻结文本不修改**（H2；新增 GPT-04 回复契约=新增文件）。

## 4. 状态与流程

一期流程（单任务、每进入 TEST_ACCEPTANCE 态一次验收轮）：TEST_ACCEPTANCE 态任务存在 → A0 前置只读核查（态+allowed_events+acceptance_criteria/测试证据齐备）→ A1 简报组装 → A2 真实派单（M2）→ A3 采集+Ajv 冻结契约校验（失败=保留原始 artifact 不登记，L-008 语义）→ A4 结论登记：**PASS/REWORK→`POST /reports/test` 原生登记**（test_reports 表=结论权威记录，同事务原子推进；execution_result 由腿从 F-003 证据事实读入，回复 execution_result_observed 仅为交叉核对字段【G2-04：权威值以 F-003 证据为准，两者不一致即 fail-closed，不得采信回复值继续登记】）→ A5 终态：PASS→ACCEPTED／REWORK→REWORK。
**结论×事实组合矩阵（G1-03 终裁+G2-01/02 定稿，15 组合全表，最终规则）：**

| F-003 证据事实 | 回复 PASS | 回复 REWORK | 回复 BLOCKED |
|---|---|---|---|
| EXECUTED_PASS | 允许登记 | 允许登记 | 腿级 BLOCKED |
| EXECUTED_FAIL | **禁止**（fail-closed 不登记，腿级 BLOCKED） | 允许登记 | 腿级 BLOCKED |
| NOT_EXECUTED | **禁止** | **禁止** | 腿级 BLOCKED |
| CLAIMED_ONLY | **禁止** | **禁止** | 腿级 BLOCKED |
| BLOCKED | **禁止** | **禁止** | 腿级 BLOCKED |

- 终裁依据：测试执行结果≠验收结论（EXECUTED_PASS+REWORK 合法=测试通过但验收标准不满足；EXECUTED_FAIL+REWORK 合法=实际失败形成返工）；**缺少可接受执行事实时（NOT_EXECUTED/CLAIMED_ONLY/BLOCKED）不允许形成 PASS 或 REWORK 登记，统一腿级 BLOCKED**（G2-02）；**回复 BLOCKED 不论执行事实为何，一律走 artifacts+messages 留证，M1 保持 TEST_ACCEPTANCE**。
**BLOCKED 结论处置（D5 终裁维持）：** 不调用 /reports/test（其 BLOCKED 分支会经 apply_event 推进 M1 任务级 BLOCKED，ENGINE-03 不替 OWNER 作任务级阻塞决定）——结论经 artifacts+messages 登记+腿级停止，人工接管后按 M1 原生状态机处理（与 GPT-02 腿 BLOCKED 先例同构）。
**BLOCKED 双语义（不得混用）：** 腿级 BLOCKED=验收腿内部停止（run 记录），M1 任务状态不动；M1 任务级 BLOCKED 仅 OWNER 决定。
**一期边界：** ①自动触发=每任务进入 TEST_ACCEPTANCE 态**一次**；②REWORK 不自动重验（M1 REWORK→REWORK 出边后的重开开发轮属人工流程）；③腿任何环节失败→任务保持 TEST_ACCEPTANCE 态停等人工（腿级 BLOCKED）。

## 5. 异常处理

沿 GPT-02 charter §5 全表（网页发送失败 1 次换会话重派/采集 fail-closed 禁重发补采/契约校验失败 L-008/平台故障幂等纪律/状态非法停止不绕过/人工介入），差异两处：

| 差异点 | 规则 |
|---|---|
| `/reports/test` 重复登记 | 幂等键=(execution_id, commit_sha)，重复 raise duplicate（**非幂等返回**，实际代码行为）——恢复路径=先 `GET /api/v1/reports?type=test&task_id={task_id}` 只读核实（逐项核对 task_id/execution_id/commit_sha/result/execution_result）；已生效接续；确认未生效才可按原键重试，无法确认→腿级 BLOCKED（禁凭超时重提交、禁把 duplicate 当成功——duplicate 不是成功响应）。既有契约描述与实现不一致已登记遗留（§2），不改冻结契约 |
| 事实×结论矩阵禁止组合 | 命中附录 A-2 矩阵禁止项（如 EXECUTED_FAIL+PASS）→fail-closed 不登记，腿级 BLOCKED 停等人工（该矛盾本身即"claims are not evidence"要拦截的形态；由 M1 内建门+腿一致性校验双层拦截） |

## 6. 安全与审计

沿 GPT-02 charter §6 主体—操作—授权边界表全文（凭据三类/OWNER 固定角色/engine §8.6 白名单/审计 C7 §8.7），差异：engine 身份=**ENGINE-03**（GPT-04 腿独立服务身份，bootstrap 一次性 OWNER 注册，先例=ENGINE-01/02 setup-agents）；**leg 不直接 POST /tasks/{task_id}/events**（推进由 /reports/test 端点内 apply_event 原子完成）；**白名单必须在客户端请求层执行 method+path 校验，不能由调用方自由传入任意 URL**（Gate2 定稿要求，EngineM1Client 既有模式沿用）；派单出站 ≤1200B；敏感信息不入日志不入 Git；RunKeyLock 跨进程互斥（§3）。

## 7. 验收与回滚

沿 GPT-03 charter §7 矩阵框架改写：A1 正常验收轮（TEST_ACCEPTANCE→简报→派单→PASS→ACCEPTED 逐步证据，含 ACCEPTED 证据门核验）；A2 REWORK 结论（→REWORK 态停等人工）；A3 采集 fail-closed 注入（禁重发证明，注入点=采集层只读构造同 GPT-03 A3）；A4 幂等重放（duplicate 语义：重放同键登记→raise duplicate 且无第二次推进、无新派单）；A5 两类断点恢复（已发送未采集/已采集未登记）；A6 人工退路（attach-reply 同契约同幂等键人工登记）；A7 BLOCKED 结论（仅 artifacts+messages 登记，M1 保持 TEST_ACCEPTANCE 不动）。回滚=恢复矩阵按 TEST_ACCEPTANCE 态重排（附录 A-3 定稿 12 行），不退回 M1 状态原则不变。零 mock 红线（真实 chatgpt.com 收发）沿用 DEC-028 口径。测试矩阵=三腿合跑回归（GPT-03/GPT-02/GPT-04，沿 G02 58 合跑先例扩展）。**实施顺序（Gate2 建议）：先完成 G2-01~04 任务书修订冻结设计→实现 A0-A5→GPT-04 独立测试矩阵→三腿回归。**

## 8. 授权与红线

生效链：charter v0.1 → Gate1 PASS_WITH_CONSTRAINTS（G1-01/02/03 整改 v0.2）→ Gate2 PASS_WITH_CONSTRAINTS+**开工授权生效**（reply sha256=763cf463…；授权依据=用户 2026-11-17 授权机制+DEC-089 登记）；开工后 PASS≠合并授权（DEC-010）。授权范围=新增 test_acceptance_leg.py+回复契约文件+简报/账本/恢复/测试/验收证据+ENGINE-03 bootstrap 与运行期七端点白名单+复用 M2 与公共件+三腿回归。绑定限制：M1-M4 零修改/既有 v1.0.0 冻结契约零修改/不抽公共 runner 不重构已 PASS 两腿/不扩展多轮重验、GPT-05、F-003 编排/DEC-017 不解除/DEC-010 红线（main 合并、生产发布、数据删除）须用户本人拍板。

## 9. 不在范围清单（防膨胀）

GPT-05 批次审计真实腿；多轮返工重验自动化；测试执行编排扩展（F-003 多环境/并发/重试）；scheduler.py 修改；多任务/多批次编排；新 commit 重审触发；既有契约文件修改；M1-M4 代码修改；管理后台；公共 runner 抽取与前两腿重构。

## 附录 A：Gate2 定稿

### A-1 ENGINE-03 运行期 M1 白名单（Gate2 定稿：7 端点+排除清单）

| # | Method | 路径 | 用途 |
|---|---|---|---|
| 1 | GET | /api/v1/tasks/{task_id} | 读取任务、验收标准、执行入口及状态 |
| 2 | GET | /api/v1/tasks/{task_id}/dependencies | 读取依赖及状态 |
| 3 | GET | /api/v1/artifacts/{artifact_id} | 读取任务关联测试证据 |
| 4 | GET | /api/v1/reports?type=test&task_id={task_id} | 只读核实测试报告登记结果 |
| 5 | POST | /api/v1/artifacts | 登记验收简报、BLOCKED 证据等产物 |
| 6 | POST | /api/v1/messages | 登记验收结果相关消息 |
| 7 | POST | /api/v1/reports/test | 仅登记 PASS/REWORK，由 M1 原子推进状态 |

- **排除清单（Gate2 定稿）：** POST /tasks/{task_id}/events（推进由端点内原子完成）；POST /agents（ENGINE-03 仅 OWNER 一次性 bootstrap）；approvals 类全部排除；messages cancel/requeue/ack 全部排除；projects、batches 写操作全部排除；/reports/test 的 BLOCKED 提交禁止；未列入七项的所有 M1 端点默认拒绝。
- **执行要求：** 白名单在客户端请求层执行 method+path 校验（EngineM1Client 既有模式），不能由调用方自由传入任意 URL。
- **幂等键：** /reports/test=(execution_id, commit_sha)（端点内建，duplicate 非幂等返回）；artifacts=路径+SHA（M1 语义）；messages=message_id 确定性键。

### A-2 验收简报组装与回复契约（Gate2 定稿）

**回复契约=新增 `test-acceptance-review.schema.json`（新增文件，H2 纪律）**，字段定稿：contract_version/task_id/review_round_id/reviewer_agent_id(GPT-04)/engine_agent_id(ENGINE-03)/commit_sha(40hex)/execution_id/execution_result_observed（**仅为 GPT-04 复述/交叉核对字段【G2-04】，权威值由 F-003 证据决定，两者不一致即 fail-closed 不得采信回复值**）/result(PASS/REWORK/BLOCKED)/summary/findings/required_boundaries。登记映射：result→TestReportIn.result；execution_result→由腿从 F-003 证据事实读入。结论×事实组合矩阵=§4 定稿 15 组合全表（G2-01：EXECUTED_FAIL+PASS 禁止项已补；G2-02：NOT_EXECUTED/CLAIMED_ONLY/BLOCKED+REWORK 不登记统一腿级 BLOCKED）。

**简报输入四组**：任务身份（task_id/title/acceptance_criteria 原始语义不扩展）/执行事实（execution_id+execution_result 事实值+证据来源）/测试证据（F-003 三件套+报告 GitHub 指针，固定完整 40 位 commit 禁隐式读最新 main）/验收边界（files_scope）。绑定字段：review_round_id/input_material_commit/brief_sha256/brief_schema_version。**D3 终裁**：显式 artifact 指针为准（execution_id/测试报告 artifact_id/三件套各自标识与 SHA256 全绑定）；latest_execution 仅发现入口；运行中 latest_execution 与已固定 execution 不一致→停止转人工禁静默切换。

### A-3 恢复矩阵（Gate2 定稿 12 行）

| 断点 | 恢复动作 | 重新派单 |
|---|---|---|
| 简报组装前 | 重读任务与证据，核对输入版本 | 允许首次派单 |
| 简报已组装，**无发送意图** | 校验 brief SHA，继续首次发送 | 允许 |
| **存在发送意图，无发送确认** | 无法证明发送状态→腿级 BLOCKED，人工核查派单现场（同 GPT-02 _resume_inner fail-closed 纪律） | **禁止** |
| 已确认发送，未采集回复 | 原 conversation UUID 补采，校验发送锚点 | **禁止** |
| 已采集，未登记 | 校验 reply SHA/契约/证据绑定，按原幂等键登记 | **禁止** |
| /reports/test 提交结果不确定 | GET /api/v1/reports?type=test&task_id= 查询，逐项核对五字段 | **禁止** |
| 查询确认已登记且 M1 已推进 | 接续完成本轮，不再提交 | 禁止 |
| 查询确认未登记且 M1 仍 TEST_ACCEPTANCE | 确认无已生效登记后才允许按原键重试 | 不重新派单 |
| 报告已登记但 M1 仍 TEST_ACCEPTANCE | 原子推进一致性异常=登记 BUG→腿级 BLOCKED（不得绕过 M1 补事件） | 禁止 |
| 已推进 ACCEPTED/REWORK | 只读核验，本轮完成 | 禁止 |
| GPT-04 回复 BLOCKED | artifacts+messages 留证，M1 保持 TEST_ACCEPTANCE，人工接管 | 禁止 |
| M1 任务级 BLOCKED / 账本与 M1 矛盾或未定义状态 | engine 不得操作，OWNER 接管 / fail-closed 保留现场腿级 BLOCKED | 禁止 |

- 特别强调（Gate2）：duplicate 不是成功响应；查询必须核对五字段；无法确认是否已登记不能靠重试碰运气；端点同事务原子设计下"报告存在而状态未推进"是异常不得绕过。

## 版本记录

| 版本 | 日期 | 状态 | 变更 | 依据 |
|---|---|---|---|---|
| v0.3（Gate2 定稿） | 2026-11-17 | 定稿（开工授权生效） | Gate2 五项终裁落实：①15 组合矩阵定稿（EXECUTED_FAIL+PASS 禁止补列/NOT_EXECUTED、CLAIMED_ONLY、BLOCKED+REWORK 禁止统一腿级 BLOCKED/回复 BLOCKED 一律 artifacts+messages）②D2 终裁=同构复制不抽公共 runner+RunKeyLock 纪律③A-1 白名单 7 端点定稿+排除清单+客户端层校验要求④A-3 恢复矩阵 12 行定稿（新增发送意图无确认 fail-closed 行）⑤D3 显式指针+运行期漂移停止规则；G2-01~04 全部落实 | Gate2 终裁（reply sha256=763cf463e01a2fd0199691244669ba869bfa782960af31bb292c7be39301da9f，dispatch-2026-11-16T18-02-49/recoll 七查全过；两腿 blob 018b0fd8…/6cb08423… 实读） |
| v0.2 | 2026-11-17 | 草案（Gate2 被测对象） | Gate1 三约束整改：G1-01=A-3 恢复路径修正为 GET /api/v1/reports?type=test&task_id=（原 /reports/test_reports 路径不存在）；G1-02=§5 登记冻结契约 duplicate 描述与实现不一致为遗留问题；G1-03=附录 A-2 组合校验矩阵初稿+D3 显式 artifact 指针落稿 | Gate1 裁定（reply sha256=fc9ffcbe7522c3c44a0b722feee2895b5ea30441f0cfa88e8cd6171b82a4076c，dispatch-2026-11-16T17-55-13/recoll 七查全过；blob 31ef0f98f865508c5fa1400dd63fd28756522aa3） |
| v0.1 | 2026-11-17 | 草案（Gate1 被测对象） | 初稿成文（GPT-02 charter v0.3 同构框架，落点 TEST_ACCEPTANCE 关口；登记路线=/reports/test 原生端点；决策点 D1-D5） | 用户 2026-11-17 交接指令；DEC-026 决议二；DEC-088 遗留④迁移先行；角色规范 docs/立项/02 §5；state_machine.py:37/reports.py:201-250/schemas.py:181-188 实读 |
