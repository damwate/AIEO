# Instance/Conversation Queue Service 设计八件 R3（R2 整改版，定点复审对象）

- **依据：** DEC-137（R1 BLOCKED）+ DEC-138（R2 复审 BLOCKED，收敛中；六组细化要求：Q-02 时序歧义/Q-03 崩溃窗口/Q-04 令牌生命周期/Q-05 字段规格/Q-06 六类完整语义/Q-07 枚举统一/Q-08 机器可核验/§⑥ 全文恢复——本稿逐项落实）。
- **R3 变更声明：** 仅修改本文档（设计），**零代码变更、零运行态变更**；R1→R2 对照见附表一，R2→R3 对照见附表二。
- **辅助文件处理（R3 P1-6）：** 过程性中间文件（如 _ops_section1_extract.txt 提取草稿）不入库——已从本次提交移除并登记；入库文件白名单=设计文档/任务包/测试证据/归档目录，临时提取件一律走系统临时目录。
- **明确不修改的既有约束（照 DEC-137）：** C9 已验收门禁实现 / C6 已验收采集语义 / C1-R2 实例互斥语义 / DEC-130 黄金源克隆 / DEC-010 profile 删除审批 / L-018 补采禁重发 / L-022 非阻塞 / L-023 三层决策。

## ① 架构四域与三阶段（R1 PASS_WITH_CONSTRAINTS，补两点后定稿）

- 四域最终原则不变：实例池管窗口、队列管任务、C9 管门禁、C6 管证据；Worker 桥为编排执行层，不侵入四域内部职责。
- **补 1（R1 ①约束）：** TaskQueue 是任务生命周期的**权威账本**；中控（会话）是方案审查、任务验收和调度决策者——Queue 不替代 ChatGPT 验收。
- **补 2（R1 ①约束）：** Phase B 双轨的互斥不由"双方约定"实现，由 §⑦ 的**单一任务账本+原子认领接口**机制保证（Q-04）。
- A→B→C 渐进迁移不变，不直接替换现役 Bash。

## ② 三类数据契约（Q-01/Q-05 整改：状态归属分离+字段补齐）

**状态归属原则（Q-01）：Task 只记任务生命周期；Execution 只记单次执行过程（发送/采集/恢复）；Instance 只记实例健康与占用；账号级暂停是池级状态（独立字段），绝不混入实例枚举。**

```jsonc
// Task —— 任务生命周期状态（权威账本条目）
{
  "task_id": "T-<seq>", "title": "", "kind": "code|review|doc",
  "payload_ref": "", "branch": "task/<id>", "priority": 0, "deps": [],
  "status": "READY | CLAIMED | C9_CHECKING | EXECUTING | REPORTED | VERIFIED | VERIFIED_FAIL | BLOCKED | DEFERRED",
  // VERIFIED_FAIL（验收失败）：原任务记录保留不改写；整改=独立新 task_id 入队（问题B 语义）
  "claimed_by": null,            // 当前持有人（worker/实例标识）
  "claim_token": null,           // 原子认领令牌（§⑦ 唯一执行权凭据）
  "attempts": 0,                 // 派单尝试计数
  "rework_of": null,             // 整改任务指向原任务 id（验收失败谱系）
  "created_at": "", "updated_at": ""
}

// Execution —— 单次执行过程记录（一次派单=一条；attempt 可多条）
{
  "execution_id": "<uuid>",      // Q-05
  "attempt_id": 0,               // Q-05：同任务第几次尝试
  "dispatch_id": "",             // dispatch 归档目录名
  "task_id": "", "instance_id": "",
  "idempotency_key": "<task_id+attempt+instance 哈希>",   // Q-05：防重复派发
  "send_state": "NOT_SENT | SEND_ATTEMPTED | SEND_CONFIRMED",  // Q-03：三态与 send-state.json 同源
  "recovery_state": "NONE | PENDING_VERIFY | RECOVERED | MANUAL_REQUIRED",  // Q-03
  "last_checkpoint": "CLAIMED | C9_PASS | SENT | GENERATING | COLLECTING",  // Q-05：崩溃恢复锚点
  "failure_code": null,
  "reply_sha256": null, "verdict": "PASS|FAIL|BLOCKED|NOT_OBSERVED",
  "started_at": "", "finished_at": "",
  "c6": { /* ④ 的六类结构化指标 */ }
}

// Instance —— 实例健康与占用（Q-01：PAUSED 在此，非任务枚举）
{
  "instance_id": "agent-a", "profile_dir": "", "debug_port": 0, "lock_path": "",
  "status": "IDLE | BUSY | ERROR | OFFLINE | PAUSED",   // P1-3：实例级暂停独立表达
  "pause_reason": null,
  "login_validated": true, "last_health_check": "", "consecutive_fail": 0
}

// Pool —— 池级状态（账号级约束独立于任何实例，P1-3）
{
  "account_gate": "ALLOWED | BACKOFF | VERIFICATION_HOLD",   // C9/人机验证的池级暂停
  "backoff_until": null, "gate_reason": null
}
```

