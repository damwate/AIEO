# 动态任务调度方案 R1（待 ChatGPT 复审）

**被测基线：** main `a74f02776db19d6f8d5332e089689436a141ea59`（用户 2026-11-23 复测全绿版）
**需求：** 并行上限 3（超限等待）+ 协商式抢占（加急插入导致超限时，用户拍板让路任务暂停/终止交接）
**既有资产：** `standard/MULTITASK-IMPLEMENTATION-PLAN.md v1.0`（设计冻结，非实施授权）已定义单文件 `scheduler-state.json` 队列、SUSPENDED 中途态、人工恢复、派串/开并、906⑥ 门。本方案是其**增量**，不重造。

## 一、范围判定（先请审查方裁定）
本需求涉及：状态机扩展、并发计数器、任务队列调度、抢占协商接口、worktree/会话交接——均属 `MULTITASK-IMPLEMENTATION-PLAN.md` §六 P2/P3（平台能力受控放量 + 并行度≤3），**而 P1/P2/P3 需用户逐级独立批准，906⑥ 门未过前 M1 写路径并行不解除**。请审查方先裁定：本需求是否必须等 P1（906⑥）通过后才能进入 P2/P3？还是可作为独立任务在 P1 之外先做"调度控制面"（不改 M1 写路径并发行为，只管任务状态/队列/协商）？

## 二、方案要点（控制面增量，暂不碰执行面）

### 1. 并发额度与状态
- 在 `scheduler-state.json` 增 `concurrency_limit=3`（常量，用户可调但需拍板）与派生 `active_count`（由状态机实时计算，非独立存储，避免双写不一致）。
- 定义"占额状态"= `DISPATCHED/IN_PROGRESS/DEV_REPORTED/GIT_VALIDATING/CODE_REVIEW/TEST_ACCEPTANCE/REWORK`（即非终态且已开工）；`DRAFT/PLANNING/ARCH_REVIEW/READY` 不占额；`SUSPENDED/CANCELLED/ACCEPTED` 不占额。
- `WAITING` 作为 NEW 状态：已 READY 但因 active_count≥3 未被调度的任务 → WAITING（占额=否）；有名额时 WAITING→READY 由调度器推进（人工确认或自动，待裁定）。

### 2. 状态机扩展（M1 `state_machine.py`）
- 新增 `SUSPENDED`、`WAITING` 两状态与转换边：
  - `READY→WAITING`（并发满）/ `WAITING→READY`（名额释放，人工或自动）
  - `IN_PROGRESS|DEV_REPORTED|GIT_VALIDATING|CODE_REVIEW|TEST_ACCEPTANCE|REWORK → SUSPENDED`（协商抢占-暂停，须带 `reason/handoff_ref/decided_by`）
  - 任意执行态 `→ CANCELLED`（协商抢占-终止，须带 `cancelled_by/reason/handoff_ref`，已有 CANCEL 边复用）
  - `SUSPENDED→READY`（用户显式恢复指令，非自动；与 v1.0"SUSPENDED→RUNNING 仅人工解除"对齐）
- 所有转换沿用 `apply_event` 的 event_id 幂等 + 审计（C1 §2/§3），不新增直接写 status 的通道。

### 3. 协商式抢占接口（人在回路，核心）
- 新端点 `POST /api/v1/tasks/preemption-proposals`：加急任务创建/标记加急时，若 `active_count + 1 > 3`，**不自动抢占**，生成 proposal `{proposer_task_id, active_tasks:[{task_id,status,progress}], candidates:[...], required_decision:true, expires_at}`，status=OPEN，审计留痕。
- 用户通过 `POST /api/v1/tasks/preemption-proposals/{id}/decision` 拍板：`{victim_task_id, action: "SUSPEND"|"CANCEL", reason, operator}`；服务端校验 victim 确在占额态、proposal OPEN、operator 为人类主体（服务令牌不得拍板，复用 §8.6 授权模型）。
- 决策执行顺序（严格）：①victim 当前派单轮完成采集/补采（禁重发）；②落盘交接包（进度/证据路径/未完成项/恢复条件/会话 UUID）；③victim 状态 → SUSPENDED 或 CANCELLED（释放名额）；④proposal → DECIDED；⑤加急任务从 WAITING→READY 并调度。**任一步失败 fail-closed，proposal 保持 OPEN，不进入下一步**。
- 超时未决策：proposal → EXPIRED（不自动选 victim；加急任务留在 WAITING）。

### 4. 交接协议
- 交接包落 `evidence/handoff/<task_id>/`，必含：当前 status、execution_id/attempt、最后采集的 user unit 键与 reply SHA256、worktree/branch 路径、会话 UUID、未完成步骤、恢复前置条件（无未决发送）。
- SUSPENDED 恢复前置：`assert no pending send`（在途消息已采集或 fail-closed 挂起），否则拒绝恢复（与 v1.0 §三.3 一致）。

### 5. 不变项
- 派单通道 session_lock 全局串行不动；每会话同一时刻仅绑一任务；M4 写封闭、DEC-010 红线、906⑥ 门、五件套证据——本方案不解除任何一项。

## 三、请审查方逐项裁定
1. 范围判定（第一节）：独立做控制面 vs 必须等 P1/906⑥？
2. WAITING→READY 的调度：人工确认推进，还是名额释放时自动推进？（自动推进是否构成"自动调度"需新增治理？）
3. 抢占决策执行链（第 3 节五步）的顺序与 fail-closed 边界是否充分？在途轮"不中断"与"先交接"是否有竞态？
4. 交接包必含项是否足以支撑 SUSPENDED 无损恢复？漏了什么？
5. 是否有更简单的机制达到同样语义（如不新增 WAITING 状态，用 READY+dispatched_at 排序）？

## 四、输出格式
`[R1 PASS]` 或 `[R1 FAIL/REWORK + 逐条问题编号]`，每条给"问题—依据—建议修法"。仅方案复审，不涉及代码；被测基线 a74f027。
