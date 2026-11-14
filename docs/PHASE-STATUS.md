# AIEO 阶段进度与状态（PHASE-STATUS）

**版本：** v0.3【T-P1-904 闭环更新；五份交付物整体状态=TECHNICALLY_PASSED，逐份审阅定稿中（DEC-024-D）】
**定位：** 持续维护的阶段进度快照（EXP-PLANNING-001 §五）；本 v0.1 内容源自复盘盘点草案 `docs/reviews/2026-11-14-总体规划与可行性复盘-主会话盘点.md` 并追加 E 验收核对矩阵。
**更新纪律：** 随任务/阶段状态变化更新；只记状态与证据指针，过程留仓库；数字与结论必须可溯源。
**事实基准：** 2026-11-14 仓库实查。**本文件全部统计所依据的代码基线 = `e19c000`**（统计时点 HEAD=origin/main；此后提交 824188c 起均为文档与派单证据，`app/`、`tests/`、`contracts/` 无变化）；本文件自身随文档修订在新 commit 演进，两者不是同一口径。M1 新鲜回归于本日实跑。

---

## 1. 当前快照（2026-11-14）

- **所处阶段：** Phase 1 收尾期（名义 Phase 1/2 交界，实际此前进度横跨计划外——详见 §3）。
- **重大状态变更：** 用户暂停 T-P1-904 实施发起总体规划复盘（2026-11-14）；复盘四项原则批准；重排路线见 `docs/立项/06-MVP实施计划与验收标准.md` §10。**【2026-11-14 更新】T-P1-904 契约机器化已交付、会务两轮复核 PASS 并合并 main（merge commit `a445a77`，DEC-024-B 用户批准）；交付复核正式关闭（DEC-024-A）；T-P1-905 D1′ 获有边界开工授权（DEC-024-C）。**
- **测试基线：** M1 43 用例全绿（本日新鲜实跑 exit=0）；四模块回归基线 M1 43 / M2 65 / M3 53 / M4 24 全绿（`phase1/logs/merge-prep-20261114/`，DEC-019）；契约测试 Ajv 23 Schema 141/141 全绿（`phase1/logs/t-p1-904-20261114/schema-tests.log`）。
- **授权窗口：** 授权期收尾——用户 2026-11-14 提前回归，会后逐项拍板四项决议（DEC-024 A/B/C/D）；五份交付物进入逐份审阅定稿流程（DEC-024-D，现状态 TECHNICALLY_PASSED）。
- **硬边界不变：** 合并 main 逐任务授权（DEC-010；904 已获 DEC-024-B 授权并执行）/不发布/不改契约冻结文本/不解除 DEC-017 扩展场景限制。

**总体边界提醒：** 下文所有 ✅ 均指**模块层或自驱动集成套件层**已验证——真实外部执行端（真实 chatgpt.com 会话、真实 ZCode 领取）从未通过 M1 REST 走过一单真实业务（集成套件的 GPT/ZCode 腿是测试夹具，`phase1/logs/integration-20261113T160107Z/`）。该缺口由 D1′ 垂直切片（06 §10 P0-B）验证。

## 2. E：Phase 1 验收清单核对矩阵（2026-11-14 实查）

### 2.1 核对方法

对照 06 §2"Phase 1 验收"七项 + §7"MVP 最终验收清单"26 项，逐项映射到仓库可验证证据（测试用例名/日志/commit）。标注四态：**✅ 已完成**（有直接测试或可复现证据）／**⚠️ 部分**（能力存在但真实链路未通或覆盖不全）／**❌ 未完成**（属后续阶段或缺口）／**🔶 CLAIMED_ONLY**（有进度声明但无可验证的真实证据）。
新鲜回归命令：`python -m pytest tests/platform -q`（仓库根），2026-11-14 实跑 **43 passed, exit=0**。

### 2.2 06 §2 Phase 1 验收（7/7 全部有直接测试映射）

| 验收项 | 结论 | 证据 |
|---|---|---|
| 能创建项目和需求批次 | ✅ | `tests/platform/test_projects_batches.py`（test_create_project_and_batch 等） |
| 能手动创建父子任务和依赖 | ✅ | `test_parent_child_dependency_blocks_child_until_parent_accepted`、`test_unknown_dependency_rejected`、`test_parent_must_exist` |
| 状态转换符合状态机 | ✅ | `test_legal_transition_chain_and_duplicate_event_idempotency`、`test_illegal_transitions_rejected_with_task_0001`、`test_agent_cannot_set_accepted_directly`、`test_blocked_requires_reason_owner_and_condition`、`test_cancel_records_operator_and_reason` |
| 重复消息不会重复处理 | ✅ | `test_duplicate_message_not_double_processed`、`test_ack_is_idempotent_and_dead_letter_requeue_requires_human`、`test_dev_report_and_duplicate_report_idempotency` |
| 后端重启后任务状态不丢失 | ✅ | `test_state_persists_across_engine_restart`、`test_admin_rebootstrap_is_idempotent` |
| 进度只按 ACCEPTED 任务计算 | ✅ | `test_board_completion_counts_only_accepted` |
| 操作有审计记录 | ✅ | `test_audit_records_appended_for_key_actions`、`test_audit_login_failure_recorded` |

