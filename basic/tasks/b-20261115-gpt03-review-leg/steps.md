# steps：b-20261115-gpt03-review-leg

> 状态：**步骤清单已冻结**（2026-11-15；冻结依据=charter 定稿 v1.0，授权链见下）。任务等级 S3（平台代码类）；作业流程=Basic WORKFLOW v0.3；每步交独立验收（H9）；节点自主推进（L-020/WORKFLOW 增补②）；DEC-010 高危红线（合并 main/生产发布）仍须用户拍板。

## 冻结依据与授权链

| 项 | 内容 |
|---|---|
| 任务书定稿 | docs/phase1/GPT03-REVIEW-LEG-CHARTER-DRAFT.md **v1.0 定稿**（内容=v0.7 R3-01 修订 @d0c2d92ea88017397753d2072bb28407b7684956 零变更，仅定稿声明/版本记录行登记性增补） |
| Gate1 | 草案级降档验证 PASS（reply sha256=76000828115f892e3242033dd3aa22d33b56e13ea7116e426df11a8dd7620c41） |
| Gate2 | 会务立项评审定稿认可（Gate2-R4 reply sha256=5b492a7b7fb75b19e24844a3cb8bb5a481b4d6b0e3357b2d448fc49c9b153abb，无剩余修订；现场 dispatch-2026-11-15T13-26-45，会话 6af9b028） |
| Gate3 | 用户确认 §1 需求原文＋批准开工（2026-11-15 拍板，DEC-057） |
| 实施直接依据 | charter §4（状态与流程一期边界）/§7（验收矩阵 A1-A6）/附录 B（engine M1 白名单 8 端点 9 列）/附录 C（A5 账本八字段组+三断点快照+四证据规则）/附录 D（恢复矩阵 12 行+回滚 7 类+A7-A10）/附录 E（review report=结论权威） |
| 硬约束 | H1~H12（standard/development-plan.md §五）；M1-M4 代码零修改；契约 v1.0.0 冻结不修改（H2）；零 mock 红线（真实 chatgpt.com 审查收发，DEC-028 授权口径）；双分支纪律（开发分支+证据分支） |

## 架构归属登记（charter §3 决策点，采纳定稿推荐"前者"）

- **在 scheduler 编排框架内新增"审查阶段"编排步骤**：新文件 `phase1/tools/review_leg.py`，import 复用 scheduler.py 框架件（M1Client/证据三元组/幂等键/OrchestrationError 语义模式）；**scheduler.py 本体零修改**（保 T-P1-908 已验收代码不变，防回归）。
- 边界：M2 派单链（gpt_dispatch.mjs+inbound 采集+fail-closed 门禁）零修改复用；engine 运行期 M1 访问严格限附录 B 8 端点（events 限 GIT_VALIDATE/PASS/REWORK；无 ACK；approvals/BLOCKED/任务级阻塞禁入）；审查轮账本按附录 C 八字段组每阶段变化原子追加。

## S1 审查腿编排实现（含定稿冻结登记）

