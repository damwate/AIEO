# Phase 1 模块级审查交接包（T-P1-901 第 5 轮，2026-11-13）

**用途：** 供全新、空白 GPT 审查会话使用。**不依赖任何旧会话记忆。**
**审查历史：** 第 1 轮（7093458）BLOCKED：F-001 → 已整改。第 2 轮（040571e）BLOCKED：F-101 → 已整改。第 3 轮（c0226ee）REWORK：F-201 → 已整改。第 4 轮（e3e5fab）BLOCKED：F-301（MAJOR，blob 复核证据未随 commit 提交致 GitHub 404；同轮 F-201 整改、manifest/核验报告数据、M1/M4 抽查均确认无 MAJOR 缺陷）→ 已整改。
**范围：** M1 平台基座 + M2 GPT 控制器（含 F-001/F-101/F-201 返工）+ M4 Git Worker 的**模块级**审查。M3 已完成并验收（49/49 退出码 0）但**本轮仍不在审查范围**；四模块集成验收另行安排。

## 1. 仓库与基线【事实】

- 仓库：`damwate/AIEO`（公开 GitHub）
- 分支：`fix/AIEO-PHASE0-REVIEW-R10`
- **审查对象 commit（reviewed_commit = input_material_commit）：本交接包所在 commit，完整 40 位 SHA 以派单消息为准；回写时必须逐字符复制全部 40 位（第 2 轮曾截断为 39 位）**
- 前序 commit：`e3e5fabcc1fab38248c066ebe00c08ceaa6b0c68`（第 4 轮）、`040571efa85d45389d0d06884b6cb01e0b45d11d`（第 2 轮）、`7093458fa82228329264d81489fec98506eee7e0`（第 1 轮）；第 3 轮对象 commit 以 `phase0/logs/dispatch-2026-11-12T17-55-10/reply.txt` 中 reviewed_commit 为准
- 第 1 轮回复证据：`phase0/logs/dispatch-2026-11-12T17-11-35/reply.txt`；第 2 轮：`phase0/logs/dispatch-2026-11-12T17-34-39/reply.txt`；第 3 轮：`phase0/logs/dispatch-2026-11-12T17-55-10/reply.txt`；第 4 轮：`phase0/logs/dispatch-2026-11-12T18-08-58/reply.txt`（F-301 原文所在，均已登记 M1）
- main 未合并任何 Phase 0/Phase 1 分支。

## 2. 审查材料与绑定值【以派单消息 SHA 为准实读】

- 输入材料 manifest：`phase1/manifests/T-P1-901-input-manifest.json`（**112 个文件**，仓库根相对路径；含第 3/4 轮审查回复证据与 F-201 返工测试日志；核验报告与 r4 blob 复核证据**不入 manifest**——报告引用 manifest SHA 会自引用，复核证据受 amend 时序约束，二者均经本 commit 提交、按下述路径实读）
- manifest SHA-256：**以派单消息为准**
- 契约版本：`1.0`；工程标准：`platform-contract-v1.0`
- 任务 ID：`T-P1-901`；执行 ID：`EXEC-905`（本轮）；关联 ID：`CORR-905`
- 审查者 ID：`GPT-REVIEWER`
- knowledge_base_commit：本交接包所在 commit（`docs/AI-DEV-LESSONS.md` 含 DEV-20261113-001/002/003、L-013、CAP-20261112-001、CAP-20261113-001）

## 3. 材料核验协议 v2【按双方真实执行能力分工，可执行、全量、非降低标准】

**环境事实（已记 CAP-20261113-001）：** 审查方为网页会话，无本地命令执行、无 SHA-256 计算、无 GitHub API 调用能力（第 1/2 轮 constraint 如实申报）；但可稳定读取 raw.githubusercontent.com 内容。开发方主会话具备完整本地执行环境。

分工如下：

