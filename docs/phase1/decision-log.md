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

### DEC-020 DEC-012 复审入口门禁重划分：对象身份门禁 + 双层保证（r4 会务决议，2026-11-14，用户批准）

- **决策内容：** T-P1-903 DEC-012 复审 r1/r2/r3 三轮独立审查均因审查环境能力限制 BLOCKED（r1 逐文件额度不足；r2 二进制正文不可读；r3 分片 base64 后 14/14 分片 tree blob SHA-1 身份核对可行但环境无本地字节处理与密码学计算能力，不能解码/哈希/解包），均 BLOCKED_NOT_MATERIAL_DEFECT 未进实质审查。经会务决议（方案 A，GO）并经用户 2026-11-14 拍板批准，调整保证责任（**验证责任重新分配，非降低实质审查标准，三态判定与缺陷严重程度规则不变**）：
  1. **主会话本地受控环境承担字节级完整性保证（BYTE_INTEGRITY_GATE）：** 分片逐项核验、按索引片序拼接、base64 解码、TAR 三项总哈希、解包、95/95 文件 SHA-256/size 核验、manifest_tool recheck（commit blob SHA-256+tree blob SHA-1）与 verify（磁盘字节 SHA-256），机器核验记录绑定 commit+manifest SHA 入库存证（`phase0/logs/blob-recheck-*`、`phase0/logs/bundle-gate-*`，工具 `phase1/tools/manifest_tool.mjs` r4 版、`phase1/tools/bundle_gate.mjs`）；
  2. **独立审查者承担 Git 对象身份保证（OBJECT_IDENTITY_GATE，零计算）：** 对固定审查基线 commit 一次 tree 获取，manifest 95 文件 `git_blob_sha1`/size 逐项字符串比对 + 14 分片 + TAR + 双索引身份核验，缺失/重复/额外/不符任一即 BLOCKED；通过后直接读取文本审查对象开展实质审查；
  3. **两门禁分开登记，不得互相替代，不得合并成笼统 PASS**；审查者对 BYTE_INTEGRITY_GATE 记录只引用不背书；任一门禁失败或记录缺失/矛盾不得进入正式 PASS；
  4. **不得扩大解释：** Git blob SHA-1 仅为对象身份标识，不等价 SHA-256 完整性证明、不表示内容已读取/已审查、不表示排除碰撞或供应链攻击；二进制正文未被独立读取的不得声称完成二进制内容审查；
  5. **升级条款：** 未来审查环境具备本地计算能力后可重新评估恢复 A+ 全哈希独立核验；本协议是当前环境条件下的正式执行协议，不是永久降级。
- **轮次纪律：** r1–r3 保持 BLOCKED 历史记录，不改写为 REWORK；r4 为治理契约与入口门禁修订轮（本条目 + 引导包 r5 版 + manifest r4 版含 `git_blob_sha1` 字段 + 聚合包/索引刷新）；r5 按新协议重新执行独立复审；**采纳本决议不等于 DEC-012 PASS**，最终结论只能由 r5 实际审查产生。
- **依据：** `phase0/logs/dispatch-2026-11-13T17-57-41/reply.txt`（会务 r4 路由决议：推荐 A/GO，含保留/转移保证清单、MUST 约束清单 A-D、治理边界三项、决议文本；reply.txt SHA-256 `51d8773c1c0c6f5ce200d45baf00a11121c1a4e3fe1a9b75e37c6c73adb3b293`）；r3 审查记录 `phase0/logs/dispatch-2026-11-13T17-45-33/reply.txt`（BLOCKED/F-805 ENVIRONMENT，reply SHA-256 `67bbe2aafe9014804fbfab1febd3e9ea6aeeb825107bd0b055d8d323fa506e13`）；用户拍板记录（2026-11-14 本会话 AskUserQuestion"批准方案 A"）。
- **关联与约束衍生：** 细化 DEC-012 复审机制而不改变其审查对象与 31 项实质审查标准；r5 引导包 `handoff/DEC012-REVIEW-BOOTSTRAP.md` §2.5 为新协议文本；BLOCKED-1 状态与 DEC-017/DEC-018 边界不变。

### DEC-021 DEC-012 复审 r6 PASS：§2.6 修订生效为契约文本（2026-11-14）

- **决策内容：** T-P1-903 DEC-012 GitPointer 契约修订复审 r6（新空白审查会话）结论 **PASS**：15 项 required_boundaries 与 16 项 failure_paths 全部 ADDRESSED、§2.6.9–§2.6.13 POC 申报与实际证据相符无 overclaim、§2.6.1–§2.6.8 文本与三份机器 Schema 自洽，无 MAJOR/MINOR 阻断。**PASS 效果边界（按 r6 引导包 §4 与 DEC-018 附加条件）：** 仅解除 `platform-contract-v1.0.md` §2.6"修订中，待复审"标注使其**生效为契约文本**，并授权主会话推进 §10 机器 Schema/契约测试落地；**不解除 DEC-017 任何扩展场景限制**（BLOCKED-1 扩展场景逐项待验收不变），不授权 main 合并或发布动作。历史条目（DEC-012~DEC-016 标题中的"待复审"字样）不回溯改写，以本条目为准。
- **审查过程登记：** 入口采用 r4 双层保证协议（DEC-020）：OBJECT_IDENTITY_GATE（审查者，零计算）——递归 tree 一次调用未截断，manifest 95/95 文件 git_blob_sha1+size 全匹配、14/14 分片、TAR+双索引 3/3、缺失/额外均为 0，I3 双索引 bundle_source_commit 均正确指向 material_commit；BYTE_INTEGRITY_GATE（主会话本地，审查者引用不背书）——recheck tree 95/95+blob SHA-256 95/95+身份 95/95、bundle_gate 14/14 分片四项+TAR 三项总哈希+解包 95/95、verify 95/95+身份 95/95，三门禁 exit=0。轮次沿革：r1 额度 BLOCKED/r2 二进制正文不可读 BLOCKED/r3 无本地计算 BLOCKED（均 BLOCKED_NOT_MATERIAL_DEFECT 未进实质审查）/r4 治理修订（DEC-020）/r5 身份门禁本体通过但两处准备缺陷 BLOCKED（I3 两阶段表述+证据 404，均非材料缺陷）/r6 PASS。r1–r5 保持 BLOCKED 历史不改写；采纳协议或 PASS 均不改变历史结论。
- **依据：** `phase0/logs/dispatch-2026-11-13T18-25-03/reply.txt`（r6 审查回复，reply.txt SHA-256 `ccd006db…` 起始，reviewed_commit=`54bcf6f081f6c952e8ae7b66b3568a2bbe3133da`=tag `review-anchor/T-P1-903-r6`，manifest SHA-256 与 31 项逐项核对清单见该 JSON）；机器门禁证据 `phase0/logs/blob-recheck-T-P1-903-r6/`、`phase0/logs/bundle-gate-T-P1-903-r6/`、`phase1/manifests/T-P1-903-verification-report-r6.json`（绑定 amend 前聚合包 commit `ca3e5cfe7d56a4951a74e1663443310c4455dc4a`，amend 仅追加证据目录）；r6 修正会务确认 `phase0/logs/dispatch-2026-11-13T18-19-28/reply.txt`。
- **关联与约束衍生：** 本条目关闭 DEC-018 中 C1 的"以 DEC-012 复审 PASS 为生效条件"附加条件（§2.6 生效）；§10 机器 Schema/契约测试落地为下一步授权工作，由主会话推进；子 Agent 不得据此自行解除任何扩展场景限制（agent-contract §6）。

