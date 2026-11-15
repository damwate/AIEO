# GPT-03 审查真实腿最小版接入——立项任务书（草案 v0.6，Gate2 修订稿）

> **文档身份与授权链（I7）：** 本文件=Standard 平台路线下一项立项**草案**（b-20261115-standard-kickoff S2 产出，v0.1 为误定对象的 F-001 立项草案——S2 独立验收 REJECT 后按 P1-01 重定位重写，沿革见版本记录）。生效路径：会务立项评审 → **用户确认需求原文（§1）** → 用户拍板开工（H7；立项准备≠实施授权）。路线依据：DEC-026 决议二（F-001 最小版已完成→GPT-02/03/04/05 逐角色接入）、DEC-036（T-P1-908 全链闭合=F-001 最小版落地）、DEC-037（分级路线，Standard 迭代）。

## 1. 需求原文（拟定稿，待用户确认——I1）

> "在 T-P1-908 单任务编排闭环（DRAFT→DEV_REPORTED，`phase1/tools/scheduler.py`）基础上，接入 **GPT-03 审查真实腿最小版**：DEV_REPORTED 任务自动触发**一次**真实 chatgpt.com 审查派单（复用 M2 派单链与 fail-closed 门禁），采集审查回复并经冻结契约校验后登记 M1，审查结论（通过/返工建议）落档并按 M1 既有状态机推进；**多轮返工重审、GPT-02/04/05 其余角色不在本期**。异常按 §5 分类处置，人工随时可介入。"

- **目标：** DEV_REPORTED 任务的审查环节由代码自动完成一轮真实收发与结论登记，全程证据可追溯。
- **非目标：** 多轮审查重审自动化；GPT-02 架构审核/GPT-04 测试证据检查/GPT-05 批次审计真实腿；多任务/多批次编排；自动合并 main；DEC-017 扩展场景解锁；采集恢复状态机（C5 另行立项）。
- **角色接入顺序=立项评审决策点：** 草案推荐 GPT-03 首位（理由：直接延长既有闭环生命周期 DEV_REPORTED→审查，改动面最小；GPT-02 架构审核需嵌入规划→调度之间，涉及规划流改造）。若用户/评审裁定 GPT-02 或其他顺序，本任务书按同框架改写对象重报。

## 2. 状态事实基础与缺口分析（P1-01 整改——先说清已有与待建）

**已具备（T-P1-908 交付，DEC-036 全链闭合，不再立项）：**

| 能力 | 载体 | 证据 |
|---|---|---|
| 单任务 S0-S9 真实编排（DRAFT→DEV_REPORTED） | `phase1/tools/scheduler.py`（1308 行，Python 标准库单文件；M1-M4 零修改；调度器只编排不仲裁，状态唯一持有方=M1） | DEC-034 ORCHESTRATED_PASS（run ORCH-908019）；RUN-RECORD |
| 真实 ChatGPT 单角色（GPT-01）收发+904 冻结契约校验+幂等登记 | scheduler S2-S4+M2 工具链 | DEC-036 七轮验收+合并后复核 ACCEPT |
| M3 真实 claim/report、M4 commit+diff 采集、test_worker（F-003） | 既有模块 | DEC-026/DEC-029/DEC-036 |
| 派单故障处置经验（网页采集 fail-closed/补采/键漂移） | L-018（**适用范围=ChatGPT 网页派单采集异常**，不泛化为平台执行腿） | AI-DEV-LESSONS L-018 |

**待工程化（本草案立项对象=其中审查腿一项）：** GPT-03 审查真实腿（DEV_REPORTED 之后无自动审查环节，当前停等人工）；其余（GPT-02/04/05、新 commit 重审触发、多任务与监控循环）按 DEC-026 路线另行立项。

**历史状态冲突校正（随本草案同步完成）：** FEASIBILITY-REGISTER F-001 原"OPEN/未工程化"与 PHASE-STATUS"下一项=F-001 立项"系 T-P1-908 闭合（DEC-036）后未同步的文档漂移——两处已在本任务 S2 修正 commit 校正（CLOSED(最小版落地)＋指向 DEC-036 证据），原文本保留作历史。

## 3. 架构边界（I2）