**Phase 1 验收小结：M1 层 7/7 全部通过（43/43 用例绿）。** 待用户确认后即可诚实关闭 Phase 1（06 §10 P0-A）。

### 2.3 06 §7 MVP 最终验收清单（26 项标注）

**需求与规划（2✅ 2❌）**

| 项 | 结论 | 说明 |
|---|---|---|
| 用户可提交需求 | ✅ | M1 REST 层（项目/批次创建已测）；前端入口仅雏形（F-005） |
| GPT-01 输出结构化任务计划 | ❌ | 真实腿未通；现有证据为浏览器模拟级（`phase1/logs/m2-gpt-controller-20261113/browser_simulation-*`） |
| GPT-02 完成架构审核 | ❌ | 同上 |
| 任务依赖经过校验 | ✅ | 依赖门禁测试齐（含 BLOCKED 原因强制） |

**开发执行（3✅ 2⚠️）**

| 项 | 结论 | 说明 |
|---|---|---|
| 智谱能接收指定任务 | ⚠️ | MCP 双通道 POC（DEC-005）+ aieo-poc 测试桩级；真实领取未通（D1′ 验证） |
| 任务包包含工程规范和验收条件 | ⚠️ | 消息结构与契约就绪；真实任务包投递未通 |
| 开发进度可追踪 | ✅ | M1 board API + task_events 已测 |
| 阻塞可上报 | ✅ | BLOCKED 状态 reason/owner 强制已测 |
| 开发报告结构化 | ✅ | development_reports 表 + 幂等登记已测 |

**Git 与测试（3✅ 1⚠️ 1❌）**

| 项 | 结论 | 说明 |
|---|---|---|
| 独立任务分支 | ✅ | C5 冻结 + M4 git_worker 已测（DEC-019 合并记录为实践证据） |
| Commit SHA 可验证 | ✅ | M4 `commit_and_collect` 已测；集成套件真实采集过 commit |
| Diff 可读取 | ✅ | M4 `read_diff` 已测（`app/git_worker/worker.py:1064`） |
| 测试日志可追溯 | ❌ | **测试执行 Worker 缺位**（F-003）：M1 仅做 test_reports 登记，真实执行与证据采集无人负责 |
| 工作区状态可验证 | ⚠️ | M4 worktree/状态采集能力存在（24 用例绿）；端到端证据链未通 |

**审查与验收（1✅ 1⚠️ 3❌）**

| 项 | 结论 | 说明 |
|---|---|---|
| GPT-03 审查真实 Diff | ❌ | 真实腿未通；现有 M2 证据为模拟级 🔶（不构成真实链路验收） |
| GPT-04 检查真实测试证据 | ❌ | 同上，且受 F-003 牵制 |
| REWORK 能创建返工 | ✅ | `test_review_rework_creates_new_execution_round`（新 execution 轮次） |
| 新 Commit 触发重新审查 | ⚠️ | M1 状态机事件推进就绪；真实触发链未通 |
| GPT-05 输出批次审计 | ❌ | 真实腿未通 |

**系统可靠性（7/7 全✅）**

| 项 | 结论 | 证据 |
|---|---|---|
| 消息去重 | ✅ | `test_duplicate_message_not_double_processed` |
| 超时处理 | ✅ | `test_outbox_sweep_retry_then_dead_letter_then_requeue`（重试→死信→人工 requeue） |
| 失败重试 | ✅ | 同上 |
| 人工暂停 | ✅ | `test_cancel_records_operator_and_reason` + 审批流（`test_service_token_blocked_from_approval_creation`） |
| 重启恢复 | ✅ | `test_state_persists_across_engine_restart` |
| 操作审计 | ✅ | 审计同事务测试齐 |
| 敏感信息保护 | ✅ | C7 冻结 + `security.py`（Argon2id/Session/CSRF）+ 认证测试齐 |

**§7 小结：26 项 = 16✅ / 4⚠️ / 6❌ / 0🔶（🔶 已并入相关 ❌ 项说明）。** 未完成 6 项全部集中于**真实 GPT 多角色腿（4 项）与测试执行链（2 项）**——正是 FEASIBILITY-REGISTER F-002/F-003 两个最高风险登记项，非 M1 平台缺陷。
**升级纪律（会务复核意见 §2.3）：** 4 项 ⚠️ 不得因 D1′（T-P1-905）通过而自动改为 ✅——仍需按真实证据逐项验收后更新。

### 2.4 统计口径差异注记（诚实记录，含机器清单证据）

