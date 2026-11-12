# Phase 1 模块级审查交接包（T-P1-901 第 8 轮，2026-11-13）

**用途：** 供全新、空白 GPT 审查会话使用。**不依赖任何旧会话记忆。**
**审查历史：** 第 1 轮（7093458）BLOCKED：F-001 → 已整改。第 2 轮（040571e）BLOCKED：F-101 → 已整改。第 3 轮（c0226ee）REWORK：F-201 → 已整改。第 4 轮（e3e5fab）BLOCKED：F-301 → 已整改（amend 链）。第 5 轮（f73b054）BLOCKED：F-401~F-404 → 已整改（第 6 轮确认 F-401/F-404 关闭）。第 6 轮（7872e86）REWORK：F-501/F-502 → 已整改（第 7 轮确认两项整改成立）。第 7 轮（8780b9d）BLOCKED：F-601（MAJOR，核验报告 method 字段引用 r6 复核目录而非本轮 r7，证据链元数据不一致；审查方明确"并非认定 F-501/F-502 整改失败"，三模块实质审查无新 MAJOR，43/65/24 测试全过）→ 已整改（修正核验报告与证据链元数据，**本轮无模块代码变更**）。
**范围：** M1 平台基座（含 F-403/F-501 返工）+ M2 GPT 控制器（含 F-001/F-101/F-201/F-402/F-502 返工）+ M4 Git Worker 的**模块级**审查。M3 已完成并验收（49/49 退出码 0）但**本轮仍不在审查范围**；四模块集成验收另行安排。

## 1. 仓库与基线【事实】

- 仓库：`damwate/AIEO`（公开 GitHub）
- 分支：`fix/AIEO-PHASE0-REVIEW-R10`
- **审查对象 commit（reviewed_commit = input_material_commit）：本交接包所在 commit，完整 40 位 SHA 以派单消息为准；回写时必须逐字符复制全部 40 位（第 2 轮曾截断为 39 位）**
- 前序 commit：`8780b9d2da3b958a60e0244afb65556877ed878d`（第 7 轮）、`7872e869352d910862b4602ea12412d6ccb12839`（第 6 轮）；更早见历史证据。**审查锚定 tag：`review-anchor/T-P1-901-r6` 指向第 6 轮 amend 链的 C1'（3eb432e），第 6 轮已验证 compare tag...7872e86 仅差证据目录（F-404 整改成立）；`review-anchor/T-P1-901-r7` 指向第 7 轮 C1''（744dc9d）。本轮 C1''' 将以 `review-anchor/T-P1-901-r8` tag 锚定，SHA 见 blob 复核证据与派单消息**
- 第 1 轮回复证据：`phase0/logs/dispatch-2026-11-12T17-11-35/reply.txt`；第 2 轮：`phase0/logs/dispatch-2026-11-12T17-34-39/reply.txt`；第 3 轮：`phase0/logs/dispatch-2026-11-12T17-55-10/reply.txt`；第 4 轮：`phase0/logs/dispatch-2026-11-12T18-08-58/reply.txt`；第 5 轮：`phase0/logs/dispatch-2026-11-12T18-15-47/reply.txt`；第 6 轮：`phase0/logs/dispatch-2026-11-12T18-43-54/reply.txt`；第 7 轮：`phase0/logs/dispatch-2026-11-12T18-56-35/reply.txt`（F-601 原文所在，均已登记 M1）
- main 未合并任何 Phase 0/Phase 1 分支。

## 2. 审查材料与绑定值【以派单消息 SHA 为准实读】

- 输入材料 manifest：`phase1/manifests/T-P1-901-input-manifest.json`（**133 个文件**，仓库根相对路径；含第 3/4/5/6/7 轮审查回复证据与 F-201/F-402/F-403/F-501/F-502 返工测试日志（第 6/7 轮派单为非登记派单，无 m1-registration.json；第 7 轮已补入第 6 轮漏列的 F-403 新建测试文件 test_service_authorization.py）；核验报告与 blob 复核证据**不入 manifest**——报告引用 manifest SHA 会自引用，复核证据受 amend 时序约束，二者均经本 commit 提交、按下述路径实读）
- manifest SHA-256：**以派单消息为准**
- 契约版本：`1.0`；工程标准：`platform-contract-v1.0`
- 任务 ID：`T-P1-901`；执行 ID：`EXEC-908`（本轮）；关联 ID：`CORR-908`
- 审查者 ID：`GPT-REVIEWER`
- knowledge_base_commit：本交接包所在 commit（`docs/AI-DEV-LESSONS.md` 含 DEV-20261113-001~008、L-013、CAP-20261112-001、CAP-20261113-001）