1. **开发方（已执行，全量）：** 主会话对 manifest 全部 106 文件执行机械核验——① 每文件磁盘字节 SHA-256 与 manifest `artifact_sha256` 逐项比对（106/106）；② commit 后对 `git cat-file blob` 重新全量比对（106/106，证明 manifest 描述的即为本 commit 内容）；③ `git ls-tree -r` 核对 106 路径全部存在于本 commit。**报告：`phase1/manifests/T-P1-901-verification-report.json`**（含命令、退出码、逐文件结果）；blob 复核证据 `phase0/logs/blob-recheck-T-P1-901-r4/`。
   **F-301 整改（amend 机制说明）：** blob 复核必须在 commit 之后执行，其证据无法与被复核内容同一次生成。流程为：先产生含全部审查材料与 manifest 的 commit C1，对 C1 执行 blob 复核（证据内 `commit_sha256_anchored` 字段锚定 C1），再以 amend 方式将证据目录并入生成最终送审 commit C2——amend **仅新增证据目录**，manifest 所列全部文件在 C1 与 C2 中的 Git blob 逐字节相同（Git 内容寻址保证，可用 GitHub compare C1...C2 验证 diff 仅含证据目录新增）。证据锚定的具体 SHA 以 `phase0/logs/blob-recheck-T-P1-901-r4/recheck-result.json` 内 `commit_sha256_anchored` 与派单消息为准。
2. **审查方（本轮请你执行）：** ① 实读上述核验报告，核对覆盖面（106/106、mismatch 为空、退出码）；② 按你的判断**抽样直接读取** raw.githubusercontent.com 上本 commit 的材料文件，核对其内容与申报一致（前几轮你已实读超 10 文件，本轮继续）；③ 抽查核验报告所列哈希与你的实读是否自洽——若发现报告与实读不符（如文件内容与哈希所述状态矛盾），按 MAJOR+ 处理。
3. **诚实条款：** 若报告缺失、覆盖不足或内容与实读矛盾→判 BLOCKED 并写入 findings；你无需也无法重复机械哈希计算，这部分由报告与 Git commit 锚定共同保证。

## 4. 被审查交付【事实，材料均在 manifest 中】

### M1 平台基座（app/platform/ + tests/platform/ + app/frontend/）

- FastAPI + SQLite：/api/v1/ 端点（projects/repositories/batches/agents/tasks/messages/reports/artifacts/commits/audit/board/approvals/auth）
- 14 状态机唯一属主，仅事件驱动；ACCEPTED 需 PASS 评审 + EXECUTED_PASS 测试证据（同事务）；依赖未全 ACCEPTED 时 READY/DISPATCH 拒绝；event_id 幂等
- 消息 Inbox/Outbox：message_id 去重、claim→Outbox 同一 BEGIN IMMEDIATE 事务、ACK 幂等、sweep 重试（30s×2^n）/Dead Letter、仅人类可 requeue
- C3 错误码统一结构；C4 NDJSON（audit 同事务）；C6 AIEO_ 前缀；C7 Argon2id + Session Cookie + CSRF + 服务令牌
- Vue3 最小三视图，vite build 成功
- 测试证据：pytest **35 passed** 退出码 0；日志 `phase1/logs/m1-platform-20261113/`。第 1/2/3 轮 M1 均无代码变更。

### M2 GPT 控制器（app/gpt_controller/）——第 3 轮含 F-101 返工

