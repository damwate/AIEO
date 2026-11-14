# 验收请求：b-20261114-taskpack-checker 第 3 步（S3 unittest 正负例+边界测试+JSON 输出）

> **绑定注记：** S2 已闭环（复验R3c PASS，dispatch-2026-11-14T17-27-15，reply sha256=355e35e1b41626b49f4061e12257c47e518c89c56118007686d9f0446c7a6bf1——附件通道动态执行七组全符）。S1 四轮闭环（复验 R4 PASS，dispatch-15-51-20）。

## 代码绑定（延续已认可口径：待验收 commit 自身 diff=parent→commit）

- 分支：main（https://github.com/damwate/AIEO.git）
- **本次待验收代码 commit：`48183995e1df48cb149e43d0679d437a186b501e`**
- **验收 diff 范围：`3c3c1bc` → `4818399`（单 commit，仅新增 1 个文件：basic/tool/test_check_taskpack.py，472 行）。请以 `git show 4818399` 核验。**
- 被测对象为 S2 已闭环的 basic/tool/check_taskpack.py（未被本 commit 修改，其代码 commit=3a8975a 已随 S2 闭环验收）；文档绑定：本验收请求与 steps.md S3 回填随文档 commit 入库
- S2 验收范围不含任何并行任务 commit 的口径延续

## 验收内容（steps.md S3 拍板冻结原文照录）

- 本步骤目标：unittest 正负例+边界测试+JSON 输出（验收重点：异常场景全部覆盖）
- **拍板口径四项对照：**
  1. **正例：完整任务包样例输出 PASS** → test_completed_pack_all_pass（COMPLETED+七要素 delivery → 六项全 PASS exit=0）+test_in_progress_own_pack_shape（自身包形态：③N/A 未到期，exit=1）；
  2. **11 类异常输入逐项断言** → 一一映射（详见测试清单表）；
  3. **`--json` 输出结构与文本判定一致性** → TestJsonConsistency 三场景：items 状态序列与文本 `[PASS]/[FAIL]/[N/A]` 逐项对齐、两次运行 exit 相同、overall=="PASS"↔exit==0；目录不存在时 JSON phase=UNKNOWN+problems 可识别；
  4. **异常输入产生可识别结果（无未捕获异常/静默跳过/错误 PASS）** → 全部 CLI 用例断言无 "Traceback"；TestIdentifiableResults 批量 6 异常场景（缺文件/空文件/非法阶段/缺步骤/坏字节/穿越）逐个断言 exit=1+含 FAIL。
- **11 类异常 ↔ 测试映射表：**

| 拍板异常类 | 测试用例 |
|---|---|
| 目录不存在 | test_directory_not_exist（"任务目录不存在" exit=1） |
| 缺文件 | test_missing_requirement / test_missing_brief / test_missing_steps（各自 FAIL+原因） |
| 空文件 | test_empty_requirement（"内容为空"） |
| 编码异常 | test_invalid_encoding_is_identifiable（无效 UTF-8 → ③ FAIL，无未捕获异常） |
| 重复字段或编号 | test_duplicate_brief_field（task-brief 重复「任务ID」行）/ test_duplicate_step_number（两个 S1 小节均到期评估） |
| 记录与步骤不对应 | test_step_missing_six_elements（缺六要素列出）/ test_six_element_placeholder（占位符） |
| 证据不存在 | test_cli_missing_evidence_file_fails（"证据路径不存在"） |
| 非法阶段 | test_illegal_phase_is_unknown_fail（①③ FAIL+可识别原因，不猜） |
| 第 3 次返工 | test_rework_3_times_pass（⑤ PASS，冻结口径 3；计数细节经 --json item.steps=["问题1×3"] 断言） |
| 第 4 次返工 | test_rework_4_times_fail（⑤ FAIL "达 4 次"） |
| 路径穿越 | test_cli_traversal_in_evidence_fails（⑥引用 acceptance/../ → ③ FAIL）+ test_unit_traversal_rejected（validate_pack_path 单元直调） |

