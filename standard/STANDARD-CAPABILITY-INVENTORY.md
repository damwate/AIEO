# Standard 版基本能力与工作方式（整理索引）

> **性质：** 对已生效规范的**只读整理与索引**，不是新规范、不构成实施授权、不改动任何已生效条款；逐条给出出处便于 codex / 用户复核。整理日期 2026-11-24。
> **权威源（以文件为准，本索引不替代）：** `standard/WORKFLOW.md`（中级版主规范 v0.1 生效）、`basic/WORKFLOW.md`（六模块流程基座 v0.3）、`standard/PLAYWRIGHT-QUEUE-WORKFLOW.md`（任务池与派单）、`standard/parallel-governance-draft.md`（M2 并行治理 v0.1 生效）、`standard/STANDARD-EXECUTION-AND-CHATGPT-QUEUE.md`（执行机制）、`.github/skills/aieo-standard/SKILL.md`、`.github/skills/aieo-basic/SKILL.md`、`docs/AI-DEV-LESSONS.md`（L-018/L-014/L-019/L-023 等）。

## A. 版本定档与流程基座

- **分级定档**（WORKFLOW §1）：S1→Basic、S2→Basic/Standard 按风险、S3→Standard、S4/S5→Advanced；选型三要素（版本/等级/理由）记任务书，全程不换轨，换轨须用户批准 + decision-log 登记。
- **流程继承**（WORKFLOW 版本头）：Standard 默认流程**继承 Basic v0.3 六模块**（任务管理 / 规划协商 / 开发执行 / 独立验收 / 返工管理 / 交付管理），本文件只承载「中级版差异条款」；冲突时以 Standard 差异条款为准。Basic 独立可用、禁止反向依赖（DEC-045）。

## B. 基本能力清单（10 项）

| # | 能力 | 要点 | 出处 |
|---|---|---|---|
| 1 | 多任务管理与任务池 | 一个主 IDE Agent 维护唯一任务池；大功能经 ChatGPT 讨论、用户批准固定方案后批量登记子任务/依赖/验收条件/基线 | PLAYWRIGHT-QUEUE-WORKFLOW §编辑器任务管理；SKILL「任务池与派单」1 |
| 2 | 优先级与加急 | 普通任务入队尾、加急入队首；加急须向用户显示预计让位任务并随加急指令一次确认；优先级仅高/普通两级，不上复杂算法 | 同上；parallel-governance §3 |
| 3 | 受控并行（M2） | 并行名额以获批阶段为准、**目标上限 3**；一任务四件套＝独立 worktree + task 分支 + 开发会话 + 验收会话，禁止两会话共用工作区/分支 | WORKFLOW §3；parallel-governance §1、§4 |
| 4 | 暂停/切换/恢复 | `pause/resume --task` 只操作本地账本；暂停前停开新步骤、确认子 Agent 停写、保存检查点（分支/worktree/HEAD/未跟踪文件/在途派单）、核清未决轮次；原轮收口后释放名额 | PLAYWRIGHT-QUEUE-WORKFLOW §暂停切换；SKILL「暂停大功能」 |
| 5 | ChatGPT FIFO 派单 | 唯一入口＝服务工作区的 `playwright_queue.py`；`task+lane+round` 唯一键；worker 独占浏览器，按数据库入队顺序串行领取；lane=planning/architecture/code-review/test-acceptance | PLAYWRIGHT-QUEUE-WORKFLOW §ChatGPT 唯一派单入口 |
| 6 | 会话与窗口管理 | 累计 **4 条 user 消息**主动评估迁移（评估非强制，须记录理由，此后每增 2 条重评）；字节预算 24KB WARN / 48KB HARD；简报含自动 marker ≤**1200 UTF-8 字节**；迁移用 `--new-session` 自包含简报 | L-018 第 6/7 条；PLAYWRIGHT-QUEUE-WORKFLOW §唯一派单入口 |
| 7 | 采集故障恢复（fail-closed） | 发送确认≠采集成功；禁重发→三步诊断→静态 DOM 全量物化补采→归属三件套（标记唯一定位/最后 user/前轮 reply SHA 排除）→七查→`reconcile`；`NOT_SENT` 才允许换新轮次 | L-018；WORKFLOW §4 派单工具链；basic/WORKFLOW 派单工具链 ST-08/09 |
| 8 | 独立验收与证据 | 验收六查、ST-01 绑定申报、ST-02 轮次计数、ST-03 BLOCKED 解除、ST-04 混合结论、ST-05 派单前检查器自检、ST-12 证据 MANIFEST(SHA256)；每步六要素记录，不得自我宣布通过 | basic/WORKFLOW 模块三/四；ACCEPTANCE-CHECKLIST |
| 9 | 第三方接口与付费纪律 | 文档先行归档→用文档校准需求→禁止黑盒探测→零费用优先（L0 文档→L1/L2 Mock→L3 只读证据）→付费须授权且失败即停→证据分态 PARAMETER_ACCEPTED/OUTPUT_CONFORMED/BILLING_CONFIRMED | SKILL「第三方接口与付费测试」；L-023 |
| 10 | 平台开发附加纪律 | 契约 C1-C8 冻结不修改；扩展场景逐项独立验收（DEC-017）未解除不扩权；双分支独立验收；治理文档（PHASE-STATUS/FEASIBILITY/decision-log）随任务更新；设计输入不自动实施 | WORKFLOW §2 |

