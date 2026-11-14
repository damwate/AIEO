# 验收请求：b-20261114-taskpack-checker 第 3 步（S3 unittest 正负例+边界测试+JSON 输出）——复验 R3（仅文档修正）

> **绑定注记：** 验收历史：首验 REJECT（dispatch-2026-11-14T17-39-59，reply sha256=a741d1bc0568dacd2e99466c077f3f9bf63b129c75e46c2685479c71266bf28a，P1-1/P1-2/P2-1→整改 941ee88，登记问题9）→ 复验R1 REJECT（dispatch-2026-11-14T17-54-36，reply sha256=2da8c284a8ee3439c2cf4a4544a72bbd50094d7a9bedac08a4d22d3efc8ad0bb：三项整改成果确认保留；新 P1-1 计数覆盖缺口+P1-2 绑定申报错误→登记问题10，同批整改）→ **复验R2（dispatch-2026-11-14T18-04-51，reply sha256=82fc2fb2488ecf11c4dc314ace57f7fcc535cfcc43cfb25b7a93f7591cbce3f9）：Git 绑定 P1-2/代码 P1-1/动态测试全 PASS（附件 SHA256 逐字一致+独立执行 Ran 33 tests OK 失败 0 跳过 0——Linux 环境符号链接权限可用故 skipped=0，环境差异如实注明）；唯一遗留=steps.md S3 六要素②④⑤未同步 33 项（验收记录准确性问题，非代码缺陷）→ 本轮仅文档修正**。S2 已闭环（复验R3c PASS）。S1 四轮闭环（复验 R4 PASS）。
> **复验R3 范围：仅 steps.md S3 六要素②④⑤⑥文档修正（②用例数 33/④按轮次区分历史与最终结果/⑤最终命令+33 项结果/Windows skipped=1 历史环境说明保留未改写为 Linux 结果）+本请求更新。无代码改动，不重做已通过的测试。上轮验收方读 b1bd307 树内验收请求为 R1 版系时序必然（R2 版请求在 b1bd307 之后的 docs commit 86e5310），本轮请求随最新 docs commit 入库。**
> **P1-2 如实说明：** 上轮（复验R1）申报"diff=4818399→941ee88 单 commit"错误——941ee88 的 parent 实为 3191a34，4818399→941ee88 区间含 2 commits（3191a34+941ee88）/5 文件；根因是申报时凭记忆写基线、未核实 parent 与 rev-list 区间数，与 S2 问题5 同型教训，已固化申报前必跑 `git rev-list --count` 与 parent 核验。本轮绑定按下述口径申报。

## 代码绑定（延续已认可口径：待验收 commit 自身 diff=parent→commit）

- 分支：main（https://github.com/damwate/AIEO.git）
- **本轮无新代码 commit：代码验收基线仍为复验R2 已通过的 `b1bd307ffe574b785814e47527f0f91423a54190`（parent=3e61af1，diff=3e61af1→b1bd307 单 commit 仅 2 文件）。本轮新增仅为文档 commit（steps.md 六要素修正+本请求），不改变代码。**
- **验收 diff 范围：`3e61af1` → `b1bd307`（单 commit，改动 2 个文件：basic/tool/check_taskpack.py 计数补标题形式、basic/tool/test_check_taskpack.py 新增跨格式反例。请以 `git show b1bd307` 核验；GitHub Compare 3e61af1...b1bd307 应为 ahead_by=1/2 files。）**
- 历史链绑定：首验对象 4818399（parent=3c3c1bc，单 commit 仅 test 文件）；首轮整改 941ee88（parent=3191a34，单 commit 3 文件：工具+测试+整改材料）；docs 回填 3191a34/3e61af1 为文档 commit 不属验收代码范围。被测工具 check_taskpack.py 在 941ee88 与 b1bd307 两轮被修改——依据均如实登记（首验允许条款"新增测试实际发现其行为存在缺陷"+复验R1 P1-1"重复计数覆盖工具支持的全部字段书写形式"）。
- 文档绑定：本验收请求与 steps.md 问题9/问题10 登记+S3 六要素回填随文档 commit 入库

