# 步骤清单：b-20261116-gpt02-arch-review-leg

## S1 设计（PASS）

- ①设计输入：charter v0.3（§3 架构边界/§4 状态流程/A-1 端点表/A-2 契约与简报/A-3 恢复矩阵）+review_leg.py 结构（1301 行：EngineM1Client/ReviewLedger/derive_recoll_driver/ReviewLeg 编排/setup_agents/main）。
- ②公共件抽取裁定（charter §3 决策点）：**最小参数化复用（方案 C+）**——EngineM1Client 白名单/事件白名单参数化（默认值=GPT-03 附录 B 常量，现行为零变化），ReviewLedger/derive_recoll_driver/utc_now_iso 直接 import 复用；arch_review_leg 自持 A0-A5 编排；review_leg.py 全文件唯一修改点=该参数化。
- ③执行结果：acceptance/design-notes.md（差异对照表/白名单口径/风险清单）。
- ④测试结果：不适用（设计步）。
- ⑤证据引用：acceptance/design-notes.md；回归门槛=29 用例（S2 后实测）。

## S2 实施（PASS）

- ①内容：review_leg.py EngineM1Client 参数化（check_event staticmethod→实例方法，默认参数=现行为）+arch_review_leg.py 新增（A0 前置核查/A1 简报四组输入+绑定字段+材料 manifest 锚定/A2 派单三态账本/A3 采集+归属校验+绑定注入+Ajv 冻结契约校验/A4 路线 B 登记 artifacts×2+messages ARCH_REVIEW_SUBMITTED/A5 事件推进 PASS→READY、REWORK→REWORK、BLOCKED 仅登记+A-3 九行 resume+attach-reply 人工退路+setup-agents/bootstrap）。
- ②红线核对：M1-M4 零修改（未触碰 app/）；scheduler.py 零修改；既有冻结契约零修改（arch-review-report.schema.json 为 Gate3 后新增落位，DEC-087）；1200B 口径（A1 硬限不截断）；敏感信息不入日志（令牌走 gitignored runtime）。
- ③执行结果：arch_review_leg.py（~890 行）+review_leg.py 参数化；实现期修正三处（a1 死代码清理/docstring 转义/attach 现场完整性——人工归档快照随 reply 复制）。
- ④测试结果：见 S3（合跑 50/50）。
- ⑤证据引用：phase1/tools/arch_review_leg.py；phase1/tools/review_leg.py（diff=参数化段）。

## S3 测试与实战（PASS——测试矩阵；零 mock 实战待验收链前执行）

- ①测试矩阵：test_arch_review_leg.py 21 用例（A1 正常轮 PASS→READY/A2 REWORK 停等/A3 采集失败恢复+禁重发计数/A4 幂等重放/A5 路线 B 续推+A-3 终态行/A6 attach 三态/A7 BLOCKED 仅登记+白名单越权负例+契约校验负例+简报超限+材料锚定 fail-closed+发送状态不确定 fail-closed+setup 幂等）；test_review_leg.py 29 用例回归（含 test_01 白名单断言适配实例方法调用，语义不变）。
- ②测试过程如实登记：首轮 7 失败→逐项定位修复（attach 绑定链自动组装/材料锚定测试意图修正/超限触发修正/A-3 终态断言口径/BLOCKED 事件契约字段 blocked_reason·blocked_owner·unblock_condition/attach 快照现场复制）→21/21；合跑 50/50（29 回归+21 新增）；首轮回归曾 1 次 fail（test_01 类调用适配期）与 1 次环境偶发（复跑两次均全绿，判定端口残留非代码缺陷，如实记录）。
- ③执行结果：双矩阵合跑 OK。
- ④测试结果：50 用例全绿 exit=0（`python -m unittest test_review_leg test_arch_review_leg`，2026-11-17 实测）。
- ⑤证据引用：phase1/tools/test_arch_review_leg.py；合跑输出随本任务 acceptance 归档。

## S4 交付（PENDING）

- ①交付登记+delivery 回填+ST-05 COMPLETED 态取证。
- ②执行结果：待完成。
- ③验收证据引用：待填。

## 返工记录表（首次 REJECT 时建表；按"同一问题"计数）

（暂无）
