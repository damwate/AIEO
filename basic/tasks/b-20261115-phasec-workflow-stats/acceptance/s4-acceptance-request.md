# 验收请求：b-20261115-phasec-workflow-stats 第 4 步（S4 整体校验交付）

**版本：v7（S4-DV1-EV1 快照绑定补验复验请求）。** 历史：v1→R1 REJECT 3 项（问题9/10/11）；v2→R2 REJECT 2 项（问题12/13）；v3→R3 REJECT 保留 2 项；v4→R4 REJECT 1 项[问题12 第 3 次]→ST-10 止损→用户解除→会商 1/2 授权 R5；v5→R5 复验 REJECT[问题12 第 4 次=⑧j 覆盖缺口]→停止原方案循环进入会商2 降档阶梯→v6→DV1 验证→**S4-DV1 REJECT**（⑧j 实现与测试矩阵经验收方独立审查全部通过，唯一阻断=证据绑定未闭合）→按会商3 约定进入会商2 第二级评估→**会商4（第二级）裁定：根因=证据归档/申报未同步+证据生成机制缺自动化版本溯源绑定，非⑧j 算法设计缺陷；整体功能不判 BLOCKED；批准一次性证据绑定补验并授权 S4-DV1-EV1**——本版为 EV1 复验请求。

## 绑定（v7 复验）

- 分支：main（https://github.com/damwate/AIEO.git）
- **绑定基点 commit：`62e56f8`**（DV1 REJECT 裁定登记 commit，已推；非 EV1 整改 commit）
- **待验收 commit：`630357f29b1624b8f8631852440140fca319df25`（会商4 裁定登记+EV1 实施/证据归档 commit，已推）+本回填 commit（本请求 v7，HEAD）。** Git 自引用结构性限制如实声明：回填 commit SHA 由本节申报并经 `git rev-parse HEAD` 对照核验，实跑输出随派单简报给出。
- **待验收 diff：62e56f8→本回填 双 commit 线性链（按 ST-01 逐条核链）：**
  1. `630357f29b1624b8f8631852440140fca319df25`（会商4 派单/补采证据归档+s4-ev1-run.py+EV1 证据归档+三文件 EV1 PASS 实态登记+检查器演进；唯一 parent=62e56f8）
  2. 本回填 commit（本请求 v7；唯一 parent=630357f）
  - 申报前核验已跑：`git rev-list --reverse --parents 62e56f8..HEAD` 双 commit 线性全过四通过条件+`git rev-list --count 62e56f8..HEAD`=2。
  - 按裁定 EV1 证据绑定被测快照 e309474，**登记 commit 不属验收 diff 对象（承 8250de0/4ca3dc5/3acb72e/ac08520/62e56f8 裁定登记 commit 先例）**，复验对象=EV1 证据与其绑定声明。
- **S4 完整轮次链（供逐条核验）：** cc030ff→ccc9c55→d8d201a→8aa60e8→39f8eb6→b15b59e→8250de0→4ca3dc5→fe7210e→3acb72e→ac08520→e309474→eb59096→62e56f8→630357f→本回填——十六条线性，`git rev-list --reverse --parents cc030ff..HEAD` 逐条核。
- **绑定声明：** EV1 范围=会商4 授权的测试证据快照绑定补验唯一，禁扩大；问题12 返工记录保留 R5 第 4 次 REJECT 不覆盖；EV1 不计入问题12 返工次数（非 R6）；DV1 REJECT 结论不变不改写；禁拆分问题/改编号/换表述规避止损（会商3/4 明令）。通过≠v0.3 生效——生效拍板留用户。

## EV1 依据（会商4 第二级裁定，reply sha256=2c32b00705d2340803d6a8b507122dc464da9e3bf256e2475394e72ebbb0fbce，recoll-2026-11-15T01-21-48-400Z 归档，已随本 commit 入库）

1. **根因裁定：** 直接=证据归档/版本绑定问题（delivery 编辑后字符偏移变化，申报仍引首跑位置）；深层=测试证据生成机制缺自动化版本溯源绑定；非⑧j 扫描算法设计缺陷；整体功能不判 BLOCKED；原方案有局部机制设计缺陷（DV1 证据链缺可机器核验的输入版本身份）非整体功能方案缺陷。
2. **授权：** 一次性 S4-DV1-EV1 测试证据快照绑定补验（第二级调整验证；非 R6，不增加问题12 返工次数，不改变 DV1 原有 REJECT 结论）。六环节=被测快照固定 e309474/从该 commit 干净检出记录 git rev-parse HEAD 与 git status --porcelain/输入身份=输出记录 delivery.md+检查器+测试脚本 SHA256/执行记录=输出记录 Python 版本+完整命令+逐项结果及退出码/归档=测试输出独立证据文件+MANIFEST 记录证据文件 SHA256/版本变动=被测 delivery 任何修改必须重跑不得沿用旧输出。
3. **验收请求条款（本请求遵循）：** 只引用最终归档文件路径、SHA256 及被测源 commit，不再手工复制 NT 位置作为主要证据。
4. **第三级触发线：** EV1 无法建立可信证据绑定或验证机制仍不能稳定工作时启动；当前不得判定需求不可行。

