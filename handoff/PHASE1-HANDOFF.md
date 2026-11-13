# 会话交接包：Phase 0 → Phase 1

**生成时间：** 2026-11-12
**生成者：** ZCode 治理文件起草会话（Phase 0 主会话的后续任务）
**性质标注：** 【事实】附证据 ／【决策】注明版本与出处 ／【待确认】不得当事实

---

## 1. 目标与阶段

【事实】AIEO 项目目标：AI 多 Agent 工程化交付平台（MVP 范围见 `docs/立项/06-MVP实施计划与验收标准.md`）。Phase 0（技术验证）已完成并通过 11 轮独立审查；本次交接目的：Phase 1（工程管理基础平台）开工。

## 2. 仓库与基线【事实，2026-11-12 git 实查】

- 仓库：`https://github.com/damwate/AIEO.git`（origin）
- 分支：`fix/AIEO-PHASE0-REVIEW-R10`
- 基线 commit：`b954ca28f8fe3c6f8ac725cd86687b82904c3fc7`（`git rev-parse HEAD` 实查）
  - `54901ff`：十一轮审查 PASS 对应的代码基线（closeout 文档原记录）；
  - `fdafd55`：Phase 0 收尾与交接文档；`b954ca2`：会务讨论定稿（9 风险 + 15 建议）——两个 docs commit 在 PASS 之后追加；
- 工作区状态：tracked 文件 clean；存在本次治理会话新增的未跟踪目录 `docs/phase1/`（五件套）与 `handoff/`（本文件），**是否提交、何时提交由用户/下一会话决定**；
- 与远端同步：本地与 `origin/fix/AIEO-PHASE0-REVIEW-R10` 一致（无 ahead/behind），即 `b954ca2` 已推送。

## 3. 已完成事项【事实，逐条附证据】

1. **Phase 0 五项 POC 全部通过**（结论矩阵 `phase0/reports/phase0-final-report.md` §1）：
   - P0-001 环境盘点（`phase0/environment-inventory.md`；Windows 10.0.26300 / Node v24.14.0 / Python 3.12.10 / Git 2.47.1 / Chrome 157.0.8103.39 / ZCode CLI 0.17.1）；
   - POC-01 ZCode MCP 工具调用（6/6 验收；`phase0/reports/mcp-validation.md`）；
   - POC-02 外部启动 ZCode 任务（PASS_WITH_CONSTRAINTS；`phase0/reports/zcode-trigger-validation.md`）；
   - POC-03 Playwright 控制 Chrome 网页 GPT 会话（PASS_WITH_CONSTRAINTS；`phase0/reports/gpt-browser-validation.md`；`phase0/gpt-browser-poc/gpt_roundtrip.mjs`）；
   - POC-04 Git 自动采集（9/9 步；`phase0/reports/git-validation.md`；`phase0/logs/git-poc-result.json`；`phase0/git-poc/git_collect.py`）；
   - POC-05 端到端最小闭环（六步全过；`phase0/logs/e2e-evidence.json`；run2 七项验收均为计算值 true，提交 `747197f8`，报告 `phase0/reports/rework-2026-11-12.md`）。
2. **11 轮独立审查闭环：R1-R10 全部 REWORK → R11 PASS**（仅 1 个非阻断 MINOR，已整改复跑验证）。轮次/commit/问题对照表见 `phase0/reports/phase0-closeout.md` §1；每轮派单与 GPT 原始结论在 `phase0/logs/dispatch-*/`；返工报告 `phase0/reports/rework{,2..10}-2026-11-12.md`。
3. **会务方案与 GPT 定稿**：9 风险 + 15 建议（`phase0/logs/dispatch-2026-11-11T20-45-33/reply.txt`，commit `b954ca2`），已逐条落入治理文件（覆盖索引见 `docs/phase1/agent-contract.md` 附录 A）。
4. **Phase 1 治理文件五件套已创建**（v0.1 草稿，2026-11-12）：`docs/phase1/agent-contract.md`、`module-boundaries.md`、`handoff-template.md`、`review-protocol.md`、`decision-log.md`；本交接包 `handoff/PHASE1-HANDOFF.md`。

## 4. 未完成事项【事实】