- **职责：** 审查腿接入=在 scheduler 编排框架内新增"审查阶段"编排步骤（或独立最小脚本经 M1 事件驱动，二选一为立项评审决策点，推荐前者沿用 S0-S9 框架）；复用 M2 派单链（gpt_dispatch+inbound 采集+fail-closed 门禁，零修改）、M1 REST 登记、冻结契约校验（904 Ajv 模式先例）；**M1/M2/M3/M4 代码零修改**纪律沿用。
- **审查对象输入：** M4 已采集的 commit+diff+测试报告（DEV_REPORTED 任务既有 artifacts）——审查简报出站 ≤1200B 纪律沿用，长材料走 GitHub 指针（L-007）。
- **接口：** 上行=M1（任务/artifacts/状态事件，C2/C5/C7）；下行=M2 工具链（C3/C4）；**契约 v1.0.0 冻结文本不修改**（H2）。

## 4. 状态与流程（I3+P1-02 一期边界）

一期流程（单任务、单轮审查，状态路径=M1 既有合法出边，依据 `app/platform/state_machine.py:33-37` 与 C2 14 态）：DEV_REPORTED 任务存在 → 审查腿发 `GIT_VALIDATE` 事件（DEV_REPORTED→GIT_VALIDATING）→ Git 校验通过发 `PASS`（GIT_VALIDATING→CODE_REVIEW）→ CODE_REVIEW 状态组装审查简报（diff/测试证据指针）→ 真实派单（M2）→ 回复采集与契约校验 → 结论登记 M1（artifacts+messages，幂等键）→ 审查结论状态推进：**PASS→TEST_ACCEPTANCE／REWORK→REWORK（CODE_REVIEW 合法出边）**；审查腿故障→**腿级 BLOCKED**（run 层记录，M1 任务不动；进入 M1 task.status=BLOCKED 仅 OWNER 决定，见 §5 语义区分与 §6 白名单）。
**一期边界明确：** ①自动触发=每个 DEV_REPORTED 任务**一次**审查轮；②审查结论=REWORK 时不自动重开开发轮，登记后停等人工（多轮重审自动化属非目标）；③审查腿任何环节失败→任务保持当前 M1 状态停等人工（§7 回滚），不阻塞既有 DEV_REPORTED 结果。

## 5. 异常处理（I4+P1-02 分类与重试规则）

| 错误类别 | 判定 | 处置 | 重试规则 |
|---|---|---|---|
| 网页派单发送失败（未进入发送双验） | M2 发送门禁报错 | 换新会话重派一次（ST-08 ①路径）；再失败登记 BLOCKED 停等人工 | 允许 1 次换会话重派 |
| 网页采集 fail-closed（发送双验已过） | INBOUND_* 错误码 | **禁重发**；按 L-018 三步诊断→静态 DOM 补采（归属校验型驱动）；补采失败→**腿级 BLOCKED** | 补采不限次但不发送；补采亦失败→停等人工 |
| 网页采集 fail-closed（发送双验已过） | INBOUND_* 错误码 | **禁重发**；按 L-018 三步诊断→静态 DOM 补采（归属校验型驱动）；补采失败→**腿级 BLOCKED** | 补采不限次但不发送；补采亦失败→停等人工 |
| 审查回复契约校验失败 | 904 Ajv 模式错误 | 保留原始 artifact，不登记成功结果，BLOCKED 停等人工（L-008 语义） | 禁止改数据重放 |
| 平台执行腿故障（M1 REST 不可达/M4 采集失败等） | 网络/5xx/非零退出码 | M1 outbox 既有重试语义（幂等操作：读取类可自动重试；**业务副作用类（状态推进/登记）无幂等键确认前禁自动重试**） | 重试耗尽→**腿级 BLOCKED** 停等人工 |
| 状态推进非法 | M1 状态机拒绝 | 停止编排，登记事件，不绕过（scheduler 既有纪律） | 禁止重试绕过 |
| 人工介入 | 任意环节 | OWNER 可暂停/取消；恢复后从 M1 状态断点继续 | — |