### DEC-022 总体规划复盘重排与执行授权（原则批准，2026-11-14，授权期至 10:30）

- **决策内容：** 用户 2026-11-14 暂停 T-P1-904 实施发起总体规划与可行性复盘（EXP-PLANNING-001 §四触发情形 4/5/7），复盘后原则批准四项方向调整：①**垂直切片优先**——新 P0-B"D1′ 真实端到端垂直切片"（一条真实低风险需求走最小闭环，作为核心前提验证器与契约体系第一个真实消费者），插入于 Phase 4 之前；②**审查仪式分档简化**——对象身份门禁保留（便宜有效），分片聚合包仪式仅在材料超出审查环境能力时启用；③**T-P1-904 缩编**——契约机器化从 130+ 文件缩编为 D1′ 消费子集 15-20 文件（信封/错误响应/开发·测试报告/messages·tasks·reports 端点）+ matrix.json（READY/PENDING 四字段），其余随消费者增量补齐；④**交付物落位**——PROJECT-MASTER-PLAN 为总纲单一真源（引用不复制），路线重排记入 06-计划追加 §10，进度盘点升级 PHASE-STATUS 持续维护，可行性登记 FEASIBILITY-REGISTER 新建，下阶段任务清单并入 06 §10.3。**授权安排：** 授权期至 2026-11-14 10:30（本地），期间问题按 ChatGPT 会务意见执行、无需逐项等用户、全部留痕；**不可逆动作仍暂缓**（删材料/改冻结契约/动 main 需留待用户复核）；任务号段重排（904/905/906）经会务确认后另行登记（DEC-023 预留）。
- **边界与不改变事项：** 硬边界四项不变——不合并 main（DEC-010 需用户审批）、不发布、契约冻结文本不修改（机器化按 §10 授权范围落地）、DEC-017 扩展场景限制不解除；五份交付物文本属**待确认**（标注"待用户 10:30 审阅"），不得视为已批准；EXP-PLANNING-001 §六"审查意见不等于项目变更授权"继续适用。
- **依据：** 用户原话"好的，接下来你跟智谱好好完成接下来的工作，碰到问题，以chatgpt的意见执行即可，10点30我才会再参与进来；当前交接给下一个会话吧"（2026-11-14，交接包 V3 §3-4）；交接包 V3 commit `e19c000`；复盘盘点 `docs/reviews/2026-11-14-总体规划与可行性复盘-主会话盘点.md`；EXP-PLANNING-001（`docs/AI-DEV-LESSONS.md` §10.1）。
- **落地交付物（同批提交，均标注待用户 10:30 审阅）：** `docs/PROJECT-MASTER-PLAN.md` v0.1、`docs/立项/06-MVP实施计划与验收标准.md` §10、`docs/PHASE-STATUS.md` v0.1（含 E 验收核对矩阵）、`docs/FEASIBILITY-REGISTER.md` v0.1。

### DEC-023 任务号段正式裁定：方案 A（904 缩编先行 → 905 D1′ → 906 C2 第一批）与 T-P1-904 固定范围（2026-11-14，会务裁定+两轮复核+限定终验闭环）

