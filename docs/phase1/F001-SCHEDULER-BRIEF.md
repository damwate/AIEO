# F-001 中央调度引擎最小版任务书（T-P1-908）

**版本：** v0.2（第 1 轮会务评审 REWORK 六项修订稿；评审证据 `phase0/logs/dispatch-2026-11-14T03-54-34/`，reply 5082B SHA `20b580d126744f53a541109a8dc6a079a4cee1e0674310c7a6882d206493d618`）
**关联决策：** DEC-026 决议二路线第三项；DEC-023（906 顺延不占用）；DEC-029/030（前置 F-003 已合并）；DEC-031（评审窗口授权：14:30 前会务意见为决策依据）

## §1 定位与设计原则

- **目标：** 把 T-P1-905 D1′ 九步人工编排固化为可重复执行的单文件调度器：一次 run 编排一个真实任务从 DRAFT 到 DEV_REPORTED 闭环。
- **自动化程度（如实申报，第 1 轮评审①修正）：** 八步（S1–S6、S8、S9）由调度器自动编排；S7 开发腿=编排会话（主会话 ZCode 腿）作为真实执行者参与（方案 b，忠实复现 905 已验证形态）——**905 不曾被验证为"全自动开发"**（M3 负责真实领取/进度/提交，不代表 M3 已独立启动开发执行者）；M3 CLI 独立驱动 ZCode 为后续升级目标，本版不宣称全自动闭环。
- **设计原则"调度器只编排、不仲裁"：** 任务状态机唯一持有方仍是 M1（04-规范 §3）；调度器**不得自行推断或修正 M1 状态**，只能通过 M1 正式接口读取与推进；**M1 代码零修改**。
- **归属：** `phase1/tools/scheduler.py`（F-003 独立 CLI 工具先例）；本版不改 module-boundaries.md。
- **人工检查点保留：** main 合并审批（DEC-010）、浏览器人工接管（会话锁边界）、开工授权。

## §2 执行步骤 S0–S9（v0.2：新增 PRECHECK 阶段）

| # | 步骤 | 通道 | 失败处置（详见 §10） |
|---|---|---|---|
| S0 | **PRECHECK（全部只读，零业务副作用）：** M1 可达+令牌在位+夹具在位+Chrome profile/调试端口未被占用+单实例守卫（run 锁文件，残留检测→提示人工清理） | 只读探测 | 任一失败→BLOCKED，不创建任何实体 |
| S1 | bootstrap：项目/批次/任务+OWNER 登录+服务身份 | M1 REST | 创建前幂等查询同名实体；部分建制失败→只读核实已创建清单并登记 |
| S2 | 任务包组装出站（≤1200 UTF-8 字节硬上限） | gpt_dispatch.mjs | 失败→登记 dispatch 证据，任务停留当前状态 |
| S3 | 真实 ChatGPT 规划会话（GPT-01） | CDP 真实 Chrome，`--new-session`，600s | 失败/超时→保留 run.log 与截图证据 |
| S4 | 回复登记 artifacts+messages（三 ID+幂等）+904 冻结契约 Ajv 双校验 | M1 REST+本地 Ajv | 登记失败→只重试登记（幂等键保护） |
| S5 | 状态机推进 DRAFT→PLANNING→ARCH_REVIEW→READY | M1 REST 事件（禁 DB 直改） | 失败→只读查询任务实际状态，确认未生效才重试 |
| S6 | 真实领取（claim_task→DISPATCHED，EXEC 建立） | M3 MCP stdio | 失败→只读核实是否已 DISPATCHED |
| S7 | START 事件+真实开发（编排会话=执行者，方案 b） | M1 REST+真实开发 | 开发失败→ORCHESTRATED_FAIL，任务 IN_PROGRESS 如实登记 |
| S8 | 仓库登记+真实 commit+M4 采集（diff/TEST_LOG artifact） | M1 REST+M4 commit_and_collect | 失败→只读核实 commit/采集是否已落库 |
| S9 | 报告闭环（progress/submit→DEVELOPMENT_COMPLETED 入 Inbox，终态 DEV_REPORTED） | M3 MCP→M1 REST | 登记失败→只重试登记（幂等键保护） |

