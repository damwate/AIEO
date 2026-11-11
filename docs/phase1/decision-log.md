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
