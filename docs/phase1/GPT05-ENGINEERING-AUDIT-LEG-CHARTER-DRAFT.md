# GPT-05 工程总审计真实腿最小版接入——立项任务书（草案 v0.1）

> **文档身份与授权链：** 本文件=Standard 平台路线 GPT-02/03/04/05 逐角色接入的**第四张立项草案**（GPT-03 v1.0 已生效 DEC-057/062；GPT-02 交付闭环 DEC-088；GPT-04 交付闭环 DEC-091）。启动依据=Gate2 裁定"GPT-05 待 GPT-04 形成可验收闭环后再立项"（顺延条件已达成，DEC-091 登记）。生效路径：charter 草案 → Gate1 草案级验证 → Gate2 会务立项评审 → 开工授权（用户 2026-11-17 授权机制=审查方复审通过替代用户逐项拍板，DEC-089 登记；DEC-010 高危红线仍须用户本人拍板）。

## 1. 需求原文（拟定稿）

> "在 GPT-04 测试验收真实腿最小版（`phase1/tools/test_acceptance_leg.py`，b-20261117-gpt04-test-acceptance-leg，DEC-091）同框架基础上，接入 **GPT-05 工程总审计真实腿最小版**：对指定批次（batch_id 显式指定）自动组装批次审计简报并触发**一次**真实 chatgpt.com 总审计派单（复用 M2 派单链与 fail-closed 门禁），采集审计回复并经冻结契约校验后登记 M1（artifacts+messages，AUDIT_SUBMITTED 批次级信封），审计结论（ACCEPTED/ACCEPTED_WITH_RISKS/BLOCKED）落档留证；**批次状态推进、多批次编排、自动触发链不在本期**。异常按 §5 分类处置，人工随时可介入。"

- **目标：** 批次审计关口由"无真实审计"升级为真实 GPT-05 收发与结论留证，全程证据可追溯——补齐十步流程第四道真实腿（批次级收口）。
- **非目标：** 批次状态自动推进（batch.status 变更属批次编排能力）；多批次/自动触发链；任务级审查（GPT-02/03/04 三腿既有）；生产发布审批（角色规范红线：总审计员不能批准生产发布）；契约修改；M1-M4 代码修改。
- **触发方式（决策点 D1）：** 草案推荐一期=**显式 CLI 指定 batch_id 运行一次**（batch 审计时机属批次编排语义，M1 无批次级状态机钩子；自动触发链待批次编排能力另立项）。评审可裁定轮询触发（EXECUTING/PLANNED 批次轮询，复杂度更高）。

## 2. 状态事实基础与缺口分析

**已具备（直接复用，不再立项）：**

| 能力 | 载体 | 证据 |
|---|---|---|
| 审查腿全框架（A0-A5 编排/白名单客户端/账本/resume/attach-reply/RunKeyLock） | review_leg+arch_review_leg+test_acceptance_leg 三腿先例，89 用例合跑 PASS | DEC-059/061/062、DEC-088、DEC-091 |
| M2 派单链真实收发+fail-closed+归属校验补采+视口前置拉高 | gpt_dispatch.mjs+inbound 采集+L-018 处置序（G04-R3 实证视口前置路径） | G04 验收链 |
| M1 批次读取端点 | GET /api/v1/batches/{batch_id}（batches 表：requirement/engineering_standard_version/knowledge_base_commit/status PLANNING-PLANNED-EXECUTING-COMPLETED-CANCELLED）+**GET /api/v1/tasks?batch_id={batch_id}**（api.py:304+tasks.py:108-114 批次过滤实测） | 端点实读 |
| 批次级消息信封 | **AUDIT_SUBMITTED=批次级分支（batch_id 必填 string、task_id=const null）**，messages-create.schema.json 分支实测 | 契约文件 |
| 服务身份与白名单模式 | ENGINE-01/02/03 先例（setup-agents bootstrap+客户端层 method+path 校验） | charter GPT-03 §6/附录 B、GPT-02 A-1、GPT-04 A-1 |
| RunKeyLock 跨进程互斥 | GPT-02 腿纪律（Gate2 GPT-04 终裁沿用） | DEC-088/090 |

**待工程化（本草案立项对象）：** GPT-05 批次审计真实腿——待建=批次审计简报组装（批次需求/任务状态全景/工程规范版本/遗留风险材料）+GPT-05 网页回复契约（新增冻结契约）+结论留证登记+GPT-05 agent 身份（bootstrap）。

## 3. 架构边界

