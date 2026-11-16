# S1 设计笔记：GPT-04 测试验收真实腿（同构差异对照与适配点清单）

- 日期：2026-11-17；依据：charter v0.3（Gate2 定稿 DEC-090）+arch_review_leg.py 实读（1278 行）
- D2 终裁=同构复制：以 arch_review_leg.py 为结构参考，复用 review_leg.py 公共件（EngineM1Client/ReviewLedger/derive_recoll_driver/utc_now_iso/OUTBOUND_LIMIT/REST_TIMEOUT/PHASE0_TOOLS/CONTRACT_DIR/DISPATCH_LOG_DIR）与 scheduler.py 件（M1Client/OrchestrationError/sha256_*）；**不修改 review_leg.py 与 arch_review_leg.py 任何一行**（差异于 GPT-02 的唯一 S2 修改点=review_leg 参数化；GPT-04 零修改既有腿）。

## 1. 同构差异对照表（GPT-02 → GPT-04）

| 维度 | GPT-02（arch_review_leg） | GPT-04（test_acceptance_leg） | 依据 |
|---|---|---|---|
| 关口态 | ARCH_REVIEW | TEST_ACCEPTANCE | state_machine.py:37 |
| 终态推进 | PASS→READY/REWORK→REWORK（腿直接 POST events） | PASS→ACCEPTED/REWORK→REWORK（**/reports/test 端点内原子推进，腿不 POST events**） | charter A-1 排除清单 |
| 结论登记 | 路线 B：artifacts×2+messages（ARCH_REVIEW_SUBMITTED 批次级信封 task_id=null） | **原生端点 POST /api/v1/reports/test**（TestReportIn；test_reports 表=结论权威）+artifacts×2+messages（TEST_ACCEPTANCE_SUBMITTED **任务级信封 batch_id+task_id 均必填 string**） | reports.py:201-250；messages-create.schema.json:42-46 |
| 幂等键 | event_id/message_id 腿派生 | /reports/test=(execution_id, commit_sha)（端点内建，**duplicate=HTTP 409 RES-0003 非幂等返回**）；artifact/message 同 GPT-02 模式 | reports.py:208-216；errors.py:159-160 |
| 结论域映射 | result=BLOCKED 仅登记不推进 | 相同（BLOCKED 一律 artifacts+messages 留证，M1 保持 TEST_ACCEPTANCE——/reports/test 的 BLOCKED 分支调用层禁用） | charter §4 D5 终裁 |
| 白名单 | 6 实用端点+events 写入口 | **7 端点无 events**（新增 GET /api/v1/reports?type=test&task_id={task_id}——query 串入白名单模板，`{task_id}`→`[^/]+` 由 EngineM1Client 既有 sub() 编译；`?` 以 `\?` 字面量匹配） | charter A-1 定稿 |
| 事实来源 | 无（纯审核） | **execution_result 由腿从 F-003 测试报告证据读入**：GET artifact 记录（task 绑定+SHA）→读本地 artifact path 文件→SHA256 回核→解析 report JSON 的 execution_result/commit_sha/execution_id（三者与 CLI 绑定一致才采信） | charter A-2 D3/G2-04 终裁 |
| 15 组合矩阵 | 无 | A3 契约校验后强制执行：允许=(EXECUTED_PASS,PASS)(EXECUTED_PASS,REWORK)(EXECUTED_FAIL,REWORK)；禁止=(EXECUTED_FAIL,PASS)与(NOT_EXECUTED/CLAIMED_ONLY/BLOCKED, PASS/REWORK)→fail-closed 腿级 BLOCKED；reply=BLOCKED 任意事实→留证腿停 | charter §4 定稿 |
| 事件推进账本 | A5_EVENT_INTENT/409 双证 | 无事件——A4 内 POST /reports/test 后 GET task 回核终态（PASS→ACCEPTED/REWORK→REWORK）；"报告已登记而状态仍 TEST_ACCEPTANCE"=原子性异常→腿级 BLOCKED | charter A-3 定稿行 9 |
| 崩溃窗口恢复 | _recover_result_from_evidence（账本+report.json+M1 artifact 多重证据） | **GET /api/v1/reports?type=test&task_id= 五字段核实为权威恢复**（M1 查询即真相）：已登记+已推进=完成；已登记+未推进=原子异常腿停；未登记=按原键补提交；A4_MESSAGE 已登记而 /reports/test 未调=信封登记崩溃窗口→补 POST（先 GET 核实防 duplicate 误判） | charter A-3 定稿+G2-03 |
| CLI 绑定参数 | --input-material-commit/--material-file/--material-base-commit | 上述全部保留（验收材料指针）+新增 **--execution-id/--commit-sha/--test-report-artifact-id/--evidence-artifact-id(可重复)** | charter A-2 D3 显式绑定 |
| 身份/运行时 | GPT-02/ENGINE-02；runtime/arch-review-leg/arl-<key> | GPT-04/ENGINE-03；runtime/test-acceptance-leg/tal-<key>；EVT-TAL-<key>；report=test-acceptance-leg-report.json | charter §6/A-2 |
| 契约 | arch-review-report.schema.json | **test-acceptance-review.schema.json（新增文件）**：字段=contract_version/task_id/review_round_id/reviewer_agent_id(^GPT-04$)/engine_agent_id(^ENGINE-03$)/commit_sha(40hex)/execution_id(EXEC-\d{3,})/execution_result_observed(五值枚举，交叉核对字段)/result/summary/findings/required_boundaries | charter A-2 定稿 |
| marker | [GPT02-R1|key|task] | [GPT04-R1|key|task]（标记唯一锚点沿用） | L-018 第 4 条 |
| RunKeyLock | 有（问题14 P1-02 整改件） | 同构复制（Gate2 特别要求；review_leg 无锁不可照搬——GPT-04 以 arch_review_leg 为参考即含此件） | charter §3 |

