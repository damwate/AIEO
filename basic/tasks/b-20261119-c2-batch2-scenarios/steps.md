# 步骤清单（b-20261119-c2-batch2-scenarios）

**方案状态：** v0.3 已冻结（R3 终局拍板 PASS，2026-11-19；拍板依据=用户委托 ChatGPT 渠道）——S3 执行授权 GO

**方案轮次与冻结依据：**

| 轮 | 结论 | 修订 | 复核 |
|---|---|---|---|
| R1（v0.1→v0.2） | ADJUST（reply baef39e5…11496B，dispatch-2026-11-18T18-53-11） | ④拆④-A/④-B/④-C核验门/④-D提案+①两道独立判断+⑤事务级+逐项一轮+即停具体化→v0.2（f5c6c8c） | R2 PASS |
| R2（v0.2→v0.3） | **PASS**（reply 820ca44b…7395B，采集 fail-closed→L-018 补采七查全过，现场 recoll-c2batch2-r2-2026-11-18T19-04-54-726Z） | 冻结前五项文字性补充（①备用触发条件/④-D1网络耗尽+④-D2 HTTP耗尽本机受控端点禁外注/退避墙钟实测区间/契约SHA绑定/④-C不参与整体）→v0.3（5599cc7） | R3 PASS 终局 |
| R3（终局拍板） | **PASS**（reply 552a463a…4981B，采集 fail-closed→同法补采七查全过，现场 recoll-c2batch2-r3-2026-11-18T19-09-41-988Z；三件套 blob SHA 直读复核 task-brief d67ec2e5…/requirement 77ff9242…/steps fa556427…） | 批准④-D独立新增/接受④-C BLOCKED_IMPLEMENTATION_OUT_OF_SCOPE/**批准冻结v0.3+S3执行授权GO** | （终局） |

**验收轮次（ST-02 口径）：** R1/R2/R3 各计 1 轮（R2/R3 发送成功采集 fail-closed，补采取得结论计轮）；方案共识问题 R1 计 1 轮 REWORK，未触三轮止损线。**S3 执行顺序（R3 冻结）：①→④-A→④-B→④-D1→④-D2→⑤，逐项独立派单/独立 SHA/独立证据目录/独立结论；GO≠DEC-017 解除（逐项签核）。**

## S1 开工登记

①本步骤目标：建立任务包三件套，登记依据链（DEC-107/batch1 后续建议/AGENTS.md 节点授权）与四项场景草案、边界红线。

②修改文件：basic/tasks/b-20261119-c2-batch2-scenarios/{requirement.md,task-brief.md,steps.md}。

③修改内容：登记用户原话（"请你继续推进标准版开发"）、执行者理解（①④⑤受控验证+⑥并入多任务门）、四项场景草案、落点登记、边界红线、状态表。

④执行结果：任务包建妥；ST-05 自检首轮 FAIL 两处格式缺口（task-brief 缺「当前状态」状态表行+steps 缺 `## S<n>` 小节），按 aisvc 金标准格式修正后复检。

⑤测试结果：python -I basic/tool/check_taskpack.py basic/tasks/b-20261119-c2-batch2-scenarios —— 复检 Overall=IN_PROGRESS（Phase=PLANNING，①需求记录 PASS/②步骤清单 PASS，③-⑥ N/A 未到期，PLANNING 期合法态，退出码语义符合工具头部约定）。

⑥验收证据引用：本任务包 commit SHA（推送后登记于规划协商派单简报，避免 batch1 R1"证据未推送即派单"缺陷复现）。

**验收结论：PASS**（开工登记完成；独立验收=S2 规划协商链）

## S2 规划协商（ChatGPT 复审→共识→用户拍板→冻结）

①本步骤目标：方案草案经 ChatGPT 逐项复审（R1-Rn）至共识，报用户拍板后冻结场景执行方案与 steps 细化。

②修改文件：task-brief.md（R1 后修订为冻结候选 v0.2）、steps.md、简报 phase0/tools/brief_c2batch2_plan_r1.txt（1093B）。

③修改内容：R1 裁定 ADJUST 后按裁定逐项修订——④拆④-A/④-B/④-C/④-D 四层验收对象、①两道独立判断+次数上限、⑤五断言+事务级 fail-closed、轮次改逐项一轮、即停线具体化+四操作约束、五件套留证清单、DEC-017 逐项解除规则。

④执行结果：R1 完成=**ADJUST**（已认可①⑤⑥方向与逐项解除原则；冻结前须修改五项=④层次区分/④-C 实现入口核验条件/④-A④-B 独立验收条件/轮次逐项一轮/网络恢复与会话归属清理检查——已全部落进 v0.2 修订）。会话迁移已执行：旧审查会话 6afde23c（F3 三轮）换题迁出，指针备份 gpt-reviewer-session.pre-c2batch2.json，新会话 6afdf44d-8d54-83ec-9fca-1bbde1ba1654 `--new-session` 首派即活。中断首跑现场 dispatch-2026-11-18T18-51-36（发送前中止未发送，原位如实归档）。④-C 核验门已完成：AIEO 仓零梯子实现（grep 证据），git_pointer.mjs:374-417 有契约退避真实现→④-D 新增提案。

⑤测试结果：ST-05 自检 PLANNING 合法态（①② PASS）；v0.2 修订后复检=IN_PROGRESS 合法态；v0.3 修订后复检见提交前记录。

⑥验收证据引用：R1 dispatch=phase0/logs/dispatch-2026-11-18T18-53-11，reply SHA256=baef39e5d077307cde33a04c405e99fa0a1df0c111c8c5111049b1f15d778275（11496B，**ADJUST**）。R2 dispatch=phase0/logs/dispatch-2026-11-18T19-01-01（发送双验通过后采集 fail-closed=INBOUND_WINDOW_COMPLETENESS_UNPROVEN，禁重发，浏览器现场保留）→按 L-018 静态 DOM 补采：驱动 recoll_c2batch2_r2.mjs（派生自 recoll_f2f3f4_final.mjs，三参数+前轮 SHA 全换，grep 核对），现场 recoll-c2batch2-r2-2026-11-18T19-04-54-726Z 七查全过（marked_user_unique/last_user_assertion/adjacent_assistant_tail/stable_static_dom_read/final_stop_button_not_visible/not_prev_reply_sha/response_length_plausible 全 true），reply SHA256=820ca44b3bea3dda…（7395B，**PASS**，④-D 附条件纳入拆 D1/D2+冻结前五项文字性补充）。审查会话 6afdf44d；R3 终局拍板待派（用户委托 ChatGPT 渠道）。

## S3 受控场景执行（①④⑤ 逐项）

①本步骤目标：按冻结方案逐项执行受控场景，逐项留证（五件套），逐项形成 PASS/REWORK/BLOCKED 预结论。

②修改文件：以冻结方案为准（预期仅 phase0/logs/ 现场与临时产物）。

③修改内容：待方案冻结后细化。

④执行结果：未开工。

⑤测试结果：未测（未开工）。

⑥验收证据引用：待登记。

## S4 独立验收派单（审查腿）

①本步骤目标：证据包推送后派 ChatGPT 直读复核，逐项签核。

②修改文件：无（证据 commit+派单）。

③修改内容：待 S3 后细化。

④执行结果：未开工。

⑤测试结果：未测（未开工）。

⑥验收证据引用：待登记。

## S5 交付收口（delivery.md）

①本步骤目标：七要素完工总结+DEC 登记+逐项解除建议提交用户。

②修改文件：delivery.md、docs/phase1/decision-log.md（新 DEC 条目）。

③修改内容：待 S4 后细化。

④执行结果：未开工。

⑤测试结果：未测（未开工）。

⑥验收证据引用：待登记。
