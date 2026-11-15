# GPT-02 架构审核真实腿最小版接入——立项任务书（草案 v0.3）

> **文档身份与授权链：** 本文件=Standard 平台路线 GPT-02/04/05 逐角色接入的**首张立项草案**（DEC-063 处置③，2026-11-16；依据=用户开工指令明列"GPT-02/04/05 接入立项"+DEC-026 决议二路线+DEC-062 待办）。生效路径：规划协商复审 → Gate1 草案级验证 → Gate2 会务立项评审 → **用户确认需求原文（§1）** → 用户拍板开工（H7；立项准备≠实施授权）。角色顺序决策点：草案推荐 GPT-02 先于 GPT-04/05（理由见 §1），评审/用户可裁定改序，本任务书按同框架改写对象重报。

## 1. 需求原文（拟定稿，待用户确认——I1）

> "在 GPT-03 审查真实腿最小版（`phase1/tools/review_leg.py`，b-20261115-gpt03-review-leg，DEC-058~062）同框架基础上，接入 **GPT-02 架构审核真实腿最小版**：M1 状态机 ARCH_REVIEW 态任务自动触发**一次**真实 chatgpt.com 架构审核派单（复用 M2 派单链与 fail-closed 门禁），采集审核回复并经冻结契约校验后登记 M1，审核结论（通过/返工/阻塞）落档并按 M1 既有状态机推进（PASS→READY／REWORK→REWORK）；**GPT-04/05、多轮返工重审自动化不在本期**。异常按 §5 分类处置，人工随时可介入。"

- **目标：** 架构审核关口（PLANNING→ARCH_REVIEW→READY）由"OWNER 裸事件"升级为真实 GPT-02 审核收发与结论登记，全程证据可追溯——补齐十步流程第二道真实腿。
- **非目标：** GPT-04 测试验收腿/GPT-05 批次审计腿；多轮返工重审自动化；规划流（PLANNING 之前）改造；多任务/多批次编排；契约修改；M1-M4 代码修改。
- **角色顺序推荐理由（决策点）：** ①DEC-026 清单序 GPT-02 居首；②GPT-02 落点=管线头部（开发派发前），架构审核拦截返工成本最低；③复用 review_leg 全部框架件（附录 B 白名单客户端/附录 C 账本/三断点 resume/attach-reply 人工退路），增量最小。GPT-04 需真实测试证据消费链设计（test_reports 语义+独立验证区分），GPT-05 需批次级聚合输入——两者输入契约更复杂，宜后置单独立项。

## 2. 状态事实基础与缺口分析

**已具备（直接复用，不再立项）：**

| 能力 | 载体 | 证据 |
|---|---|---|
| 审查腿全框架（R0-R6 编排/白名单客户端/账本/resume/人工退路） | `phase1/tools/review_leg.py`（GPT-03 版，29 用例 PASS） | DEC-059/061/062 |
| M2 派单链真实收发+fail-closed+补采 | gpt_dispatch.mjs/inbound 采集/L-018 处置序 | S1-S2 验收链 17 轮零重发 |
| M1 ARCH_REVIEW 状态与合法出边 | `app/platform/state_machine.py:28-30`（ARCH_REVIEW：PASS→READY/REWORK→REWORK/BLOCKED→BLOCKED；REWORK→ARCH_REVIEW 重入边已存在） | 状态机源码+T-P1-908 先例（EVT-908018-ARCH_REVIEW-02） |
| 服务身份与白名单模式 | ENGINE-01 §8.6 独立本机服务身份+端点白名单 | charter GPT-03 §6/附录 B |

**待工程化（本草案立项对象）：** GPT-02 架构审核真实腿——当前 ARCH_REVIEW 关口为 OWNER 裸事件（scheduler 先例 EVT-908018-*），无真实架构审核收发；待建=架构审核简报组装（任务分解/边界/依赖材料）+结论事件映射+GPT-02 agent 身份。

## 3. 架构边界（I2）

