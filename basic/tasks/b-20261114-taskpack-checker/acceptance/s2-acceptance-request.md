# 验收请求：b-20261114-taskpack-checker 第 2 步（S2 六项检查规则实现）——复验 R2

> **绑定注记：** 本请求为 S2 首验 REJECT（dispatch-2026-11-14T16-40-38，reply sha256=757db8ce1ee5de5f5229837d3acd2a51373ac0f813827a94dba59deeb88764c5）后的返工复验请求。首验结论：①②⑥ PASS；P0 绑定范围申报与实际不符 + P1-1 ③到期判定顺序 + P1-2/P1-3 ④⑤编号级关联三项缺陷，均已整改。
> **验收历史：** S1 四轮闭环（复验 R4 PASS，dispatch-15-51-20）；S2 首验 REJECT（16-40-38）→ 返工 commit e664e76 → 本复验请求。

## 代码绑定（P0 整改后的准确申报口径）

- 分支：main（https://github.com/damwate/AIEO.git）
- **本次待验收代码 commit：`e664e76b49be268739070b08aded9066e4b4908c`**
- **验收 diff 范围：`955ffaa` → `e664e76`（单 commit，即 e664e76 自身改动，parent=955ffaa）。请以 `git show e664e76` / `git diff 955ffaa e664e76` 核验，勿按区间统计。**
- 该 diff 仅含 S2 返工文件：basic/tool/check_taskpack.py（P1-1/P1-2/P1-3 整改）、basic/tasks/b-20261114-taskpack-checker/steps.md（返工登记）、acceptance/s2-fixtures/（新增三 fixture+rework4 修补）、acceptance/s2-runtime-evidence-v2/（八组证据）
- 文档绑定：本验收请求文件随本次提交（文档 commit）入库；若请求文件所在 commit 与 e664e76 不同，属正常（文档与代码分 commit），被测代码以 e664e76 为准
- **区间申报声明（P0 整改）：** 首验时申报"diff=553ed2d→3add8da 单 commit"实际该区间含 9 个 commit，其中其余 8 个属并行任务：S1 闭环回填+代理共识（af3e9a7 证据v2/9dcf116 材料/aea9441 登记修正/cb595a5）、check-push 基本功任务（15c2a94/f5b286e/7239fea/56a4fda）。本次改为按"待验收 commit 自身 diff"申报，上述并行任务不在 S2 验收范围。

## 首验 REJECT 三项整改对照

| 首验裁决 | 整改内容 | 验证 |
|---|---|---|
| P0 绑定范围申报与实际不符 | 本请求重写绑定口径：待验收 commit 自身 diff=parent→commit；并行任务逐个列明不在范围 | 本节"代码绑定" |
| P1-1 ③先评记录后判到期（PLANNING/未到期步骤预填完整 PASS 记录误判 PASS） | check_step_acceptance 重排：先阶段/到期判定（PLANNING 全 N/A；IN_PROGRESS 编号≥当前 N/A；COMPLETED 全到期），未到期一律 N/A 不评估记录，预填完整 PASS 记录不提前 PASS | 证据 v2 F/G 组+fixture-phase-boundary-{inprogress,planning} |
| P1-2 ④未做编号级三方关联（无关行可替代）；P1-3 ⑤计全部有效行未限定已关联行 | ④：REJECT 所在要素值+步骤小节⑥提取问题编号，每个 REJECT 编号须有对应有效返工行，返工行须被某步骤小节引用，无关行不替代缺失关联；REJECT 无编号引用=FAIL；⑤：只计通过编号级关联的行（未引用行不计数，关联缺陷由④单独 FAIL） | 证据 v2 H 组+fixture-reject-wrong-number（REJECT 引问题1、表仅问题2 行→④双问题 FAIL） |

## 验收内容（冻结清单不变，仅整改实现）