**BLOCKED 语义区分（会商底线，两种不得混用）：** ①**腿级 BLOCKED**＝审查腿内部停止（run 记录/任务包登记），**M1 任务保持当前状态（DEV_REPORTED/GIT_VALIDATING/CODE_REVIEW）不变**，人工可接管继续；②**M1 task.status=BLOCKED**＝真实任务状态（仅 OWNER 决定的任务级阻塞才进入；依 state_machine 该状态**无推进审查结论的合法出边**，不得假设人工可直接恢复 CODE_REVIEW）。本任务书 §5/§7 所有"BLOCKED 停等人工"默认指**腿级**。

## 6. 安全与审计（I5+P1-03 主体—操作—授权边界表，C7 §8.5/8.6/8.7 逐项落实）

**凭据三类边界（C7 §8.6；互不混用）：** ①**OWNER 凭据**＝人类会话凭据（C7 §8.5 固定 OWNER 角色，所有管理 API 需有效会话）——仅 OWNER 人工操作使用；②**本机服务身份凭据**＝engine/执行腿的独立本机服务身份（不伪装浏览器用户；凭据放 OS 用户可访问配置/系统凭据存储，文件权限最小化，**禁止入 Git**）——权限白名单内使用；③**外部执行端凭据**＝M3 领取端等执行侧凭据——最小化，沿用 T-P1-908 先例"Worker 默认无业务凭据"。

| 主体 | C7 身份类型 | 可执行操作（白名单） | 禁止操作 | 依据 |
|---|---|---|---|---|
| OWNER（用户本人） | §8.5 固定 OWNER（人类会话） | 启动/暂停/恢复/取消 run；批准开工；确认需求原文；**MERGE_TO_MAIN 等审批 target** | —（审批类操作不可下放） | DEC-010；C7 §8.5；C2 approvals target_type |
| 调度引擎（engine） | §8.6 独立本机服务身份 | **M1 白名单=附录 B 定稿表**（8 端点；events 入口限事件白名单 GIT_VALIDATE/PASS/REWORK；messages ACK 已移出）；经 M2 工具链发起审查派单 | DB 直改；白名单外端点；BLOCKED/CANCEL 等事件（engine 调用层禁止）；**推进 M1 任务至 BLOCKED 态**（任务级仅 OWNER）；MERGE_TO_MAIN/RELEASE/DEAD_LETTER_REQUEUE/CONTRACT_CHANGE 类审批；自行推断/修正 M1 状态 | C7 §8.6 白名单；state_machine.py 出边；T-P1-908 既有边界；**允许访问接口≠允许任意状态推进（事件合法性由 M1 状态机最终裁定）** |
| 执行腿（M2/M3/M4/test_worker） | 各自既有身份（M3=§8.6 MCP stdio 服务身份） | 各自既有能力 | 接口契约消费，零修改 | 契约 v1.0.0；T-P1-908 先例 |
| 人工执行者（编排会话） | OWNER 会话下人工操作 | 开发交接（方案 b 先例）/审查响应 | 受 Basic WORKFLOW 约束 | T-P1-908 §S7 |

- 审计（C7 §8.7）：审查轮全过程经 M1 审计（operator=engine 服务身份标识+event_id 幂等）；登录失败/敏感操作入 audit_logs；敏感信息不入日志不入 Git（C6/C7）；派单出站 ≤1200B。

## 7. 验收与回滚（I6+P1-04 可执行验收矩阵）