- **决策内容：** 关闭 DEC-022 预留的号段登记项，任务号段与会务两轮独立复核后**正式裁定选方案 A**：**T-P1-904 契约机器化缩编版先行**（固定 20 文件，见下）→ **T-P1-905 D1′ 真实端到端垂直切片**（前置=T-P1-904 完成并通过验收；任务书 `docs/phase1/D1PRIME-VERTICAL-SLICE-BRIEF.md` v0.2）→ **T-P1-906 C2 扩展场景分批复审第一批**（前置=T-P1-905 通过；逐项解除不批量解除）。**T-P1-904 固定范围（文件级，会务裁定）：** 全部限定 `contracts/v1.0/`，共 **20 文件**=19 个契约 Schema（message-envelope / task-plan-request / task-plan-submitted / development-completed / development-report / test-report / error-response / projects-create / batches-create / tasks-create / tasks-event / tasks-detail-response / tasks-list-response / messages-create / messages-ack / messages-list-response / reports-development / reports-test / reports-list-response）+ `matrix.json`；**既有 GitPointer 三份机器 Schema 保留不重复创建、不误计为新增**；TASK_PLAN_REQUEST / TASK_PLAN_SUBMITTED / DEVELOPMENT_COMPLETED 三消息类型先覆盖（不代表其余 13 种取消）；只覆盖 D1′ 实际所需端点，不含登录/审批/审计/附件。**matrix.json 严格四字段**（不增加第五字段）：`required_capability`（能力标识）/`implementation_status`（READY/PENDING，READY 必须有契约实现或机器定义，不能仅凭 Schema 文件存在认定）/`test_status`（READY/PENDING，READY 必须有实际执行的正负例测试证据）/`acceptance_batch`（string/null，计划验收批次，**不代表验收已通过**；D1′ 首批能力=T-P1-905）。**清单调整规则（终审收紧）：** 只允许有记录地缩减非必要项（留原因与矩阵记录）；禁止实施中自行增加文件或扩大契约范围；确需增加另行提交会务审批。
- **边界与不改变事项：** 本裁定为**工作范围**裁定，不构成对契约冻结文本的修改授权（冻结契约不改）；不解除 DEC-017 扩展场景限制；不授权合并 main；matrix 的 implementation_status/test_status/acceptance_batch 语义不混淆——登记 READY 不等于验收通过。
- **复核与终验闭环（全部独立新空白会话，按完整 SHA 读取）：** ① 首轮会务复核 `phase0/logs/dispatch-2026-11-13T19-27-30/reply.txt`（§四"号段裁定：选择 A"、§4.2 四字段确认、§五最终号段安排；result=REWORK 三项修订；reply SHA-256 `af47e5bdd426bc975e73a95ebf3e5e58fb83228bfc021473924230a4d04a750e`）；② 修订 commit `4797dcf` 后二轮复核 `phase0/logs/dispatch-2026-11-13T19-39-15/reply.txt`（三项主体认可、904 固定 20 文件与 matrix 四字段认可无扩张、无越权；REWORK 仅限 F-01/F-02/F-03 一致性）；③ F-01/F-02/F-03 修订 commit `329f402` 后限定终验 `phase0/logs/dispatch-2026-11-13T19-46-59/reply.txt`（**result=PASS 3/3**，"本轮针对 F-01/F-02/F-03 的 REWORK 已完成闭环，可以结束本轮复盘交付物修订"；reply SHA-256 `5a7bd896e0fdec0ab7da4efda4dfd2cd7a5cfd3472ef9d5bc4886542acf98253`，审查基线=329f402cf10bfb4851e455a471f620d7205314bc）；会务同时明确本 PASS 不构成 T-P1-904 实施授权，904 实施按既有授权链（DEC-022 §10 落地授权 + 本号段裁定）执行。
- **落地位置：** `docs/立项/06-MVP实施计划与验收标准.md` §10.3（号段表+依赖递进）/§10.3.1（20 文件表+四字段定义+调整规则）；`docs/PHASE-STATUS.md` §5 指针；`docs/FEASIBILITY-REGISTER.md` F-004/F-007 验证路径。
- **关联：** DEC-022（原则批准与授权期）、DEC-021（§2.6 生效与 §10 机器化授权）、DEC-017/DEC-018（扩展场景边界不变）；任务书 `docs/phase1/D1PRIME-VERTICAL-SLICE-BRIEF.md` v0.2；机器证据 `phase1/logs/e-check-20261114/`（41 端点/20 表）。

### DEC-024 授权期后工作会议四项决议：904 关闭／合并授权（merge commit 改判）／905 D1′ 有边界开工／交付物逐份定稿制度（2026-11-14，用户逐项拍板）

