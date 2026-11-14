# 验收请求：b-20261114-taskpack-checker 第 3 步（S3 unittest 正负例+边界测试+JSON 输出）——复验 R1

> **绑定注记：** S3 首验 REJECT（dispatch-2026-11-14T17-39-59，reply sha256=a741d1bc0568dacd2e99466c077f3f9bf63b129c75e46c2685479c71266bf28a）：①③⑥ PASS、② FAIL（P1-1/P1-2）、④ 部分通过、⑤ 待独立复跑——三项整改（P1-1/P1-2/P2-1）已完成，登记问题9。S2 已闭环（复验R3c PASS，dispatch-17-27-15，reply sha256=355e35e1b41626b49f4061e12257c47e518c89c56118007686d9f0446c7a6bf1——附件通道动态执行七组全符）。S1 四轮闭环（复验 R4 PASS）。

## 代码绑定（延续已认可口径：待验收 commit 自身 diff=parent→commit）

- 分支：main（https://github.com/damwate/AIEO.git）
- **本次待验收代码 commit：`941ee8843b54a8d2685d6fe6cc07e564e6275ca4`**
- **验收 diff 范围：`4818399` → `941ee88`（单 commit，改动 3 个文件：basic/tool/check_taskpack.py 重复字段+重复编号检测、basic/tool/test_check_taskpack.py 断言加强、新增 phase0/tools/s3-rework-r1-materials.txt 整改材料）。请以 `git show 941ee88` 核验。**
- 被测对象 basic/tool/check_taskpack.py 本次被修改——依据首验整改条款"不需要修改 S2 被测工具，除非新增测试实际发现其行为存在缺陷"：新增测试实际发现其行为缺陷（详见"整改对照"），且 P1-2 整改要求"重复 S1 必须产生明确异常……不允许重复编号被静默接受"只能通过工具修复实现。S2 已验收行为不退化：全量 32 用例复跑 OK (skipped=1)，首验明示保留清单全部不退化（见自测证据）。
- 文档绑定：本验收请求与 steps.md 问题9 登记+S3 六要素回填随文档 commit 入库

## 整改对照（首验三项 ↔ 本 commit 改动）

| 首验问题 | 整改内容 |
|---|---|
| **P1-1 重复字段测试没验证重复被拒**（工具对重复字段无检测：重复「任务ID」行输出与无重复基线完全一致，exit=1 仅因 IN_PROGRESS 未到期项） | 工具 ① 需求记录新增重复字段检测：count_brief_field_rows 按"表格行+行内键"逐字段计数（BRIEF_REQUIRED_FIELDS 9 字段），出现 >1 次 → FAIL「字段「任务ID」重复出现 2 次（重复字段不允许静默接受）」；测试断言加强：① FAIL+输出含"重复"+"任务ID"+Overall 非 PASS+exit=1 |
| **P1-2 重复步骤编号测试没验证异常**（工具静默接受：两个 S1 小节"2 步记录完整 PASS"） | 工具 ② 步骤清单新增重复编号检测：Counter 按步骤编号计数，>1 个小节 → FAIL「步骤编号重复（重复编号不允许静默接受）: S1 出现 2 个小节」；测试断言加强：② FAIL+输出含"重复"+"S1"+Overall 非 PASS+exit=1，替换原"③ N/A+2 步记录完整 PASS"宽松断言 |
| **P2-1 JSON 第三场景未做文本对照**（test_json_missing_dir 只查 JSON） | test_json_missing_dir 改走 assert_json_matches_text()（六项状态序列+退出码+overall↔exit 对照），另断言 phase=UNKNOWN、overall=FAIL、problems 可识别"不存在" |

## 验收内容（steps.md S3 拍板冻结口径，映射表随整改更新）

- 本步骤目标：unittest 正负例+边界测试+JSON 输出（验收重点：异常场景全部覆盖）
- **拍板口径四项对照：**
  1. **正例：完整任务包样例输出 PASS** → test_completed_pack_all_pass（COMPLETED+七要素 delivery → 六项全 PASS exit=0）+test_in_progress_own_pack_shape（自身包形态：③N/A 未到期，exit=1）；
  2. **11 类异常输入逐项断言** → 一一映射（下表）；
  3. **`--json` 输出结构与文本判定一致性** → TestJsonConsistency 三场景全部 assert_json_matches_text（P2-1 整改后含第三场景）：items 状态序列与文本逐项对齐、两次运行 exit 相同、overall=="PASS"↔exit==0；第三场景另断言 phase=UNKNOWN+problems 可识别；
  4. **异常输入产生可识别结果（无未捕获异常/静默跳过/错误 PASS）** → 全部 CLI 用例断言无 "Traceback"；TestIdentifiableResults 批量 6 异常场景逐个断言 exit=1+含 FAIL。
- **11 类异常 ↔ 测试映射表（★=本轮整改更新）：**

