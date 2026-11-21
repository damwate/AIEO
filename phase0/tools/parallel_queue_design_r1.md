# Instance/Conversation Queue Service 设计八件 R1（DEC-134 立项交付，供架构审查）

- **依据：** DEC-134（八件清单+最终原则）+ DEC-136（设计继续推进）+ L-023 三层任务管理机制 + 用户多任务开发协议（ops §五）。
- **范围声明（照裁定）：** 本稿=设计交付，不含编码、不含清理执行、不含 N=2 重启授权变更。

## ① 架构设计

**组件（四个职责域，照最终原则"实例池管窗口、队列管任务、C9 管门禁、C6 管证据"）：**
- **TaskQueue（队列）**：FIFO+优先级任务挂起区；任务领取语义=用户多任务开发协议（READY→被空闲 worker CLAIM→EXECUTING→完成后回中控验收→NEXT-CLAIM）；L-022 非阻塞（BLOCKED 任务不阻塞其他领取）。
- **InstancePool（实例池）**：N 个已验证实例（profile/端口/锁/登录态四元组）；每实例互斥串行；池容量=已过登录态验收的实例数（当前 2，N=3 为阶段3 扩容目标）。
- **Worker 桥**：两种形态——A 形态（现役）=中控会话+子agent（每任务一个子agent 或 SendMessage 续用）；B 形态（编码后）=Queue 进程直接驱动 gpt_dispatch 子进程。A→B 渐进（§⑦）。
- **门禁与证据**：C9 启动门为每次派发的前置阻塞调用；C6 采集器挂接执行记录。

**运行阶段（三段，§⑦ 细化）：** Phase A 观测（现役 bash 编排+人工中控，只加采集器）→ Phase B 轻量骨架（队列+池核心上线，与 bash 并行影子运行）→ Phase C 接管（Queue 为权威，bash 编排退役；任意阶段边界可回滚）。

## ② 三类核心数据契约

```jsonc
// Task（队列任务；一份任务清单=用户功能拆解，经 ChatGPT 方案评审）
{
  "task_id": "T-<seq>", "title": "", "kind": "code|review|doc",
  "payload_ref": "<要求文件路径>", "branch": "task/<id>",   // 代码任务独立分支
  "priority": 0, "deps": [],                                // deps=依赖任务 id（未完成则不派发）
  "status": "READY|CLAIMED|EXECUTING|REPORTED|VERIFIED|FAILED|BLOCKED|DEFERRED",
  "claimed_by": null, "attempts": 0                         // FAIL 保留登记；重验=单独授权
}
// Instance（实例池成员；四元组+健康）
{
  "instance_id": "agent-a", "profile_dir": "", "debug_port": 0,
  "lock_path": "", "state": "IDLE|BUSY|ERROR|OFFLINE",
  "login_validated": true, "last_health_check": "<ISO>", "consecutive_fail": 0
}
// Execution（一次派单执行；与 dispatch 归档一一对应）
{
  "task_id": "", "instance_id": "", "dispatch_dir": "", "receipt_path": "",
  "send_state": "NOT_SENT|SEND_ATTEMPTED|SEND_CONFIRMED", "reply_sha256": "",
  "started_at": "", "finished_at": "", "verdict": "PASS|FAIL|BLOCKED|NOT_OBSERVED",
  "c6_metrics": { "queue_wait_ms": 0, "exec_ms": 0 }
}
```

## ③ 任务状态机与异常转换

```
READY → CLAIMED(实例空闲+deps满足+C9门 ALLOWED) → EXECUTING(派单中)
  → SENT_CONFIRMED → COLLECTING → REPORTED → [ChatGPT 验收] → VERIFIED → 队列领取下一个
异常转换（全部 fail-closed，不自动重发）：
  EXECUTING 中锁冲突 → 有界重试(60s) → 仍冲突 → TASK 复位 READY（换实例）或 BLOCKED
  C9 门 BLOCKED → 任务 PAUSED（全局），实例转 IDLE；归一化后自动恢复派发
  ACCOUNT_BACKOFF_TRIGGERED / ACCOUNT_VERIFICATION_REQUIRED → 全实例 PAUSED-HUMAN，人工恢复后重新过门
  GENERATION_TIMEOUT / 采集 fail-closed → 现场保留 → L-018 补采 → 补采成功=REPORTED
  验收 FAIL → 状态 VERIFIED-FAIL（历史保留）+ 整改任务入队（L-022 不阻塞其他领取）
```