- ①本步骤目标：GPT-03 审查腿最小版全量实现——DEV_REPORTED 任务触发一次真实审查轮（charter §4 全流程）+附录 C 账本与断点恢复（--resume）+附录 B 白名单客户端+904 冻结契约校验+结论登记与推进；本步骤同步承载 charter 定稿与 steps.md 冻结的登记产物（被测对象含本冻结 commit）。
- ②修改文件：phase1/tools/review_leg.py（新增）、phase1/tools/test_review_leg.py（新增）、本任务包（steps.md 冻结/task-brief 状态）、docs/phase1/GPT03-REVIEW-LEG-CHARTER-DRAFT.md（定稿增补）、docs/phase1/decision-log.md（DEC-058）。
- ③修改内容（实现清单，逐项对 charter 条款）：
  - R0 前置只读核查：任务存在且状态=DEV_REPORTED、execution/artifacts（M4 commit+diff+测试报告）在位、GPT-03 agent 与 engine 服务身份在位（908 复用环境）。
  - R1 状态推进：GIT_VALIDATE 事件（DEV_REPORTED→GIT_VALIDATING，event_id 幂等）→只读 Git 校验→PASS 事件（GIT_VALIDATING→CODE_REVIEW）；附录 D 第 1-4 行（DEV_REPORTED/GIT_VALIDATING 断点恢复）落实。
  - R2 审查简报组装：diff/测试证据指针+commit SHA（长材料走 GitHub 指针，L-007），出站 ≤1200B 硬限（超限=失败停等人工，不截断不拆分）。
  - R3 真实派单：gpt_dispatch.mjs --new-session（M2 零修改复用；600s 超时 env 先例）；派单账本（附录 C ③④字段组：SEND_INTENT_RECORDED/SEND_CONFIRMED/发送前后 user unit 计数/快照 SHA）原子追加。
  - R4 回复采集+契约校验：reply.txt 字节+SHA256 核验→提取 JSON（```json 围栏/平衡对象先例，scheduler.extract_plan_json 同型）→Ajv 双校验（envelope message_type=CODE_REVIEW_SUBMITTED+payload，contracts/v1.0 真实 schema 本地 Ajv 2020 先例）→校验失败=保留原始 artifact、不登记成功结果、腿级 BLOCKED 停等人工（L-008 语义，禁改数据重放）。
  - R5 结论登记（附录 E 权威关系）：POST /artifacts（证据）+POST /messages（CODE_REVIEW_SUBMITTED 消息）+POST /reports/review（结论权威记录；幂等键=`<run 键>+review-round-1` 沿用 908 模式）；部分成功=逐项记录已成功 ID 与幂等键，恢复仅补缺项不整轮重做（附录 C 四证据规则④）。
  - R6 结论推进：PASS→TEST_ACCEPTANCE／REWORK→REWORK（CODE_REVIEW 合法出边，state_machine.py:35）；REWORK=登记后停等人工，不自动重开开发轮（§4 一期边界②）。
  - 账本与恢复：附录 C 八字段组每次阶段变化原子追加一条（防强制终止丢断点）；--resume 按三断点快照 S1（发送后未采集→禁重发走补采）/S2（已采集未登记→按原幂等键补登记）/S3（结果不确定→先只读核实 M1，无法确认→腿级 BLOCKED）允许动作处置；附录 D 12 行恢复矩阵逐行实现；四条证据规则落实（fail-closed 恢复决策；发送证明=三态+计数+原会话标识交叉，不只靠 SEND_STARTED=1）。
  - 异常处置：§5 五类错误表逐条实现（发送失败换会话重派限 1 次；采集 fail-closed 禁重发→补采；契约校验失败禁重放；平台腿故障=读取类可重试、业务副作用类无幂等确认禁自动重试、耗尽→腿级 BLOCKED；状态推进非法=停止不绕过）；**BLOCKED 语义区分**（腿级=run 层记录、M1 任务状态不动 vs M1 task.status=BLOCKED=仅 OWNER，engine 调用层禁止）。
- ④执行结果：review_leg.py（921 行：R0-R6 编排+附录 B 白名单客户端 fail-closed（越界端点/越界事件不发网络请求即拦截）+附录 C 八字段组账本 fsync 原子追加+三断点 resume（S1 补采派生/S2 补登记/S3 只读核实）+attach-reply 人工退路（同一契约+同一幂等键）+A8 账本断裂与账本/M1 矛盾双重 fail-closed+§5 行1/行2 发送失败与采集失败区分（现场目录新鲜度过滤防陈旧误判））+review_leg_recoll_template.mjs（188 行：归属校验三件套+七查+L-021 第 3 条视口拉高升级路径）+test_review_leg.py（660 行 18 用例：自带独立测试 M1 实例与 git 夹具，ChatGPT 边界唯一替身，其余全真实路径）。scheduler.py/M1-M4/M2 工具链零修改；契约文件只消费。**本次待验收 commit=512f9c5a7142e23678e5d1972050ee5674d605aa**（单 commit 申报，基线=c3a13e9fafc08b9a3d24b1a0ec70f71dd96effc8=steps 冻结 commit；numstat 机器值=review_leg.py 921/0+recoll 模板 188/0+测试 660/0 恰 3 新文件；ST-01 核验 PASS，记录=acceptance/review-request-s1.md）。
- ⑤测试结果：test_review_leg.py **18/18 PASS**（45.5s，自带测试 M1）：附录 B 白名单越界拦截/幂等标识确定性（message_id 模式合规且重启不漂移）/真实 M1 REST 全流程 PASS+REWORK 双结论（状态机推进 TEST_ACCEPTANCE/REWORK 各核实）/契约失败保留原始 artifact 不登记+任务状态不动/BLOCKED 结论拒登记（engine 禁借道任务级）/A4 重放零重复（409 幂等命中入账）/A7 事件同 id 单条/A8 账本断裂与账本-M1 矛盾 fail-closed（零重派）/A9 部分登记续跑（artifact ID 不变不覆盖）/简报 1200B 硬限不截断/diff SHA 交叉核验/终态 resume 零派单/BLOCKED 任务 engine 不触碰/setup-agents 409 复用/发送失败限一次重派。测试自身缺陷（git 方法绑定/subprocess 共享模块递归/契约 \$defs MissingRef/现场目录陈旧误判/A8 矛盾前置缺失）5 类全部修复闭环。
- ⑥验收证据引用：**S1-R1=dispatch-2026-11-15T14-46-19（新专用会话 6af9c5f3，reply 10382B sha256=21df8c7e031a55faebb5170e1df2f83d15c07916a31ef714a1f2004098e7a4ce）=REJECT 6 项**（P1-01 409 幂等命中判定过宽/P1-02 部分登记恢复重复执行全量/P1-03 采集失败记录无法进入补采/P2-01 账本八字段组不完整/P2-02 A9 替身越界 M1 客户端/P2-03 A8 双重故障测试不充分；认可项=三文件架构/白名单边界/R0-R6 主流程/状态映射/BLOCKED 区分/登记权威/范围零修改）→ 整改 commit=**6cf9147e6f49d2f43ef2e0b37753b3ca5e351402**（基线=4c888334db9f2a5b38d46f86a531ec7d87af8749，ST-01 PASS，numstat=review_leg.py 227/57+test 93/38）→ **S1-R2 限定复验=待验收 6cf9147e6f49d2f43ef2e0b37753b3ca5e351402**（回填 commit 不属验收 diff 范围，ST-01④）。

## 返工记录表（S1-R1 首次 REJECT 建表）

| 问题编号 | 轮次来源 | 问题描述 | 整改内容 | 修复 commit | 验证 |
|---|---|---|---|---|---|
| 问题1 | S1-R1 REJECT P1-01（reply sha256=21df8c7e…a4ce） | 409 幂等命中判定过宽：仅凭响应含 code/detail/message/error 任意字段即判 IDEMPOTENT_HIT，未核对键指认与内容指纹，普通冲突可被误判为成功登记 | _register_step 409 双证核验=①响应须指认本次幂等键（key_evidence：message_id/execution_id+commit 前缀）②账本须有同请求指纹（request_sha）记录；两证缺一 fail-closed。artifact 无 409 命中路径（M1 语义：路径+SHA 同=201 duplicate:true 返回原记录；SHA 异=409 真冲突直接 BLOCKED） | 6cf9147e6f49d2f43ef2e0b37753b3ca5e351402 | test_06（A4 重放=双证命中+计数不变）、test_05/05b 契约/BLOCKED 拒登记链复跑 PASS |
| 问题2 | S1-R1 REJECT P1-02（同上） | 部分登记恢复直接重跑全量 r5_register，未落实附录 C④/D"逐项只读核实、成功项保留原 ID、只补缺项" | 新增 _ledger_verified：artifact=白名单 GET 实读回核（task+sha256 强证据）；message/report=账本指纹链（确定性键+reply_sha+execution_id+request_sha 一致）；r5_register(skip=) 跳过已核实项（R5_SKIP_VERIFIED 入账），仅 POST 缺失项 | 6cf9147e6f49d2f43ef2e0b37753b3ca5e351402 | test_09（部分登记续跑：artifact ID 不变+R5_SKIP_VERIFIED 断言+零重派）PASS |
| 问题3 | S1-R1 REJECT P1-03（同上） | R3_SEND_CONFIRMED_COLLECT_FAILED 未存会话证据（conversation_uuid/sent_user_unit_key）且 resume 不识别，发送成功采集失败无法自动补采 | 采集失败分支解析现场 result.json 落账会话证据；resume 发送锚点=SEND_CONFIRMED 或 SEND_CONFIRMED_COLLECT_FAILED，统一走原会话补采（禁重发） | 6cf9147e6f49d2f43ef2e0b37753b3ca5e351402 | 代码路径整合+test_15 发送失败分类复跑；补采端到端实测归 S2（A3/A5①） |
| 问题4 | S1-R1 REJECT P2-01（同上） | 账本八字段组不完整（会话创建/profile/归属校验/发送前后 unit 快照/请求响应对应关系缺失；assistant_unit_count 不能替代 user unit 计数） | R3 记录补 review_round/idempotency_key/conversation_created_at/profile/session_role/ownership_check/next_user_unit_key/unit_keys/assistant_uuid/send_state；R4 补 marker_text/located_user_unit_key/marker_hit_count/last_user_assert/snapshot(unit_count/unit_keys/assistant_uuid/stability/checks/snapshot_sha256)/extracted_at；R5 补 request_sha+response_sha 对（登记请求响应完整对应）；R0 补轮次/幂等键标识 | 6cf9147e6f49d2f43ef2e0b37753b3ca5e351402 | 全部记录入账（test_12 账本原子性+全流程账本链断言）；恢复决策消费补强证据 |
| 问题5 | S1-R1 REJECT P2-02（同上） | A9 测试越界替换 leg.engine.post（M1 客户端被替身绕过，与"仅 ChatGPT 边界替身"申报不符） | 改服务端故障注入：测试 DB 建触发器使 messages INSERT ABORT→M1 返 500（存储层故障），客户端走完整真实 REST（零替换、零 monkeypatch） | 6cf9147e6f49d2f43ef2e0b37753b3ca5e351402 | test_09 重写（服务端 500→腿级 BLOCKED→解除故障→resume 补登记）PASS |
| 问题6 | S1-R1 REJECT P2-03（同上） | A8 双重故障测试不充分：未分别证明"已发送账本断裂仅剩 INTENT"与"账本/M1 矛盾"两场景均零二次发送+腿级 BLOCKED | test_08a（发送成立→账本截断仅剩 INTENT→resume 禁重发 BLOCKED→账本修复续跑只补登记零发送）+test_08b（账本痕迹 vs M1=DEV_REPORTED 矛盾态→fail-closed）；resume/attach 与 run 同型自捕获腿级 BLOCKED 入账 | 6cf9147e6f49d2f43ef2e0b37753b3ca5e351402 | test_08a/08b PASS（19 用例全绿，42.8s） |

## S2 注入类验收矩阵执行（A2/A3/A4/A5/A7/A8/A9/A10）

- ①本步骤目标：按 charter §7+附录 D 执行注入类用例并归档证据（真实派单类 A1/A6 留 S3）。
- ②注入与预期（逐项对应 §7 表与附录 D A7-A10 行）：
  - A3 采集 fail-closed 注入：**注入点=采集层只读构造**（强制小视口 reload 触发虚拟化窗口，使采集报 INBOUND_WINDOW_COMPLETENESS_UNPROVEN；不改工具代码）→证明禁重发（dispatch 账本仅一次 SEND_STARTED+会话内 user unit 计数与发送后快照一致）→按 §5 补采恢复或腿级 BLOCKED；出现第二次发送=FAIL。
  - A4 幂等重放：A1 完成后重放同一登记请求原文（artifacts+messages+事件，幂等键=review-round-1）→M1 无重复登记+无新外部副作用（dispatch 目录数不增+会话 user unit 数不变）。
  - A5 两类断点：①已发送未采集（reply 未落盘时终止进程）→恢复走禁重发+补采路径；②已采集未登记（reply 已落盘、M1 登记未完成时终止）→仅补登记，不重新触发 GPT-03（L-008 语义）。
  - A7 状态推进响应丢失：提交合法事件后进程终止→重启只读核实 M1 事件与状态接续；task_events 同 event_id 仅一条（换 event_id 重发/凭本地日志推断=FAIL）。
  - A8 发送成功后账本写入失败：注入删除/截断发送后账本记录（仅留 INTENT）→不因账本缺记录而重发；无法证明发送状态→停止并腿级 BLOCKED。
  - A9 部分登记成功：注入 artifact 登记成功、message 或 review report 失败→重启仅补失败项；成功项 ID 不变、内容不被覆盖（整轮重做/换幂等键=FAIL）。
  - A2 REWORK 路径：审查结论=返工→任务状态=REWORK，仅登记+停等人工，不自动重开开发轮。
  - A10 REWORK 后重启观察：engine 不自动开启下一轮 GPT-03 审查或开发任务（新审查轮或新派单=FAIL）。
- ③执行结果：（实施时回填）④测试结果：（实施时回填）⑤⑥验收证据引用：（实施时回填；S2-R2 独立验收派单）

## S3 真实端到端验收（A1+A6，零 mock）

- ①本步骤目标：真实闭环——A1 正常审查轮（真实 chatgpt.com GPT-03 派单收发+冻结契约校验+M1 登记+结论推进）与 A6 人工退路演练；双分支证据归档（开发分支+证据分支）。
- ②场景与对象：DEV_REPORTED 真实任务（908 DB 复用：T-P1-017/T-P1-018 实存 DEV_REPORTED，开工侦察已核实；或按需经既有 bootstrap 先例新造）；A1 预期状态路径逐步核实=DEV_REPORTED→GIT_VALIDATING（GIT_VALIDATE）→CODE_REVIEW（PASS）→审查派单采集→结论登记→PASS→TEST_ACCEPTANCE／REWORK→REWORK；必留证据=dispatch 目录+reply SHA+M1 事件序列（task_events）+契约校验输出。A6=腿级 BLOCKED 现场下人工经既有派单链完成审查并按**同一契约校验+同一幂等键**登记；判定=artifacts+messages+事件三项登记齐+状态推进与自动路径一致。
- ③执行结果：（实施时回填）④⑤（实施时回填）⑥验收证据引用：（实施时回填；S3-R3 独立验收派单）

## S4 交付登记与完工确认

- ①本步骤目标：delivery.md（按 docs/phase1/handoff-template.md）+decision-log 登记+完工六查+申报（ST-01 绑定核验：git diff --numstat 机器值入申报；ST-05 自检通过后派单）。
- ②修改文件：本任务包 delivery.md/steps.md⑥ 回填、docs/phase1/decision-log.md、任务包状态字段。
- ③执行结果：（实施时回填）④⑤⑥（实施时回填；S4-R4 交付确认派单）

## 纪律条款（全步骤有效）

- 每步派单验收前：ST-05 自检（`python -I basic/tool/check_taskpack.py basic/tasks/b-20261115-gpt03-review-leg`）+ST-01 绑定核验（`toolkit/check-binding.py`，numstat 机器值入申报，被测 commit 完整 SHA 明文登记）；push 一律 `toolkit/check-push.mjs`。
- 派单异常按 L-018：采集 fail-closed 禁重发→三步诊断→归属校验型静态 DOM 补采（驱动派生核对三参数+CONV_UUID 当前值读 gpt-reviewer-session.json 交叉核对）；审查会话主动迁移评估（L-018 第 6 条，不等 CONTEXT_LIMIT_STOP）。
- 返工记录表：首次 REJECT 时建表（ST-05 口径：无 REJECT 历史不建表）。
- 每节点完成与启动登记 decision-log（H10）；长锚点 replace 后断言命中（L-021 第 2 条）；申报统计一律 numstat 机器口径（L-021 第 1 条）。