**字段规格表（Q-05/R3 P1-1 整改：共 14 行=Task 4+Execution 8+Instance 1+Pool 1；每字段含类型/必填条件/枚举/状态转换/主外键/权威源/镜像规则/崩溃恢复规则；核心字段逐行列出，其余实体字段见 §② JSON 契约全文）：**

| # | 实体.字段 | 类型 | 必填条件 | 枚举/约束 | 状态转换 | 主/外键 | 权威源与镜像 | 崩溃恢复 |
|---|---|---|---|---|---|---|---|---|
| 1 | Task.task_id | string | ✓ | `T-<seq>` 全局唯一主键 | 不变 | 主键 | 账本=权威源 | 不变 |
| 2 | Task.status | enum | ✓ | 九态见 §③，转换仅限 §③ 表 | 按 §③ | — | 账本=权威源 | 按 §③ W0-A/W0-B/W1/W2 |
| 3 | Task.claim_token | uuid\|null | CLAIMED 起 ✓ | 唯一执行权；核销规则见 §⑦ fencing | 生成→持有→核销 | 外键→Execution | 账本=权威源 | 悬空检测→恢复序 |
| 4 | Task.rework_of | task_id\|null | 整改任务 ✓ | 指向 VERIFIED_FAIL 原任务 | 不变 | 外键→Task | 账本=权威源 | 不变 |
| 5 | Execution.execution_id | uuid | ✓ | 每次执行唯一 | 不变 | 主键 | 账本=权威源 | — |
| 6 | Execution.attempt_id | int ≥1 | ✓ | 同 task 递增 | 递增 | 与 task_id 组成复合键 | 账本=权威源 | — |
| 7 | Execution.dispatch_id | string | ✓ | `dispatch-<ts>[-uuid]` | 不变 | 外键→归档目录 | 归档目录=权威源 | — |
| 8 | Execution.idempotency_key | string | ✓ | task+attempt+instance 哈希，全局唯一 | 不变 | 防重复派发断言键 | 账本=权威源 | — |
| 9 | Execution.send_state | enum | ✓ | NOT_SENT/SEND_ATTEMPTED/SEND_CONFIRMED | 按 §③ 窗口表 | — | **镜像 send-state.json（权威源）**；不一致以归档为准并登记差异 | W1/W2 恢复 |
| 10 | Execution.recovery_state | enum | ✓ | NONE/PENDING_VERIFY/RECOVERED/MANUAL_REQUIRED | 按 §③ 恢复序 | — | 账本=权威源 | W1 核实流程 |
| 11 | Execution.last_checkpoint | enum | ✓ | CLAIMED/C9_PASS/SENT/**GENERATING**/COLLECTING（R3 P1-1：补齐 GENERATING，与 §② JSON 契约一致） | 按 §③ 窗口表前进 | — | 账本=权威源 | checkpoint 决定恢复窗口 |
| 12 | Execution.failure_code | enum\|null | 失败时 ✓ | LOCK_CONFLICT/C9_BLOCKED/VERIFICATION_REQUIRED/COLLECT_FAIL/... | — | — | 账本=权威源 | — |
| 13 | Instance.status | enum | ✓ | IDLE/BUSY/ERROR/OFFLINE/PAUSED | 按 §⑦ | — | 实例账本=权威源 | PAUSED 恢复=人工/门禁 |
| 14 | Pool.account_gate | enum | ✓ | ALLOWED/BACKOFF/VERIFICATION_HOLD（R3 P1-3：与 VerificationState 映射见表 §⑤） | 按 §⑤ 映射表 | — | 池账本=权威源 | BACKOFF 归一化/C9 语义 |

**幂等与恢复（Q-03/Q-05）：**
- 派发前以 `idempotency_key` 查账本：存在有效 EXECUTING 记录→禁派发（任务唯一性）。
- `send_state` 三态与 send-state.json 同源逐字（NOT_SENT/SEND_ATTEMPTED/SEND_CONFIRMED）：**SEND_ATTEMPTED 后进程崩溃→recovery_state=PENDING_VERIFY，保留现场先核实发送结果，不得视为未发送，禁自动重发**（L-018 纪律的机制化）。
- 崩溃恢复序：读 last_checkpoint → 核对 ChatGPT 侧实际状态（结构化证据）→ RECOVERED（补记归档）或 MANUAL_REQUIRED（人工核对，禁自动判定）。

