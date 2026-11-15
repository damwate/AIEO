# 验收请求：b-20261115-phasec-workflow-stats 第 4 步（S4 整体校验交付）

**版本：v6（S4-DV1 降档方案验证请求）。** 历史：v1→R1 REJECT 3 项（问题9/10/11）；v2→R2 REJECT 2 项（问题12/13）；v3→R3 REJECT 保留 2 项；v4→R4 REJECT 1 项[问题12 第 3 次]→ST-10 止损→用户解除→会商 1/2 授权 R5；v5→R5 复验 REJECT[问题12 第 4 次=⑧j 覆盖缺口]→停止原方案循环进入会商2 降档阶梯→**降档会商3（会商2 第一级）裁定授权 S4-DV1：⑧j 历史核验数字全覆盖验证**（采纳 R5 建议方向并修订实现方式=全文扫描+显式历史快照区段归属；DV1 属降档方案验证，不是 R6，不入问题12 返工计数，问题12 仍登记 R5 第 4 次 REJECT 不覆盖）——本版为 DV1 验证请求。验收标准=会商3 裁定的 DV1 通过条件：三种旧数字均逐次检查，负向全部拦截，正向全部通过。

## 绑定（v6 验证）

- 分支：main（https://github.com/damwate/AIEO.git）
- **验证基点 commit：`ac085202e4eedefb061f6278473efe16e4ff4ca7`**（R5 裁定登记+止损降档阶梯启动+缺口本地复现取证 commit，已推；非 DV1 整改 commit）
- **待验收 commit：本回填 commit（HEAD）。** Git 自引用结构性限制如实声明：本 commit SHA 由本节申报并经 `git rev-parse HEAD` 对照核验，实跑输出随派单简报给出。
- **待验收 diff：ac08520→本 commit 双 commit 线性链（按 ST-01 逐条核链）：**
  1. `e309474dc85a8040506bd71347b03aa299384e1d`（DV1 整改主体：⑧j 重写为全文扫描+显式历史快照区段归属+DV1 测试矩阵 s4-dv1-tests.py+negpos P2 适配+三文件 DV1 实态登记；唯一 parent=ac08520）
  2. 本回填 commit（会商3 派单/补采证据归档+本请求 v6；唯一 parent=e309474）
  - 申报前核验已跑：`git rev-list --reverse --parents ac08520..HEAD` 双 commit 线性全过四通过条件+`git rev-list --count ac08520..HEAD`=2。
- **S4 完整轮次链（供逐条核验）：** cc030ff→ccc9c55→d8d201a→8aa60e8→39f8eb6→b15b59e→8250de0→4ca3dc5→fe7210e→3acb72e→ac08520→e309474→本 commit——十三条线性，`git rev-list --reverse --parents cc030ff..HEAD` 逐条核；其中裁定登记/回填类 commit（8250de0/4ca3dc5/3acb72e/ac08520）不属验收 diff 的既往先例继续适用。
- **绑定声明：** DV1 范围=⑧j 历史核验数字覆盖缺口唯一（会商3 授权范围），禁扩大；问题12 返工记录保留 R5 第 4 次 REJECT 不覆盖；DV1 不计入问题12 返工次数；禁拆分问题/改编号/换表述规避止损（会商3 明令）。通过≠v0.3 生效——生效拍板留用户。

## DV1 依据（会商3 裁定，reply sha256=1c12d401301e02a7feadef40121af87b138b6eb3fd349fbdb42e432f8fb44009，recoll-2026-11-15T00-53-46-250Z 归档）

1. **方法（修订后正式授权实现）：** 21/21、24/24、30/30 全文全量扫描（不只单一数字/固定句子）；每个出现位置必须归属明确历史快照区段（弃"前 40 字符含历史/快照/演进"简单判断）；区段内逐项核对数字与对应轮次/历史含义；区段外出现旧数字原则上直接 FAIL；当前数字 36/36 按当前实态单独核验；不允许通过在无关文字附近增加"历史"二字规避检查；⑧c3 继续负责主状态句过期状态检查、⑧j 负责 delivery 全文历史数字归属——职责分开。
2. **测试条件：** 负向=正文新增裸露 21/21、24/24、30/30 各自必须 FAIL；整体测试=三个旧数字分别放在不同正文位置，每个出现位置都能被识别（不是只拦截第一个）；正向=三种旧数字均在正确历史快照区域内 PASS+当前 36/36 与历史演进记录同时存在且语义正确 PASS。
3. **证据要求：** 修改前后代码、完整执行命令、逐项输出、退出码、Git 绑定。验收方式=ChatGPT 独立审查，不接受执行者自宣 PASS。结果记录=DV1 PASS（问题12 进入关闭确认）/DV1 REJECT（不增加问题12 返工次数+不启动 R6+进入会商2 第二级评估）/DV1 BLOCKED（如实记录，不得冒充）。

