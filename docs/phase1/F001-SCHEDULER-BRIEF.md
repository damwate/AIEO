# F-001 中央调度引擎最小版任务书（T-P1-908）

**版本：** v0.1（草案，待会务评审循环+用户开工拍板；比照 F-003/T-P1-907 立项流程）
**关联决策：** DEC-026 决议二路线第三项（单项目/单批次/单任务自动调度）；DEC-023（906 顺延不取消，本任务不占用 906 号段）；DEC-029/030（前置：F-003 Worker 已验收合并）；F-001 登记（FEASIBILITY-REGISTER §1，验证路径"Phase 4 前立项工程化"）

## §1 定位与设计原则

- **目标：** 把 T-P1-905 D1′ 九步人工编排固化为**可重复执行的单文件调度器**：一次 run 编排一个真实任务从 DRAFT 到 DEV_REPORTED 闭环（=905 九步逐步自动化映射，§2）。
- **设计原则"调度器只编排、不仲裁"：** 任务状态机唯一持有方仍是 M1（04-规范 §3）；调度器是 M1 REST 的普通客户端+phase0 真实工具的驱动器；**M1 代码零修改**（比照 907 红线延续）。
- **归属：** `phase1/tools/scheduler.py`（phase1/tools 编排工具区先例：test_worker.py）；app/ 四模块正式归属留待后续阶段（DEC-026 可分阶段），本版不改 module-boundaries.md。
- **人工检查点保留（不做自动化取代）：** main 合并审批（DEC-010）、浏览器人工接管（会话锁边界）、本任务开工拍板本身。

## §2 执行步骤 S1–S9（=905 九步映射）

| # | 步骤 | 通道 |
|---|---|---|
| S1 | bootstrap：项目/批次/任务+OWNER 登录+服务身份 | M1 REST |
| S2 | 任务包组装出站（≤1200 UTF-8 字节硬上限） | gpt_dispatch.mjs |
| S3 | 真实 ChatGPT 规划会话（GPT-01） | CDP 真实 Chrome，`--new-session`，600s 超时 env |
| S4 | 回复登记 artifacts+messages（三 ID+幂等）+904 冻结契约 Ajv 双校验 | M1 REST+本地 Ajv |
| S5 | 状态机推进 DRAFT→PLANNING→ARCH_REVIEW→READY | M1 REST 事件（禁 DB 直改） |
| S6 | 真实领取（claim_task→DISPATCHED，EXEC 建立） | M3 MCP stdio |
| S7 | START 事件+真实开发 | M1 REST+开发腿（见待拍板-1） |
| S8 | 仓库登记+真实 commit+M4 采集（diff/TEST_LOG artifact） | M1 REST+M4 commit_and_collect |
| S9 | 报告闭环（progress/submit→DEVELOPMENT_COMPLETED 入 Inbox，终态 DEV_REPORTED） | M3 MCP→M1 REST |

## §3 硬边界（零扩张清单）

M1 代码零修改；M2/M3/M4 复用不改；冻结契约（904 Schema 等 blob）只消费；GPT-02/03/04/05 消费链路不提前开放——CODE_REVIEW/TEST_ACCEPTANCE 及之后状态不在本版；F-003 Worker 不接入（TEST 节点编排属后续阶段）；906 不受影响；零 mock（所有通道真实）；历史不重写；秘密不进 Git（C6）。

## §4 执行安全

- 出站 ≤1200 字节/条；`--new-session` 新空白会话；审查/咨询按完整 40 位 SHA 读仓库禁 HEAD。
- **fail-closed：** 任一步失败→停止后续步骤、如实登记已到达状态与失败点；恢复只重试登记参数、不盲目重试外部执行（DEC-024-C ② 纪律实路先例：905 §5-1 两次拒绝）。
- **幂等：** S4 artifact/message 重放验证+S9 submit_result 重放验证（905 三重验证先例）。

## §5 调度器结果三态（run 级）

