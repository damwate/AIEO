# GPT-05 工程总审计真实腿最小版接入——立项任务书（草案 v0.7·Gate2-R4 收口修订）

> **文档身份与授权链：** 本文件=Standard 平台路线 GPT-02/03/04/05 逐角色接入的**第四张立项草案**（GPT-03 v1.0 已生效 DEC-057/062；GPT-02 交付闭环 DEC-088；GPT-04 交付闭环 DEC-091）。启动依据=Gate2 裁定"GPT-05 待 GPT-04 形成可验收闭环后再立项"（顺延条件已达成，DEC-091 登记）。生效路径：charter 草案 → Gate1 草案级验证 → Gate2 会务立项评审 → 开工授权（用户 2026-11-17 授权机制=审查方复审通过替代用户逐项拍板，DEC-089 登记；DEC-010 高危红线仍须用户本人拍板）。**评审沿革：** Gate1 PASS_WITH_CONSTRAINTS（reply sha256=bceb502a…083a5e480，dispatch-2026-11-16T20-57-30/recoll）→G05-R1 REJECT 两项整改（reply sha256=abcb99de…c8c3c60d，dispatch-2026-11-16T21-07-15/recoll）→G05-R2 PASS C1/D2 通过+Gate2 启动确认（reply sha256=1f0c51ac…dfaeb076，dispatch-2026-11-16T21-15-51/recoll）→**Gate2 首轮暂不通过（六项：①A-1 REJECT 权限阻断/②A-2 有条件/③A-3 REJECT/④多事务 REJECT/⑤验收设计有条件/⑥边界有条件；未获开工授权）**（reply sha256=0aeecb13…9dfaeb076，dispatch-2026-11-16T21-23-31/recoll 七查全过）→本 v0.4=Gate2-R1 设计修订（按裁定六项处置）→G05-Gate2-R1 复核范围=六项中未通过及有条件通过部分（不重开显式 CLI、同构复制、无状态事件、M1-M4 零修改等已确定设计原则）。

## 1. 需求原文（拟定稿）

> "在 GPT-04 测试验收真实腿最小版（`phase1/tools/test_acceptance_leg.py`，b-20261117-gpt04-test-acceptance-leg，DEC-091）同框架基础上，接入 **GPT-05 工程总审计真实腿最小版**：对指定批次（batch_id 显式指定）自动组装批次审计简报并触发**一次**真实 chatgpt.com 总审计派单（复用 M2 派单链与 fail-closed 门禁），采集审计回复并经冻结契约校验后登记 M1（artifacts+messages，AUDIT_SUBMITTED 批次级信封），审计结论（ACCEPTED/ACCEPTED_WITH_RISKS/BLOCKED）落档留证；**批次状态推进、多批次编排、自动触发链不在本期**。异常按 §5 分类处置，人工随时可介入。"

- **目标：** 批次审计关口由"无真实审计"升级为真实 GPT-05 收发与结论留证，全程证据可追溯——补齐十步流程第四道真实腿（批次级收口）。
- **非目标：** 批次状态自动推进（batch.status 变更属批次编排能力）；多批次/自动触发链；任务级审查（GPT-02/03/04 三腿既有）；生产发布审批（角色红线：总审计员不能批准生产发布）；M1-M4 代码修改（**本 v0.5 唯一例外见 §3 权限方案**，须 Gate2-R2 裁定）。
- **触发方式（D1，Gate1 裁定采纳）：** 一期唯一触发方式=**显式 CLI 指定 batch_id 运行一次**（`engineering_audit_leg.py run --batch-id BATCH-xxx`；每次运行对应一轮审计；自动触发链另行立项）。

## 2. 状态事实基础与缺口分析

**已具备（直接复用，不再立项）：**

| 能力 | 载体 | 证据 |
|---|---|---|
| 审查腿全框架（A0-A5 编排/白名单客户端/账本/resume/attach-reply/RunKeyLock） | 三腿先例，89 用例合跑 PASS | DEC-059/061/062、DEC-088、DEC-091 |
| M2 派单链真实收发+fail-closed+归属校验补采+视口前置拉高 | gpt_dispatch.mjs+inbound 采集+L-018 处置序 | G04 验收链 |
| M1 批次/任务端点 | GET /api/v1/batches/{batch_id}+GET /api/v1/tasks?batch_id=（api.py:304+tasks.py:108-114） | 端点实读 |
| 批次级消息信封 | AUDIT_SUBMITTED=批次级分支（batch_id 必填 string、task_id=const null） | messages-create.schema.json 实读 |
| 服务身份端点白名单（服务端） | security.py SERVICE_ALLOWED_ENDPOINTS（Gate2 实读 blob 7b1efc8d…）：含 GET /tasks/{task_id}、GET /reports、GET /messages、POST /artifacts、POST /messages、GET /board 等——**不含 GET /api/v1/tasks（列表）→权限阻断事实** | Gate2 首轮裁定① |
| 服务身份与白名单模式 | ENGINE-01/02/03 先例+客户端层 method+path 校验 | 各腿 charter |