- **职责（D2 延续终裁=同构复制）：** 新增 `phase1/tools/engineering_audit_leg.py`（以 test_acceptance_leg.py 为主要结构参考同构新增；复用既有公共件；**不抽新公共 runner、不重构已 PASS 三腿**）；**M1/M2/M3/M4 代码零修改**；无 scheduler 修改（触发=显式 CLI）。
- **审计输入：** M1 批次字段（requirement/engineering_standard_version/knowledge_base_commit/status）+批次任务全景（GET /tasks?batch_id= 各任务 task_id/title/status/acceptance_criteria）+审计材料 GitHub 指针（固定 commit；出站 ≤1200B）。
- **接口：** 上行=M1 白名单（附录 A-1 初稿：**无任何状态写事件**——批次审计不推进任务/批次状态）；下行=M2 零修改复用；契约冻结不改（H2；新增 GPT-05 回复契约=新增文件）。

## 4. 状态与流程

一期流程（单批次、每显式触发一次审计轮）：指定 batch_id → A0 前置只读核查（批次存在+任务清单非空+任务状态全景取得）→ A1 简报组装（任务身份/批次需求/任务状态全景/遗留风险+绑定字段）→ A2 真实派单（M2）→ A3 采集+归属强制校验+Ajv 冻结契约校验（失败=保留原始 artifact 不登记，L-008 语义）→ A4 结论留证登记（**artifacts×2+messages AUDIT_SUBMITTED 批次级信封；不经任何状态事件**）→ A5 终态=留证完成（M1 批次与任务状态一律不动；批次状态推进=OWNER 人工/批次编排能力）。
**结论域（角色规范 docs/立项/02 §6）：ACCEPTED／ACCEPTED_WITH_RISKS／BLOCKED**（与任务级三态 PASS/REWORK/BLOCKED 不同域，不混用）；结论语义=批次是否具备提交人工发布审批的建议（**不批准生产发布**——角色红线）。
**一期边界：** ①触发=每显式运行一次（幂等键=<run键>+engineering-audit-round-1）；②结论不自动推进任何 M1 状态（无事件提交——GPT-04 腿 D5 同构，且批次无状态机事件接口）；③腿任何环节失败→腿级 BLOCKED 停等人工（run 记录；无 M1 状态语义）。
**BLOCKED 双语义：** 全文默认腿级（run 层）；本腿不存在 M1 任务级 BLOCKED 提交路径（无 events 写入口）。

## 5. 异常处理

沿 GPT-04 charter §5 全表（网页发送失败 1 次换会话重派/采集 fail-closed 禁重发补采/契约校验失败 L-008/平台故障幂等纪律/状态非法停止不绕过/人工介入），差异一处：**无 /reports/test 类原生端点**——登记路线=artifacts+messages 多事务（GPT-02 路线 B 同构），部分成功可续（_ledger_verified 逐项只读核实+skip 重放）；messages 409 双证核验（响应指认 message_id+账本请求指纹）沿用。

## 6. 安全与审计

沿 GPT-04 charter §6 全文（凭据三类/OWNER 固定角色/engine §8.6 白名单/审计 C7 §8.7/客户端层 method+path 校验/RunKeyLock/1200B/敏感信息不入日志），差异：engine 身份=**ENGINE-04**（bootstrap 一次性 OWNER 注册，先例 ENGINE-01/02/03）；**无 events 端点**（防御层 event_whitelist=空集，任何事件值一律拒绝——GPT-04 同构）；结论权威=AUDIT_SUBMITTED 消息+artifacts 证据链（无原生结论表——批次级审计登记语义，附录 E 权威关系=GPT-03 charter 附录 E 同构：messages=传输记录/artifacts=证据链，两者不一致→腿级 BLOCKED 停等人工不自动改写）。

## 7. 验收与回滚

沿 GPT-04 charter §7 框架改写：A1 正常审计轮（批次→简报→派单→ACCEPTED 结论→留证完成，无状态变更证明）；A2 WITH_RISKS 结论（留证+边界记录）；A3 采集 fail-closed 注入（禁重发证明）；A4 幂等重放（同键重放→409 双证核验/跳过已核实项）；A5 两类断点恢复（已发送未采集/已采集未登记）；A6 人工退路（attach-reply 同契约同幂等键）；A7 BLOCKED 结论（仅留证）。回滚=恢复矩阵按批次审计轮断点重排（附录 A-3 初稿），不退回 M1 状态原则不变。零 mock 红线（真实 chatgpt.com 收发）沿用 DEC-028 口径。测试矩阵=四腿合跑回归（GPT-03/02/04+本腿，沿 89 合跑先例扩展）。

## 8. 授权与红线

生效链：本草案 → Gate1 草案级验证 → Gate2 会务立项评审 → 开工授权（用户 2026-11-17 授权机制；登记 decision-log）；开工后 PASS≠合并授权（DEC-010）。红线沿用：DEC-010/DEC-011（契约冻结）/DEC-017（扩展门禁不解除）/H2（新增契约文件不改既有文件）/角色红线（总审计员不能绕过任务级审查、不能批准生产发布——审计结论仅建议语义）。

## 9. 不在范围清单（防膨胀）

批次状态自动推进与编排；多批次/自动触发链；任务级审查改造（三腿既有）；生产发布审批链；scheduler.py 修改；新 commit 重审触发；既有契约文件修改；M1-M4 代码修改；管理后台；公共 runner 抽取与已 PASS 三腿重构。