| 结果 | 语义 |
|---|---|
| ORCHESTRATED_PASS | 九步全过，任务终态 DEV_REPORTED，全链 ID/SHA 绑定 |
| ORCHESTRATED_FAIL | 中途失败：登记失败步号+已到达状态+已成功步骤证据保留 |
| BLOCKED | 前置不满足零执行：M1 不可达/令牌缺失/夹具缺失/参数校验失败 |

**边界：** 调度器 run 成功 ≠ 任务被验收——DEV_REPORTED 后的审查/测试验收链不在本版；"调度器只提供事实，不宣布事实是否可信"（905 Worker 设计原则延续）。

## §6 证据要求

每步三件套（stdout/stderr/meta.json 双 SHA-256，原始字节）比照 F-003 §6；dispatch 证据（reply.txt/result.json/截图/raw-units）按 905 先例归档；RUN-RECORD 九步逐步 ID/SHA 绑定+复盘（含 fail-closed 事件如实登记）；SHA256SUMS。

## §7 脱敏与归档

比照 F-003 §7：runtime gitignored 执行、R1-R5 扫描 CLEAN 后直拷证据目录（原始字节不静默修改）、双分支分离（dev=调度器代码；evidence=RUN-RECORD+证据）。

## §8 运行报告与登记边界（方案 B 同款）

run 产出 `orchestration-report.json` 存证据目录（不新增 M1 登记路径=零 M1 修改）；S4/S8/S9 的 artifact/message 登记仅在九步既有步骤内发生。

## §9 凭据边界

OWNER 登录+服务令牌仅存 gitignored runtime 目录（env 注入调度器进程）；调度器无业务凭据硬编码；浏览器 profile 复用 905 专用 profile。

## §10 失败策略

单步失败即停（fail-closed）；**无断点续传**——续跑=新 run 全新任务（最小版，避免跨 run 状态复杂度）；超时：S3 600s、单 REST 调用 30s 默认、S7 开发腿 600s 上限。

## §11 验收项 A1–A8

| # | 要求 |
|---|---|
| A1 | 真实通道：九步全经真实 REST/MCP/CDP，零 DB 直改（task_events 审计完整） |
| A2 | 闭环真实：单任务 DRAFT→DEV_REPORTED 全轨迹+GPT-01 真实规划回复 |
| A3 | 幂等+fail-closed：至少一次重放验证+至少一次真实 fail-closed 拦截演示 |
| A4 | 失败采集：ORCHESTRATED_FAIL 真实演示（人为制造单步失败并如实登记） |
| A5 | 证据完整：九步三件套+RUN-RECORD+SHA256SUMS |
| A6 | 契约符合：S4 双 valid（904 冻结 Schema） |
| A7 | 安全边界：R1-R5 扫描 CLEAN+零凭据进 Git |
| A8 | 工程交付：单文件调度器+双分支+RUN-RECORD+独立验收 |

## §12 不在范围

多项目/多批次/多任务并发；守护进程/长驻监控/轮询 Inbox；断点续传；CODE_REVIEW/TEST_ACCEPTANCE 及之后状态推进；GPT-02~05 接入；F-003 接入；Outbox ACK 处置（PENDING 不动）；906 扩展场景；module-boundaries.md 修改。

## §13 待拍板项（v0.1 提出，会务评审后用户拍板）

1. **S7 开发腿执行形态：** 方案 a=调度器经 M3 CLI 通道驱动真实 ZCode 执行者（全自动闭环，POC 02 已验证 CLI 结构化返回）；方案 b=复用 905 申报口径"编排会话=执行者"（半自动，调度器自动化其余八步）。
2. **开发任务夹具：** 905 的 bundle_gate `--help` 已合并进 main 不复用；需另选真实低风险最小变更（如 `--version` 输出）作为被编排任务内容。
3. **调度器实现语言：** 建议 Python 标准库单文件（F-003 先例，零新增依赖）；REST 客户端用 stdlib urllib。

## §14 版本历史

| 版本 | 日期 | 变更 |
|---|---|---|
| v0.1 | 2026-11-14 | 初稿：九步映射+三态+待拍板三项（主会话起草，依据 DEC-026 决议二路线） |