- **职责：** 新增 `phase1/tools/arch_review_leg.py`（复用 review_leg.py 框架件，抽公共 runner 或按同构复制——二选一为立项评审决策点，推荐抽公共件防双头维护）；**M1/M2/M3/M4 代码零修改**；scheduler.py 零修改（GPT-02 腿独立于 scheduler 触发，触发方式=M1 轮询 ARCH_REVIEW 态任务，与 GPT-03 腿同模式）。
- **审核输入：** M1 任务字段（title/description/files_scope/acceptance_criteria/task_dependencies）+任务书/方案材料（GitHub 指针模式，L-007；出站 ≤1200B）。
- **接口：** 上行=M1（任务读取/artifacts/messages/状态事件，白名单按附录 B 精化）；下行=M2 工具链零修改复用；**契约 v1.0.0 冻结文本不修改**（H2）。

## 4. 状态与流程（I3）

一期流程（单任务、每进入 ARCH_REVIEW 态一次审核轮，状态路径=M1 既有合法出边）：ARCH_REVIEW 态任务存在 → 腿组装审核简报（任务分解/影响面/依赖/验收标准）→ 真实派单（M2）→ 回复采集与契约校验 → 结论登记 M1（artifacts+messages，幂等键=`<run键>+arch-review-round-1`）→ 结论推进：**PASS→READY／REWORK→REWORK**（ARCH_REVIEW 合法出边）；REWORK 后人工修订方案→经 REWORK→ARCH_REVIEW 重入边重审（重审轮=人工触发，一期不自动循环）。
**BLOCKED 双语义（Gate1-R1 P1-01 澄清，不得混用）：** M1 状态机 ARCH_REVIEW 存在指向 BLOCKED 状态的合法出边（`BLOCKED` 事件：ARCH_REVIEW→BLOCKED，state_machine.py:30；非自循环；CANCEL 出边由通用规则存在但 engine 禁入），但**任务级 BLOCKED=真实任务阻塞状态，仅 OWNER 人工决定提交**——GPT-02 腿收到 BLOCKED 结论时**仅登记（artifacts+messages）+腿级停止，不代为提交 M1 BLOCKED 事件**，M1 任务保持 ARCH_REVIEW 态，是否转 BLOCKED 由 OWNER 会话另行决策；**腿级 BLOCKED**=审核腿内部停止（run 记录），M1 任务状态不动，人工可接管。两种 BLOCKED 全文默认指腿级，与 GPT-03 charter §5 底线条款同构。
**一期边界：** ①自动触发=每任务进入 ARCH_REVIEW 态**一次**；②REWORK 不自动修订重审；③腿任何环节失败→任务保持 ARCH_REVIEW 态停等人工（腿级 BLOCKED，M1 任务状态不动）。

## 5. 异常处理（I4）

沿 GPT-03 charter §5 全表（网页发送失败 1 次换会话重派/采集 fail-closed 禁重发补采/契约校验失败 L-008/平台故障幂等纪律/状态非法停止不绕过/人工介入），差异仅一处：**GPT-02 结论域=PASS/REWORK/BLOCKED**（角色规范 §3 输出 ARCHITECTURE_REVIEW 三态）——BLOCKED 结论登记后腿级停止（M1 任务保持 ARCH_REVIEW），PASS/REWORK 事件推进。BLOCKED 语义区分（腿级 vs M1 任务级）同 GPT-03 §5 底线条款，全文适用。

## 6. 安全与审计（I5）

沿 GPT-03 charter §6 主体—操作—授权边界表全文（凭据三类/OWNER 固定角色/engine §8.6 白名单/审计 C7 §8.7），差异：engine 身份=GPT-02 腿独立服务身份（bootstrap 新建，先例=GPT-03 的 ENGINE-01），事件白名单改为 **PASS/REWORK**（GIT_VALIDATE 不适用——架构审核无 Git 校验步；BLOCKED/CANCEL 禁入同前）。派单出站 ≤1200B；敏感信息不入日志不入 Git。

## 7. 验收与回滚（I6）

沿 GPT-03 charter §7 验收矩阵框架改写：A1 正常审核轮（ARCH_REVIEW→简报→派单→PASS→READY 逐步证据）；A2 返工结论（REWORK→REWORK 态，停等人工不自动重审）；A3 采集 fail-closed 注入（禁重发证明）；A4 幂等重放；A5 两类断点恢复（已发送未采集/已采集未登记）；A6 人工退路（attach-reply 同契约同幂等键）；A7 BLOCKED 结论（仅登记，M1 状态不动）。回滚=附录 D 同构（恢复矩阵按 ARCH_REVIEW 态重排；不退回 M1 状态原则不变）。零 mock 红线（真实 chatgpt.com 收发）沿用 DEC-028 口径。

