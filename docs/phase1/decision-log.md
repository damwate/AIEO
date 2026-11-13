# AIEO 决策日志

**版本：** v0.1（草稿，含 Phase 0 初始条目）
**日期：** 2026-11-12
**状态：** 初始条目回溯自 Phase 0 证据文件；Phase 1 起随决策发生续记（模板见文末）
**维护规则：** 只追加不覆盖；每条必须含决策内容、依据（commit SHA / 报告路径）、日期与版本；决策变更时新增条目并注明取代关系，不修改历史条目。

---

## 初始条目（Phase 0，全部日期 2026-11-12，按事件发生顺序）

### DEC-001 会话锁设计定案：互斥交给内核，放弃内容仲裁（锁 v6）

- **决策内容：** 跨进程会话互斥采用 OS 句柄方案（FileShare.None 守护进程），彻底放弃基于文件内容的仲裁协议。核心教训："**互斥必须交给内核，内容仲裁必有竞态**"——锁 v1→v5 五个内容仲裁变体（rename 换出、世代验证、tombstone 票据、票据 fail-closed）均在审查中被证明存在 TOCTOU/初始化窗口类竞态（R5-R10 连续六轮 REWORK），v6 为 R10 定案。
- **依据：** commit `21d259d`（第十轮）、`54901ff`（第十一轮 MINOR 整改后 PASS）；实现 `phase0/e2e-poc/session_lock.mjs`；测试 `phase0/e2e-poc/test_session_lock_v6.mjs`；报告 `phase0/reports/rework10-2026-11-12.md`；11 轮闭环记录 `phase0/reports/phase0-closeout.md` §1。
- **约束衍生：** 后续任何新锁不得使用文件内容仲裁（`module-boundaries.md` §6）。

### DEC-002 GPT 网页控制采用 CDP 接管模式

- **决策内容：** 不用 Playwright 直启浏览器，而是普通方式启动系统 Chrome（专用 profile + 127.0.0.1:9222 调试端口），用户人工登录后 Playwright `connectOverCDP` 接管；消息收发走结构化 DOM 契约（unit-key 锚点 / DIL UUID 身份 / 发送双验 / 75s 确认窗），并内置契约自检、禁止盲发。不使用任何隐身/绕过手段（项目红线）。
- **依据：** `phase0/gpt-browser-poc/gpt_roundtrip.mjs`（POC-03，PASS_WITH_CONSTRAINTS）；`phase0/reports/gpt-browser-validation.md`；`phase0/reports/phase0-final-report.md` §3.1/§5.2/§5.8；审查修复 `7c45263`（发送双验严格时序）、`009a2d1`（pre-send 生成门）。
- **注意：** `gpt_roundtrip.mjs` 仍为 R2 前双闩锁写法，Phase 1 控制器统一按 R3+ 语义实现（closeout §5 待办）。

### DEC-003 GPT 登录方式：邮箱登录，不用 Google OAuth

- **决策内容：** Google OAuth 在自动化控制的 Chrome 中被 Google 直接拒绝，auth.openai.com Turnstile 对 Playwright 直启浏览器人工也无法通过；故采用邮箱 + 密码登录专用 profile（人工一次），登录失效时任务暂停转人工（AIEO 需有 OFFLINE / 人工接管状态）。
- **依据：** `phase0/reports/phase0-final-report.md` §5.1；`phase0/reports/phase0-closeout.md` §4"已声明的边界"。

### DEC-004 ChatGPT 网页依赖系统代理 127.0.0.1:10391

- **决策内容：** 部署机直连 chatgpt.com 不通，必须保持系统代理 127.0.0.1:10391 在线；Chrome 自动继承代理，自动化侧需继承/显式配置；AIEO 前置 chatgpt.com 探活的网络健康检查。
- **依据：** `phase0/reports/phase0-final-report.md` §2、§5.3、§6（风险表"代理中断"缓解项）。

### DEC-005 ZCode 接入双通道：MCP + 官方 CLI 外部启动

- **决策内容：** Agent 主动回调走 AIEO MCP Server（stdio，受控工具集，配置于 `~/.zcode/cli/config.json` mcp.servers，新会话自动连接）；任务触发走官方 CLI `zcode --prompt --cwd --mode --json`（结构化返回 sessionId/traceId/response/usage）。外部启动为官方接口，非逆向协议。
- **依据：** `phase0/zcode-mcp-poc/server.mjs`、`smoke_test.py`（POC-01，MCP 6/6 PASS）；`phase0/reports/mcp-validation.md`、`zcode-trigger-validation.md`（POC-02，PASS_WITH_CONSTRAINTS）；`phase0/reports/phase0-final-report.md` §3.2。
- **约束衍生：** `--json` 为结束后返回，运行中状态靠 Agent 经 MCP 主动上报（final-report §5.5）；MCP 配置改动需重启会话、schema 严格（§5.7）。

