# AIEO 平台公共契约 v1.0（Phase 1）

**契约版本：** v1.0.0
**冻结日期：** 2026-11-12
**状态：** 已冻结（C1-C8 全部 v1.0.0；未定稿子项在 §12 显式标 BLOCKED，不以 v1.0 名义静默冻结）
**适用范围：** M1 平台基座、M2 GPT 控制器、M3 ZCode Bridge、M4 Git Worker（Web 前端经 M1 REST API 间接受本契约约束）

---

## 1. 冻结元数据

| 项 | 值 |
|---|---|
| 契约版本 | v1.0.0（应用 SemVer 与契约版本分离，规则见 §9 C8） |
| 冻结日期 | 2026-11-12 |
| 适用模块 | M1（app/platform/）、M2（app/gpt_controller/）、M3（app/zcode_bridge/）、M4（app/git_worker/） |
| 批准人 | 主会话（智谱 ZCode，编排者）——**待用户追认** |
| 冻结基线 commit | `555fd44`（`docs/phase1/module-boundaries.md` v0.1，GPT 审查所用 commit `555fd440bd1483e81036d40310a191fb918362e5`） |
| 核心依据 | `phase0/logs/dispatch-2026-11-11T21-10-19/reply.txt`（GPT 契约讨论完整产出：17 项 gaps、C3 错误码表、C4 日志字段清单、C7 认证方案、C8 版本机制、summary） |
| 设计来源 | `docs/立项/03-任务消息与报告协议.md` v0.1（C1/C8 来源）；`docs/立项/04-任务状态机数据库与Git规范.md` v0.1（C2/C5 来源）；`docs/phase1/module-boundaries.md` v0.1 @ `555fd44`（四模块边界、C1-C8 冻结清单、会话锁资源边界） |
| 变更流程 | 冻结后变更必须走统一变更申请：提案 → 主会话评估影响 → 定新版本 → 通知全部模块 → 记入 `decision-log.md`（`module-boundaries.md` §5；子 Agent 不得私改，`agent-contract.md` §6-1） |

**变更记录：**

| 版本 | 日期 | 变更内容 | 批准 |
|---|---|---|---|
| v1.0.0 | 2026-11-12 | 初次冻结：C1-C8 全节定稿；BLOCKED 子项见 §12 | 主会话（待用户追认） |

**各契约项冻结状态：**

| # | 契约项 | 冻结版本 | 状态 |
|---|---|---|---|
| C1 | API 协议（消息结构、端点、认证边界） | v1.0.0 | 已冻结（§2；1 项 BLOCKED 子项见 §12） |
| C2 | 数据模型（16 张核心表及字段） | v1.0.0 | 已冻结（§3） |
| C3 | 错误码（统一错误结构、编号表、HTTP 映射） | v1.0.0 | 已冻结（§4） |
| C4 | 日志格式（字段表、NDJSON、落盘、审计、脱敏） | v1.0.0 | 已冻结（§5） |
| C5 | 分支策略（任务 ID、分支命名、合并、提交信息） | v1.0.0 | 已冻结（§6） |
| C6 | 配置命名（前缀、映射、默认值、秘密、校验） | v1.0.0 | 已冻结（§7） |
| C7 | 认证授权（单机单用户最小方案） | v1.0.0 | 已冻结（§8） |
| C8 | 版本兼容策略（契约版本、废弃流程） | v1.0.0 | 已冻结（§9） |

本文件取代 `module-boundaries.md` §5 中 C1-C8 的"[开工会议定稿]"占位；`module-boundaries.md` 其余 [开工会议定稿] 事项（目录命名、工作区路径等，不在 C1-C8 范围）仍待开工会议，见 §13。

---

## 2. C1 API 协议

### 2.1 传输与通用约定

- REST over HTTP，默认仅绑定 `127.0.0.1`（见 C7 §8.1）；API 前缀 `/api/v1/`（本次冻结，此前为初稿约定）。契约主版本升级时前缀随之升级为 `/api/v2/`（C8 §9.3）。
- 请求与响应体一律 JSON，UTF-8，`Content-Type: application/json; charset=utf-8`。
- 所有时间戳字段：ISO 8601 带时区（如 `2026-11-11T20:00:00+08:00` 可接受），**存储统一转 UTC**（如 `2026-11-11T12:00:00Z`）。
- 所有错误响应一律使用 §4.2 统一错误 Schema，禁止模块自定义错误体。
- 除 `GET /api/v1/health` 外，全部端点要求有效会话（凭证传输方式与 401/403 语义见 §2.5 与 C7）。
- 健康检查：`GET /api/v1/health` → `200 {"status":"ok","contract_version":"1.0.0"}`，免认证（供探活）。

### 2.2 通用消息结构（03-协议 §2 补齐字段规则）

消息信封字段规则（逐字段冻结）：

| 字段 | 类型 | 必填 | 约束 |
|---|---|---|---|
| `schema_version` | string | 必填 | 格式 `MAJOR.MINOR`（如 `"1.0"`）；≤16 字符；接收端主版本校验规则见 C8 |
| `message_id` | string | 必填 | 格式 `MSG-YYYYMMDD-NNNNNN`；全局唯一；即去重键；字符集 `[A-Z0-9-]`；≤64 字符 |
| `message_type` | string 枚举 | 必填 | 03-协议 §3 的 16 种类型（`TASK_PLAN_REQUEST` … `APPROVAL_REQUIRED`），不得扩展新值（扩展属次版本及以上变更） |
| `created_at` | string | 必填 | ISO 8601 带时区；存储统一 UTC |
| `source` | object | 必填 | `{agent_id, agent_type}`；`agent_id` 必须已登记于 `agents` 表；`agent_type` 枚举 `system/developer/reviewer/tester/auditor/user` |
| `target` | object | 必填 | 同 `source` |
| `project_id` | string | 必填 | 大写 slug `[A-Z0-9-]` ≤32；须已注册 |
| `batch_id` | string | 条件必填 | 格式 `BATCH-<序号>`；任务级与批次级消息必填，仅项目级事件允许为 null |
| `task_id` | string | 条件必填 | 格式 `T-<序号>`（Phase 1 为 `T-P1-<序号>`）；任务相关消息必填 |
| `correlation_id` | string | 必填 | `CORR-<序号>` 或 UUIDv4；≤64 字符；一次交互的请求与响应必须一致（03-协议 §9-7） |
| `payload` | object | 必填 | 可为 `{}`；Schema 由 `message_type` 决定（§10 契约测试）；序列化后 ≥4 KB 建议走 Git 指针（DEC-007），上限 256 KB |

补齐规则（对应 GPT gap 2/3）：

1. **字段类型/长度**：如上表；ID 类字段统一字符集 `[A-Z0-9-]`（UUID 除外），文本字段 UTF-8。
2. **时区**：所有时间字段 ISO 8601 带时区，落库统一 UTC。
3. **必填规则**：如上表；"条件必填"由 `message_type` 决定，校验规则进契约测试（§10）。
4. **未知字段处理**：v1.x 接收端**必须忽略**未知顶层与 payload 内可选字段（不报错、不拒收）；发送端不得依赖接收端理解新增字段。新增必填字段、删除/重命名字段、改类型/改语义均为主版本不兼容变更（C8）。
5. **payload 版本约束**：payload 内不再重复携带 `schema_version`，以信封 `schema_version` 为准；报告类 payload 的版本绑定字段见 §3.4。

### 2.3 REST 端点表

资源端点逐条冻结（请求/响应 Schema 引用 03-协议章节与 `contracts/v1.0/` 机器可读 Schema，见 §10）：