**发送前持久化顺序与崩溃窗口映射（Q-03：与已验收 gpt_dispatch 实现逐字对齐——send-state.json 是唯一权威源，Execution.send_state 为镜像，不一致以 send-state.json 为准并登记）：**

| # | 动作 | 持久化动作 | last_checkpoint | 崩溃窗口 | 恢复语义 |
|---|---|---|---|---|---|
| 1a | 原子认领 | 账本写 CLAIMED+claim_token | CLAIMED | **W0-A** | 已认领、尚未启动浏览器→可安全释放认领，任务回 READY |
| 2 | C9_CHECKING ALLOWED | （无独立落盘，状态在账本） | C9_PASS | — | — |
| 3 | 浏览器操作（spawn/goto/composer/附件上传/文本填充） | — | C9_PASS | **W0-B** | **浏览器已启动或已操作但尚未 SEND_ATTEMPTED→保留现场，核实浏览器及 composer 状态，禁按零操作处理**（R3 P0-1：SEND_ATTEMPTED 前已有真实浏览器操作，笼统"零操作"与实际执行序矛盾） |
| 4 | recordSend("SEND_ATTEMPTED") 原子落盘（tmp+rename+flush，Enter 之前） | send-state.json=SEND_ATTEMPTED | SENT | **W1** | **recovery=PENDING_VERIFY：保留现场→核实 ChatGPT 侧实际状态→RECOVERED 或 MANUAL_REQUIRED；禁视为未发送、禁自动重发** |
| 5 | Enter→发送双验 | — | SENT | W1 | 同上 |
| 6 | recordSend("SEND_CONFIRMED") 原子落盘 | send-state.json=SEND_CONFIRMED（含 session_id） | COLLECTING | **W2** | 现场保留→L-018 补采（禁重发）→补采成功=REPORTED |
| 7 | 生成等待+采集 | 归档产物逐字节落盘 | COLLECTING | W2 | 同上 |
| 8 | REPORTED（归档完成+result.json） | result.json | REPORTED | — | — |

W1/W2 的恢复动作均已实装验证（T2甲=T2 现场=W1 实证；C4 双实例=W1 复现+补采闭环）。

**recordSend 双写权威规则（R3 P0-1 附带要求）：** callerReceipt（AIEO_DISPATCH_SEND_RECEIPT 外置）与归档 send-state.json 双写——**权威源=归档 send-state.json**（审计依据），callerReceipt=调用方便利镜像；双写间崩溃的对账=以归档文件为准核对 callerReceipt，不一致以归档登记差异（两者写入均为 tmp+rename 原子，中断仅产生缺一侧，不产生半写）。

## ③ 状态机与异常转换（Q-02 整改：时序统一+验收失败两分+异常四分）

**主转换（Q-02 统一时序——C9 在 CLAIM 之后、任何浏览器操作之前，单一时序无矛盾）：**
```
READY → CLAIMED（原子认领：任务+实例绑定写账本，§⑦）
      → C9_CHECKING（accountGateCheck；此阶段零浏览器操作）
        → ALLOWED → EXECUTING（浏览器操作自此才允许）
        → BLOCKED → 任务回 READY（实例转 IDLE），全池 BACKOFF 时转池级 PAUSED
      → EXECUTING → SENT_CONFIRMED → COLLECTING → REPORTED
      → [ChatGPT 验收] → VERIFIED ｜ VERIFIED_FAIL
```
- **两段式门禁关系（Q-02 澄清，消除歧义）：**
  - **初始调用（状态级）**：C9_CHECKING 状态内执行一次 `accountGateCheck`——它是状态机中唯一的门禁状态，决定"能否进入浏览器操作阶段"；BLOCKED→任务回 READY（零浏览器操作已发生）。
  - **执行期复查（实现级）**：pre-spawn/pre-reuse/429 观察点是**已验收 gpt_dispatch 实现的内置组成部分**（R1② 整改后语义），不是独立状态机状态——它们决定"是否继续"，命中即走异常转换（§③ 异常表）。
  - **关系**：初始门放行≠执行期豁免；执行期复查命中→按异常表处理（含写回账号级退避）。二者复用同一 `accountGateCheck` 已验收实现，Queue 不重写门禁。
  - **ALLOWED 语义**：初始 ALLOWED 仅授权进入浏览器操作阶段，不构成整个执行周期的永久授权（复查点独立生效）。