## 8. 授权与红线（I7）

生效链：本草案 → 规划协商复审 → Gate1 草案级验证 → Gate2 会务立项评审 → 用户确认 §1 → 用户拍板开工；开工后 PASS≠合并授权（DEC-010）。红线沿用：DEC-010/DEC-011/DEC-017/H2。

## 9. 不在范围清单（防膨胀）

GPT-04/GPT-05 真实腿；多轮返工重审自动化；规划流（PLANNING 前）改造与任务分解生成；scheduler.py 修改；多任务/多批次编排；新 commit 重审触发；契约修改；M1-M4 代码修改；管理后台。

## 附录 A：会务立项评审输入→定稿（Gate2-R1 意见落实，v0.3）

### A-1 engine（GPT-02 腿）M1 白名单端点表（定稿粒度，路径以 m1-endpoints.json 机器清单 33 唯一路径为准）

| Method | 路径 | 操作范围 | 拒绝条件 | identity_scope | idempotency_scope |
|---|---|---|---|---|---|
| GET | /api/v1/tasks/{task_id} | 读取任务与简报所需字段 | 任务不存在/非目标任务 | ENGINE-02 | 按任务 |
| GET | /api/v1/tasks/{task_id}/dependencies | 读取依赖与状态 | 任务不匹配 | ENGINE-02 | 按任务 |
| GET | /api/v1/artifacts/{artifact_id} | 读取已登记审核材料 | 非任务关联材料 | ENGINE-02 | 按资源 ID |
| POST | /api/v1/artifacts | 登记审核简报与证据产物 | 登记契约不符/幂等冲突 | ENGINE-02 | 路径+SHA（M1 语义） |
| POST | /api/v1/messages | 审核结果相关消息记录 | 非指定消息类型/身份不匹配 | ENGINE-02 | message_id 确定性键 |
| POST | /api/v1/reports/review | **不使用**（见 A-2 路线 B：该端点 _require_execution 绑定 CODE_REVIEW 执行，不承载 ARCH_REVIEW 登记） | — | — | — |
| POST | /api/v1/tasks/{task_id}/events | 提交白名单状态事件 | 事件不在白名单/状态不允许 | ENGINE-02 | event_id 确定性键 |

- **事件白名单=PASS/REWORK**（GPT-02 engine 运行期）。明确拒绝：BLOCKED/CANCEL（结论 BLOCKED 只登记报告+腿级停止，不提交 M1 BLOCKED 事件——"报告 result=BLOCKED"与"M1 任务态 BLOCKED"两套数据语义不得混用）/ARCH_REVIEW（上游触发事件）/DISPATCH/START/DEVELOPMENT_COMPLETED/GIT_VALIDATE（GPT-03 腿职责）。**状态机接受某事件≠engine 有权提交该事件。**
- **POST /api/v1/agents 不入运行期白名单**：GPT-02/ENGINE-02 身份注册=一次性 OWNER bootstrap（先例=ENGINE-01 setup-agents），与运行期令牌隔离。

### A-2 审核简报组装与结论契约（路线 B 已裁定）

**报告登记路线=路线 B（M1 零修改）**（Gate2-R1 架构阻断裁定；依据：①charter §3/§9 M1-M4 零修改边界自洽②GPT-03 腿先例=artifacts+messages+events 多事务登记+幂等+恢复已实战验证③DEC-011 契约冻结纪律）。代价如实接受：**报告登记与状态推进非原子**——恢复协议见 A-3 路线 B 专属行。路线 A（扩展 M1）被否决：违反零修改边界，须正式修改立项范围（不在本任务授权内）。

**结论契约=新增 arch-review-report 契约（草案文件 `docs/phase1/arch-review-report.schema.draft.json`，Gate3 开工拍板后落位 contracts/v1.0/ 冻结——H2 契约冻结红线；不照搬 review-report.schema.json——其 execution_id/reviewed_commit 语义绑定 CODE_REVIEW）：contract_version/task_id/review_round_id/reviewer_agent_id(GPT-02)/engine_agent_id(ENGINE-02)/input_material_commit(40hex)/input_material_manifest_sha256/brief_sha256/result(PASS/REWORK/BLOCKED)/summary/findings/required_boundaries/unblocked(辅助字段不替代 result)。登记=artifacts（报告证据）+messages（消息记录），**不经 /reports/review**。