- 本步骤目标（steps.md 拍板冻结原文照录）：S2 六项检查规则实现（验收重点：规则逐项通过）
- **冻结清单六项对照（steps.md S2 原文）：**
  1. ①需求记录：requirement.md 原文非空 + task-brief.md **9 必备字段**非空非占位符（实现：表格行/行内/`## 字段`标题三形态提取；**当前状态走阶段映射专门校验、最终结果设计上"任务完成前暂空"不入占位检查表**——首验已认可此口径）；②步骤清单：steps.md 有效步骤编号与名称——两项首验 PASS 未动；
  2. ③步骤验收记录：**先判到期再评记录**（整改后顺序）——COMPLETED 全步骤须 PASS；IN_PROGRESS 编号<当前须 PASS（编号≥当前未到期 N/A）；PLANNING 全 N/A；当前步骤解析不出 S 编号=FAIL 不猜；六要素+PASS 结论+dispatch 目录+reply SHA256(64hex)+包内证据路径校验（相对/禁 `..`/防符号链接出界/存在性）；
  3. ④REJECT 返工记录：**编号级三方关联**（整改后）——REJECT 所在要素值+⑥提取的问题编号，每个编号须有「问题编号匹配+修复 commit 40 位 hex」有效返工行；有效返工行须被至少一个步骤小节引用；REJECT 无编号引用=FAIL；无关行不替代缺失关联；
  4. ⑤返工次数：**只计通过编号级关联的行**（整改后），同编号第 3 次允许、第 4 次及以后 FAIL（冻结口径 3）；COMPLETED 且无 REJECT 无返工表=空满足 PASS（首验已认可）；
  5. ⑥交付记录：COMPLETED 时 delivery.md 七要素齐全非空，其余阶段 N/A（首验 PASS 未动）。
- 实现约束自检不变：六项独立函数互不依赖执行顺序、统一 ItemResult、汇总层 FAIL>IN_PROGRESS>PASS、文本+`--json` 同一结果对象、退出码 PASS=0 其余=1、仅标准库、异常输入可识别结果。

## 自测证据（v2 八组，commit e664e76 内留档）

| 组 | 场景 | 预期=实际 |
|---|---|---|
| A | 自身任务包（IN_PROGRESS 当前=S2） | ①②④⑤ PASS、③⑥ N/A、exit=1 |
| B | fixture-good-completed | 六项全 PASS、exit=0（④⑤ COMPLETED 空满足） |
| C | fixture-rework4（问题1×4 行+小节引用） | ④ PASS、⑤ FAIL「问题1 达 4 次」、exit=1 |
| D | fixture-reject-no-table | ③ FAIL（S1 路径穿越拒绝+S2 缺 PASS）、④ FAIL（REJECT 无编号+无表）、exit=1 |
| E | `--json` 与文本一致性 | 同一结果对象，判定一致 |
| F | fixture-phase-boundary-inprogress（IN_PROGRESS 当前=S2，三步全预填完整 PASS 记录） | ③：S1 PASS、S2/S3 N/A「未到期」（P1-1：预填不提前 PASS） |
| G | fixture-phase-boundary-planning（待规划，全预填 PASS 记录） | ③ 全 N/A |
| H | fixture-reject-wrong-number（REJECT 引问题1、表仅问题2 有效行） | ④ FAIL 双问题：问题1 无对应行+问题2 行未被引用；⑤ 不计问题2 |

原始输出：acceptance/s2-runtime-evidence-v2/run-{a..h}*.stdout/.json；fixtures 全部可复跑：`python basic/tool/check_taskpack.py basic/tasks/b-20261114-taskpack-checker/acceptance/s2-fixtures/fixture-<name>`。

## 自测中抓出并修正的记录（如实）

首验版三处（9 字段口径/④空满足/问题3 SHA 补全）见首验请求归档与 steps.md；本轮自测新增修正：rework4 fixture 补 evidence/probe.txt 使 ③ 可 PASS（工具行为正确，fixture 缺证据文件所致）；⑤ 编号引用提取源从"仅⑥行"扩为"整步骤小节 body"（REJECT 编号提取仍限含 REJECT 要素值+⑥），否则引用写在⑤行时漏提取——如实记录，请裁决该口径。

## 验收方自查提示（验收六查，不得只读本请求）

自行获取并核查：steps.md 冻结口径与 S2 清单、`git diff 955ffaa e664e76`、证据 v2 八组原始输出、六 fixture 复跑。六查：①符合步骤目标 ②符合拍板方案 ③未超范围 ④无明显代码质量问题 ⑤测试真实执行 ⑥证据可核查。

## 结论

PASS（本步通过，允许进入 S3）/ REJECT（退回修复，给具体修改要求）/ BLOCKED（环境原因无法验收，如实说明）。返工计数按"同一问题"规则（basic/WORKFLOW.md 模块五）：问题5/6/7 各为第 1 次返工待复验。
