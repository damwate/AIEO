# Phase 1 四模块集成验收交接包（T-P1-902，2026-11-13，第 2 轮）

**用途：** 供全新、空白 GPT 审查会话使用。**不依赖任何旧会话记忆。**
**审查历史：** T-P1-901 模块级审查 8 轮闭环 PASS（M1/M2/M4 findings 空）。本轮任务 T-P1-902 为**四模块集成级独立验收**——独立会话、独立结论，不继承、不推翻模块级 PASS。
**第 1 轮集成审查（r1）结论：REWORK + 2 项 MAJOR（F-801/F-802，均为集成套件自身缺陷，模块代码零缺陷记录）。** r1 审查对象 commit f1c47941b49a6ba68ab8eb50d094a260de38a2fe（锚定 tag `review-anchor/T-P1-902-r1`→f3d00684110f9406476b34698a249ff9bdbcb7b1），派单证据 `phase0/logs/dispatch-2026-11-13T15-51-30/`（reply.txt 为原始结论 JSON，其 constraints 对申报边界的确认在本轮继续有效）。两项 finding 已整改并全量重跑（见 §4.4）。
**第 2 轮集成审查（r2）结论：PASS（2026-11-13，独立新会话）。** r2 审查对象 commit c13b642770d2e4a6b2f1f1dd2bc5681cb4e906bb（锚定 tag `review-anchor/T-P1-902-r2`→af79e68711fdc10958a5c8d9590731d8cc25181b），派单证据 `phase0/logs/dispatch-2026-11-13T16-13-14/`（reply.txt 原始 JSON，登记 ART-M1-000011）。F-801/F-802 均确认为真修复；余 2 项 MINOR：F-803（本文件 §3 覆盖数字残留 r1 值 42/42——已修正为 50/50，随登记 commit 提交）、F-804（测试子进程 text 模式留证为 UTF-8 文本表示而非原始字节——非阻断改进，登记 lessons DEV-20261113-012，待后续套件变更时实施）。**r2 PASS 为四模块集成级验收通过；不构成 Phase 1 最终验收结论，不解除 BLOCKED-1 扩展场景（约束全文见 reply.txt）。**
**范围：** 集成套件 `tests/integration/`（真实进程 E2E 覆盖 06-计划 §2 验收七条）+ 集成期 5 项跨模块契约缝隙修复（M1×2 文件、M3×6 文件、M4×2 文件）+ E2E/回归证据 + r1 REWORK 整改。模块级已审事项不重开；若集成事实与模块级申报矛盾，按 MAJOR+ 处理。

## 1. 仓库与基线【事实】

- 仓库：`damwate/AIEO`（公开 GitHub）
- 分支：`fix/AIEO-PHASE0-REVIEW-R10`
- **审查对象 commit（reviewed_commit = input_material_commit）：本交接包所在 commit，完整 40 位 SHA 以派单消息为准；回写时必须逐字符复制全部 40 位**
- 前序链：`120d425`（lessons 009）→ `f60440a`（T-P1-901 PASS 登记）→ …（T-P1-902 r1 链）→ **r1 锚定 tag `review-anchor/T-P1-902-r1` = f3d00684110f9406476b34698a249ff9bdbcb7b1（r1 manifest 提交 commit）**，r1 最终候选 = f1c47941b49a6ba68ab8eb50d094a260de38a2fe（amend 仅增证据目录；r1 结论 REWORK 即对它作出）。**本轮 r2 将以 `review-anchor/T-P1-902-r2` tag 锚定，SHA 见 blob 复核证据与派单消息**
- r1 历史 E2E 证据：`phase1/logs/integration-20261113T003810Z/`（随 r1 链提交，tag 锚定，仅作历史；**本轮审查对象为 §4 所指新证据目录**）
- main 未合并任何 Phase 0/Phase 1 分支。

## 2. 审查材料与绑定值【以派单消息 SHA 为准实读】