**异常转换四分（问题 C：不再笼统 PAUSED，按类型走不同路径）：**
| 异常 | 转换 | 恢复 |
|---|---|---|
| 单实例锁冲突 | 有界重试(60s)→仍冲突：任务复位 READY（可换实例）或 BLOCKED | 实例释放即自动 |
| 账号级退避（C9 BACKOFF） | 池级 account_gate=BACKOFF→全池 PAUSED，任务保持 READY | 归一化到期→自动重新过门（既有 C9 语义） |
| 人机验证 | 池级 VERIFICATION_HOLD→全池 PAUSED-HUMAN | **人工恢复前禁自动恢复派发**（DEC-134 红线） |
| 普通采集失败 | 现场保留→L-018 补采（禁重发）→补采成功=REPORTED | 补采失败=BLOCKED 人工 |

**验收失败语义（问题 B，与 ops §五 对齐）：**
- 验收 FAIL：原任务 status=VERIFIED_FAIL，**记录保留不改写**；产生独立整改任务（新 task_id，rework_of 指向原任务）；原 worker 可被安排整改，但不阻塞其他无依赖任务（L-022）；重验=单独授权+独立 Execution 记录。
- **执行失败 vs 验收失败两分**：执行失败=过程性（锁/退避/采集，走异常转换）；验收失败=结论性（ChatGPT 判定，走整改谱系）。字段分离（failure_code vs verdict），不得合并。

## ④ C9 / C6 接口（Q-02 时序+Q-06 指标结构化）

**C9（Queue 只调用 accountGateCheck，不重写门禁——既有验收实现零修改）：**
- 调用时机：CLAIMED → C9_CHECKING（唯一调用点）；执行期内复查沿用既有观察点/前置复查（pre-spawn/pre-reuse），语义不变。
- 检查 BLOCKED 的任务处理：任务保持 READY（实例转 IDLE），不消耗执行。
- 账号级退避期间其他实例领取：禁止（池级 gate 对全池生效——DEC-128"不允许一个实例退避另一个继续派单"）。
- 人工恢复后：重新过 C9 门（不继承旧 ALLOWED）。

**C6（Q-06：恢复六类完整语义——逐类明确观测状态/来源/单位/时间戳；结构化独立可扩展）：**

每类均含 `observed`（OBSERVED/NOT_OBSERVED）+`source`（dispatch 归档/账本/资源采样器）+逐条 `timestamp`。**NOT_OBSERVED ≠ PASS**（无真实数据不得记成功，缺采集显式登记禁默认零值冒充）。

| 类 | 字段与单位 | 来源 | 时间戳 |
|---|---|---|---|
| 吞吐与任务效率 | 总派单量（日/每实例）、成功数、FAIL/BLOCKED 分列、每小时成功任务数（个/h）、响应时间 P50/P95（ms）、排队时间（ms）、**并发利用率 U=实例 BUSY 时间÷统计周期总时间（R3 P1-2：数量与时间之比不成立，改时间占比；分实例级与整机级两组）** | Execution 账本聚合 | 每条 execution started/finished_at |
| 账号配额 | 观察期初始额度（可读时记录）、每日消耗（**可观测单位：限流横幅出现次数/受限会话数**）、每任务平均消耗（同口径）、额度恢复时间/恢复形态、消耗速度（受限信号频次）、剩余余量——**官方无精确余量数字的指标一律 NOT_OBSERVED，禁估算值冒充真实额度（R3 P1-2：补单位口径）** | 可观测页面信号+人工登记 | 每次观测时间戳 |
| 429 与账号风控 | 429 真实出现次数、发生时实例数/并发量、发生时间、页面原始错误形态（截图+文本）、C9 是否成功写入退避、其他实例是否停止派单、退避期限是否被缩短、安全提醒/异常登录/会话失效 | observeAccountRisk+账本事件 | 事件时间戳 |
| 实例稳定性与隔离 | Chrome 异常退出次数、CDP 断连次数、profile 登录态失效次数、端口冲突次数、实例锁冲突次数、清理 A 时 B 是否正常、补采是否回原会话、跨实例串档、不明副作用 | Instance 账本+dispatch run.log | 事件时间戳 |
| 机器资源 | 每实例与整机 CPU 平均/P95（%）、内存平均/峰值（MB）、Chrome 进程数、异常进程残留、磁盘及日志增长（MB） | 资源采样器（另行接入，字段先行） | 采样时间戳 |
| 扩容判断 | 串档/误杀/未知副作用→停止扩容；账号级风控异常→停止并复核 C9；配额余量不足→不增实例；N=3 吞吐明显提升且稳定→可考虑 N=3 生产；N=3 仍积压且 N=4 有实际收益→申请 N=4 验证；N=4 只增消耗无收益→保持 N=3。**经济性指标（R3 P1-2 补齐四项）：①单位成功任务的资源消耗（资源÷成功数）②单位成功任务的实际配额消耗（受限信号频次÷成功数）③增加实例带来的成功吞吐增量 ④增加实例的边际资源成本——增实例只看总请求数不算数，须同时看收益与成本** | 聚合判定 | 评估时点 |