- **决策背景：** 用户 2026-11-14 08:39 提前回归（授权期原定至 10:30），指示"现在开会，你把问题发给chatgpt讨论，我在旁边看着"；主会话按交接包 V4 §5 议程派单新空白会务会议（简报 `phase0/tools/post-auth-meeting-request.txt` 1136 字节；证据 `phase0/logs/dispatch-2026-11-14T00-47-28/`，会话 6af7afd6-731c-83ee-8042-7ef16319b3be，reply.txt SHA-256 `cc20552cb4746bf81ea7fc0ff3f8fa6c8fc44a99d8fb42f089974df2a3614d63`，9054 字节双读稳定）。会务确立治理原则：**审查 PASS、交付关闭、合并 main、后续开工为四个独立授权节点**，不合并成一个决定；用户随后以 AskUserQuestion 逐项拍板四项（2026-11-14）。
- **DEC-024-A：T-P1-904 交付复核正式关闭（用户拍板"确认关闭"）。** 依据修订链 bd07098→c16a654→62e992f 与会务限定复核 **PASS 4/4**（reply SHA-256 `476818bc…` 起始，审查对象 `62e992fae19c863561b217d93e187e1dc0e05409`）；测试证据 Ajv 141/141 全绿、M1 回归 43 passed（`phase1/logs/t-p1-904-20261114/`）。**关闭范围边界（会务原文）：** 904 交付验收关闭 ≠ main 合并完成 ≠ Phase 1 整体验收完成 ≠ 解除 DEC-017；不再重复开启已通过验收项。
- **DEC-024-B：T-P1-904 分支合并 main 授权（用户拍板"批准合并"，方式经改判确认 merge commit）。** 会务首选 FF 保 4 commits（merge commit 评级"可接受"、squash 不建议——四个提交本身即治理证据）；因 main 在分支分叉后新增交接包 V4 治理两笔（`6daa89a`/`e330d7c`）致 FF 前提破坏（main 不再为分支祖先），主会话如实披露后用户 2026-11-14 改判"**改用 merge commit（推荐）**"；rebase 改写被复核 SHA 与重置已推送 main 两路均排除。合并前置核对（会务清单）：分支预期 head=`3966491e500a1bea49d57d22d0e2c72244930968`（合并时实查一致）；合并范围=分支 4 commits（bd07098/c16a654/62e992f/3966491）。**合并结果（已执行）：merge commit `a445a77391ba44812a99a675201dfc351cb48255`**（2026-11-14 执行 `git merge --no-ff`，合并唯一冲突为 runtime 会话指针文件按"最新指针保留"取 main 侧解决；origin/main 同步确认）。合并后登记：PHASE-STATUS v0.3（904=已合并/验收 PASS）；matrix.json 本次不回改已审查值（acceptance_batch=T-P1-905 计划批次语义按 DEC-023 保留），会务对 acceptance_batch 的语义澄清（"表达某一批验收证据的归属关系，不当作项目阶段或合并授权"）自本决议起作为登记口径，实际批次归属在 905 验收时更新。
- **DEC-024-C：T-P1-905 D1′ 有边界开工授权（用户拍板"批准有边界开工"）。** 四约束（会务决议全文）：①**必须真实外部资源**——Mock 返回值/本地伪造成功响应/仅内部函数调用/无真实外部副作用的模拟流程一律不构成端到端验收；外部资源暂不可用应如实记录 BLOCKED 或未验证，不得把模拟通过登记为真实端到端 PASS；②**必须 fail-closed**——外部资源不可用/请求超时/响应格式不符契约/外部执行结果无法确认/关键身份状态或关联信息缺失/无法确认操作是否已发生时，必须停止成功路径，尤其避免超时后盲目重试造成重复执行；③**DEC-017 原有约束不解除**——单助手长响应核心路径/稳定 DOM/公开 GitHub SHA 读取已验证，多单元和虚拟列表恢复能力尚未验证；PASS_WITH_CONSTRAINTS 不得扩大解释为所有场景 PASS；④**限定 D1′ 范围**——以已批准交付范围为准，不得顺手扩大为 DEC-017 扩展场景解禁/C2 扩展能力开发/冻结契约修改/全量 Phase 1 验收/未经授权的生产发布。开工授权文本（会务建议原文）："T-P1-905 D1′ 获准进入实施阶段。以 904 已验收交付为前置基础，按限定范围验证真实外部资源端到端链路。所有外部调用必须具备明确的失败关闭、状态确认及证据留存机制。DEC-017 约束、冻结契约及未授权扩展范围继续有效。完成后另行提交独立验收，不因开工授权获得合并或发布权限。"
- **DEC-024-D：五份交付物逐份审阅定稿制度（用户拍板"逐份审阅制度"）。** 技术终验（内容完整性/相互一致性/规则可执行性）与用户审阅（真实业务意图/治理意图）职责分离；三状态：**TECHNICALLY_PASSED**（技术终验通过，五份现状态）→ **USER_REVIEWED**（用户完成该份审阅）→ **FINALIZED**（用户正式确认定稿）；五份分别审阅不要求一次性全审；用户提出修改意见进入修订流程，不直接覆盖已验收版本；全部确认后登记整体定稿完成。
- **固定纪律（会务建议，自本决议起生效）：** ①**PASS 不等于授权**——任何合并、发布、解除限制都必须有明确授权依据；②**归档不等于定稿**——技术证据和用户确认分别记录；③**下一任务不继承上一任务的额外权限**——905 的授权不能自动扩展到 906 或 C2。
- **依据：** 会议回复全文与逐项理由 `phase0/logs/dispatch-2026-11-14T00-47-28/reply.txt`（Q1-Q4 结论+DEC-024 四条款结构建议+三条固定纪律建议+DEC-017 保留声明）；用户拍板记录（本会话 AskUserQuestion：四问四答按会务建议全票+改判一问 merge commit，2026-11-14）；议程来源交接包 V4 §5（main `e330d7c`）。
- **关联：** DEC-023（号段与 904 固定范围）、DEC-022（授权期框架由本决议收尾）、DEC-010（合并审批制——本条为其首个逐任务授权实例）、DEC-017/DEC-018（扩展场景边界继续有效）；任务书 `docs/phase1/D1PRIME-VERTICAL-SLICE-BRIEF.md` v0.2。

### DEC-025 本轮开发后召开"整体需求初步满足度"评估会：复杂场景缺口不阻塞、用中记录修复或规避（2026-11-14，用户指示登记）

- **用户指示原文（2026-11-14，D1′ 执行完毕报告后）：** "这一轮开发完成后，我们再开会讨论是否已初步满足整体需求，如果有一些复杂场景做不到也没关系，用的过程中我们记录下来，修复或者规避"。
- **登记口径：** ①"这一轮开发"=T-P1-905 D1′ 九步真实端到端最小闭环（2026-11-14 执行完毕登记 PASS，全链记录 `phase1/logs/t-p1-905-d1prime-20261114/RUN-RECORD.md`，开发分支 `feature/T-P1-001-bundle-gate-help`=`916d8b2`、证据分支 `feature/T-P1-905-d1prime`=`a2895af`，均未合并 main）；②下一步动作=召开**整体需求初步满足度评估会**（对照 06 §2 七项+§7 26 项现状评估），会议为咨询性质、结论待用户拍板；③**复杂场景容忍方针**——部分复杂场景暂做不到不阻塞整体推进，在使用过程中如实记录问题，按"修复或规避"处置；本方针调整的是**处置策略**，不调整登记真实性纪律（问题记录仍须如实、不伪装满足）。
- **边界不变：** 本登记不构成合并 main（DEC-010）/发布/契约冻结文本修改授权；D1′ 独立验收（DEC-024-C"完成后另行提交独立验收"）与 906 C2 启动条件（DEC-023 递进"前置 905 通过"）不在本登记中自动生效或取消，留评估会议商定、用户拍板。
- **关联：** DEC-024（审查 PASS/交付关闭/合并/开工四节点独立——本会属第五类节点"整体满足度评估"）、DEC-023（号段递进）、DEC-010（合并审批）、DEC-017/018（扩展场景边界与 C2 复审机制不变）。

### DEC-026 整体需求满足度评估会决议：整体认定 B／路线 A（905 验收→F-003→F-001→多角色→906 顺延）／905 双分支独立验收后合并审批；设立使用期问题登记处（2026-11-14，会务评估+用户三决议拍板）

