# 动态任务调度方案 R3（DYN-SCHED-R3 定向修订，待复审）

**被测基线：** 本 commit（R3 修订提交后完整 SHA 见网页简报）
**修订依据：** R2 裁定 reply SHA `cfdaeb0c68567440…`（R2 FAIL，6 项：R2-01~05 REWORK、R2-06 方向 PASS 需补定义）
**原则：** 不再扩展新功能，只针对六项定向修改；不碰任何代码，仅设计文档收敛。

---

## R2-01 控制面 / M1 写路径 / 实施阶段授权边界（操作化）

建立四层边界表，任何层不得越界：

| 层级 | 定义 | 本需求当前状态 | 允许的动作 | 禁止的动作 |
|---|---|---|---|---|
| 设计冻结 | 离线模型、状态机、接口契约设计 | **本次 R3 所在层** | 文档评审、冻结 | 任何运行时写入 |
| 控制面代码实施 | 任务状态/队列/协商的代码实现 | 未授权，另行批准 | 需独立授权+隔离+验证范围后实施 | 借控制面接口获得 M1 并发写授权 |
| M1 写路径并行 | 任务状态写入的并发放开 | 锁定 | — | 906⑥ 独立 PASS 前不得解除 |
| P3 并行度≤3 启用 | 三任务实际并发执行 | 锁定 | — | P3 独立批准前不得启用；不因"计数器已实现三并发"即视为授权 |

操作化规则：`scheduler-state.json` 的并发计数仅表示"调度额度"，不是"M1 写授权"；新增 REST 端点的 handler 不得直接调用 M1 状态写 API，须经既有授权检查链（§8.6）；方案文档每节标注所属层级。

## R2-02 WAITING 自动推进 + 原子额度预留

- **语义三分**：依赖未满足→保持未就绪（NOT_READY，记录阻塞原因，**不进容量队列**）；READY=条件满足待调度；WAITING=READY 之后因容量不足等待。
- **推进规则**：WAITING 名额释放后由调度器**自动推进至 READY**（FIFO 按进入时间），不需要用户逐个确认；READY→RUNNING 仍经既有派单通道闸+授权+执行前检查——**自动推进队列状态 ≠ 自动批准任务执行**。
- **原子额度预留**（防超额）：
  - 单写者：`scheduler-state.json` 由 scheduler 主进程独占写（单写者锁），或等价 `CAS(version)`；所有名额操作经此唯一入口。
  - `reservation_id` 唯一（ULID），预留记录 `{reservation_id, task_id, status: RESERVED, created_at, generation}`。
  - 顺序：名额预留（CAS）→ READY→RUNNING 授权检查 → 授权通过才占实额；授权失败释放预留。
  - 失败释放：任何步骤异常，预留状态→RELEASED，名额归还。
  - 重启重算：启动时从任务状态机实算 `active_count`，丢弃所有未提交预留（不信任过期计数/预留）。

## R2-03 抢占链升级为持久化抢占事务（Preemption Workflow）

废弃原五步线性链，改为六阶段持久化事务，每阶段有持久化记录、幂等键、前置状态校验、恢复策略：

| 阶段 | 状态 | 要求 | 幂等键 | 恢复策略 |
|---|---|---|---|---|
| 1 | `PROPOSAL_OPEN` | 等待用户决策；含加急任务、候选让路列表 | `proposal_id` | 幂等提交决策 |
| 2 | `DRAINING` | 锁定 victim，禁止新派单轮 | `proposal_id+victim_task_id` | 重启后重入 DRAINING 继续排空 |
| 3 | `HANDOFF_READY` | 在途轮完成采集/fail-closed 挂起，交接包校验通过 | `handoff_id` | 校验失败回 DRAINING 重试，不释放名额 |
| 4 | `VICTIM_RELEASED` | victim→SUSPENDED/CANCELLED 状态变更成功，名额释放 | `victim_task_id+generation` | **不可回滚为 OPEN**；从已持久化阶段继续 |
| 5 | `DECISION_COMMITTED` | proposal 决策持久化 | `proposal_id` | 幂等写入 |
| 6 | `URGENT_ADMITTED` | 加急任务获名额进入 READY | `reservation_id` | 幂等，重复执行校验已 admitted |

关键约束：阶段 4 之后不可简单回滚重选 victim（避免重复交接/重复释放）；每步写 `workflow_journal` 持久化进度；重试跳过已完成阶段；全局 `task_generation` fencing（见 R2-04）拒绝迟到写入。

## R2-04 DRAINING 排空屏障 + fencing

- 用户拍板后立即置 victim 为 DRAINING：①禁止该任务开启新派单轮（调度器检查 task status）；②已开始的轮次允许完成采集或 fail-closed 挂起；③核验无未决发送（pending send = 0）；④确认 execution_id / 轮次 / 会话状态未变；⑤落盘并校验交接包；⑥最后才释放并发名额。
- **fencing 机制**：引入单调递增 `task_generation`（每次进入执行轮 +1，写入 journal 与交接包）；所有迟到状态更新携带 generation，服务端校验 `update.generation == current.generation` 才接受，旧轮迟到更新一律拒绝。单纯 session_lock 不足以解决任务级竞态，generation 为任务级屏障。
- SUSPENDED（可人工恢复）与 CANCELLED（终态不可恢复）严格区分；两者都必须完成交接后才释放额度。

## R2-05 交接包无损恢复补齐

交接包 `evidence/handoff/<task_id>/` 必含七类，缺一不可（不以新建 handoff.md 替代五件套）：

1. **身份**：task_id、session_uuid、简报标记、base_commit
2. **Git 现场**：HEAD 完整 SHA、分支、dirty 状态、未跟踪文件、必要 diff
3. **执行现场**：execution_id、attempt、当前步骤、最后完成步骤、task_generation
4. **派单现场**：当前轮次、dispatch_id、最后 user unit 键、reply SHA256、采集游标
5. **消息安全**：未决发送清单、已发送未确认事项、采集游标（无未决发送才可恢复）
6. **证据**：五件套完整清单 + 逐文件 SHA256 + MANIFEST
7. **恢复**：恢复前置条件、人工确认记录、恢复后验证步骤

继承 v1.0 硬约束：五件套必需文件全部存在且非空；SHA256SUMS 全覆盖并逐项校验；base_commit 三方一致；task_id/会话UUID/简报标记归属一致；恢复前确认无未决发送；SUSPENDED 仅人工恢复。交接包须能回答三问：停在什么准确位置 / 哪些操作已发生与未发生 / 恢复时如何不重复发送、不丢证据、不覆盖代码现场。

## R2-06 WAITING 状态定义收敛（方向 PASS）

- 保留 WAITING，明确 = READY 之后因容量不足而等待；不采用 READY+dispatched_at 排序替代（治理语义混淆）。
- WAITING FIFO 按进入时间；加急仅通过用户协商改变顺序，**AI 不得自行提高优先级**；WAITING 不占并发额度；SUSPENDED 交接完成后释放额度；CANCELLED 终态。
- 不引入复杂优先级评分，FIFO + 用户明确授权加急插队足够。

---

## R3 不变项（重申）
派单通道 session_lock 串行不动；一任务一会话一 worktree 一分支；M4 写封闭；DEC-010 红线；五件套治理；906⑥ 门。本轮仅设计文档，不授予任何实施阶段权限（P1/P2/P3 均不自动授权）。