### DEC-006 外部取消 ZCode 任务的兜底方案

- **决策内容：** ZCode CLI 无 cancel 命令（无外部取消受支持接口）；采用超时 + 软取消（取消标记文件）+ 进程树终止兜底。
- **依据：** `phase0/reports/phase0-final-report.md` §5.4；`phase0/reports/zcode-trigger-validation.md`；`phase0/reports/phase0-closeout.md` §4"已声明的边界"。

### DEC-007 长 payload 走 Git 指针，不走网页

- **决策内容：** 大文件 / 长材料通过 Git 仓库落盘后只在网页传递指针（短消息），避免网页传输失真（ego 手册 §3.2 模式）。
- **依据：** `phase0/reports/phase0-final-report.md` §6（风险表"大 payload 网页传输失真"缓解项）、§7（长回复 >4KB 未实测，按 Git 指针方案规避）；`phase0/reports/phase0-closeout.md` §4。
- **关联待办：** `phase0/tools/gpt_dispatch.mjs` 单条 1200 字节上限 → 分块投递或 Git 指针，选型待开工会议确认。

### DEC-008 会话管理策略定稿（与 GPT 讨论定稿，closeout §2 ★ 项）

- **决策内容：** ①轮换优先级 = 阶段边界（强制）> 上下文容量/完整性（70-80%、压缩迹象、关键约束丢失）> 任务边界 > 消息数（仅提醒）> 响应延迟（辅助）；②每次轮换前生成《会话交接包》并提交仓库，区分事实/决策/待确认；③审查启动简报模板自包含；④审查三态 PASS/REWORK/BLOCKED，证据不足判 BLOCKED，测试绑定 commit SHA；⑤子 Agent 不直接对接审查会话，交付走标准化交付包，审查直接读 Git；⑥单会话单任务 + 锁资源边界按资源分锁写入设计文档。
- **依据：** `phase0/reports/phase0-closeout.md` §2（★ 项）；GPT 会务讨论 9 风险 + 15 建议 `phase0/logs/dispatch-2026-11-11T20-45-33/reply.txt`，commit `b954ca2`。

### DEC-009 Phase 1 组织方式：主会话编排 + 四子 Agent 分模块并行 + 公共契约先冻结

- **决策内容：** Phase 0 主会话仅做编排与验收，实施由子 Agent 承接；启动顺序 = Explore 摸底 → 主会话冻结平台级公共契约（模块职责/API 协议/数据模型/错误码/日志格式/分支策略，变更走统一申请）→ general-purpose 子 Agent 按统一任务单分模块实现（每模块独立分支+工作区，交付含 commit SHA + 测试原始日志）→ 独立集成验收（冻结候选 commit → 契约测试 + E2E → 独立审查会话验收）。
- **依据：** `phase0/reports/phase0-closeout.md` §3；`phase0/logs/dispatch-2026-11-11T20-45-33/reply.txt` 建议 7/8/14。
- **落地文件：** `docs/phase1/agent-contract.md`、`docs/phase1/module-boundaries.md`（均为 v0.1 草稿，待开工会议定稿）。

### DEC-010 审查闭环与 Git 规则

- **决策内容：** 每个代码任务独立分支；智谱不直接提交 main；审查与测试报告绑定明确 commit SHA；返工产生新 commit 且旧审查结论失效；合并 main 与发布生产必须人工审批；进度只按 ACCEPTED 计算；Agent 不能自行置 ACCEPTED。
- **依据：** `docs/立项/04-任务状态机数据库与Git规范.md` §3/§4/§6、`docs/立项/03-任务消息与报告协议.md` §10（v0.1，2026-11-12 前定稿的立项文档）；11 轮审查闭环实践（`phase0/reports/phase0-closeout.md` §1）。

---

## Phase 1 条目（待续记）

<!-- Phase 1 起按 DEC-001~010 格式续记 -->

### DEC-011 平台公共契约 v1.0 冻结（C1-C8 全部 v1.0.0）