| 资源 | 方法与路径 | 用途 | 请求 Schema | 响应 Schema | 成功码 | 幂等规则 |
|---|---|---|---|---|---|---|
| 探活 | `GET /api/v1/health` | 探活与契约版本上报 | — | Health | 200 | 是 |
| 项目 | `GET /api/v1/projects` | 项目列表（分页） | — | ProjectList | 200 | 是 |
| 项目 | `POST /api/v1/projects` | 注册项目 | ProjectCreate | Project | 201 | `name` 唯一；重复 → `RES-0002` |
| 项目 | `GET /api/v1/projects/{project_id}` | 项目详情 | — | Project | 200 | 是 |
| 仓库 | `GET /api/v1/repositories?project_id=` | 仓库列表 | — | RepositoryList | 200 | 是 |
| 仓库 | `POST /api/v1/repositories` | 登记仓库 | RepositoryCreate | Repository | 201 | `(project_id, url)` 唯一 |
| 批次 | `GET /api/v1/batches?project_id=` | 批次列表 | — | BatchList | 200 | 是 |
| 批次 | `POST /api/v1/batches` | 创建批次（requirement + 工程规范版本固定，04-规范 §7） | BatchCreate | Batch | 201 | `batch_id` 服务端生成 |
| 批次 | `GET /api/v1/batches/{batch_id}` | 批次详情 | — | Batch | 200 | 是 |
| 任务 | `GET /api/v1/tasks?batch_id=&status=&parent_id=` | 任务列表（过滤） | — | TaskList | 200 | 是 |
| 任务 | `POST /api/v1/tasks` | 创建任务（含依赖与任务包哈希） | TaskCreate | Task | 201 | `task_id` 服务端生成；父任务与依赖存在性校验失败 → `RES-0001` |
| 任务 | `GET /api/v1/tasks/{task_id}` | 任务详情（含依赖、执行轮次） | — | Task | 200 | 是 |
| 任务 | `GET /api/v1/tasks/{task_id}/dependencies` | 依赖查询 | — | DependencyList | 200 | 是 |
| 任务 | `POST /api/v1/tasks/{task_id}/events` | 提交状态事件（Agent 只能提交事件/报告，状态转换由 M1 状态机唯一执行，04-规范 §3） | TaskEvent | TransitionResult | 200 | 幂等：`event_id` 去重；非法转换 → `TASK-0001` |
| 任务 | `POST /api/v1/tasks/{task_id}/claim` | 任务领取（M3；仅 `READY` 且依赖满足） | ClaimRequest | Task | 200 | 非幂等（独占租约）；已被领取 → `TASK-0003` |
| 消息 | `GET /api/v1/messages?direction=&target_agent_id=&status=&task_id=` | Inbox/Outbox 查询 | — | MessageList | 200 | 是 |
| 消息 | `POST /api/v1/messages` | 消息提交统一入口（服务端同事务登记 + 去重） | Message（03-协议 §2） | MessageAck | 202 | 幂等：`message_id` 主键去重；重复 → `RES-0003`（返回原处理结果，不重复执行副作用） |
| 消息 | `GET /api/v1/messages/{message_id}` | 消息详情（含投递/重试/ACK 状态） | — | Message | 200 | 是 |
| 消息 | `POST /api/v1/messages/{message_id}/ack` | 接收方确认（ACK） | AckRequest | Message | 200 | 幂等：重复 ACK 返回当前状态 |
| 消息 | `GET /api/v1/messages/dead-letter` | Dead Letter 查询（人工处理队列） | — | MessageList | 200 | 是 |
| 消息 | `POST /api/v1/messages/{message_id}/requeue` | Dead Letter 人工重投（仅主会话/用户，写审计） | RequeueRequest | Message | 200 | 非幂等；每次重投产生新投递轮次并写 audit_logs |
| 报告 | `POST /api/v1/reports/development` | 开发报告登记 | DevReport（03-协议 §6） | DevelopmentReport | 201 | 幂等：`execution_id` 唯一；重复 → `RES-0003` |
| 报告 | `POST /api/v1/reports/review` | 审查报告登记 | ReviewReport（03-协议 §7） | ReviewReport | 201 | 幂等：`(execution_id, reviewed_commit)` 去重 |
| 报告 | `POST /api/v1/reports/test` | 测试验收报告登记 | TestReport（03-协议 §8） | TestReport | 201 | 幂等：`(execution_id, commit_sha)` 去重 |
| 报告 | `GET /api/v1/reports?task_id=&type=` | 报告查询（历史保留，含返工各轮） | — | ReportList | 200 | 是 |
| 附件 | `POST /api/v1/artifacts` | 日志/报告/附件登记（sha256） | ArtifactCreate | Artifact | 201 | 幂等：`path` 唯一 |
| 附件 | `GET /api/v1/artifacts/{artifact_id}` | 附件元数据与内容读取 | — | Artifact | 200 | 是 |
| Git | `GET /api/v1/commits?task_id=&execution_id=` | git_commits 采集结果查询 | — | CommitList | 200 | 是 |
| 审计 | `GET /api/v1/audit?target_type=&target_id=&from=&to=` | 审计记录查询 | — | AuditList | 200 | 是 |
| 看板 | `GET /api/v1/board?project_id=` | 进度看板（完成率只按 ACCEPTED 计算，04-规范 §4） | — | Board | 200 | 是 |
| 审批 | `GET /api/v1/approvals?decision=PENDING` | 人工审批队列 | — | ApprovalList | 200 | 是 |
| 审批 | `POST /api/v1/approvals` | 提交人工审批决策（合并 main / 发布 / 重投等） | ApprovalCreate | Approval | 201 | 非幂等；写 audit_logs |

统一查询约定（分页/排序/过滤，对应 GPT gap 2）：

- `page`：≥1，默认 1；`page_size`：1–200，默认 50；响应信封 `{"items": [...], "page": 1, "page_size": 50, "total": 123}`。
- `sort`：`<字段>:<asc|desc>`，默认 `created_at:desc`；时间过滤 `from`/`to`（UTC ISO 8601）。
- 状态码使用约定：`400`→REQ 组；`401`→AUTH-0001/0003；`403`→AUTH-0002；`404`→RES-0001/ART-0001；`409`→RES-0002/RES-0003/TASK 组/GIT-0001/GIT-0002；`422`→REQ-0002/GIT-0003/ART-0002；`429`→PROVIDER-0005；`500/503/504`→SYS 组与 PROVIDER 组（完整映射见 §4.3）。

### 2.4 /messages 投递、ACK、重试与 Dead Letter 操作语义（GPT gap 2）

**Outbox 状态机**（消息投递侧，与 §3.12 `messages.status` 一致）：

```text
PENDING ──投递成功──> SENT ──接收方 ACK──> ACKED（终态）
   │                    │
   │ 投递失败            │ ACK 超时（MSG-0002）
   ▼                    ▼
RETRYING <──────────────┘
   │ 退避重试成功 → SENT
   │ 重试次数 > max_retries
   ▼
DEAD_LETTER（终态；仅人工经 /requeue 重投 → PENDING，retry 历史保留）
PENDING 可被发送方取消 → CANCELLED（终态）
```

1. **投递**：客户端 `POST /api/v1/messages`；服务端在**业务状态变更与待发送消息登记的同一数据库事务**内写入 `messages`（03-协议 §9-2）；`message_id` 主键即去重键，重复提交按幂等返回原处理结果（`RES-0003`），不得重复执行副作用（03-协议 §9-1）。
2. **ACK**：接收方确认收到后调 `POST /api/v1/messages/{message_id}/ack`，幂等；ACK 超时（默认 300 秒，经 C6 配置 `AIEO_MSG_ACK_TIMEOUT` 调整）触发重试流程。**ACK 超时不是任务失败**（`MSG-0002`）：先查询接收端状态与 Git 状态，再按协议重试（03-协议 §9-6）。
3. **重试**：指数退避，基间隔默认 30 秒（`AIEO_MSG_RETRY_BASE_SECONDS`），倍率 2，±20% 抖动；最大重试次数默认 8（`AIEO_MSG_MAX_RETRIES`）；每次重试 `retry_count` 加 1，`next_retry_at` 记录调度时间。
4. **Dead Letter**：超过最大重试次数进入 `DEAD_LETTER`，记录 `last_error_code`（C3 码）、`last_error_message`、`dead_lettered_at`；仅能经人工（主会话/用户，`agent-contract.md` §2.4）`/requeue` 重投，重投产生新投递轮次，原记录与重试历史保留。
5. **超时 ≠ 任务失败**：外部执行端超时按 `PROVIDER-0001` 处理——标记执行状态待核验，先查询执行端与 Git 状态，禁止盲目重复派发（03-协议 §9-6；04-规范 §3）。
6. **Correlation 与 Audit**：请求与响应必须以 `correlation_id` 关联（03-协议 §9-7）；原始消息与处理结果写审计（03-协议 §9-8，落 `audit_logs`）。

### 2.5 C1 与 C7 的边界声明（GPT gap 4）

- **C1 只规定**：认证凭证如何传输（会话 Cookie / Authorization 头的位置与格式），以及认证失败时统一返回 `AUTH-0001/0002/0003`（401/403，§4 统一错误 Schema）。
- **C7 负责**：身份建立、口令存储、会话生命周期（签发/过期/撤销）、CSRF、角色与授权规则、MCP/CLI 本机服务身份。
- C1 端点表不重复定义认证语义；两契约若出现表述冲突：身份/授权语义**以 C7 为准**，传输与错误响应格式**以 C1 为准**。

