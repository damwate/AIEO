# steps：b-20261116-tab-cleanup（规划共识后冻结，2026-11-16）

> 冻结依据：规划协商 R1 REWORK（5P1+3P2）→任务书 v0.2 逐项整改→R2 PASS（共识，dispatch 2026-11-15T22-0x 会话）；Basic WORKFLOW v0.3。版本选型=Basic/S2（task-brief）。

## S1 集成实现

- S1.1 `phase0/tools/gpt_dispatch.mjs`：attachPage() 接入 tab_hygiene（选页语义不变仅显式化落档）+created-pages 注册表（P1-05）+失败路径分叉处置（P1-03：未进入发送=关本次自建页；已发送/UNCERTAIN=保留现场不关页）；成功路径既有 browser.close+killProfileChrome 不变。
- S1.2 `phase1/tools/review_leg_recoll_template.mjs`：uuid 多命中取末位（创建序，P1-02）+finally 关闭本次自建页（只读链路任意退出点安全）。
- S1.3 新增 `phase0/tools/tab_cleanup.mjs` 维护脚本：默认 dry-run 报告（枚举+分组+候选）；`--close` 显式开启且逐页安全门槛（生成中不关/未确权不关/主页留最新；P1-04）。
- S1.4 审计落档：选页与清理决策写运行日志与 tab-audit 证据（P2-01/P2-03）。

**S1 六要素记录：**
- ①本步骤目标：tab 生命周期卫生集成——选页显式化落档+自建页注册表+失败路径状态分叉+维护脚本（task-brief v0.2 §0 P1-01~P1-05/P2-01 落点）。
- ②修改文件：phase0/tools/gpt_dispatch.mjs、phase1/tools/review_leg_recoll_template.mjs、phase0/tools/tab_cleanup.mjs（新增）、phase0/tools/tab_hygiene.mjs（新增）。
- ③修改内容：attachPage 选页语义不变仅显式化（含 pages[0] 兜底→newPage 唯一有意偏差）；created-pages 注册表；catch 按 cleanupDecision 分叉（preserve_scene/close_created_pages）；recoll uuid 多命中取末位+finally 关自建页；tab_cleanup dry-run 默认+--close 全程持锁。
- ④执行结果：集成完成，diff 审计 6 个 diff 头两段标注（acceptance/s1-integration-diff-audit.patch）；P2-01 红线清单逐项核对零变更（发送次数/Enter 一次/等待窗/双读/落盘序/退出码/CLI/result.json 字段）。
- ⑤测试结果：test_tab_hygiene 19/19；test_dispatch_options 回归 12/12；四文件 node --check 过。
- ⑥验收证据引用：acceptance/s1-integration-diff-audit.patch；S4-R5 现场 dispatch-2026-11-15T22-29-33 reply sha256=813c6a8b0223d76a17be109ba3afd0c170e67f0163672a0a9c598d1edd13953d。**S1 验收结论：PASS**。

## S2 测试与回归

- S2.1 `test_tab_hygiene.mjs` 扩容用例全过（P2-02：生成中保护/未确权隔离/并列判定/所有权门槛；含 R2 新问题 await import 修复）。
- S2.2 回归：test_dispatch_options.mjs 全过；P2-01 审计清单逐项 diff 核对（发送次数/Enter 一次/等待与确认窗/双读/落盘顺序/退出码/CLI/result.json 字段零变更）。

**S2 六要素记录：**
- ①本步骤目标：消歧/去重/归属门槛全分支测试覆盖（P2-02 扩容）+既有链回归。
- ②修改文件：phase0/tools/test_tab_hygiene.mjs（新增）。
- ③修改内容：17→19 用例（R1 意见扩容：生成中保护/未确权隔离/并列 seq 判定/所有权门槛；R2 意见：cleanupDecision 2 例；R2 新 P2：await import 修复）。
- ④执行结果：19/19 全过（正反例对应任务书条款）；回归 12/12。
- ⑤测试结果：acceptance/s2-test-tab-hygiene-output.txt（total=19 pass=19 fail=0）；dispatch-binding-tests 12/12。
- ⑥验收证据引用：acceptance/s2-test-tab-hygiene-output.txt；S4-R5 现场 dispatch-2026-11-15T22-29-33 reply sha256=813c6a8b0223d76a17be109ba3afd0c170e67f0163672a0a9c598d1edd13953d（测试结论获认可）。**S2 验收结论：PASS**。

## S3 真实链冒烟（P2-03 形态）

- S3.1 维护脚本对实况 Chrome dry-run 报告落档（枚举证据）。
- S3.2 集成后的派单链以**下一次自然真实派单**承载冒烟（前后页身份+CONV 对照+值守页零关闭+自建页处置记录）——不额外触发真实消息发送。

**S3 六要素记录：**
- ①本步骤目标：真实 Chrome 上取证枚举与集成链审计能力（P2-03 形态：页身份+处置记录）。
- ②修改文件：gpt_dispatch.mjs（tab-audit.json 三段式落盘）；证据文件 acceptance/s3-*。
- ③修改内容：cdpTargetList 前后快照+writeTabAudit 三态（success/failure_scene_preserved/failure_created_pages_closed）+exit_after_disposal 处置后快照（S4-R2 意见整改）。
- ④执行结果：S3.1 dry-run 实证（1 页/0 候选/零关闭）；S3.2 五次真实派单轮（R1-R5 验收链自然承载）审计链完整；处置后样张=R4 轮 tab-audit.json（exit_after_disposal=CDP_UNREACHABLE 清零证明）。
- ⑤测试结果：tab-audit 三段式机器可核（acceptance/s3-tab-audit-sample.json）；日志 [tab-hygiene] 行齐备。
- ⑥验收证据引用：acceptance/s3-tab-audit-sample.json、acceptance/s3-tab-hygiene-audit-lines.txt、phase0/logs/tab-cleanup-dryrun-20261116.json；S4-R5 现场 dispatch-2026-11-15T22-29-33 reply sha256=813c6a8b0223d76a17be109ba3afd0c170e67f0163672a0a9c598d1edd13953d。**S3 验收结论：PASS**。

## S4 验收与交付

- S4.1 ST-05 检查器自检→独立验收派单（ChatGPT）→整改循环至 PASS。
- S4.2 delivery.md 成文+decision-log 登记+证据归档。

**S4 六要素记录：**
- ①本步骤目标：独立验收闭环+交付登记（ST-05 前置）。
- ②修改文件：delivery.md、task-brief.md 状态表、steps.md 六要素、decision-log DEC-066。
- ③修改内容：验收链 R1-R5 如实登记（含 R3 误钉 SHA 的执行侧申报错误）；终态 PASS 回填。
- ④执行结果：R5 PASS（issues=[]）；ST-05 COMPLETED 全项 PASS。
- ⑤测试结果：检查器输出 Overall PASS（COMPLETED 态）。
- ⑥验收证据引用：dispatch-2026-11-15T22-12-57（R1，f71656bc…）/dispatch-2026-11-15T22-18-25（R2，f9420710…）/dispatch-2026-11-15T22-22-52（R3，079b20a1…）/dispatch-2026-11-15T22-26-06（R4，1918780e…）/dispatch-2026-11-15T22-29-33（R5，reply sha256=813c6a8b0223d76a17be109ba3afd0c170e67f0163672a0a9c598d1edd13953d）。**S4 验收结论：PASS**。