- 13 步派单管线；R3+ 发送双验严格时序；pre-send 生成门 fail-closed；300s 生成超时；出站 ≤1200 UTF-8 字节完整计量；GitPointer 出站
- 入站：user unit 起点区间采集、相邻窗口重叠、两次完整读取（≥3000ms）、raw 先落盘回读 SHA-256、集合变化无独立序列→INBOUND_WINDOW_COMPLETENESS_UNPROVEN
- 会话上限轮换；OS 句柄锁（DEC-001）；三 ID 强制
- **F-001 返工（第 2 轮已审，见 commit 040571e）**：DEC-017 多 assistant unit 门禁三层——`selectInboundReply` 默认 `maxAssistantUnits=1` fail-closed → `readReplySnapshot` 透传 → dispatch 快照收敛点无条件复核。
- **F-101 返工（本轮变更核心，涉及 3 文件：inbound_reply.mjs / dispatch.mjs / 两测试文件）**：
  1. 收敛复核抽为**独立导出函数 `assertInboundExtensionGate(snapshot)`**（inbound_reply.mjs），dispatch 收敛点改调它；可被直接单测。
  2. **畸形快照 fail-closed**：unit_count 缺失/undefined/非整数/负数/NaN/字符串、unit_keys 缺失/非数组/与 unit_count 不一致 → `INBOUND_REPLY_SNAPSHOT_MALFORMED`（修复原 `unit_count > 1` 判断对 undefined/负数静默放行的缺口）。
  3. **测试注入点**：`runDispatch` 的 `deps.readReplySnapshot` 仅供测试注入（模拟上游门禁被放宽或失效），生产路径不传、恒用真实 reader；`runDispatchLocked` 内部经 `replyReader` 参数传递。
  4. 测试 +3：最终防线纯函数（单 unit 放行/多 unit 拦截/9 种畸形快照全部 fail-closed）；注入式全管线（上游放宽 → 收敛点仍 `INBOUND_MULTI_UNIT_EXTENSION_GATE_BLOCKED` 且无 result.json）；矛盾快照骗过稳定性比较 → 最终防线 `INBOUND_REPLY_SNAPSHOT_MALFORMED`。
- **F-201 返工（本轮变更核心，涉及 3 文件：inbound_reply.mjs / 两测试文件）**：
  1. `assertInboundExtensionGate` 边界收紧：unit_count 合法范围为**正整数**（`count < 1` 一律 `INBOUND_REPLY_SNAPSHOT_MALFORMED`——回复必含 ≥1 个 assistant unit，堵住 unit_count=0/空 keys 绕过）；unit_keys 元素全部**非空字符串**且**无重复**（堵住 [null]/[""]/重复 key 绕过）。
  2. 纯函数负例 9→**14 类**（新增：零数量、null 元素、空字符串、重复 key、非字符串元素）。
  3. 注入式全管线 +2：零 unit 快照、非法 key 快照骗过稳定性比较后均被最终防线以 `INBOUND_REPLY_SNAPSHOT_MALFORMED` 拒绝，且无 result.json（不产生成功日志/artifact/M1 登记）。
- 测试证据：node --test **58/58 通过** 退出码 0（56 + 2 门禁边界新增）；F-201 返工日志 `phase1/logs/m2-gpt-controller-20261113/f201-rework/`；F-101 返工日志 `…/f101-rework/`；F-001 返工日志 `…/f001-rework/`；首轮历史日志 `…/`（留证）。

### M4 Git Worker（app/git_worker/）

- 对外接口（module-boundaries §2 M4 草案签名）：`repo_status`/`record_baseline`/`create_branch`/`commit_and_collect`/`check_clean`/`read_diff`；增强项均为可选 kwarg
- Git 白名单机制：所有 git 调用必经 `_run_git_at`→`_validate_git_argv`，子命令限 9 个（status/rev-parse/symbolic-ref/show-ref/switch/add/commit/diff/merge-base）；argv 逐 token 校验；`shell=False`；子进程环境剥离 `GIT_DIR`/`GIT_WORK_TREE` 等
- main 保护：main/master 上 commit → `AUTH-0002 PROTECTED_BRANCH_COMMIT_FORBIDDEN`；`create_branch(repo,"main")` 拒绝；`merge()` 恒 fail-closed
- C3 错误统一 Schema；`RES-0001/0002`、`GIT-0001/0002/0003`、`AUTH-0002`、`REQ-0001`、`SYS-0001/0003`、`ART-0002`
- MINOR-005 配置化：`git_path` 参数 > `AIEO_GIT_PATH` > `"git"`；日志目录 `log_dir` > `AIEO_LOG_DIR` > 默认 `runtime/logs/git_worker`
- M1 对接：`M1Client` Protocol 纯注入、零 M1 import；commit 成功后写 diff 工件（SHA-256）→ 登记 artifact/commit/audit；M1 失败不回滚 git，evidence 标注 `m1_registration.status=FAILED` 可幂等重试
- 测试证据：pytest **24 passed** 退出码 0（真实 `git init`/`git commit` 于系统 temp 构造，未触碰主仓库）；日志 `app/git_worker/test-logs/`（final 为终版，run-1/2 为含真实失败首轮，留证）。第 3 轮无代码变更。

