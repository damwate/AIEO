# S1 验收请求：b-20261115-gpt03-review-leg（GPT-03 审查腿编排实现）

## 绑定申报（ST-01，机器预检已过）

- **验收基线：** `c3a13e9fafc08b9a3d24b1a0ec70f71dd96effc8`（charter 定稿 v1.0+steps.md 冻结+DEC-058 commit）
- **待验收 commit（单 commit 申报）：** `512f9c5a7142e23678e5d1972050ee5674d605aa`
- **绑定核验：** ST-01 verdict=PASS；R1 区间数申报=1 实际=1；R2 线性链首 parent=基线；R4 待验收 commit 无后代；numstat=review_leg.py 921/0＋review_leg_recoll_template.mjs 188/0＋test_review_leg.py 660/0（恰 3 新增文件，零删除）
- **本请求所在回填 commit 不属验收 diff 范围**（ST-01 ④声明：steps.md 回填+本请求文件）

## 被测对象与冻结依据

- 任务书：docs/phase1/GPT03-REVIEW-LEG-CHARTER-DRAFT.md **v1.0 定稿**（内容=v0.7 R3-01 修订 @d0c2d92ea88017397753d2072bb28407b7684956 零变更；Gate2-R4 定稿认可 reply sha256=5b492a7b…153abb；Gate3 用户拍板 DEC-057）
- 步骤清单冻结：basic/tasks/b-20261115-gpt03-review-leg/steps.md（随基线 commit c3a13e9 入库）
- 本步骤=steps.md **S1 审查腿编排实现**；架构归属=charter §3 定稿推荐"前者"（scheduler 编排框架内新增审查阶段编排：review_leg.py 复用框架件，scheduler.py 本体零修改）

## 交付物（diff=恰 3 新文件）

| 文件 | 行数 | 内容 |
|---|---|---|
| phase1/tools/review_leg.py | 921 | R0-R6 单轮审查编排：R0 只读核查（任务状态/execution/diff artifact SHA 交叉）；R1 GIT_VALIDATE→只读 Git 校验→PASS（event_id 确定性幂等）；R2 简报 ≤1200B 硬限（标记文本+diff 内联）；R3 gpt_dispatch --new-session（M2 零修改；发送失败 vs 采集失败按现场证据区分）；R4 reply SHA 核验+JSON 提取+Ajv 2020 双校验（message-envelope+messages-create $defs/request，冻结契约只消费）；R5 artifacts→messages→reports/review 三步登记（附录 E 权威关系；409=幂等命中核验语义；部分成功逐项记账）；R6 只读核实终态。附录 C 八字段组账本 fsync 原子追加；--resume 按附录 D 12 行矩阵+三断点快照（A8 账本断裂/账本-M1 矛盾双重 fail-closed 禁推测恢复）；attach-reply=A6 人工退路（同一契约+同一幂等键）；engine 白名单客户端越界即拒（8 端点+事件值 GIT_VALIDATE/PASS/REWORK，BLOCKED/CANCEL 调用层禁止） |
| phase1/tools/review_leg_recoll_template.mjs | 188 | 补采驱动模板（参数化派生；L-018 三参数+归属校验三件套+七查；L-021 第 3 条视口拉高 1920×20000 升级路径；仅采集不发送） |
| phase1/tools/test_review_leg.py | 660 | 18 用例正反例矩阵（unittest；自带独立测试 M1 实例=临时 DB/端口，908 DB 零接触；ChatGPT 边界唯一替身=仅 gpt_dispatch 调用替换，git/Ajv/REST/状态机/账本全真实路径） |

## 验收标准（steps.md S1①/③ 冻结清单逐项）

1. charter §4 全流程实现（DEV_REPORTED→GIT_VALIDATING→CODE_REVIEW→派单采集→结论登记→PASS→TEST_ACCEPTANCE／REWORK→REWORK）
2. 附录 B：engine 运行期 M1 访问严格限 8 端点白名单（events 限 GIT_VALIDATE/PASS；ACK/approvals/任务级 BLOCKED 禁入；越界 fail-closed 拒发）
3. 附录 C：账本八字段组逐阶段原子追加；三断点快照处置；四证据规则（发送证明交叉、fail-closed 恢复决策、部分成功可续）
4. 附录 D：12 行恢复矩阵+回滚语义（不回退 M1 状态）+腿级 BLOCKED 与 M1 任务级 BLOCKED 严格区分（engine 禁推进任务级）
5. 附录 E：review report=结论权威；artifacts/messages=证据链
6. §5 五类异常处置表逐条；§4 一期边界（一次审查轮/REWORK 停等不自动重开）
7. H1~H12：M1-M4 代码零修改（diff 佐证）；契约 v1.0.0 冻结不修改；scheduler.py 本体零修改

## 测试证据（test_review_leg.py，本 commit 内 18/18 PASS）

白名单越界拦截/幂等标识确定性/真实 M1 REST 全流程 PASS+REWORK 双结论推进核实/契约失败保留原始 artifact 不登记/BLOCKED 结论拒登记/A4 重放零重复/A7 事件同 id 单条/A8 账本断裂与账本-M1 矛盾 fail-closed 零重派/A9 部分登记续跑 artifact ID 不变/简报 1200B 硬限/diff SHA 交叉核验/终态 resume 零派单/BLOCKED 任务 engine 不触碰/setup-agents 409 复用/发送失败限一次重派。

## 本步骤边界声明

- 真实 chatgpt.com 派单收发（A1/A3/A5①/A6）按冻结序归 S2/S3；本步骤测试中 ChatGPT 边界为唯一替身（其余全真实），零 mock 红线在 S2/S3 实测中满足。
- GPT-03 agent 与 ENGINE-01 服务身份=setup-agents 一次性 OWNER 引导（908 bootstrap 先例同型），engine 运行期严格走附录 B 白名单（Bearer 服务身份）。
- 未触碰：契约文件/M1-M4 代码/scheduler.py/Basic 资产/phase0 工具链。

## 请验收方执行（验收六查）

①是否符合 S1 目标（编排实现+测试矩阵）②是否符合 charter v1.0 §4/§5/附录 B-E 冻结要求③修改是否超范围（diff=3 新文件，M1-M4/scheduler.py 零改动）④代码质量与内部一致性（账本/白名单/幂等键/状态映射无冲突，引用路径实存）⑤"测试"=18 用例矩阵真实性审查（替身边界是否仅 ChatGPT；断言是否逐项对应冻结条款）⑥证据可核查（GitHub 直读指定 commit）。

**回执格式：** 六查逐项结论＋验收标准 1-7 逐项判定＋总结论（PASS/REJECT＋问题编号）。