- 输入材料 manifest：`phase1/manifests/T-P1-902-input-manifest.json`（**50 个文件**，仓库根相对路径；含集成套件 5 文件、集成期修复模块文件 12 个、`docs/AI-DEV-LESSONS.md`（含 DEV-20261113-010/011）、`handoff/PHASE1-INTEGRATION-REVIEW.md`（本文件）、证据链工具 `phase1/tools/manifest_tool.mjs`、字节化规则 `.gitattributes`（`phase1/logs/** binary` 与 `phase0/logs/** binary`：证据目录按磁盘字节入库，manifest SHA-256 基准=磁盘字节=Git blob 字节，L-011.7 延伸）、r2 E2E+回归证据 24 文件（`phase1/logs/integration-20261113T160107Z/`）、r1 派单结论证据 7 文件（`phase0/logs/dispatch-2026-11-13T15-51-30/`，REWORK 原始 JSON）；核验报告与 blob 复核证据**不入 manifest**——报告引用 manifest SHA 会自引用，复核证据受 amend 时序约束，二者均经本 commit 提交、按下述路径实读）
- manifest SHA-256：**以派单消息为准**
- 契约版本：`1.0`；工程标准：`platform-contract-v1.0`
- 任务 ID：`T-P1-902`；执行 ID：`EXEC-921`（避免与 T-P1-901 各轮 EXEC-901~908 混淆）；关联 ID：`CORR-921`
- 审查者 ID：`GPT-REVIEWER`
- knowledge_base_commit：本交接包所在 commit（`docs/AI-DEV-LESSONS.md` 含 DEV-20261113-001~010、L-013、CAP-20261112-001、CAP-20261113-001）

## 3. 材料核验协议 v2【按双方真实执行能力分工，可执行、全量、非降低标准】

**环境事实（已记 CAP-20261113-001）：** 审查方为网页会话，无本地命令执行、无 SHA-256 计算、无 GitHub API 调用能力；但可稳定读取 raw.githubusercontent.com 内容。开发方主会话具备完整本地执行环境。

分工如下：

1. **开发方（已执行，全量）：** 主会话对 manifest 全部 50 文件执行机械核验——① 每文件磁盘字节 SHA-256 与 manifest `artifact_sha256` 逐项比对；② commit 后对 `git cat-file blob` 重新全量比对（证明 manifest 描述的即为本 commit 内容）；③ `git ls-tree -r` 核对全部路径存在于本 commit。**报告：`phase1/manifests/T-P1-902-verification-report.json`**（含命令、退出码、逐文件结果）；blob 复核证据 `phase0/logs/blob-recheck-T-P1-902-r2/`（r1 轮复核证据 `phase0/logs/blob-recheck-T-P1-902-r1/` 及其失败留档 `-pre-fix-36of41/` 随 r1 链留档，tag r1 锚定）。
   **EOL 字节化前提（L-011.7 延伸）：** 证据目录经 `.gitattributes` 的 `phase1/logs/** binary`（r1 起）与 `phase0/logs/** binary`（r2 起，r1 派单证据本轮首次入 manifest）按磁盘字节原样入库，autocrlf 不做提交时规范化——否则 JSON/NDJSON 类证据（磁盘 CRLF）会被规范化为 LF blob，manifest 核验必然失败（r1 首轮 recheck 曾因此 36/41，失败证据留档 `phase0/logs/blob-recheck-T-P1-902-r1-pre-fix-36of41/`，属规则缺失而非证据篡改，已机制修复）。
   **amend 机制说明（F-301/F-404 整改延续）：** blob 复核必须在 commit 之后执行，其证据无法与被复核内容同一次生成。流程为：先产生含全部审查材料与 manifest 的 commit C1，对 C1 执行 blob 复核（证据内 `commit_sha256_anchored` 字段锚定 C1），再以 amend 方式将证据目录与核验报告并入生成最终送审 commit C2——amend **仅新增证据目录与报告**，manifest 所列全部文件在 C1 与 C2 中的 Git blob 逐字节相同（Git 内容寻址保证，可用 GitHub compare 验证 diff 仅含证据新增）。**C1 以 `review-anchor/T-P1-902-r2` 格式的 tag 锚定并推送**（force push 后裸 SHA 不再被引用，GitHub compare 不可得）。**F-601 整改延续：核验报告 method 字段指向本轮 `blob-recheck-T-P1-902-r2/`，锚定 commit 以该证据 `recheck-result.json` 的 `commit_sha256_anchored` 字段为准（报告不硬编码随 amend 变化的 SHA）**。