1. **Phase 1 全部范围**（`docs/立项/06-MVP实施计划与验收标准.md` §2）：项目注册、Git 仓库配置、需求批次、任务 CRUD、任务依赖、状态机、消息 Inbox/Outbox、报告与附件、操作审计、基础进度看板；验收七条（同文件 §2 验收节）。
2. **Phase 0 遗留待办五项**（`phase0/reports/phase0-closeout.md` §5，不阻塞）：
   - [ ] `phase0/tools/gpt_dispatch.mjs` 单条 1200 字节上限 → 分块投递或 Git 指针（方案选型待开工会议）；
   - [ ] `gpt_roundtrip.mjs` 仍为 R2 前双闩锁写法 → Phase 1 控制器统一按 R3+ 语义实现；
   - [ ] MCP Server 调用记录 NDJSON 化（MINOR-003）；
   - [ ] ZCode 权限模式分级（MINOR-004）、Git 路径配置化（MINOR-005）；
   - [ ] 锁 v6 workDir 清理（release 不删目录，累积）→ Phase 1 加 janitor。

## 5. 架构决策【决策，注明版本与出处；详表 `docs/phase1/decision-log.md` v0.1】

| 编号 | 决策 | 出处 |
|---|---|---|
| DEC-001 | 会话锁 v6：互斥交给内核（OS 句柄），放弃内容仲裁 | `21d259d`；`phase0/e2e-poc/session_lock.mjs` |
| DEC-002 | GPT 网页控制用 CDP 接管 + DOM 契约，禁止绕过手段 | `phase0/reports/phase0-final-report.md` §3.1/§5.2 |
| DEC-003 | GPT 登录用邮箱方式，Google OAuth 不可用 | final-report §5.1 |
| DEC-004 | ChatGPT 依赖系统代理 127.0.0.1:10391 | final-report §2/§5.3 |
| DEC-005 | ZCode 双通道：MCP + 官方 CLI `--prompt --cwd --mode --json` | `phase0/reports/mcp-validation.md`、`zcode-trigger-validation.md` |
| DEC-006 | 外部取消 ZCode 无官方接口 → 超时+软取消+进程树终止兜底 | final-report §5.4 |
| DEC-007 | 长 payload 走 Git 指针，不走网页 | final-report §6/§7 |
| DEC-008 | 会话管理策略（轮换优先级/交接包/简报/三态/不直连/单会话单任务） | `phase0/reports/phase0-closeout.md` §2 ★ 项；`b954ca2` |
| DEC-009 | Phase 1：主会话编排 + 四子 Agent 分模块 + 公共契约先冻结 + 独立集成验收 | closeout §3；reply.txt 建议 7/8/14 |
| DEC-010 | 审查闭环与 Git 规则（独立分支/绑 SHA/旧结论失效/合并人工审批） | `docs/立项/04` §3/§4/§6、`docs/立项/03` §10 |

## 6. 模块契约【决策】

- 当前生效：`docs/phase1/module-boundaries.md` v0.1（初稿）。四模块 = 平台基座（FastAPI+SQLite）/ GPT 控制器（CDP+DOM 契约）/ ZCode Bridge（MCP+CLI）/ Git Worker；公共契约冻结清单 C1-C8 标注 **[开工会议定稿]**；会话锁资源边界（浏览器/工作区/Git/部署四锁）已按 DEC-001 教训分列。
- 变更入口：统一变更申请 → 主会话评估 → 定新版本 → 记 `decision-log.md`（`agent-contract.md` §6-1）。

## 7. 测试环境与已知约束【事实】

- OS Windows 10.0.26300.9974 / Node v24.14.0 / Python 3.12.10 / Git 2.47.1 / Chrome 157.0.8103.39 / ZCode CLI 0.17.1（`phase0/environment-inventory.md`，含一次用户纠正：本地已装 playwright 1.63）；
- 网络约束：chatgpt.com 直连不通，必须系统代理 127.0.0.1:10391 在线；智谱 API 直连正常（final-report §2）；
- 未验证事项如实声明（final-report §7）：`--resume` 未实测、五角色并行未实测、长回复 >4KB 网页传输未测、锁屏下 Worker 稳定性未测等。

## 8. 历史审查结论【事实】