---

## 3. C2 数据模型

### 3.1 全局约定

- **类型体系**：SQLite 动态类型，列声明使用 `TEXT`/`INTEGER`/`REAL`；JSON 结构一律 `TEXT` 存储、应用层按 Schema 校验；业务逻辑不得依赖 SQLite 特有行为（04-规范 §5）。
- **时区**：所有时间列 `TEXT`，ISO 8601 **UTC**（`...Z`），字段名以 `_at` 结尾；默认值由应用层生成 UTC 时间戳。
- **主键**：有对外引用的实体用业务 ID（`TEXT`，格式见 §3.2）；纯内部记录表用 `INTEGER` 自增。
- **外键**：一律声明 `REFERENCES`，连接时启用 `PRAGMA foreign_keys=ON`。
- **NULL 规则**：表内显式标注"可空"；终态时间列（`ended_at`、`acked_at`、`decided_at` 等）NULL = 事件未发生；其余非空列默认值见各表。
- **删除策略**：**全部业务表禁止物理删除**（历史保留）。`projects/repositories/batches/agents` 允许软删除（`status=ARCHIVED` / `enabled=0`）；任务、执行、消息、报告、附件、提交、审计一律只增不删，终止经状态字段。
- **状态枚举**：以 `CHECK` 约束强制；枚举值扩展属契约变更。
- **索引**：外键列、状态过滤列、时间列建索引；复合唯一约束逐表列出。
- **迁移策略**：版本化迁移脚本（migration version 独立计数，见 C8 §9.5），只向前迁移，**禁止任何模块自行改表**；迁移脚本归属 M1（§11.2）。

### 3.2 业务 ID 格式（冻结）

| 实体 | 格式 | 示例 |
|---|---|---|
| project_id | 大写 slug，`[A-Z0-9-]{1,32}`，注册时指定 | `AI-IMAGE-SERVICE` |
| batch_id | `BATCH-<3 位以上序号>` | `BATCH-001` |
| task_id | `T-<3 位以上序号>`，Phase 1 为 `T-P1-<序号>`（正则 `^T-(P\d+-)?\d{3,}$`） | `T-001`、`T-P1-014` |
| message_id | `MSG-YYYYMMDD-NNNNNN` | `MSG-20261111-000001` |
| execution_id | `EXEC-<3 位以上序号>` | `EXEC-001` |
| correlation_id | `CORR-<序号>` 或 UUIDv4 | `CORR-001` |
| agent_id | 大写 slug，`[A-Z0-9-]{1,32}` | `AIEO-ORCHESTRATOR`、`ZCODE-01`、`GPT-03` |
| repository_id | `REPO-<3 位以上序号>` | `REPO-001` |
| artifact_id | `ART-<用途>-<序号>` | `ART-TEST-001` |
| agent_session_id | UUIDv4 或 `SES-<序号>` | `SES-001` |

### 3.3 十六张核心表定义

#### 1. projects（项目）

| 字段 | 类型 | 约束与说明 |
|---|---|---|
| project_id | TEXT PK | 大写 slug |
| name | TEXT NOT NULL | UNIQUE |
| description | TEXT | 可空 |
| status | TEXT NOT NULL CHECK(IN ('ACTIVE','ARCHIVED')) | DEFAULT 'ACTIVE' |
| knowledge_version | TEXT | 可空；项目知识库版本（03-协议 §10） |
| created_at / updated_at | TEXT NOT NULL | UTC |

#### 2. repositories（仓库）

| 字段 | 类型 | 约束与说明 |
|---|---|---|
| repository_id | TEXT PK | `REPO-<序号>` |
| project_id | TEXT NOT NULL FK → projects | 索引 |
| url | TEXT NOT NULL | `UNIQUE(project_id, url)` |
| local_path | TEXT NOT NULL | UNIQUE；本机工作副本路径 |
| default_branch | TEXT NOT NULL | DEFAULT 'main' |
| created_at / updated_at | TEXT NOT NULL | UTC |

#### 3. batches（批次）

| 字段 | 类型 | 约束与说明 |
|---|---|---|
| batch_id | TEXT PK | `BATCH-<序号>` |
| project_id | TEXT NOT NULL FK → projects | 索引 |
| requirement | TEXT NOT NULL | 需求描述 |
| status | TEXT NOT NULL CHECK(IN ('PLANNING','PLANNED','EXECUTING','COMPLETED','CANCELLED')) | DEFAULT 'PLANNING' |
| engineering_standard_version | TEXT NOT NULL | 工程规范版本固定（04-规范 §7） |
| knowledge_base_commit | TEXT NOT NULL | 知识库 commit 固定 |
| created_at / updated_at | TEXT NOT NULL | UTC |

#### 4. tasks（任务）

| 字段 | 类型 | 约束与说明 |
|---|---|---|
| task_id | TEXT PK | `T-<序号>` |
| batch_id | TEXT NOT NULL FK → batches | 索引 |
| parent_id | TEXT FK → tasks(task_id) | 可空；父子任务 |
| title / description | TEXT NOT NULL / TEXT | description 可空 |
| status | TEXT NOT NULL CHECK(14 态：'DRAFT','PLANNING','ARCH_REVIEW','READY','DISPATCHED','IN_PROGRESS','DEV_REPORTED','GIT_VALIDATING','CODE_REVIEW','TEST_ACCEPTANCE','REWORK','BLOCKED','ACCEPTED','CANCELLED') | DEFAULT 'DRAFT'；状态机唯一持有方为 M1（04-规范 §3） |
| priority | TEXT NOT NULL CHECK(IN ('P0','P1','P2','P3')) | DEFAULT 'P2' |
| weight | REAL NOT NULL CHECK(weight > 0) | DEFAULT 1.0（完成率权重，04-规范 §4） |
| files_scope | TEXT NOT NULL | JSON 数组；允许修改范围 |
| acceptance_criteria | TEXT NOT NULL | JSON 数组 |
| engineering_standard_items | TEXT NOT NULL | JSON 数组 |
| task_package_hash | TEXT NOT NULL | 任务包内容哈希固定（04-规范 §7） |
| engineering_standard_version / knowledge_base_commit | TEXT NOT NULL | 版本绑定（04-规范 §7） |
| blocked_reason / blocked_owner / unblock_condition | TEXT | 可空；`CHECK(status != 'BLOCKED' OR (blocked_reason IS NOT NULL AND blocked_owner IS NOT NULL AND unblock_condition IS NOT NULL))`（04-规范 §3） |
| cancelled_by / cancelled_reason | TEXT | 可空；`CHECK(status != 'CANCELLED' OR (cancelled_by IS NOT NULL AND cancelled_reason IS NOT NULL))`（04-规范 §3） |
| created_at / updated_at | TEXT NOT NULL | UTC；索引 (batch_id)、(status)、(parent_id) |

#### 5. task_dependencies（任务依赖）

| 字段 | 类型 | 约束与说明 |
|---|---|---|
| task_id | TEXT NOT NULL FK → tasks | 复合主键 (task_id, depends_on_task_id) |
| depends_on_task_id | TEXT NOT NULL FK → tasks | `CHECK(task_id != depends_on_task_id)`；环检测由应用层负责 |

#### 6. task_executions（任务执行轮次）

| 字段 | 类型 | 约束与说明 |
|---|---|---|
| execution_id | TEXT PK | `EXEC-<序号>` |
| task_id | TEXT NOT NULL FK → tasks | 索引 |
| agent_id | TEXT NOT NULL FK → agents | 执行端 |
| attempt | INTEGER NOT NULL CHECK(attempt >= 1) | 返工轮次，从 1 递增 |
| base_commit | TEXT NOT NULL CHECK(length = 40) | 本次执行的任务基线 commit |
| status | TEXT NOT NULL CHECK(IN ('RUNNING','COMPLETED','FAILED','CANCELLED')) | DEFAULT 'RUNNING' |
| started_at / ended_at | TEXT NOT NULL / TEXT 可空 | UTC；ended_at NULL = 进行中 |
| created_at | TEXT NOT NULL | UTC |

**约束：`UNIQUE(task_id, attempt)`。历史保留规则：返工创建新 `execution_id`（attempt+1），禁止覆盖旧执行记录；行只增不删，终态（COMPLETED/FAILED/CANCELLED）写入后 `status`/`ended_at` 不再变更。**

#### 7. agents（执行端登记）