2. **审查方（本轮请你执行）：** ① 实读上述核验报告，核对覆盖面（50/50、mismatch 为空、退出码），并核对报告引用的复核证据目录与实际提交的 `blob-recheck-T-P1-902-r2/` 一致（F-601 同轮引用）；② 按你的判断**抽样直接读取** raw.githubusercontent.com 上本 commit 的材料文件，核对其内容与申报一致；③ 抽查核验报告所列哈希与你的实读是否自洽——若发现报告与实读不符，按 MAJOR+ 处理。
3. **诚实条款：** 若报告缺失、覆盖不足或内容与实读矛盾→判 BLOCKED 并写入 findings；你无需也无法重复机械哈希计算，这部分由报告与 Git commit 锚定共同保证。

## 4. 被审查交付【事实，材料均在 manifest 中】

### 4.1 集成套件（tests/integration/，5 文件）

- **`e2e_four_modules.py`**（主编排，约 985 行）：启动**真实 M1 uvicorn 子进程**（临时 DB/日志/工件、空闲端口、AIEO_ENV=test、真实 HTTP）+ OWNER 人类会话（登录+CSRF）与服务令牌会话并存。十一步顺序执行、逐步 ok 判定、任一步失败即停并落盘证据、最终 `e2e-evidence.json`（all_ok/exit_code/逐步 details）：
  | 步骤 | 内容 | 验收条目（06 §2） |
  | --- | --- | --- |
  | 01 boot_and_setup | AIEO-ORCHESTRATOR 预置核验 + 3 个服务 agent 注册 + 项目/仓库/批次 + 父（weight 2）子（weight 1，dependencies）任务，父 PLAN→ARCH_REVIEW→PASS→READY，子至 ARCH_REVIEW | ①② |
  | 02 dependency_gate_negative | 父未 ACCEPTED：子 PASS→READY 409 TASK-0002（pending_dependencies 指明父任务）；子 claim 409 TASK-0001；READY 上 PASS 非法转换 409 | ②③ |
  | 03 m3_claim_and_progress | 真实 MCP stdio server 子进程（http 模式+服务令牌）：握手/工具清单→claim_task（base_commit 必填，任务视图 status=DISPATCHED）→重复 claim 409 TASK-0003→START→report_progress（显式 project_id/batch_id）delivered=true | ③④ |
  | 04 m4_commit_and_collect | 真实 GitWorker+scratch git 仓库（基线→探针 commit→任务分支自基线切出）：GIT-0002 非祖先负例→commit_and_collect REGISTERED（DIFF 工件+git_commit+audit）→工件/commit 幂等→哈希不匹配 422 ART-0002→**真实测试执行**（pytest 实跑，TEST_LOG 工件=该 run 输出原始字节+统计同源解析+登记后回读 SHA-256 比对，F-802 整改，证据 `dev-test-run/devtest-run.log`） | ③⑦ |
  | 05 m3_submit_result | submit_result（真实 commit_sha，tests 统计=步骤 04 真实执行的解析值）→DEV_REPORTED→重复提交幂等（duplicate=true，message_ack.skipped=true，不投第二条） | ③④ |
  | 06 git_validate_and_accept | **证据门负例（F-801 整改）**：父任务 DEV_REPORTED（真实 execution）提交 test report→精确 409 TASK-0001 "requires TEST_ACCEPTANCE"→GIT_VALIDATE→PASS→review report PASS（task_package_hash）→TEST_ACCEPTANCE→test report（EXECUTED_PASS+PASS 同事务）→**ACCEPTED** | ③ |
  | 07 m2_leg_and_bridge | node 子进程 headless runDispatch 13 步全管线（fixture DOM）→编排侧把 M2 产物 POST /artifacts（REVIEW_EVIDENCE）→GET 回读逐字节比对 | ①⑦ |
  | 08 child_unblock_and_board | 父 ACCEPTED 后子 PASS→READY→claim 成功→START→BLOCKED 报告收尾；board 只计 ACCEPTED（completion=2/3≈66.67%） | ②⑥ |
  | 09 messages_dedup_and_sweep | 同 message_id 不同内容 409 RES-0003 且不落第二条→ACK 幂等→dead-letter 严格只读（查询前后 PENDING 不变）→sweep PENDING→SENT（人类专属）→服务身份 sweep/requeue/projects 403 AUTH-0002 | ④ |
  | 10 restart_persistence | **真实进程重启**：terminate uvicorn→同 DB 重启→任务/commit/报告/消息/board 逐键比对一致；服务令牌跨重启有效 | ⑤ |
  | 11 audit_trail | /audit 断言 12 类动作与四个 actor（详见 `e2e-evidence.json` steps[10].details） | ⑦ |
