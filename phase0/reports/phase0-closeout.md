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

## 2. GPT 审查会话管理策略（本节为长期执行规则；★ = 已与 GPT 讨论定稿，2026-11-12）

1. **当前审查会话**：`https://chatgpt.com/c/6af4af83-0718-83e8-be08-e427bfb06b96`（配置存于 `phase0/logs/gpt-reviewer-session.json`）。
2. **★轮换优先级**：阶段边界（强制轮换）> 上下文容量/完整性风险（使用率 70-80%、出现压缩迹象、关键约束丢失）> 任务边界 > 消息数（**仅作提醒阈值，不作硬依据**——消息数不反映上下文负载）> 响应延迟（辅助信号）。轮换在任务可暂停、有明确交接点时执行。
3. **★《会话交接包》制度**：每次轮换前生成并提交仓库，含：目标/阶段/仓库/分支/基线 commit/工作区状态/已完成与未完成/**架构决策（注明版本）**/模块契约/已知风险/历史审查结论/测试命令与结果/下一步/禁止事项；**区分事实（附证据）、决策（注明版本）、待确认（不得当事实）**。
4. **★审查启动简报模板**：角色+仓库+分支+**目标 commit SHA+父 commit SHA**+验收标准+允许修改范围+必查文件与证据+测试环境+历史遗留风险+结论判定规则——首条简报足以让新会话独立审查。
5. **★审查协议**：PASS/REWORK/BLOCKED 三态；**证据不足无法核实 → BLOCKED**（不误判通过）；测试结果必须绑定被审查 commit SHA。
6. **★子 Agent 不直接对接审查会话**：向主会话提交**标准化交付包**（分支+commit SHA+变更清单+接口变更说明+测试原始日志+已知问题+回滚方式）；主会话向审查会话提供 commit SHA+证据路径，**审查直接读 Git，不采信自述**。
7. **迁移操作**：`node phase0/tools/gpt_dispatch.mjs --new-session --message-file <简报>`。
8. **单会话单任务**：会话锁 v6 已代码强制；★锁的资源边界须写入设计文档并按资源分锁（浏览器/工作区/Git/部署），明确持有者、超时、异常释放、人工边界。

> 依据：与 GPT 的会务讨论（完整 JSON 见 `phase0/logs/dispatch-2026-11-11T20-45-33/reply.txt`），9 项风险 + 15 项建议。

## 3. 执行会话（ZCode）管理策略

1. 本会话（Phase 0 主会话）已完成使命，上下文很长——**Phase 1 实施工作由子 Agent 承接**，本会话仅做编排与验收。
2. Phase 1 启动时：先派 **Explore 子 Agent** 摸清现有结构 → **主会话先冻结平台级公共契约**（模块职责/API 协议/数据模型/错误码/日志格式/分支策略，变更走统一申请，子 Agent 不得私改公共接口）→ 再派 **general-purpose 子 Agent** 按统一任务单分模块实现（每模块独立分支+工作区，交付包含 commit SHA+测试原始日志）→ **集成验收阶段**：冻结候选 commit → 跨模块契约测试 + E2E → 独立审查会话对最终候选 commit 验收。治理文件落 `docs/phase1/`（agent-contract / module-boundaries / handoff-template / review-protocol / decision-log）。
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
