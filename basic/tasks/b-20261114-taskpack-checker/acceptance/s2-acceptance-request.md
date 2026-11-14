# 验收请求：b-20261114-taskpack-checker 第 2 步（S2 六项检查规则实现）

> **绑定注记：** 本请求绑定待验收 commit `3add8da1dbddb1756604d8e8d2d3b760e221ada9`（S2 实现）。S1 已四轮验收闭环（最终复验 R4 PASS，dispatch-2026-11-14T15-51-20，reply sha256=c2d621ac507487c1abe899a31c602d180deddbba2d81fabbd1e89bc6ac69f258）。

## 代码绑定

- 分支：main（https://github.com/damwate/AIEO.git）
- 开发前基线 commit：`553ed2d12455e6f30a2cee22616eeafb73ecf963`（S1 最终验收通过状态）
- **本次待验收 commit：`3add8da1dbddb1756604d8e8d2d3b760e221ada9`**
- 验收 diff 范围：`553ed2d` → `3add8da`（单 commit：check_taskpack.py 六项实装 + steps.md S2 回填 + acceptance/s2-fixtures/ 三 fixture + acceptance/s2-runtime-evidence/ 五组证据；另注意同 diff 内 steps.md 含问题3修复列短 SHA 补全 40 位 `9ae394a1…` 一处记录修正）

## 验收内容

- 本步骤目标（steps.md 拍板冻结原文照录）：S2 六项检查规则实现（验收重点：规则逐项通过）
- **冻结清单六项对照（steps.md S2 原文）：**
  1. ①需求记录：requirement.md 原文非空 + task-brief.md **9 必备字段**非空非占位符（实现：表格行/行内/`## 字段`标题三形态提取；**当前状态走阶段映射专门校验、最终结果设计上"任务完成前暂空"不入占位检查表**——实现注记，验收请对照冻结清单裁决此口径是否成立）；
  2. ②步骤清单：steps.md 有效步骤编号与名称（`## S<编号> <名称>` 小节解析）；
  3. ③步骤验收记录：每步骤小节六要素+PASS 结论（`验收结论：PASS`）+证据引用（dispatch 目录+reply SHA256 64位hex+包内证据路径校验：相对路径/禁 `..` 穿越/解析实际路径防符号链接绕过/存在性），关联具体步骤小节；阶段规则：COMPLETED 全步骤须 PASS、IN_PROGRESS 编号<当前须 PASS（当前及以后未到期 N/A）、PLANNING 全 N/A、当前步骤解析不出 S 编号=FAIL 不猜；
  4. ④REJECT 返工记录：REJECT/返工/问题编号三方关联——含 REJECT 结论须有返工表有效行（问题编号非占位+修复 commit 40 位 hex）；无 REJECT 无表=N/A（COMPLETED 时空满足 PASS）；
  5. ⑤返工次数：同编号有效行计数，第 3 次允许、第 4 次及以后 FAIL；COMPLETED 无返工空满足 PASS；
  6. ⑥交付记录：COMPLETED 时 delivery.md 七要素齐全非空，其余阶段 N/A 未到期。
- 实现约束自检：六项独立函数互不依赖执行顺序、统一 ItemResult 字段（no/name/status/problems/files/steps/evidence）、汇总层算整体（FAIL>IN_PROGRESS>PASS 优先级）、文本+`--json` 共用同一结果对象、退出码 PASS=0 其余=1、仅 Python 标准库、异常输入可识别结果。

## 自测证据

| 项 | 内容 |
|---|---|
| 实际执行命令 | `python basic/tool/check_taskpack.py <target> [--json]`（动态证据落盘：acceptance/s2-runtime-evidence/，五组） |
| 执行结果 | A 自身任务包：①②④⑤ PASS、③⑥ N/A、Overall IN_PROGRESS exit=1；B fixture-good-completed：六项全 PASS exit=0；C fixture-rework4：⑤ FAIL（问题1 第 4 次，冻结口径 3）exit=1；D fixture-reject-no-table：③ FAIL（S1 路径穿越拒绝+S2 REJECT 缺 PASS）④ FAIL exit=1；E `--json` schema（七字段 items）与文本判定一致 |
| 原始证据路径 | acceptance/s2-runtime-evidence/run-a-own-pack.stdout / run-b-good-completed.stdout / run-c-rework4.stdout / run-d-reject-no-table.stdout / run-e-json-consistency.json（commit `3add8da` 内留档） |
| fixtures | acceptance/s2-fixtures/fixture-{good-completed,rework4,reject-no-table}/（完整可复跑任务包样例） |
| 未测项及原因 | unittest 正负例+11 类异常场景全套归 S3（拍板分步，本步骤以场景自测覆盖）；本步骤未跑独立验收（本请求即派单前置材料） |
| 对应 commit SHA | 被测代码 `3add8da1dbddb1756604d8e8d2d3b760e221ada9`（证据同 commit） |

## 自测中抓出并修正的三处（如实记录）

1. 自身返工表问题3修复列为短 SHA `40c66d9` → 补全 40 位 `9ae394a12d5e261adeb272aa22050d92c5abb423`（记录修正，git log 可核）；
2. ①按 11 字段检查致「最终结果」占位符永久误报 → 改按冻结清单 9 必备字段；
3. ④在 COMPLETED 且无返工时误 N/A 卡死整体 PASS → 改空满足 PASS。

## 验收方自查提示（验收六查，不得只读本请求）

自行获取并核查：steps.md 冻结口径与 S2 清单、实际 diff（`553ed2d`→`3add8da`）、动态证据五组原始输出、三 fixture 复跑。六查：①符合步骤目标 ②符合拍板方案 ③未超范围 ④无明显代码质量问题 ⑤测试真实执行 ⑥证据可核查。

## 结论

PASS（本步通过，允许进入 S3）/ REJECT（退回修复，给具体修改要求）/ BLOCKED（环境原因无法验收，如实说明）。返工计数按"同一问题"规则（basic/WORKFLOW.md 模块五）。