| 字段 | 类型 | 约束与说明 |
|---|---|---|
| agent_id | TEXT PK | 大写 slug |
| agent_type | TEXT NOT NULL CHECK(IN ('system','developer','reviewer','tester','auditor','user')) | |
| role | TEXT NOT NULL | 如 planner/arch-reviewer/developer/code-reviewer/tester/auditor |
| enabled | INTEGER NOT NULL CHECK(IN (0,1)) | DEFAULT 1；0 = 软禁用 |
| capabilities | TEXT | 可空；JSON |
| created_at / updated_at | TEXT NOT NULL | UTC |

#### 8. agent_sessions（Agent 会话）

| 字段 | 类型 | 约束与说明 |
|---|---|---|
| session_id | TEXT PK | UUIDv4 或 `SES-<序号>` |
| agent_id | TEXT NOT NULL FK → agents | 索引 |
| session_url | TEXT | 可空；GPT 网页会话 URL |
| profile_key | TEXT | 可空；专用 Chrome profile 标识 |
| status | TEXT NOT NULL CHECK(IN ('ACTIVE','SUSPENDED','OFFLINE','EXPIRED')) | DEFAULT 'ACTIVE' |
| last_seen_at | TEXT | 可空；UTC |
| created_at / updated_at | TEXT NOT NULL | UTC |

#### 9. messages（消息；Inbox/Outbox 同表，重点表）

| 字段 | 类型 | 约束与说明 |
|---|---|---|
| message_id | TEXT PK | **去重键**：主键唯一约束即 Inbox 去重（03-协议 §9-1）；重复提交返回原处理结果（RES-0003） |
| schema_version | TEXT NOT NULL | 见 C8 |
| message_type | TEXT NOT NULL CHECK(16 枚举，03-协议 §3) | |
| direction | TEXT NOT NULL CHECK(IN ('INBOUND','OUTBOUND')) | INBOX=INBOUND，OUTBOX=OUTBOUND |
| source_agent_id | TEXT NOT NULL FK → agents | 信封 source 规范化列 |
| target_agent_id | TEXT NOT NULL FK → agents | 信封 target 规范化列；索引 (target_agent_id, processing_status) |
| project_id | TEXT NOT NULL FK → projects | |
| batch_id | TEXT FK → batches | 可空 |
| task_id | TEXT FK → tasks | 可空；索引 |
| correlation_id | TEXT NOT NULL | 索引 |
| payload | TEXT NOT NULL | JSON |
| status | TEXT NOT NULL CHECK(IN ('PENDING','SENT','ACKED','RETRYING','DEAD_LETTER','CANCELLED')) | DEFAULT 'PENDING'；**Outbox 状态机**（§2.4）；索引 (direction, status, next_retry_at) |
| retry_count | INTEGER NOT NULL CHECK(retry_count >= 0) | DEFAULT 0 |
| max_retries | INTEGER NOT NULL CHECK(max_retries >= 0) | DEFAULT 8 |
| next_retry_at | TEXT | 可空；重试调度时间（UTC） |
| last_error_code | TEXT | 可空；C3 统一错误码 |
| last_error_message | TEXT | 可空；不含敏感信息 |
| delivered_at / acked_at / dead_lettered_at | TEXT | 可空；UTC；NULL = 未发生 |
| processing_status | TEXT CHECK(IN ('PENDING','PROCESSING','PROCESSED','PROCESS_FAILED')) | 可空；仅 INBOUND 消息使用（Inbox 处理状态机） |
| processed_at | TEXT | 可空；UTC |
| created_at / updated_at | TEXT NOT NULL | UTC |

**重点字段小结（GPT gap 5）：去重键 = `message_id` 主键；Outbox 状态机 = `status`（§2.4）；ACK = `acked_at` + `SENT→ACKED` 转换；重试计数 = `retry_count`/`max_retries`/`next_retry_at`；Dead Letter 字段 = `last_error_code`/`last_error_message`/`dead_lettered_at`。**

#### 10. artifacts（附件与证据）

| 字段 | 类型 | 约束与说明 |
|---|---|---|
| artifact_id | TEXT PK | `ART-<用途>-<序号>` |
| task_id | TEXT FK → tasks | 可空（项目级附件）；索引 |
| type | TEXT NOT NULL CHECK(IN ('TEST_LOG','DEV_REPORT','REVIEW_EVIDENCE','DIFF','ATTACHMENT','OTHER')) | |
| path | TEXT NOT NULL UNIQUE | 仓库相对路径，禁止绝对路径 |
| sha256 | TEXT NOT NULL CHECK(length = 64) | 登记哈希；核验不一致 → `ART-0002` |
| created_at | TEXT NOT NULL | UTC |

#### 11. git_commits（提交采集）

| 字段 | 类型 | 约束与说明 |
|---|---|---|
| git_commit_id | INTEGER PRIMARY KEY AUTOINCREMENT | 内部主键 |
| task_id | TEXT NOT NULL FK → tasks | 索引 (task_id, execution_id) |
| execution_id | TEXT NOT NULL FK → task_executions | 绑定执行轮次（返工历史保留） |
| repository_id | TEXT NOT NULL FK → repositories | `UNIQUE(repository_id, sha)`——重复采集幂等 |
| branch | TEXT NOT NULL | 分支名 |
| sha | TEXT NOT NULL CHECK(length = 40) | 完整 SHA，禁止短 SHA |
| base_commit | TEXT NOT NULL CHECK(length = 40) | 与任务基线比对，不一致 → `GIT-0002` |
| diff_artifact_id | TEXT FK → artifacts | 可空；Diff 落附件 |
| created_at | TEXT NOT NULL | UTC |

#### 12. development_reports（开发报告）

| 字段 | 类型 | 约束与说明 |
|---|---|---|
| dev_report_id | INTEGER PRIMARY KEY AUTOINCREMENT | |
| execution_id | TEXT NOT NULL UNIQUE FK → task_executions | 一轮执行一份开发报告；重复登记 → RES-0003 |
| task_id | TEXT NOT NULL FK → tasks | 冗余查询列 |
| status | TEXT NOT NULL CHECK(IN ('COMPLETED','BLOCKED')) | 03-协议 §6 |
| payload | TEXT NOT NULL | JSON（03-协议 §6 结构） |
| created_at | TEXT NOT NULL | UTC |

#### 13. review_reports（审查报告）

| 字段 | 类型 | 约束与说明 |
|---|---|---|
| review_id | INTEGER PRIMARY KEY AUTOINCREMENT | |
| task_id | TEXT NOT NULL FK → tasks | 索引 (task_id, execution_id) |
| execution_id | TEXT NOT NULL FK → task_executions | 绑定执行轮次 |
| reviewed_commit | TEXT NOT NULL CHECK(length = 40) | 被审 commit，完整 SHA |
| reviewer_agent_id | TEXT NOT NULL FK → agents | |
| result | TEXT NOT NULL CHECK(IN ('PASS','REWORK','BLOCKED')) | |
| task_package_hash | TEXT NOT NULL | 版本绑定（03-协议 §10） |
| base_commit | TEXT NOT NULL CHECK(length = 40) | 版本绑定（03-协议 §10） |
| engineering_standard_version / knowledge_base_commit | TEXT NOT NULL | 版本绑定（03-协议 §10） |
| payload | TEXT NOT NULL | JSON（03-协议 §7 结构） |
| created_at | TEXT NOT NULL | UTC |

**commit 变更 → 旧审查结论失效，必须重新审查（03-协议 §10；新审查走新 execution 或新 reviewed_commit 记录，不覆盖旧行）。**

#### 14. test_reports（测试验收报告）

| 字段 | 类型 | 约束与说明 |
|---|---|---|
| test_report_id | INTEGER PRIMARY KEY AUTOINCREMENT | |
| task_id | TEXT NOT NULL FK → tasks | 索引 (task_id, execution_id) |
| execution_id | TEXT NOT NULL FK → task_executions | 绑定执行轮次 |
| commit_sha | TEXT NOT NULL CHECK(length = 40) | 测试代码对应 commit（03-协议 §8） |
| execution_result | TEXT NOT NULL CHECK(IN ('EXECUTED_PASS','EXECUTED_FAIL','NOT_EXECUTED','CLAIMED_ONLY','BLOCKED')) | 测试执行事实（03-协议 §8） |
| result | TEXT NOT NULL CHECK(IN ('PASS','REWORK','BLOCKED')) | 验收结论 |
| artifact_id | TEXT FK → artifacts | 可空；测试原始日志 |
| payload | TEXT NOT NULL | JSON |
| created_at | TEXT NOT NULL | UTC |