## §3 硬边界（零扩张清单）

M1 代码零修改（调度器不启动/不停止 M1 与 Chrome，仅 PRECHECK 探测）；M2/M3/M4 复用不改；冻结契约（904 Schema 等 blob）只消费；GPT-02/03/04/05 消费链路不提前开放——CODE_REVIEW/TEST_ACCEPTANCE 及之后状态不在本版；F-003 Worker 不接入（TEST 节点编排属后续阶段）；906 不受影响；零 mock（所有通道真实）；历史不重写；秘密不进 Git（C6）。

## §4 执行安全（v0.2 修订）

- 出站 ≤1200 字节/条；`--new-session` 新空白会话；审查/咨询按完整 40 位 SHA 读仓库禁 HEAD。
- **BLOCKED 分界：** BLOCKED 仅允许发生在 S0 PRECHECK（零业务副作用）；S0 通过后任何失败=ORCHESTRATED_FAIL。
- **重复执行防护：** run 单实例守卫（锁文件；检测到残留→BLOCKED 并提示人工清理，不抢占）；S1 创建前先幂等查询同名项目/批次/任务是否已存在。
- **超时≠未成功：** REST 超时后一律**先只读核实实际状态**：已实际生效→继续后续步骤（如实登记核实过程）；确认未生效→按该步失败处置；不能确认→ORCHESTRATED_FAIL 停止（宁可停，不盲目重放）。
- **不自动重试外部执行**（gpt_dispatch/开发）；登记类请求仅凭幂等键安全重试。
- **幂等验证：** S4+S9 重放验证（预期结果分列于 A3）。

## §5 调度器结果三态（v0.2 分界）

| 结果 | 分界 |
|---|---|
| ORCHESTRATED_PASS | S0–S9 全过，任务终态 DEV_REPORTED，全链 ID/SHA 绑定 |
| ORCHESTRATED_FAIL | S0 通过后任一步失败或结果不能确认；**失败报告五要素：run_id/失败步号/最后确认状态/已完成操作清单（含已创建实体 ID）/证据指针** |
| BLOCKED | 仅 S0 PRECHECK 失败（零业务副作用）；人工清理项列入报告 |

**边界：** run 成功 ≠ 任务被验收——DEV_REPORTED 后的审查/测试验收链不在本版；"调度器只提供事实，不宣布事实是否可信"。

## §6 证据要求

每步三件套（stdout/stderr/meta.json 双 SHA-256，原始字节）比照 F-003 §6；dispatch 证据（reply.txt/result.json/截图/raw-units）按 905 先例归档；**失败 run 同样产出完整失败报告并归档（不留半截证据）**；RUN-RECORD 九步 ID/SHA 绑定+复盘（fail-closed 事件如实登记）；SHA256SUMS。

## §7 脱敏与归档（v0.2 补泄漏阻断）

runtime gitignored 执行；R1-R5 扫描；**发现 RAW 秘密泄漏→阻断归档**：相关证据不拷贝入 Git、如实登记泄漏事实、不静默修改原始字节（比照 F-003：REDACTED 占位可见、RAW 不得入库）；CLEAN 后直拷（原始字节不静默修改）；双分支分离（dev=调度器代码；evidence=RUN-RECORD+证据）。

## §8 运行报告与登记边界（方案 B 同款）

run 产出 `orchestration-report.json` 存证据目录（run_id 绑定；不新增 M1 登记路径=零 M1 修改）；S4/S8/S9 的 artifact/message 登记仅在九步既有步骤内发生。

## §9 凭据边界

OWNER 登录+服务令牌仅存 gitignored runtime 目录（env 注入调度器进程）；调度器无业务凭据硬编码；浏览器 profile 复用 905 专用 profile。

