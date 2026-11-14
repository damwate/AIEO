# T-P1-905 D1′ 真实端到端垂直切片 · 全链记录与复盘

**执行日期：** 2026-11-14（本地 UTC+8，全程约 01:13–01:4x）
**执行者：** 主编排会话（ZCode）
**授权链：** 用户派单（"按 DEC-024-C 开工授权执行 T-P1-905 D1′"）→ DEC-024-C 开工四约束（decision-log.md L169 起）→ 任务书 `docs/phase1/D1PRIME-VERTICAL-SLICE-BRIEF.md` **v0.3**（commit `c55c7f5`，四约束整合版）
**基线：** main = `c55c7f5`（v0.3 任务书登记 commit；其下含 DEC-024 四项决议 163c7f5/e652a3f 与 904 合并 a445a77）
**结论（三态）：** **PASS——九步全部走真实通道完成，无一步以模拟替代**；本 PASS 仅为执行登记结论，**完成另行提交独立验收，不因开工授权获得合并或发布权限**（DEC-024-C 授权文本原句）。

---

## 1. 执行形态声明（任务书 §1 注记，如实登记）

1. **ChatGPT 规划腿：** 真实 chatgpt.com 网页会话，`phase0/tools/gpt_dispatch.mjs` CDP 接管真实 Chrome（专用 profile `runtime/chrome_profiles/gpt-poc`，调试端口 9222，`--new-session` 新空白会话）。非模拟页面、非预录回复。
2. **ZCode 开发腿：** 由本编排会话自身作为真实 ZCode 执行者承接（**不冒充"独立 CLI 会话开发"**）。领取/进度/提交一律经真实 M3 `app/zcode_bridge/bin/aieo-zcode-mcp.mjs`（stdio 子进程 + 真实 MCP stdio 客户端驱动）打到真实 M1 REST（`http://127.0.0.1:8000`）并落真实 SQLite（`runtime/d1prime-20261114/aieo.db`）；开发变更为真实任务分支 commit 并经真实 M4 `app/git_worker/worker.py commit_and_collect` 采集。
3. **所有状态推进均经 M1 REST 事件端点或 M3 MCP（其内部走 REST），无任何 DB 直改状态；DB 直查仅用于只读核验。**
4. 秘密不进 Git（C6）：`AIEO_SESSION_SECRET`/`AIEO_PLATFORM_ADMIN_PASSWORD`/服务令牌仅存于 gitignored `runtime/d1prime-20261114/env.sh` 与 `service-tokens.json`。

## 2. 环境事实

| 项 | 值 |
|---|---|
| M1 平台 | uvicorn 独立实例，`127.0.0.1:8000`（执行结束时仍在运行，PID 24320），专用新库 `runtime/d1prime-20261114/aieo.db`（全新 bootstrap，避免旧库遗留状态），日志 `runtime/d1prime-20261114/m1-server.log` |
| M3 | `app/zcode_bridge/bin/aieo-zcode-mcp.mjs` stdio 子进程，环境变量指向 M1:8000 + `ZCODE-01` 服务令牌，日志 `runtime/d1prime-20261114/logs-m3/` |
| M4 | `app/git_worker/worker.py` `commit_and_collect`（Python 进程内真实调用，AuditContext 全参），审计 `runtime/d1prime-20261114/m4-local-audit.ndjson`，日志 `runtime/d1prime-20261114/logs-m4/` |
| 开发工作区 | git worktree `runtime/d1prime-20261114/wt-t-p1-001`，分支 `feature/T-P1-001-bundle-gate-help`（独立 worktree 因 M4 范围核验含 untracked 文件 `--untracked-files=all`，隔离证据目录避免 fail-closed 误伤） |
| 代理 | 出站/推送代理 `127.0.0.1:13772`（DEC-004 2026-11-14 更新口径） |

## 3. 九步全链表（任务书 §2 逐步绑定）