- **会议证据：** 派单 `phase0/tools/overall-satisfaction-meeting-request.txt`（1185 字节，新空白会话）；回复 `phase0/logs/dispatch-2026-11-14T01-44-31/reply.txt`（15674 字节双读稳定，reply SHA-256 `e49d80856902f564fc46e104e88ff93b8dc5a900991a4bf7725018070ed2db11`，assistant UUID `aa9c41c3-5bcc-4da3-a356-c3d28d40844b`）；审查基线 main=`38ee462591ab19c3cd4a9c347621e72f2c4be05b`（会务实读仓库核验）。会议定位：会务咨询、整体评估，不产生自动授权。
- **会务核心判断：** AIEO 已跨越到"真实业务链路端到端运行"（D1′ 九步真实闭环 PASS=核心技术路线初步验证），但**核心技术闭环成立 ≠ 整体自动化已初步满足**。三层使用等级：A 技术验证（已达，D1′）／B 受控试运行（下一阶段目标：少量真实任务+必备架构审核/真实测试/代码审查/批次审计，人工调度可暂存）／C 整体自动化（最终目标，不作当前门槛）。**必补项：** GPT-02/03/04/05、F-003 测试执行 Worker、F-001 中央调度（可分阶段）、新 commit 重审触发；**可带缺口项：** 工作区人工核验、F-005 管理后台、DEC-017 扩展场景、多项目并发、多角色会话恢复等。会务特别强调 GPT-02~05 与 F-003 属十步流程必要职责，不因复杂场景容忍全部延期，但可逐角色逐能力建设。
- **决议一（用户拍板 B）：** 核心技术闭环已验证，**整体自动化尚未初步满足**；补齐必要能力后再进入受控试运行；不以等级 C 作为试用门槛。下一目标=等级 B 受控试运行。
- **决议二（用户拍板 A）：** 下一阶段开发路线 = **T-P1-905 双分支独立验收 → F-003 测试执行 Worker 最小版（单环境真实执行+日志采集+结构化报告，失败如实登记）→ F-001 中央调度最小版（单项目/单批次/单任务自动调度）→ GPT-02/03/04/05 逐角色接入 → 受控试运行 → T-P1-906 顺延（不取消、不解除 DEC-017、DEC-023 前置仍适用、启动另行决定）**。F-003/F-001 均须达到最低可用，多角色逐个验证可不等全部完成再集成。
- **决议三（用户拍板 A）：** 905 双分支（开发分支 `feature/T-P1-001-bundle-gate-help`=`916d8b2`、证据分支 `feature/T-P1-905-d1prime`=`a2895af`）**分别独立验收**（开发分支审代码/测试/提交与任务范围符合性；证据分支审 RUN-RECORD/33+7 份证据/引用一致性；双向 SHA 交叉核验），双过再由用户批准合并（DEC-010）；执行 PASS 不直接合并。
- **工程治理落地：** 新增 `docs/USAGE-ISSUE-REGISTER.md` v0.1（使用期问题统一登记处：P0-P3 分级/固定字段/处置流程/"有规避≠已修复、不删记录、修复必有证据"三规则）；FEASIBILITY-REGISTER 继续专管技术假设，两册互引不混用。每批真实任务结束做一次问题复盘，避免逐小问题无边界立项。
- **边界不变：** 合并 main 需用户审批（DEC-010）；DEC-017 扩展场景限制不解除；DEC-024-C"905 开工授权≠独立验收≠合并授权"继续适用；本决议不自动启动任何开发任务——F-003/F-001/多角色各自立项另行走任务流程。
- **关联：** DEC-025（评估会指示与复杂场景容忍方针）、DEC-023（号段递进——906 顺延但前置不变）、DEC-010/017/024；`docs/PHASE-STATUS.md` §5 路线同步。

### DEC-027 T-P1-905 D1′ 双分支独立验收关闭并合并 main：三轮复核全 PASS，用户批准合并（2026-11-14，DEC-010 用户拍板）

- **验收沿革（证据分支 feature/T-P1-905-d1prime，历史完整保留未重写）：** 执行提交 `a2895af`（九步真实闭环）→ 首轮独立验收 `dispatch-2026-11-14T01-53-57`（A PASS／B BLOCKED／C PASS／D REWORK，F-01~F-04）→ 证据修订 `36bedf5`（F-01 §8 基线差异/F-02 计数 33→32/F-03 扫描机器证据 CLEAN/F-04 §9 验收记录）→ 二轮限定复核 `dispatch-2026-11-14T02-05-34`（F-03 PASS，F-01/F-02/F-04 REWORK）→ 证据修订 `f838d8c`（§8 表述修正 12 文件实比/计数终版 34 沿革 33→32→34 如实登记/§9 同步）→ 三轮限定复核 `dispatch-2026-11-14T02-10-45`（assistant UUID `dfc05f26`，reply 4467B SHA `3fc9af55`，依据 `f838d8c`：F-01/F-02/F-04 全 PASS，F-03 沿用二轮 PASS）→ 扫描工具补归档 `cbda19a`（sec_scan_905.py 保证 F-03 可复现）。开发分支 `feature/T-P1-001-bundle-gate-help`=`916d8b2` 首轮 A 项 PASS 无返工、全程未动。
- **合并执行（用户批准，904/DEC-024-B merge commit 先例）：** `9ce7872` 开发分支合入（无冲突，bundle_gate.mjs +22 行）；`91b11df` 证据分支合入（冲突两处手工融合：`docs/PHASE-STATUS.md` §5 保留 DEC-026 路线并更新双分支终态、版本表恢复证据侧完整 v0.4 行+保留 v0.5 行+增补 v0.6 合并登记；会话指针取最新 `dispatch-2026-11-14T02-10-45`）。合并后 main 含 D1′ 全链证据/RUN-RECORD/FEASIBILITY v0.3/PHASE-STATUS v0.6。
- **验收关闭效力：** T-P1-905 D1′ 独立验收正式关闭（比照 DEC-024-A 先例）；九步 PASS 结论与 RUN-RECORD 复盘（含五项如实登记）作为等级 B 受控试运行的证据基线。FEASIBILITY-REGISTER v0.3 批注 TECHNICALLY_PASSED 仍待用户审阅定稿（归档不等于定稿）；五份交付物按 DEC-024-D 逐份审阅定稿不变。
- **边界不变：** 本次合并仅覆盖 T-P1-905 两分支，不构成任何后续任务授权；DEC-017 扩展场景限制不解除；M1 四条 PENDING 消息 ACK 不在九步范围、不因合并自动处置；下一任务 F-003 按 DEC-026 路线另行立项，不继承本任务额外权限。
- **关联：** DEC-026（决议三执行完毕）、DEC-024-C（验收条款履行）、DEC-010（合并审批）、DEC-023（906 前置不变）。

### DEC-028 T-P1-907（F-003 测试执行 Worker 最小版）开工授权：用户拍板（2026-11-14）