## 整改对照（两轮 REJECT 全部问题 ↔ 对应整改）

| 轮次 | 问题 | 整改内容 |
|---|---|---|
| 首验 | P1-1 重复字段测试没验证重复被拒（工具无重复字段检测，exit=1 被未到期项掩盖） | 941ee88：① 需求记录新增 count_brief_field_rows 逐字段计数，>1 次 → FAIL「重复出现 2 次（重复字段不允许静默接受）」；测试断言 ① FAIL+含"重复""任务ID"+Overall 非 PASS+exit=1 |
| 首验 | P1-2 重复步骤编号测试没验证异常（工具静默接受"2 步记录完整 PASS"） | 941ee88：② 步骤清单新增 Counter 按编号计数，>1 个小节 → FAIL「步骤编号重复: S1 出现 2 个小节」；测试断言 ② FAIL+含"重复""S1"+Overall 非 PASS+exit=1 |
| 首验 | P2-1 JSON 第三场景未做文本对照 | 941ee88：test_json_missing_dir 改走 assert_json_matches_text（六项状态+退出码+overall↔exit） |
| 复验R1 | **P1-1 重复字段计数覆盖缺口**（count_brief_field_rows 只统计表格行+行内键，漏 extract_brief_field 支持的标题形式；表格行+标题形式重复时计数=1 漏判） | **b1bd307：count_brief_field_rows 扩为三种书写形式计数（表格行+行内键+标题行），标题 regex 与 extract_brief_field 标题形态（`## 字段（注记）：值`）口径一致——计数口径=提取口径；新增 test_duplicate_brief_field_cross_format 跨格式反例（表格行「任务ID」+标题形式「## 任务ID」、无行内——旧计数=1 漏判、新计数=2 → ① FAIL+含"重复""任务ID"+Overall 非 PASS+exit=1）** |
| 复验R1 | **P1-2 Git 提交绑定不一致**（申报 4818399→941ee88 单 commit，实际 ahead_by=2/5 文件） | **本轮绑定修正：待验收 b1bd307 parent=3e61af1，diff=3e61af1→b1bd307 单 commit 仅 2 文件；申报流程固化"rev-list count+parent 核验"；steps.md 问题10 如实登记根因与同型问题5 教训** |

## 验收内容（steps.md S3 拍板冻结口径，映射表随整改更新）

- 本步骤目标：unittest 正负例+边界测试+JSON 输出（验收重点：异常场景全部覆盖）
- **拍板口径四项对照：**
  1. **正例：完整任务包样例输出 PASS** → test_completed_pack_all_pass + test_in_progress_own_pack_shape（③N/A 未到期 exit=1）；
  2. **11 类异常输入逐项断言** → 一一映射（下表）；
  3. **`--json` 输出结构与文本判定一致性** → TestJsonConsistency 三场景全部 assert_json_matches_text：items 状态序列对齐、exit 相同、overall=="PASS"↔exit==0；第三场景另断言 phase=UNKNOWN+problems 可识别；
  4. **异常输入产生可识别结果** → 全部 CLI 用例断言无 "Traceback"；TestIdentifiableResults 批量 6 异常场景 exit=1+含 FAIL。
- **11 类异常 ↔ 测试映射表（★=两轮整改更新）：**

| 拍板异常类 | 测试用例 |
|---|---|
| 目录不存在 | test_directory_not_exist +★test_json_missing_dir（文本对照） |
| 缺文件 | test_missing_requirement / test_missing_brief / test_missing_steps |
| 空文件 | test_empty_requirement |
| 编码异常 | test_invalid_encoding_is_identifiable（无效 UTF-8 → ③ FAIL） |
| 重复字段或编号 | ★test_duplicate_brief_field（① FAIL"重复出现 2 次"）/ ★test_duplicate_step_number（② FAIL"S1 出现 2 个小节"）/ ★test_duplicate_brief_field_cross_format（跨格式：表格行+标题形式 → ① FAIL，旧计数漏判反例） |
| 记录与步骤不对应 | test_step_missing_six_elements / test_six_element_placeholder |
| 证据不存在 | test_cli_missing_evidence_file_fails |
| 非法阶段 | test_illegal_phase_is_unknown_fail（①③ FAIL 不猜） |
| 第 3 次返工 | test_rework_3_times_pass（⑤ PASS）——保留未改 |
| 第 4 次返工 | test_rework_4_times_fail（⑤ FAIL "达 4 次"）——保留未改 |
| 路径穿越 | test_cli_traversal_in_evidence_fails + test_unit_traversal_rejected——保留未改 |