**简报输入四组**：任务身份（task_id/title/description，必填绑定本轮）/审核范围（files_scope/acceptance_criteria，原始语义不扩展）/依赖信息（task_dependencies+状态，标明未完成依赖）/审核材料（任务书/方案/ADR GitHub 指针，**固定 commit SHA 禁隐式读最新 main**）。新增绑定字段：review_round_id/input_material_commit/input_material_manifest_sha256/brief_sha256/brief_schema_version。

**1200B 口径冻结**：单次发往 chatgpt.com 的完整用户消息 UTF-8 实际字节数 ≤1200（计入任务标识/指令/指针/结论格式/换行；不计协议头与浏览器封装）；超限拒绝发送不截断不拆分；完整材料走 GitHub 指针模式，完整简报落本地账本。

### A-3 断点恢复与回滚矩阵（定稿）

| M1 状态 | 断点 | 恢复动作 | 重新派单 |
|---|---|---|---|
| ARCH_REVIEW | 简报组装前 | 重读任务与材料，核对输入版本 | 允许首次派单 |
| ARCH_REVIEW | 简报已组装未发送 | 校验 brief SHA，继续发送 | 允许 |
| ARCH_REVIEW | 已发送未采集 | 原会话补采，核验发送证明 | **禁止重发** |
| ARCH_REVIEW | 已采集未登记 | 校验 reply SHA/轮次/契约，按原幂等键登记 | **禁止重发** |
| ARCH_REVIEW | 登记结果不确定 | 只读核实 M1 artifacts/messages；无法确定→腿级 BLOCKED（禁凭超时重提交） | **禁止重发** |
| ARCH_REVIEW | 报告已登记但事件推进失败 | **路线 B 专属**：核实报告在档+状态仍 ARCH_REVIEW 中间态→按原 event_id 幂等键续推 | **禁止重发** |
| READY | PASS 已推进 | 只读核验，认定本轮完成 | 禁止 |
| REWORK | REWORK 已推进 | 停止自动流程，交人工修订 | 禁止 |
| BLOCKED | 人工任务阻塞 | OWNER 决策（engine 不触碰） | 禁止 |

- 腿级 BLOCKED=腿内部停止（记录原因/断点/现场证据），M1 任务状态不动，人工可接管——沿 GPT-03 §5 底线语义。
- 回滚=停止新增副作用、保留已发生事实、从当前 M1 状态交接人工，不退回前一状态。
- 登记权威关系：M1 状态唯一权威/腿只发起白名单内合法事件/报告证据 artifacts 为准。
## 版本记录

| 版本 | 日期 | 状态 | 变更 | 依据 |
|---|---|---|---|---|
| v0.1 | 2026-11-16 | 草案 | 初稿成文（GPT-03 charter v1.0 同构框架，落点 ARCH_REVIEW 关口） | DEC-063 处置③；DEC-026 路线；角色规范 docs/立项/02 §3；state_machine.py:28-30 实读 |
| v0.2 | 2026-11-16 | 草案 | Gate1 闭环：§4 BLOCKED 双语义段（Gate1-R1 P1-01）+附录 A 评审输入初稿（Gate2 深度项三项） | Gate1-R1 REWORK（697a5e54…）→Gate1-R2 PASS（a7aeed29…）；附录 A 按 GPT-03 Gate2 先例成文 |
| v0.3 | 2026-11-16 | 草案 | Gate2-R1 落实：状态机记法校正（ARCH_REVIEW→BLOCKED 出边/CANCEL 禁入）+A-1 端点表定稿粒度（7 行+identity/idempotency scope+/agents 出运行期白名单）+A-2 路线 B 裁定（/reports/review 不承载 ARCH_REVIEW→artifacts+events 多事务，新增 arch-review-report.schema.json）+1200B 口径冻结+简报四组输入+A-3 九行恢复矩阵（路线 B 专属行） | Gate2-R1 REWORK（reply 归档 dispatch-2026-11-15T22-34-25）；路线裁定依据=charter 零修改边界自洽+GPT-03 腿多事务先例+DEC-011 |