| # | 场景 | 前置 | 动作 | 预期（状态明确） | 失败判定 | 必留证据 |
|---|---|---|---|---|---|---|
| A1 | 正常审查轮 | 存在 DEV_REPORTED 真实任务（908 复用或新造） | 触发审查腿一次 | 状态路径逐步：DEV_REPORTED→GIT_VALIDATING（GIT_VALIDATE 事件）→CODE_REVIEW（PASS 事件）→审查派单采集→结论登记→**PASS→TEST_ACCEPTANCE／REWORK→REWORK**（均=state_machine.py 合法出边）；真实 GPT-03 回复+契约校验过+结论落档 | 状态停在非预期态/登记缺失/非法转换报错未处理 | dispatch 目录+reply SHA+M1 事件序列（task_events）+契约校验输出 |
| A2 | 审查结论=返工建议 | A1 后结论含返工 | 观察后续 | 任务状态=REWORK，仅登记+停等人工，不自动重开开发轮 | 自动重开开发轮=FAIL | M1 事件+状态快照 |
| A3 | 采集 fail-closed 注入 | 派单发送双验已过 | **注入点=采集层只读构造**（强制小视口 reload 触发虚拟化窗口，使 readReplySnapshot 报 INBOUND_WINDOW_COMPLETENESS_UNPROVEN；不改工具代码）| 禁重发（证明：dispatch 账本仅一次 SEND_STARTED+会话内 user unit 计数与发送后快照一致）→按 §5 补采恢复或 BLOCKED | 出现第二次发送=FAIL | dispatch 账本+前后 unit 计数对比+补采 result.json 六查输出 |
| A4 | 幂等重放 | A1 完成，幂等键=`<run 键>+review-round-1`（沿用 908 幂等键模式） | 重放同一登记请求原文（artifacts+messages+事件） | M1 无重复登记（event_id/messages 幂等）；无新外部副作用（dispatch 目录数不增+ChatGPT 会话 user unit 数不变） | 出现重复登记或新派单=FAIL | 重放前后 M1 查询对比+dispatch 目录计数 |
| A5 | 重启恢复（两类断点分别测） | ①已发送未采集：派单完成、reply 未落盘时终止进程；②已采集未登记：reply 已落盘、M1 登记未完成时终止 | 重新拉起审查腿 | ①禁重发→补采路径恢复（§5）；②仅补登记，不重新触发 GPT（L-008 语义） | ①重发=FAIL；②重新派单=FAIL | 两类现场各一轮：断点快照+恢复后 M1 状态与登记对比 |
| A6 | 人工退路 | 审查腿**腿级 BLOCKED**（M1 任务保持 CODE_REVIEW 不变） | 人工经既有派单链完成审查并按**同一契约校验+同一幂等键**登记 | M1 内登记完整（artifacts+messages+事件）且状态推进与自动路径一致（CODE_REVIEW→结论）；判定=三项登记齐+状态符合 §4 映射 | 登记缺失/状态不符=FAIL | 人工登记记录+reply SHA+M1 事件 |
- 回滚/退路定稿=**附录 D**（按 M1 状态×断点恢复矩阵 11 行+回滚与人工接管规则 8 行；回滚定义=停止新增副作用、保留已发生事实、从当前 M1 状态交接人工，**不将 M1 状态退回前一状态**）；A7-A10 新增验收用例见附录 D。
- 独立验收：双分支惯例（开发分支+证据分支，§2.4 平台纪律）；零 mock 红线（真实 chatgpt.com 审查收发）沿用 DEC-028 授权文本口径。

## 8. 授权与红线（I7）

- 生效链：本草案 → 会务立项评审（含角色顺序/架构归属决策点裁定）→ **用户确认需求原文（§1）** → 用户拍板开工；开工后 PASS≠合并授权（DEC-010）。
- 红线沿用：DEC-010/DEC-011（契约不改）/DEC-017（扩展门禁不解除）/H5（M2 并行治理未生效，单线程开发）。

## 9. 不在范围清单（防膨胀）

GPT-02/04/05 真实腿；多轮审查重审自动化；新 commit 重审触发；多任务/多批次编排与监控循环；采集恢复状态机（C5）；管理后台（F-005）；DEC-017 扩展场景；契约修改；M1-M4 代码修改。

## 附录 A：会务立项评审输入初稿（Gate 2 深度项——v0.4 起随草案提交，待评审精化，非草案级验收项）

1. **engine M1 白名单端点表初稿**（来源=phase1/logs/e-check-20261114/m1-endpoints.json 机器清单节选；待评审核定）：
   - 只读：`GET /api/v1/tasks/{task_id}`、`GET /api/v1/tasks/{task_id}/dependencies`、`GET /api/v1/artifacts/{artifact_id}`、`GET /api/v1/board`
   - 登记与推进（幂等键）：`POST /api/v1/tasks/{task_id}/events`、`POST /api/v1/artifacts`、`POST /api/v1/messages`、`POST /api/v1/messages/{message_id}/ack`
   - 审查结论登记：`POST /api/v1/reports/review`
   - **明确排除**：approvals 类（MERGE_TO_MAIN/RELEASE/DEAD_LETTER_REQUEUE/CONTRACT_CHANGE）、messages cancel/requeue、projects/batches 写操作