- **`mcp_stdio_client.py`**：MCP stdio 行分隔 JSON-RPC 客户端（Python 夹具，语义对照 M3 模块测试 StdioMcpClient）。
- **`m1_rest_client_for_m4.py`**：M4 `M1Client` Protocol 的 REST 实现（httpx；见 §5-3 申报）。
- **`m2_leg.mjs`**：M2 headless leg（复用 M2 模块测试夹具 createFixturePage/runDispatch；摘要 JSON 供编排侧消费，见 §5-2 申报）。
- **`README.md`**：运行方式、步骤-验收条目映射、申报边界、修复清单、证据布局。
- E2E 证据：`phase1/logs/integration-20261113T160107Z/`（24 文件，r2 整改后重跑）：`e2e-evidence.json`（11 步 all_ok=true、exit 0）、`e2e-run.log`、`m1-server/m1-server-run{1,2}.log`（真实 uvicorn 两轮 stdout）、`m2-leg/`（request/reply/raw-units/result.json+本地登记簿）、`m2-artifacts/`、`m3-mcp-ndjson/`（MCP server C4 NDJSON）、`m4-logs/`、`m4-diffs/diff-*.patch`、`dev-test-run/devtest-run.log`（步骤 04 真实测试执行留证，TEST_LOG 工件字节源）、`m4-audit-local.ndjson`、`scratch-repos.json`、`work-dir-archive.json`、`regression/`（四模块回归 4 日志+summary.json）。

### 4.2 集成期模块修复（5 项缝隙，10 文件；每项均有模块级测试回归锁定）

1. **M3 `claim_task` 缺 `base_commit`**（`mcp_server.mjs`/`m1_client.mjs`+测试）：M1 `ClaimRequest.base_commit` 必填，M3 未透传→真实 M1 422。修复为 requireArgs+请求体透传；`claim_idempotency.test.mjs` 等锁定。
2. **M3 `report_progress` 上下文参数被 SDK 剥离**（`mcp_server.mjs`+测试）：`project_id`/`batch_id` 未在 zod inputSchema 声明——MCP SDK 对未声明参数**静默剥离**——而 M1 claim 响应任务视图不含 project_id（tasks 表无该列）→真实 M1 下必然 REQ-0001。修复为 inputSchema 补两个可选参数；`mcp_stdio_smoke.test.mjs` ①-5b 回归。
3. **M1 服务白名单缺 `POST /api/v1/messages`**（`security.py`+`test_service_authorization.py`）：03-协议 §3 要求服务 agent 投递 TASK_ACCEPTED/PROGRESS_UPDATED/DEVELOPMENT_COMPLETED 信封，白名单缺它则消息流全断。补**仅投递端点**——管理操作（sweep/requeue/cancel/projects/audit/approvals）仍 403，测试正反例均锁定。
4. **M4 DIFF 工件登记绝对路径**（`worker.py`+`test_git_worker.py`）：M1 `validate_artifact_path` 要求仓库相对 POSIX 路径，M4 原登记本地 diff_dir 绝对 Windows 路径→真实 M1 拒收。修复为登记确定性身份路径 `git-worker/diffs/<task_id>/diff-<sha>.patch`（本地 diff_dir 物理留证不变；测试锁定路径格式+物理文件 SHA-256 一致）。
5. **M3 `changed_files: []` 校验自相矛盾**（`report_schema.mjs`+测试）：校验器拒绝空数组但报错文案声称"允许为 []"；BLOCKED 报告本无实现变更。修复为允许 `[]`（字段存在+元素类型校验不变）；`submit_result_schema.test.mjs` ③-9 回归。

