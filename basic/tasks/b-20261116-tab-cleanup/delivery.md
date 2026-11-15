# delivery：b-20261116-tab-cleanup（Chrome tab 泄漏清理）

**生成时间：** 2026-11-16 **生成者：** 执行会话（ZCode，Basic WORKFLOW v0.3）
**性质标注：** 事实（附证据）/决策（注明出处）/待确认（单独列）——逐条标注

## 1. 交付总状态（事实）

- **任务结论：PASS（终态，2026-11-16）**——规划 R1 REWORK→v0.2→R2 共识（8 项全关）；S1-S3 完成；S4 验收链 R1 REWORK(3项)→R2 REWORK(2项)→R3 REWORK(简报误钉SHA,非代码问题)→R4 REWORK(2项)→**R5 PASS（reply sha256=813c6a8b…，issues=[]）**；ST-05 COMPLETED 态全项 PASS。
- **交付物（事实）**：`phase0/tools/tab_hygiene.mjs`（纯函数消歧/去重/归属门槛：describePages/pickChatGptPage/dedupePlan，含 generating/owned 双旗标 fail-closed）、`phase0/tools/tab_cleanup.mjs`（维护脚本：dry-run 默认+--close 逐页安全门槛）、`phase0/tools/test_tab_hygiene.mjs`（17 用例）；gpt_dispatch.mjs 与 review_leg_recoll_template.mjs 各 +20±行集成（选页显式化+自建页注册表+失败路径分叉）。

## 2. 验收链摘要（事实，逐轮 reply SHA 可回溯）

| 步骤 | 验收链 | 结论 |
|---|---|---|
| 规划协商 | R1 REWORK 5P1+3P2（reply sha256=c4535793…）→任务书 v0.2 §0 逐项整改→R2 PASS 共识（reply sha256=f60d6c7c…，8 项全关；新 P2=测试 await import 当场修） | **共识** |
| S1 集成实现 | gpt_dispatch attachPage 显式化+created-pages 注册表+catch 按 sendAttempted 分叉（已发送=保留现场禁关页/发送前=仅关自建页）；recoll 模板 uuid 多命中取末位+finally 关自建页（只读链路安全）；tab_cleanup.mjs 新增 | **完成** |
| S2 测试回归 | test_tab_hygiene 17/17（含 P2-02 扩容：生成中保护/未确权隔离/并列判定/所有权门槛）+test_dispatch_options 12/12 回归+四文件语法检查过 | **PASS** |
| S3 真实链冒烟 | S3.1 dry-run 实证（实况 Chrome 1 页/0 候选/零关闭，tab-cleanup-dryrun-20261116.json）；S3.2 集成后首跑（Gate1-R1 派单 22-05-31）日志审计链完整；S4-R1 整改后升级=tab-audit.json 前后页身份（targetId+URL）+处置记录三态落盘（success/failure_scene_preserved/failure_created_pages_closed） | **PASS（证据形态按 P2-03 补齐）** |
| S4 独立验收 | R1 REWORK 3 项（sendAttempted 位置/探测 fail-closed/证据形态；f71656bc…）→R2 REWORK 2 项（锁窗口竞态/处置后快照；f9420710…）→R3 REWORK（079b20a1…，**系执行侧简报误钉整改前 SHA fd40cee 所致误读，非代码缺陷**）→R4 REWORK 2 项（cleanupDecision 未接线/样张过期；1918780e…）→**R5 PASS（813c6a8b…，issues=[]）** | **PASS** |

## 3. 零语义变更红线遵守（事实，P2-01 审计清单）

- 发送次数/Enter 一次/生成等待与确认窗/双读稳定性/证据落盘顺序/退出码/CLI 参数/result.json 字段**零变更**（s1-integration-diff-audit.patch 143 行逐项可核）；
- 唯一有意偏差（已在验收材料声明）：无 chatgpt 页时旧代码兜底接管 `pages[0]`（可能是无关页）→现改为新建页——消歧改进，避免接管无关页；
- 清理失败不吞主错误：catch 保留 console.error+exit(1)；维护脚本关闭失败 exitCode=1 不伪造成功。

## 4. 决策登记（决策）

- 规划共识与实现落点=DEC-065；任务立项=DEC-063 处置②（用户 2026-11-16 指令明列）。

## 5. 待确认/遗留（待确认——不得当事实）

- S3.2 的关闭路径真实证据（失败场景自建页关闭/维护模式 --close 实关）待自然机会承载——本任务以成功路径+dry-run 证据+单元测试覆盖，--close 实关留待首次真实维护需求（不以制造泄漏为代价取证）；
- recoll 模板为生成源，已派生的历史 driver 文件不含本修复——下一次补采由 review_leg 重新派生时自然生效。

## 6. 七要素完工总结（basic/WORKFLOW.md 模块六）

- **原始需求：** delivery「后续建议」①tab 泄漏小任务立项＋DEC-060 pending-issues（4 tab 积累，newPage 未关闭）＋用户 2026-11-16 开工指令明列"Chrome tab 泄漏小任务"（requirement.md 原文存档）。
- **最终实现内容：** tab_hygiene.mjs 纯函数件（消歧规则显式化：指定会话 uuid 多命中取末位/新会话保持既有首个 chatgpt 页语义；dedupePlan 生成中+未确权双门槛 fail-closed）+tab_cleanup.mjs 维护脚本（dry-run 默认）+gpt_dispatch/recoll 两处集成（失败路径 P1-03 状态分叉；自建页注册表 P1-05）+17 用例测试矩阵。
- **修改文件：** 新增 phase0/tools/tab_hygiene.mjs、tab_cleanup.mjs、test_tab_hygiene.mjs；修改 phase0/tools/gpt_dispatch.mjs（+34/-6）、phase1/tools/review_leg_recoll_template.mjs（+22/-2）；任务包四件+acceptance/ 证据。
- **测试结果：** test_tab_hygiene 17/17；test_dispatch_options 回归 12/12；四文件 node --check 过；dry-run 实证+集成首跑审计链（run.log [tab-hygiene] 行）。
- **Git commit：** 任务书 v0.2=b700b0b；S1-S3 实现=b6d0b9e；ST-05 补正=c96f128；本 delivery=验收派单 commit。
- **未解决问题：** 无阻断遗留（见 §5 两项待自然承载确认）。
- **后续建议：** ①下一次真实补采/维护场景顺带取关闭路径证据；②观察 2-3 周派单链 tab 数量确认无再积累；③recoll 历史派生 driver 在 review_leg 下次生成时自然更新，无需手动清理。

## 7. 证据路径索引（事实）

- 任务包：`basic/tasks/b-20261116-tab-cleanup/`（requirement/task-brief v0.2/steps 冻结件/acceptance/）
- 规划协商现场：`phase0/logs/dispatch-2026-11-15T21-55-33/`（R1）、`dispatch-2026-11-15T21-59-18/`（R2 共识）
- 集成首跑审计：`phase0/logs/dispatch-2026-11-15T22-05-31/run.log`（[tab-hygiene] 行）
- dry-run 实证：`phase0/logs/tab-cleanup-dryrun-20261116.json`