C6 结构化载体（Execution.c6 字段，独立可扩展）：`rate_limit`/`verification`/`isolation` 三类逐执行记录；`throughput`/`quota`/`resource`/`扩容判断` 为聚合类（观察期聚合器按日汇总，非单 Execution 字段）。

## ⑤ 人机验证四态及人工处置（R1 PASS_WITH_CONSTRAINTS，补 Q-07）

- 四态与红线不变（禁自动点击/破解/绕过/刷新/重克隆；人工恢复后才复派；全池 PAUSED-HUMAN）。
- **Q-07 落实（R3 P1-3 整改：两枚举+显式映射，非单一枚举混用）：**
  - `VerificationState`（人机验证识别状态，判定器/c6.verification.state 使用）= `VERIFICATION_NORMAL | VERIFICATION_SUSPECTED | VERIFICATION_REQUIRED | VERIFICATION_UNKNOWN_BLOCK`
  - `AccountGateState`（账号级派单门禁状态，Pool.account_gate 使用）= `ALLOWED | BACKOFF | VERIFICATION_HOLD`
  - **映射表：** VERIFICATION_NORMAL→ALLOWED（还须满足其他门禁条件如 BACKOFF）；VERIFICATION_SUSPECTED→VERIFICATION_HOLD；VERIFICATION_REQUIRED→VERIFICATION_HOLD；VERIFICATION_UNKNOWN_BLOCK→VERIFICATION_HOLD。
  - 红线保留：SUSPECTED 不得因超时/页面重新加载自动降级；恢复仅人工确认或授权复检；判定器输出与恢复动作入 c6.verification.events。

## ⑥ 实例池容量、并发与克隆约束（R1 PASS；R3 恢复完整操作规范原文，不以摘要替代）

**黄金源克隆规程（DEC-130 原文恢复）：**
1. **建立黄金源 profile：** 使用现有已登录的 default profile 作为模板。确认账号身份、登录有效、没有安全验证页面。
2. **彻底关闭 Chrome：** 关闭所有使用该 user-data-dir 的 Chrome 进程。不能只关闭窗口而让后台进程继续运行。
3. **完整复制：** 将完整 user-data-dir 复制到独立目录（如 profiles/gpt-poc-agent-a），而不是只复制 Default 子目录；必须包含正确的 Local State 和 Profile 数据。已有残留目录先删除再镜像（C1 首跑实证：extras 带入脏状态）。
4. **实例隔离：** 每个实例使用自己的 user-data-dir、DEBUG_PORT、INSTANCE_ID 和锁。禁止两个 Chrome 进程同时使用同一份 profile。
5. **逐实例登录态验收：** 先逐个启动实例，检查 ChatGPT 页面是否已登录、账号身份是否正确、是否出现安全验证或限流页面。不读取或导出 Cookie，不将凭据写入日志。
6. **验证通过才开放派单：** 每个实例必须有独立的登录状态检查结果。全部完成后才允许进入并发试跑。

**失败处置表（DEC-130 原文恢复）：**
| 情况 | 处理 |
|---|---|
| 克隆后未登录 | 停止该实例，检查源 profile |
| 登录态失效 | 暂停该实例，人工恢复或重新克隆 |
| 安全验证 | 停止自动化，人工处理 |
| 账号安全提醒 | 全实例暂停，按账号级安全问题处理 |
| Chrome 残留进程 | 不覆盖、不重新复制，先确认进程归属 |
| 429 | 进入 C9 账号级统一退避 |

**两条硬约束（DEC-130 原文恢复）：** 黄金源 profile 只在全部 Chrome 关闭时更新，更新后再生成实例副本；不允许运行中热复制、多个实例共享目录或自动循环重新登录。**甲方案批准的是受控克隆机制，不是把一份活动中的 profile 当作共享文件使用。**

**Profile 生命周期不变量（DEC-135 补记，用户追问查证固化）+ 边界冲突澄清（R3 P1-5）：**
- 自清理=仅终止 Chrome 进程（Stop-Process），永不删除/修改 profile 目录；浏览器关闭顺序=browser.close()（优雅，cookie 落盘）→killProfileChrome（兜底孤儿进程）；**含登录态的 profile 目录只增不删（删除=DEC-010 另批）**。实证=default 历经数十次清理循环数日保持登录；agent-a/b 克隆后经多轮清理用户确认仍登录。
- **与 DEC-130"已有残留目录先删除再镜像"的边界澄清：** "先删除再镜像"仅适用于**克隆初始化期对未含登录态的失败克隆残留**（C1 首跑实证：从未登录的半初始化目录带入脏缓存）——此类目录不含登录凭据，删除重建不违反不变量；**不变量保护的对象=含登录态或已通过登录态验收的 profile**（default/agent-a/agent-b）。判定标准=该目录是否曾通过登录态验收。