2. **A5 恢复证据字段初稿**：dispatch 目录账本（SEND_STARTED 计数=1 证明）＋conversation UUID＋发送后 user unit 计数快照＋M1 状态/登记前后对比；独立证明未重新派单=账本单次发送+会话 unit 计数一致双证据。
3. **回滚分支初稿**（按故障时 M1 状态分列，全部=腿级退路，不改变 M1 状态）：DEV_REPORTED（未发 GIT_VALIDATE）→人工接续；GIT_VALIDATING（校验中）→人工完成校验后发 PASS；CODE_REVIEW（审查中）→腿级 BLOCKED 人工接管审查；任何态→腿级 BLOCKED 登记后人工按 M1 既有接口操作。

## 版本记录

| 版本 | 日期 | 状态 | 变更 | 依据 |
|---|---|---|---|---|
| v0.1 | 2026-11-15 | 已被本版取代 | 初稿误定对象为"F-001 立项"（基于未同步漂移状态 F-001 OPEN）——S2 独立验收 REJECT（问题3~6）指出 T-P1-908 已落地 F-001 最小版（DEC-036） | b-20261115-standard-kickoff S2 |
| v0.2 | 2026-11-15 | 草案（待会务评审→待用户确认需求原文→待用户拍板开工） | 对象重定位=GPT-03 审查真实腿最小版（推荐首角色，顺序留评审决策点）；§2 缺口分析（P1-01）/§4 一期边界（P1-02）/§5 错误分类重试表（P1-02）/§6 授权边界表（P1-03）/§7 可执行验收矩阵（P1-04）；随附 FEASIBILITY/PHASE-STATUS 漂移校正 | S2 验收 REJECT 整改（问题3~6） |
| v0.6 | 2026-11-15 | 草案（Gate2 修订稿·修订后再评被测对象） | Gate2 回执（reply sha256=fbd3f0ee3f18b94907d90d614978b1250922a7322d25b0b7141a82149830f70e，recoll-2026-11-15T13-06-02-854Z）五项关闭事项落实：标题版本统一 v0.6（F-G2-01）/附录 B 端点定稿表（ACK 移出+事件白名单）/附录 C A5 账本+三断点快照+四证据规则/附录 D A6 恢复矩阵 11 行+回滚接管规则+A7-A10/附录 E 登记权威关系 | S2-Gate2 立项评审 |
| v0.5 | 2026-11-15 | 草案（Gate1 复验被测对象） | G1-03 整改：engine 白名单移除 BLOCKED 态推进（任务级 BLOCKED 仅 OWNER，引擎故障=腿级 BLOCKED run 层记录）；§4 对齐 | S2-Gate1 验证轮裁定（reply sha256=dd1866336b88bdfa…） |
| v0.4 | 2026-11-15 | 草案（降档验证轮被测对象） | 用户拍板批准会商方案甲+丙（三关口）；§5/§7 落实 A6 底线=两种 BLOCKED 语义区分（腿级 vs M1 任务状态）；新增附录 A《会务立项评审输入初稿》（端点白名单/A5 账本证据/回滚分支——深度项转入 Gate 2 评审） | S2 恢复执行（用户拍板 2026-11-15） |
| v0.3 | 2026-11-15 | 草案（状态不变） | S2-R2 复验问题4 关闭；问题3 残留=PHASE-STATUS 文件头旧结论（已随本任务修正 commit 校正至 v0.10）；问题5 整改=§6 凭据三类边界+engine C7 §8.6 服务身份与白名单/禁止操作列+§8.7 审计落实；问题6 整改=§4 状态路径明确（state_machine.py:33-37 合法出边 GIT_VALIDATING/CODE_REVIEW/TEST_ACCEPTANCE/REWORK）+§7 A1 状态预期/A3 注入点与禁重发证明/A4 幂等键定义/A5 两类断点恢复/A6 人工登记判定/回滚改"不改变既有状态停等人工" | S2-R2 复验（reply sha256=2de7fd0f…，recoll-2026-11-15T11-52-35-084Z）问题3/5/6 整改 |

## 附录 B：engine M1 白名单端点定稿表（Gate2 精化；来源=m1-endpoints.json 机器清单+本表裁定；ACK 已移出）