- **决策内容：** 平台公共契约 C1-C8 冻结为 v1.0.0（`docs/phase1/platform-contract-v1.0.md`）：C1 API 协议（消息字段规则 + REST 端点表 + /messages 投递/ACK/重试/Dead Letter 语义 + C1/C7 边界）；C2 数据模型（16 张表字段/约束/索引/UTC/删除策略 + 实体关系与返工历史保留）；C3 错误码（统一错误响应 Schema + 九组 27 条编号表全量采纳 + HTTP 映射）；C4 日志规范（27 字段必填分级清单全量采纳 + NDJSON + `logs/phase1/<service>/` 落盘 + audit_logs 独立持久化 + 脱敏 + 审计同事务）；C5 分支策略（任务 ID `T-P1-<序号>`、分支正则、集成分支 `integration/phase1`、合并人工审批、可自动检查的提交信息规范）；C6 配置命名（`AIEO_` 前缀、env/文件映射、默认值表、秘密不进 Git、启动校验）；C7 认证授权（127.0.0.1 绑定、Argon2id、Session Cookie 三属性、CSRF、单 OWNER、MCP/CLI 独立本机身份、审计）；C8 版本兼容（契约版本与应用版本分离、supported_versions/minimum_supported_version、REQ-0003 拒绝、迁移窗口、migration version 独立、历史数据版本化解析）。配套：契约测试要求（机器可读 Schema 于 `contracts/v1.0/`，四模块引用同一版本禁止复制修改）；责任边界定稿（共享 ORM 归属 M1、迁移脚本归属 M1、锁服务由 M1 提供全部模块使用含 janitor、Git Worker 与 M1 事务边界、跨进程只经 M1 服务接口、Python 签名不构成公共契约）。**遗留 BLOCKED 一项**：M2 网页投递长 payload 分块选型（待开工会议）；批准待用户追认。子 Agent 不得私改本契约（agent-contract §6-1）。
- **依据：** `phase0/logs/dispatch-2026-11-11T21-10-19/reply.txt`（GPT 契约讨论完整产出：17 项 gaps、C3 错误码表、C4 日志字段清单、C7 认证方案、C8 版本机制、summary）；`docs/phase1/platform-contract-v1.0.md`（契约正文 v1.0.0，随本条目同批提交，对应 commit 即冻结 commit）；`docs/立项/03-任务消息与报告协议.md` v0.1、`docs/立项/04-任务状态机数据库与Git规范.md` v0.1（设计来源）；`docs/phase1/module-boundaries.md` @ commit `555fd44`（冻结基线）。
- **约束衍生：** 四模块并行实现公共接口前必须以本契约 v1.0.0 为准；变更走统一变更申请并更新兼容矩阵（契约 §1/§9.6）。

### DEC-012 GitPointer 契约修订与双向边界（BLOCKED-1 修订中，待复审）

- **决策内容：** 在 `docs/phase1/platform-contract-v1.0.md` §2.6 修订 C1：出站长材料统一采用 GitPointer，单文件与多文件均经 manifest；Schema 固定 `transport/owner/repo/branch/commit_sha/path/artifact_sha256/size_bytes/media_type/contract_version/task_id/execution_id`，完整 40 位 commit 是唯一读取依据，branch 不作 HEAD 回退。明确任务包/输入材料 commit 与 `reviewed_commit` 分离，审查结果同时绑定输入材料 commit、manifest 哈希、`task_package_hash`、被审查代码 SHA 与执行/correlation 身份。补齐公开/私有仓库真实会话权限、只读边界、发布/回读/派发顺序、路径范围、全量读取、不可信材料、秘密禁入、永久保留、大小/文件数配置和 GitHub 失败语义；GPT 不默认获得仓库写权限。
- **双向与失败边界：** 1200 UTF-8 字节只约束最终传给网页 `insertText` 的完整出站字符串，包含信封、指针、验收与输出格式要求，发送前本地测量，超限不发送、不截断、不拆分。入站 DOM 回复不受 1200 字节限制，必须按结构化 unit 完整读取，经生成结束、确认窗、assistant UUID 和全文稳定检查后，先持久化原始 artifact、计算 SHA-256/size，再做 JSON/Schema/绑定校验与 M1 幂等登记。暂时网络错误仅做有限退避；权限、不存在、SHA、路径、范围、媒体类型、hash/size 与版本绑定错误不得自动降级，统一按契约返回 BLOCKED；超时不等于任务失败，报告补登记不得重跑 GPT。
- **真实 POC 与状态：** 当前继承 GPT 审查会话已实际完成公开 GitHub 指定 commit 文件阅读、短指令投递和 4023 字符完整网页回复提取；原始回复为 8854 UTF-8 字节、SHA-256 `ce1ca55c5d6397995043b42a5a327fef7879a80306301fa9b61f170e0c7a5c71`，内容是可解析的完整 JSON，证明入站可超过 1200 字节。未宣称新 Schema、多文件、私有权限、故障注入、超限或写回测试已经执行。**BLOCKED-1 保持“修订中，待复审”，本条目不构成 PASS。**
- **依据：** `phase0/logs/payload-choice-inherited-reply.txt`（真实 GPT 审查：`result=BLOCKED`，15 项 `required_boundaries`、16 项 `failure_paths`，本修订逐条响应）；`docs/phase1/platform-contract-v1.0.md` §2.2/§2.6/§10/§12/§13 本修订；原审查对象 commit `81d63f71ef0c5efa65766c9da0331d4f449d06f2`（仅为修订前基线，不冒充本修订 SHA）。**本修订 commit 由主会话统一验收提交生成，与 DEC-012 同批；当前不预填或虚构 SHA，复审时必须以该实际提交的完整 40 位 SHA 为审查基线。**
- **关联与约束衍生：** 本条目细化 DEC-007 的 Git 指针方向并关闭其“分块或 Git 指针待选型”的开放口径，承接 DEC-011 的 BLOCKED-1，但不覆盖或改写历史条目。复审须按本修订 commit 逐项核对 GPT 全部要求及 POC 真实范围；复审 PASS 后由主会话另行记录结果并推进 §10 机器 Schema/契约测试落地，子 Agent 不得自行解除阻塞。