## ④ C9、C6 接口关系

- **C9 = 派发前置阻塞调用**：`accountGateCheck` 在 CLAIM 之后、任何浏览器操作之前；BACKOFF→任务保持 CLAIMED-PAUSED（不释放实例锁=实例保留，或释放转 IDLE——采用**释放转 IDLE**，退避期实例可干等）；429 观察命中→写回退避+全池 PAUSED。
- **C6 = 执行记录发射器**：每次 Execution 落盘时同步产出六类指标字段（吞吐/配额/429/隔离/资源/判定），观察期聚合器按日汇总——不新增采集通道，只结构化既有 dispatch 归档。

## ⑤ 人机验证识别及人工处置方案（DEC-134 四态）

- 判定器（观察点内）：结构化组合（异常页形态=无 composer 无单元）+特征（Turnstile/cf-challenge 元素、标题/跳转/关键元素缺失）→ 四态输出：NORMAL / VERIFICATION_SUSPECTED（暂停本任务，任务 PARKED） / ACCOUNT_VERIFICATION_REQUIRED（fail-closed+全池 PAUSED-HUMAN）/ UNKNOWN_BLOCK_PAGE（暂停+人工检查）。
- 处置：禁自动点击/破解/绕过/刷新/重克隆；人工完成验证→人工确认恢复→任务重新过 C9 门→继续。
- 全部事件入 C6-C 类字段。

## ⑥ 实例池容量、并发限制和克隆约束

- 容量=登录态已验收实例数；**profile 生命周期硬不变量：目录只增不删（删除=DEC-010 另批）；清理仅进程级；优雅 close 先于强杀**（用户追问查证固化）。
- 克隆=黄金源规程（DEC-130：全关前置/整目录镜像/逐实例登录态人工验收）；新实例入池前必须过登录态验收+健康检查。
- 并发限制：池内实例互斥串行；跨实例并行=N；扩容逐级（DEC-130：N=2→观察→N=3→观察→裁定），扩容入池须审查方批准。
- 侧栏账号级共享（C4 实测）：会话定位必须 CONV_UUID 精确导航，禁"最新一条"启发式。

## ⑦ Bash 迁移方案及回滚方案

- **Phase A（观测）**：现役 bash 编排不变；Queue 以影子模式记录（只采集不派发）→ 产出与人工编排的对账基线。
- **Phase B（轻量骨架）**：Queue 获得 CLAIM/派发能力，与人工中控**双轨影子**——同一任务仅一方执行（互斥以任务 id 去重）；差异逐轮对账。
- **Phase C（接管）**：Queue 为唯一派发权威；bash 编排退役保留脚本。
- **回滚**：任一阶段边界可回退上一阶段——状态全部落盘（TaskQueue/Instance/Execution 三文件），无隐藏内存态；回滚=停 Queue 进程+人工中控按三文件账本续跑。
- **迁移纪律**：不跳阶段；每阶段验收（⑧）通过才进下一阶段；Phase C 需审查方批准。

## ⑧ 分阶段验收标准

| 阶段 | 验收标准（全 PASS 才进下一阶段） |
|---|---|
| A 观测 | 采集器零侵入（现役编排行为零变化）；C6 六类字段完整落盘；与人工记录对账一致 |
| B 骨架 | 影子双轨零任务丢失/零重复派发；互斥与 C1-R2 同强；C9 门先于 100% 派发；回滚演练一次成功 |
| C 接管 | 连续 ≥20 任务队列自主运行零人工派发干预；异常转换表逐条演练（锁冲突/退避/人机验证/采集失败各 ≥1 次）；回滚演练通过；审查方终验 |
| 全局红线 | 编码前设计过审（本轮）；C9/C6/实例域已验收语义零修改（Queue 只编排不重写门禁） |