> 通用规则：①端点白名单≠事件白名单——events 入口仅允许 GIT_VALIDATE/PASS/REWORK，BLOCKED/CANCEL 在 engine 调用层明确禁止；②事件合法性由 M1 状态机最终裁定；③登记授权（登记类）与 ACK（改变消息处理状态）分开授权，ACK 不在白名单。

| 端点 | 操作范围与作用对象 | 允许请求/事件值 | 幂等键规则 | 拒绝条件与预期响应 | 副作用 | 验收用例 |
|---|---|---|---|---|---|---|
| GET /api/v1/tasks/{task_id} | 读指定任务状态与元数据，仅限当前审查任务 | — | 只读 | 任务不存在/无权限/含秘密字段→拒绝读取 | 无 | A1 |
| GET /api/v1/tasks/{task_id}/dependencies | 读指定任务依赖及状态 | — | 只读 | 任务不存在/借此读无关任务→拒绝 | 无 | A1 |
| GET /api/v1/artifacts/{artifact_id} | 读已登记审查输入 artifact | — | 只读 | 不存在/超审查任务关联范围→拒绝 | 无 | A1 |
| GET /api/v1/board | 仅必要时读最小化看板信息 | — | 只读 | 非必要全局读取→拒绝（默认不调用） | 无 | A1 |
| POST /api/v1/tasks/{task_id}/events | 事件推进（唯一状态写入口） | 仅 GIT_VALIDATE/PASS/REWORK，按当前状态出边 | event_id 幂等；重复请求幂等返回 | BLOCKED/CANCEL 等事件值/非法出边/缺 event_id/任务不匹配→拒绝（INVALID_STATE_TRANSITION 等） | 状态推进 | A1/A2/A7 |
| POST /api/v1/artifacts | 登记审查证据 | 限定任务关联+必填字段 | 稳定幂等键；重复键内容不一致→拒绝 | 缺关联/缺字段/覆盖既有证据→拒绝 | 证据登记 | A1/A9 |
| POST /api/v1/messages | 登记审查消息记录 | 限定 message 类型+任务关联+幂等键 | 稳定幂等键 | 任意管理消息/类型不符/关联不符/重复键冲突→拒绝 | 消息登记 | A1/A9 |
| POST /api/v1/reports/review | 登记正式审查结论（**结论权威记录**） | 限定 task_id/execution_id/结果/证据关联 | 幂等键；重复登记冲突→拒绝 | 无对应执行轮/非法结果/不匹配/证据不完整→拒绝 | 结论登记 | A1/A2/A9 |

## 附录 C：A5 恢复账本与断点快照定稿（Gate2 精化）

**账本八字段组**：①任务与审查轮标识（run_id/task_id/review_round/execution_id/idempotency_key）②会话标识（conversation_uuid/创建时间/profile 标识/归属校验结果）③派单账本（dispatch_id/SEND_INTENT_RECORDED/SEND_CONFIRMED/发送时间与结果）④会话快照（发送前后 user unit 计数/采集时计数/快照时间与 SHA）⑤回复证据（reply 路径/字节/SHA-256/采集状态/契约校验结果）⑥M1 推进证据（推进前后 status/event_id/事件名/响应 SHA）⑦登记证据（artifact_id/message_id/review_report_id/请求与响应 SHA）⑧恢复记录（checkpoint_id/前后阶段/恢复决策与依据/时间）。账本**每次阶段变化独立落一条记录**（原子追加，不只在退出时写最终 JSON——防强制终止丢断点）。

**三断点快照与允许动作**：
| 快照 | 时点 | 重启后允许动作 | 禁止 |
|---|---|---|---|
| S1 发送后未采集 | 已确认发送，reply 未落盘 | 回原会话补采 | 重新派单 |
| S2 已采集未登记 | reply 已落盘，M1 登记未完成 | 按原幂等键补登记 | 重新触发 GPT-03 |
| S3 登记或推进结果不确定 | 请求已发出、响应未可靠取得 | 先只读核实 M1；已生效接续，确认未生效才按同一幂等标识重试；无法确认→腿级 BLOCKED | 推测恢复 |

