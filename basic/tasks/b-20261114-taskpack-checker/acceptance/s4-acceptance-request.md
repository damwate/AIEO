# 验收请求：b-20261114-taskpack-checker 第 4 步（S4 文档与交付，验收重点：可独立运行）

> **绑定注记：** S1/S2/S3 已全部闭环（S1 复验R4 PASS；S2 复验R3c PASS 附件动态验收；S3 复验R3 PASS，dispatch-2026-11-14T18-13-02，reply sha256=1c323ace506a36e0698b5e9747d6cb38d831c928debac70e28f28ac500833658）。本步为第四步（最后一步）：使用说明+delivery.md 七要素。

## 代码绑定（申报前已核验 parent 与 rev-list 区间数——问题5/问题10 教训固化）

- 分支：main（https://github.com/damwate/AIEO.git）
- **本步无代码改动；代码验收基线仍为 S3 已闭环的 `b1bd307ffe574b785814e47527f0f91423a54190`。**
- **本次待验收 commit：本轮 S4 文档交付 commit（完整 SHA 随派单简报给出，parent 应为 `75bd102`，GitHub Compare 应为 ahead_by=1、单 commit）。**
- **预期文件范围（共 5 个文件，全部属本任务）：**
  1. `basic/tool/README.md`（新增——使用说明）
  2. `basic/tasks/b-20261114-taskpack-checker/delivery.md`（新增——七要素完工总结）
  3. `basic/tasks/b-20261114-taskpack-checker/steps.md`（S4 勾选+六要素回填；另含 S2③ 占位符撞词措辞修正+S2⑥/S3⑥「验收结论：PASS」措辞统一——**记录写法修正，不改动任何验收事实（dispatch 目录/reply SHA/结论）**，见 steps.md S4 ④ 如实注记）
  4. `basic/tasks/b-20261114-taskpack-checker/task-brief.md`（当前步骤更新 S4+闭环留痕）
  5. `basic/tasks/b-20261114-taskpack-checker/acceptance/s4-acceptance-request.md`（本文件）
- 申报口径延续：待验收 commit 自身 diff=parent→commit；申报前已执行 `git rev-list --count <parent>..<commit>` 与 parent 核验。

## 验收内容（steps.md S4 拍板冻结口径）

- 本步骤目标：使用说明（toolkit 或 basic/tool 内 README 约定落位）+完工总结 delivery.md 七要素；验收重点：**可独立运行**。
- **① 使用说明落位 basic/tool/README.md**（本工具为 Basic 工作流专属，通用工具在 toolkit/ 有各自 README，落位约定见 steps.md S4 冻结条款"toolkit 或 basic/tool 内"）——内容：用法（文本/JSON 两模式，`python -I` 隔离运行）、六项检查要点表、阶段映射、退出码、证据路径三规则、测试运行命令、fixtures 与证据索引、约定。
- **② delivery.md 七要素齐全**（原始需求/最终实现内容/修改文件/测试结果/Git commit/未解决问题/后续建议）：原始需求一字不改引自 requirement.md；最终实现内容与工具实际一致；修改文件全列；测试结果含 33 用例与四步验收闭环（Windows skipped=1 历史如实保留，复验R2 验收方 Linux 独立执行 33/33 全过如实引用）；Git commit 列 S1-S3 全链；未解决问题如实（无阻塞项+符号链接 skipTest 环境备注）；后续建议三条。
- **可独立运行核验材料**（执行者已实跑，可复跑）：
  - `python -I basic/tool/check_taskpack.py basic/tasks/b-20261114-taskpack-checker` → ①②④⑤ PASS、③「3 步记录完整 PASS；未到期步骤（1 个）: S4」、⑥ N/A、Overall IN_PROGRESS exit=1（S4 完成前正确形态）
  - `python -I basic/tool/check_taskpack.py <任意目录> --json` → JSON 与文本共用同一结果对象（phase/overall/items 结构）
  - `python -I -m unittest discover -s basic/tool -p "test_check_taskpack.py"` → Ran 33 tests OK (skipped=1)（S4 无代码改动，不重跑亦可引用 S3 复验R2/R3 已核实结果）
  - README 引用的命令与实际参数逐一核对一致（`python -I`、`--json`、`-I -m unittest discover` 均为真实可跑形态）
- 实现约束：仅标准库；文档改动不触碰代码（git show 本 commit 应仅含上述 5 文件，无 .py 改动）。

## 自测证据（执行者实跑留档）

| 项 | 内容 |
|---|---|
| README 命令核对 | 文本/JSON/退出码/unittest 四类命令全部实跑核对一致 |
| 自身包检查预演 | 暴露并修正 S2 记录两处措辞问题（占位符黑名单撞词"暂空"→"留空"；"当前/最终结论"→「验收结论：PASS」统一）——工具行为符合冻结口径（黑名单子串命中即无效，S2 拍板冻结实现），属记录写法问题，修正后自身包全绿；修正过程在 steps.md S4 ④ 如实注记 |
| delivery.md 核对 | 七要素与本任务 requirement.md 原文、steps.md 返工记录、Git commit 链逐项核对一致 |
| 对应 commit SHA | 本步待验收 commit 见派单简报；代码基线 b1bd307 |

## 验收方自查提示（验收六查，不得只读本请求）

自行获取并核查：steps.md S4 冻结口径与六要素、`git show <待验收 commit>`（应仅 5 文件无代码改动）、README 命令实际运行（若环境可跑 Python；或引用复验R2 附件动态执行已证可运行）、delivery.md 七要素与 requirement.md/steps.md 交叉核对。六查：①符合步骤目标 ②符合拍板方案 ③未超范围 ④无明显质量问题 ⑤测试真实执行（引用 S3 已核实动态执行+S4 自检可复跑）⑥证据可核查。

## 结论

PASS（本步通过，任务交付完成）/ REJECT（退回修复，给具体修改要求）/ BLOCKED（环境原因无法验收，如实说明）。返工计数按"同一问题"规则（basic/WORKFLOW.md 模块五）。
