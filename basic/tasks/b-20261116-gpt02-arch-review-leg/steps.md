# 步骤清单：b-20261116-gpt02-arch-review-leg

## S1 设计（IN_PROGRESS）

- ①设计输入：charter v0.3（§3 架构边界/§4 状态流程/A-1 端点表/A-2 契约与简报/A-3 恢复矩阵）+review_leg.py 结构（1301 行：EngineM1Client/ReviewLedger/derive_recoll_driver/ReviewLeg 编排/setup_agents/main）。
- ②公共件抽取决策（charter §3 决策点，推荐方向已认可）：识别真正共享底层件（M1 客户端/账本/补采驱动派生/恢复协议骨架）与新腿编排差异（结论域/事件白名单/简报组装/契约校验），产出设计记录（落 acceptance/design-notes.md）；约束=review_leg.py 29 用例回归全绿、GPT-03 行为零变化。
- ③执行结果：待 S1 完成。
- ④测试结果：不适用（设计步）。
- ⑤证据引用：待填。

## S2 实施（PENDING）

- ①内容：公共件抽取（如设计裁定）+arch_review_leg.py（ENGINE-02 白名单客户端/账本/简报组装四组输入+绑定字段/结论契约校验/登记与事件推进/BLOCKED 腿级停止/A-3 恢复协议）。
- ②红线：M1-M4 零修改；scheduler.py 零修改；既有冻结契约零修改；1200B 口径；敏感信息不入日志不入 Git。
- ③执行结果：待完成。
- ④测试结果：待完成。
- ⑤证据引用：待填。

## S3 测试与实战（PENDING）

- ①测试矩阵：arch_review_leg 新增用例（A1~A7 映射+白名单越权负例+契约校验负例+fail-closed 注入+幂等重放）；review_leg.py 29 用例回归。
- ②实战（零 mock）：真实 chatgpt.com 架构审核收发全链（按 GPT-03 S 期实战模式，现场归档）。
- ③执行结果：待完成。
- ④测试结果：待完成。
- ⑤证据引用：待填。

## S4 交付（PENDING）

- ①交付登记+delivery 回填+ST-05 COMPLETED 态取证。
- ②执行结果：待完成。
- ③验收证据引用：待填。

## 返工记录表（首次 REJECT 时建表；按"同一问题"计数）

（暂无）
