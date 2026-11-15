# S1-R3 限定复验请求：b-20261115-gpt03-review-leg（S1-R2 REJECT 四组整改后）

## 绑定申报（ST-01，机器预检已过）

- **复验基线：** `f3fa715c00e4698a5f7015fed70d565ae59556de`（S1-R2 派单时 HEAD）
- **待验收 commit（单 commit 申报）：** `c081086ee4a98d430632566ca066b565ec4eac83`
- **绑定核验：** verdict=PASS；R1 区间数=1；R2 线性链首 parent=基线；R4 无后代；numstat=review_leg.py **+127/-15**、test_review_leg.py **+117/0**（整改 diff 恰 2 文件）
- **R2 被测：** `6cf9147e6f49d2f43ef2e0b37753b3ca5e351402`；**本请求所在回填 commit 不属验收 diff 范围**（ST-01④）

## R2 裁定与整改对照（严格按 R2"下一轮最小整改要求"四组，无范围扩大）

| # | R2 未关闭项 | R3 整改要点 | 核对位置（c081086） |
|---|---|---|---|
| 1 | P1-01 残留：键证据=JSON 子串包含非结构化匹配 | 结构化键精确核验：message=`details.message_id == 本方 message_id`；report=`details.execution_id == 本方 execution_id` + message 文本按 M1 固定格式 `review report for (EXEC, {12hex}..)` **正则解析捕获组比对**（非子串包含）；请求 SHA 双证保留；artifact 无 409 命中路径不变 | review_leg.py `_report_key_evidence`/`_register_step` |
| 2 | P1-02 残留：message/report 指纹未重算核对 | `_ledger_verified` 改指纹**重算核对**：message=按当前内容重建预期信封→规范化指纹（canon 剔除 created_at，跨重启可比）与账本 canonical_sha 比较；report=按当前内容+账本既有 message/artifact ID 重建预期报告体→全量 request_sha 比较。**补 test_09b**：message 成功/report 失败→resume 跳过前两项只补 report | `_expected_envelope`/`_expected_report_body`/`_ledger_verified`；test_09b |
| 3 | NEW-P1-01：`_resume_register(flags)` 签名不匹配 TypeError 逸出 | 签名修复（无参调用）；resume/attach 兜底捕获未预期 Exception→忠实入账腿级 BLOCKED（不静默吞）；**补 test_08c 全链**：COLLECT_FAILED（落账会话证据）→原会话补采（替身，零重发）→契约校验→只补登记→状态推进（修复前此处 TypeError 逸出） | `_resume_collect`/`resume` 兜底；test_08c |
| 4 | P2-01 残留：三时点 user unit 计数缺独立证据 | R3 记录增 user_unit_counts：pre_send=0（--new-session 构造性：会话由本次发送创建）/at_send=1（发送双验锚定键）/快照 SHA；R4 增 at_capture 实读（units-diag.json/raw-units.json 按 role=user 计数+键清单+来源标识）；键身份一致性（located==sent）为主交叉证明。R5 增 request_sha+response_sha 对 | R3/R4/R5 记录字段 |

另含 P1-03 执行件修复：补采模板路径修正（本目录，R2 发现的 `PHASE0_TOOLS/` 错位）+ Windows 路径 JS 字面量安全化（反斜杠→正斜杠）——test_08c 依赖此路径执行。

## 回归证据

- test_review_leg.py **21/21 PASS**（27.5s；新增 08c/09b，其余 19 例回归通过）
- 未触碰红线：scheduler.py/M1-M4/M2 工具链/契约文件零修改（diff 恰 2 文件佐证）；P2-02/P2-03 通过证据保留未动

## 请验收方执行（限定复验范围）

①第 1 组：409 结构化键核验精确性（正则与 M1 错误格式实比对）；②第 2 组：指纹重算逻辑+test_09b 分支；③第 3 组：NEW-P1-01 修复+test_08c 全链（含零重发断言）；④第 4 组：三时点计数证据完整性；⑤整改未引入新缺陷（21 用例+替身边界仍仅 ChatGPT 采集/派单两侧）；⑥范围复核（2 文件，M1-M4/scheduler.py 零修改）。

**回执格式：** ①-⑥逐项+四组逐项判定（关闭/未关闭）+总结论（PASS/REJECT+新问题编号）。