- **授权对象：** 任务书 `docs/phase1/F003-TEST-WORKER-BRIEF.md` v0.5（会务限定复核无保留定稿 PASS，dispatch-2026-11-14T02-44-38，reply 3194B SHA `42835467…`；执行基线=定稿提交 `e869d0d`，文件 Blob SHA `38aa2d9a`，此后任务书文本不再改动）。立项沿革：v0.1 起草（`b2ea16f`）→ 会务评审三项拍板全过+F-01~F-06 六项补充（02-25-47）→ v0.2 三处语义补（`34ed923`，02-31-46）→ v0.3 五行穷举闭合（`f6de854`，02-35-59）→ v0.4 NOT_EXECUTED 边界闭合（`a044b54`，02-40-28）→ v0.5 限定复核 PASS（`e869d0d`）。
- **授权文本（用户拍板 2026-11-14，比照 DEC-024-C 边界文本）：** 批准按任务书 v0.5 执行 S2–S7；**完成后另行提交独立验收，不因开工获得合并或发布权限**；双分支分离提交；DEC-017 扩展场景限制不解除；范围限定任务书 §3 硬边界与 §12 不在范围清单（M1 不改/M4 不扩展/F-001 不提前/GPT-04 链路不提前开放）；零 mock 红线与八项验收标准（§11）照旧。
- **执行形态：** 主会话 ZCode 腿真实开发 + ChatGPT 腿真实规划收发（任务书 §1，D1′ 先例）；方案 B 下本任务不做 M1 REST 登记、Worker 默认无业务凭据（§9）。
- **边界不变：** PASS≠授权／归档≠定稿／下一任务不继承上一任务额外权限；906 保持原任务身份另行启动（DEC-023）。
- **关联：** DEC-026（决议二路线第二项落地）、DEC-027（前置：905 已合并）、F-003（FEASIBILITY-REGISTER，完成时关闭或降级）。

### DEC-029 T-P1-907（F-003 测试执行 Worker 最小版）独立验收关闭：A8 限定复核 PASS，八项 8 PASS/0 REWORK/0 BLOCKED（2026-11-14，合并待用户批准）

- **验收沿革（证据分支 `feature/T-P1-907-evidence`，历史完整保留未重写）：** 执行提交 `669fe54`（EXEC-907001~004 四次真实执行+六项 BLOCKED 拒绝+Ajv 两层 141/141+R1-R5 扫描 CLEAN+RUN-RECORD）→ 首轮独立验收 `dispatch-2026-11-14T03-06-25`（reply 5448B SHA `637d8018…`：A1~A7 全 PASS/BLOCKED 0，唯一 A8 REWORK=§7 计数 53/17 漏计两份输入文件）→ 证据修订 `f44bbca`（计数 53→55、17→19 如实登记沿革不掩盖+新增 §9 验收记录+规划/验收证据及两份派单简报入库解除上轮 404 读取限制）→ A8 限定复核 `dispatch-2026-11-14T03-24-12`（新空白会话，reply 4893B SHA `f46f3b85…`，对象=`f44bbca`：A8-1 计数修正准确且两漏计文件实读有独立 Blob/A8-2 §9 保留首轮 REWORK 沿革/A8-3 规划证据 19102B SHA `2920da04` 读取成功/A8-4 证据链完整；Git compare 核验未重写历史、dev 未动、main 未修改）→ 复核归档 `9e35966`（§9 补录+复核证据入库）。**最终三态：8 PASS/0 REWORK/0 BLOCKED。** 开发分支 `feature/T-P1-907-test-worker`=`b711160`（单文件 `phase1/tools/test_worker.py` 193 行，Blob `0e4d7ab9`）首轮即 PASS 无返工、全程未动。
- **验收关闭效力：** T-P1-907 独立验收正式关闭（比照 DEC-024-A/DEC-027 先例）；会务认可整改方式"修正文档计数、保留历史、补齐证据，而不是重做已通过的 Worker 实现或重复执行"；复核结论作为 DEC-028 授权期内独立验收完成依据。FEASIBILITY-REGISTER v0.4 同步登记 F-003 关闭（移入 §2 成果保护区）。
- **F-003 边界（关闭不等于扩展）：** 最小版范围=单环境真实执行+三件套日志采集+结构化报告+方案 B 零 REST 零凭据；GPT-04 检查真实测试证据的消费链路未提前开放（随多角色接入另行）；多环境/并发/重试/调度不在最小版范围（任务书 §12）。
- **边界不变：** 验收关闭不构成合并授权——两分支合并 main 待用户批准（DEC-010）；DEC-017 扩展场景限制不解除；M1/M4/冻结契约（blob `1bda905c`）未触碰；F-001 按路线另行立项，不继承本任务额外权限。
- **关联：** DEC-028（开工授权）、DEC-027（前置：905 已合并）、DEC-026（决议二路线第二项完成）、FEASIBILITY-REGISTER v0.4（F-003 关闭）。

### DEC-030 T-P1-907 双分支独立验收关闭并合并 main：A8 限定复核全 PASS，用户批准合并（2026-11-14，DEC-010 用户拍板）

