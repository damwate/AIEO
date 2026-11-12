# Phase 1 模块级审查交接包（T-P1-901 第 2 轮，2026-11-13）

**用途：** 供全新、空白 GPT 审查会话使用。**不依赖任何旧会话记忆。**
**背景：** 第 1 轮审查（commit 7093458，范围 M1+M2）结论 **BLOCKED**，唯一 finding F-001（MAJOR）：DEC-017 多 assistant unit 扩展场景缺运行时门禁。本次为 **F-001 整改后的第 2 轮复审**，范围扩展至已验收的 M4。
**范围：** M1 平台基座 + M2 GPT 控制器（含 F-001 返工）+ M4 Git Worker 的**模块级**审查。M3 仍在开发、未提交，**不在本次范围**；四模块集成验收另行安排。

## 1. 仓库与基线【事实】

- 仓库：`damwate/AIEO`（公开 GitHub）
- 分支：`fix/AIEO-PHASE0-REVIEW-R10`
- **审查对象 commit（reviewed_commit = input_material_commit）：本交接包所在 commit，完整 40 位 SHA 以派单消息为准**
- 前序 commit：`7093458fa82228329264d81489fec98506eee7e0`（第 1 轮被审对象，本次提交的父提交）
- 第 1 轮回复证据：`phase0/logs/dispatch-2026-11-12T17-11-35/reply.txt`（3610 字节，SHA-256 `4eaa8fd2fb482ef3d9682cf9bd369bc39d236a8871295e5d9607c89e7a3236db`，已登记 M1）
- main 未合并任何 Phase 0/Phase 1 分支。

## 2. 审查材料与绑定值【以派单消息 SHA 为准实读】

- 输入材料 manifest：`phase1/manifests/T-P1-901-input-manifest.json`（**90 个文件**，仓库根相对路径）
- manifest SHA-256：`be1ad77def9c9e32a34e3d6e5933a53436dad77c3be7a7fcc9a4d5a4d25639b4`
- 契约版本：`1.0`；工程标准：`platform-contract-v1.0`
- 任务 ID：`T-P1-901`；执行 ID：`EXEC-901`；关联 ID：`CORR-901`
- 审查者 ID：`GPT-REVIEWER`
- knowledge_base_commit：本交接包所在 commit（`docs/AI-DEV-LESSONS.md` 已含 DEV-20261113-002 与 L-013）

## 3. 材料核验协议【第 1 轮 constraint 的回应，可执行，非降低标准】

第 1 轮审查如实申报"无法独立核验 81 文件全部哈希"并判 BLOCKED。本轮明确**可机械执行的核验协议**：

1. **清单完整性**：以 reviewed_commit 为锚，用 GitHub tree API（`GET /repos/damwate/AIEO/git/trees/<reviewed_commit>?recursive=1`）或 `git ls-tree -r` 核对 manifest 所列 90 个路径**全部存在**于该 commit。
2. **清单内容锚定**：派单消息与本文件均给出 manifest 自身 SHA-256；下载到的 manifest 字节必须与之匹配，防止清单被调换。
3. **抽样核验**：抽样**不少于 10 个文件**（M1/M2/M4/contracts/logs 每组至少 1 个），用 GitHub contents API（`GET /repos/damwate/AIEO/contents/<path>?ref=<reviewed_commit>`，返回 base64）解码后计算 SHA-256 与 manifest `artifact_sha256` 比对；哈希基准为仓库 blob 字节。抽样不足或比对不符时如实写入 findings/constraints。
4. **自由加严**：以上为下限，审查者可自行扩大抽样至全量；证据不足仍然判 BLOCKED，不声称已审查。

## 4. 被审查交付【事实，材料均在 manifest 中】

### M1 平台基座（app/platform/ + tests/platform/ + app/frontend/）

