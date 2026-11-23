# AIEO 项目执行纪律（用户 2026-11-15 两次明确批评"没遵守开发经验"后固化）

> **适用范围（ChatGPT 复核意见修正，reply sha256=21d3150d…）：** 本文件由 ZCode 执行会话自动加载（工作区约定，随会话注入）；**ChatGPT 网页审查会话不会自动读取本文件**——对审查方需知悉的纪律靠派单简报明文携带，不假定其已读。

## 异常处置第一动作（最高优先级，违反=流程事故）

**遇到任何异常——连接故障、派单采集 fail-closed、CONTEXT_LIMIT_STOP、断言失败、工具报错、裁定 REJECT——第一动作＝查开发经验库，禁止凭当下判断直接处理：**

1. `docs/AI-DEV-LESSONS.md`——先 grep 关键词（代理/proxy/采集/fail-closed/CONTEXT_LIMIT/断言/绑定/止损）定位对应 L-xxx 条目；
2. `phase0/environment-inventory.md` §4/§5——本机网络与代理拓扑实况；
3. 对应条目的「有效经验」逐条执行；「验证结果」段有实测先例可对照。

**已固化的第一动作映射：**

| 异常 | 第一动作 | 依据 |
|---|---|---|
| GitHub push 连不上 | `node toolkit/check-push.mjs --push --yes`（禁止手工猜端口/unset 配置绕行） | L-014 第 6 条 |
| 派单采集 fail-closed | 禁重发→三步诊断→静态 DOM 补采；recoll 派生后必须 **grep 三参数行**（CONV_UUID+SENT_USER_UNIT_KEY+FAILED_DIR）核对，**换会话时 CONV_UUID 必换** | L-018 第 1/2/3 条 |
| 补采定位 | 归属校验三件套：简报标记文本唯一定位+最后 user 断言+前轮 reply SHA 排除（定位成功≠归属正确） | L-018 第 4 条 |
| 审查会话上下文上限 | **主动迁移**：累计达 **4 条 user 消息**即主动评估迁移（评估非强制，暂不迁须记录理由并每增 2 条重评；不等 CONTEXT_LIMIT_STOP 坏死）；迁移简报 ≤1200B 自包含，`--new-session` 首派即活 | L-018 第 6 条+手册 §5 |
| 派单/申报前 | ST-05 检查器自检：每步派单验收前运行并处理缺口；ST-01 绑定申报：被测 commit 完整 SHA 明文登记，申报前完成绑定核验 | WORKFLOW 模块三 ST-05；模块四 ST-01 |
| 检查项数演进 | 测试断言同步+申报引用从最终归档取值并锁定被测 commit | L-017 |
| 同问题返工近止损线 | 停止整改循环→三方会商→交用户（四级阶梯+挂起并行条款） | L-019+WORKFLOW 模块五 |

## 节点自主推进授权（用户 2026-11-15 两次指令固化，初级版完成前有效）

**完成一个节点后自行启动下一节点，稳步推进，不等用户逐项拍板**（用户原话："各个节点请你稳步推进，按照之前我们的开发经验和方案，不用等我决策各个节点……如有问题我会手动介入的"）：规划协商（ChatGPT 复审）照常执行，方案以"ChatGPT 复审通过+节点授权"登记依据；**DEC-010 高危红线（main 合并/生产发布/数据删除）仍须用户本人拍板**；每节点完成与启动登记 decision-log；用户会手动介入例外。

## 开工惯例

- 每任务开工：读交接包/上一任务 delivery 的「后续建议」+ AI-DEV-LESSONS.md 相关条目（开工指令点名的条目逐字读完）；
- push 一律走 `toolkit/check-push.mjs`；派单流程照 `chatgpt-web-dispatch` skill（含手册 EGO-LITE-HANDBOOK.md）；
- 仓库当前审查会话 UUID 在 `phase0/logs/gpt-reviewer-session.json`。

## 标准版 ZCode 任务池

标准版任务由主 ZCode 会话按 [PLAYWRIGHT-QUEUE-WORKFLOW.md](standard/PLAYWRIGHT-QUEUE-WORKFLOW.md) 管理。启用队列的任务统一通过同一服务工作区提交和查询 ChatGPT 派单。后台 worker 独占专属浏览器实例，子 Agent 不直接调用网页派单工具。
