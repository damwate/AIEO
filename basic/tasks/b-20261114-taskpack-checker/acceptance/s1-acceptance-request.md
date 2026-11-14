# 验收请求：b-20261114-taskpack-checker 第 1 步（S1 骨架）

> **版本注记（返工问题3+问题4，2026-11-14）：** 首版绑定 `49c82b5`（首验 REJECT 两项 P1）→ 问题3 修正后绑定 `40c66d9`（复验 R2 dispatch-2026-11-14T15-24-07 指出绑定不一致）→ 问题4 修正后最终待验收对象绑定 `553ed2d`（复验 R3 dispatch-2026-11-14T15-28-41 REJECT：冻结口径1"阶段读取失败=①项FAIL"实现返回 N/A）。本版为绑定 `553ed2d` 的更新版。

## 代码绑定

- 分支：main（https://github.com/damwate/AIEO.git）
- 开发前基线 commit：`9de95cc1`（方案冻结；其父链见 git log，需求拍板 b1cc528）
- **本次待验收 commit：`553ed2d12455e6f30a2cee22616eeafb73ecf963`**（= 首验 `49c82b5` + 返工 `40c66d9` + 返工 `553ed2d`，最终代码状态）
- 测试所绑定的 commit：`553ed2d12455e6f30a2cee22616eeafb73ecf963`（与待验收一致；动态证据 v2 ENVIRONMENT.txt 声明同一 commit）
- 验收 diff 范围：`9de95cc1` → `553ed2d`（三个 commit：`49c82b5` 新增 basic/tool/check_taskpack.py 274 行；`40c66d9` 返工问题1/2 修复；`553ed2d` 返工问题4 修复——仅 check_taskpack.py，无其他文件改动）

## 验收历史（证据链，防混合认定）

1. 首验（dispatch-2026-11-14T15-08-02，会话 6af87983）：对象 `49c82b5`，结论 **REJECT 两项 P1**（问题1 文本遗漏 phase_problems；问题2 文本/JSON 未共用完整结果对象）。
2. 返工（`40c66d9`）：最小修复两项 P1，未动 S2 范围。
3. 复验 R1（dispatch-2026-11-14T15-13-16，会话 6af87ac5）：对象 `40c66d9` 静态审查 **两项 P1 修复 PASS + 六项标准②-⑥ PASS**，BLOCKED=缺动态执行原始证据。（其后因采集器跳位缺陷双方无法恢复该轮完整结论原文，按 DEC-043 先例换新会话，静态结论以上轮报告为准）
4. 复验 R2（dispatch-2026-11-14T15-24-07）：动态证据 8 组落盘核验通过，**REJECT=代码绑定不一致**（本文档当时仍绑定 `49c82b5`）→ 本版更新绑定，问题3 登记于 steps.md。
5. 复验 R3（dispatch-2026-11-14T15-28-41）：**REJECT 问题4**——冻结口径 1"阶段读取失败=①项 FAIL"实现却返回 N/A（新问题，与问题1/2/3 独立，第 1 次返工；执行者"桩期语义"辩护不成立）。
6. 返工问题4（`553ed2d`）：check_requirement 内读阶段，UNKNOWN=FAIL+可识别原因+files 登记 task-brief.md；阶段正常仍 N/A 桩；整体 FAIL 优先不变；六项独立函数保持。
7. 动态证据 v2：commit `af3e9a7d1384e60b5ad23304c88d718b85a6ccc4`（acceptance/s1-runtime-evidence-v2/，四场景×双模式 8 组原始 stdout/stderr/exit + ENVIRONMENT.txt，被测 `553ed2d`；v1 目录保留为 `40c66d9` 行为的历史证据，不覆盖）。

## 验收内容

- 本步骤目标（steps.md 拍板冻结原文照录）：S1 骨架：CLI+状态模型+六项检查函数桩（验收重点：结构正确）
- **本步骤验收标准（可验证通过条件）：**
  1. CLI 可运行：`python basic/tool/check_taskpack.py <task_dir> [--json]`；文本输出含 Taskpack/Phase/六项 `[状态] ①-⑥ 名称`/Overall；退出码 PASS=0、FAIL=1、IN_PROGRESS=1；
  2. 阶段读取五分支：缺 task-brief.md/非法状态值/占位符状态→UNKNOWN+problems（不猜阶段）且①项=FAIL+可识别原因（冻结口径 1，问题4 修复后口径）；"待规划"→PLANNING；"阻塞"→IN_PROGRESS（其余映射见 steps.md 冻结口径 1）；
  3. `--json` 与文本共用同一检查结果对象（items 七字段：no/name/status/problems/files/steps/evidence）；
  4. 任务目录不存在→FAIL+退出码 1+可识别问题文本；
  5. 仅 Python 标准库，无第三方依赖；
  6. 六项检查函数独立互不依赖：②-⑥ S1 为 N/A 桩；①阶段正常时 N/A 桩、阶段读取失败时 FAIL（S2 实现字段级检查——拍板分步设计，非缺陷）。
- 交付物：basic/tool/check_taskpack.py

## 自测证据

| 项 | 内容 |
|---|---|
| 实际执行命令 | `python -I basic/tool/check_taskpack.py <target> [--json]`（动态证据落盘：acceptance/s1-runtime-evidence-v2/，四场景×双模式 8 组） |
| 执行结果 | 8 组退出码全=1（FAIL/IN_PROGRESS→1 符合约定）；A 场景任务目录不存在=FAIL；B/B2 场景 Phase=UNKNOWN+可识别原因+①项=FAIL（问题4 修复后口径）；C 场景（本任务包）Phase=IN_PROGRESS、六项 N/A、Overall=IN_PROGRESS |
| 原始测试日志路径 | acceptance/s1-runtime-evidence-v2/run-*.stdout / run-*.stderr / run-*.exit + ENVIRONMENT.txt（commit `af3e9a7d1384e60b5ad23304c88d718b85a6ccc4`；v1 目录保留为 `40c66d9` 历史证据） |
| 未测项及原因 | unittest 正负例+11 类异常场景全套在 S3（拍板分步） |
| 对应 commit SHA | 被测代码 `553ed2d12455e6f30a2cee22616eeafb73ecf963`（证据提交 `af3e9a7d1384e60b5ad23304c88d718b85a6ccc4`） |

## 验收方自查提示（验收六查，不得只读本请求）

自行获取并核查：用户拍板方案（steps.md 冻结版）、本步骤验收标准、开发前基线 commit、实际代码 diff（`9de95cc1`→`49c82b5`）、测试执行结果及证据。六查：①符合步骤目标 ②符合拍板方案 ③未超范围 ④无明显代码质量问题 ⑤测试真实执行 ⑥证据可核查。

## 结论

PASS（本步通过，允许进入 S2）/ REJECT（退回修复，给具体修改要求）/ BLOCKED（环境原因无法验收，如实说明）。返工计数按"同一问题"规则（basic/WORKFLOW.md 模块五）。