### 4.3 四模块回归

- M1 pytest **43 passed**、M2 node --test **65/65**、M3 node --test **53/53**（50+3 集成缝隙回归）、M4 pytest **24 passed**，退出码全 0；日志 `phase1/logs/integration-20261113T160107Z/regression/`（summary.json 含命令与结果）。模块级测试基线（43/65/24）与 T-P1-901 第 8 轮一致，M3 较交付时 50→53 为新增回归。r1→r2 整改未触碰模块代码，回归数字与 r1 基线（`phase1/logs/integration-20261113T003810Z/regression/`）逐项一致。

### 4.4 第 1 轮集成审查 REWORK 整改（r1 findings，本轮复审重点）

r1 结论 REWORK + 2 项 MAJOR（原始 JSON 见 manifest 内 `phase0/logs/dispatch-2026-11-13T15-51-30/reply.txt`；整改过程登记 lessons DEV-20261113-011）。两项均核实属实、均为套件自身缺陷（模块代码零改动），整改如下：

1. **F-801（MAJOR）证据门负例未真实命中门禁**：原负例对子任务用伪造 execution_id（EXEC-90299）提交 test report——M1 `register_test_report` 中执行存在性校验（`_require_execution`）先于状态门禁，请求实际 404 RES-0001 即被拒，从未到达证据门禁逻辑；且断言接受 400/404/409 任意状态，只证明"被拒"未证明"门禁工作"。**整改**：负例移至步骤 06 开头，对**父任务**（真实 execution_id，DEV_REPORTED、未经 review 证据链）提交 EXECUTED_PASS test report——请求通过执行存在性校验后真实命中状态门禁（`app/platform/reports.py` "test report requires TEST_ACCEPTANCE"），精确断言 `409 TASK-0001` 且拒绝原因含 "requires TEST_ACCEPTANCE"。证据：`e2e-evidence.json` steps[5].details.accepted_evidence_gate_negative（实测 message="INVALID_STATE_TRANSITION: test report requires TEST_ACCEPTANCE (task is DEV_REPORTED)"）。
2. **F-802（MAJOR）TEST_LOG 工件为人工构造字符串**：原步骤 04 登记硬编码内容 `integration e2e test run: ALL PASS` 为 TEST_LOG，而开发报告声称 `python tests/integration/e2e_four_modules.py` passed=11——统计与工件无同源绑定（且对运行中的 E2E 自引用）。**整改**：步骤 04 **实跑一次真实 pytest**（`python -m pytest tests/platform/test_service_authorization.py -q`，子进程，实跑 8 passed/0 failed），TEST_LOG 工件=该 run 输出**原始字节**（磁盘留证 `dev-test-run/devtest-run.log`，SHA-256 见 evidence steps[3].details.dev_test_run.log_sha256），开发报告 tests.commands/passed/failed 从同一输出解析，登记后 GET 回读验证内容逐字节一致 + SHA-256 一致（steps[3].details.test_log_readback）。

两项整改后 E2E 全量重跑一次通过（exit=0），四模块回归与 r1 基线逐项一致（见 §4.3）。

## 5. 申报的未实现边界【如实申报，请核对是否与代码一致，而非当作自动缺陷】

r1 审查已在 constraints 中确认以下边界如实申报（原文见 manifest 内 r1 reply.txt），本轮继续有效；r1→r2 整改仅改 `tests/integration/` 套件文件与文档，申报边界不变。

