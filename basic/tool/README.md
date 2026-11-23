# basic/tool/ —— Basic 工作流工具（任务包完整性检查）

## check_taskpack.py —— 任务包完整性检查器（b-20261114-taskpack-checker 交付物）

对一个 Basic 任务目录（`basic/tasks/<任务ID>/`）做两层校验（结构+有限规则，不做 AI 语义判断），输出六项独立检查结论与整体状态。

### 用法

```bash
# 文本输出（人类可读）
python -I basic/tool/check_taskpack.py basic/tasks/<任务ID>

# JSON 输出（机器可读；与文本共用同一结果对象）
python -I basic/tool/check_taskpack.py basic/tasks/<任务ID> --json
```

仅 Python 标准库（argparse/dataclasses/json/re/pathlib/collections），无第三方依赖，Python ≥3.9。

### 开工核对

Basic 和 Standard 新任务共用任务书的 `## 开工核对`。写入反查过的技能路径和相关经验，并将每条经验转成具体动作。例如，L-018 的动作可写「注入发送确认后采集中断，断言同一轮补采且发送次数仍为 1」。检索无直接命中时，可以改用 `- 未命中关键词：...` 和 `- 本次防错动作：...`。

```bash
# 开工前，仅检查开工核对，不等待步骤与交付材料
python -I basic/tool/check_taskpack.py basic/tasks/<任务ID> --startup

# 新任务验收前，检查开工核对和原有六项
python -I basic/tool/check_taskpack.py basic/tasks/<任务ID> --require-startup
```

检查版本与技能路径是否一致、经验编号是否存在，以及是否填了可供审查的动作。已有开工小节也纳入默认检查，旧任务包沿用原有六项。检查器核对记录，实际阅读和动作是否执行由交接、测试或审查证据核实。

### 检查六项（单项 PASS/FAIL/N/A；整体 PASS/FAIL/IN_PROGRESS）

| 项 | 检查内容（要点） |
|---|---|
| ① 需求记录 | requirement.md 非空非占位符；task-brief.md 9 必备字段齐全且不重复（重复字段 FAIL，覆盖表格行/行内键/标题三种书写形式）；阶段读取失败=FAIL 不猜（冻结口径 1） |
| ② 步骤清单 | steps.md 存在且含 `## S<编号> <名称>` 小节；**步骤编号唯一**（重复编号 FAIL，不静默接受） |
| ③ 步骤验收记录 | 每步骤小节六要素齐全+「验收结论：PASS」+证据引用（dispatch 目录+reply SHA256 64 位 hex+包内证据路径）；先判到期再评记录：PLANNING 全 N/A、IN_PROGRESS 编号<当前才到期、COMPLETED 全到期、当前步骤解析不出=FAIL 不猜 |
| ④ REJECT 返工记录 | 编号级三方关联：REJECT 所在要素值∪⑥提取编号须非空，且返工表有对应有效行（编号+40 位修复 SHA），返工行须被步骤小节引用 |
| ⑤ 返工次数 | 只计已关联有效行；同一问题第 3 次允许（冻结口径 3），第 4 次及以后 FAIL |
| ⑥ 交付记录 | COMPLETED 时检查 delivery.md 七要素（原始需求/最终实现内容/修改文件/测试结果/Git commit/未解决问题/后续建议）；未到期 N/A |

### 阶段映射（task-brief.md「当前状态」）

待规划→PLANNING；开发中/验收中/返工/阻塞→IN_PROGRESS；完成→COMPLETED；缺失/非法/占位符→UNKNOWN（不猜阶段）。

### 退出码

- `0` —— 整体 PASS
- `1` —— FAIL 或 IN_PROGRESS（存在 N/A 未到期项）

### 证据路径安全（⑥ 引用路径校验三规则）

仅接受任务目录内相对路径；拒绝绝对路径与 `..` 穿越；`resolve+is_relative_to` 防符号链接绕过（越界报"疑似符号链接绕过"）。

### 测试

```bash
python -I -m unittest discover -s basic/tool -p "test_check_taskpack.py" -v
```

37 用例（含开工核对，黑盒 subprocess 走 CLI 真实退出码+validate_pack_path 单元直调），自包含：临时目录动态构造任务包，不依赖仓库 fixtures。符号链接用例在无 symlink 权限环境（Windows 非开发者模式）skipTest 如实跳过。S3 验收历史：首验 REJECT→941ee88→复验R1 REJECT→b1bd307→复验R2（六查实质全 PASS+验收方 Linux 沙箱附件独立执行 33/33 OK）→78c6cc8 文档修正→复验R3 PASS。

### 验证用 fixtures

`basic/tasks/b-20261114-taskpack-checker/acceptance/s2-fixtures/`（七个场景任务包，可复跑核对）；运行证据 `acceptance/s2-runtime-evidence-v3/`（九组）。

## 约定

- 本目录工具为 Basic 工作流专属；通用跨版本工具在 `toolkit/`（README 见该目录）。
- 工具改动须带测试+独立复核（Basic 四步流程：骨架→规则→测试→文档交付）。