- **验收沿革（证据分支 `feature/T-P1-907-evidence`，历史完整保留未重写）：** 执行提交 `669fe54`（四次真实执行+六项 BLOCKED 拒绝+Ajv 两层+R1-R5 CLEAN）→ 首轮独立验收 `03-06-25`（A1~A7 全 PASS，唯一 A8 REWORK=计数）→ 证据修订 `f44bbca`（53→55/17→19 如实登记+§9+证据入库）→ A8 限定复核 `03-24-12`（**8 PASS/0 REWORK/0 BLOCKED**）→ 复核归档 `9e35966`。开发分支 `b711160` 首轮即 PASS 无返工、全程未动。独立验收正式关闭（DEC-029 登记），F-003 关闭（FEASIBILITY-REGISTER v0.4）。
- **合并执行（用户批准，904/DEC-024-B/DEC-027 merge commit 先例）：** `e127968` 开发分支合入（无冲突，`test_worker.py` +193 行）；`70053f3` 证据分支合入（与 main 侧 DEC-029/v0.4/v0.7 登记无冲突——证据分支未触碰治理文档；合并前 main 工作区未跟踪阻塞文件经逐字节 SHA-256 核验与分支内容一致后移除，无内容损失）。合并后 main 含 F-003 Worker 代码+全链证据+RUN-RECORD+规划/验收/复核三组 dispatch 证据与四份派单简报；会话指针取最新（03-24-12）；PHASE-STATUS v0.8 合并登记。
- **验收关闭效力：** T-P1-907 独立验收正式关闭（比照 DEC-024-A/DEC-027 先例）；F-003 最小 Worker 交付进入等级 B 受控试运行证据基线。FEASIBILITY-REGISTER v0.3 批注 TECHNICALLY_PASSED 仍待用户审阅定稿（归档不等于定稿）；五份交付物按 DEC-024-D 逐份审阅定稿不变。
- **边界不变：** 本次合并仅覆盖 T-P1-907 两分支，不构成任何后续任务授权；DEC-017 扩展场景限制不解除；GPT-04 检查真实测试证据的消费链路未提前开放；M1 四条 PENDING 消息 ACK 不在范围、不因合并自动处置；下一任务 F-001 按 DEC-026 路线另行立项，不继承本任务额外权限。
- **关联：** DEC-029（验收关闭）、DEC-028（开工授权）、DEC-026（决议二路线第二项完成）、DEC-010（合并审批）。

### DEC-031 用户临时授权：会务意见代理决策（2026-11-14 指示时刻起至 14:30，14:30 后用户回归）

- **指示内容（用户原话）：** "后续有问题你跟chatgpt开会讨论，下午14:30之前都以他的意见为准，之后我会参与进来"。
- **效力边界：** ①适用窗口=本指示起至 2026-11-14 14:30（本地）；②窗口内 F-001/T-P1-908 立项评审、任务书修订与定稿、是否开工等决策**以会务（ChatGPT 腿真实派单收发）意见为准**，主会话逐项如实登记会务意见与依据；③**14:30 后用户回归**，届时未决事项（含开工后各节点）恢复用户拍板惯例；④本授权不改变的红线：秘密不进 Git（C6）、零 mock、历史不重写、派单纪律（≤1200 UTF-8 字节/--new-session/按完整 40 位 SHA 读仓库/reply 原始字节+SHA 信任）、**合并 main 仍留待用户**（DEC-010 不因本授权松动——即使会务窗口内同意合并也不执行，留用户回归后拍板）、DEC-017 不解除、冻结契约只消费；⑤窗口内所有会商以"评审会/讨论会"形态经 gpt_dispatch.mjs 真实收发并逐轮归档证据。
- **关联：** DEC-026（决议二路线——F-001 立项进行中）、DEC-028（F-003 开工流程先例）、DEC-010（合并审批保留）。

### DEC-032 F-001/T-P1-908 任务书 v0.3 定稿：三轮会务评审 PASS（2026-11-14，DEC-031 窗口内会务定稿；开工授权留用户）

- **立项沿革：** v0.1 初稿（`8c33ae5`）→ 第 1 轮评审会 REWORK 六项（dispatch-2026-11-14T03-54-34，reply 5082B SHA `20b580d1…`：S7 半自动如实申报/S0 PRECHECK 零副作用/幂等扩展 S1/S5/S6/S8+超时先只读核实/失败报告五要素+RAW 泄漏阻断/分步处置/A1–A8 可验收化）→ v0.2（`5c91c5a`）→ 第 2 轮复核六项 6/6 PASS+三项设计 3/3 PASS、遗留 R1–R3 文字收口（04-00-35，reply 7332B SHA `5a150943…`）→ v0.3（`bff5de6`+`ebc50d4`）→ 第 3 轮限定复核三项 3/3 PASS 无遗留（04-10-57，reply 2605B SHA `d20caa11…`，按上轮指示不扩大范围）。
- **定稿要点：** 十步 S0–S9（S0 PRECHECK 全只读+锁文件生命周期=运行协调操作非业务副作用；S7=方案 b 编排会话=真实执行者，905 未曾验证全自动开发、不虚报）；三态分界（BLOCKED 仅 S0；S0 后失败=ORCHESTRATED_FAIL+失败报告五要素）；幂等/隔离分界（同 run 幂等键复用；跨 run 实体命名绑定 run_id、同名冲突停止登记不认领）；超时≠未成功（先只读核实，宁停不盲试）；RAW 泄漏阻断归档；A1–A8 全部附可执行判定条件；三项设计采纳（S7=b／夹具=bundle_gate `--version`／Python stdlib 单文件）。
- **权责边界（会务第 3 轮原话）：** 本次 PASS 是会务任务书复核通过，**不代表用户已经批准开工、不代表允许直接修改 main 或绕过用户授权；最终开工决定仍由用户作出**。
- **边界不变：** DEC-031 窗口 14:30 后用户回归；开工后执行形态照 DEC-028 先例（完成后另行独立验收，不因开工获得合并/发布权限）；派单纪律照旧；M1 零修改。
- **关联：** DEC-031（窗口授权）、DEC-026（决议二路线第三项）、F-001 登记（开工后关闭或降级）。

### DEC-033 T-P1-908 开工拍板：用户重申窗口内授权主会话自行拍板，主会话决定开工（2026-11-14 13:35，DEC-031 窗口内）

- **用户重申（13:35 原话）：** "现在什么情况了，有多大工作量，我之前不是说了2点30之前你自己排版吗"——"排版"按上下文为"拍板"（同音），重申 DEC-031 授权：14:30 前主会话按会务意见自行拍板、不需等待用户逐项批准。
- **拍板内容：** 主会话依据 DEC-032 定稿任务书 v0.3 决定 T-P1-908 开工，按任务书 §2 执行 S0–S9 十步（S7=方案 b 编排会话=真实执行者；夹具=bundle_gate `--version`；Python 标准库单文件）。
- **执行形态（照 DEC-028 先例）：** 完成后另行独立验收，不因开工获得合并/发布权限；双分支分离（dev=调度器代码，evidence=RUN-RECORD+证据）；M1 零修改；零 mock；零 mock 红线与 §11 八项验收照旧。
- **权责衔接：** 14:30 用户回归后，执行重大偏离与 main 合并决策回归用户拍板（DEC-010）。
- **关联：** DEC-031（窗口授权）、DEC-032（任务书定稿）、DEC-028（执行形态先例）、DEC-010（合并审批保留）。