**四条证据规则**：①发送证明=SEND_INTENT_RECORDED/SEND_CONFIRMED/REPLY_CAPTURED 三态区分，以发送前后 unit 计数+原会话标识+账本交叉证明无第二次发送（不能只靠 SEND_STARTED=1）；②账本原子追加防篡改；③恢复决策 fail-closed（UUID 缺失/计数不一致/账本断裂/SHA 不匹配/M1 无法确认→不推测恢复，保持 M1 状态+腿级 BLOCKED）；④登记允许部分成功可核对（逐项记录已成功 ID 与幂等键，重启只补未完成项，不整轮重做）。

## 附录 D：A6 恢复矩阵、回滚与人工接管规则定稿（Gate2 精化）

**恢复矩阵（M1 状态×断点）**：
| M1 状态 | 断点 | 恢复动作 | 禁止 |
|---|---|---|---|
| DEV_REPORTED | 未发 GIT_VALIDATE | 只读核实后继续校验并提交合法事件 | 跳过 Git 校验直进 CODE_REVIEW |
| DEV_REPORTED | GIT_VALIDATE 响应丢失 | 查询 M1 状态与事件；已推进接续，未推进才用原 event_id 重试 | 换 event_id 盲发 |
| GIT_VALIDATING | 校验未完成 | 重新执行只读校验；通过后提交 PASS | 假定已通过；擅自推进任务级 BLOCKED |
| GIT_VALIDATING | PASS 已生效未记录响应 | 只读核实；已 CODE_REVIEW 则继续 | 重复创建审查轮/重新派单 |
| CODE_REVIEW | 尚未派单 | 以本轮唯一审查轮标识派单一次 | 创建第二个审查轮 |
| CODE_REVIEW | 已发送未采集 | 连原 conversation UUID 按 A5 补采 | 新建会话重发 |
| CODE_REVIEW | 已采集未登记 | 校验回复 SHA 按原幂等键补登记 | 再次触发 GPT-03 |
| CODE_REVIEW | 部分登记成功 | 逐项只读核实补缺项 | 覆盖已登记/换幂等键重做 |
| CODE_REVIEW | 结论已登记、推进未确认 | 查询 M1 事件状态；未生效才用原 event_id 重试 | 凭本地日志推断 M1 状态 |
| TEST_ACCEPTANCE | 重启发现已推进 | 标记本轮完成，交后续测试验收流程 | 重新派单/回退 CODE_REVIEW |
| REWORK | 审查结论=返工 | 记录结论停止自动审查 | 自动开启下一轮开发或重审 |
| BLOCKED | M1 任务级阻塞 | 仅人工按 OWNER 权限处理；审查腿停止 | engine 推进或恢复任务级 BLOCKED |

**回滚与人工接管规则（回滚=停止新增副作用、保留事实、从当前 M1 状态交接人工，不回退状态）**：Git 校验阶段→当前 DEV_REPORTED/GIT_VALIDATING；派单前→CODE_REVIEW（不创建会话不发送）；已发送未采集→CODE_REVIEW（人工从原会话补采）；已采集未登记→CODE_REVIEW（人工按同幂等键补登记）；登记部分成功→CODE_REVIEW（保留已登记 ID 仅补缺项）；推进结果不确定→核实后的真实 M1 状态；结论已登记→CODE_REVIEW 或已推进目标状态（不撤销已登记结论）。关键边界：**BLOCKED=M1 任务状态；腿级 BLOCKED=审查腿自身停止状态（run 账本记录，M1 保持原状态）——二者不得混用**。

**A7-A10 新增验收用例**：A7 状态推进成功响应丢失（重启只读核实识别已推进，无第二事件副作用）；A8 发送成功账本后续写入失败（不因账本缺记录而重发；无法证明发送状态→停止人工核查）；A9 部分登记成功（artifact 成功/message 或 report 失败→重启只补失败项，成功项 ID 不变）；A10 任务已进入 REWORK（engine 不自动开启下一轮审查或开发）。

## 附录 E：登记权威关系（Gate2 新增发现落实）

**review report（POST /reports/review）=审查结论的权威记录**；artifacts=证据登记（输入/输出证据指针）；messages=传输与消息记录。三者不一致时以 review report 为结论权威，artifacts/messages 为证据链；任何冲突→腿级 BLOCKED 停等人工，不自动改写。