**容量与并发（保留）：** 容量=登录态已验收实例数（非配置声明数）；每实例互斥串行、跨实例并行=N；N=2 现行、N=3 为阶段3 目标不随 Queue 编码自动扩容；侧栏账号级共享→CONV_UUID 精确导航禁最新启发式（C4 实测）。

## ⑦ Bash 三阶段迁移与回滚（Q-04 整改：原子认领+崩溃回滚流程）

**Phase B 重新定义（消除"影子观察 vs 真实派发"的概念冲突）：**
- **单一任务账本 + 双调度入口 + 原子唯一认领**：人工中控与 Queue 都只能通过同一认领接口 `claimTask(task_id, instance_id)` 获取任务（账本文件+lockfile 临界区，M1/端口注册表同模式）；认领操作原子（CLAIM 写账本成功=唯一执行权；**账本写失败禁派发**）；同 task_id 同时只允许一个有效执行权。
- **claim_token 生命周期（Q-04）**：认领成功时生成 uuid 写入 task.claim_token → EXECUTING 全程持有 → REPORTED/VERIFIED 后核销（置 null）→ **崩溃/死亡后 token 悬空**：账本扫描发现 EXECUTING 且 worker 注册表无该 token → 走 §② 崩溃恢复序（checkpoint 映射）→ 重派=作废旧 token+生成新 token（新 Execution attempt）。
- **防双执行（Q-04）**：①同 task_id 唯一有效 claim_token；②双入口（人工中控/Queue）都必须经 `claimTask` 接口（禁绕过账本直接派发）；③派发前 idempotency_key 查账本（有效 EXECUTING 存在→禁派发）；④归属不能确认时→人工核对，禁自动重发。
- 归属不能确认时→人工核对，禁自动重发。

**防旧执行者复活机制（R3 P0-2 整改：worker 判死≠失去执行能力——浏览器可能仍在产生副作用）：**
1. **token 持有者身份绑定：** claim_token 与 worker 进程标识（pid+启动时间戳）双写账本；账本写操作必须携带当前 token，**旧 token 不得继续提交结果**（关键账本写入逐条核对 token，不匹配拒绝写入并登记）。
2. **token 失效条件（明确枚举）：** ①worker 进程死亡（心跳/注册表消失）；②任务终态到达（REPORTED/VERIFIED/VERIFIED_FAIL/BLOCKED/DEFERRED——各路径 token 释放规则：REPORTED/VERIFIED→核销；VERIFIED_FAIL→核销（整改走新 task）；BLOCKED/DEFERRED→token 挂起保留（恢复时续用或重领时作废重发）；③人工判定失效。
3. **旧 worker 终止确认：** 重派前必须确认旧 worker 进程已不存在（进程枚举）且其浏览器副作用已处置（§⑥ 隔离检查）——**无法证明旧执行者已失效→保持人工接管，禁自动重派**。
4. **Fencing：** 新 token 生效前，旧 token 写入全部拒绝（账本逐条核对）；新 worker 启动前确认旧实例浏览器已处置（存活则先隔离）。
5. **释放规则汇总：** REPORTED/VERIFIED→核销；VERIFIED_FAIL→核销（rework 新任务新 token）；BLOCKED/DEFERRED→挂起保留；进程死亡→悬空检测触发恢复序。

**回滚流程（R1 缺口补齐，不再"停进程即接管"）：**
```
停新认领（账本封账）→ 等待/隔离在途任务（BUSY 实例列表明细）→ 持久化 Task/Instance/Execution
→ 核对 SEND_ATTEMPTED 现场（逐条 recovery_state 核实）→ 确认无悬空执行权（claim_token 全部核销）
→ 恢复人工中控（按账本续跑）
禁：简单停 Queue 进程后立即人工派发（Queue 已死但浏览器在途+人工重派同任务的风险）。
```

## ⑧ 分阶段验收标准（Q-08 整改：机器化、可核验）

**Phase A（观测）：** 采集器零侵入（现役行为零变化）；C6 字段有明确来源/单位/时间戳；采集缺失显式 observed:false 禁默认零值冒充；采集失败不得改变现役 Bash 行为。