## EV1 实施对照（裁定六环节→落实）

| 裁定环节 | 落实 |
|---|---|
| 被测快照固定 e309474 | 驱动 `phase0/tools/s4-ev1-run.py` 内 `SNAP=e309474dc85a8040506bd71347b03aa299384e1d`（DV1 整改主体 commit） |
| 从该 commit 干净检出+记录 HEAD/porcelain | `git worktree add --detach <临时目录> e309474`；输出记录 HEAD 与快照相符+`git status --porcelain` 为空（干净检出）；worktree 用毕 remove 无残留 |
| 输入身份=输出记录输入文件 SHA256 | 输出记录 5 文件 SHA256（delivery.md/s4-consistency-check.py/s4-dv1-tests.py/s4-check-negpos-tests.py/check_taskpack.py），全部自被测快照内读取 |
| 执行记录=Python 版本+完整命令+逐项结果+退出码 | 输出记录 Python 3.12.10+platform+生成时间（UTC）+四命令完整 argv（cwd=被测快照）+完整 stdout/stderr+退出码+逐项判定 |
| 归档=独立证据文件+MANIFEST | `acceptance/s4-ev1/s4-ev1-output.txt`（SHA256=128125c793bcc09cdc1362cd5485da151b17926d62fbd76b3861644a56a61ec0）+`s4-ev1-MANIFEST.txt`（记录 output 与驱动脚本 SHA256+申报约定句） |
| 版本变动=被测 delivery 修改必须重跑 | 输出文件尾部印明该条款；驱动可重复执行重新生成 |

## 证据引用（按裁定条款：归档路径+SHA256+被测源 commit；不手工复制 NT 位置）

- **主证据：`basic/tasks/b-20261115-phasec-workflow-stats/acceptance/s4-ev1/s4-ev1-output.txt`，SHA256=`128125c793bcc09cdc1362cd5485da151b17926d62fbd76b3861644a56a61ec0`，被测源 commit=`e309474dc85a8040506bd71347b03aa299384e1d`。** 已核验 Git 对象内容与磁盘文件一致（该 SHA 即 `git show HEAD:<路径>` 字节流的 SHA256）。
- 四命令结果（详见主证据全文）：s4-consistency-check.py=**36/36** 退出0；s4-dv1-tests.py=**6/6** 退出0；s4-check-negpos-tests.py=**7/7** 退出0；check_taskpack.py=**④ PASS/Overall=IN_PROGRESS** 退出1（IN_PROGRESS 既定语义）——四项全符合裁定预期=**EV1 PASS**。
- 辅助证据：`s4-ev1-MANIFEST.txt`（SHA256=`4c638dfa8245509637b0cdc37b1fa31765eeb13cf6019b3fed408fd572cf51c3`）；驱动脚本 `phase0/tools/s4-ev1-run.py`（SHA256=`486abaf33058f0601c8b05acf3fd656fcb3c2bfbbcc960d653c32259973ec811`）。三文件均已核验 Git 对象内容与磁盘字节一致。

## 复验重点

1. **绑定身份完整性：** 主证据头部=被测快照 e309474 全 SHA 与 `git rev-parse HEAD`（被测 worktree）一致+porcelain 空+Python/平台/生成时间+驱动脚本 SHA256+输入身份 5 文件 SHA256——逐项核对是否齐全且自洽。
2. **输入身份可复核：** `git show e309474:basic/tasks/b-20261115-phasec-workflow-stats/delivery.md` 等 5 文件的 SHA256 与主证据"输入身份"节逐项对照。
3. **四命令结果：** 主证据逐项 stdout 与退出码对照裁定预期（36/36+6/6+7/7+④ PASS/IN_PROGRESS/退出1）；EV1 重点=证明输出确实来自固定 e309474 快照（非重新证明⑧j 算法）。
4. **MANIFEST 对照：** MANIFEST 所列 output SHA256 与主证据文件实际 SHA256 一致；申报约定句在案。
5. **版本变动条款合规：** EV1 证据生成（01:25-01:26 UTC）后本登记 commit 对 delivery 的修改=裁定登记与状态同步（裁定附加要求"EV1 归档时同步未解决问题段表述"本身要求编辑 delivery）——登记编辑属裁定指令动作，非被测逻辑修改；机制层面按条款：后续任何被测文件修改均重跑驱动重新生成证据，旧输出不沿用。请对此处置复核裁定。
6. **环境如实声明：** 本机 Windows 11（Git Bash），Python 3.12.10；命令在本机执行，EV1 输出全存档随本 commit 在库；验收方未独立实跑的项如实以静态审查为准声明。

## 结论

验收结论：EV1 复验 PASS（证据绑定问题关闭，进入 S4 最终交付确认，v0.3 拍板交用户）/ EV1 复验 REJECT（列具体问题；不增加问题12 返工次数，进入第三级调整验证=评估测试证据生成机制替代实现）/ EV1 复验 BLOCKED（环境原因如实说明，不计 REJECT 不算 PASS）。第三级仍不能实现时才进入会商2 阶梯进一步调整与需求可行性判断，当前不得判定需求不可行。通过≠v0.3 生效。