#### 15. approvals（人工审批）

| 字段 | 类型 | 约束与说明 |
|---|---|---|
| approval_id | INTEGER PRIMARY KEY AUTOINCREMENT | |
| target_type | TEXT NOT NULL CHECK(IN ('BATCH_PLAN','ARCH_REVIEW','MERGE_TO_MAIN','RELEASE','DEAD_LETTER_REQUEUE','CONTRACT_CHANGE','OTHER')) | |
| target_id | TEXT NOT NULL | 索引 (target_type, target_id) |
| decision | TEXT NOT NULL CHECK(IN ('PENDING','APPROVED','REJECTED')) | DEFAULT 'PENDING'；索引 |
| actor | TEXT NOT NULL | 审批人 |
| reason | TEXT | 可空 |
| decided_at | TEXT | 可空；UTC；NULL = 未决策 |
| created_at | TEXT NOT NULL | UTC |

#### 16. audit_logs（审计；与 §5.4 日志字段对应）

| 字段 | 类型 | 约束与说明 |
|---|---|---|
| audit_id | INTEGER PRIMARY KEY AUTOINCREMENT | |
| timestamp | TEXT NOT NULL | UTC；索引 |
| actor_id | TEXT NOT NULL | 操作者；索引 |
| actor_type | TEXT NOT NULL CHECK(IN ('user','agent','system')) | |
| action | TEXT NOT NULL | 稳定动作名，如 `login_failed`、`requeue_message`、`merge_to_main` |
| target_type / target_id | TEXT NOT NULL / TEXT NOT NULL | 索引 (target_type, target_id) |
| result | TEXT NOT NULL CHECK(IN ('SUCCESS','FAILURE','RETRY','BLOCKED','SKIPPED')) | 与 C4 result 枚举一致 |
| reason | TEXT | 可空 |
| correlation_id | TEXT | 可空；索引 |
| details | TEXT | 可空；JSON 补充信息（不含敏感字段） |

### 3.4 实体关系与历史保留规则（GPT gap 6）

- `projects` 1—N `repositories` / `batches`；`batches` 1—N `tasks`；`tasks` 自引用 N—N（`task_dependencies`）。
- `tasks` 1—N `task_executions`（`UNIQUE(task_id, attempt)`，attempt 递增，append-only）。
- `task_executions` 1—1 `development_reports`；1—N `git_commits`。
- `tasks` 1—N `review_reports` / `test_reports` / `artifacts`（审查与测试绑定 `execution_id` + commit）。
- `messages` 独立成表，经 `project_id/batch_id/task_id/correlation_id` 与业务关联。
- **历史保留（返工规则）**：返工产生**新** `execution_id`（attempt+1）与新 commit；旧执行、旧 commit、旧审查、旧测试记录一律保留不覆盖（04-规范 §2）；被修改的 commit 必须重新审查（03-协议 §10）；数据库与报告层面无任何 UPDATE 覆盖历史语义字段的操作（状态流转字段除外，且终态后冻结）。

---

## 4. C3 错误码表

### 4.1 编号空间

九组：`SYS`（系统）、`REQ`（请求）、`AUTH`（认证授权）、`RES`（资源）、`TASK`（任务状态）、`MSG`（消息）、`PROVIDER`（外部执行端）、`GIT`（Git）、`ART`（附件证据）。编号 `组-4 位序号`，新增错误码须申请新序号，禁止复用已发布编号。

**来源说明：GPT reply.txt 错误码表实有 27 条（SYS 3、REQ 3、AUTH 3、RES 3、TASK 3、MSG 2、PROVIDER 5、GIT 3、ART 2），逐条全量采纳如下；冻结口径以本表 27 条为准（此前沟通中"28 条"为口径误差，不据此虚构条目）。**

### 4.2 统一错误响应 Schema

```json
{
  "code": "TASK-0001",
  "message": "INVALID_STATE_TRANSITION: REWORK 状态不接受 dispatch 事件",
  "details": {
    "field": "event",
    "reason": "当前状态 REWORK 无该出边"
  },
  "retryable": false,
  "correlation_id": "CORR-001"
}
```

- `code`：C3 编号，必填；`message`：人类可读摘要，必填，不含堆栈与敏感信息。
- `details`：对象，可选；字段级校验错误（`REQ-0002`）必须给出字段级明细。
- `retryable`：布尔，必填；客户端应据此决定是否自动重试。
- `correlation_id`：必填；透传请求的 `correlation_id`，请求未带时由服务端生成并回填。
- **HTTP 状态与错误码一一对应（§4.3）；错误体一律经本 Schema 返回。跨模块错误转换规范：各模块内部异常必须在自己对外接口边界转换为 C3 码，禁止向客户端透出堆栈或内部异常类型。**

### 4.3 编号表（27 条，全量采纳自 GPT reply.txt）

**SYS 组（系统）**

| 编码 | 名称 | 语义与处理 | HTTP | retryable |
|---|---|---|---|---|
| SYS-0001 | INTERNAL_ERROR | 未分类的内部错误；记录完整服务端异常但不向客户端暴露堆栈 | 500 | 否 |
| SYS-0002 | SERVICE_UNAVAILABLE | 服务暂不可用；允许按 retryable 和 Retry-After 决定重试 | 503 | 是 |
| SYS-0003 | OPERATION_TIMEOUT | 平台内部操作超时；先查询操作状态，禁止未经幂等保护直接重复执行 | 504 | 否 |

**REQ 组（请求）**

| 编码 | 名称 | 语义与处理 | HTTP | retryable |
|---|---|---|---|---|
| REQ-0001 | INVALID_ARGUMENT | 请求字段缺失、类型错误或格式不合法；修正请求后重试 | 400 | 否 |
| REQ-0002 | SCHEMA_VALIDATION_FAILED | 消息或报告不符合对应 Schema；返回字段级校验错误 | 422 | 否 |
| REQ-0003 | UNSUPPORTED_VERSION | 请求使用不支持的契约主版本；客户端升级或使用受支持版本 | 400 | 否 |

**AUTH 组（认证授权）**

| 编码 | 名称 | 语义与处理 | HTTP | retryable |
|---|---|---|---|---|
| AUTH-0001 | UNAUTHENTICATED | 未提供有效身份凭证；重新登录或刷新凭证 | 401 | 否 |
| AUTH-0002 | FORBIDDEN | 身份有效但无权执行该操作；不自动重试 | 403 | 否 |
| AUTH-0003 | SESSION_EXPIRED | 用户会话已过期；重新登录 | 401 | 否 |

**RES 组（资源）**

| 编码 | 名称 | 语义与处理 | HTTP | retryable |
|---|---|---|---|---|
| RES-0001 | RESOURCE_NOT_FOUND | 项目、任务、仓库、消息或附件不存在 | 404 | 否 |
| RES-0002 | RESOURCE_CONFLICT | 资源状态或唯一约束冲突；先查询最新状态 | 409 | 否 |
| RES-0003 | DUPLICATE_MESSAGE | message_id 已处理；按幂等接口返回原处理结果；不得重复执行副作用 | 409 | 否 |

**TASK 组（任务状态）**

| 编码 | 名称 | 语义与处理 | HTTP | retryable |
|---|---|---|---|---|
| TASK-0001 | INVALID_STATE_TRANSITION | 任务状态转换不合法；由 M1 状态机拒绝 | 409 | 否 |
| TASK-0002 | DEPENDENCY_NOT_READY | 任务依赖尚未满足；等待依赖任务完成 | 409 | 否 |
| TASK-0003 | TASK_ALREADY_CLAIMED | 任务已被其他执行端领取或租约有效；不得并发重复领取 | 409 | 否 |

**MSG 组（消息）**

| 编码 | 名称 | 语义与处理 | HTTP | retryable |
|---|---|---|---|---|
| MSG-0001 | MESSAGE_DELIVERY_FAILED | 消息投递失败；由 Outbox 重试机制处理，达到上限进入 Dead Letter | 502 | 是 |
| MSG-0002 | ACK_TIMEOUT | 消息 ACK 超时；不是任务失败；先查询接收端状态，再按协议重试 | 409 | 是 |

**PROVIDER 组（外部执行端）**

