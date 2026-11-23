# 动态任务调度方案 R4（DYN-SCHED-R4 定向修订，待复审）

**修订依据：** R3 裁定 reply SHA `a85ef9e3a999e5e3…`（R3 FAIL；R2-06 PASS 已闭合不重开；R2-01~05 五项未闭合）
**原则：** 只针对五项修订，不重开 R2-06，不扩展新功能，不碰代码，仅设计文档闭环。

---

## R2-01 授权检查链最小契约（替代不存在的 §8.6 引用）

本方案不引用外部章节，直接定义最小授权契约 `AuthCheckContract`：

| 主体类型 | 允许操作 | 禁止操作 | 检查点 |
|---|---|---|---|
| 人类用户（UI 显式指令） | 创建任务、提交抢占决策、恢复 SUSPENDED、批准 P1/P2/P3 | 直接写 M1 任务状态表 | `post /preemption-proposals/{id}/decision` 等端点校验 operator 为人类主体且具任务管理角色 |
| scheduler 服务主体 | 状态推进 READY/WARNING/DISPATCHED、额度预留、队列 FIFO | 修改 M1 业务数据（execution/repo/git 写路径） | 仅可写 scheduler-state 与任务状态机的"调度态字段"，写前校验 token 与 generation |
| 派单执行主体 | 派单/采集/补采（既有链路） | 自行提高任务优先级、跨任务写状态 | 复用既有 session_lock + 授权检查，不得经新控制面端点绕过 |

- **控制面不得绕过 M1 写授权的验证点**：所有新增 REST handler 在写任务状态前，必须调用统一 `authorize(operator, operation, task, generation)`；缺主体/缺权限/ generation 不符 → fail-closed（拒绝+审计），不得降级为"控制面内部操作"豁免。
- 检查失败一律 fail-closed，返回明确拒绝码，审计留痕（谁/何时/何操作/拒绝原因）。

## R2-02 额度预留账本原子性（闭合 RESERVED 口径与崩溃恢复）

- **容量计算**：`active_count + valid_reserved_count ≤ 3`，`RESERVED` **立即独占一个容量名额**（不是"预留不计入容量"）。
- **预留状态机**：`NONE → RESERVED → COMMITTED | RELEASED | EXPIRED`，每次转换写 `scheduler-state.json`（单写者/CAS(version)）+ `workflow_journal`，原子提交（状态+额度同一事务边界，落盘为单一 JSON 原子替换或等价事务）。
- **顺序**：预留（CAS，RESERVED 占额）→ READY→生成 dispatch 授权检查 → 授权通过 RESERVED→COMMITTED（转为实额）／失败→RELEASED（归还名额）。
- **重启对账**（不无条件丢弃）：依据三类持久化数据对账——①任务状态机实况；②预留记录（含 reservation_id/状态/generation）；③workflow_journal 事务日志。规则：journal 有 COMMITTED 记录但状态未提交的→补提交；有 RESERVED 无后续且有在途任务→重算实况后决定 COMMITTED 或 RELEASED；对账结果写审计，禁止"丢弃所有未提交预留"。
- **幂等释放**：授权失败/进程崩溃/重复重试三种情形，均以 reservation_id 幂等执行 RELEASED；重复释放请求返回已释放状态，不二次归还名额。

## R2-03 决策持久化前置（闭合故障窗口）

废弃"先释放 victim、后持久化决策"的顺序，改为**决策先提交**：

| 阶段 | 状态 | 关键动作 | 幂等键 | 恢复 |
|---|---|---|---|---|
| 1 | `PROPOSAL_OPEN` | 等待用户决策 | proposal_id | 幂等提交 |
| 2 | **`DECISION_ACCEPTED`** | **用户决策原子提交并持久化（victim/action/operator/reason + `fencing_epoch`）** | proposal_id | 幂等；已接受不可重选 |
| 3 | `DRAINING` | 锁定 victim、禁止新轮（前置：决策已持久化） | proposal_id+victim+epoch | 重入继续排空 |
| 4 | `HANDOFF_READY` | 在途轮采集完成、交接包校验通过 | handoff_id | 校验失败回 DRAINING |
| 5 | `VICTIM_RELEASED` | victim→SUSPENDED/CANCELLED，名额释放 | victim+generation | 不可回滚；按已提交决策续跑 |
| 6 | `DECISION_COMMITTED` | proposal 标记 DECIDED（与阶段 2 决策记录一致） | proposal_id | 幂等 |
| 7 | `URGENT_ADMITTED` | 加急任务获名额进 READY | reservation_id | 幂等校验 |

- **不可逆动作（阶段 5）只在阶段 2 决策已持久化后执行**；阶段 5 之后只允许按已提交决策继续恢复，绝不重新选择 victim。
- **一致性边界**：`workflow_journal` 与 victim 状态变更、额度释放在同一事务边界内提交（单一 journal 记录包含三者的 before/after + generation + epoch），避免"日志显示释放但额度未释放"或反之。

## R2-04 DRAINING 屏障时点与 fencing 边界（闭合竞态）

- **屏障时点**：用户决策持久化后立即原子推进 fencing epoch（阶段 2 完成即 epoch+1），同时置 victim 为 DRAINING；**屏障后不接受任何新派单轮**（服务端校验）。
- **在途白名单**：屏障前已登记的在途轮次列入 `inflight_allowlist`，记录最后可接受的采集事件游标；仅白名单内且游标之后的采集事件允许完成，其余拒绝。
- **两阶段 fencing**：①屏障时 epoch+1 但保留在途白名单（允许合法采集完成）；②交接完成、额度释放（阶段 5）后，将 victim 的 `task_generation` 再 +1 使其旧轮全部失效——此时白名单关闭。
- **服务端校验**：所有相关写入口（派单采集、状态更新、交接包写入）必须校验 `fencing_token = (task_id, generation, epoch)`，与服务端当前值不符即拒绝——不只依赖调度器本地检查。
- **目标**：在途合法采集可以完成，但交接完成后的迟到写入不能再改变 victim 状态或污染新一轮现场。

## R2-05 Git 现场内容完整保存（闭合无损恢复）

交接包 Git 现场除 HEAD/分支/dirty/untracked 路径外，必须保存**内容本身**：
- `git diff --binary HEAD`（staged 与 unstaged 分别保存：`git diff --cached --binary`、`git diff --binary`）
- 所有未跟踪文件的**实际内容**（逐文件复制入交接包，保留路径与权限位）
- 上述材料逐项纳入 MANIFEST 与 SHA256SUMS（全覆盖校验）
- 大文件/无法纳入项：记录外部引用路径 + 内容 SHA256 + 恢复前可访问性验证结果，不接受仅留路径
- **恢复前校验**：比对目标 worktree 的 base_commit 与交接包基线，若目标已有新变化（dirty/ahead），拒绝恢复并提示人工处置，禁止静默覆盖

## R2-06（PASS，不重开）
WAITING 语义/FIFO/不占额/加急仅用户授权维持 R3 定义，本次不改。

---

## 不变项（重申）
派单通道 session_lock 串行不动；一任务一会话一 worktree 一分支；M4 写封闭；DEC-010 红线；五件套治理；906⑥ 门。本轮仅设计文档，不授予任何实施阶段权限（P0 设计冻结之外 P1/P2/P3 均不自动授权）。
