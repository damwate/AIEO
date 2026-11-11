# Phase 0 收尾与交接文档（Phase 1 起点）

**日期：** 2026-11-12
**状态：** Phase 0 十一轮独立审查闭环，GPT 最终结论 **PASS**（第十一轮，仅 1 个非阻断 MINOR，已整改复跑验证）
**分支：** `fix/AIEO-PHASE0-REVIEW-R10` @ `54901ff31d9109cc614a977292bcf50c8943ce6c`（已推送 GitHub damwate/AIEO；main 未动，等待用户决定合并）

---

## 1. 审查闭环记录

| 轮次 | 分支/Commit | 结论 | 核心问题 → 修复 |
|---|---|---|---|
| 1 | R1 `559f627` | REWORK | e2e 判定硬编码 / type:module 冲突 → 验收计算化 |
| 2 | R2 `7c03fde` | REWORK | 生成判定不严格 → 判定模块 + 6 条件 + 反向测试 |
| 3 | R3 `7c45263` | REWORK | stopOk 闩锁污染 → verifySendAcceptance 严格时序 |
| 4 | R4 `009a2d1` | REWORK | true→true 持续可见 → pre-send 生成门 |
| 5 | R5 `77472e7` | REWORK | 并发无互斥 → 会话锁 v1 |
| 6 | R6 `01857f3` | REWORK | 锁初始化窗口/回收 TOCTOU → v2 |
| 7 | R7 `49e6ffd` | REWORK | rename 非CAS → v3 换出+世代验证 |
| 8 | R8 `937314b` | REWORK | rename 仍非CAS → v4 票据+unlink前复核 |
| 9 | R9 `df4340f` | REWORK | 票据初始化窗口/schema → v5 fail-closed |
| 10 | R10 `21d259d` | REWORK | 死票据清理 TOCTOU（内容仲裁根缺陷）→ **v6 OS 句柄** |
| **11** | `54901ff` | **PASS** | 仅 MINOR（路径硬编码）→ 已整改复跑 |

每轮 GPT 原始 JSON 结论、派单文本、截图：`phase0/logs/dispatch-*/`、`phase0/reports/rework{,2..10}-2026-11-12.md`。

## 2. GPT 审查会话管理策略（本节为长期执行规则）

1. **当前审查会话**：`https://chatgpt.com/c/6af4af83-0718-83e8-be08-e427bfb06b96`（配置存于 `phase0/logs/gpt-reviewer-session.json`），累计 ~15 轮消息，**尚未接近迁移阈值**。
2. **迁移阈值（满足其一即换新会话）**：①消息数 > 60；②单次回复延迟明显变长/出现"无法加载"；③**阶段边界**（Phase 0→Phase 1 即是——旧会话沉淀了 11 轮争论上下文，新阶段用新会话避免偏见）。
3. **迁移操作**（一条命令）：`node phase0/tools/gpt_dispatch.mjs --new-session --message-file <自包含简报>`——首条消息必须**自包含**（角色 + 仓库/分支/commit + 审查范围 + 输出 JSON 格式），不依赖旧会话记忆（ego 手册"新会话首条消息发自包含简报"）。
4. **单会话单任务**：同一会话同一时刻仅一个在途任务（会话锁 v6 已代码强制）。

## 3. 执行会话（ZCode）管理策略

1. 本会话（Phase 0 主会话）已完成使命，上下文很长——**Phase 1 实施工作由子 Agent 承接**，本会话仅做编排与验收。
2. Phase 1 启动时：先派 **Explore 子 Agent** 摸清 06-MVP 实施计划相关的现有代码结构 → 再派 **general-purpose 子 Agent** 分模块实现（平台基座/GPT 控制器/ZCode Bridge/Git Worker 四个可并行的模块边界）→ 主会话只做集成、验收、派单审查。
3. 长任务/长输出一律落盘（`phase0/logs/`、Phase 1 的 `app/logs/`），不进对话上下文。

## 4. Phase 1 入口要点（给下一个执行者的最小上下文）

- **已验证可用的技术路径**（全部有真实证据，报告在 `phase0/reports/`）：
  - GPT 网页控制：CDP 接管模式（普通启动 Chrome + connectOverCDP）+ DOM 契约（unit-key/DIL UUID/发送双验/75s 确认窗）——`phase0/gpt-browser-poc/gpt_roundtrip.mjs`
  - ZCode 接入：MCP（`~/.zcode/cli/config.json` mcp.servers）+ 官方 CLI `--prompt --cwd --json` 外部启动——`phase0/zcode-mcp-poc/`
  - 会话互斥：锁 v6 OS 句柄方案——`phase0/e2e-poc/session_lock.mjs`（**互斥必须交给内核，内容仲裁必有竞态**——11 轮审查的核心教训）
  - Git 采集：`phase0/git-poc/git_collect.py`（9/9 步）
- **已声明的边界**：Google OAuth 与自动化浏览器不兼容（用邮箱登录）；ChatGPT 依赖系统代理 127.0.0.1:10391；外部取消 ZCode 任务无官方接口（超时+软取消+进程终止兜底）；长 payload 走 Git 指针不走网页。
- **Phase 1 范围**（06-MVP 实施计划）：项目注册、任务 CRUD/状态机、消息 Inbox/Outbox、报告与附件、审计、看板——Vue3+TS 前端 + Python FastAPI 后端 + SQLite。
- **进入条件**：用户确认合并 Phase 0 分支（或以当前分支为基线）后开工。

## 5. 已知待办（不阻塞，Phase 1 处理）

- [ ] `phase0/tools/gpt_dispatch.mjs` 单条 1200 字节上限 → Phase 1 实现分块投递（ego 手册 R2.6-F）或 Git 指针
- [ ] `gpt_roundtrip.mjs` 仍为 R2 前双闩锁写法（POC-03 历史证据），Phase 1 控制器统一按 R3+ 语义实现
- [ ] MCP Server 调用记录 NDJSON 化（MINOR-003 整改安排）
- [ ] ZCode 权限模式分级（MINOR-004）、Git 路径配置化（MINOR-005）
- [ ] 锁 v6 的 workDir 清理（当前 release 时不删，累积锁工作目录；Phase 1 加 janitor）
