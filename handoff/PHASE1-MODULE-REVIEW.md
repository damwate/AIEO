# Phase 1 模块级审查交接包（T-P1-901，2026-11-13）

**用途：** 供全新、空白 GPT 审查会话使用。**不依赖任何旧会话记忆。**
**范围：** M1 平台基座 + M2 GPT 控制器的**模块级**提前审查。M3/M4 仍在开发、未提交，**不在本次范围**；四模块集成验收另行安排。

## 1. 仓库与基线【事实】

- 仓库：`damwate/AIEO`（公开 GitHub）
- 分支：`fix/AIEO-PHASE0-REVIEW-R10`
- **审查对象 commit（reviewed_commit = input_material_commit）：本交接包所在 commit，完整 40 位 SHA 以派单消息为准**
- base_commit：`d580b5bc923db9e21600604ca2b7c1c3b4ac1856`（本次提交的父提交）
- main 未合并任何 Phase 0/Phase 1 分支。

## 2. 审查材料与绑定值【以派单消息 SHA 为准实读】

- 输入材料 manifest：`phase1/manifests/T-P1-901-input-manifest.json`（81 个文件，仓库根相对路径）
- manifest SHA-256：`ad056151181d4672b12bf020270bcb03fcd6e59c3622221e114c731d4132b00a`
- 契约版本：`1.0`；工程标准：`platform-contract-v1.0`
- 任务 ID：`T-P1-901`；执行 ID：`EXEC-901`；关联 ID：`CORR-901`
- 审查者 ID：`GPT-REVIEWER`
- knowledge_base_commit：`d580b5bc923db9e21600604ca2b7c1c3b4ac1856`（`docs/AI-DEV-LESSONS.md` v0.2 所在提交）

## 3. 被审查交付【事实，材料均在 manifest 中】

### M1 平台基座（app/platform/ + tests/platform/ + app/frontend/）

- FastAPI + SQLite：/api/v1/ 端点（projects/repositories/batches/agents/tasks/messages/reports/artifacts/commits/audit/board/approvals/auth）
- 14 状态机唯一属主，仅事件驱动；ACCEPTED 需 PASS 评审 + EXECUTED_PASS 测试证据（同事务）；依赖未全 ACCEPTED 时 READY/DISPATCH 拒绝；event_id 幂等
- 消息 Inbox/Outbox：message_id 去重、claim→Outbox 同一 BEGIN IMMEDIATE 事务、ACK 幂等、sweep 重试（30s×2^n）/Dead Letter、仅人类可 requeue
- C3 错误码统一结构；C4 NDJSON（audit 同事务）；C6 AIEO_ 前缀；C7 Argon2id + Session Cookie + CSRF + 服务令牌
- Vue3 最小三视图，vite build 成功
- 测试证据：pytest **35 passed** 退出码 0（含重启持久化、重复消息、非法转换、进度只按 ACCEPTED、审计）；日志 `phase1/logs/m1-platform-20261113/`（pytest-20261113-003232.log 为最终全绿轮；002402/002727 为含真实失败的中间轮，留证）

### M2 GPT 控制器（app/gpt_controller/）

- 13 步派单管线（计量→锁→登记→DOM 契约→上限检测→门禁+双验→生成等待→两次读取→artifact→URL→M1→completion_checks）
- R3+ 发送双验严格时序（stop 仅在 tail 后出现才计入）；pre-send 生成门 fail-closed；300s 生成超时
- 出站 ≤1200 UTF-8 字节完整计量，超限不发送/不截断/不分块；GitPointer 出站
- 入站：user unit 起点区间采集、相邻窗口重叠、两次完整读取（≥3000ms）、raw 先落盘回读 SHA-256、集合变化无独立序列→INBOUND_WINDOW_COMPLETENESS_UNPROVEN
- 会话上限轮换（不继承摘要开空白会话）；OS 句柄锁（DEC-001，无内容仲裁）；三 ID 强制
- 测试证据：node --test **51/51 通过** 退出码 0；日志 `phase1/logs/m2-gpt-controller-20261113/`（all-20261113-final.log 为终版合跑；其余为含失败过程的中间轮，留证）

## 4. 申报的未实现边界【如实申报，请核对是否与代码一致，而非当作自动缺陷】

1. 真实 chatgpt.com 收发、私有仓库 GitPointer 实拉取未做（DEC-017 扩展门禁）；M2 测试全部基于本地 fixture/仿真 DOM
2. M1 投递为 sweep 模拟（PENDING→SENT），无真实 broker/HTTP push 与接收端自动 ACK（DEC-017 扩展门禁）
3. M2 的 M1 登记为最小本地适配器（本地 registry + OS 锁），非完整平台 M1 服务
4. M1 附加端点（POST /agents、/commits、messages cancel/sweep）为契约端点表未列但语义必需项
5. BLOCKED 无前进工作边（走 REWORK→ARCH_REVIEW 重规划）；approvals 仅登记无独立流转引擎
6. 锁仅约束接入锁机制的自动化操作（DEC-001 人工边界约定）

## 5. 审查要求

1. 核对代码与上述申报一致；发现申报不实（宣称已实现但无代码/无证据）按 MAJOR 及以上处理
2. 核对 platform-contract-v1.0.md C1-C8 的模块级落点、module-boundaries.md §2 职责边界、DEC-017 约束（尤其 fail-closed 路径）
3. 核对测试日志与测试代码一致（用例数、退出码、断言覆盖申报的七类场景）
4. 证据不足或无法读取材料时判 BLOCKED，不声称已审查
5. **本审查为模块级，不构成 Phase 1 集成验收或 BLOCKED-1 扩展场景解除**

## 6. 输出格式（只输出 JSON，全文一处代码块可省，直接输出 JSON 文本）

```json
{"result":"PASS|REWORK|BLOCKED",
 "reviewed_commit":"<本交接包所在 commit 完整 40 位 SHA，取派单消息>",
 "findings":[{"finding_id":"F-001","severity":"BLOCKER|CRITICAL|MAJOR|MINOR|INFO","file":"路径","description":"问题","recommendation":"修复建议"}],
 "constraints":["必须写入后续流程的约束"],
 "summary":"结论摘要"}
```

findings 超过 8 条时仅列 severity≥MAJOR 的前 8 条，其余在 summary 中计数说明。

## 7. 会话管理约束【决策】

- 出现"上下文窗口已达上限"或长期无有效反馈时，不在旧会话重试；由主会话重新生成交接包并开全新空白会话
- 本消息自包含；新会话先实读 GitHub 指定 commit 材料再下结论，不依赖聊天记忆
- 材料不可读、证据不足→BLOCKED，不猜测、不声称通过
