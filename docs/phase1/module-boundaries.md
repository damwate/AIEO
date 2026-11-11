# AIEO 模块边界与公共契约（Phase 1）

**版本：** v0.1（初稿）
**日期：** 2026-11-12
**状态：** 初稿——Phase 1 开工后由架构设计定稿；凡标注 **[开工会议定稿]** 的条目以开工会议为准
**依据：** `docs/立项/06-MVP实施计划与验收标准.md` §2（Phase 1 范围）、`docs/立项/03-任务消息与报告协议.md`、`docs/立项/04-任务状态机数据库与Git规范.md`、`phase0/reports/phase0-final-report.md`（已验证技术路径）、`phase0/reports/phase0-closeout.md` §3/§5

---

## 1. 总览

Phase 1 四个实现模块 + 一个前端应用。依赖方向单一：M2/M3/M4 依赖 M1，模块之间互不直接依赖（通过 M1 的消息/任务接口协作）。

```text
M1 平台基座（app/platform/）  ←——  被以下模块依赖（消息、任务、审计、附件）
  ↑          ↑          ↑
M2 GPT 控制器   M3 ZCode Bridge   M4 Git Worker
(app/gpt_controller/)(app/zcode_bridge/)(app/git_worker/)
                      ↓
              Web 前端（Vue3+TS，06-计划 §2 技术栈）
```

目录命名（`app/<module>/`）为初稿约定，**[开工会议定稿]**。

## 2. 模块职责与边界

### M1 平台基座（app/platform/）

- **职责：** 项目注册；Git 仓库配置（repositories）；需求批次（batches）；任务 CRUD + 任务依赖（tasks / task_dependencies）；任务状态机（04-规范 §1 的 14 状态，状态机引擎唯一持有方）；消息 Inbox/Outbox（03-协议 §9：去重、同事务登记、ACK、重试、Dead Letter、超时查询）；报告与附件（artifacts，sha256）；操作审计（audit_logs）；进度看板后端（完成率只按 ACCEPTED 计算，04-规范 §4）。
- **技术栈：** Python FastAPI + SQLite（数据库设计支持迁移，业务逻辑不依赖 SQLite 特有行为——04-规范 §5）。
- **允许修改目录：** `app/platform/`、`tests/platform/`、`app/models/`（共享 ORM 模型，**[开工会议定稿]** 是否独立为共享包）。
- **对外接口草案：**
  - REST API（前缀 `/api/v1/`，**[开工会议定稿]**）：`/projects`、`/repositories`、`/batches`、`/tasks`（含依赖与状态转换端点）、`/messages`（Inbox/Outbox 查询与投递）、`/reports`、`/artifacts`、`/audit`、`/board`；
  - 消息结构遵循 03-协议 §2（schema_version / message_id / correlation_id 必填）；
  - 状态转换只接受事件/报告，拒绝 Agent 直接置 ACCEPTED（04-规范 §3）。
- **依赖：** 无（被 M2/M3/M4 与前端依赖）。

### M2 GPT 控制器（app/gpt_controller/）

- **职责：** GPT 网页会话的接管与收发——专用 Chrome profile 启动、CDP 接管、DOM 契约收发（unit-key 锚点 / DIL UUID 身份 / 发送双验 / 75s 确认窗）、契约自检（DOM 改版探测，禁止盲发）、回复提取。
- **允许修改目录：** `app/gpt_controller/`、`tests/gpt_controller/`。
- **复用来源：** `phase0/gpt-browser-poc/gpt_roundtrip.mjs`（POC-03，PASS_WITH_CONSTRAINTS）。**注意（closeout §5 待办）：** 该 POC 仍为 R2 前双闩锁写法，Phase 1 必须按 R3+ 语义重写——`verifySendAcceptance` 严格时序（第三轮修复 `7c45263`）、pre-send 生成门（第四轮 `009a2d1`），不得照搬。
- **对外接口草案：**
  - `send_task_message(agent_id, session_url, text) → send_receipt`（双验通过凭证）；
  - `wait_reply(agent_id, timeout) → reply_text + capture 元数据`；
  - `check_dom_contract() → 自检结果`（unit 锚点计数、composer 探测）；
  - 五角色扩展沿用同一控制器，每会话绑定 URL + agent_id，同一会话同一时刻仅一个在途任务（final-report §3.1）。