## 2. /reports/test 请求体与响应事实（实现锚点）

- body=TestReportIn：task_id/execution_id(EXEC-\d{3,})/commit_sha(40hex)/execution_result(五值)/result(PASS/REWORK)/artifact_id(可选 ART-)/payload(dict)；另 _Ignore 基类容忍额外字段（schemas.py:181-188+48-52 区段实读）。
- PASS 门：result=PASS 而 execution_result≠EXECUTED_PASS→400（"claims are not evidence"）——腿矩阵在客户端先行拦截（双保险）。
- 事务：test_reports INSERT+apply_event 同事务原子；成功=201（路由 status_code=201，api.py:436）+transition 信息。
- duplicate：HTTP 409 code=RES-0003 DUPLICATE_MESSAGE（execution_id+commit_sha 已登记）。
- BLOCKED 提交分支：端点支持（details blocked_reason/blocked_owner/unblock_condition）——**腿调用层禁用**（D5）。
- GET /api/v1/reports?type=test&task_id=X（api.py:443+reports.py:284 list_reports）：条目含 execution_id/result/payload——恢复核实用（五字段：task_id/execution_id/commit_sha/result/execution_result；commit_sha 与 execution_result 在 payload 或行内字段，实现按实测响应解析，测试矩阵含替身负例）。

## 3. 恢复矩阵 12 行→实现映射（charter A-3 定稿）

| 行 | 实现落点（_resume_inner） |
|---|---|
| ACCEPTED/REWORK 已推进 | _resume_done（行 10） |
| M1 任务级 BLOCKED | fail-closed engine 不触碰（行 12 前半） |
| 账本与 M1 矛盾/未定义态 | fail-closed（行 12 后半） |
| TEST_ACCEPTANCE+无发送记录 | A0+A1→_continue_from_brief(allow_redispatch=False)（行 1） |
| 发送意图无确认 | fail-closed 腿级 BLOCKED（行 3，同 GPT-02 _resume_inner） |
| 已发送未采集 | _resume_collect（recoll 驱动派生三参数+归属校验；行 4） |
| 已采集未登记 | _resume_register（skip=账本核实项；行 5） |
| 提交结果不确定 | _verify_test_report_via_list（GET 五字段核对；行 6） |
| 已登记+已推进 | 接续完成不重提交（行 7；实际=状态已离 TEST_ACCEPTANCE） |
| 未登记+仍 TEST_ACCEPTANCE | GET 核实后才按原键补提交（行 8） |
| 已登记+仍 TEST_ACCEPTANCE | 原子异常→腿级 BLOCKED（行 9） |
| reply=BLOCKED | artifacts+messages 留证（run 内主路径+resume 补登记路径同处置；行 11） |

## 4. 风险清单

- ①GET /reports 响应字段形态（行内 vs payload 内 commit_sha/execution_result）以实测为准——替身测试覆盖两种形态，实现按"找到 (execution_id,commit_sha,result) 匹配项即登记"判定，五字段核对不依赖单一字段位置。
- ②TEST_ACCEPTANCE_SUBMITTED 任务级信封 batch_id 必填：A4 前 task.batch_id 缺失=fail-closed（同 GPT-02 batch 校验先例）。
- ③--new-session 指针覆盖缺陷（DEC-088 遗留③）仍在：GPT-04 零 mock 实战派单会话与审查主会话 6afb41ae 分离——实战简报派单后必须核对 gpt-reviewer-session.json 未被覆盖（实战记录项）。
- ④矩阵禁止组合的 fail-closed 在 A3（登记前）拦截，不依赖 M1 400 兜底（双保险层级：腿客户端矩阵→M1 PASS 门）。
- ⑤同构复制不触碰 review_leg.py/arch_review_leg.py——三腿回归用例数=58+新增。
