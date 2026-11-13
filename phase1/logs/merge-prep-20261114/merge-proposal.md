# main 合并审批材料（B 项：先准备后审批）

**生成：** 2026-11-14，主会话。**流程依据：** DEC-010（合并 main 人工审批）、C5 §6.3（集成→main 仅用户人工审批后由主会话执行）、agent-contract §6-2（禁止 Agent 私自合并）、GPT 会务建议（`phase0/logs/dispatch-2026-11-13T16-31-45/reply.txt`：47 commits 差异核对+可追溯合并清单+回归确认后由用户审批）。
**待审批动作：** 将 `fix/AIEO-PHASE0-REVIEW-R10` @ `54644c3` 合并进 `main`（建议 `--no-ff` 保留合并记录，合并提交信息注明用户审批）。

## 1. 差异规模与结构核对

| 核对项 | 结果 |
|---|---|
| 领先提交数 | 48（`origin/main` = `e58b85b` 为 HEAD 祖先，**无分叉、无冲突**，零文件删除） |
| 变更规模 | 821 files，+37813 / −4 行 |
| 主要构成 | phase0 全部（POC 证据/reports/tools/logs ~50%）；四模块代码与测试（app/ + tests/）；Phase 1 治理文档（docs/phase1）；验收证据（phase1/logs） |
| CI | 仓库无 CI 配置；质量门禁=模块回归 + 独立审查（已闭环） |

## 2. 可追溯合并清单（48 提交 → 任务/审查轮次归属）

| 段 | 提交（正序） | 归属与结论 |
|---|---|---|
| Phase 0 POC | 5b717a2、f59f044 | POC-01~05，Phase 0 完成（closeout §1） |
| Phase 0 审查 R1~R11 | 559f627、7c03fde、0e940ce、7c45263、009a2d1、77472e7、01857f3、49e6ffd、937314b、df4340f、21d259d、54901ff、fdafd55 | MAJOR-001/002 与锁 v1→v6 十一轮 REWORK→PASS 闭环（`phase0/reports/phase0-closeout.md`） |
| Phase 0 会务 | b954ca2 | DEC-008 依据 |
| Phase 1 治理与 BLOCKED-1 | 555fd44、81d63f7、27999da、d98bf50、26e1019、2eb3c14、26ed310、a3b8ecf、b486964、227b72e、5367b48、00a2f7b、d580b5b | 契约冻结 DEC-011、DEC-012~017 各轮（PASS_WITH_CONSTRAINTS 定案） |
| Phase 1 实现+T-P1-901 | 7093458、040571e、c0226ee、e3e5fab、f73b054、7872e86、8780b9d、a9233c7、aab9de4、f60440a、120d425 | M1/M2/M4 交付与 F-001~F-601 八轮闭环 **PASS**（ART-M1-000010）；M3 独立交付 |
| T-P1-902 集成验收 | 064f214、853e1a9、f1c4794、5439134、c13b642、0f5d9cb | 集成套件+缝隙修复+两轮审查 **PASS**（ART-M1-000011） |
| Phase 1 收尾 | 37b0a3d、54644c3 | 交接包 + **DEC-018 契约追认**（docs-only） |

**结论：无未验收/来历不明提交。** 最后一个代码变更 commit 为 `064f214`（集成缝隙修复，经 T-P1-902 审查）；其后 `853e1a9`~`54644c3` 为工具/证据/治理文档，其中含代码的 `853e1a9`（manifest_tool.mjs，Phase 0 无触及）与全部证据文件均已入 T-P1-902 manifest 接受审查。`37b0a3d`、`54644c3` 为纯文档。

## 3. 回归确认（合并前最后一道门）

命令与基线（handoff §10）：M1 `python -m pytest tests/platform/ app/platform/tests/ -q`（基线 43）/ M2 `node --test` ×3 文件（基线 65）/ M3 `node --test test/*.test.mjs`（基线 53）/ M4 `python -m pytest tests/ -q`（基线 24）。

| 模块 | 基线 | 本次 HEAD=`54644c3` 实测 | 日志 |
|---|---|---|---|
| M1 | 43 passed | **43 passed**，exit=0 | `phase1/logs/merge-prep-20261114/m1-regression.log` |
| M2 | 65 passed | **65 passed**（fail 0），exit=0 | `phase1/logs/merge-prep-20261114/m2-regression.log` |
| M3 | 53 passed | **53 passed**（fail 0），exit=0 | `phase1/logs/merge-prep-20261114/m3-regression.log` |
| M4 | 24 passed | **24 passed**，exit=0 | `phase1/logs/merge-prep-20261114/m4-regression.log` |

**四模块全部不低于基线，回归门禁通过。**

E2E（11 步）：最后一次全绿证据 `phase1/logs/integration-20261113T160107Z/`（r2）；其后无代码变更，不重复要求（环境依赖 Chrome/代理，失败先查环境）。

## 4. 已声明的边界（合并不改变）

- BLOCKED-1 扩展场景未验收（DEC-017 分批解除路线已定，DEC-018 重申）；M2 真实 chatgpt.com 链路为申报边界（headless fixture）；C7 首期单机单用户；合并进 main 不改变上述技术边界。

## 5. 审批与执行

- 审批人：用户。批准后主会话执行：`git checkout main && git merge --no-ff fix/AIEO-PHASE0-REVIEW-R10`（合并信息注明"经用户审批，DEC-018 路线 B 项"）→ 推送 origin → decision-log 登记（DEC-019）。
- 回滚方式：合并为普通 merge 提交，`git revert -m 1 <merge_sha>` 可整体回退，不改写历史。