### DEC-013 入站完整性与机器 Schema 实现证据（BLOCKED-1 待复审）

- **决策内容：** 将 §2.6.7 从设计要求落实为可执行实现：`gpt_dispatch.mjs` 以本次 user unit key 为起点收集完整 assistant unit 区间，确认窗后两次完整读取比较 key 列表、数量、逐 unit 全文哈希及尾部 UUID；原始 `raw-units.json`/`reply.txt` 先落盘、回读校验 SHA-256/size 后再写 `result.json`。机器 Schema 统一放 `contracts/v1.0/`，正/负例使用 Ajv 验证。网页出站超限只缩短指令或改用 GitPointer，不再保留自动分块提示。
- **测试证据：** Schema 30/30（`phase0/logs/schema-tests.log`）；入站本地测试 9/9（`phase0/logs/rework-inbound-tests.{log,json}`）；真实网页 POC 回复 6625 UTF-8 字节，assistant UUID `8535d4f2-1c41-4091-817f-7b7c0f3f314a`，`reply.txt` SHA-256 `27c6c9e3c3e644cd6abcf0ebab932793d5f6c5dc3fb92aedbcc15e2b5f230af7`，证据目录 `phase0/logs/dispatch-2026-11-12T04-00-43/`，独立核验 17 项全 true（`independent-verification.json`），报告 `phase0/logs/inbound-real-poc.md`。
- **边界：** 真实 POC 为单 assistant unit；真实多 unit、虚拟列表裁切、网页故障注入、M1 登记/ACK/幂等补登记、私有权限和 GitPointer 端到端发布读取尚未验证。BLOCKED-1 仍待复审，本条目不构成 PASS。

### DEC-014 虚拟列表连续性与 M1 最小登记闭环（BLOCKED-1 待复审）

- **决策内容：** 入站完整性不得只凭当前可见 DOM 双读一致判定。区间采集必须证明连续：相邻窗口重叠 unit key 且原文/角色/UUID 一致，缺起点、跳窗、顺序冲突或未到终点均失败。报告成功前增加全文 JSON parse、Ajv Schema 与 task/execution/correlation 精确绑定。M1 采用最小本地登记适配器，幂等键包含 task_id/execution_id/correlation_id/artifact_sha256；恢复只重试登记，不重跑 GPT。
- **测试证据：** 本地入站 21/21（含中间 unit 裁切负例）；M1 登记 6/6；Schema 37/37。最终真实 POC `phase0/logs/dispatch-2026-11-12T04-41-46/`：回复 4072 字节，两个窗口完整重叠，双读 3553ms，JSON/Schema/ID 绑定通过，M1 `ART-M1-000002`，独立核验 23 项全 true。恢复文件 `phase0/logs/m1-recovery-retry.json`、`m1-recovery-duplicate.json`：首次失败重试成功、重复不新增，`no_new_gpt_send=true`。
- **边界：** M1 为最小本地 JSON 适配器，不是完整平台；真实多 assistant unit、真实动态裁切恢复、REST/数据库/ACK/并发与 GitPointer 私有权限/故障注入未验证。BLOCKED-1 仍待 GPT 复审。

