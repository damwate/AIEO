# 验收请求：b-20261114-taskpack-checker 第 1 步（S1 骨架）

> **版本注记（返工问题3，2026-11-14）：** 本文档首版绑定待验收 commit `49c82b5`（首验 REJECT 两项 P1）。返工修复后最终待验收对象更新为 `40c66d9`，本版为更新后的绑定（复验 R2 dispatch-2026-11-14T15-24-07 REJECT 指出绑定不一致后修正）。

## 代码绑定

- 分支：main（https://github.com/damwate/AIEO.git）
- 开发前基线 commit：`9de95cc1`（方案冻结；其父链见 git log，需求拍板 b1cc528）
- **本次待验收 commit：`40c66d9b17696f548603bb847e45190204a09674`**（= 首验 `49c82b5` + 返工修复 1 commit，最终代码状态）
- 测试所绑定的 commit：`40c66d9b17696f548603bb847e45190204a09674`（与待验收一致；动态证据 ENVIRONMENT.txt 声明同一 commit）
- 验收 diff 范围：`9de95cc1` → `40c66d9`（两个 commit：`49c82b5` 新增 basic/tool/check_taskpack.py 274 行；`40c66d9` 返工修复同一文件 37+/34-，无其他文件改动）

## 验收历史（证据链，防混合认定）

1. 首验（dispatch-2026-11-14T15-08-02，会话 6af87983）：对象 `49c82b5`，结论 **REJECT 两项 P1**（问题1 文本遗漏 phase_problems；问题2 文本/JSON 未共用完整结果对象）。
2. 返工（`40c66d9`）：最小修复两项 P1，未动 S2 范围。
3. 复验 R1（dispatch-2026-11-14T15-13-16，会话 6af87ac5）：对象 `40c66d9` 静态审查 **两项 P1 修复 PASS + 六项标准②-⑥ PASS**，BLOCKED=缺动态执行原始证据。（其后因采集器跳位缺陷双方无法恢复该轮完整结论原文，按 DEC-043 先例换新会话，静态结论以上轮报告为准）
4. 复验 R2（dispatch-2026-11-14T15-24-07）：动态证据 8 组落盘核验通过，**REJECT=代码绑定不一致**（本文档当时仍绑定 `49c82b5`）→ 本版更新绑定，问题3 登记于 steps.md。
5. 动态证据：commit `a3f5d92`（acceptance/s1-runtime-evidence/，四场景×双模式 8 组原始 stdout/stderr/exit + ENVIRONMENT.txt，被测 `40c66d9`）。

## 验收内容

- 本步骤目标（steps.md 拍板冻结原文照录）：S1 骨架：CLI+状态模型+六项检查函数桩（验收重点：结构正确）
- **本步骤验收标准（可验证通过条件）：**
  1. CLI 可运行：`python basic/tool/check_taskpack.py <task_dir> [--json]`；文本输出含 Taskpack/Phase/六项 `[状态] ①-⑥ 名称`/Overall；退出码 PASS=0、FAIL=1、IN_PROGRESS=1；
  2. 阶段读取五分支：缺 task-brief.md/非法状态值/占位符状态→UNKNOWN+problems（不猜阶段）；"待规划"→PLANNING；"阻塞"→IN_PROGRESS（其余映射见 steps.md 冻结口径 1）；
  3. `--json` 与文本共用同一检查结果对象（items 七字段：no/name/status/problems/files/steps/evidence）；
  4. 任务目录不存在→FAIL+退出码 1+可识别问题文本；
  5. 仅 Python 标准库，无第三方依赖；
  6. 六项检查函数为独立 N/A 桩（S1 范围内，S2 逐项替换实现——此为拍板分步设计，非缺陷）。
- 交付物：basic/tool/check_taskpack.py

## 自测证据

| 项 | 内容 |
|---|---|
| 实际执行命令 | `python -I basic/tool/check_taskpack.py <target> [--json]`（动态证据落盘：acceptance/s1-runtime-evidence/，四场景×双模式 8 组） |
| 执行结果 | 8 组退出码全=1（FAIL/IN_PROGRESS→1 符合约定）；A/B/B2 场景 Phase=UNKNOWN+可识别原因；C 场景（本任务包）Phase=IN_PROGRESS、六项 N/A、Overall=IN_PROGRESS |
| 原始测试日志路径 | acceptance/s1-runtime-evidence/run-*.stdout / run-*.stderr / run-*.exit + ENVIRONMENT.txt（commit `a3f5d92`） |
| 未测项及原因 | unittest 正负例+11 类异常场景全套在 S3（拍板分步） |
| 对应 commit SHA | 被测代码 `40c66d9b17696f548603bb847e45190204a09674`（证据提交 `a3f5d923e6bd08a388f529675485fd1c6b4b04c7`） |

## 验收方自查提示（验收六查，不得只读本请求）

自行获取并核查：用户拍板方案（steps.md 冻结版）、本步骤验收标准、开发前基线 commit、实际代码 diff（`9de95cc1`→`49c82b5`）、测试执行结果及证据。六查：①符合步骤目标 ②符合拍板方案 ③未超范围 ④无明显代码质量问题 ⑤测试真实执行 ⑥证据可核查。

## 结论

PASS（本步通过，允许进入 S2）/ REJECT（退回修复，给具体修改要求）/ BLOCKED（环境原因无法验收，如实说明）。返工计数按"同一问题"规则（basic/WORKFLOW.md 模块五）。
