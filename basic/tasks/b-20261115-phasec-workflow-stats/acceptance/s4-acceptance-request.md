# 验收请求：b-20261115-phasec-workflow-stats 第 4 步（S4 整体校验交付）

**版本：v4（复验请求）。** 历史：v1→R1 独立验收 REJECT 3 项（问题9/10/11）；v2→R2 复验 REJECT 2 项（问题12/13；R1 三问题全 PASS+问题11 误判纠正）；v3→R3 复验 REJECT 保留 2 项（问题12 文字修订确认部分通过[⑧组交叉比较与快照标注缺]、问题13 代码修复 PASS[失败路径执行证据不足]）——本版为第 3 次整改后 R4 复验请求。验收标准=S4 出口条件（steps.md 冻结原文）：交付完整，等待用户拍板生效。

## 绑定（v4 复验）

- 分支：main（https://github.com/damwate/AIEO.git）
- **复验基点 commit：`39f8eb69915793c3ce55a06ac602ef9cd163faf2`**（R3 待验收对象，R3 已核验两段单 commit 线性）
- **待验收 commit：本回填 commit（HEAD）。** Git 自引用结构性限制如实声明：本 commit SHA 由本节申报并经 `git rev-parse HEAD` 对照核验，实跑结果随派单简报给出。
- **待验收 diff：39f8eb6→本 commit 双 commit 线性链（按 ST-01 逐条核链）：**
  1. `b15b59ebe5612401b62a9b1d7639162d3864654f`（R3 两问题整改主体：⑧组三文件交叉比较、delivery 历史快照标注+当前实态、失败路径正式测试存档；唯一 parent=39f8eb6）
  2. 本回填 commit（返工表问题12/13 修复列 R3 整改 SHA 回填+本请求 v4+R3 轮证据归档+输出档案最终态重生成；唯一 parent=b15b59e）
  - 申报前核验已跑：`git rev-list --reverse --parents 39f8eb6..HEAD` 两条线性全过四通过条件+`git rev-list --count 39f8eb6..HEAD`=2；实跑输出随派单简报逐条列出。
- **R3 轮绑定完整链：** cc030ff→ccc9c55（R1 整改）→d8d201a（R1 回填）→8aa60e8（R2 整改）→39f8eb6（R2 回填）→b15b59e（R3 整改）→本 commit（R3 回填）——七条线性，`git rev-list --reverse --parents cc030ff..HEAD` 逐条核。
- **绑定声明：** 后续闭环 commit 不属验收 diff（ST-01 条款④）。S1-S3 沿用既有独立结论；R3 已确认"不要求重做 S1—S3，也不要求重新统计或重写 WORKFLOW"。
- 验收通过≠v0.3 生效——生效拍板留用户（代授权范围外）。

## R3 两问题整改对照

1. **问题12（⑧组交叉比较+历史快照标注）：** ⑧组由"各自断言"升级为**三文件交叉比较**（一致性脚本重跑 30/30 PASS，组数 24→30 如实在脚本头注登记修正记录）——交叉1 当前复验轮次指向三方同为 R4（⑧a2 task-brief/⑧b steps ⑥"S4 R4 复验结论待回填"/⑧c delivery"待 R4 复验"）；交叉2 已发生轮结论三文件逐项一致（⑧d R1 REJECT 3 项/⑧e R2 REJECT 2 项 同时在 task-brief 当前步骤、steps S4 区段、delivery 三处命中）；交叉3 S1-S3 闭环三方一致（⑧f）；交叉4 delivery 当前实态数据（⑧j "24/24"+"问题 1-13"）/⑧k 历史快照显式标注。delivery.md 旧自测数据段已标"[R1 时点历史快照，非当前实态；当前实态=R2 整改后 24/24+返工表问题 1-13（1-11 已取得通过结论、12/13 待 R4 复验）]"。
2. **问题13（失败路径执行证据）：** 新增正式测试存档 phase0/tools/s4-appendix-threeway-failpath-test.py+输出 .txt——脚本生成无效域名副本实际运行并捕获完整输出与退出码：条件① raw 失败判定"FAIL" PASS、条件② 退出码=1 PASS，完整命令+副本输出+退出码在档可复跑（`python -I phase0/tools/s4-appendix-threeway-failpath-test.py`，预期 exit=0；副本运行后自动清理）。实现细节如实登记：子进程以 `-X utf8` 运行保 UTF-8 输出（`-I` 子进程忽略 PYTHONIOENCODING 环境变量——首版因此误判，已修正并以输出档案为准）。

## 复验重点

1. **问题12 交叉比较实效：** `python -I phase0/tools/s4-consistency-check.py`（预期 30/30 PASS）——⑧a2/⑧b/⑧c 三文件轮次指向 R4 一致；⑧d/⑧e R1/R2 轮结论三文件逐项一致；⑧j/⑧k delivery 实态数据与快照标注。
2. **问题13 失败路径证据：** `python -I phase0/tools/s4-appendix-threeway-failpath-test.py`（预期两条件 PASS+exit=0）；正常路径 `python -I phase0/tools/s4-appendix-threeway-check.py`（预期三条件 PASS+exit=0）。
3. **检查器：** `python -I basic/tool/check_taskpack.py basic/tasks/b-20261115-phasec-workflow-stats`（预期 ④ PASS/Overall=IN_PROGRESS=S4 待复验预期态）。
4. **环境如实声明：** 本机 Windows 10（Git Bash），无独立 Linux 环境；三命令在本机执行（GitHub raw 直读成功=联网可达），输出存档随待验收 commit 在库，验收方环境恢复后可复跑核对。

## 结论

验收结论：PASS（S4 闭环，任务四步全完成，交用户拍板 v0.3 生效）/ REJECT（列具体问题，按"同一问题"规则计数）/ BLOCKED（环境原因如实说明）。通过≠v0.3 生效。