| 拍板异常类 | 测试用例 |
|---|---|
| 目录不存在 | test_directory_not_exist（"任务目录不存在" exit=1）+★test_json_missing_dir（文本对照） |
| 缺文件 | test_missing_requirement / test_missing_brief / test_missing_steps（各自 FAIL+原因） |
| 空文件 | test_empty_requirement（"内容为空"） |
| 编码异常 | test_invalid_encoding_is_identifiable（无效 UTF-8 → ③ FAIL，无未捕获异常） |
| 重复字段或编号 | ★test_duplicate_brief_field（① FAIL"重复出现 2 次"）/ ★test_duplicate_step_number（② FAIL"S1 出现 2 个小节"，不静默接受） |
| 记录与步骤不对应 | test_step_missing_six_elements（缺六要素列出）/ test_six_element_placeholder（占位符） |
| 证据不存在 | test_cli_missing_evidence_file_fails（"证据路径不存在"） |
| 非法阶段 | test_illegal_phase_is_unknown_fail（①③ FAIL+可识别原因，不猜） |
| 第 3 次返工 | test_rework_3_times_pass（⑤ PASS，冻结口径 3；计数细节经 --json item.steps=["问题1×3"] 断言）——**保留未改** |
| 第 4 次返工 | test_rework_4_times_fail（⑤ FAIL "达 4 次"）——**保留未改** |
| 路径穿越 | test_cli_traversal_in_evidence_fails（⑥引用 acceptance/../ → ③ FAIL）+ test_unit_traversal_rejected（validate_pack_path 单元直调）——**保留未改** |

- 补充覆盖（未改）：S2 遗留回归 test_reject_without_number_fails（④FAIL⑤PASS）/ test_rework_row_unreferenced / test_missing_dispatch_or_sha_in_ev；P1-1 阶段边界回归 test_planning_all_na_even_with_prefilled_pass / test_in_progress_not_due_steps_na / test_current_step_unresolvable_is_fail_not_guess；符号链接 test_unit_symlink_escape_rejected 以 os.symlink 实建出界链接，当前 Windows 环境无权限 **skipTest 如实跳过（skipped=1）**；相对/绝对/穿越三规则单元直调。
- 实现约束：仅标准库 unittest；测试自包含（tempfile 动态构造任务包，不依赖仓库 fixtures）；运行命令 `python -I -m unittest discover -s basic/tool -p "test_check_taskpack.py"` 或 `python -I basic/tool/test_check_taskpack.py`。

## 自测证据（执行者实跑留档，可复跑）

| 项 | 内容 |
|---|---|
| 实际执行命令 | `python -I -m unittest discover -s basic/tool -p "test_check_taskpack.py" -v`（Windows Git Bash） |
| 执行结果（整改后复跑） | **Ran 32 tests in 7.670s，OK (skipped=1)**；skip=test_unit_symlink_escape_rejected（Windows 非开发者模式无 symlink 权限，按设计如实跳过） |
| 首验保留清单不退化 | 第 3 次返工 PASS / 第 4 次返工 FAIL / S2 反例④ FAIL⑤ PASS / P1-1 阶段边界 / 路径穿越三规则 / 符号链接 skipTest 真实环境标注——全部保持，未重写已通过测试 |
| 复验要求材料 | **phase0/tools/s3-rework-r1-materials.txt（已入库随 941ee88）**：①重复字段具体 FAIL 输出（① FAIL+「任务ID」重复出现 2 次）②重复编号具体 FAIL 输出（② FAIL+S1 出现 2 个小节）③JSON 三场景文本对照逐场景记录（状态序列/exit/overall 逐项比对，结论"全部一致 PASS"） |
| 对应 commit SHA | 被测工具整改 941ee88（本 commit，含工具+测试）；S2 闭环基线 3a8975a；首验对象 4818399 |

## 测试质量自检（如实）

1. 首验暴露的测试缺陷属测试编写问题：重复字段/重复编号两用例只验证 exit=1 与宽松文本，未断言具体项 FAIL 与原因——且实验证实被测工具本身确无重复检测（重复输出与基线一致/编号静默接受），即新增测试实际发现被测工具行为缺陷，按首验整改条款修复工具（非仅改断言）。
2. item_status/statuses 解析器按 CLI 输出格式 `\[PASS|FAIL|N/A\]\s+[①-⑥]` 匹配，与 render_text 契约耦合——若文本输出格式变化测试会失败，属预期（黑盒契约测试）。

## 验收方自查提示（验收六查，不得只读本请求）

自行获取并核查：steps.md S3 冻结口径与问题9 行、`git show 941ee88`（工具检测逻辑+测试断言）、实际运行测试套件（若环境可跑 Python；S2 R3c 附件动态验收方式可参考——可对 941ee88 同样打包）、s3-rework-r1-materials.txt 与实际输出交叉核对。六查：①符合步骤目标 ②符合拍板方案 ③未超范围 ④无明显代码质量问题 ⑤测试真实执行 ⑥证据可核查。

## 结论

PASS（本步通过，允许进入 S4）/ REJECT（退回修复，给具体修改要求）/ BLOCKED（环境原因无法验收，如实说明）。返工计数按"同一问题"规则（basic/WORKFLOW.md 模块五）。
