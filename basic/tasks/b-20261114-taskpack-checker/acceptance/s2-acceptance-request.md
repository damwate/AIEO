# 验收请求：b-20261114-taskpack-checker 第 2 步（S2 六项检查规则实现）——复验 R3

> **绑定注记：** 本请求为复验 R2 REJECT（dispatch-2026-11-14T16-57-13，reply sha256=495ede70f2b2d374cf44813fd8b9dd8bffe0cb7719f1fcf5d786fa2c7727ad22）后的返工复验请求。
> **验收历史：** S1 四轮闭环（复验 R4 PASS，dispatch-15-51-20）；S2 首验 REJECT（16-40-38，P0+P1-1+P1-2/P1-3 三项）→ 整改 e664e76 → 复验 R2：**P0 绑定 PASS（GitHub compare 核实 ahead_by=1 无混入）、P1-1 ③到期优先 PASS（静态+F/G 动态核验）、①②⑥维持 PASS、④⑤编号级关联部分通过**，遗留一个 P1（④"REJECT 无编号"判定范围）→ 整改 3a8975a → 本复验请求。

## 代码绑定

- 分支：main（https://github.com/damwate/AIEO.git）
- **本次待验收代码 commit：`3a8975ac5d8e797be9c90309bcc56ceba3356d99`**
- **验收 diff 范围：`7cd06cf` → `3a8975a`（单 commit，即 3a8975a 自身改动，parent=7cd06cf）。请以 `git show 3a8975a` / `git diff 7cd06cf 3a8975a` 核验。**
- 该 diff 仅含两个文件：basic/tool/check_taskpack.py（check_rework_records ④判定范围整改）+ acceptance/s2-fixtures/fixture-reject-element-no-number/（复验R2 要求的反例 fixture，4 文件）
- 文档绑定：本验收请求文件与 steps.md 返工登记、证据 v3 随本次文档 commit 入库；被测代码以 3a8975a 为准
- 绑定口径延续 R2 已认可的"待验收 commit 自身 diff=parent→commit"；S2 验收范围不含任何并行任务 commit

## 复验 R2 遗留 P1 整改对照

| R2 裁决 | 整改内容 | 验证 |
|---|---|---|
| 遗留 P1：④对 REJECT 无编号的判断范围错误——`if not extract_problem_numbers(body)` 查整个步骤小节，而 reject_nums 提取用 REJECT 所在要素值+⑥，范围不一致；反例（④含 REJECT 无编号+①/⑤提及问题1+表有问题1有效行被引用）可致④误 PASS，违反"REJECT 无编号引用必须 FAIL" | **仅改 check_rework_records()**：判定范围与提取范围统一为 step_reject_nums（REJECT 所在各要素值∪⑥），为空即 FAIL「S<id> 含 REJECT 但 REJECT 所在要素值与⑥验收证据引用均未引用问题编号」；不允许用同一小节其他无关要素的编号替代；逐编号有效返工行检查、返工行被步骤小节引用检查、⑤计数逻辑均未动 | 证据 v3 I 组（R2 指定的反例 fixture，旧实现漏判场景→现在④ FAIL 且⑤仍 PASS）；A-H 回归不退化 |

## R2 已认可项（未动，仅列明）

- P0 绑定口径（待验收 commit 自身 diff 申报）：本次延续，绑定节即按此口径申报；
- P1-1 ③先判到期再评记录：check_step_acceptance 未改动（3a8975a diff 不含该函数）；
- ①需求记录、②步骤清单、⑥交付记录：未改动；
- ④逐编号有效返工行+返工行被引用检查、⑤只计已关联行+第 4 次 FAIL：未改动（本次仅统一"REJECT 无编号"这一处的判定范围）。

## 验收内容（冻结清单不变）

- 本步骤目标（steps.md 拍板冻结原文照录）：S2 六项检查规则实现（验收重点：规则逐项通过）
- 六项当前实现要点：①requirement.md 非空非占位符+task-brief 9 必备字段（表格行/行内/标题三形态提取；当前状态走阶段映射、最终结果暂空不入占位检查）；②`## S<编号> <名称>` 小节解析；③**先判到期再评记录**（COMPLETED 全须 PASS/IN_PROGRESS 编号<当前须 PASS/PLANNING 全 N/A/当前步骤解析不出=FAIL 不猜）+六要素+PASS 结论+dispatch 目录+reply SHA256(64hex)+包内证据路径校验；④编号级三方关联（REJECT 所在要素值+⑥提取编号→逐编号须有有效返工行；返工行须被步骤小节引用；**REJECT 所在要素值与⑥均无编号=FAIL，其他要素编号不替代**）；⑤只计已关联行，第 3 次允许、第 4 次及以后 FAIL，COMPLETED 无返工空满足 PASS；⑥COMPLETED 时 delivery.md 七要素，其余 N/A。
- 实现约束不变：六项独立函数、统一 ItemResult、汇总 FAIL>IN_PROGRESS>PASS、文本+`--json` 同一结果对象、退出码 PASS=0 其余=1、仅标准库、异常输入可识别结果。

## 自测证据（v3 九组，随本次文档 commit 留档）

| 组 | 场景 | 预期=实际 |
|---|---|---|
| A | 自身任务包（IN_PROGRESS 当前=S2，返工表问题1-8 全关联） | ①②④⑤ PASS、③⑥ N/A、exit=1 |
| B | fixture-good-completed | 六项全 PASS、exit=0 |
| C | fixture-rework4（问题1×4+小节引用） | ④ PASS、⑤ FAIL「问题1 达 4 次」、exit=1 |
| D | fixture-reject-no-table | ③ FAIL、④ FAIL（REJECT 无编号+无表）、exit=1 |
| E | `--json` 与文本一致性（own-pack+反例 fixture 双份） | 六项+overall 全一致 |
| F | fixture-phase-boundary-inprogress | ③：S1 PASS、S2/S3 未到期 N/A（回归不退化） |
| G | fixture-phase-boundary-planning | ③ 全 N/A（回归不退化） |
| H | fixture-reject-wrong-number | ③④ FAIL：问题1 无行+问题2 行未被引用（回归不退化） |
| I | **fixture-reject-element-no-number（R2 反例）** | ④ FAIL「REJECT 所在要素值与⑥均未引用问题编号」、⑤ PASS（问题1 行已关联×1）、exit=1 |

原始输出：acceptance/s2-runtime-evidence-v3/run-{a..i}*.stdout/.json；fixtures 七场景可复跑：`python basic/tool/check_taskpack.py basic/tasks/b-20261114-taskpack-checker/acceptance/s2-fixtures/fixture-<name>`。

## 自测如实记录

本轮无新增自测修正（R2 指定的整改为单点判定范围统一，反例 fixture 按要求构造）；回归七场景一次通过。

## 验收方自查提示（验收六查，不得只读本请求）

自行获取并核查：steps.md 冻结口径与 S2 清单、`git diff 7cd06cf 3a8975a`（应仅 check_rework_records 一处逻辑改动+反例 fixture）、证据 v3 九组原始输出、七 fixture 复跑（重点 I 组与 A-H 回归）。六查：①符合步骤目标 ②符合拍板方案 ③未超范围 ④无明显代码质量问题 ⑤测试真实执行 ⑥证据可核查。

## 结论

PASS（本步通过，允许进入 S3）/ REJECT（退回修复，给具体修改要求）/ BLOCKED（环境原因无法验收，如实说明）。返工计数按"同一问题"规则（basic/WORKFLOW.md 模块五）：问题8 为第 1 次返工待复验（问题7 同项④遗留）。
