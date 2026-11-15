# steps：b-20261116-tab-cleanup（规划共识后冻结，2026-11-16）

> 冻结依据：规划协商 R1 REWORK（5P1+3P2）→任务书 v0.2 逐项整改→R2 PASS（共识，dispatch 2026-11-15T22-0x 会话）；Basic WORKFLOW v0.3。版本选型=Basic/S2（task-brief）。

## S1 集成实现

- S1.1 `phase0/tools/gpt_dispatch.mjs`：attachPage() 接入 tab_hygiene（选页语义不变仅显式化落档）+created-pages 注册表（P1-05）+失败路径分叉处置（P1-03：未进入发送=关本次自建页；已发送/UNCERTAIN=保留现场不关页）；成功路径既有 browser.close+killProfileChrome 不变。
- S1.2 `phase1/tools/review_leg_recoll_template.mjs`：uuid 多命中取末位（创建序，P1-02）+finally 关闭本次自建页（只读链路任意退出点安全）。
- S1.3 新增 `phase0/tools/tab_cleanup.mjs` 维护脚本：默认 dry-run 报告（枚举+分组+候选）；`--close` 显式开启且逐页安全门槛（生成中不关/未确权不关/主页留最新；P1-04）。
- S1.4 审计落档：选页与清理决策写运行日志与 tab-audit 证据（P2-01/P2-03）。

## S2 测试与回归

- S2.1 `test_tab_hygiene.mjs` 扩容用例全过（P2-02：生成中保护/未确权隔离/并列判定/所有权门槛；含 R2 新问题 await import 修复）。
- S2.2 回归：test_dispatch_options.mjs 全过；P2-01 审计清单逐项 diff 核对（发送次数/Enter 一次/等待与确认窗/双读/落盘顺序/退出码/CLI/result.json 字段零变更）。

## S3 真实链冒烟（P2-03 形态）

- S3.1 维护脚本对实况 Chrome dry-run 报告落档（枚举证据）。
- S3.2 集成后的派单链以**下一次自然真实派单**承载冒烟（前后页身份+CONV 对照+值守页零关闭+自建页处置记录）——不额外触发真实消息发送。

## S4 验收与交付

- S4.1 ST-05 检查器自检→独立验收派单（ChatGPT）→整改循环至 PASS。
- S4.2 delivery.md 成文+decision-log 登记+证据归档。