### DEC-015 三 ID 强制、M1 并发互斥与 GitPointer 真实远程回读（待复审）

- **决策内容：** 请求 M1 登记时三 ID 与 Schema 必须齐全，缺一失败；M1 各 registry 以 OS 句柄锁保护整个读取-分配-写入-回读临界区，不使用内容仲裁。可滚动窗口若缺少独立逻辑 unit 序列，保守返回 `INBOUND_WINDOW_COMPLETENESS_UNPROVEN`，不把窗口重叠当成完整证明。GitPointer 材料文件项统一为仓库根相对 POSIX 路径。
- **测试证据：** 全量回归 10/10（`phase0/logs/third-round-regression-2026-11-12T05-17-03/result.json`）；三 ID 12/12、M1 并发 3/3、真实 Chrome 虚拟列表仿真 4/4（`phase0/logs/browser-virtual-list-2026-11-12T05-14-59/`，明确不是 ChatGPT 多 unit）、GitPointer 本地 21/21。
- **真实远程 POC：** commit `26ed31009ccb17d0ddf525e19b6d085d2f5193a8`，manifest 与两个材料通过 GitHub raw 按完整 SHA 回读均 200，`all_files_verified=true`；独立 hash/size 一致。报告 `phase0/logs/git-pointer-remote-poc.md`，结构化结果 `phase0/logs/git-pointer-remote-read-result.json`。首次 404 为 build root 使用错误，已如实记录并修正，没有改写读取语义。
- **边界：** 真实 ChatGPT 多 assistant unit/动态裁切仍未实测；M1 REST/数据库/ACK、私有权限及真实网络故障注入未验证。BLOCKED-1 待复审，不自行标 PASS。

### DEC-016 可滚动页面可用性与 M1 核心三 ID 强制（待复审）

- **决策内容：** 不再把所有可滚动 ChatGPT 页面视为发生虚拟裁切。滚动中实际观察到 unit 集合变化且缺少独立逻辑序列才 BLOCKED；集合稳定时以 `STABLE_RENDERED_UNIT_SET` 记录有限证据。M1 `registerArtifactLocked` 核心入口强制三 ID，防止绕过 `dispatch_options.mjs`；`REVIEW_REPORT` 仍强制 Schema PASS。
- **证据：** 全量回归 10/10（`phase0/logs/third-round-regression-2026-11-12T05-33-03/result.json`）；M1 核心 ID 负例补齐后 8/8（`phase0/logs/m1-registry-tests.{log,json}`）。此前真实派单曾被过度保守规则阻断，实际 GPT 回复保存于 `phase0/logs/latest-review-dom.json`，没有将该次标为成功提取。
- **边界：** 当前仍未提供独立完整逻辑 unit 序列，不宣称排除持续隐藏 unit；真实多 assistant unit/动态裁切恢复未实测。M1 REST/数据库/ACK、私有权限和真实网络故障注入未验证。BLOCKED-1 待复审。

### DEC-017 BLOCKED-1 核心路径 PASS_WITH_CONSTRAINTS，允许 Phase 1 开工

- **决策内容：** 接受新审查会话的范围拆分结论：已验证核心路径允许开工，扩展场景不解除限制。允许范围：短指令、公开 GitHub 指定完整 40 位 SHA 材料读取、单 assistant unit 长回复与稳定 DOM 集合、Schema/三 ID、M1 最小本地幂等及 OS 句柄并发锁。任何集合变化、完整性不明、私有权限不足、登记异常均 fail-closed/BLOCKED。不得据此直接合并 main或宣称 BLOCKED-1 全场景通过。
- **后续独立验收门禁：** 真实 ChatGPT 多 assistant unit、真实动态虚拟列表裁切恢复、私有仓库权限、真实网络故障注入与退避耗尽、多文件部分读取失败、M1 REST/数据库/ACK 与完整平台并发验证；每项需可复现证据并绑定 commit SHA 经独立审查。
- **依据：** `phase0/logs/dispatch-2026-11-12T05-45-15/reply.txt`（新空白审查会话通过 Git 交接包给出 `result=PASS` 与 13 条约束）；`handoff/REVIEWER-BOOTSTRAP.md`；`platform-contract-v1.0.md` §2.6、§12；实现与测试证据 DEC-012–DEC-016。