1. **M2 真实 chatgpt.com 收发未覆盖**（DEC-017 扩展门禁）：M2 leg 为 headless runDispatch 全管线（13 步语义与生产一致），但页面为本地 fixture DOM，不连外网。
2. **M2→M1 为编排侧工件桥接**：M2 模块代码不直连 M1 HTTP（模块内登记 `MINIMAL_LOCAL_M1_NOT_FULL_PLATFORM` 申报不变）；由编排脚本读 m2-leg 摘要与登记簿，将产物 POST 到真实 M1 并回读比对。桥接代码属集成套件，非 M2 模块变更。
3. **M4 的 M1Client REST 实现属集成夹具**（`m1_rest_client_for_m4.py`）：M4 Protocol 契约规定 REST 实现归属 M1 侧或测试，本实现不改 M4 模块代码；`record_audit` 落本地 NDJSON 并如实标注 `AUDIT_LOCAL_ONLY_M1_HAS_NO_POST_AUDIT_ENDPOINT`（M1 无 POST /audit 端点，服务端审计由操作随事务写入，E2E 步骤 11 断言）。
4. AIEO-ORCHESTRATOR 由 M1 migration 预置，E2E 仅核验存在性不重复注册。
5. M1 消息投递为 sweep 模拟（PENDING→SENT），无真实 broker（同模块级申报，DEC-017）。
6. 真实 ZCode 会话启动（M3 的上游真实客户端进程）不在集成范围（DEC-017）；M3 以真实 MCP stdio server 进程+真实 HTTP 对 M1 参与。
7. 模块级申报边界（`handoff/PHASE1-MODULE-REVIEW.md` §5 第 1~7 项）全部继续有效。

## 6. 审查要求

1. 核对代码与上述申报一致；发现申报不实（宣称已实现但无代码/无证据）按 MAJOR 及以上处理。
2. **验收七条逐步核对**：按 §4.1 映射表对照 `e2e-evidence.json` 各步 details（三 ID、任务/执行/commit/审计动作等）与对应证据文件；套件自身缺陷（假断言、恒真检查）按 MAJOR+ 处理。
3. **5 项集成修复的"真修复"审查**（重点：修复不得掩盖或弱化模块级已审语义）：① 白名单新增**仅限投递端点**，管理操作 403 面不缩小（测试锁定）；② M4 路径身份化后物理 diff 证据仍可达且 SHA-256 一致（测试锁定）；③ `changed_files=[]` 不降低元素类型校验；④⑤ 为字段补齐/SDK 契约修复，无逻辑弱化。
4. 核对 platform-contract-v1.0 C1-C8 的**集成落点**（跨模块交接字段、错误码传播、审计链连续）与 03-协议 §3 信封投递、§6 开发报告结构。
5. 先按 §3 核验协议 v2 执行审查方侧核验；报告缺失/覆盖不足/与实读矛盾→BLOCKED。
6. **r1 已确认事项不重开**：r1 reply.txt constraints 已确认的事实（申报边界、五项集成修复无白名单扩大/校验弱化、blob 复核与回归数字等）本轮直接沿用；r2 复审重点是 §4.4 两项整改是否为真修复——负例是否真实命中门禁层（而非被前序校验拦截）、测试证据工件与统计是否同源可追溯；若整改不实（宣称修复但证据仍不自洽）按 MAJOR+ 处理。
7. **本审查为集成级独立验收，不构成 Phase 1 最终结论或 BLOCKED-1 扩展场景解除**；不继承模块级 PASS，也不重开模块级已确认事项（矛盾除外）。

## 7. 输出格式（只输出 JSON，直接输出 JSON 文本）

```json
{"result":"PASS|REWORK|BLOCKED",
 "reviewed_commit":"<本交接包所在 commit 完整 40 位 SHA，取派单消息，逐字符复制>",
 "findings":[{"finding_id":"F-803","severity":"BLOCKER|CRITICAL|MAJOR|MINOR|INFO","file":"路径","description":"问题","recommendation":"修复建议"}],
 "constraints":["必须写入后续流程的约束"],
 "summary":"结论摘要"}
```

findings 超过 8 条时仅列 severity≥MAJOR 的前 8 条，其余在 summary 中计数说明。finding_id 从 **F-803** 起编（F-801/F-802 已被 r1 占用，避免混淆）。reviewed_commit 必须为完整 40 位十六进制字符（逐字符复制）。

## 8. 会话管理约束【决策】

- 本审查为阶段边界（模块级→集成级），**强制会话轮换**（review-protocol §5.1）：由主会话派单至全新空白会话，不继承任何旧会话记忆
- 本消息自包含；新会话先实读 GitHub 指定 commit 材料再下结论，不依赖聊天记忆
- 出现"上下文窗口已达上限"或长期无有效反馈时，不在旧会话重试；由主会话重新生成交接包并开全新空白会话
- 材料不可读、证据不足→BLOCKED，不猜测、不声称通过
