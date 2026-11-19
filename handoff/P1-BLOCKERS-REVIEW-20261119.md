# P1 现状与问题清单（2026-11-19，交其他 AI 独立过目）

- **性质：** 用户指令"清理分支、理清现状、把问题实事求是列出来交给其他 AI 过目"的交接包；**不是**验收结论，**不**改变任何授权边界。
- **被测版本：** 本清单基于 `main@33301f3a9967f74675331e946b03abd86322ad48`（已推 origin/main）；次条 DEC 修复待提交。
- **边界：** P1 已获用户"OK，P1开始吧"授权，但 P2/P3、M1 写路径、906⑥ 实测、main 合并/生产发布/数据删除（DEC-010）均未授权。

## 一、清理动作与现状

1. **分支实况：** 仅 `main`（与 origin 同步）与 `feature/T-P1-908-fixture`（worktree `runtime/t-p1-908/wt-fixture`，2 个独有提交 `fda9183`/`0807064`）。
2. **fixture 分支不能删（本次未删）：** `git cherry -v main feature/T-P1-908-fixture` 显示两个提交均未被 main 等价吸收；`phase1/tools/bundle_gate.mjs` 的 `--version` 整改只在 fixture worktree 中；`phase1/tools/scheduler.py:368,372` 仍硬编码该分支与 worktree 路径；DEC-104/PHASE-STATUS v0.13 均记"保留待并入"。删除会丢未并入整改并破坏复核可复现性。
3. **决策日志错位已修：** DEC-113/114 曾被误插在 DEC-041 与 DEC-042 之间并吞掉 DEC-041 的"状态/关联"两行，现已移回文件末尾（DEC-041 恢复完整、DEC-042 复位、DEC-113/114 在末尾 986/991 行）。属执行者登记错误，如实留痕。
4. **工作区唯一改动：** `phase0/logs/mcp-call-records.json` 新增 2 条 MCP 调用记录（7→9 条，ping/get_test_task，自动采集），与任务无关，不合并入任何裁定。

## 二、P1 真实状态（实事求是）

| 项 | 真实结论 | 证据 |
|---|---|---|
| P1 授权 | 用户明批 P1；形态=人工 FIFO 串行、零新执行器代码 | `basic/tasks/b-20261119-multitask-p1-execution/`、DEC-113 |
| 阻塞① 两任务 ID | 已冻结（P1-01/P1-02 + 被测 SHA），但**任务包尚未创建** | `b-20261119-p1-task-qualification/steps.md` |
| 阻塞② 906⑥ 场景 | R1 ADJUST → R2–R6 五次 REJECT → L-019 会商 → DV1 REJECT → DV2 静态全 PASS 但整体 BLOCKED → DV2b 附件 STOP（未发送） | `b-20261119-p1-906-06-concurrency/steps.md`、DEC-114 |
| 阻塞③ 七项开跑前核验 | **未实测**；强隔离/熔断 BLOCKED，通道闸与五件套未补齐 | `b-20261119-multitask-p1-execution/steps.md` |
| 两个只读审计任务 | 仅 ID 冻结，**无任务包、无派单、无验收** | 全仓无 `b-20261119-p1-dispatch-evidence-audit/`、`b-20261119-p1-aisvc-postpass-lineage-audit/` 目录 |
| S4/S5/delivery | 三个 P1 任务包均**无 delivery.md**；S4/S5 未收口 | 各任务包文件清单 |
| M1 写路径/并发实测 | 未授权、未执行 | DEC-010/113/114 |

## 三、请外部 AI 独立判断的问题（核心）

1. **流程可行性：** 在"两任务 ID 已冻结但任务包未建、阻塞③未实测、三个任务包 S4/S5/delivery 未收口"的状态下，P1 应继续建包推进，还是先补收口/核验？给出最小闭环顺序。
2. **DV2 独立复跑如何真正闭环：** 审查端两次无法挂载附件（`dv1-standalone.mjs` 单文件已备），`24/24 all_ok=true` 仅为执行者自测。是否可由外部 AI 直接克隆仓库并运行该文件作为独立证据？还是必须换取证机制？边界：不得把执行者自测冒充独立复跑。
3. **文档一致性：** `scenario-design.md`/`steps.md` 仍有"R2–R5 REJECT、待 R6"口径，而实际 R6 已 REJECT 且进入降档链。这是"会商依据充分、仅文档滞后"还是"止损触发依据记录不足"？如何修不改写历史裁定。
4. **权威状态源冲突：** `docs/phase1/decision-log.md` 通过追加保持历史，但编号与物理顺序不一致（DEC-041/042 在前、111/112/113/114 在末尾）；`docs/PHASE-STATUS.md` 停在 2026-11-18 v0.13 未覆盖 P1。请裁定唯一权威口径与修订顺序。
5. **fixture 分支终局：** 无活跃任务引用，但有未并入 main 的独有整改 + `scheduler.py` 硬编码。选项：①保留（维持可复现）；②归档 patch/证据后删分支并解硬编码；③并入 main（需用户 DEC-010 拍板，本轮不做）。请给最小风险建议。

## 四、读取路径（完整 commit）

- 本清单：`handoff/P1-BLOCKERS-REVIEW-20261119.md`（与被测 commit 同提交）
- 决策链：`docs/phase1/decision-log.md` DEC-106/107/111–114
- 任务包：`basic/tasks/b-20261119-multitask-p1-execution/`、`b-20261119-p1-task-qualification/`、`b-20261119-p1-906-06-concurrency/`
- 证据：`phase0/logs/recoll-906s1-plan-r6-2026-11-19T07-33-14-189Z/reply.txt`（R6 REJECT）、`recoll-906s1-stop-2026-11-19T07-37-27-842Z/reply.txt`（会商 PASS）、`recoll-906s1-dv1-2026-11-19T07-45-00-998Z/reply.txt`（DV1 REJECT）、`recoll-906s1-dv2-2026-11-19T07-50-24-306Z/reply.txt`（DV2 BLOCKED）
- DV 产物：`basic/tasks/b-20261119-p1-906-06-concurrency/acceptance/dv1/`（含 `dv1-standalone.mjs`）
- fixture 证据：`docs/phase1/decision-log.md` DEC-063（main 未并入）、DEC-104（保留待并入）、`phase1/tools/scheduler.py:368,372`