## DV1 实施对照（ac08520→e309474）

1. **⑧j 重写（s4-consistency-check.py）：** `snap_spans` 正则收集全部 `<!--hist-snap-start-->…<!--hist-snap-end-->` 区段；对三种旧数字 `re.finditer` 全文逐位置扫描——区段外→viol 记 `(区段外裸露)`；区段内→所在行须含对应轮次标注（21/21↔R1；24/24↔R2；30/30↔R3 或 R4），缺→viol 记 `(区段内缺轮次标注)`；viol 全量收集不短路，⑧j fail 详情逐位置报告；`当前=36/36` 单独核验+演进链句完整性检查保留；修改前后代码均在库（修改前版本见 ac08520 的 s4-consistency-check.py）。
2. **delivery 三处历史语境显式区段化：** 演进链句（R1 时点 21/21→R2 时点 24/24→R3/R4 时点 30/30）+`[历史快照值=R1 时点 21/21]` 括注+`（历史快照口径=R1 时点 21/21 PASS）`括注——三对区段标记+后两处补 R1 时点轮次标注；正文中不再存在任何区段外旧数字。
3. **DV1 测试矩阵（s4-dv1-tests.py，6/6 PASS）：** N1 正文新增裸露 21/21→⑧j 拦截/N2 裸露 24/24→⑧j 拦截/N3 裸露 30/30→⑧j 拦截；整体 NT=三旧数字分别注入 S1 段尾/S2 段尾/文末三个不同正文位置→viol 三处逐位置全报（`21/21@3050`、`24/24@3181`、`30/30@6030` 全部识别，实证非只拦截第一个）；P1 基线（当前 36/36 与历史演进链共存）36/36 全过；P2 三旧数字均在显式区段内合法追加仍 36/36 全过。
4. **缺口关闭实证：** 修复前探针 s4-gap-probe-8j.py `GAP_REPRODUCED=True`（裸露 30/30 放行）存档于 ac08520；修复后重跑 `GAP_REPRODUCED=False`（裸露 30/30 被拦截）存档 s4-gap-probe-8j-output-postdv1.txt——同一探针脚本前后对照，探针只动内存副本不动仓库文件。
5. **既有测试适配：** negpos P2 追加句改为带显式区段标记+轮次标注（新规则下区段外追加合法句会 FAIL，如实适配），N1-N5/P1 未动继续 7/7 PASS；一致性核验 36 项总数不变（⑧j 保持单项复合断言，项数演进链"当前=36/36"仍准确）。

## 复验重点

1. **⑧j 新实现实效：** `python -X utf8 -I phase0/tools/s4-consistency-check.py`（预期 36/36 PASS）——⑧j(DV1) 断言=当前=36/36+区段收集≥1+演进链完整+viol 为空。
2. **DV1 测试矩阵：** `python -X utf8 -I phase0/tools/s4-dv1-tests.py`（预期 6/6 PASS：N1-N3 指名拦截+NT 三位置逐位置报告+P1/P2 正向全过）。
3. **既有测试不回归：** `python -X utf8 -I phase0/tools/s4-check-negpos-tests.py`（预期 7/7 PASS）。
4. **检查器：** `python -X utf8 -I basic/tool/check_taskpack.py basic/tasks/b-20261115-phasec-workflow-stats`（预期 ④ PASS/Overall=IN_PROGRESS=DV1 复验前预期态）。
5. **环境如实声明：** 本机 Windows 10（Git Bash），无独立 Linux 环境；命令在本机执行（GitHub raw 直读成功=联网可达），全部输出存档随待验收 commit 在库（s4-consistency-check-output.txt/s4-dv1-tests-output.txt/s4-check-negpos-tests-output.txt/s4-gap-probe-8j-output-postdv1.txt/s4-checker-output.txt）。
6. **修改前后代码对照：** 修改前 ⑧j（40 字符窗口版）见 `git show ac08520:phase0/tools/s4-consistency-check.py`；修改后见 `git show e309474:phase0/tools/s4-consistency-check.py`。

## 结论

验收结论：DV1 PASS（降档方案有效，问题12 进入关闭确认，S4 进入最终交付确认，交用户拍板 v0.3 生效）/ DV1 REJECT（列具体问题；不增加问题12 返工次数+不启动原方案 R6+进入会商2 第二级评估）/ DV1 BLOCKED（环境原因如实说明，不计 REJECT 不得冒充 PASS）。通过≠v0.3 生效。