| 编码 | 名称 | 语义与处理 | HTTP | retryable |
|---|---|---|---|---|
| PROVIDER-0001 | PROVIDER_TIMEOUT | GPT、ZCode 或其他外部执行端响应超时；必须标记执行状态待核验，不得直接判定任务失败或重复派发 | 504 | 否 |
| PROVIDER-0002 | PROVIDER_UNAVAILABLE | 外部执行端不可用；可重试，但需遵守供应端限流和退避策略 | 503 | 是 |
| PROVIDER-0003 | PROVIDER_AUTH_FAILED | 外部执行端登录失效、认证失败或需要人工验证；停止自动重试并进入 OFFLINE/人工接管流程 | 502 | 否 |
| PROVIDER-0004 | PROVIDER_CONTRACT_CHANGED | 外部网页 DOM、MCP Schema 或 CLI 行为与已验证契约不一致；停止盲目操作，等待契约自检或人工处理 | 502 | 否 |
| PROVIDER-0005 | PROVIDER_RATE_LIMITED | 外部执行端限流；遵守 Retry-After，采用退避策略 | 429 | 是 |

**GIT 组（Git）**

| 编码 | 名称 | 语义与处理 | HTTP | retryable |
|---|---|---|---|---|
| GIT-0001 | GIT_WORKTREE_DIRTY | 工作区存在未提交修改；禁止继续提交或集成，先核查变更 | 409 | 否 |
| GIT-0002 | GIT_BASE_MISMATCH | 实际基线 commit 与任务单预期基线不一致；停止交付核验 | 409 | 否 |
| GIT-0003 | GIT_SCOPE_VIOLATION | Diff 超出任务单允许修改范围；退回整改 | 422 | 否 |

**ART 组（附件证据）**

| 编码 | 名称 | 语义与处理 | HTTP | retryable |
|---|---|---|---|---|
| ART-0001 | ARTIFACT_NOT_FOUND | 引用的报告、日志或附件不存在 | 404 | 否 |
| ART-0002 | ARTIFACT_HASH_MISMATCH | 附件 SHA-256 与登记值不一致；拒绝作为验收证据 | 422 | 否 |

---

## 5. C4 日志规范

### 5.1 字段清单（全量采纳自 GPT reply.txt，必填/可选分级冻结）

| # | 字段 | 必填级别 | 规则（原文语义保留） |
|---|---|---|---|
| 1 | timestamp | 必填 | ISO 8601 带时区，存储统一使用 UTC；展示时可转换本地时区 |
| 2 | level | 必填 | DEBUG、INFO、WARNING、ERROR、CRITICAL |
| 3 | service | 必填 | 服务名称，如 platform、gpt_controller、zcode_bridge、git_worker |
| 4 | module | 必填 | 模块标识 M1/M2/M3/M4 |
| 5 | event | 必填 | 稳定的机器可检索事件名称，不以自由文本代替 |
| 6 | message | 必填 | 人类可读摘要；不得包含密码、Cookie、Token 或完整敏感 payload |
| 7 | task_id | 可选 | 任务相关事件必须填写 |
| 8 | execution_id | 可选 | 执行相关事件必须填写 |
| 9 | project_id、batch_id | 可选 | 存在业务上下文时填写 |
| 10 | message_id | 可选 | 消息收发、ACK、重试、去重事件必须填写 |
| 11 | correlation_id | 建议必填 | 跨模块请求链路必须保持一致 |
| 12 | trace_id | 建议必填 | 用于一次完整调用链追踪，与 correlation_id 分工明确 |
| 13 | agent_id、agent_type | 可选 | 涉及 Agent 执行或消息路由时填写 |
| 14 | session_id | 可选 | GPT 会话、ZCode CLI/MCP 会话相关事件填写，不记录会话 Cookie 或凭证 |
| 15 | repository_id、branch | 可选 | Git 操作事件填写 |
| 16 | base_commit、commit_sha | 可选 | 涉及 Git 基线、提交、Diff、审查或测试证据时填写完整 SHA，不使用短 SHA 代替 |
| 17 | artifact_id、artifact_sha256 | 可选 | 涉及日志、报告、附件登记和验收时填写 |
| 18 | operation | 可选 | 记录操作名称，如 claim_task、send_message、commit_and_collect |
| 19 | result | 可选 | 统一使用 SUCCESS、FAILURE、RETRY、BLOCKED、SKIPPED 等结果枚举 |
| 20 | duration_ms | 可选 | 耗时操作必须填写，非负整数 |
| 21 | error_code | 可选 | 失败事件必须使用 C3 统一错误码 |
| 22 | retryable | 可选 | 布尔值，错误事件必须填写 |
| 23 | attempt | 可选 | 重试或执行轮次，从 1 开始的正整数 |
| 24 | http_status | 可选 | HTTP 请求或响应事件填写 |
| 25 | process_id、exit_code | 可选 | 外部 CLI、浏览器子进程及 Worker 生命周期事件填写 |
| 26 | source_file、source_line | 可选 | 开发调试环境可填写，生产环境不强制 |
| 27 | env（环境标识） | 必填 | 如 development、test、production；不得记录真实密钥或个人敏感信息 |

### 5.2 格式与落盘

1. 日志格式统一为**一行一个 JSON 对象的 NDJSON**；禁止模块自行发明不同的日志格式。
2. 普通运行日志落盘 `logs/phase1/<service>/`，按日期或大小轮转；具体路径通过配置指定（C6：`AIEO_LOG_DIR`），**禁止硬编码机器绝对路径**。
3. **轮转与保留**：普通运行日志默认按日期轮转、保留 30 天（可经 C6 配置）；`audit_logs` 随数据库持久化，永久保留、禁止清理（审计记录的保留优先级高于磁盘空间考虑）。

### 5.3 审计日志（audit_logs）独立持久化（GPT gap 9）

`audit_logs` 是**持久化审计记录**（表定义见 §3.3 第 16 张表），至少包含：`timestamp`、`actor_id`、`actor_type`、`action`、`target_type`、`target_id`、`result`、`reason`、`correlation_id`。

- 必须写审计记录的事件：关键状态变更（任务状态转换）、权限变更、人工审批（approvals）、Git 集成操作（合并、requeue）、会话初始化/注销/凭证轮换（C7 §8.7）、Dead Letter 重投。
- **普通运行日志负责诊断，audit_logs 负责追责，两者不可互相替代**；审计事件可同时打一条运行日志（level=INFO，event 前缀 `audit.`），但运行日志不能代替审计落库。

### 5.4 敏感信息脱敏规则（原文语义保留）

敏感字段统一脱敏：Authorization、Cookie、密码、API Key、访问令牌、邮箱登录凭据及完整网页会话内容**不得写入日志**；必要时仅记录凭证类型或不可逆摘要（如 `sha256:<前 8 位>`）。

### 5.5 可靠性要求（原文语义保留）

日志写入失败不得静默吞掉关键审计事件；**审计写入与对应业务状态变更应处于同一数据库事务，或采用可靠 Outbox 机制**（与 §2.4 / §3.3 messages 同事务原则一致）。

---

## 6. C5 分支策略

### 6.1 任务 ID 与分支命名

- 任务 ID 格式：`T-P1-<序号>`（Phase 1；正则 `^T-(P\d+-)?\d{3,}$`，与 §3.2 一致；来源 `agent-contract.md` §3）。
- 分支命名（04-规范 §6）：
  - `feature/<TASK-ID>-<short-name>`：功能开发；
  - `fix/<TASK-ID>-<short-name>`：缺陷修复；
  - 完整正则：`^(feature|fix)/T-(P\d+-)?\d{3,}-[a-z0-9-]{1,40}$`。
- `<TASK-ID>` 部分保持大写原样；`<short-name>` 一律小写 `[a-z0-9-]`，≤40 字符，连字符分隔，不以连字符开头或结尾。
- 每个代码任务独立分支（04-规范 §6-1）；不设其他前缀分支类型，非代码类工作（文档、治理）由主会话在集成分支直接提交。

### 6.2 集成分支

- 集成分支命名：`integration/phase1`；四模块分支一律合入该分支，模块间不互相合并。
- 集成候选冻结：对集成分支打 tag `phase1-candidate-<序号>`（独立集成验收，`agent-contract.md` §7）。

### 6.3 合并策略

1. 模块分支 → `integration/phase1`：由**主会话**执行，合并前完成契约兼容检查 + 模块自动化测试（`module-boundaries.md` §4-3）；采用 `--no-ff` 保留合并记录。
2. `integration/phase1` → `main`：**仅用户人工审批后**由主会话执行（04-规范 §6-9）；不在 Git 集成锁范围内自动化（`module-boundaries.md` §6）。
3. 冲突处理：文件范围冲突由主会话仲裁；接口冲突视为契约缺陷，走契约变更申请（`module-boundaries.md` §4-4）。
4. 禁止对已推送的共享分支做历史改写（rebase/force-push）。
5. 发布生产环境必须人工审批（04-规范 §6-10）。