## §10 失败策略与超时（v0.2 分步处置）

- 各步失败处置见 §2 表列；统一原则：**先只读核实、后处置**；登记类凭幂等键重试；外部执行不自动重试。
- 超时：S3 600s；S7 600s；单 REST 调用 30s 默认；超时处置一律先只读核实（§4）。
- **无跨 run 断点续传：** 续跑=新 run 全新任务（全新项目/批次/任务，不复用半建制状态，避免跨 run 状态复杂度）。

## §11 验收标准 A1–A8（v0.2 可验收化：标准+判定条件）

| # | 标准 | 判定条件（独立验收者可执行） |
|---|---|---|
| A1 | 真实通道 | task_events 审计含 run 全部事件+零 DB 直改声明+每步证据文件存在且与 SHA256SUMS 一致 |
| A2 | 闭环真实 | M1 内任务终态 DEV_REPORTED+reply 原始字节 SHA 三处一致（dispatch unit hash/归档文件/M1 artifact 登记值） |
| A3 | 幂等 | S4 重放→artifact `duplicate:true` 同 ID+message 重放→409 RES-0003 不新增；S9 重放→`accepted:true`+`duplicate:true` 不新增消息；各重放响应证据归档 |
| A4 | 失败采集 | 失败注入=登记类故意缺参触发真实 REQ-0001 拒绝（905 §5-1 先例）；预期=该 run ORCHESTRATED_FAIL+失败报告五要素齐全 |
| A5 | 证据完整 | `sha256sum -c SHA256SUMS` 通过+每步三件套齐全 |
| A6 | 契约符合 | `contracts/v1.0/message-envelope.schema.json`+`contracts/v1.0/task-plan-submitted.payload.schema.json`（904 冻结）双 valid 0 errors+校验日志归档 |
| A7 | 安全 | `security-scan.txt` result: CLEAN（磁盘+git HEAD 树双范围）+扫描器可复现 |
| A8 | 重现核验 | 独立验收按完整 SHA 读双分支可重现全部判定；验收 reply 逐项引用 SHA |

## §12 不在范围（v0.2 增补）

多项目/多批次/多任务并发；守护进程/长驻监控/轮询 Inbox；断点续传与跨 run 状态复用；CODE_REVIEW/TEST_ACCEPTANCE 及之后状态推进；GPT-02~05 接入；F-003 接入；Outbox ACK 处置（PENDING 不动）；906 扩展场景；module-boundaries.md 修改；**M1/Chrome 由调度器启停**；Chrome profile 会话锁抢占（冲突→BLOCKED 等人工）；外部进程自动化 janitor（本版仅 kill+wait+登记）；分布式并发防护（本版仅单实例锁文件）。

## §13 待拍板项处置（第 1 轮会务意见，按 DEC-031 采纳）

1. **S7 开发腿=方案 b**（编排会话=真实执行者；方案 a=M3 CLI 独立驱动 ZCode 为后续升级目标，不把 POC 结构化返回能力等同真实开发闭环能力）。
2. **开发夹具=bundle_gate `--version`**（低风险、单文件、可验证）。
3. **实现语言=Python 标准库单文件**（与 F-003 一致；REST 客户端 stdlib urllib）。

## §14 版本历史

| 版本 | 日期 | 变更 |
|---|---|---|
| v0.1 | 2026-11-14 | 初稿：九步映射+三态+待拍板三项（主会话起草，依据 DEC-026 决议二路线） |
| v0.2 | 2026-11-14 | 第 1 轮评审 REWORK 六项修订：§2 明确 S7 半自动边界+新增 S0 PRECHECK；§4 BLOCKED 分界/重复执行防护/超时先只读核实；§5 三态分界+失败报告五要素；§6-7 失败报告归档+RAW 泄漏阻断；§10 分步处置表+无跨 run 续传；§11 A1-A8 可验收化；§12 五项增补；§13 三项按会务意见采纳（b/--version/Python） |