| 登记口径 | 实装实查（2026-11-14） | 说明 |
|---|---|---|
| "45 端点"——**历史登记口径**（前会话盘点记录，非实装验证值，见盘点草案与 V3 §3-1） | **41 个方法级端点（33 条路径；api.py 装饰器 40 处）** | 按 `create_app()` 实例化统计（method×path，不含 HEAD/OPTIONS）。按实装 41 记，不回改历史登记。**机器清单证据：`phase1/logs/e-check-20261114/m1-endpoints.json`**（41 项，含 HTTP Method/Path/处理函数/总数，代码基线 e19c000） |
| "16 表"——契约 C2 冻结核心口径（§3.3 十六张核心表定义） | **001_init.sql 实建 20 表** | **16 张核心表全部实建、零缺失**（机器清单证据：`phase1/logs/e-check-20261114/m1-tables.json`）。实建额外 4 表**不属于 C2 契约新增内容**，为实现需要：`platform_users`/`user_sessions`/`service_credentials`（C7 认证授权）+ `task_events`（状态机事件记录，event_id 幂等）。C2 契约文本未因此修改 |

## 3. 阶段状态总表（持续维护）

| 阶段/工作块 | 状态 | 证据指针 |
|---|---|---|
| Phase 1（M1） | 实现与测试齐，验收核对矩阵已出（§2），待用户确认关闭 | 本文档 §2；DEC-019 回归基线 |
| Phase 2（M2）真实收发 | ❌ 未验证（模拟级）；随 D1′ 验证 | F-002；`phase1/logs/m2-gpt-controller-20261113/` |
| Phase 3（M3/M4）真实领取 | ⚠️ 桩级；集成套件真实跑过状态机全链（含真实 commit 采集） | `phase1/logs/integration-20261113T160107Z/` |
| 测试执行 Worker | ❌ 缺位（TEST 节点无人负责） | F-003 |
| 中央调度引擎 | ❌ 未工程化（人工+主会话工具） | F-001 |
| Phase 4 端到端闭环 | ❌ 真实腿从未跑通（D1′ 为其验证器） | 06 §10.2 |
| 管理后台 | ⚠️ 雏形（前端 5 源码文件） | F-005 |
| 契约体系 C1-C8 | 冻结 v1.0.0 + §2.6 生效（DEC-021）；**机器化 19 Schema 已落地并合并 main（T-P1-904，Ajv 141/141，DEC-024-A 验收关闭）** | DEC-011/018/021/023/024；`contracts/v1.0/` 4 GitPointer Schema + 19 机器 Schema + matrix.json（`phase1/logs/t-p1-904-20261114/`） |
| 审查协议体系 | 双层保证协议生效（DEC-020）；分档简化已原则批准 | DEC-020/021；review-protocol |
| 计划外工作块（交接包/工具链/DEC 机制） | 已形成资产；治理文档增量冻结 | 盘点议题 6 |

## 4. 未解决问题与风险

统一登记 `docs/FEASIBILITY-REGISTER.md`（F-001~F-007）；重大决策沿革 `docs/phase1/decision-log.md`。当前无 BLOCKED 级阻塞。

## 5. 下一步

见 06 §10.3 任务清单（号段已会务裁定选方案 A：T-P1-904 缩编版先行 → 905 D1′ → 906 C2 第一批；依赖 904→905→906 递进）。**【2026-11-14 更新】904 已完成并合并 main（`a445a77`）；905 D1′ 已按任务书 v0.3 执行完毕（九步真实端到端最小闭环 PASS，全链记录 `phase1/logs/t-p1-905-d1prime-20261114/RUN-RECORD.md`，开发分支 `feature/T-P1-001-bundle-gate-help`=`916d8b2`、证据分支 `feature/T-P1-905-d1prime`=`a2895af`，均未合并 main；详细状态见证据分支版本文档 v0.4）。【用户指示 DEC-025】下一步=召开整体需求初步满足度评估会（复杂场景缺口不阻塞，用中记录、修复或规避）；D1′ 独立验收与 906 启动留该会议商定、用户拍板；五份交付物按 DEC-024-D 逐份审阅定稿。**

## 6. 版本记录

| 版本 | 日期 | 变更 | 批准人 |
|---|---|---|---|
| v0.1 | 2026-11-14 | 初稿：复盘盘点升级 + E 验收核对矩阵 + 口径差异注记 | 待用户 2026-11-14 10:30 审阅 |
| v0.2 | 2026-11-14 | 会务复核修订（dispatch-2026-11-13T19-27-30 §二/§六）：代码基线 e19c000 与文档 commit 区分声明；41 端点机器清单+20 表分组清单证据指针（`phase1/logs/e-check-20261114/`）；45 明确标注历史登记口径；⚠️ 项升级纪律；§5 号段改为会务已确认方案 A | 待用户 2026-11-14 10:30 审阅 |
| v0.3 | 2026-11-14 | 904 闭环登记：T-P1-904 交付+两轮复核 PASS+合并 main（`a445a77`，DEC-024-B）；DEC-024-A 验收关闭/C 905 开工授权/D 定稿制度同步；契约体系行更新（4 GitPointer+19 机器 Schema+matrix.json，Ajv 141/141）；授权窗口改为授权期收尾 | 用户拍板（DEC-024 四项，2026-11-14） |