- 补充覆盖（未改）：S2 遗留回归 test_reject_without_number_fails（④FAIL⑤PASS）/ test_rework_row_unreferenced / test_missing_dispatch_or_sha_in_ev；P1-1 阶段边界回归三用例；符号链接 test_unit_symlink_escape_rejected 当前 Windows 环境无权限 **skipTest 如实跳过（skipped=1）**；路径三规则单元直调。
- 实现约束：仅标准库 unittest；测试自包含（tempfile 动态构造）；运行命令 `python -I -m unittest discover -s basic/tool -p "test_check_taskpack.py"`。

## 自测证据（执行者实跑留档，可复跑）

| 项 | 内容 |
|---|---|
| 实际执行命令 | `python -I -m unittest discover -s basic/tool -p "test_check_taskpack.py" -v`（Windows Git Bash） |
| 执行结果（本轮整改后） | **Ran 33 tests in 7.988s，OK (skipped=1)**（新增 1 项：test_duplicate_brief_field_cross_format）；skip=test_unit_symlink_escape_rejected（Windows 无 symlink 权限如实跳过） |
| 历轮保留清单不退化 | 首验+复验R1 两轮明示保留项（第 3 次 PASS/第 4 次 FAIL/S2 反例④ FAIL⑤ PASS/P1-1 边界/路径三规则/符号链接 skipTest/两个重复检测/JSON 三场景对照）全部保持，未重写已通过测试 |
| 复验R1 要求材料 | **phase0/tools/s3-rework-r2-materials.txt（随 docs commit 入库）**：跨格式反例实际 FAIL 输出（① FAIL+「任务ID」重复出现 2 次，exit=1，附旧实现漏判对照说明）+unittest 完整执行结果（-v 全量 33 项逐条）；首轮材料 s3-rework-r1-materials.txt（随 941ee88）仍在库 |
| 对应 commit SHA | 待验收 b1bd307（本 commit）；首轮整改 941ee88；首验对象 4818399；S2 闭环基线 3a8975a |

## 附件动态核验包（促成⑤独立实跑，S2 R3c 先例）

随派单附件投递 **s3-dynamic-acceptance-b1bd307.zip**：check_taskpack.py+test_check_taskpack.py 两文件全部 `git show b1bd307:<path>` blob 逐字节提取（非工作区），MANIFEST 含每文件 SHA256+运行命令+预期（Ran 33 tests OK (skipped=1)）。请在你方 Python 沙箱解压后独立执行（不依赖 GitHub 网络），核对结果并留执行记录。

## 测试质量自检（如实）

1. 两轮测试缺陷均如实登记 steps.md（问题9/问题10）：首轮重复两用例断言不足且暴露被测工具行为缺陷（按允许条款修工具）；复验R1 暴露计数函数未对照提取函数全形态清单+绑定申报未核实的流程缺陷。
2. item_status/statuses 解析器按 CLI 输出格式匹配，与 render_text 契约耦合，属预期（黑盒契约测试）。

## 验收方自查提示（验收六查，不得只读本请求）

自行获取并核查：steps.md S3 冻结口径与问题9/问题10 行、`git show b1bd307` 与 Compare 3e61af1...b1bd307（ahead_by=1/2 files）、实际运行测试套件或附件动态核验包、s3-rework-r2-materials.txt 交叉核对。六查：①符合步骤目标 ②符合拍板方案 ③未超范围 ④无明显代码质量问题 ⑤测试真实执行 ⑥证据可核查。

## 结论

PASS（本步通过，允许进入 S4）/ REJECT（退回修复，给具体修改要求）/ BLOCKED（环境原因无法验收，如实说明）。返工计数按"同一问题"规则（basic/WORKFLOW.md 模块五）。