- 补充覆盖（拍板口径"含符号链接"）：test_unit_symlink_escape_rejected 以 os.symlink 实建符号链接指向包外文件断言"越出任务目录（疑似符号链接绕过）"；当前 Windows 环境无符号链接创建权限，**skipTest 如实跳过（skipped=1）**，环境允许时自动执行；相对/绝对/穿越三规则由单元直调覆盖，`test_unit_relative_ok`/`test_unit_absolute_rejected` 补齐。
- 补充覆盖（S2 复验遗留回归）：test_reject_without_number_fails（R2 反例：④REJECT 无编号+⑤提及问题1+表有行 → ④ FAIL"REJECT 所在要素值与⑥均未引用问题编号"且⑤ PASS）；test_rework_row_unreferenced（行未被引用 → ④ FAIL）；test_missing_dispatch_or_sha_in_ev（⑥缺 dispatch 目录/reply SHA256 → ③ FAIL）。
- 阶段边界回归（S2 P1-1 整改不退化）：test_planning_all_na_even_with_prefilled_pass / test_in_progress_not_due_steps_na / test_current_step_unresolvable_is_fail_not_guess。
- 实现约束：仅标准库 unittest；测试自包含（tempfile 动态构造任务包，不依赖仓库 fixtures）；运行命令 `python -I -m unittest discover -s basic/tool -p "test_check_taskpack.py"` 或 `python -I basic/tool/test_check_taskpack.py`。

## 自测证据（执行者实跑留档，可复跑）

| 项 | 内容 |
|---|---|
| 实际执行命令 | `python -I -m unittest discover -s basic/tool -p "test_check_taskpack.py" -v`（Windows Git Bash） |
| 执行结果 | Ran 32 tests in ~7s，**OK (skipped=1)**；skip=test_unit_symlink_escape_rejected（Windows 非开发者模式无 symlink 权限，按设计如实跳过） |
| 关键断言抽查 | 全 PASS 包六项全 PASS exit0；rework×3 ⑤PASS/×4 ⑤FAIL "达 4 次"；REJECT 无编号反例 ④FAIL⑤PASS；JSON 与文本三场景一致；全部异常用例无 Traceback |
| 未测项及原因 | 符号链接动态创建在本机环境跳过（权限），已如实标注——Linux/开发者模式环境跑同套件会实际执行；其余拍板口径全测 |
| 对应 commit SHA | 被测工具 3a8975a（S2 闭环）；测试 4818399（本 commit） |

## 测试质量自检（如实）

1. 首轮运行曾 19F+2E：全部为测试代码自身错误（状态行匹配偏移 s[:6]、unlink 未创建文件、断言了仅 FAIL 时才显示的文本），**非工具缺陷**；修正后 32 OK。修正过程见 commit 历史与工作区（首版未入库，如实说明：测试文件仅以修正后版本入库）。
2. `item_status`/`statuses` 解析器按 CLI 输出格式 `\[PASS|FAIL|N/A\]\s+[①-⑥]` 匹配，与 render_text 契约耦合——若文本输出格式变化测试会失败，属预期（黑盒契约测试）。

## 验收方自查提示（验收六查，不得只读本请求）

自行获取并核查：steps.md S3 冻结口径、`git show 4818399`（仅 test 文件）、实际运行测试套件（若环境可跑 Python）、S2 证据 v3 与 fixtures 交叉核对。六查：①符合步骤目标 ②符合拍板方案 ③未超范围 ④无明显代码质量问题 ⑤测试真实执行 ⑥证据可核查。

## 结论

PASS（本步通过，允许进入 S4）/ REJECT（退回修复，给具体修改要求）/ BLOCKED（环境原因无法验收，如实说明）。返工计数按"同一问题"规则（basic/WORKFLOW.md 模块五）。