**Phase B（骨架）五项测试（Q-08/R3 P1-4 整改：统一格式=测试输入→预期状态→证据文件→核验脚本→断言→exit code；W0-A/W0-B/W2 纳入崩溃恢复；全 PASS 才进 C）：**
1. 双入口并发认领——输入=W 并发×M 任务经同一 claimTask 接口；预期=每 task_id 恰 1 执行权；证据=认领压测审计日志；核验=账本扫描脚本；断言=每 task_id 恰 1 条 CLAIM 记录+claim_token 全局唯一；exit 0。
2. 进程崩溃恢复**五点**（R3 P1-4：W0 拆分后扩为 W0-A/W0-B/W1/W2+认领前共五点）——输入=各窗口时点 kill -9；预期=按 §③ 窗口表逐窗口恢复语义；证据=五个现场 dispatch 目录+recovery_state；核验=恢复序脚本；断言=W0-A 回 READY/W0-B 保留现场核实/W1=PENDING_VERIFY 禁自动重发（派单计数=1）/W2=L-018 补采/认领前=账本无痕；exit 0。
3. C9 BLOCKED 零浏览器操作——输入=BACKOFF 态下派发；预期=零浏览器操作；证据=门禁拒绝日志（ACCOUNT_BACKOFF_ACTIVE 时间戳）+CDP 目标清单+进程枚举；核验=时间戳比对脚本；断言=拒绝时间戳早于任何 CDP 连接时间，且**新建浏览器进程=0（R3 P1-4：已有实例的存活进程不算"发生了浏览器操作"，区分新建与复用）**；exit 0。
4. C6 证据完整性——输入=若干完成 Execution；预期=四方可追溯；证据=关联表脚本输出；核验=关联脚本；断言=execution.dispatch_id→目录存在→send-state.json 可读→result.json session_id 匹配（成功时），逐条 exit 0。
5. 回滚演练——输入=执行中触发回滚流程（§⑦ 五步）；预期=无重复派发/无孤儿进程/无任务丢失；证据=演练前后账本 diff+进程枚举；核验=断言脚本；断言=idempotency_key 无重复+孤儿 chrome（profile 匹配）=0+**任务终态差集为空（终态集合=VERIFIED/VERIFIED_FAIL/BLOCKED/DEFERRED；排除项=DEFERRED 逐条附原因，R3 P1-4 定义）**；exit 0。

**Phase C（接管）七附加条件（Q-08/R3 P1-4 整改：逐条绑定核验方式+日志/差集/审计格式定义）：**
1. 连续 ≥20 任务队列自主运行零人工派发干预——**中控操作日志事件格式定义：`{ts, actor, event: CLAIM|DISPATCH|VERIFY|OTHER, task_id}`（JSONL）**；派发事件识别=event∈{CLAIM,DISPATCH}；核验=扫描脚本统计人工 actor 的派发事件数=0。
2. 无重复派发——核验=idempotency_key 全局唯一扫描脚本，exit 0。
3. 无任务丢失——**终态集合定义={VERIFIED, VERIFIED_FAIL, BLOCKED, DEFERRED}；排除项=DEFERRED/BLOCKED 逐条附原因登记**；核验=入队清单 vs 终态清单差集脚本，差集=空 exit 0。
4. 无未经门禁的浏览器操作——核验=每条 Execution 的 C9_PASS 时间戳早于其 CDP 连接时间戳脚本，逐条 exit 0。
5. 人机验证暂停与恢复正确——证据=VERIFICATION_HOLD 事件+人工恢复记录+恢复后重新过门日志，逐条时间戳有序。
6. 中控验收失败不阻塞无依赖任务——证据=VERIFIED_FAIL 任务存在期间其他任务 REPORTED 记录。
7. 失败现场可恢复可审计——**必备文件=request.txt/run.log/send-state.json（三缺一=FAIL）；允许缺失=result.json/reply.txt/截图（kill 类现场，缺失逐条登记即 PASS）**；核验=文件清单脚本逐 FAIL 检查，exit 0。
**N=3 扩容独立审批，不属于 Phase C 自动验收结果。**

## 附：R1→R2 修改对照（P0/P1 逐项关闭声明）

