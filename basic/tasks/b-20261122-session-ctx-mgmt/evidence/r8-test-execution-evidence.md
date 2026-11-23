# CTX-CODE-R8 第 2 项补证：测试执行证据与版本绑定

**生成时间：** 2026-11-23（UTC）
**用途：** 回应用户审查 R8 裁定第 2 项 FAIL（证据不足）——审查方指出 `monitor/test-session-budget.mjs` 在 agent-kit 外部仓库，未取得对应版本源码与可核验 23/23 执行结果。本文件绑定完整 SHA 并提供仓内可复核的真实执行日志。

## 1. 被测版本锚点（双仓）

| 组件 | 仓库 | 分支 | 完整 Commit SHA | 角色 |
|---|---|---|---|---|
| AIEO 接入（hooks + 派单门控） | damwate/AIEO | fix/session-ctx-mgmt | `353e190b230abb1080964f68577c5a1cf00a080a` | 本轮派单被测 HEAD（用户指定 re-dispatch 目标） |
| agent-kit 预算核心 | agent-kit（本机 D:/CommonProjects/agent-kit，403 无 GitHub 推送权，未绕过） | fix/session-budget | `6d9aad05cd01483c55aafd5de975270afa3d5f34` | session-budget.mjs / test-session-budget.mjs 权威版本 |

## 2. 源码完整性绑定（SHA-256）

| 文件 | 权威位置 | SHA-256 | 说明 |
|---|---|---|---|
| session-budget.mjs | agent-kit `6d9aad05` monitor/ + 已入 zip `session-budget-code.zip` | `147044602e7ec8697abac248ff4ee59c9e57464c87a0691243237f00244f05a8` | 核心唯一账本；本地与 zip 逐字节一致 |
| test-session-budget.mjs | agent-kit `6d9aad05` monitor/ + 已入 zip | `2c7d96457298b1b6488298a19cc4e614c499be526249cdad073f73206ad23a71` | 23 用例；本地与 zip 逐字节一致 |
| ctx_budget_hooks.mjs | AIEO `353e190` phase0/tools/ | `cae657e733fc2edff22f246bee8de6fd9458b46dc92c4b5d8fe14655736ed4df` | R5/R7 整改后权威版；zip 内为 v6 旧快照，以 commit 内源码为准 |
| test_ctx_budget_hooks.mjs | AIEO `353e190` phase0/tools/ | `ec1e8e34609c2cc217a946b2b7ddea611eb647941775aa3044f1887ca393b3e5` | 9 用例；同上 |

`session-budget-code.zip`（已在 AIEO 仓内 evidence/）为历史 v6 完整代码快照，用于审查方读取核心源码；hooks 的权威版本以被测 commit `353e190` 内 `phase0/tools/` 为准（审查方已在该 SHA 下实读并 PASS 第 1 项）。

## 3. 真实执行结果（本轮重新运行，非历史摘录）

| 测试 | 命令 | cwd | 结果 | 退出码 | 证据路径 |
|---|---|---|---|---|---|
| agent-kit 核心 23 用例 | `node --test monitor/test-session-budget.mjs` | D:/CommonProjects/agent-kit @ `6d9aad05` | tests 23 / pass 23 / fail 0 / skipped 0 | 0 | `basic/tasks/b-20261122-session-ctx-mgmt/evidence/test-session-budget-r8-run.log` |
| AIEO hooks 9 用例 | `node --test phase0/tools/test_ctx_budget_hooks.mjs` | d:/AIEO @ `353e190` | tests 9 / pass 9 / fail 0 / skipped 0 | 0 | `basic/tasks/b-20261122-session-ctx-mgmt/evidence/test_ctx_budget_hooks-r8-run.log` |

日志含 node 真实 `ℹ tests/pass/fail` 计数行与逐用例耗时；`Tee-Object` 同时保留 stdout 与真实退出码记录（`EXITCODE=0`）。测试层级：unit + 双进程真实并发（agent-kit C1/C8/COMMIT 两态注入/C10 busy deadline 实测）。

## 4. agent-kit 403 如实登记

agent-kit 分支 `fix/session-budget` 对 damwate GitHub 远端**无推送权（403），未绕过**（不改账号、不换仓库、不复制冒充）。核心源码通过 `session-budget-code.zip` 入 AIEO 仓供审查方读取；测试执行在本机 agent-kit 权威版本 `6d9aad05` 真实运行并留证如上。此为能力/权限边界如实申报，不代表代码缺陷。

## 5. 请审查方裁定

仅重裁定 R8 第 2 项（测试证据）：上述 23/23 + 9/9 真实执行日志 + 双仓 SHA 绑定是否满足"可核验的执行结果"。第 1、3 项已 PASS，按 R8 回复最小收尾动作不重做。