**能力候选（C1-C8，WORKFLOW-DESIGN-INPUT §四）= 待验证设计输入，不是已具备能力、不构成实施授权**：C1 申报绑定自动核验、C2 自检前移检查器矩阵、C3 反例覆盖自动化、C4 证据可访问性/BLOCKED 恢复、C5 派单采集恢复状态机、C6 证据包 MANIFEST 自动生成、C7 验收轮次状态模型、C8 语义一致性示例库。逐项立项须单独小任务书 + 验收（DEC-050、H8）。

## C. 工作方式

1. **M1 / M2 模式**（WORKFLOW §3）：M1 交替推进＝默认；M2 受控并行＝已批准的可选模式，按需启用、**不自动切换**；M3 流水线暂不纳入；M2 未启用期间不得用多会话/多 worktree 绕过 M1；公共资源默认独占单写者。
2. **派单串行 ≠ 开发串行**（parallel-governance §2）：session_lock 全局互斥保留、派单采集人工 FIFO、**禁止并发启动多个派单绕过锁**；派单等待期间各 worktree 可同时开发。3 个并行任务共享的是「同一队列按顺序访问 ChatGPT」，不是各开一个浏览器。
3. **派单流程**（每轮）：开工核对 `--startup` → ST-05 自检 → submit（≤1200B）→ 主会话运行唯一 worker → SEND_CONFIRMED → 采集/补采七查 → reconcile → reply SHA256 归档 → 六查裁定 → PASS 落盘释放名额 / REWORK 回原任务 / BLOCKED 留原因与恢复条件。
4. **验收与返工**（basic/WORKFLOW 模块四/五）：每步独立验收；REJECT 进返工记录；同一问题第 3 次未过＝停止整改循环→三方会商→交用户（L-019 四级止损阶梯，降档不撤验收关口）；挂起与并行作为第四级补充通道。
5. **会话管理执行者自管**（basic/WORKFLOW 模块「会话管理」DEC-048 / L-015）：压缩事件为唯一可靠信号；交接四项＝交接包 + 经验入档 + 提交并成功推送 GitHub + 通知用户附开工指令；双重事实来源以仓库实况为准。
6. **红线**：main 合并、生产发布、数据删除必须用户本人拍板（DEC-010）；秘密不进 Git；禁止自动合并 / 无人确认 push；30 分钟条款与会话级代授权窗口均不覆盖 DEC-010。
7. **汇报**：多任务时主会话只收状态变化、交付结论、待决事项；子 Agent 按任务包存排查细节，结项回报只带任务 ID / 验收结论 / 已验收 commit SHA / 证据入口；疑难升级须带「卡在哪个验收条件 / 已排除什么及证据 / 影响哪些任务 / 下一动作负责人 / 恢复条件」。

## D. 针对四个具体问题的核对（据上述真源）

1. **「10 个任务：工作池按优先级先 3 个、其余 7 个等待」** —— 规范确有此形态：唯一任务池 + 高/普通优先级 + 并行名额上限 3、等待前置任务不占额、下游依赖经已验收提交或产物开工（PLAYWRIGHT-QUEUE-WORKFLOW §编辑器任务管理）。但这是 **M2 受控并行**形态；当前默认仍是 M1 交替推进，且 M2 实战「最多 2 个并行任务」起步、扩大须据复盘证据决定（parallel-governance §4）。本任务为 M1 单任务，未启用。
2. **「并行 3 个任务按队列顺序访问 playwright/chatgpt」** —— 是：唯一 `standard-queue` worker + standard-queue 浏览器实例/profile 独占浏览器，全局互斥、FIFO 串行派单；并行的是各 worktree 的开发，不是浏览器/派单通道。
3. **「是否有任务管理功能」** —— 有会话内任务清单工具（TaskCreate/TaskUpdate/TaskList，用于本回合步骤跟踪），但那**不是** Standard 的任务池；任务池＝主 IDE Agent 会话维护的账本/任务包 + 队列 SQLite 账本。二者不可混用。
4. **「能否再创建单独的子进程管理浏览器」** —— **不能、也不应自行创建**：规范明确「任务进程不得直接开、切换、关闭浏览器或调用派单 CLI」「禁止并发启动多个派单绕过锁」，浏览器生命周期由冻结工具内建流程与唯一 worker 管理，靠 session_lock + 端口注册表 + profile 独占约束。需要并行的是独立会话/worktree/分支的**开发子 Agent**，浏览器/派单仍回主会话的唯一队列串行执行。
5. **「每个窗口最多 4 次对话、完了开新聊天窗口 + 字数限制」** —— L-018 第 6 条是「累计 4 条 user 消息**主动评估**迁移，评估非强制、暂不迁须记录理由、此后每增 2 条重评」；第 7 条字节预算 24/48KB；简报含 marker ≤1200B。用户口径（硬性 4 次即开新窗口）比 L-018 更严，后续派单前若会话已达 4 条，按用户口径先 `--new-session` 迁移，并把「4 次窗口 / 字数限制」写入开工防错动作。

## E. 当前任务适用状态

- `b-20261123-standard-third-trial` 选型＝Standard / S3，但执行形态＝**M1 单任务交替推进**（含 R2/R3 实施子代理），**不启 M2 并行**（task-brief 版本选型原文）。
- 派单全部经唯一 `standard-queue` worker 串行；两轮针对性复核采集 fail-closed 均按 L-018 禁重发→补采→reconcile，零重发。
- 会话 `6b050b37…` 发出 seq11 前已达 4 条 user 消息阈值，已评估并记录「暂不迁移」理由；按用户新口径，后续如需再派单应先迁移。