R1 `559f627` REWORK（e2e 判定硬编码）→ R2 `7c03fde`（生成判定不严）→ R3 `7c45263`（stopOk 闩锁污染）→ R4 `009a2d1`（true→true 持续可见）→ R5 `77472e7`（并发无互斥，锁 v1）→ R6 `01857f3`（锁初始化窗口/回收 TOCTOU，v2）→ R7 `49e6ffd`（rename 非 CAS，v3）→ R8 `937314b`（仍非 CAS，v4 票据）→ R9 `df4340f`（票据初始化窗口/schema，v5）→ R10 `21d259d`（死票据清理 TOCTOU，内容仲裁根缺陷 → **v6 OS 句柄**）→ **R11 `54901ff` PASS**（仅 MINOR 路径硬编码，已整改复跑）。原表 `phase0/reports/phase0-closeout.md` §1。

## 9. 已知风险【事实（来源标注）+ 待确认单列】

1. DOM 契约随 ChatGPT 改版失效（中；缓解：契约自检 + 手册式锚点更新，final-report §6）；
2. ChatGPT 风控升级导致封禁/验证频繁（中；缓解：单会话单任务低频、错误暂停转人工、不绕过）；
3. 代理中断致 GPT 不可达（中；缓解：探活前置）；
4. ZCode CLI 版本升级行为变化（低；缓解：`--version` 探测 + 锁定版本验收）；
5. 锁只保护接入锁机制的自动化操作，手工操作可绕过（GPT 风险 7；缓解：`module-boundaries.md` §6 人工边界列为强制约定）；
6. 【待确认】main 是否合并 `fix/AIEO-PHASE0-REVIEW-R10`：**等待用户决定**（closeout §4 进入条件）；未决定前 Phase 1 以当前分支为基线开工属待确认操作。

## 10. 测试命令与结果【事实】

- 会话锁 v6：`phase0/e2e-poc/test_session_lock_v6.mjs`（文件实查存在；运行方式见 `phase0/e2e-poc/README.md` 与 `package.json`）——R10/R11 审查通过，含双实例竞争场景；
- E2E 闭环：`phase0/e2e-poc/e2e_orchestrate.mjs`（run2 七项验收全 true、exit 0；证据 `phase0/logs/e2e-evidence.json`、存档 `phase0/logs/e2e-commit-evidence-747197f8/`）；
- Git 采集：`python phase0/git-poc/git_collect.py`（9/9 步 PASS；结果 `phase0/logs/git-poc-result.json`）；
- 派单工具：`node phase0/tools/gpt_dispatch.mjs`（round4-11 审查请求文本存于 `phase0/tools/round*-review-request.txt`）。

## 11. 下一步【计划，按顺序】

1. 【待确认】用户确认合并 Phase 0 分支到 main，或确认以 `b954ca2`（当前分支）为 Phase 1 基线；
2. 提交本批治理文件（`docs/phase1/` 五件套 + `handoff/PHASE1-HANDOFF.md`），commit 后更新本包 §2 工作区状态；
3. Phase 1 开工会议：定稿 `module-boundaries.md` 标注 [开工会议定稿] 的条目（模块目录命名、工作区路径、公共契约 C1-C8、迁移脚本归属、gpt_dispatch 分块 vs Git 指针选型）；开工即新建 GPT 审查会话（review-protocol §5.1 强制轮换），简报按 `review-protocol.md` §2；
4. Explore 子 Agent 摸清现有结构 → 主会话冻结公共契约 → 按 `agent-contract.md` §3 任务单分模块派单；
5. 集成验收按 `agent-contract.md` §7。

## 12. 禁止事项【决策，详见 `docs/phase1/agent-contract.md` §6】

子 Agent 不得私改公共契约；不得直接合并/推送 main；不得直接对接审查会话；交付以 commit + 可复现证据为准，不采信自述；每模块独立分支 + 独立工作区；Agent 不得自行置任务为 ACCEPTED；网页自动化失败不得伪装为完成；被修改的 commit 必须重新审查。

## 13. 待确认事项【待确认——不得当事实】

| 事项 | 决策人 | 所需信息 |
|---|---|---|
| main 合并 Phase 0 分支，或以当前分支为基线 | 用户 | 11 轮审查已 PASS；main 自 Phase 0 分叉后是否有他人改动（开工前 `git log main..HEAD` 复核） |
| 治理文件是否本轮提交 | 用户/下一会话 | `docs/phase1/` + `handoff/` 当前为未跟踪状态 |
| 模块目录命名、工作区路径、C1-C8 定稿、gpt_dispatch 选型、janitor 归属 | Phase 1 开工会议 | module-boundaries §1/§5/§7 标注项 |