| 项 | R1 问题 | R2 关闭位置 |
|---|---|---|
| P0 Q-01 | 状态枚举混用 | §② 状态归属原则+四实体分离枚举；③ 按新枚举重写 |
| P0 Q-02 | CLAIM 与 C9 时序矛盾 | §③ 主转换单时序（C9_CHECKING 独立态）；§④ 调用时机唯一化 |
| P0 Q-03 | SEND_ATTEMPTED 崩溃恢复缺失 | §② send_state 三态+recovery_state+恢复序；③ 异常表 |
| P0 Q-04 | Phase B 无跨进程原子认领 | §⑦ 单一账本+原子认领接口+回滚五步 |
| P1 Q-05 | 契约字段不足 | §② 全字段补齐；Instance.PAUSED；Pool.account_gate |
| P1 Q-06 | C6 两时间字段不足 | §④ c6 六类结构化证据；NOT_OBSERVED≠PASS 保留 |
| P1 Q-07 | SUSPECTED 自动降级风险 | §⑤ 恢复两路径条款 |
| P1 Q-08 | 验收不可核验 | §⑧ 三阶段机器化标准 |
| ①补 | 双轨互斥机制缺失 | §① 补 2 引 §⑦ |
| ③补B | 验收失败语义 | §③ 验收失败两分+rework_of 谱系 |
| ⑤补 | SUSPECTED 降级 | §⑤ Q-07 条款 |
| ⑦补 | 回滚流程 | §⑦ 回滚五步 |
| ⑧补 | Phase B/C 标准不足 | §⑧ 五测试+七附加 |

## 附表三：R3→R4 修改对照（DEC-139 P0×2/P1×6 逐项关闭）

| 项 | R3 缺口 | R4 落实位置 |
|---|---|---|
| P0-1 | W0 恢复语义实质错误（笼统零操作） | §② 窗口表拆 W0-A（未启动浏览器→安全释放回 READY）/W0-B（已操作未 SEND_ATTEMPTED→保留现场核实）；recordSend 双写权威规则（权威源=归档 send-state.json，对账=不一致登记） |
| P0-2 | claim_token 缺防旧执行者复活 | §⑦ fencing 五机制（token-进程绑定/失效条件枚举/终止确认/新 token 前隔离/旧 token 禁提交）+各终态释放规则 |
| P1-1 | 字段表 13/14 行不符+last_checkpoint 缺 GENERATING+双写规则缺 | §② 14 行表修正+补 GENERATING+新增权威源/镜像/崩溃恢复三列 |
| P1-2 | 利用率定义不成立+配额缺单位+经济性不足 | §④ U=BUSY 时间÷周期（分实例/整机）+可观测单位口径（NOT_OBSERVED 保留）+经济性四项补齐 |
| P1-3 | Pool 枚举未统一 | §⑤ 两枚举（VerificationState/AccountGateState）+显式映射表+红线保留 |
| P1-4 | 测试证据不可核验 | §⑧ 统一格式（输入→预期→证据→脚本→断言→exit code）+崩溃五点（W0-A/W0-B/W1/W2+认领前）+C9 区分新建/复用+Phase C 日志格式/差集定义/审计文件要求 |
| P1-5 | §⑥ 删除与只增不删冲突 | §⑥ 边界澄清（残留=未含登录态的失败克隆残留；不变量保护=含登录态已验收 profile） |
| P1-6 | 辅助文件处理 | 变更声明+入库白名单规则+过程文件移除 |

**变更声明：** 本 R2 仅修改本文档；无代码变更、无运行态变更、无清理执行、无 N=2 重启授权变更。

## 附表二：R2→R3 修改对照（DEC-138 六组要求逐项落实）

| 要求组 | R2 缺口 | R3 落实位置 |
|---|---|---|
| Q-02 时序歧义 | 唯一调用点与复查点关系未定义 | §③ 两段式门禁关系（初始调用=唯一门禁状态；执行期复查=已验收实现内置，非独立状态；ALLOWED≠永久授权） |
| Q-03 崩溃窗口 | 持久化顺序/窗口/映射缺失 | §② 发送前持久化顺序与崩溃窗口映射表（W0/W1/W2×恢复语义，与已验收实现逐字对齐） |
| Q-04 令牌细节 | 令牌生命周期/防双执行缺失 | §⑦ claim_token 生命周期+防双执行四机制（唯一 token/统一接口/幂等查账本/归属不明人工） |
| Q-05 字段规格 | 类型/必填/枚举/归档关联缺 | §② 字段规格表（13 字段逐行：类型/必填/枚举/归档关联；send-state.json 权威源条款） |
| Q-06 六类语义 | 摘要化丢完整语义 | §④ 六类完整表格（逐类观测状态/来源/单位/时间戳+扩容判断表+经济性指标） |
| Q-07 枚举统一 | 两套命名并存 | §⑤ VerificationState 四态统一枚举（判定器/池门/c6 三处同源） |
| Q-08 证据机器化 | 测试缺可核验证据绑定 | §⑧ Phase B 五测试逐项绑定证据产物+断言；Phase C 七附加逐条绑定核验方式 |
| §⑥ 全文恢复 | 摘要替代操作规范 | §⑥ 完整恢复（克隆规程六步/失败处置表/两条硬约束/生命周期不变量/容量并发） |