**待工程化：** GPT-05 批次审计真实腿本体（简报组装/回复契约/留证登记/agent 身份）+**批次任务全景的合法读取方案（§3 权限方案——Gate2 首轮裁定①的阻断项处置）**。

## 3. 架构边界（v0.4：权限方案为唯一例外）

- **职责（D2 延续终裁=同构复制）：** 新增 `phase1/tools/engineering_audit_leg.py`（以 test_acceptance_leg.py 为主要结构参考同构新增；复用既有公共件；**不抽新公共 runner、不重构已 PASS 三腿**）；scheduler.py 零修改。
- **权限方案（Gate2 首轮裁定①的处置——本草案唯一 M1 变更提案，待 Gate2-R1 裁定）：**
  - **事实：** 批次任务全景必须经 GET /api/v1/tasks?batch_id= 列表端点读取；服务端 SERVICE_ALLOWED_ENDPOINTS 未含该路由（Gate2 blob 实读），ENGINE-04 服务身份调用必被 AUTH-0002 拒绝；既有合法接口核查结论=GET /api/v1/board 仅承载批次聚合与 blocked 列表（board.py 实读），GET /tasks/{task_id} 需先知任务 ID——**不存在不修改 M1 又能完整读取批次任务全景的既有合法接口**。
  - **提案 v0.5（Gate2-R1 裁定"服务端必须强制限定查询范围"的落实——最小权限变更方案）：** security.py 定向修改（总量约 6 行，全部位于该模块）：①SERVICE_ALLOWED_ENDPOINTS 增补 `("GET", "/api/v1/tasks")`；②authorize_principal 对该路由增加服务身份强制规则：**服务身份请求 GET /api/v1/tasks 必须携带 batch_id 查询参数，缺省即 403（AUTH-0002 同族）——服务身份无法通过省略 batch_id 获得全局任务列表**；OWNER 人工会话不受影响（kind!="service" 直接放行，现有行为零变化）。
  - **影响面声明（如实，不包装为原红线内实现细节）：** 这是 security.py 约 6 行的 M1 代码变更——对"M1-M4 零修改"红线的例外范围由此从"一行白名单"扩大为"security.py 单模块约 6 行（增补白名单+服务身份 batch_id 强制规则）"，其余 M1-M4 仍零修改；该变更须经 Gate2-R2 裁定批准+用户知情（本 charter 提交即登记依据），未获裁定批准前不实施。
  - **批次资源归属校验的分层声明（Gate2-R1 要求"明确批次资源归属校验"）：** 服务端层=强制 batch_id 存在（结构性限定，杜绝全局枚举）；**跨批次访问的完全隔离需 per-agent 批次授权表（新表+迁移），超出最小版范围——登记遗留待办**（一期残余风险明确保留：**持有服务 token 的调用方可查询任意已知 batch_id 的任务列表——本方案不构成跨批次完全隔离**，开工记录与授权记录均须保留此风险；缓解=ENGINE-04 令牌仅存本机 gitignored runtime+客户端单 --batch-id+简报/报告/账本全链绑定 batch_id+审计证据可追责；后续完全隔离须另行立项或批准权限模型变更）。
  - **回归门槛：** M1 平台既有测试全绿+新增服务身份权限测试（无 batch_id→403/带 batch_id→200/OWNER 无 batch_id→200 行为零变化）+三腿 89 用例合跑回归全绿。
  - **禁止绕行（沿用）：** 不得用 OWNER 凭据代替 ENGINE-04、不得降低批次审计完整性、不得绕过 M1 服务端权限检查。
  - **禁止绕行（Gate2 裁定原文沿用）：** 不得用 OWNER 凭据代替 ENGINE-04 服务身份、不得降低批次审计完整性、不得绕过 M1 服务端权限检查。
- **审计输入：** M1 批次字段（requirement/engineering_standard_version/knowledge_base_commit/status）+批次任务全景（全量分页，C2）+审计材料 GitHub 指针（固定 commit）。
- **接口：** 上行=M1 白名单（附录 A-1 定稿）；下行=M2 零修改复用；契约冻结不改（H2；新增 GPT-05 回复契约=新增文件）。

## 4. 状态与流程

一期流程（单批次、每显式触发一次审计轮）：指定 batch_id → A0 前置只读核查（批次存在+**任务全景全量分页取得（C2）**+任务清单非空）→ A1 简报组装（四组输入+绑定字段）→ A2 真实派单（M2）→ A3 采集+归属强制校验+Ajv 冻结契约校验（失败=保留原始 artifact 不登记，L-008 语义）→ A4 结论留证登记（**三步独立登记：A4a 审计简报 artifact→A4b 审计报告 artifact→A4c AUDIT_SUBMITTED 批次级信封 message；无任何状态事件**）→ A5 终态=留证完成（M1 批次与任务状态一律不动）。
**结论域（角色规范 docs/立项/02 §6）：ACCEPTED／ACCEPTED_WITH_RISKS／BLOCKED**（与任务级三态 PASS/REWORK/BLOCKED 不同域，不混用）。
**结论×发布建议一致性（C3）：** ACCEPTED→可建议提交人工发布审批／ACCEPTED_WITH_RISKS→可有条件建议须披露风险／BLOCKED→**不得**建议提交人工发布审批；最终是否批准发布仍由人工决定（release_recommendation 枚举与 result 一一映射见 A-2 定稿表，矛盾=fail-closed）。
**一期边界：** ①触发=每显式运行一次（幂等键=<run键>+engineering-audit-round-1）；②结论不自动推进任何 M1 状态（无事件提交）；③腿任何环节失败→腿级 BLOCKED 停等人工（run 记录；本腿不存在 M1 任务级 BLOCKED 提交路径）。

