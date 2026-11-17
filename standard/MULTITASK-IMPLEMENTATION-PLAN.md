# Standard 多任务模式实施方案 v0.4（设计稿——未生效，待 P0 复审+用户批准）

> **文档身份：** DEC-106④ 裁定产物（GO 顺序2）。复审收敛链：R1 REWORK（`50e4c530…`）→ R2 REWORK（`2d093edc…`）→ R3 REWORK 仅余两点（`a8d96479…`：①④PASS/②PASS_WITH_CONSTRAINTS）→ 本 v0.4 落位。**设计稿不构成实施授权；分级放量每级另批。**

## 一、目标与范围

- **目标：** M2 治理能力实施化——多任务在 M1 平台与既有派单工具链内安全并行。
- **范围边界（硬）：** 暂不启用 M1 之外的能力；写操作链路 M4 继续封闭（DEC-106②）；ChatGPT 网页通道保持全局互斥；验证门与 906⑥ 合并。

## 二、架构设计

**现状：** M1 交替模式（一次一任务）；scheduler.py S0-S9 单任务编排；派单通道全局互斥（session_lock v6）+ reviewer 指针治理派单独占写。

**目标形态：任务级并行 + 通道级串行（R1① 已认可）。**

| 环节 | 并行性 | 依据与边界 |
|---|---|---|
| 任务包准备/证据采集/文档 | 可并行（纯本地） | 既有实践 |
| git worktree | 可并行（每任务独立） | 907/908 三 worktree 并存实测 |
| M1 REST/登记/状态推进 | **待验证，不预设**——幂等/去重是并发的必要非充分条件，以 906⑥ 真实并发验证为准（R1 condition① 修正 v0.1 推断）；验证通过前并行度不作用于 M1 写路径 | tests/platform 幂等用例仅单任务语义 |
| 测试执行 Worker | 可并行（多 worktree，无全局态） | test_worker.py 按传入 worktree 执行 |
| **ChatGPT 派单通道** | **全局串行不动** | session_lock v6（DEC-001）；--no-update-pointer |

**通道闸契约（R1 condition②）：** 全局唯一互斥点="通道闸"——**锁顺序：session_lock（浏览器/会话）→ reviewer 指针写**，单方向无交叉（无死锁面）；**唯一持有者：scheduler 主进程**（派单工具由其单线程调用，业务 Agent 不直接持锁）；**异常释放：** 沿用 session_lock v6 stale 回收（TTL+世代验证），持锁进程崩溃由锁票据过期+人工确认回收，不自动抢占活跃轮。

## 三、接口设计（scheduler 扩展面，最小增量）

1. **任务队列（持久化，R2② 约束落位）：** `runtime/scheduler-state.json` **单文件**承载队列+任务-会话绑定表（消除跨文件原子一致性面）——每任务 `{task_id, state, base_commit, evidence_dir, session_uuid, attempts, updated_at}`；**写入策略：写临时文件→fsync→原子 rename→fsync 父目录**（Windows 目录 fsync 尽力而为，平台差异登记）；**崩溃半写恢复：** rename 原子性保证读到完整旧版或新版，启动时清理残留 tmp；文件含 schema 版本字段，加载校验失败→STOP 不当空（L-018 账本纪律同构）；**attempts 计数边界：** 仅人工重试指令 +1（自动路径不计数），上限 2 硬校验在指令入口；
2. **任务生命周期状态机（R1 condition③）：** `DRAFT→READY→RUNNING→COMPLETED|FAILED|CANCELLED`，中途态 `SUSPENDED`（fail-closed/即停/重启恢复）——**合法转换表：**
   DRAFT→READY（开工登记齐）；READY→RUNNING（通道闸空闲）；RUNNING→SUSPENDED（即停/故障）；SUSPENDED→RUNNING（**仅人工确认解除**）；RUNNING→COMPLETED（五件套齐+验收 PASS）；RUNNING/SUSPENDED→FAILED；任意→CANCELLED（人工，产物保留）；
3. **重启恢复（R1③）：** scheduler 启动先读 state 文件——RUNNING 态任务→置 `SUSPENDED(reason=restart)`，**不自动续跑**；**人工恢复前置核验（R2②）：** 该任务**无未决发送**（在途消息已采集完成或 fail-closed 挂起）方可恢复，存在未决发送→拒绝恢复并提示补采；COMPLETED/FAILED/CANCELLED 不动；
4. **取消与重试：** 取消=人工指令，当前通道轮完成并采集后置 CANCELLED（在途消息禁重发语义不变）；重试=同任务 FAILED 后人工触发，attempts≤2，**五类即停触发的 FAILED 不允许自动重试**；
5. **任务-会话绑定表：** 并入 scheduler-state.json 单文件——task↔会话 UUID↔user 消息计数；**唯一性约束：一会话同一时刻仅绑一任务**，冲突→fail-closed 拒派（R1③）；阈值按会话独立计数（DEC-084）；
6. **per-task 证据命名空间：** dispatch 现场/五件套按 task_id 分目录；C1 基线 per 任务。

## 四、任务隔离设计