### DEC-034 T-P1-908 执行完成登记：ORCHESTRATED_PASS（run ORCH-908019，2026-11-14 16:01 本地）

- **结果：** 19 个真实 run（908001–908019）中 **ORCH-908019 ORCHESTRATED_PASS**（08:01:35Z，exit 0）：十步 S0–S9 全链真实走通——S6 M3 真实 claim（EXEC-010，注入重复 claim → TASK-0003 fail-closed）、S7 方案 b 真实开发（bundle_gate `--version` 四项验收实测）、S8 M4 真实 commit_and_collect（commit `fda9183` / ART-DIFF-005 / 管道测试 exit 0）、S9 开发报告 accepted → **task T-P1-018 实达 DEV_REPORTED** + A3 双重放 verified（artifact duplicate:true / message 409 RES-0003 / submit report_registry.duplicate:true）。BLOCKED 全程未触发（S0 后失败均 ORCHESTRATED_FAIL）。
- **失败驱动工程如实留证：** 18 个 FAIL run 对应 17 个修复提交（5112321→35c98f9，分支 feature/T-P1-908-scheduler），每个 commit message 注明暴露缺陷的真实 run 与只读契约出处；全部失败报告五要素齐全；S8 后失败 run 的 fixture 环境按设计态重置（同一 patch 重放，中间 commit SHA 7f36dc9/9a54728/471ade9/6faa2f0 留档，分支未推送无共享历史改写），终局保留 PASS run 提交 `fda9183`（feature/T-P1-908-fixture）。
- **证据：** feature/T-P1-908-evidence 分支 phase1/logs/t-p1-908-20261114/（RUN-RECORD.md 十步绑定+全量复盘+A1–A8 矩阵；SEC-SCAN-T-P1-908-001 CLEAN 756 文件 0 RAW 泄漏；SHA256SUMS 757 项；18 dispatch dir ≥T05 原始字节）。
- **人工接管检查点（brief §1 范围内）：** M1/Chrome 启停（调度器零触碰）；908003 前 Composer 残留草稿 CDP 清理；908004 回读不一致诊断+链接化根因探测（证实 scheme 边界软换行，派单工具零修改、调度器侧去 scheme 适配）。
- **边界：** 三分支推送后另行独立验收（新空白会话派单，A1–A8 简报 ≤1200B）；**合并 main 留用户拍板（DEC-010 不松动）**；M1/M2/M3/M4 零修改（只读消费契约）；M1 四条 PENDING 消息 ACK 超范围；M3 CLI 独立驱动开发腿为后续升级目标（DEC-032 ①如实申报）。
- **关联：** DEC-033（开工拍板）、DEC-032（任务书 v0.3）、DEC-028（执行形态）、DEC-010（合并审批保留）、F-001（验收通过后关闭）。

### DEC-035 T-P1-908 独立验收第 1 轮 REJECT 登记与补证修复闭环（2026-11-14 16:24–16:5x 本地）

- **第 1 轮派单：** phase0/logs/dispatch-2026-11-14T08-24-15/（--new-session 新空白会话，1122B 自包含简报：三分支完整 SHA+任务书对照 SHA+A1–A8 步骤+回复格式）。reply.txt sha256=`1e3742d406ea60eaaf85dcb6046d3631390fbbb3fcfd272bc67309b17e5f49a9`。
- **判定：REJECT**——A2/A3/A6/A7 PASS；**A1/A4/A5/A8 FAIL（阻断）**，审阅人明示"不得合并，等待补证及修复后重新独立验收"。执行会话零申辩全采纳，逐项定性：A4=交付缺陷（任务书 §11 A4 要求"登记类故意缺参→真实 REQ-0001→该 run ORCHESTRATED_FAIL+五要素"，此前误以 S6 重复领取探测 TASK-0003 充当且 RUN-RECORD §8 误标——任务书误读）；A1/A5/A8=补证缺口（缺独立 task_events 审计、缺 sha256sum -c 实测、缺可重现指南与逐项 SHA 引用要求）。
- **修复与补证（全部真实链路，零 mock）：**
  - A4：scheduler 新增 `--inject-a4` 专用失败采集演示模式（feature/T-P1-908-scheduler 提交 2b3e622→8f3a635）；演示 run ORCH-908020（首版向量过简→真实链路 REQ-0002，fail-closed 拒判，如实留证）→ 对照 mcp_server.mjs:279-282 分层修正向量 → **ORCH-908021：真实链路 REQ-0001（"report.correlation_id 缺失且当前会话无在途领取可继承"，905 §5-1 同形态）→ ORCHESTRATED_FAIL exit 1 + 失败报告五要素齐全**，判定条件达成。
  - A1：evidence 分支新增 task-events-audit.json（M1 REST 只读读回）+ task-events-audit-serverlog.ndjson（M1 服务端审计 28 行）+ zero-db-direct-modification-declaration.md。
  - A5：triplet-audit.json（21 run 149 组三件套 incomplete=0）+ SHA256SUMS 重生成（908 项）+ sha256sum-c-result.txt（908/908 OK）。
  - A8：REPRODUCE-GUIDE.md（逐条重现命令）+ round1 原始字节归档；RUN-RECORD §8 改任务书原文逐字对照、新增 §10。
  - 重扫：security-scan.txt 793 文件 disk+git 树双范围仍 **CLEAN**；evidence 分支补证提交 77a48d1。
- **第 2 轮派单：** 另行发起（--new-session，简报携更新后完整 SHA+REPRODUCE-GUIDE 入口+reply 逐项引用证据 SHA 要求）；**合并 main 仍留用户拍板（DEC-010 不松动）**。
- **关联：** DEC-034（执行完成）、DEC-028/DEC-033（执行形态）、DEC-010（合并审批保留）、T-P1-905 §5-1（A4 先例）。
