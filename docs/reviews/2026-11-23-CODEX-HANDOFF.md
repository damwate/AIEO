# AIEO 工作交接包：ZCode 会话 → Codex 独立审查（2026-11-23）

**生成时间：** 2026-11-23（UTC）  **生成者：** ZCode 执行会话
**性质：** 事实（附证据）／决策（注明版本）／待确认（不得当事实）——逐条标注
**用途：** 用户将本文件路径交给 Codex 直接检查仓库；并请 Codex 协助解决第 5 节三组未闭合问题。
**基线 commit：** `23d3b60a1590b2bb28e841cdcfab1cb313607ee5`（`git rev-parse HEAD` 实查；main，工作区 clean，与 origin/main 同步 ahead=0 behind=0）

---

## 1. 目标与阶段（事实）
AIEO 标准版（Phase 1 四模块 M1–M4）已完成；当前在做**新需求"动态任务调度"的方案设计**，尚未进入实施。本次交接目的：①让 Codex 独立评估开发进度与代码质量；②请 Codex 帮忙攻克方案复审卡住的三组并发事务设计问题。

## 2. 仓库与基线（事实）
- 仓库：`https://github.com/damwate/AIEO.git`，分支 `main`
- 基线：`23d3b60a1590b2bb28e841cdcfab1cb313607ee5`（本交接包将与该包同 commit 提交）
- 工作区：clean；与 origin 同步

## 3. 已完成事项（事实，附证据）
1. **会话上下文预算管理（CTX-CODE-R8）**：编码验收 3/3 PASS，经用户 DEC-131 批准 FF 合并 main。被测锚点 `353e190`，补证 `4fe07fa`，任务登记 `DEV-20261123-001`。证据：`basic/tasks/b-20261122-session-ctx-mgmt/steps.md` §S4、`evidence/r8-test-execution-evidence.md`、`docs/phase1/decision-log.md` DEC-131。
2. **当前 main 四模块全量回归 + 集成 E2E**：M1 43 / M2 65 / M3 53 / M4 24 全绿 exit0，集成 11 步 all_ok=True，被测 `de07a2d`。证据：`phase1/logs/user-retest-20261123-de07a2d/RESULT.md`、`phase1/logs/integration-20261123T042534Z/`。
3. **动态任务调度需求登记 + 方案 R1–R5 五轮修订与审查派单**：全部零重发、补采七查全过。证据：`basic/tasks/b-20261123-dynamic-task-scheduling/`（requirement.md、acceptance/design-proposal-r{1..5}.md、REVIEW-STATUS.md）、`phase0/logs/recoll-dynsched-r{1..5}/reply.txt`（审查方原始裁定）。

## 4. 未完成事项（事实）
- **动态任务调度方案未冻结**：R5 裁定 FAIL，R2-02/03/04 三组问题未闭合（见第 5 节）。按 L-019 已停止自动整改循环，交用户决策；用户已选 **路径 B**（接受当前为设计草稿，不冻结，待授权实施阶段时再一起审）。
- `fix/parallel-stage2` 分支未合并（Phase B R3 FAIL，架构级 P0×3，与本需求不同线索）。

## 5. 【请 Codex 协助】三组未闭合问题的精确清单（事实 + 待确认）
审查方（ChatGPT 网页独立审查）每轮裁定明确"方向正确，仅执行约束和故障边界需补齐"。**请 Codex 读方案全文后，针对下列各点给出具体、可落地的工程解法**（不是泛泛评价）：

### 5.1 R2-02 额度预留账本（reply `dd39b3e3…` 第 58–92 行）
背景：已确定 `workflow_journal` 为唯一权威账本（仅追加/fsync），`scheduler-state.json` 与任务表为物化视图；容量 = `active_count + valid_reserved_count ≤ 3`，RESERVED 立即占额。
未闭合三点：
- **事务串行化**：两个并发申请同时读到相同账本状态、都判定有名额、各自提交会突破上限。需要唯一 journal 写者/全局事务锁/等效串行化，容量校验必须基于最新已提交 journal 序号，在同一串行化边界内完成预留 COMMIT。
- **RESERVED 终态竞争**：EXPIRED/授权通过/授权失败并发时，如何保证一个 reservation 只有一个终态、迟到操作不得覆盖已提交终态（原子条件转换/CAS）。
- **EXPIRED 时间规则**：默认值未给、时钟基准与过期边界判定未定义（文档只说"T 是配置常量"）。

### 5.2 R2-03 决策提交与恢复（reply 第 94–122 行）
背景：阶段 2 `DECISION_ACCEPTED` 是唯一不可撤销决策提交点（txn A 同时提交决策+epoch+1+victim 锁定+DRAINING）；阶段 5 `VICTIM_RELEASED` 由 txn C 同提交点释放 victim 状态与额度；阶段 6 改名 `PROPOSAL_CLOSED`。
未闭合两点：
- **txn B（HANDOFF_READY）故障矩阵**：txn B 提交前后崩溃时如何判断是否继续排空、是否重新校验交接包、何时允许进 txn C。
- **txn E（URGENT_ADMITTED）确定性恢复**：失败时"续跑 vs 归还"不能留给恢复程序自行选择，需给出确定性判定条件（依据已提交预留状态/有效期/加急准入决策），且不能出现"已准入但名额又被归还"。