## 5. 异常处理

沿 GPT-04 charter §5 全表（网页发送失败 1 次换会话重派/采集 fail-closed 禁重发补采/契约校验失败 L-008/平台故障幂等纪律/状态非法停止不绕过/人工介入），差异两处：

**①无 /reports/test 类原生端点**——登记路线=artifacts+messages 多事务（GPT-02 路线 B 同构，D2 裁定支持），部分成功可续（_ledger_verified 逐项只读核实+skip 重放，不假设原子提交）；messages 409 双证核验（响应指认 message_id+账本请求指纹）沿用。

**②结论权威关系（D2 统一口径，Gate2 首轮 ② 重申）：审计报告 artifact=结论内容唯一权威载体**（完整 findings/standards_matrix/风险/证据）；**AUDIT_SUBMITTED message=登记、关联与检索记录，不得作为独立结论来源**；message 与报告 artifact 的 batch_id/audit_round_id/result/SHA 绑定关系不一致→腿级 BLOCKED；多事务非原子+逐项只读核验+断点保留。

**②b 批次任务与报告全量读取（C2）：** GET /api/v1/tasks?batch_id= 有分页（默认 50、最大 200）——**必须全量遍历任务分页+核对 total 与实收数量+对批次任务逐项读取关联报告（GET /reports?type=…&task_id= 按批次任务逐项查询——该端点无 batch_id 过滤，Gate2 裁定①确认）**；查询失败/遗漏/数量不一致→fail-closed 腿级 BLOCKED。

## 6. 安全与审计

沿 GPT-04 charter §6 全文（凭据三类/OWNER 固定角色/engine §8.6 白名单/审计 C7 §8.7/客户端层 method+path 校验/RunKeyLock/1200B/敏感信息不入日志），差异：engine 身份=**ENGINE-04**（bootstrap 一次性 OWNER 注册）；**无 events 端点**（防御层 event_whitelist=空集，任何事件值一律拒绝）；**结论权威关系=审计报告 artifact 唯一权威载体，message 仅登记关联检索（与 §5 一致）**；message envelope 的 **source.agent_id="GPT-05"（reviewer 角色，全文档唯一口径——§5/§6/A-2/账本/实现任务书一致；提交 Bearer 凭据=ENGINE-04 服务令牌，C7 §8.6 分工同三腿先例）；target.agent_id="AIEO-ORCHESTRATOR"**（腿端固定写入；**已知平台约束如实登记：** 服务端 messaging.register_inbound_message 校验 source agent 存在性但未与认证 principal 相等性绑定——属平台级增强候选，登记遗留待办不在本期改造，客户端侧以常量+账本指纹约束身份正确性）。

## 7. 验收与回滚（v0.4：验收证据矩阵化）

