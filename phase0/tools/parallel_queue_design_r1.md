# Instance/Conversation Queue Service 设计八件 R2（R1 整改版，定点复审对象）

- **依据：** DEC-137（R1 审查 BLOCKED：P0×4 编码阻断+P1×4 编码前补齐；本稿逐项关闭）。
- **R2 变更声明：** 仅修改本文档（设计），**零代码变更、零运行态变更**；R1→R2 对照见文末附表。
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

**幂等与恢复（Q-03/Q-05）：**
- 派发前以 `idempotency_key` 查账本：存在有效 EXECUTING 记录→禁派发（任务唯一性）。
- `send_state` 三态与 send-state.json 同源逐字（NOT_SENT/SEND_ATTEMPTED/SEND_CONFIRMED）：**SEND_ATTEMPTED 后进程崩溃→recovery_state=PENDING_VERIFY，保留现场先核实发送结果，不得视为未发送，禁自动重发**（L-018 纪律的机制化）。
- 崩溃恢复序：读 last_checkpoint → 核对 ChatGPT 侧实际状态（结构化证据）→ RECOVERED（补记归档）或 MANUAL_REQUIRED（人工核对，禁自动判定）。

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
- **C9 返回 ALLOWED 不构成整个执行周期的永久授权**：C3/C8 实测的复查点保留（pre-spawn/pre-reuse/观察点），观察点命中即触发异常转换。

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

**C6（Q-06：六类结构化证据，独立可扩展，禁塞两时间字段）：**
```jsonc
"c6": {
  "throughput":   { "claimed_at": "", "sent_at": "", "completed_at": "", "exec_ms": 0, "queue_wait_ms": 0 },
  "quota":        { "observed": null, "note": "官方无精确余量时只记可观测信息，禁自算虚假配额" },
  "rate_limit":   { "observed": false, "events": [], "state": "NOT_OBSERVED" },  // NOT_OBSERVED ≠ PASS
  "verification": { "state": "NORMAL|SUSPECTED|REQUIRED|UNKNOWN_BLOCK", "events": [], "human_resolved_at": null },
  "isolation":    { "lock_conflicts": 0, "cross_talk": false, "foreign_kill": 0 },
  "resource":     { "chrome_procs": 0, "mem_mb": null, "cpu_pct": null }   // 采样器另行接入，字段先行
}
```
缺失采集=显式 `observed:false` 记录，禁默认零值冒充真实数据（R1 ⑧意见吸收）。

## ⑤ 人机验证四态及人工处置（R1 PASS_WITH_CONSTRAINTS，补 Q-07）

- 四态与红线不变（禁自动点击/破解/绕过/刷新/重克隆；人工恢复后才复派；全池 PAUSED-HUMAN）。
- **Q-07 新增：VERIFICATION_SUSPECTED 不得因超时或页面重新加载自动降级为 NORMAL**——恢复只有两条路径：人工确认，或经明确授权的可靠恢复判定（结构化复检通过+记录）。判定器输出与恢复动作均入 c6.verification.events。

## ⑥ 实例池容量、并发与克隆约束（R1 PASS，全文保留零修改）

profile 只增不删（删除=DEC-010）/清理仅进程级/优雅 close 优先/黄金源克隆规程/入池人工登录态验收+健康检查/容量=已验收实例数/N=2 现行、N=3 为未来目标不随 Queue 编码自动扩容/侧栏账号级共享→CONV_UUID 精确导航禁最新启发式——逐条保留。

## ⑦ Bash 三阶段迁移与回滚（Q-04 整改：原子认领+崩溃回滚流程）

**Phase B 重新定义（消除"影子观察 vs 真实派发"的概念冲突）：**
- **单一任务账本 + 双调度入口 + 原子唯一认领**：人工中控与 Queue 都只能通过同一认领接口获取任务（账本文件+lockfile 临界区，M1/端口注册表同模式）；认领操作原子（CLAIM 写账本成功=唯一执行权；写失败禁派发）；同 task_id 同时只允许一个有效执行权。
- 归属不能确认时→人工核对，禁自动重发。

**回滚流程（R1 缺口补齐，不再"停进程即接管"）：**
```
停新认领（账本封账）→ 等待/隔离在途任务（BUSY 实例列表明细）→ 持久化 Task/Instance/Execution
→ 核对 SEND_ATTEMPTED 现场（逐条 recovery_state 核实）→ 确认无悬空执行权（claim_token 全部核销）
→ 恢复人工中控（按账本续跑）
禁：简单停 Queue 进程后立即人工派发（Queue 已死但浏览器在途+人工重派同任务的风险）。
```

## ⑧ 分阶段验收标准（Q-08 整改：机器化、可核验）

**Phase A（观测）：** 采集器零侵入（现役行为零变化）；C6 字段有明确来源/单位/时间戳；采集缺失显式 observed:false 禁默认零值冒充；采集失败不得改变现役 Bash 行为。

**Phase B（骨架）五项测试（全 PASS 才进 C）：**
1. 双入口并发认领：同 task_id 仅一个执行者领取（并发压测）。
2. 进程崩溃恢复：认领前/认领后/发送尝试后/发送确认后四点分别演练（kill -9），恢复语义逐点核对（Q-03）。
3. C9 BLOCKED 测试：门禁阻断时浏览器操作次数=0（CDP 审计）。
4. C6 证据完整性：Task↔Instance↔Execution↔dispatch 归档四方可相互追溯。
5. 回滚演练：无重复派发/无孤儿进程/无任务丢失。

**Phase C（接管）：** 连续 ≥20 任务队列自主运行零人工派发干预（最低初验门槛），同时满足：无重复派发/无任务丢失/无未经门禁的浏览器操作/人机验证暂停与恢复正确/中控验收失败不阻塞无依赖任务/失败现场可恢复可审计/回滚演练通过。**N=3 扩容独立审批，不属于 Phase C 自动验收结果。**

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

**变更声明：** 本 R2 仅修改本文档；无代码变更、无运行态变更、无清理执行、无 N=2 重启授权变更。
