# S2 验收请求：b-20261115-gpt03-review-leg（注入类验收矩阵执行）

## 绑定申报（ST-01，机器预检已过）

- **验收基线：** `39d6741`（S1-R5 申报回填 HEAD，完整 SHA 见 steps.md ⑥）
- **待验收区间：** 4 commit 至 **6d39ff97ead78bf56b457f2198b9089f81c32295**（ST-01 PASS 区间=4：3131a29 S1 PASS 登记/c199cf4 pointer 模式/73a4a02 A5 材料/6d39ff9 A6 适配）
- **numstat 机器值：** s2-a3 材料 38/0+s2-a5 材料 38/0+steps.md 1/1+task-brief 1/1+decision-log 8/0+review_leg.py 55/18
- **本请求所在回填 commit 不属验收 diff 范围**（ST-01④）

## 核心事实：三任务真实落档（零 mock，真实 chatgpt.com）

| 任务 | 审查轮 | 真实结论 | M1 真实推进 | 关键证据 |
|---|---|---|---|---|
| T-P1-017 | 918003（新 GPT-03 会话 6af9d76e） | **REWORK**（--version/--help 优先级 P2 问题） | DEV_REPORTED→…→CODE_REVIEW→**REWORK** | reply 946B sha256=498cbcff…；report EXEC-009@6faa2f00…；账本 14 条 |
| T-P1-018 | 918005（A5① 断点后恢复轮） | **PASS** | …→**TEST_ACCEPTANCE** | reply 330B sha256=e2cc1d54…；ART-REV-002/MSG-87009714-319990 |
| T-P1-022 | 918007（A6 人工链） | **PASS** | …→**TEST_ACCEPTANCE** | reply 342B sha256=eb8ec9df…；attach 三项登记齐 |

## 验收矩阵执行对照（charter §7+附录 D）

- **A2 真实达成**：T-P1-017 REWORK→REWORK 停等（无自动重开；A10 resume→RESUME_DONE 零新派单）。
- **A3**：天然现场三组（R2/R3/R5 派单 fail-closed 同错误码→禁重发→归属校验补采七查过→键身份前后一致）+注入构造双形态（probe v1 虚拟化拦截/v2 守卫触发；如实登记：特定错误码短会话小视口未完全等价复现）。
- **A4 真实重放**：918003 同请求原文重放→409 双证命中×2→计数 1/1/1 不变、零新派单目录。
- **A5①+A8 真实现场**：918005 进程终止于发送前（账本仅 INTENT）→resume fail-closed BLOCKED（resend forbidden）→人工核查（无发送证据）→MANUAL_LEDGER_REPAIR（备份保留）→resume 恢复→真实派单一次→闭环推进。
- **A5②**：等价证据（测试 08a 恢复段+A4 重放同构语义；独立现场未构造，两审查轮已自然推进，如实登记）。
- **A6 真实演练**：T-P1-022 腿级停止（M1=CODE_REVIEW）→人工链发送同一简报→attach-reply 同一契约+同一幂等键登记→推进与自动路径一致；键交叉显式 not_applicable。
- **A7/A9**：测试矩阵证据（独立测试 M1=真实服务器软件+专用 DB）。

## 请验收方执行（验收六查）

①S2 目标符合性（注入矩阵逐项执行/等价项如实登记）；②charter §7/附录 D 对照（A2/A3/A4/A5①②/A6/A7/A8/A9/A10 逐项判定）；③修改范围（区间 4 commit，review_leg.py 55/18 为仅代码变更）；④真实性审查（三任务 M1 落档可查、账本/dispatch/材料 SHA 链完整、零 mock 声明真实性）；⑤A5② 等价证据充分性裁断；⑥证据可核查（GitHub 直读指定 SHA+steps.md ⑥ 现场清单）。

**回执格式：** 六查逐项+矩阵逐项判定+总结论（PASS/REJECT+问题编号）。