- FastAPI + SQLite：/api/v1/ 端点（projects/repositories/batches/agents/tasks/messages/reports/artifacts/commits/audit/board/approvals/auth）
- 14 状态机唯一属主，仅事件驱动；ACCEPTED 需 PASS 评审 + EXECUTED_PASS 测试证据（同事务）；依赖未全 ACCEPTED 时 READY/DISPATCH 拒绝；event_id 幂等
- 消息 Inbox/Outbox：message_id 去重、claim→Outbox 同一 BEGIN IMMEDIATE 事务、ACK 幂等、sweep 重试（30s×2^n）/Dead Letter、仅人类可 requeue
- C3 错误码统一结构；C4 NDJSON（audit 同事务）；C6 AIEO_ 前缀；C7 Argon2id + Session Cookie + CSRF + 服务令牌
- Vue3 最小三视图，vite build 成功
- 测试证据：pytest **35 passed** 退出码 0；日志 `phase1/logs/m1-platform-20261113/`（pytest-20261113-003232.log 为最终全绿轮；其余为含真实失败的中间轮，留证）。本轮 M1 无代码变更。

### M2 GPT 控制器（app/gpt_controller/）——本轮含 F-001 返工

- 13 步派单管线（计量→锁→登记→DOM 契约→上限检测→门禁+双验→生成等待→两次读取→artifact→URL→M1→completion_checks）
- R3+ 发送双验严格时序；pre-send 生成门 fail-closed；300s 生成超时；出站 ≤1200 UTF-8 字节完整计量；GitPointer 出站
- 入站：user unit 起点区间采集、相邻窗口重叠、两次完整读取（≥3000ms）、raw 先落盘回读 SHA-256、集合变化无独立序列→INBOUND_WINDOW_COMPLETENESS_UNPROVEN
- 会话上限轮换；OS 句柄锁（DEC-001）；三 ID 强制
- **F-001 返工（本轮变更核心，涉及 5 文件）**：DEC-017 多 assistant unit 运行时门禁三层实现——
  1. `src/inbound_reply.mjs`：`selectInboundReply` 默认 `maxAssistantUnits=1`，超限抛 `INBOUND_MULTI_UNIT_EXTENSION_GATE_BLOCKED`（details 含 unit_count/max_assistant_units/decision:"DEC-017"/remediation）；纯函数测试可显式放宽。
  2. `src/dom_view.mjs`：`readReplySnapshot` 透传 `maxAssistantUnits`（默认仍 1）。
  3. `src/dispatch.mjs`：快照收敛点**无条件复核** `unit_count>1` 即抛同码（真实路径唯一强制点，纵深防御）；错误码经 `^INBOUND_` 前缀映射 C3 PROVIDER-0004。
- 测试证据：node --test **53/53 通过** 退出码 0（51 项原有 + 2 项门禁新增）；返工轮日志 `phase1/logs/m2-gpt-controller-20261113/f001-rework/node-test-f001-rework.log`；首轮历史日志 `phase1/logs/m2-gpt-controller-20261113/`（all-20261113-final.log 等，留证）。

### M4 Git Worker（app/git_worker/）——本轮新增范围

- 对外接口（module-boundaries §2 M4 草案签名）：`repo_status`/`record_baseline`/`create_branch`/`commit_and_collect`/`check_clean`/`read_diff`；增强项（base_commit、files_scope、test_command、context）均为可选 kwarg
- Git 白名单机制：所有 git 调用必经 `_run_git_at`→`_validate_git_argv`，子命令限 status/rev-parse/symbolic-ref/show-ref/switch/add/commit/diff/merge-base 共 9 个；argv 逐 token 校验；`shell=False`；子进程环境剥离 `GIT_DIR`/`GIT_WORK_TREE` 等
- main 保护：main/master 上 commit → `AUTH-0002 PROTECTED_BRANCH_COMMIT_FORBIDDEN`；`create_branch(repo,"main")` 拒绝；`merge()` 恒 fail-closed（Phase 1 无推送/合并能力）
- C3 错误统一 Schema（code/message/details/retryable/correlation_id）；`RES-0001/0002`、`GIT-0001/0002/0003`、`AUTH-0002`、`REQ-0001`、`SYS-0001/0003`、`ART-0002`
- MINOR-005 配置化：`git_path` 参数 > `AIEO_GIT_PATH` > `"git"`；日志目录 `log_dir` > `AIEO_LOG_DIR` > 默认 `runtime/logs/git_worker`（按日期轮转+30 天保留）
- M1 对接：`M1Client` Protocol 纯注入、零 M1 import；commit 成功后写 diff 工件（SHA-256）→ 登记 artifact/commit/audit；M1 失败**不回滚 git**，evidence 标注 `m1_registration.status=FAILED` 可幂等重试
- 测试证据：pytest **24 passed** 退出码 0（真实 `git init`/`git commit` 于系统 temp 构造，未触碰主仓库）；日志 `app/git_worker/test-logs/`（pytest-run-final.log 为终版；pytest-run-1/2.log 为含真实失败的首轮，留证）