### 5.3 R2-04 fencing 与游标（reply 第 124–158 行）
背景：txn A 原子完成决策+epoch+1+DRAINING；txn C 关白名单+generation+1；服务端校验 fencing token。
未闭合三点：
- **事件效果与去重原子性**：`seen_event_ids[]` 记录与采集结果写入是否同一事务提交；否则"效果已写但 seen 未提交"会重复应用，"seen 已记但效果未落"会被误判重复。
- **游标作用域**：`cursor_low` 来源（哪个已提交游标）与 `event_seq` 作用域（全局还是每个 `inflight_round_id` 独立）未定义。
- **最新 fencing 状态读取**：物化视图是可重建派生数据，写入口如何确保读到最新已提交 epoch/generation 而非落后视图。

审查原文：`phase0/logs/recoll-dynsched-r5/reply.txt`（reply SHA256 `dd39b3e32e349fbe…`）。

## 6. 架构决策（决策，注明出处）
- DEC-131 用户批准合并 `fix/session-ctx-mgmt` → main（2026-11-23，`docs/phase1/decision-log.md`）
- 用户 2026-11-23 拍板新需求规则：并行上限 3（超限等待）+ 协商式抢占（人在回路，用户拍板让路任务暂停/终止交接）——`basic/tasks/b-20261123-dynamic-task-scheduling/requirement.md`
- 用户 2026-11-23 选路径 B：方案作设计草稿、不冻结、待授权实施时再审——本交接包第 4 节
- 审查方边界（每轮重申）：P0 设计冻结之外 P1/P2/P3 均未授权；906⑥ 独立 PASS 前 M1 写路径并行不放开；并行度 3 是设计目标非运行授权

## 7. 模块契约与测试环境（事实）
- 四模块：`app/platform`（M1）、`app/gpt_controller`（M2）、`app/zcode_bridge`（M3）、`app/git_worker`（M4）
- 环境：Python 3.12.10（pytest 8.3.5/fastapi/httpx/argon2 全局）、Node v24.14.0、各模块 node_modules 就绪；代理 127.0.0.1:1080（注册表）；CDP 9222 受管 Chrome profile `runtime/chrome_profiles/gpt-poc`
- 测试命令与结果见第 3 节证据 2

## 8. 历史审查结论（事实）
| 轮次 | 被测 SHA | reply SHA | 裁定 | 未闭合 |
|---|---|---|---|---|
| R1 | a74f027 | 84a6085f | FAIL（方案文件未入 SHA，L-007） | 程序性 |
| R2 | 37b08e0 | cfdaeb0c | FAIL | 6 项 |
| R3 | 5cd68f9 | a85ef9e3 | FAIL | 5 项 |
| R4 | d5797f8 | 445d19e5 | FAIL | 3 项 |
| R5 | cb5a8d8 | dd39b3e3 | FAIL | 3 项（执行细节） |
维持 PASS：R2-01 授权契约、R2-05 交接包内容、R2-06 WAITING 语义。详见 `REVIEW-STATUS.md`。

## 9. 已知风险与红线（事实 + 决策）
- **DEC-010 红线**：main 合并/生产发布/数据删除须用户本人拍板；本交接不解除。
- agent-kit `fix/session-budget` 对 damwate GitHub **403 无推送权，如实登记未绕过**；核心源码经 `session-budget-code.zip` 入 AIEO 仓。
- DEC-017 扩展场景（真实 ChatGPT 多 unit、动态虚拟列表、私有仓库、网络故障注入、平台级并发 906⑥）仍 BLOCKED。
- 审查会话已迁移至 `6b03aea8`（旧 `6b02a805` 被用户清理，实测为不可达而非上下文上限）。

## 10. 给 Codex 的具体请求（待确认）
1. **进度评估**：按 `docs/PHASE-STATUS.md` 与 decision-log 评估 AIEO 标准版完成度，指出被高估或遗漏处。
2. **重点攻坚**：第 5 节三组问题，给出可直接落入 `design-proposal-r6.md` 的具体修法（每条含：机制定义 + 原子性边界 + 故障恢复规则），优先 R2-04 事件去重原子性与 R2-02 串行化。
3. **判断是否值得继续**：以你的独立判断，这套协商式抢占方案在 P0 设计层面还差多少能冻结？是否存在更简单的等价设计（审查方明确不要扩新功能、不重开已 PASS 项）。

**注意：** 本次交接仅为审查与设计协助，**Codex 的建议不自动构成实施授权**；任何代码改动与阶段放行仍需用户明确批准。
