# 验收请求：b-20261114-taskpack-checker 第 1 步（S1 骨架）

## 代码绑定

- 分支：main（https://github.com/damwate/AIEO.git）
- 开发前基线 commit：`9de95cc1`（方案冻结；其父链见 git log，需求拍板 b1cc528）
- **本次待验收 commit：`49c82b5fe61cd29a430c8f6ef952d42ac8213b46`**
- 测试所绑定的 commit：与待验收一致
- 验收 diff 范围：`9de95cc1` → `49c82b5`（新增 basic/tool/check_taskpack.py 274 行，无其他修改）

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
| 实际执行命令 | `python -I basic/tool/check_taskpack.py basic/tasks/b-20261114-taskpack-checker`（及 `--json`、不存在目录、临时目录五分支） |
| 执行结果 | 本任务包实测 Phase=IN_PROGRESS（"开发中"映射）六项 N/A Overall=IN_PROGRESS exit=1；JSON 结构同源；目录不存在=FAIL exit=1；五分支 UNKNOWN+problems/PLANNING/IN_PROGRESS 全过 |
| 原始测试日志路径 | 会话记录（本轮验收对话）；五分支用 tempfile 构造即抛即弃未落盘 |
| 未测项及原因 | unittest 正负例+11 类异常场景全套在 S3（拍板分步） |
| 对应 commit SHA | `49c82b5fe61cd29a430c8f6ef952d42ac8213b46` |

## 验收方自查提示（验收六查，不得只读本请求）

自行获取并核查：用户拍板方案（steps.md 冻结版）、本步骤验收标准、开发前基线 commit、实际代码 diff（`9de95cc1`→`49c82b5`）、测试执行结果及证据。六查：①符合步骤目标 ②符合拍板方案 ③未超范围 ④无明显代码质量问题 ⑤测试真实执行 ⑥证据可核查。

## 结论

PASS（本步通过，允许进入 S2）/ REJECT（退回修复，给具体修改要求）/ BLOCKED（环境原因无法验收，如实说明）。返工计数按"同一问题"规则（basic/WORKFLOW.md 模块五）。
