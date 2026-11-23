# 动态任务调度方案 R5（DYN-SCHED-R5 收敛修订，待复审）

**修订依据：** R4 裁定 reply SHA `445d19e5b0991aba…`（R4 FAIL；R2-01/R2-05 PASS，R2-06 维持 PASS，仅 R2-02/03/04 未闭合）
**原则：** 只收敛三项，不重做 R2-01/R2-05/R2-06，不扩新功能，不碰代码。三项同根——统一事务模型，本次一次性定义清楚。

---

## 统一事务模型（一次定义，三项共用）

引入 `PreemptionTx`，作为抢占/预留/额度/状态变更的**唯一原子提交机制**：

- **唯一权威账本 = `workflow_journal`（仅追加、不可变、fsync 落盘）**。所有状态、额度、generation、epoch 的变更以 journal 记录为**唯一权威事实来源**；`scheduler-state.json` 与任务状态表均为 journal 的**物化视图**（materialized view），由 journal 重放生成，不再作为独立写入源。
- **事务提交点 = journal 中的一条 COMMIT 记录**。每次状态转换写 `PREPARE(txn_id, before, after, objects[]) → COMMIT(txn_id, commit_mark)`；只有带 COMMIT 标记的 txn 生效。单文件追加 + fsync 保证自身原子；跨对象一致性由"所有对象变更打包进同一 txn_id、同一次 COMMIT"保证——**不存在两个独立文件各自提交**的窗口。
- **提交标记**：COMMIT 记录含 `txn_id / commit_mark(SHA256 of PREPARE+txn_id) / timestamp / actor`。校验 commit_mark 防止半写。
- **重放恢复**：启动时从空物化视图重放全部带有效 COMMIT 的 txn（按序号），重建 scheduler-state 与任务状态；PREPARE 无 COMMIT 的 txn 视为未提交、忽略（不改任何视图）。**任何恢复结果都不重复释放/占用额度**：因额度变化也是 txn 内对象，重放幂等。
- **幂等键**：所有写操作带 `idempotency_key = txn_id`；重复提交同 txn_id 返回既有结果，不产生第二条 txn。
- **EXPIRED 判定**：预留记录含 `expires_at`（创建时 +T，T 为配置常量，需用户可调但默认明确）；`valid_reserved_count` 只计未过期且无 RELEASE/COMMIT 的 RESERVED。重启对账时按 `expires_at` + journal 中该 reservation 的后续记录判定：有 COMMIT→COMMITTED；有 RELEASE→RELEASED；无后续且未过期→仍有效（重放保留）；无后续且已过期→EXPIRED 并归还名额（写一条 txn）。

## R2-02 额度预留账本（用统一事务模型闭合）

- 容量 = `active_count + valid_reserved_count ≤ 3`，RESERVED 立即占额，均通过 PreemptionTx 提交（不再有"JSON 与 journal 两次独立写"）。
- `RESERVED → COMMITTED | RELEASED | EXPIRED` 全部是 journal 事务；授权失败/崩溃/重试三种情形以 reservation_id 幂等执行 RELEASED。
- 重启对账 = journal 重放（见上），不丢弃未提交预留；对账结果写审计。

## R2-03 决策提交语义（闭合）

统一阶段语义，消除 DECISION_ACCEPTED / DECISION_COMMITTED 双重含义：

| 阶段 | 状态 | 含义 | 事务 |
|---|---|---|---|
| 1 | `PROPOSAL_OPEN` | 等待用户决策 | — |
| 2 | **`DECISION_ACCEPTED`** | **唯一不可撤销的用户决策提交点**（victim/action/operator/reason/epoch 一次性写入 journal 并 COMMIT）；同时原子完成 epoch+1、victim 锁定、DRAINING 置位 | txn A（三对象同事务） |
| 3 | `DRAINING` | 阶段 2 已原子置位，本阶段执行排空（禁止新轮、在途白名单采集） | 排空事件写 journal |
| 4 | `HANDOFF_READY` | 在途轮采集完成、交接包校验通过 | txn B |
| 5 | `VICTIM_RELEASED` | victim→SUSPENDED/CANCELLED + 额度释放，**同一 txn 提交**（两对象同事务，/journal 单提交点） | txn C |
| 6 | `PROPOSAL_CLOSED` | **仅为 proposal 流程完成标记**（不再承担决策提交语义），改名明确 | txn D |
| 7 | `URGENT_ADMITTED` | 加急任务 RESERVED→COMMITTED 进入 READY | txn E |

- **阶段 2 是唯一决策提交点、不可撤销**；阶段 6 改名 PROPOSAL_CLOSED，仅为流程标记。
- **阶段 5 一致性**：victim 状态与额度释放在 txn C 内同一提交点（journal COMMIT），无"日志显示释放但额度未释放"窗口。
- **失败续跑**（依据 journal 重放）：
  - txn A 成功、阶段 3/4 失败 → 从 DRAINING 重入继续排空，决策不重选；
  - txn C（阶段 5）成功、txn D（阶段 6）失败 → 重启重放时阶段 5 已生效（victim 已释放），仅补写 PROPOSAL_CLOSED，不重复释放、不重选 victim；
  - txn E（阶段 7）失败 → 加急任务预留仍为 RESERVED（未提交），按 EXPIRED 规则或重放决定继续/归还，绝不二次占额。

## R2-04 fencing 阶段与游标边界（闭合）

- **三动作合并为阶段 2 的单一原子操作**（txn A）：用户决策提交 + epoch+1 + victim 置 DRAINING 在同一 journal COMMIT 内完成——消除"决策已接受、DRAINING 未记录、epoch 已变"的中间态。阶段 3 只执行排空动作，不再做置位。
- **采集游标边界**：在途白名单记录 `{inflight_round_id, cursor_low, cursor_high, seen_event_ids[]}`；允许完成的采集事件 = `cursor_low < event_seq ≤ cursor_high` 且 `event_id ∉ seen_event_ids`（去重）；游标上界 `cursor_high` 在 txn A 时锁定为"屏障时刻最后事件序号"；游标之后（seq > cursor_high）的事件一律拒绝并审计。
- **白名单关闭与 generation+1 顺序**：阶段 5（txn C）中先关闭白名单（标记 allowlist_closed=true），再对 victim `task_generation+1`，两者同一 txn 提交。此后旧 token 在服务端立即失效。
- **服务端校验**：所有写入口（采集/状态更新/交接包）校验 `fencing_token=(task_id, generation, epoch)`，与 journal 物化视图当前值不符即拒绝——不依赖调度器本地检查。

---

## 不变项（重申）
派单通道 session_lock 串行不动；一任务一会话一 worktree 一分支；M4 写封闭；DEC-010 红线；五件套治理；906⑥ 门。本轮仅设计文档，P0 之外的 P1/P2/P3 均不自动授权。