- **依赖：** M1（消息收发、附件）；浏览器会话锁（module-boundaries §6）。
- **硬约束（Phase 0 实测）：** 邮箱登录（Google OAuth 被拒、Turnstile 阻断）；系统代理 `127.0.0.1:10391` 必须在线；不用任何隐身/绕过手段（项目红线）。

### M3 ZCode Bridge（app/zcode_bridge/）

- **职责：** AIEO MCP Server（stdio，受控工具集：任务领取 / 进度上报 / 结果提交）+ 官方 CLI 外部触发封装。
- **允许修改目录：** `app/zcode_bridge/`、`tests/zcode_bridge/`。
- **复用来源：** `phase0/zcode-mcp-poc/server.mjs`（POC-01，MCP 6/6 PASS）+ `phase0/zcode-mcp-poc/smoke_test.py`；外部触发命令形态 `zcode --prompt "<任务包>" --cwd <项目> --mode <按风险> --json`（POC-02，PASS_WITH_CONSTRAINTS）。
- **对外接口草案：**
  - MCP 工具：`claim_task` / `report_progress` / `submit_result`（报告结构对齐 03-协议 §6）；
  - CLI 触发封装：`trigger(task_package) → {session_id, trace_id, response, usage}`；
  - 取消封装：软取消（标记文件）+ 进程树终止兜底。
- **依赖：** M1（任务状态、消息、报告登记）；工作区写锁（module-boundaries §6）。
- **硬约束（Phase 0 实测）：** 外部取消无官方接口 → 超时 + 软取消 + 进程终止兜底（final-report §5.4）；`--json` 为结束后返回，运行中状态靠 Agent 经 MCP 主动上报（§5.5）；MCP 配置改动需重启会话生效、schema 严格（§5.7）；调用记录 NDJSON 化为 MINOR-003 待办（closeout §5）。

### M4 Git Worker（app/git_worker/）

- **职责：** Git 状态检查 / 基线记录 / 分支创建 / 提交 / SHA 采集 / Diff 读取 / 工作区干净检查 / 测试日志核验辅助。
- **允许修改目录：** `app/git_worker/`、`tests/git_worker/`。
- **复用来源：** `phase0/git-poc/git_collect.py`（POC-04，9/9 步 PASS，证据 `phase0/logs/git-poc-result.json`）。
- **对外接口草案：**
  - `repo_status(repo)` / `record_baseline(repo)` / `create_branch(repo, name)` / `commit_and_collect(repo, message) → sha + diff` / `check_clean(repo)` / `read_diff(repo, base, target)`；
  - 交付核验（agent-contract §4）的 Git 检查由本模块提供能力。
- **依赖：** M1（任务/仓库配置、审计）；Git 集成锁（module-boundaries §6）。
- **硬约束：** Git 路径配置化为 MINOR-005 待办（closeout §5）；不允许向 main 直接提交（04-规范 §6）。

## 3. 依赖关系汇总

| 依赖方 | 被依赖方 | 依赖内容 |
|---|---|---|
| M2 | M1 | 消息投递（Outbox→网页、网页→Inbox）、任务状态事件、附件存储 |
| M3 | M1 | 任务领取（READY 且依赖满足）、进度/结果上报入 Inbox、报告登记 |
| M4 | M1 | 仓库配置（repositories 表）、commit/diff 落 git_commits 表、审计 |
| 前端 | M1 | 全部 REST API |
| M2/M3/M4 相互 | — | 无直接依赖；跨模块协作一律经 M1 消息 |

## 4. 并行开发与集成纪律（GPT 建议 8）

1. 每模块**独立分支 + 独立工作区**（工作区路径 **[开工会议定稿]**，建议 `workspaces/<module>/`）；
2. 共享文件（治理文件、公共契约文件、集成分支、数据库迁移脚本）由主会话修改；数据库迁移脚本是否共享、归属 M1，**[开工会议定稿]**；
3. 模块合并进集成分支前：契约兼容检查 + 模块自动化测试 + 主会话按 agent-contract §4 核验；
4. 冲突处理：文件范围冲突由主会话仲裁；接口冲突视为契约缺陷，走 §5 变更申请。

## 5. 公共契约冻结清单（**Phase 1 开工会议定稿**，GPT 建议 7）

以下契约在四模块并行开发前由主会话冻结为 v1.0，冻结后变更必须走统一变更申请（提案 → 主会话评估影响 → 定新版本 → 通知全部模块 → 记入 `decision-log.md`）。子 Agent 不得私改（agent-contract §6-1）。