### 6.4 提交信息规范（可自动检查）

格式：`<type>(<scope>): <subject>`

- `type` ∈ `feat | fix | docs | test | refactor | chore`；
- `scope` ∈ `platform | gpt_controller | zcode_bridge | git_worker | docs | contract | phase0 | release`；
- `subject` 首行 ≤72 字符（沿用现有仓库中文 subject 惯例）。

**可自动检查规则（实现为 pre-commit / 集成检查脚本）：**

1. 提交首行匹配正则 `^(feat|fix|docs|test|refactor|chore)\((platform|gpt_controller|zcode_bridge|git_worker|docs|contract|phase0|release)\): \S.{0,71}$`；
2. 分支名匹配 §6.1 正则（feature/fix 分支上的提交）；
3. 禁止直接推送 `main`（合并仅经审批流程）；
4. 提交 Diff 不得超出任务单允许修改目录（`GIT-0003`，`agent-contract.md` §4-3）；
5. 基线 commit 在开发开始前记录（04-规范 §6-2，`record_baseline`）。

### 6.5 并发策略（沿 04-规范 §6）

首期默认同一仓库一个代码写入任务；并行化（Git Worktree）须满足文件范围不冲突、契约已冻结、每任务独立分支和工作目录、不允许多个 Agent 同时写同一工作目录。

---

## 7. C6 配置命名

### 7.1 命名规则（GPT gap 11）

1. **统一前缀**：环境变量一律 `AIEO_` 开头；模块级配置为 `AIEO_<MODULE>_<KEY>`，模块标识 ∈ `PLATFORM | GPT_CONTROLLER | ZCODE_BRIDGE | GIT_WORKER`；跨模块公共项不加模块段：`AIEO_<KEY>`。
2. **大小写**：环境变量全大写 + 下划线；配置文件（`config/aieo.yaml`，按模块分节）内键名一律小写 snake_case。
3. **环境变量映射规则**：文件键逐级映射为大写，`platform.log.dir` → `AIEO_PLATFORM_LOG_DIR`；`messaging.ack_timeout` → `AIEO_MSG_ACK_TIMEOUT`。
4. **优先级**：环境变量 > 配置文件 > 内置默认值。
5. **默认值与必填项**：每项配置必须声明默认值或显式标记必填；必填项缺失 → 启动失败（fail-fast），一次性输出全部缺失/非法项清单。

### 7.2 首期核心配置项表（默认值冻结）

| 环境变量 | 文件键 | 默认值 | 必填 | 说明 |
|---|---|---|---|---|
| `AIEO_ENV` | env | — | 是 | development / test / production（写入日志 env 字段） |
| `AIEO_DB_PATH` | platform.db_path | `data/aieo.db` | 否 | SQLite 路径 |
| `AIEO_LOG_DIR` | log.dir | `logs/phase1/` | 否 | 日志根目录（C4 §5.2） |
| `AIEO_SERVER_BIND` | server.bind | `127.0.0.1:8000` | 否 | API 绑定地址（C7 §8.1：禁止 0.0.0.0） |
| `AIEO_GIT_PATH` | git.path | `git`（PATH 解析） | 否 | Git 可执行路径（MINOR-005 配置化落位） |
| `AIEO_SYSTEM_PROXY` | network.system_proxy | `127.0.0.1:10391` | 是 | 系统代理（DEC-004，M2 使用） |
| `AIEO_MSG_ACK_TIMEOUT` | messaging.ack_timeout | `300`（秒） | 否 | ACK 超时（C1 §2.4） |
| `AIEO_MSG_MAX_RETRIES` | messaging.max_retries | `8` | 否 | 最大重试次数（C1 §2.4） |
| `AIEO_MSG_RETRY_BASE_SECONDS` | messaging.retry_base_seconds | `30` | 否 | 退避基间隔（C1 §2.4） |
| `AIEO_LOG_RETENTION_DAYS` | log.retention_days | `30` | 否 | 运行日志保留天数（C4 §5.2） |
| `AIEO_WORKSPACE_ROOT` | workspace.root | `workspaces/` | 否 | 模块工作区根（最终路径待开工会议，§13） |
| `AIEO_GPT_EMAIL` | —（仅环境变量/凭据存储） | — | 是（M2） | GPT 登录邮箱（秘密，见 §7.3） |
| `AIEO_GPT_PASSWORD` | —（仅环境变量/凭据存储） | — | 是（M2） | GPT 登录密码（秘密） |
| `AIEO_SESSION_SECRET` | —（仅环境变量/凭据存储） | — | 是 | 会话签名密钥（秘密） |

### 7.3 秘密处理

1. 密码、Token、API Key、会话密钥**一律不进 Git**；通过环境变量或操作系统凭据存储注入。
2. 配置文件中只允许占位符引用（如 `${AIEO_GPT_PASSWORD}`），不得出现明文秘密。
3. `.gitignore` 必须排除 `config/*.local.yaml`、`.env`；提交前检查脚本扫描配置文件中的疑似秘密。
4. 凭证文件权限最小化（当前操作系统用户可访问）（与 C7 §8.6 一致）。

### 7.4 配置校验

启动时按 Schema 校验全部配置（类型、枚举、路径存在性、端口合法性）；校验失败 → 列出全部错误并拒绝启动（fail-fast），不得带病运行。配置变更属于**部署环境锁**保护范围（`module-boundaries.md` §6），变更窗口须用户知情。

---

## 8. C7 认证授权（采纳 GPT 方案全文）

### 8.1 网络绑定

单机单用户、默认仅本机访问的最小方案：FastAPI 默认绑定 `127.0.0.1`，**不监听 `0.0.0.0`**；至少防止同机其他本地进程或局域网用户直接调用管理 API（GPT gap 12）。

### 8.2 管理员初始化与口令存储

首次启动执行一次性管理员初始化；用户密码使用 **Argon2id** 哈希保存，禁止明文和可逆加密存储。

### 8.3 会话管理

登录后签发**随机高熵 Session ID**，服务端保存会话状态；浏览器 Cookie 三属性：**HttpOnly、SameSite=Lax、Secure（按 HTTPS 环境启用）**。

### 8.4 CSRF 与过期撤销

修改数据的请求启用 CSRF 防护；设置空闲超时和绝对过期时间，支持主动注销及会话撤销（对应 `AUTH-0003 SESSION_EXPIRED`）。

### 8.5 角色模型

首期只设**一个固定 OWNER 角色**，不实现复杂 RBAC，但**所有管理 API 均要求有效会话**。

### 8.6 MCP/CLI 本机服务身份（区分人类与内部执行身份）

MCP stdio 和本机 CLI **不应伪装成浏览器用户**，使用独立的本机服务身份及权限白名单；凭证放在当前操作系统用户可访问的配置或系统凭据存储中，文件权限最小化，**禁止写入 Git**。

### 8.7 审计

登录失败、初始化、注销、凭证轮换及敏感操作均写入 `audit_logs`（§5.3）。

### 8.8 未来扩展边界

若未来必须开放局域网访问，再单独增加 HTTPS、访问来源限制和服务身份认证，**不应把本机单用户模式直接暴露到网络**。

### 8.9 与 C1 的边界

C1 只规定认证头/Cookie 的传输和 401/403 响应；C7 负责身份建立、会话生命周期和授权规则（§2.5）。

---

## 9. C8 版本兼容（采纳 GPT 方案全文）

### 9.1 应用版本与契约版本分离

应用版本使用 SemVer；公共 API、消息和报告协议分别维护独立的 `contract_version`；消息中的 `schema_version` 保留为协议 Schema 版本标识。

### 9.2 版本号语义

建议自 v1.0.0 起：**主版本**变化表示不兼容变更；**次版本**变化只允许向后兼容的新增字段/可选能力；**修订版本**只修正文档或不改变 Schema 语义的细节。

### 9.3 版本携带与校验

- 每个消息、任务包、开发报告、审查报告和测试报告**必须携带适用的契约版本**；
- 接收端必须验证主版本；支持的主版本不匹配时返回 `REQ-0003 UNSUPPORTED_VERSION`（HTTP 400），**不得静默猜测或降级解析**；
- 服务端公布 `supported_versions` 与 `minimum_supported_version`（经 `GET /api/v1/health` 与配置公开）。

### 9.4 兼容规则与废弃流程