## 5. 申报的未实现边界【如实申报，请核对是否与代码一致，而非当作自动缺陷】

1. 真实 chatgpt.com 收发、私有仓库 GitPointer 实拉取未做（DEC-017 扩展门禁）；M2 测试全部基于本地 fixture/仿真 DOM
2. M1 投递为 sweep 模拟（PENDING→SENT），无真实 broker/HTTP push 与接收端自动 ACK（DEC-017 扩展门禁）
3. M2 的 M1 登记为最小本地适配器（本地 registry + OS 锁），非完整平台 M1 服务
4. M1 附加端点（POST /agents、/commits、messages cancel/sweep）为契约端点表未列但语义必需项
5. BLOCKED 无前进工作边（走 REWORK→ARCH_REVIEW 重规划）；approvals 仅登记无独立流转引擎
6. 锁仅约束接入锁机制的自动化操作（DEC-001 人工边界约定）
7. M4：M1 真实落库由 M1Client 接口背后实现（本模块零 M1 import）；Git 集成锁未接入（同仓库单任务并发策略兜底）；git push 不在白名单；run_tests 为可选门禁不强制；C4 日志暂无 trace_id（correlation_id 已贯穿）；契约机器 Schema 校验为模块内联断言，待统一挂接

## 6. 审查要求

1. 核对代码与上述申报一致；发现申报不实（宣称已实现但无代码/无证据）按 MAJOR 及以上处理
2. 核对 platform-contract-v1.0.md C1-C8 的模块级落点、module-boundaries.md §2 职责边界、DEC-017 约束（尤其 fail-closed 路径）；**重点复核 F-001 三层门禁实现与测试覆盖是否闭合**（默认收紧、测试显式放宽、真实路径无条件收敛复核）
3. 核对测试日志与测试代码一致（用例数、退出码、断言覆盖）
4. 先按 §3 核验协议执行材料核验；证据不足或无法读取材料时判 BLOCKED，不声称已审查
5. **本审查为模块级，不构成 Phase 1 集成验收或 BLOCKED-1 扩展场景解除**

## 7. 输出格式（只输出 JSON，直接输出 JSON 文本）

```json
{"result":"PASS|REWORK|BLOCKED",
 "reviewed_commit":"<本交接包所在 commit 完整 40 位 SHA，取派单消息>",
 "findings":[{"finding_id":"F-001","severity":"BLOCKER|CRITICAL|MAJOR|MINOR|INFO","file":"路径","description":"问题","recommendation":"修复建议"}],
 "constraints":["必须写入后续流程的约束"],
 "summary":"结论摘要"}
```

findings 超过 8 条时仅列 severity≥MAJOR 的前 8 条，其余在 summary 中计数说明。finding_id 从 F-101 起编（避免与第 1 轮 F-001 混淆）。

## 8. 会话管理约束【决策】

- 出现"上下文窗口已达上限"或长期无有效反馈时，不在旧会话重试；由主会话重新生成交接包并开全新空白会话
- 本消息自包含；新会话先实读 GitHub 指定 commit 材料再下结论，不依赖聊天记忆
- 材料不可读、证据不足→BLOCKED，不猜测、不声称通过