| # | 步骤 | 通道（真实） | 结果 | 关键 ID / SHA | 证据文件（本目录，除注明外） |
|---|---|---|---|---|---|
| 1 | 建项目/批次/任务 + OWNER 登录 + 服务身份 | M1 REST `POST /api/v1/...` | 201/200 全过 | project **AIEO-D1PRIME**(ACTIVE)、batch **BATCH-001**、task **T-P1-001**（平台自动分配，TaskCreate 无 task_id 字段——预期为 921 号段，如实采用平台分配值）、agent **GPT-01**/**ZCODE-01** | `s1-bootstrap.{json,log}` |
| 2 | 任务包组装出站（≤1200 字节） | gpt_dispatch.mjs | 出站成功 | request **826 字节**，SHA-256 **`9ac5119167baf2184a1b5aef2c960a499aeb59fc7021a9c61c738ebf500bb022`** | `s2-request.txt` + `.sha256` |
| 3 | 真实 ChatGPT 规划会话（GPT-01） | `--new-session` CDP | 回复提取成功，双读稳定性 10/10 检查全过 | assistant UUID **`944f5ad1-bab2-470a-9b50-93cb16186589`**；回复 1636 字节 SHA **`7d04368f7d3cb72a4ad644454c50bbe913cc5b08f685103ecffaa5c0037673dc`** | `s3-dispatch-console.log`；`phase0/logs/dispatch-2026-11-14T01-13-30/`（request.txt/reply.txt/result.json/run.log/双截图/raw-units.json） |
| 4 | 回复登记 artifacts+messages（三 ID 强制+幂等） | M1 REST | artifact 201；message 202；**幂等重放验证通过** | artifact **ART-OTH-001**（OTHER，path=`phase1/logs/t-p1-905-d1prime-20261114/s4-reply-raw.txt`，sha=`7d04368f…`，replay `duplicate:true` 同 ID 不新增）；message **MSG-20261114-000001**（TASK_PLAN_SUBMITTED/INBOUND/GPT-01→AIEO-ORCHESTRATOR/CORR-905001；replay → **409 RES-0003 DUPLICATE_MESSAGE** 不新增） | `s4-registration.{json,log}`、`s4-reply-raw.txt`+`.sha256` |
| 4b | 回复 Schema 校验（904 冻结契约，Ajv 2020） | 本地 Ajv（phase0/tools/node_modules） | **envelope+payload 双 valid，0 errors** | envelope=`contracts/v1.0/message-envelope.schema.json`、payload=`contracts/v1.0/task-plan-submitted.payload.schema.json`（澄清见 §5-3） | `s4-schema-validation.json` |
| 5 | 状态机推进至 READY | M1 REST 事件（禁 DB 直改） | 三事件 200，task_events 审计完整 | **EVT-D1P-PLAN-001**（DRAFT→PLANNING）、**EVT-D1P-ARCH-001**（PLANNING→ARCH_REVIEW）、**EVT-D1P-ARCHPASS-001**（ARCH_REVIEW→READY），操作者 OWNER | `s5-state-transitions.{json,log}` |
| 6 | ZCode 真实领取 | M3 MCP `claim_task`（内部 claim REST→M1） | 领取成功；**重复领取双通道 fail-closed 验证** | MCP 会话内重复领取 → **TASK-0003**；REST 直发重复领取 → 409 TASK-0003（status=DISPATCHED）；claim 内部 DISPATCH 事件 **EVT-CLAIM-61086f8e8e6c46b59f4fc5a6d3e55ae8**（READY→DISPATCHED）；execution **EXEC-001**（ZCODE-01，RUNNING，base=`c55c7f5…`）；出站 **MSG-20261114-000002**（TASK_ASSIGNED，REST outbox 200 确认） | `s6-claim-result.json`、`s6-claim.log`（含缺陷说明 §5-2） |
| 7 | 编排侧 START + 真实开发 | M1 REST 事件 + worktree 真实编辑 | START 200；需求实现 | **EVT-D1P-START-001**（DISPATCHED→IN_PROGRESS；M1 claim 只到 DISPATCHED，编排侧补 START 为 e2e 先例口径）；开发内容=`phase1/tools/bundle_gate.mjs` 增加 `--help` 用法输出（真实低风险需求，GPT-01 规划正文即此） | `s7-start-event.{json,log}`、`s7-help-stdout.txt`（`--help` 实跑输出）、`s7-noarg-*`（缺参 exit=2 实跑） |
| 7b | 回归核验（变更未破坏原核验） | bundle_gate 真实重跑（903 夹具） | **exit=0，parts 14/14，tar 三项 match，unpack 95/95**，与 903 r6 存档结果一致 | commit 锚 `ca3e5cfe7d56a4951a74e1663443310c4455dc4a` | `s7-regression-out/bundle-gate-result.json`+`bundle-gate-run.log` |
| 8 | 仓库登记 + 真实提交与 M4 采集 | M1 REST + M4 `commit_and_collect` | 采集成功，fail-closed 规则全程生效 | repo **REPO-001**；commit **`916d8b2f213f21dfd13746dc19e0597948bb4a52`**（分支 `feature/T-P1-001-bundle-gate-help`，base **`c55c7f5bfc08e073b93750ae412d0b5d29278343`**，单文件 scope，subject `feat(contract): add --help usage output to bundle_gate`）；diff SHA-256 **`78dd19ec3c0075f9f8b05f6cb10c1a971000252b42bbac4a808f66754b24260c`**；artifact **ART-DIFF-001**（DIFF）；**ART-TEST-001**（TEST_LOG，回归结果） | `s8-repo-register.{json,log}`、`s8-commit-collect.log`、`s8-commit-evidence.json`、`s8-diff/`（patch+sha256+`git show` 全文） |
| 9 | 报告登记闭环 | M3 MCP `report_progress`+`submit_result` → M1 `POST /api/v1/reports/development` | 闭环完成；**幂等重放验证通过** | progress → **MSG-20261114-513704**（PROGRESS_UPDATED，delivered）；submit → accepted=true，dev_report **DB id=1**（T-P1-001/EXEC-001/COMPLETED），**DEVELOPMENT_COMPLETED = MSG-20261114-519006** 入 Inbox（PENDING）；重放 `duplicate:true` 且 `skipped:duplicate_registration_no_new_message` 不新增消息；任务终态 **DEV_REPORTED**（EVT-DEV-EXEC-001） | `s9-report-loop.{json,log}`（含两次 fail-closed 拒绝 §5-1） |

**任务状态机全轨迹（task_events 审计，全部经 REST/MCP，零 DB 直改）：**
`DRAFT →(PLAN)→ PLANNING →(ARCH_REVIEW)→ ARCH_REVIEW →(PASS)→ READY →(DISPATCH, claim 内部)→ DISPATCHED →(START)→ IN_PROGRESS →(DEVELOPMENT_COMPLETED)→ DEV_REPORTED`

## 4. 独立可验证性锚点

- commit `916d8b2f213f21dfd13746dc19e0597948bb4a52` 已推送 origin 分支 `feature/T-P1-001-bundle-gate-help`，可由任何审查者按完整 SHA 独立读取；
- diff 副本 SHA `78dd19ec…` 与 M1 登记值一致（`s8-diff/diff.sha256` 可独立复核）；
- reply 1636 字节 SHA `7d04368f…` 三处一致：dispatch 双读 unit hash、`s4-reply-raw.txt` 实测、M1 ART-OTH-001 登记值；
- 请求 826 字节 SHA `9ac51191…`（`s2-request.sha256`）与 dispatch request.txt 实测一致。

## 5. 复盘：fail-closed 事件与如实登记（均不构成 PASS 污点，任务书 §2-3"fail-closed 事件本身也是有效交付证据"）

1. **submit_result 两次 fail-closed 拒绝后才成功（M3 设计行为，非缺陷）：** 第 1 次缺 `report.correlation_id` 且新 MCP 会话无在途领取可继承 → REQ-0001 拒绝；补 `CORR-905002` 后第 2 次仍被拒——report 缺顶层 `batch_id`/`project_id` 无法确定归属 → REQ-0001 拒绝；第 3 次补齐后 accepted。**两次拒绝期间未盲目重试外部执行，只补登记参数**（DEC-024-C ② 纪律的实路验证）。注意 M3 payload 返回 `dev_report_id:null` 为客户端字段名错位，**以 DB 行 dev_reports id=1（COMPLETED）为权威登记**。
2. **S6 核验脚本自身缺陷（工具缺陷，非链路缺陷，如实登记）：** 脚本登录后用了不带 cookie 的裸 `httpx.get/post` 做 post-login 查询 → 401 → 打印 `S6 RESULT: CHECK-FAILED`（`task_status_after_claim: None`、outbox 空）。已按 fail-closed 处置：**不采信该次输出**，以只读复核（带 cookie Client + DB 直查 + outbox REST 200）确认真实状态 DISPATCHED/EXEC-001 RUNNING/MSG-20261114-000002 存在。教训：核验脚本与业务脚本同等对待认证状态。
3. **gpt-inbound-poc.schema.json 澄清（任务书 §4 口径更新，非静默偏离）：** 该 Schema 为 POC 期夹具（const test 固定值+纯汉字 1000–1500 字符约束），不适用于真实规划回复；实际消费 **904 冻结交付**的 `message-envelope.schema.json`+`task-plan-submitted.payload.schema.json`（Ajv 2020，双 valid）。此为 904 机器化交付对 v0.2 草案文本的自然取代，登记于此。
4. **Inbox 查询参数修正：** `direction=inbound` 小写 → 400 REQ-0001（须 INBOUND/OUTBOUND 大写），修正后复验通过——契约校验在真实链路中实际拦截了格式错误，属 fail-closed 生效正向证据。
5. **幂等三重验证全过：** artifact 重放 `duplicate:true` 同 ID；message 重放 409 RES-0003；submit_result 重放 `duplicate:true`+消息跳过。DEC-024-C ②"登记先查幂等键、恢复只重试登记"在真实链路中成立。
6. **证据脱敏登记（C6 红线处置）：** 归档前扫描发现 `s1-bootstrap.json` 含 GPT-01/ZCODE-01 两个明文服务令牌（M1 `AgentCreate(issue_service_token)` 的 201 响应原文），已按 C6"秘密不进 Git"在归档前脱敏为前 10 字符+`…REDACTED`（本目录复扫零残留）；令牌原文仅存 gitignored `runtime/d1prime-20261114/service-tokens.json`。另将 3 处 OWNER 会话 CSRF 令牌（s1/s4 响应与日志中的短期凭据）一并 `…REDACTED`。其余文件扫描无泄漏。

## 6. 验收标准对照（任务书 §6 六条）

| # | 标准 | 结果 |
|---|---|---|
| 1 | 九步每步可复现证据（命令+输出+SHA） | ✅ §3 表逐行绑定；命令与原始输出在各证据文件 |
| 2 | 真实 GPT 规划回复 ≥1 轮，经 Schema/三 ID 校验并 M1 登记成功 | ✅ 1 轮（UUID `944f5ad1…`），双 Schema valid，三 ID（project/batch/task）+CORR 完整，ART-OTH-001+MSG-20261114-000001 落库 |
| 3 | 真实 commit 经 M4 采集且 SHA 独立可验证 | ✅ `916d8b2…` 已推送 origin，diff SHA 一致（§4） |
| 4 | 全链状态推进均经 M1 REST，audit_logs 完整 | ✅ §3 状态机轨迹 7 事件全部经 REST/MCP；M4 本地审计 `m4-local-audit.ndjson` |
| 5 | 结论三态如实 | ✅ 全链通=PASS；两次 submit_result 拒绝与 S6 脚本缺陷均如实登记于 §5，未伪装 |
| 6 | 零 mock 红线 | ✅ 九步无任何模拟替代：ChatGPT 腿真实网页、M1 真实 REST/DB、M3 真实 stdio MCP 子进程、M4 真实采集、commit 真实分支提交 |

**遗留 PENDING（如实登记，不隐藏）：** 四条消息（000001/000002/513704/519006）状态均为 PENDING——ACK 消费不在九步范围（任务书 §7 明确排除返工循环/ACK 全链）；M1 实例（PID 24320，专用 DB）执行结束时仍在运行，留待验收方复用或人工停止。

## 7. 交付物与后续

- 交付物 1（证据目录）=本目录 33 文件 + `phase0/logs/dispatch-2026-11-14T01-13-30/`（7 文件）；交付物 2（全链记录）=本文档；交付物 3（FEASIBILITY）/4（PHASE-STATUS）/5（复盘=§5）随证据分支归档。
- **分支拓扑（待独立验收+用户合并审批 DEC-010）：** 开发分支 `feature/T-P1-001-bundle-gate-help`（head `916d8b2`）；治理/证据分支 `feature/T-P1-905-d1prime`（本记录+文档更新+证据归档，自 main `c55c7f5` 切出）。**均未合并 main。**
- 固定纪律重申：PASS 不等于授权；归档不等于定稿；下一任务不继承上一任务额外权限；完成后另行提交独立验收，不因开工授权获得合并或发布权限；DEC-017 扩展场景限制不解除。