- **代码：** 每任务独立 worktree（禁共享工作树写）；
- **证据（R2③/R3③ 约束落位）：** 按 task_id 分目录；**COMPLETED 前置校验=五件套必需文件清单逐文件存在+非空+全量 SHA256 逐一计算校验通过**（R3③：抽核不足，必需文件**全部**计入 SHA256SUMS 并逐一比对通过方可 COMPLETED；清单按任务类型在 task-brief 中显式定义：record/delivery/验收 reply 原始字节/测试日志/审计链），**基线一致性：** 证据内 base_commit=队列登记 base_commit=任务包开工登记 commit 三方一致，**防跨任务误绑定：** 归属三元组（task_id+会话 UUID+简报标记文本）一致才判归属，C1 绑定按任务基线比对；
- **会话：** 绑定表强隔离；跨任务禁止复用审查会话承载无关任务（远桥实例教训：多任务下从"标记区分"升级为"强隔离"）；**跨任务数据污染防线：** 禁共享写路径+证据 SHA 绑定+通道互斥保证消息不串（R1③）；
- **失败：** 单任务 fail-closed 不阻断队列；全局五类即停见 §五触发矩阵。

## 五、即停与熔断（R1 condition④：触发矩阵+在途处置+人工恢复）

| 触发（五类） | 范围 | 动作 |
|---|---|---|
| 权限越界（任何任务触碰未授权写/M1 状态/DEC-010） | **全局熔断** | 全队列 SUSPENDED，仅人工解除 |
| 数据污染（证据/登记/仓库状态可疑变更） | **全局熔断** | 同上 |
| 证据缺失（fail-closed 采集失败） | 单任务 | 任务 SUSPENDED，队列继续 |
| 状态不一致（队列文件/绑定表/状态机冲突） | 单任务暂停+人工 | 该任务 SUSPENDED |
| 重复失败（同任务 2 轮无实质进展） | 单任务熔断 | 任务 SUSPENDED；**队列内 ≥2 任务同时无进展→升级全局熔断** |

- **在途任务处置：** 熔断指令不中断进行中的通道轮——当前派单完成采集（或 fail-closed 挂起）后再置 SUSPENDED；**已发送消息一律先采集/补采，禁重发语义不变**；
- **人工恢复条件：** 熔断仅人工解除——须记录原因+整改措施+（涉验收的）独立验收通过；全局熔断解除后队列从 SUSPENDED 任务逐个恢复，不自动全量续跑；
- **熔断原子发布（R2④ 落位）：** 全局暂停标志并入 scheduler-state.json 单文件（原子 rename 发布）；**派单前强制检查：** 获取通道闸后、发送前重读 state——pause=true 即中止本次派单并让出通道闸（杜绝熔断竞态放出新任务）；运行中轮次不中断（在途处置条款）；
- **全局暂停竞态：** 标志单写入口（scheduler 主进程），派单/监控只读；标志变更间不中断已建立的 HTTP 会话轮。

## 六、实施序（分级放量，每级独立批准——R1 condition④）

- **P0 设计评审：** 本 v0.2 复审 → 用户批准后冻结 v1.0；
- **P1 最小并行=2 任务只读复审并行：** **独立批准后方可开跑**；零写入零 M1 推进，五件套+批次复盘；
- **P2 平台级并发受控用例：** =906⑥ 验证门，**不得绕过**；通过前 M1 写路径不参与并行；
- **P3 并行度放开（≤3）：** P2 通过+复盘后另行批准；
- 全程：M4 写操作封闭、DEC-010 红线、五件套留证、不自动滚动。

## 七、版本边界与回滚（打版前置件，R1⑤ PASS_WITH_CONSTRAINTS 修订落位）

- **候选版：** `v0.1.0-standard-alpha`（**不可变 annotated tag**）；
- **不可变 SHA 约束（R3⑤ 修正自指缺陷）：** **tag message 只登记被测 commit 完整 40 位 SHA+M1-M4 回归日志路径与 SHA256**（日志入库 `phase1/logs/release-v0.1.0-alpha/` 附 SHA256SUMS，可复核原文）；**tag 对象 SHA 不写入自身 message**（对象 SHA 由内容计算，自指不可能——R3⑤ 指正）——tag 创建后，在**独立发布记录** `phase1/logs/release-v0.1.0-alpha/RELEASE-RECORD.md` 登记三者映射（tag 名↔tag 对象 SHA↔被测 commit SHA）；tag 打后不移动不删除（删除/重打视为版本事故登记）；
- **tag 保护：** 推送后 GitHub 侧建议启用 tag 保护（用户侧操作，登记建议不代做）；
- **父提交回滚：** 回滚目标=`<tag>^`（被测 commit 的 parent）明确登记于 tag message；回滚动作=checkout 该 parent，main 演进不受影响；
- **全量回归证据约束：** 打版前置=M1-M4 四模块回归 exit=0 的新鲜实跑日志入库（含 SHA256SUMS），tag message 引用其路径+SHA；
- **包含/不包含：** 同 v0.1（含 906① 结论与多任务方案 v1.0；不含写操作/C2-C8/平台级并发实跑/多任务 P1-P3 实施）。