## 附录 A：Gate2 评审输入初稿

### A-1 ENGINE-04 运行期 M1 白名单端点表（初稿，Gate2 精化）

| Method | 路径 | 操作范围 | 拒绝条件 | identity_scope | idempotency_scope |
|---|---|---|---|---|---|
| GET | /api/v1/batches/{batch_id} | 读取批次需求/规范版本/状态 | 批次不存在 | ENGINE-04 | 按批次 |
| GET | /api/v1/tasks?batch_id={batch_id} | 批次任务状态全景 | 批次不匹配 | ENGINE-04 | 按批次 |
| GET | /api/v1/tasks/{task_id} | 单任务详情（全景核验） | 非本批次任务 | ENGINE-04 | 按任务 |
| GET | /api/v1/artifacts/{artifact_id} | 读取审计输入材料 | 非关联材料 | ENGINE-04 | 按资源 ID |
| GET | /api/v1/reports（type/task_id 筛选） | 批次任务报告全景核验 | 非核实目的 | ENGINE-04 | 只读幂等 |
| POST | /api/v1/artifacts | 登记审计简报与结论证据 | 登记契约不符/幂等冲突 | ENGINE-04 | 路径+SHA（M1 语义） |
| POST | /api/v1/messages | AUDIT_SUBMITTED 批次级信封登记 | 非指定消息类型/身份不匹配 | ENGINE-04 | message_id 确定性键 |

- **明确排除：** POST /tasks/{task_id}/events（无任何状态事件——批次审计不推进状态）/POST /agents（bootstrap 一次性）/approvals 类/messages cancel-requeue-ack/projects、batches 写操作/**一切批次状态写路径**。未列入的所有 M1 端点默认拒绝；白名单在客户端请求层执行 method+path 校验。
- **POST /api/v1/agents 不入运行期白名单**：GPT-05/ENGINE-04 身份注册=一次性 OWNER bootstrap。

### A-2 审计简报组装与回复契约（初稿）

**回复契约=新增 `engineering-audit-report.schema.json`（新增文件，H2 纪律）**，字段草案：contract_version/batch_id/audit_round_id/reviewer_agent_id(GPT-05)/engine_agent_id(ENGINE-04)/input_material_commit(40hex)/input_material_manifest_sha256/brief_sha256/result(ACCEPTED/ACCEPTED_WITH_RISKS/BLOCKED)/summary/findings(string[])/risks(string[])/required_boundaries/release_recommendation(布尔建议字段——仅建议语义，不替代 result，不构成发布授权)。登记=artifacts（简报+报告证据）+messages（AUDIT_SUBMITTED 批次级信封 batch_id 必填/task_id=null）；**不经任何状态事件**。
**简报输入四组**：批次身份（batch_id/requirement/engineering_standard_version）/任务状态全景（GET /tasks?batch_id= 各任务 task_id/title/status 计数与明细）/报告与遗留（GET /reports 全景核验指针）/审计材料（GitHub 指针固定 commit）。绑定字段：audit_round_id/input_material_commit/brief_sha256/brief_schema_version。

### A-3 恢复矩阵初稿（批次审计轮断点，Gate2 精化）

| 断点 | 恢复动作 | 重新派单 |
|---|---|---|
| 简报组装前 | 重读批次与任务全景，核对输入版本 | 允许首次派单 |
| 简报已组装，无发送意图 | 校验 brief SHA，继续首次发送 | 允许 |
| 存在发送意图，无发送确认 | 无法证明发送状态→腿级 BLOCKED（fail-closed） | **禁止** |
| 已发送未采集 | 原会话补采（归属校验型+视口前置拉高），核验发送锚点 | **禁止** |
| 已采集未登记 | 校验 reply SHA/契约，按原幂等键补登记 | **禁止** |
| 登记部分成功 | _ledger_verified 逐项只读核实补缺项（GPT-02 路线 B 同构） | **禁止** |
| 登记完成（结论留证） | 只读核验，本轮完成 | 禁止 |
| 账本与 M1 矛盾或未定义状态 | fail-closed，保留现场，腿级 BLOCKED | 禁止 |

## 版本记录

| 版本 | 日期 | 状态 | 变更 | 依据 |
|---|---|---|---|---|
| v0.1 | 2026-11-17 | 草案（待 Gate1） | 初稿成文（GPT-04 charter v0.3 同构框架，落点批次审计关口；登记路线=artifacts+messages AUDIT_SUBMITTED 批次级信封（无原生端点/无状态事件）；决策点 D1 触发方式；ENGINE-04；新增 engineering-audit-report.schema.json 契约） | Gate2 GPT-04 裁定顺延条件达成（DEC-091）；用户 2026-11-17 交接指令；角色规范 docs/立项/02 §6；messages-create.schema.json 分支/api.py:304/tasks.py:108-114 实读 |