- v1.x 接收端**应忽略未知可选字段**，发送端不得依赖接收端理解新增字段；
- 新增必填字段、删除/重命名字段、改变字段类型或状态语义，均视为主版本不兼容变更；
- 废弃旧版本：先公告、记录迁移说明，**至少保留一个明确迁移窗口**（默认 ≥14 天或 ≥2 个批次周期，以先到者为准），窗口结束后拒绝旧版本并返回 `REQ-0003`。

### 9.5 数据库迁移与历史数据

- 数据库结构版本独立使用 **migration version**，启动时执行**向前迁移**，禁止模块自行改表；
- 旧消息和报告**按原版本保留**并通过版本化解析器读取，**不批量覆盖历史数据**。

### 9.6 冻结与变更绑定

每次契约冻结或变更必须同步更新：Schema、契约测试、`decision-log.md`、兼容矩阵和版本号，并绑定 Git commit SHA。

---

## 10. 契约测试要求

1. **机器可读 Schema**：`contracts/v1.0/` 目录存放 JSON Schema（消息信封、各 message_type payload、开发/审查/测试报告、统一错误响应、API 请求/响应体），四模块共同引用该目录；
2. **示例请求/响应**：每个 REST 端点至少一组合法示例；每个 `message_type` 至少一组合法消息示例；
3. **错误用例**：C3 每个错误码至少一条触发用例（含期望 HTTP 状态与响应 Schema 校验）；
4. **单一版本引用**：四模块必须引用同一版本（`contracts/v1.0/`），**禁止复制后自行修改**；集成检查核验各模块引用路径与文件哈希一致；
5. **归属**：契约文件与契约测试基线由 M1 维护（与 §11.1/§11.2 责任一致）；各模块在自己的 `tests/<module>/` 内引用并运行契约测试；
6. **版本绑定**：契约测试结果写入交付包与测试报告，注明契约版本与被测 commit SHA。

---

## 11. 责任边界定稿（GPT gap 14/15）

| # | 事项 | 定稿 | 说明 |
|---|---|---|---|
| 11.1 | 共享 ORM 模型归属 | **M1** | `app/models/` 由 M1 维护；M2/M3/M4 禁止各自维护同一套模型副本或自带建表语句；是否拆为独立共享包属 M1 实现细节，不影响归属定稿 |
| 11.2 | 数据库迁移脚本归属 | **M1** | `module-boundaries.md` §4"迁移脚本是否共享、归属 M1 [开工会议定稿]"就此定稿：归属 M1；迁移遵循 C8 §9.5（migration version 独立、只向前迁移） |
| 11.3 | 锁服务归属 | **独立组件，M1 提供实现，全部模块使用** | `module-boundaries.md` §7"锁服务归属 [开工会议定稿]"就此定稿；实现遵循 DEC-001（OS 句柄互斥，禁止内容仲裁）；janitor（workDir 残留清理）作为锁服务组成部分由 M1 实现 |
| 11.4 | Git Worker 与平台基座事务边界 | Git 为外部系统，**不参与数据库事务** | 流程冻结：① M4 执行 Git 写操作前经 M1 记录操作意图（task_executions/attempt）；② Git 操作成功后采集 SHA/Diff；③ `git_commits` 登记与 `audit_logs` **同一事务**写入；④ 登记失败时 Git 操作**不回滚**，按 `UNIQUE(repository_id, sha)` 幂等重试登记；⑤ 禁止以数据库状态反向补偿改写 Git 历史 |
| 11.5 | 模块间接口形态 | **跨进程只经 M1 稳定服务接口（REST + 消息 + MCP）协作** | 各模块"对外接口草案"中的 Python 函数签名是包内实现接口，**不构成跨模块公共契约**，其变更不触发契约变更流程；但 M3 的 MCP 工具（`claim_task`/`report_progress`/`submit_result`）与全部 REST 端点是跨进程契约，受本契约版本管理 |
| 11.6 | 共享文件修改权 | **主会话** | 治理文件、公共契约文件、集成分支、数据库迁移脚本由主会话修改（`module-boundaries.md` §4-2；`agent-contract.md` §6-5） |

---

## 12. 遗留 BLOCKED 项

本轮冻结中未能定稿、显式标注 BLOCKED 的子项（不得静默冻结）：

| 编号 | 事项 | 所涉契约 | 阻塞原因 | 需要的输入 | 解除路径 |
|---|---|---|---|---|---|
| BLOCKED-1 | M2 网页投递长 payload 机制选型：分块投递（ego 手册 R2.6-F）或 Git 指针（`gpt_dispatch.mjs` 单条 1200 字节上限） | C1（关联 DEC-007 关联待办、`module-boundaries.md` §7） | 两种方案对 M2 投递协议的影响不同，本轮无实测数据支撑选型 | 开工会议选型决策（结合 Phase 0 实测约束） | 选型后走契约变更申请，补入 C1 |

除上表外，C1-C8 其余子项均已定稿，**无其他 BLOCKED 项**。注意：本契约冻结不依赖 BLOCKED-1——C1 已冻结的通用规则（payload ≥4 KB 建议 Git 指针、上限 256 KB）与网页通道分块协议相互独立。

---

## 13. 开放问题（需用户 / 开工会议确认）

| # | 问题 | 背景 | 建议决策场合 |
|---|---|---|---|
| 1 | 本契约冻结追认 | 批准人当前为主会话（智谱），按治理规则需用户追认后生效 | 随时（追认即生效） |
| 2 | 模块目录命名 `app/<module>/` 与工作区路径 `workspaces/<module>/` | `module-boundaries.md` §2/§4 标注 [开工会议定稿]；不在 C1-C8 范围，但影响 C6 默认值（`AIEO_WORKSPACE_ROOT`） | 开工会议 |
| 3 | BLOCKED-1：网页投递长 payload 选型 | 见 §12 | 开工会议 |
| 4 | C7 局域网开放的未来扩展 | HTTPS、访问来源限制、服务身份认证的触发条件与时机（C7 §8.8 明确首期不做） | 出现远程访问需求时 |
| 5 | 数据库迁移工具与远期目标 | 迁移机制采用版本化脚本（建议 Alembic，M1 实现期可选等效工具）；SQLite → PostgreSQL 远期兼容审计（业务逻辑不得依赖 SQLite 特有行为，04-规范 §5） | M1 实现期 |
| 6 | 契约测试执行载体 | 合并前契约兼容检查由主会话执行（`module-boundaries.md` §4-3）；脚本化形态（本地脚本 / CI runner）实现期确定 | M1 实现期 |

---

## 附录 A：GPT gaps（17 项）覆盖索引

依据 `phase0/logs/dispatch-2026-11-11T21-10-19/reply.txt`。逐条对应如下：

| gap# | 要点 | 覆盖位置 |
|---|---|---|
| 1 | module-boundaries §2/§5 仍是 v0.1 初稿，不能视为已冻结 | §1 冻结元数据（本文件取代 C1-C8 占位） |
| 2 | C1 缺完整 REST 契约与 /messages 操作语义 | §2.3、§2.4 |
| 3 | 消息字段类型/长度/时区/枚举/必填/未知字段规则 | §2.2 |
| 4 | C1/C7 边界未说明 | §2.5、§8.9 |
| 5 | C2 表定义不足以建库；messages 去重/Outbox/ACK/重试/Dead Letter 缺失 | §3.1–§3.3（重点小结） |
| 6 | 实体关系与历史保留规则（返工不覆盖旧记录） | §3.4 |
| 7 | C3 缺统一错误结构、编号空间、HTTP 映射 | §4 |
| 8 | C4 缺日志字段表、格式、落盘、轮转、脱敏 | §5.1–§5.2、§5.4 |
| 9 | audit_logs 独立持久化，与运行日志不可互相替代 | §5.3 |
| 10 | C5 缺任务 ID 格式、命名字符集、集成分支、合并、提交规范 | §6 |
| 11 | C6 配置命名规范缺失 | §7 |
| 12 | C7 单机也需认证；区分人类与 MCP/CLI 身份 | §8 |
| 13 | C8 缺协议/应用版本区分、兼容矩阵、废弃周期 | §9 |
| 14 | 模块职责交叉（ORM/迁移/锁/Git 事务边界） | §11.1–§11.4、§11.6 |
| 15 | 模块接口 Python 签名是否构成公共契约 | §11.5 |
| 16 | 缺统一契约测试要求；四模块引用同一版本 | §10 |
| 17 | 缺冻结元数据；未定稿条目应标 BLOCKED | §1、§12 |