沿 GPT-04 charter §7 框架，**验收矩阵升级为可判定证据矩阵**——每用例固定字段：注入点/前置账本状态/操作/**预期 HTTP 与业务结果/预期 ledger 标志/M1 读回证据/是否允许重派**：

| # | 场景 | 注入点/前置 | 操作 | 预期结果 | 预期 ledger 标志 | M1 读回证据 | 允许重派 |
|---|---|---|---|---|---|---|---|
| A1 | 正常审计轮 | 批次任务全景就绪 | run | exit=0；M1 批次/任务状态零变化 | A0_PRECHECK/A1_BRIEF/A2_SEND_CONFIRMED/A3_CONTRACT_VALID/A4_ARTIFACT_BRIEF/A4_ARTIFACT_REPORT/A4_MESSAGE/A5_DONE | GET /artifacts/{id}×2（sha 回核）+GET /messages?correlation_id=（envelope 全文比对） | 否 |
| A2 | WITH_RISKS | reply=result=ACCEPTED_WITH_RISKS（矩阵含 ISSUE 无 BLOCKED） | run | 留证完成；standards_matrix ISSUE 项与 residual_risks 全部落档 | 同 A1 | 同 A1+report.json 中矩阵 | 否 |
| A3 | 采集 fail-closed | 发送双验已过（替身落 result.json 后退出非零） | run→resume | 禁重发（gpt_dispatch 调用计数=1）；attach 恢复 | A2_SEND_CONFIRMED_COLLECT_FAILED→attach 后 A4_* | 同 A1 | 禁止 |
| A4 | 幂等重放 | A1 完成后同键重放 | run/resume | duplicate→409 双证核验/已核实项 skip；无第二次派单 | A4_DUPLICATE_OK | GET /messages?correlation_id= 仅一轮 | 禁止 |
| A5a | 崩溃窗口：两 artifact 已登记、message 未登记 | ledger 注入 A4_ARTIFACT_* 有、A4_MESSAGE 无 | resume | _ledger_verified 核实 artifact→仅补 message | A4_MESSAGE 补齐 | GET /messages?correlation_id= | 禁止 |
| A5b | 崩溃窗口：message 已登记、聚合标志未写 | ledger 注入 A4_MESSAGE 有、A4_REGISTERED 无 | resume | 读回核验→补聚合标志完成 | A4_REGISTERED 补齐 | 同上 | 禁止 |
| A6 | 人工退路 | 腿级 BLOCKED | attach-reply | 同契约同幂等键登记 | A4_*+ATTACH_REPLY_OK | 同 A1 | 否 |
| A7 | BLOCKED 结论 | reply=result=BLOCKED | run | 仅留证（三步登记完成）；release_recommendation=DO_NOT_SUBMIT | 同 A1 | 同 A1 | 否 |
| A8 | 矩阵汇总一致性 | reply 矩阵含 BLOCKED 而 result=ACCEPTED | run | fail-closed 不登记（契约校验层拦截） | LEG_LEVEL_BLOCKED | 无登记 | 禁止 |
| A9 | 结论×建议矛盾 | reply result=BLOCKED 且 release_recommendation≠DO_NOT_SUBMIT | run | fail-closed 不登记 | LEG_LEVEL_BLOCKED | 无登记 | 禁止 |
| A10 | 服务端权限拒绝 | 服务身份调未授权端点 | run | 客户端白名单先行拦截；AUTH-0002 兜底=腿级 BLOCKED | LEG_LEVEL_BLOCKED | 无 | 禁止 |
| A10b | **全局任务列表拒绝（Gate2-R1 要求的权限回归用例）** | 权限变更落地后：服务身份 GET /api/v1/tasks 不带 batch_id | 平台测试直调 | **403**（服务端强制规则）——服务身份无法获得全局任务列表 | （平台测试断言） | HTTP 403 响应 | 禁止 |
| A10c | **合法批次范围查询通过（Gate2-R2 补充）** | 服务身份 GET /api/v1/tasks?batch_id=BATCH-xxx | 平台测试直调 | **200**+分页 items | （平台测试断言） | HTTP 200 响应 | — |
| A10d | **OWNER 行为零变化（Gate2-R2 补充）** | OWNER 会话 GET /api/v1/tasks 不带 batch_id | 平台测试直调 | **200**（人工会话不受服务身份规则影响，现有行为零变化） | （平台测试断言） | HTTP 200 响应 | — |
| A11 | 分页数量不一致 | 替身任务全景 total≠实收 | A0 | fail-closed 腿级 BLOCKED（C2） | A0_PRECHECK FAIL | 无 | 禁止 |

回滚=恢复矩阵按批次审计轮断点重排（附录 A-3），不退回 M1 状态原则不变。零 mock 红线（真实 chatgpt.com 收发）沿用 DEC-028 口径。测试矩阵=四腿合跑回归（89 用例+本腿新增）。

## 8. 授权与红线

生效链：本草案 → Gate1 → Gate2（首轮暂不通过）→ **Gate2-R1 设计修订（本 v0.4）→ G05-Gate2-R1 复核 → 开工授权**（用户 2026-11-17 授权机制=审查方复审通过；登记 decision-log）；开工后 PASS≠合并授权（DEC-010）。红线沿用：DEC-010/DEC-011（契约冻结）/DEC-017/H2；**M1-M4 零修改——唯一例外=§3 权限方案 security.py 单模块约 6 行（白名单增补+服务身份 batch_id 强制规则，须 G05-Gate2-R4 复核通过+开工授权，其余 M1-M4 仍零修改）**；角色红线（不能绕过任务级审查、不能批准生产发布——审计结论仅建议语义）。

## 9. 不在范围清单（防膨胀）

批次状态自动推进与编排；多批次/自动触发链；任务级审查改造（三腿既有）；生产发布审批链；scheduler.py 修改；新 commit 重审触发；既有契约文件修改；M1-M4 代码修改（**§3 权限方案 security.py 约 6 行除外**）；管理后台；公共 runner 抽取与已 PASS 三腿重构；消息 source-principal 服务端绑定改造（遗留待办）。

## 附录 A-1：ENGINE-04 运行期 M1 白名单（Gate2-R1 定稿）

| # | Method | 路径 | 操作范围 | 服务端白名单现状 | 幂等/读回 |
|---|---|---|---|---|---|
| 1 | GET | /api/v1/batches/{batch_id} | 批次需求/规范版本/状态 | 已允许 | 只读 |
| 2 | GET | /api/v1/tasks?batch_id={batch_id} | **批次任务全景（全量分页遍历+total 核对，C2；服务身份强制带 batch_id——§3 规则②）** | **§3 权限方案对象**（现为 AUTH-0002 拒绝——本行许可依赖 G05-Gate2-R4 复核通过+开工授权的 security.py 约 6 行变更） | 只读分页 |
| 3 | GET | /api/v1/tasks/{task_id} | 单任务详情（全景核验） | 已允许 | 只读 |
| 4 | GET | /api/v1/artifacts/{artifact_id} | 审计材料/留证读回 | 已允许 | 只读 |
| 5 | GET | /api/v1/reports（type/task_id 筛选；**无 batch_id 过滤——按批次任务逐项查询**） | 批次报告全景核验 | 已允许 | 只读分页 |
| 6 | GET | /api/v1/messages?correlation_id={correlation_id} | message 读回核验（409 恢复/绑定核验） | 已允许 | 只读 |
| 7 | POST | /api/v1/artifacts | 三步登记之两步（简报/报告 artifact） | 已允许 | 路径+SHA |
| 8 | POST | /api/v1/messages | AUDIT_SUBMITTED 批次级信封 | 已允许 | message_id 确定性键 |

- **明确排除：** 一切状态事件（POST events——防御层空集）/POST /agents（bootstrap 一次性）/approvals 类/messages cancel-requeue-ack/GET /messages/{message_id}（**服务端白名单未含**——读回统一走 correlation_id 列表查询）/projects、batches 写操作/未列入端点默认拒绝；客户端层 method+path 校验（EngineM1Client 既有模式）。
- **身份边界（Gate2 裁定⑥确认的既有架构事实）：** 服务端 SERVICE_ALLOWED_ENDPOINTS 为全部服务身份共享集合（非 ENGINE-04 专属）；ENGINE-04 的有效边界=客户端 charter 白名单（默认拒绝）+服务端共享白名单兜底+envelope source 常量+账本指纹；**已知平台约束：** 服务端未绑定消息 source 与认证 principal 相等性——登记遗留待办（平台级增强候选），不在本期改造。

## 附录 A-2：回复契约（Gate2-R1 冻结稿——实现即按此落位 contracts/v1.0/engineering-audit-report.schema.json）

**新增文件字段级契约表（additionalProperties: false；除标注外全部 required）：**

| 字段 | 类型/格式 | 说明 |
|---|---|---|
| contract_version | string ^\d+\.\d+$ | "1.0" |
| batch_id | string ^BATCH-\d{3,}$ | 审计批次 |
| audit_round_id | string ≤64 | <run键>+engineering-audit-round-1 |
| reviewer_agent_id | string ^GPT-05$ | |
| engine_agent_id | string ^ENGINE-04$ | |
| input_material_commit | string ^[0-9a-f]{40}$ | 审计材料锚定 commit（完整 40 位） |
| input_material_manifest_sha256 | string ^[0-9a-f]{64}$ | 材料 blob 清单指纹（腿权威生成） |
| brief_sha256 | string ^[0-9a-f]{64}$ | 简报字节指纹（A1 权威生成） |
| standards_matrix | array | 七大工程规范逐项矩阵（C1），七字段见下 |
| standards_matrix[].standard_id | string | 规范编号（按 batches.engineering_standard_version 固定清单识别） |
| standards_matrix[].applicable | boolean | false 须 findings 说明理由 |
| standards_matrix[].requirement | string | 对应要求 |
| standards_matrix[].evidence_refs | array[string] | 证据指针（空须理由） |
| standards_matrix[].result | enum PASS/ISSUE/BLOCKED | 逐项结论 |
| standards_matrix[].findings | string | 问题与说明（豁免理由在此） |
| standards_matrix[].residual_risks | string | 遗留风险 |
| result | enum ACCEPTED/ACCEPTED_WITH_RISKS/BLOCKED | 总结论 |
| release_recommendation | enum SUBMIT_FOR_APPROVAL/CONDITIONAL_SUBMIT_WITH_RISKS/DO_NOT_SUBMIT | 发布建议（仅建议语义） |
| summary | string 1..2000 | |
| findings | array[string] | 批次级发现 |
| risks | array[string] | 批次级风险 |

**一致性规则（腿端 fail-closed，M1 无批次语义）：** ①矩阵汇总映射（G05-R1 定稿表）——任一项 BLOCKED→result=BLOCKED；无 BLOCKED 有 ISSUE→ACCEPTED_WITH_RISKS；全 PASS 或有理由豁免→ACCEPTED 可选；矛盾→不登记。②result×release_recommendation 一一映射——ACCEPTED→SUBMIT_FOR_APPROVAL／ACCEPTED_WITH_RISKS→CONDITIONAL_SUBMIT_WITH_RISKS／BLOCKED→DO_NOT_SUBMIT；其他组合→fail-closed（A9）。③七项规范清单按 batches.engineering_standard_version 固定清单识别，禁止临场解释。

**SHA 对象语义表（每字段唯一对象，防复用）：** brief_sha256=A1 简报磁盘字节（发送原件）；input_material_manifest_sha256=input_material_commit 下逐材料 git blob SHA 的清单哈希；report artifact 的 sha256=report.json（含绑定字段的完整契约报告）内容哈希；reply_sha256（账本内）=原始网页回复字节哈希。交叉核验=message.payload 嵌入 report_artifact_sha+brief_sha，读回时与本地重算比对；不一致→腿级 BLOCKED。

**身份定义统一（Gate2-R1 裁定②落实，沿三腿先例）：** envelope **source.agent_id="GPT-05"**（审计角色 reviewer 身份，平台注册 agent；三腿先例同构——GPT-02/03/04 腿的 message source 均为各自 reviewer agent，提交凭据=各 ENGINE 服务身份令牌，C7 §8.6 分工）；payload.reviewer_agent_id="GPT-05"；**提交服务身份（Bearer）=ENGINE-04**（bootstrap 注册+签发令牌，不写入 envelope source）；**target.agent_id="AIEO-ORCHESTRATOR"**（平台实际 agent ID，三腿同源常量 ORCHESTRATOR_AGENT 实读）。
**message_id 确定性算法冻结（P0-2，逐字沿三腿实现 review_leg.py blob 已核版 message_id() 实读）：**
- 输入=run_key 字符串（^\d{3,}$，CLI 显式提供）。
- 算法：h=int(hashlib.sha256(run_key.encode()).hexdigest(),16)；a=h % 100_000_000；b=(h // 100_000_000) % 1_000_000；输出=f"MSG-{a:08d}-{b:06d}"（满足冻结 schema ^MSG-\d{8}-\d{6}$——格式正则与 8+6 数字位数完全一致；该算法已在 GPT-02/03/04 三次零 mock 实战中真实注册成功，与 M1 消息登记机制兼容性有实战证据）。
- 重放稳定性：同 run_key→同散列→同 ID（确定性）。
- 冲突处理：不同 run_key 理论可撞（14 位数字空间，概率可忽略）；M1 以 message_id 为主键，撞键登记返回 409 RES-0003→按 A-3/④ fail-closed 判定处理，**不静默换键重生成**。
- 与 schema 关系：不另行定义格式，仅复用冻结格式+冻结算法。

**message envelope 示例（AUDIT_SUBMITTED 批次级分支）：** {schema_version:"1.0", message_id:<按上述算法>, message_type:"AUDIT_SUBMITTED", created_at, source:{agent_id:"GPT-05",agent_type:"reviewer"}, target:{agent_id:"AIEO-ORCHESTRATOR",agent_type:"system"}, project_id, batch_id:"BATCH-xxx", task_id:null, correlation_id:"CORR-<run_key>", payload:<上述完整契约报告>}。

## 附录 A-3：逐步骤账本恢复矩阵（Gate2-R1 定稿——登记拆三步独立标志）

**三步独立登记的账本标志与 M1 读回证据（每步：标志→读回→恢复→禁止→完成后追加标志→fail-closed）：**

| 步骤 | 成功标志（字段） | M1 读回核验 | 允许恢复动作 | 禁止 | 完成后追加 | 证据不全/矛盾 |
|---|---|---|---|---|---|---|
| A4a 简报 artifact | A4_ARTIFACT_BRIEF{artifact_id,request_sha,brief_sha256} | GET /artifacts/{id}：path+sha256 与请求一致 | skip 已核实项/原键重试（409→GET 回核 path+SHA 匹配=DUP_OK） | 覆盖/换键重做 | A4_SKIP_VERIFIED 或 A4_DUPLICATE_OK | 409 且回核不匹配→腿级 BLOCKED |
| A4b 报告 artifact | A4_ARTIFACT_REPORT{artifact_id,request_sha,report_sha256} | 同上（path+sha256 一致） | 同上 | 同上 | 同上 | 同上 |
| A4c message | A4_MESSAGE{message_id,request_sha,canonical_sha,report_artifact_sha,brief_sha} | GET /messages?correlation_id=CORR-<run_key>：检索本轮 message | 409→**五条件 AND**（P0-3）：响应指认 message_id+账本 canonical_sha 匹配+correlation_id 读回+规范化指纹一致+与报告 artifact 绑定一致→DUP_OK | 新开审计轮/重新派单/换键 | A4_DUPLICATE_OK / A4_SKIP_VERIFIED | 五条件任一缺失或矛盾→腿级 BLOCKED |
| 全部完成 | A4_REGISTERED（聚合标志，三子标志齐才写） | 三项读回+绑定核验全过 | — | — | A5_DONE | 任一链节不符→腿级 BLOCKED |

**其余断点逐项六字段表（G05-Gate2-R1 补齐）：**
| 断点 | 账本标志 | M1 读回核验 | 允许恢复动作 | 禁止 | 完成后追加 | fail-closed |
|---|---|---|---|---|---|---|
| 简报组装前 | 无 A1_BRIEF | GET /batches/{id}+GET /tasks?batch_id= 重读 | A0→A1 重组装 | 跳过 A0 | A1_BRIEF | 输入不符→腿级 BLOCKED |
| 已组装未发送（无发送意图） | A1_BRIEF 有、无 A2_* | brief_sha256 重算比对 | 校验后首次发送 | 换简报内容 | A2_SEND_CONFIRMED | SHA 不符→重组装 |
| 发送意图无确认 | A2_SEND_INTENT_RECORDED 有、无 CONFIRMED/FAILED | 派单现场目录核查（人工） | 腿级 BLOCKED 停等人工 | 重发/清现场续跑 | LEG_LEVEL_BLOCKED | 一律 fail-closed |
| 已发送未采集 | A2_SEND_CONFIRMED(_COLLECT_FAILED) 有、无 A3_REPLY_CAPTURED | conversation_uuid+sent_user_unit_key 锚点 | 原会话补采（归属校验型+视口前置拉高） | 新会话重发 | A3_REPLY_CAPTURED | 补采失败→腿级 BLOCKED |
| 已采集未登记 | A3_CONTRACT_VALID 有、A4a-c 缺 | reply SHA+契约重验 | A4a→A4b→A4c 顺序补登记 | 重新触发 GPT-05 | A4_* 逐步 | 契约重验失败→腿级 BLOCKED |
| 登记完成 | A4_REGISTERED 三子齐 | 三项读回+绑定核验 | 只读核验认定完成 | 任何重派/覆盖 | A5_DONE | 链节不符→腿级 BLOCKED |
| 账本与 M1 矛盾/未定义状态 | 任意 | 双向核对 | fail-closed 保留现场 | 推测恢复 | LEG_LEVEL_BLOCKED | 一律 fail-closed |

**M1 读回→canonical envelope 映射冻结（P0-3 唯一整改，G05-Gate2-R3 裁定）：** M1 message_view()（messaging.py:267-270 实读）返回扁平化 DB 行（message_id/message_type/source_agent_id/target_agent_id/project_id/batch_id/task_id/correlation_id/payload 反序列化/status/created_at 等）——与嵌套请求 envelope 不同构，禁止把读回 JSON 直接当原 envelope 算指纹。冻结映射：**以账本预期 envelope（原发送对象）为骨架，九个实质字段逐项以 M1 读回值覆盖重建**——message_id/message_type/project_id/batch_id/task_id/correlation_id/payload 直取读回；source={agent_id:读回 source_agent_id, agent_type:账本预期 "reviewer"}；target={agent_id:读回 target_agent_id, agent_type:账本预期 "system"}（agent_type 不在 M1 存储，由账本预期值恢复，且**须断言读回 source_agent_id==账本预期 source.agent_id**，不一致=绑定矛盾 fail-closed）；created_at 不参与（canon 剔除）。重建对象与账本预期 envelope 各自经**同一 _canon_sha 算法**（json.dumps ensure_ascii=False sort_keys=True 剔除 created_at 后 SHA-256）计算并比较。**正反对照样例（冻结证据）：** 正例=读回九字段与原发送一致→重建对象 canon_sha==账本预期 canon_sha（相等）；反例=读回 payload.result 或 batch_id 任一被篡改→重建 canon_sha≠账本值（不相等）——算法对正确内容匹配、对任一实质字段篡改不匹配。
**指纹算法冻结（request_sha/canonical_sha，沿三腿同构先例 review_leg._req_sha/_canon_sha 实读）：** request_sha=请求体 JSON `json.dumps(obj, ensure_ascii=False, sort_keys=True).encode("utf-8")` 的 SHA-256（字段全量覆盖）；canonical_sha=同算法但剔除 created_at 键后的规范化指纹（信封重启重建可比对）；账本请求指纹比对=按上述算法重算而非仅比 message_id。多事务 duplicate/409 可执行判定表：**artifact**：HTTP 409+GET 回核 path+sha256 与本次请求一致→DUP_OK；不一致或无法解析 ID→fail-closed。**message（P0-3 修正：五条件 AND，任一缺失或矛盾→fail-closed 不得判 DUP_OK）**：①HTTP 409 响应明确指认本次 message_id（details.message_id==本次值）②账本存在与本次请求匹配的 canonical_sha ③按 correlation_id 读回 message（GET /messages?correlation_id=）④读回 envelope 规范化指纹与账本一致 ⑤读回 message 的 batch_id/audit_round_id/result 与报告 artifact 绑定一致——五项全成立才判 DUP_OK。

**登记顺序冻结（④）：** A4a→A4b→A4c 严格顺序；每步成功标志独立落账本（原子追加）；禁止合并为笼统 A4_REGISTERED；登记期间禁止新开审计轮或重新派单。部分成功恢复=A5a/A5b 路径+上表逐项动作。

## 版本记录

| 版本 | 日期 | 状态 | 变更 | 依据 |
|---|---|---|---|---|
| v0.7（Gate2-R4 收口修订） | 2026-11-17 | 草案（待 G05-Gate2-R4 极窄复核） | R3 唯一整改 P0-3 闭合=M1 readback→canonical envelope 映射冻结（账本预期 envelope 为骨架+九实质字段读回覆盖+agent_type 账本恢复+source_agent_id 一致断言+同一 _canon_sha 比较+正反对照样例；不要求改 M1 代码）；授权链清理（§3/§8/A-1 "须 Gate2-R2 批准"→G05-Gate2-R4 实际依据）；A-1 残余风险措辞按 R3 收尾清单收紧（明确"不构成跨批次完全隔离"写入开工记录要求） | Gate2-R3 整体 REJECT 但 P0-1/P0-2 PASS+A10b/c/d PASS（reply sha256=3f39e37dfa8d4845…完整值见 recoll-result.json，dispatch-2026-11-16T22-00-43/recoll 七查全过；blob 70eb321a 实读+messaging.py:267-270 message_view 实读；会话迁移建议=审查方提出，R4 于新会话执行） |
| v0.6（Gate2-R3 设计修订） | 2026-11-17 | 草案（待 G05-Gate2-R3 复核三 P0+A10b 断言） | 三 P0 整改：P0-1=§6 身份统一（source=GPT-05 全文档唯一口径，§5/§6/A-2/账本一致；Bearer=ENGINE-04；target=AIEO-ORCHESTRATOR）；P0-2=message_id 算法逐字冻结（run_key SHA-256 折叠 a/b 两段，三腿实战注册成功证据+重放稳定+撞键 409 fail-closed 不换键）；P0-3=message 409 双证改五条件 AND（响应指认+账本指纹+读回+规范化一致+与报告绑定，任一缺失 fail-closed）+A-3 A4c 行同步；A10b 补 A10c（带 batch_id→200）/A10d（OWNER 无 batch_id→200 行为零变化）断言 | Gate2-R2 REJECT（reply sha256=0b9ba7269fa65289…完整值见 recoll-result.json，dispatch-2026-11-16T21-50-31/recoll 七查全过；A-1 PASS_WITH_CONSTRAINTS=残余风险明确披露可保留但不得声称完全隔离） |
| v0.5（Gate2-R2 设计修订） | 2026-11-17 | 草案（待 G05-Gate2-R2 复核） | Gate2-R1 六项处置：①A-1 权限方案重构=security.py 约 6 行（白名单增补+**服务身份 GET /tasks 强制 batch_id 规则**——杜绝全局枚举）+跨批次完全隔离（per-agent 授权表）登记遗留待办+分层归属校验声明+回归门槛含新增权限测试 ②A-2 身份统一（source=GPT-05 reviewer 三腿先例/提交凭据=ENGINE-04/target=AIEO-ORCHESTRATOR 实读）+message_id 格式与冻结 schema 对齐声明 ③A-3 其余断点逐项六字段表+指纹算法冻结（_req_sha/_canon_sha 先例实读）④duplicate/409 可执行判定表 ⑤§7 A10b 全局任务列表拒绝用例 ⑥边界随 A-1 更新 | Gate2-R1 REJECT（reply sha256=3e5d6ef9788a371e…完整值见 recoll-result.json，dispatch-2026-11-16T21-39-22/recoll 七查全过；A-1 裁定原文"不能把文档提案当作代码事实"+全局列表越权分析） |
| v0.4（Gate2-R1 设计修订） | 2026-11-17 | 草案（待 G05-Gate2-R1 复核） | Gate2 首轮六项裁定处置：①A-1 REJECT（**权限阻断事实**=SERVICE_ALLOWED_ENDPOINTS 无 GET /tasks 列表，blob 实读）→§3 权限方案（唯一例外=一行只读白名单增补提案+影响面声明+禁止绕行+回归门槛；既有合法接口核查=board 仅聚合不足）②A-2 有条件→附录 A-2 定稿（字段级契约表/standards_matrix 七字段/一致性规则/SHA 对象语义表/envelope 示例/message_id 确定性规则）③A-3 REJECT→附录 A-3 定稿（三步独立登记标志+六字段粒度逐步骤恢复矩阵+登记顺序冻结）④多事务 REJECT→并入 A-3/§5（登记顺序/409 双证/correlation_id 读回/规范化指纹）⑤验收设计有条件→§7 证据矩阵化（七字段×12 用例含 A5a/A5b 崩溃窗口+A8/A9/A10/A11 边界用例）⑥边界有条件→§6 身份边界如实登记（共享白名单事实+source-principal 绑定为遗留待办）+A-1 补 GET /messages 读回+GET /reports 无 batch_id 过滤声明 | Gate2 首轮裁定（reply sha256=0aeecb13…9dfaeb076，dispatch-2026-11-16T21-23-31/recoll 七查全过；代码事实=security.py blob 7b1efc8d/board.py/reports.py blob a4451d70/messaging.py blob 96e19922/api.py blob 62a8c60c 实读） |
| v0.3 | 2026-11-17 | 草案（G05-R1 两项整改后） | R1 两项整改：C1 矩阵总结果映射规则+D2 §6 权威关系统一 | G05-R1 REJECT（reply sha256=abcb99de…c8c3c60d，dispatch-2026-11-16T21-07-15/recoll） |
| v0.2 | 2026-11-17 | 草案（Gate1 三约束整改后） | C1 七大规范矩阵/C2 全量分页/C3 结论×建议一致性/D1 显式 CLI 终局化/D2 路线 B 支持 | Gate1 PASS_WITH_CONSTRAINTS（reply sha256=bceb502a…083a5e480，dispatch-2026-11-16T20-57-30/recoll） |
| v0.1 | 2026-11-17 | 草案（Gate1 被测对象） | 初稿成文（GPT-04 charter v0.3 同构框架，落点批次审计关口；登记路线=artifacts+messages AUDIT_SUBMITTED 批次级信封；ENGINE-04） | Gate2 GPT-04 裁定顺延条件达成（DEC-091）；用户 2026-11-17 交接指令；角色规范 docs/立项/02 §6 |