## 3. 材料核验协议 v2【按双方真实执行能力分工，可执行、全量、非降低标准】

**环境事实（已记 CAP-20261113-001）：** 审查方为网页会话，无本地命令执行、无 SHA-256 计算、无 GitHub API 调用能力（第 1/2 轮 constraint 如实申报）；但可稳定读取 raw.githubusercontent.com 内容。开发方主会话具备完整本地执行环境。

分工如下：

1. **开发方（已执行，全量）：** 主会话对 manifest 全部 133 文件执行机械核验——① 每文件磁盘字节 SHA-256 与 manifest `artifact_sha256` 逐项比对（133/133）；② commit 后对 `git cat-file blob` 重新全量比对（133/133，证明 manifest 描述的即为本 commit 内容）；③ `git ls-tree -r` 核对 133 路径全部存在于本 commit。**报告：`phase1/manifests/T-P1-901-verification-report.json`**（含命令、退出码、逐文件结果）；blob 复核证据 `phase0/logs/blob-recheck-T-P1-901-r8/`。
   **F-301/F-404 整改（amend 机制说明）：** blob 复核必须在 commit 之后执行，其证据无法与被复核内容同一次生成。流程为：先产生含全部审查材料与 manifest 的 commit C1，对 C1 执行 blob 复核（证据内 `commit_sha256_anchored` 字段锚定 C1），再以 amend 方式将证据目录并入生成最终送审 commit C2——amend **仅新增证据目录**，manifest 所列全部文件在 C1 与 C2 中的 Git blob 逐字节相同（Git 内容寻址保证，可用 GitHub compare 验证 diff 仅含证据目录新增）。**C1 必须以 `review-anchor/T-P1-901-r<N>` 格式的 tag 锚定并推送**（第 5 轮 F-404：force push 后裸 SHA C1 不再被任何 ref 引用，GitHub compare 不可得）；第 6 轮验证实例：compare `review-anchor/T-P1-901-r6`...`7872e86` 仅差证据目录（第 6 轮审查已确认成立）。**F-601 整改：核验报告 method 字段现指向本轮 `blob-recheck-T-P1-901-r8/`，且明确锚定 commit 以该证据 `recheck-result.json` 的 `commit_sha256_anchored` 字段为准（报告不硬编码随 amend 变化的 SHA）**。本轮 C1''' 锚定 tag 为 `review-anchor/T-P1-901-r8`。
2. **审查方（本轮请你执行）：** ① 实读上述核验报告，核对覆盖面（133/133、mismatch 为空、退出码），并核对报告引用的复核证据目录与实际提交的 `blob-recheck-T-P1-901-r8/` 一致（F-601 整改点）；② 按你的判断**抽样直接读取** raw.githubusercontent.com 上本 commit 的材料文件，核对其内容与申报一致（前几轮你已实读超 10 文件，本轮继续）；③ 抽查核验报告所列哈希与你的实读是否自洽——若发现报告与实读不符（如文件内容与哈希所述状态矛盾），按 MAJOR+ 处理。
3. **诚实条款：** 若报告缺失、覆盖不足或内容与实读矛盾→判 BLOCKED 并写入 findings；你无需也无法重复机械哈希计算，这部分由报告与 Git commit 锚定共同保证。

## 4. 被审查交付【事实，材料均在 manifest 中】

### M1 平台基座（app/platform/ + tests/platform/ + app/frontend/）

- FastAPI + SQLite：/api/v1/ 端点（projects/repositories/batches/agents/tasks/messages/reports/artifacts/commits/audit/board/approvals/auth）
- 14 状态机唯一属主，仅事件驱动；ACCEPTED 需 PASS 评审 + EXECUTED_PASS 测试证据（同事务）；依赖未全 ACCEPTED 时 READY/DISPATCH 拒绝；event_id 幂等
- 消息 Inbox/Outbox：message_id 去重、claim→Outbox 同一 BEGIN IMMEDIATE 事务、ACK 幂等、sweep 重试（30s×2^n）/Dead Letter、仅人类可 requeue
- C3 错误码统一结构；C4 NDJSON（audit 同事务）；C6 AIEO_ 前缀；C7 Argon2id + Session Cookie + CSRF + 服务令牌
- Vue3 最小三视图，vite build 成功
- 测试证据：pytest **43 passed** 退出码 0；日志 `phase1/logs/m1-platform-20261113/`。第 1/2/3 轮 M1 无代码变更；第 6 轮含 F-403 返工（`…/f403-rework/`），第 7 轮含 F-501 返工（`…/f501-rework/`）。
- **F-501 返工（第 7 轮，涉及 2 文件：api.py / test_service_authorization.py）**：dead-letter 查询与 sweep 维护彻底分离——① 原实现 `GET /api/v1/messages/dead-letter`（白名单内）内部调用 `messaging.sweep()`（PENDING→SENT、重试推进、DEAD_LETTER 转换），service 身份借查询端点执行人类专属管理操作，绕过 POST /messages/sweep 的 403；② 修复后 dead-letter 端点**严格只读**（删除 sweep 调用、事务改 `db.reading()`），outbox 状态变更仅经 `POST /api/v1/messages/sweep`（白名单外，仅人类）；③ 新增测试 `test_service_token_dead_letter_query_is_read_only`：service token 调 GET dead-letter 前后断言 PENDING outbox 消息状态与 delivered_at 不变（而不仅是 HTTP 状态码）。
- **F-403 返工（第 6 轮，涉及 4 文件：security.py / api.py / test_service_authorization.py（新建）/ test_health_auth.py）**：C7 §8.6 服务身份权限白名单——① `security.py` 新增 `SERVICE_ALLOWED_ENDPOINTS` frozenset（**17 端点**：auth/session、tasks 读取+dependencies+events+claim、三类 report 提交与列表、artifacts 提交+读取、commits 提交+列表、messages 列表+dead-letter+ack、board）；② 新增 `authorize_principal(request, principal)`：service 身份命中白名单之外的一切端点一律 403 `AUTH-0002`（响应含 "whitelist" 提示），人类会话（kind=user）不受限；③ 接入点为认证收敛点 `api.py get_principal`（`enforce_csrf` 之后、返回 Principal 之前）——所有依赖 get_principal 的路由自动生效，不存在绕过路径；④ 默认拒绝 + route 模板匹配（FastAPI route.path，如 `/api/v1/tasks/{task_id}`），管理操作（agent 注册、服务令牌签发、项目创建、消息 requeue/cancel/sweep、approvals、audit）全部仅限人类；⑤ 新测试 7 个：越权面全 403（注册 ROGUE agent 且确认未落库、projects/audit、sweep/requeue/cancel、approvals）+ 白名单内 e2e（claim→START→DEVELOPMENT_COMPLETED→artifact→commit→messages 读取）+ 人类会话回归；`test_health_auth.py` service token 断言同步收紧（GET/POST /projects → 403、whoami 200 kind=service）

### M2 GPT 控制器（app/gpt_controller/）——含 F-001/F-101/F-201/F-402/F-502 返工

- 13 步派单管线；R3+ 发送双验严格时序；pre-send 生成门 fail-closed；300s 生成超时；出站 ≤1200 UTF-8 字节完整计量；GitPointer 出站
- 入站：user unit 起点区间采集、相邻窗口重叠、两次完整读取（≥3000ms）、raw 先落盘回读 SHA-256、集合变化无独立序列→INBOUND_WINDOW_COMPLETENESS_UNPROVEN
- 会话上限轮换；OS 句柄锁（DEC-001）；三 ID 强制
- **F-001 返工（第 2 轮已审，见 commit 040571e）**：DEC-017 多 assistant unit 门禁三层——`selectInboundReply` 默认 `maxAssistantUnits=1` fail-closed → `readReplySnapshot` 透传 → dispatch 快照收敛点无条件复核。
- **F-101 返工（第 2 轮，涉及 3 文件：inbound_reply.mjs / dispatch.mjs / 两测试文件）**：
  1. 收敛复核抽为**独立导出函数 `assertInboundExtensionGate(snapshot)`**（inbound_reply.mjs），dispatch 收敛点改调它；可被直接单测。
  2. **畸形快照 fail-closed**：unit_count 缺失/undefined/非整数/负数/NaN/字符串、unit_keys 缺失/非数组/与 unit_count 不一致 → `INBOUND_REPLY_SNAPSHOT_MALFORMED`（修复原 `unit_count > 1` 判断对 undefined/负数静默放行的缺口）。
  3. **测试注入点**：`runDispatch` 的 `deps.readReplySnapshot` 仅供测试注入（模拟上游门禁被放宽或失效），生产路径不传、恒用真实 reader；`runDispatchLocked` 内部经 `replyReader` 参数传递。
  4. 测试 +3：最终防线纯函数（单 unit 放行/多 unit 拦截/9 种畸形快照全部 fail-closed）；注入式全管线（上游放宽 → 收敛点仍 `INBOUND_MULTI_UNIT_EXTENSION_GATE_BLOCKED` 且无 result.json）；矛盾快照骗过稳定性比较 → 最终防线 `INBOUND_REPLY_SNAPSHOT_MALFORMED`。
- **F-201 返工（第 3 轮，涉及 3 文件：inbound_reply.mjs / 两测试文件）**：
  1. `assertInboundExtensionGate` 边界收紧：unit_count 合法范围为**正整数**（`count < 1` 一律 `INBOUND_REPLY_SNAPSHOT_MALFORMED`——回复必含 ≥1 个 assistant unit，堵住 unit_count=0/空 keys 绕过）；unit_keys 元素全部**非空字符串**且**无重复**（堵住 [null]/[""]/重复 key 绕过）。
  2. 纯函数负例 9→**14 类**（新增：零数量、null 元素、空字符串、重复 key、非字符串元素）。
  3. 注入式全管线 +2：零 unit 快照、非法 key 快照骗过稳定性比较后均被最终防线以 `INBOUND_REPLY_SNAPSHOT_MALFORMED` 拒绝，且无 result.json（不产生成功日志/artifact/M1 登记）。
- **F-402 返工（第 6 轮，涉及 3 文件：inbound_reply.mjs / unit.test.mjs / browser_simulation.test.mjs）**：units 结构一致性 fail-closed——
  1. `assertInboundExtensionGate` 在 count/keys 校验与 count>1 拦截之外**新增 units 结构段**：`units` 必须是长度===unit_count 的数组；每元素必须为对象且 `role==="assistant"`、`key===keys[index]`（非空字符串）、`text` 非空字符串、`text_sha256` 为 64 位 hex 且等于 `Buffer.from(text,"utf8")` 实算 SHA-256、`size_bytes` 为正整数且等于 UTF-8 字节数、`assistant_uuid` 非空字符串；且 `snapshot.reply === units.map(u=>u.text).join("\n")`。任何一项不成立 → `INBOUND_REPLY_SNAPSHOT_MALFORMED`。**修复缺口：第 5 轮前仅校验 unit_count/unit_keys 单字段合法性，unit_count/unit_keys 合法而 `units=[]`、键错位、role 冒充、伪造 sha、reply 脱钩的快照仍可通过**（单字段合法 ≠ 快照合法，声明—实体必须对应）。
  2. `compareInboundSnapshots` 新增 `unit_text_hashes_length_matches_count` 检查：两侧 text_sha256 摘要数组长度必须分别===对应 unit_count（堵"伪造等长 hash 数组骗过两次相等"——相等性之外还须与 count 一致）。
  3. 纯函数负例 14→**32 类**（新增：空 units、长度不一致、null 元素、非对象元素、role=user、role 缺失、key 错位、空 key、空 text、非字符串 text、sha 非 64hex、sha 伪造、size 不匹配、size 非正整数、uuid 缺失、uuid 空、reply 脱钩、reply 非字符串）。
  4. 注入式全管线负例 +5（空 units → INBOUND_UNSTABLE_READ 且比较结果含 `unit_text_hashes_length_matches_count===false`；key 错位 / reply 脱钩 / role 冒充 / 伪造 sha → 骗过稳定性比较后被最终防线 `INBOUND_REPLY_SNAPSHOT_MALFORMED` 拒绝，无 result.json）。
- **F-502 返工（第 7 轮，涉及 3 文件：inbound_reply.mjs / unit.test.mjs / browser_simulation.test.mjs）**：units 元素级 assistant_uuid 校验——
  1. 第 6 轮前 gate 只检查快照级 `snapshot.assistant_uuid` 非空，未检查 unit 级 `unit.assistant_uuid`：元素 UUID 缺失/伪造而快照级合法的结构矛盾仍可通过（selectInboundReply 构造的 unit 元素本就带 assistant_uuid，且快照级取自末位 unit）。
  2. 修复：`assertInboundExtensionGate` units.some 循环新增 unit 级 assistant_uuid 非空字符串校验 + 快照级 `assistant_uuid === units[末位].assistant_uuid` 一致性校验（上游 selectInboundReply 已有 `INBOUND_ASSISTANT_UUID_MISSING`，此处为最终防线兜底，纵深防御与 F-101 同理）。
  3. 纯函数负例 32→**36 类**（unit 级缺失/空字符串/非字符串/快照级与 unit 不一致）。
  4. 注入式全管线 +2（unit 级 UUID 缺失、快照级与 unit 级不一致，均骗过稳定性比较后被最终防线 `INBOUND_REPLY_SNAPSHOT_MALFORMED` 拒绝，无 result.json）。
- 测试证据：node --test **65/65 通过** 退出码 0（63 + 2 F-502 注入负例新增）；F-502 返工日志 `phase1/logs/m2-gpt-controller-20261113/f502-rework/`；F-402 返工日志 `…/f402-rework/`；F-201 返工日志 `…/f201-rework/`；F-101 返工日志 `…/f101-rework/`；F-001 返工日志 `…/f001-rework/`；首轮历史日志 `…/`（留证）。

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
2. 核对 platform-contract-v1.0.md C1-C8 的模块级落点、module-boundaries.md §2 职责边界、DEC-017 约束（尤其 fail-closed 路径）；前七轮 finding 均已整改并经后续轮确认，**本轮重点复核 F-601 整改**：核验报告 method 引用本轮 `blob-recheck-T-P1-901-r8/`、报告/manifest/r8 复核证据三者 SHA 与覆盖数量一致（133/133）；F-501/F-502 已于第 7 轮审查确认整改成立，本轮（第 8 轮）无模块代码变更
3. 先按 §3 核验协议 v2 执行审查方侧核验；报告缺失/覆盖不足/与实读矛盾→BLOCKED
4. **本审查为模块级，不构成 Phase 1 集成验收或 BLOCKED-1 扩展场景解除**

## 7. 输出格式（只输出 JSON，直接输出 JSON 文本）

```json
{"result":"PASS|REWORK|BLOCKED",
 "reviewed_commit":"<本交接包所在 commit 完整 40 位 SHA，取派单消息，逐字符复制>",
 "findings":[{"finding_id":"F-701","severity":"BLOCKER|CRITICAL|MAJOR|MINOR|INFO","file":"路径","description":"问题","recommendation":"修复建议"}],
 "constraints":["必须写入后续流程的约束"],
 "summary":"结论摘要"}
```

findings 超过 8 条时仅列 severity≥MAJOR 的前 8 条，其余在 summary 中计数说明。finding_id 从 F-701 起编（避免与 F-001/F-101/F-201/F-301/F-401~F-404/F-501~F-502/F-601 混淆）。reviewed_commit 必须为完整 40 位十六进制字符（逐字符复制）。

## 8. 会话管理约束【决策】

- 出现"上下文窗口已达上限"或长期无有效反馈时，不在旧会话重试；由主会话重新生成交接包并开全新空白会话
- 本消息自包含；新会话先实读 GitHub 指定 commit 材料再下结论，不依赖聊天记忆
- 材料不可读、证据不足→BLOCKED，不猜测、不声称通过