## 5. 申报的未实现边界【如实申报，请核对是否与代码一致，而非当作自动缺陷】

1. 真实 chatgpt.com 收发、私有仓库 GitPointer 实拉取未做（DEC-017 扩展门禁）；M2 测试全部基于本地 fixture/仿真 DOM
2. M1 投递为 sweep 模拟（PENDING→SENT），无真实 broker/HTTP push 与接收端自动 ACK（DEC-017 扩展门禁）
3. M2 的 M1 登记为最小本地适配器（本地 registry + OS 锁），非完整平台 M1 服务
4. M1 附加端点（POST /agents、/commits、messages cancel/sweep）为契约端点表未列但语义必需项
5. BLOCKED 无前进工作边（走 REWORK→ARCH_REVIEW 重规划）；approvals 仅登记无独立流转引擎
6. 锁仅约束接入锁机制的自动化操作（DEC-001 人工边界约定）
7. M4：M1 真实落库由 M1Client 接口背后实现；Git 集成锁未接入（同仓库单任务并发策略兜底）；git push 不在白名单；run_tests 为可选门禁不强制；C4 日志暂无 trace_id（correlation_id 已贯穿）；契约机器 Schema 校验为模块内联断言，待统一挂接

## 6. 审查要求

1. 核对代码与上述申报一致；发现申报不实（宣称已实现但无代码/无证据）按 MAJOR 及以上处理
2. 核对 platform-contract-v1.0.md C1-C8 的模块级落点、module-boundaries.md §2 职责边界、DEC-017 约束（尤其 fail-closed 路径）；F-201 边界收紧已由第 4 轮确认通过，**本轮重点复核 F-301 整改**：r4 blob 复核证据在仓可读、覆盖 106/106、与 manifest/报告/派单消息自洽、amend 关系（C1/C2 diff 仅证据目录）成立
3. 先按 §3 核验协议 v2 执行审查方侧核验；报告缺失/覆盖不足/与实读矛盾→BLOCKED
4. **本审查为模块级，不构成 Phase 1 集成验收或 BLOCKED-1 扩展场景解除**

## 7. 输出格式（只输出 JSON，直接输出 JSON 文本）

```json
{"result":"PASS|REWORK|BLOCKED",
 "reviewed_commit":"<本交接包所在 commit 完整 40 位 SHA，取派单消息，逐字符复制>",
 "findings":[{"finding_id":"F-401","severity":"BLOCKER|CRITICAL|MAJOR|MINOR|INFO","file":"路径","description":"问题","recommendation":"修复建议"}],
 "constraints":["必须写入后续流程的约束"],
 "summary":"结论摘要"}
```

findings 超过 8 条时仅列 severity≥MAJOR 的前 8 条，其余在 summary 中计数说明。finding_id 从 F-401 起编（避免与 F-001/F-101/F-201/F-301 混淆）。reviewed_commit 必须为完整 40 位十六进制字符（逐字符复制）。

## 8. 会话管理约束【决策】

- 出现"上下文窗口已达上限"或长期无有效反馈时，不在旧会话重试；由主会话重新生成交接包并开全新空白会话
- 本消息自包含；新会话先实读 GitHub 指定 commit 材料再下结论，不依赖聊天记忆
- 材料不可读、证据不足→BLOCKED，不猜测、不声称通过