### DEC-018 平台公共契约与 Agent 协作契约用户追认（附条件批准，2026-11-14）

- **决策内容：** 用户对 Phase 1 公共契约完成追认，方式=分项审阅附条件批准（审阅材料 `docs/phase1/contract-ratification-brief.md` 三层：决策摘要/C1-C8 审阅卡/未决风险清单）：
  1. `platform-contract-v1.0.md` v1.0.0：**C1~C8 全部批准**；其中 **C1 附条件**——其 §2.6（GitPointer 双向 payload，BLOCKED-1 修订稿）以 **DEC-012 复审 PASS 为生效条件**，复审前按现行约束运行；**C7 附知情**——首期边界为单机单用户（127.0.0.1），Phase 1 测试通过不视为生产安全验证完成，局域网开放须另立方案（§8.8）；
  2. `agent-contract.md` v0.1：**批准转正**（其 §7 独立集成验收已执行完毕，八条铁律经 T-P1-901 八轮 + T-P1-902 两轮实战验证）；
  3. **追认不改变 BLOCKED-1 状态**（PASS_WITH_CONSTRAINTS，扩展场景未验收），不构成对任何扩展场景的解除授权。
- **关联决策（同批用户拍板，2026-11-14）：** Phase 1 收尾路线采纳 GPT 会务建议（`phase0/logs/dispatch-2026-11-13T16-31-45/reply.txt`，会话 6af73baa）并修正为 **A 契约追认 → B main 合并（先准备后审批）→ C1 DEC-012 复审 → D M2 真实链路工程化（拆 D1/D2）→ C2 扩展场景分批复审逐项解除 → E Phase 1 验收清单核对**；main 合并策略=A 完成后单独准备与审批；BLOCKED-1 策略=分批复审、逐项解除限制。
- **依据：** 用户拍板记录（2026-11-14，本会话 AskUserQuestion 三项决策："全部按建议批准"/"A 后单独准备与审批"/"分批复审逐项解除"）；GPT 会务建议 reply.txt（10606 字节，reply SHA-256 `f469208bea1d00defde93bedadf589b40f146d26845e8cf2bb4a8070078a1059`，dispatch 目录 `phase0/logs/dispatch-2026-11-13T16-31-45/`）；契约 §1 批准人字段、§13-1（追认即生效）。
- **生效操作：** 契约 §1 批准人更新、变更记录表追加、§13-1 关闭、agent-contract 状态转正，与本条目同批提交。

### DEC-019 main 合并执行：Phase 0/Phase 1 全部成果入库（2026-11-14，用户审批）

- **决策内容：** 经用户 2026-11-14 审批，`fix/AIEO-PHASE0-REVIEW-R10` 以 `--no-ff` 合并进 `main`，merge commit **`971a3710f7ca1b7d410163f01c1d215c661daec1`**（48 commits：Phase 0 POC-01~05 与十一轮审查闭环、Phase 1 治理与 BLOCKED-1 各轮、T-P1-901 模块级八轮 PASS、T-P1-902 集成两轮 PASS、收尾治理文档）。合并前核对（merge-proposal @ `fbf0b5b`）：main 为 HEAD 祖先无分叉、零文件删除、无未验收/来历不明提交（最后代码变更 `064f214` 经 T-P1-902 审查）；合并前回归四模块全绿不低于基线（M1 43 / M2 65 / M3 53 / M4 24，exit=0，日志 `phase1/logs/merge-prep-20261114/`）。**本合并不构成 BLOCKED-1 任何扩展场景的解除授权**（DEC-017/DEC-018 边界不变）。
- **回滚：** `git revert -m 1 971a371`（普通 merge 提交，不改写历史）。
- **依据：** 用户审批记录（2026-11-14 本会话"批准合并"）；审批材料 `phase1/logs/merge-prep-20261114/merge-proposal.md`（commit `fbf0b5b`）；GPT 会务建议 `phase0/logs/dispatch-2026-11-13T16-31-45/reply.txt`（B 项合并前置检查清单）；DEC-010 人工审批铁律、platform-contract C5 §6.3-2、agent-contract §6-2。
- **关联：** 同批恢复 `phase0/logs/gpt-reviewer-session.json` 会话指针（GPT 会务会话 `6af73baa-2060-83ec-a9cd-8e144f9f508b`，dispatch-2026-11-13T16-31-45 新建）；此后治理/文档工作以 main 为集成基线提交，代码任务按 C5 §6.1 开独立分支。