| # | 契约项 | 初稿来源 | 定稿状态 |
|---|---|---|---|
| C1 | API 协议（消息结构、端点、认证） | 03-协议 §2；本文件 §2 M1 接口草案 | [开工会议定稿] |
| C2 | 数据模型（16 张核心表及字段） | 04-规范 §5 | [开工会议定稿] |
| C3 | 错误码（统一错误结构、ProviderTimeoutError 类语义） | 03-协议 §7 示例；**[开工会议定稿]** 编号表 | [开工会议定稿] |
| C4 | 日志格式（结构化字段、commit SHA 注明要求、落盘路径） | 本文件 §6；**[开工会议定稿]** 字段表 | [开工会议定稿] |
| C5 | 分支策略（main / feature|fix/<TASK-ID>-<short-name>；合并人工审批） | 04-规范 §6 | [开工会议定稿] |
| C6 | 配置命名 | **[开工会议定稿]** | [开工会议定稿] |
| C7 | 认证授权 | **[开工会议定稿]**（Phase 1 单机单用户，从简但留字段） | [开工会议定稿] |
| C8 | 版本兼容策略（契约版本号、废弃流程） | 03-协议 §10；**[开工会议定稿]** | [开工会议定稿] |

## 6. 会话锁资源边界（按锁 v6 教训，GPT 建议 12 / 风险 7）

**核心教训（11 轮审查，R10 `21d259d` 定案）：互斥必须交给内核，内容仲裁必有竞态。** 实现参照 `phase0/e2e-poc/session_lock.mjs`（v6：OS 句柄 FileShare.None 守护进程），任何新锁不得使用文件内容仲裁。待办：v6 的 workDir 清理（release 时不删、累积），Phase 1 加 janitor（closeout §5）。

**已知局限（GPT 风险 7，如实声明）：** 锁只约束接入了锁机制的自动化操作；手工操作与未接入锁的进程可绕过。因此以下"人工边界"列是强制性约定，不依赖代码。

| 锁资源 | 保护对象 | 持有者 | 超时 | 异常释放 | 人工边界 |
|---|---|---|---|---|---|
| 浏览器会话锁 | CDP 接管的 Chrome 会话 / GPT 网页操作 | M2 GPT 控制器（每会话同一时刻仅一个在途任务） | 单次收发超时（如 75s 确认窗）+ 会话级总超时 | 持有进程崩溃由 OS 句柄自动释放；接管方启动时探测陈旧 Chrome 并标记待人工检查 | 用户人工操作浏览器前，自动化侧必须处于暂停态；登录/安全验证人工接管时锁不参与 |
| 工作区写锁 | 模块工作目录 / 代码写入 | M3 派生的执行进程（单会话单任务，每工作区一把） | 任务单交付期限 + CLI 超时兜底 | 进程树终止兜底时同步释放；janitor 清理残留 | 手工改代码前先确认无在途执行；不与自动化同时写同一目录 |
| Git 集成锁 | 集成分支写操作 / 合并与采集 | 主会话（集成操作）与 M4 采集互斥 | 采集/合并操作级超时 | OS 句柄机制同 v6 | main 合并仅由用户审批后执行，不在锁范围内自动化 |
| 部署环境锁 | 本机环境变更（Chrome profile、MCP 配置、代理） | 主会话 | 配置变更操作级超时 | 同上 | MCP 配置改动需重启会话（final-report §5.7），变更窗口须用户知情 |

## 7. Phase 0 已知待办在模块中的落位（closeout §5）

| 待办 | 落位模块 | 说明 |
|---|---|---|
| gpt_dispatch.mjs 单条 1200 字节上限 → 分块投递（ego 手册 R2.6-F）或 Git 指针 | M2（分块）/ M1（Git 指针附件） | 方案选型 **[待确认，不得当事实]**：开工会议决定 |
| gpt_roundtrip.mjs R2 前双闩锁写法 → 按 R3+ 语义实现 | M2 | 见 §2 M2 复用注意事项 |
| MCP 调用记录 NDJSON 化（MINOR-003） | M3 | |
| ZCode 权限模式分级（MINOR-004）、Git 路径配置化（MINOR-005） | M3 / M4 | |
| 锁 v6 workDir 清理 → janitor | M3（锁服务归属 **[开工会议定稿]**） | |
