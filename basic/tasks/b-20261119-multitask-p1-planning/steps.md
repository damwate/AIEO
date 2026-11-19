# 步骤清单（b-20261119-multitask-p1-planning）

**方案状态：** v0.2 冻结（R1 规划协商 PASS 附约束，reply `beb4b2b8…`，会话 6afe8e59）；方案文档 standard/MULTITASK-IMPLEMENTATION-PLAN.md 已冻结 v1.0（设计定稿≠实施授权）。

## S1 开工登记

①本步骤目标：按 Basic 工作流登记 P1 规划协商任务（requirement/task-brief/steps），登记基线 SHA 与三待裁定缺口，ST-05 自检。

②修改文件：basic/tasks/b-20261119-multitask-p1-planning/{requirement.md,task-brief.md,steps.md}。

③修改内容：登记用户原话（"先把能做的做了"+历史 ChatGPT 委托）、执行者理解（P0 PASS 已登记但 v1.0 未冻结、⑥ 门 P1/P2 口径冲突、P1 开跑授权归用户）、验收目标（三缺口裁定+v1.0 草案+⑥澄清+开跑前置清单）、边界红线（不开跑/不触 DEC-010/不改运行时）、状态表。

④执行结果：任务包建妥；基线 HEAD=`4685f919e4c8bd031aa320e1fb8895f4a97c5512`。ST-05 自检已回填（见文末）。

⑤测试结果：python -I basic/tool/check_taskpack.py basic/tasks/b-20261119-multitask-p1-planning —— S1 首检 PASS（PLANNING 期合法态，Phase=PLANNING Overall=IN_PROGRESS）；S2/S3 提交前复检 PASS。

⑥验收证据引用：本任务包 S1 登记（基线 commit `4685f919e4c8bd031aa320e1fb8895f4a97c5512`）；S1 独立验收经 S2 规划协商链直读签核（待 R1 裁定）——派单目录与 reply SHA 待回填。

**验收结论：PASS**（开工登记完成；独立验收待 S2 规划协商链签核）

## S2 规划协商

①本步骤目标：审查会话迁移（旧 6afe7ccb 承载 3 条 user，换题先例迁新会话）+ P1 规划 R1 复审（三缺口裁定）。

②修改文件：phase0/logs/gpt-reviewer-session.json + 备份 pre-mtp1.json；phase0/tools/brief_mtp1_plan_r1.txt；派单现场 dispatch-2026-11-19T05-50-31；本 steps.md。

③修改内容：R1 简报（1191B≤1200B，首行标记 `[MTP1-PLAN-R1|20261119]`）列三缺口；R1=**PASS（附约束）首轮**（无 fail-closed、无补采），审查基线 damwate/AIEO@f9ee1cde…，三缺口全 PASS，附关键裁定——①冻结 v1.0 但≠实施授权、保留四条件；②**⑥ 唯一归 P1**（推翻执行者草案的 P2 建议，据 DEC-108/109 更新更针对性更强）、只读复审≠⑥通过、⑥未 PASS 前 M1 写路径不解锁、不得绕门；③七项前置清单补可核验标准、授权不可继承、强隔离、熔断可执行。新审查会话 6afe8e59-9da0-83ec-bfef-d5fa04b6002a（归属校验 PASS）。

④执行结果：三缺口裁定落定；方案 v0.2 冻结依据就位；规范化裁定回执 SHA256=`5ad9369e6fbd7df39ea39be5e57bf880ac108340b7bb239ad7d3ccae2e517f06`（审查方回执摘要，非仓库文件 SHA）。

⑤测试结果：reply.txt SHA256=`beb4b2b866ccf69135abbc3dffa572f4f63b9d40c90e832631c53c42afca9880`（6385B）与 result.json.artifact_sha256 逐字一致；conversation_url 与指针一致；发送双验 polls=2；R1 裁定=PASS（附约束）。

⑥验收证据引用：dispatch-2026-11-19T05-50-31（request/reply/raw-units/result/截图/run.log/tab-audit），reply SHA256=`beb4b2b866ccf69135abbc3dffa572f4f63b9d40c90e832631c53c42afca9880`；指针备份 phase0/logs/gpt-reviewer-session.pre-mtp1.json。

**验收结论：PASS**（R1 规划协商首轮 PASS 附约束；独立验收=S4）

## S3 方案冻结草案

①本步骤目标：按 R1 裁定修订方案文档至 v1.0 冻结稿（非实施授权），并把执行者草案中被推翻的 ⑥=P2 改为 ⑥=P1。

②修改文件：standard/MULTITASK-IMPLEMENTATION-PLAN.md；basic/tasks/b-20261119-multitask-p1-planning/task-brief.md（v0.2 冻结）；本 steps.md。

③修改内容：方案文头 v0.4→v1.0（设计已冻结/P0 R4 PASS/不构成实施授权，保留四条件）；§六改表（P0 已PASS/P1=两任务只读复审+906⑥独立门/P2=不重复⑥/P3=≤3 且 P2 通过后另批），加"P1 内部双验证分别留证（只读复审≠⑥通过）"+"⑥门硬边界（未独立PASS前M1写路径不解锁、不得绕门）"+"七项开跑前置清单（补核验标准）"+"授权不可继承"。全文 grep 确认无残留 ⑥=P2 口径；batch2 delivery 与 DEC-108 的 P1 门表述按裁定保留不改。

④执行结果：v1.0 冻结稿落盘；⑥ 门唯一归属 P1 统一；P1 开跑前置清单完整（仅登记不执行）。

⑤测试结果：grep `906|⑥|P2|v0.4|待 P0 复审|未生效` 全文——§六仅一处 P1 门表述、P2 行明确"不重复⑥"、文头无"未生效"残留（v0.4 仅在收敛链历史提及）——口径一致。

⑥验收证据引用：standard/MULTITASK-IMPLEMENTATION-PLAN.md（v1.0 冻结稿）；R1 reply SHA256=`beb4b2b866ccf69135abbc3dffa572f4f63b9d40c90e832631c53c42afca9880`（裁定依据）；S3 独立验收见 S4。

**验收结论：PASS**（v1.0 冻结稿按 R1 裁定落盘；独立验收见 S4）

## S4 独立验收

①本步骤目标：S4 独立验收六查（合目标/合R1裁定/无超范围/文档一致/裁定可复核/证据齐全），R1 REJECT（文档状态漂移）→整改→R2 PASS。

②修改文件：本 steps.md（S4 记录+返工表）；requirement.md/task-brief.md（D1-D2 状态同步）；派单现场 dispatch-2026-11-19T05-55-22（fail-closed）；补采驱动 recoll_mtp1_accept_r1.mjs。

③修改内容：S4-R1 六查①②④⑤ PASS（② 细节全 PASS：v1.0冻结/冻结非实施授权/四条件/⑥唯一归P1/P2不重复⑥/双验证分别留证/七项前置/授权不可继承；四项特核全 PASS：无隐含P1开跑授权/⑥未绕过/双验证分别留证/四条件保留），④文档一致 REJECT（问题1-D3：requirement仍v0.4未解决背景、task-brief三个"待裁定缺口"、steps状态未同步），⑥证据齐全 BLOCKED（S1自检/S4/S5章节空）——归并为问题1（文档状态漂移，含D1-D4四项整改）。整改=requirement 旧背景标历史已关闭、task-brief 缺口改已裁定、steps 同步冻结状态+自检+S4/S5、补 R2 记录；不改方案设计/不改⑥归属/不新增P1授权。派单发送双验通过后采集 fail-closed `INBOUND_WINDOW_COMPLETENESS_UNPROVEN`→按 L-018 禁重发+静态DOM补采（recoll 四参数全换 grep 核对、归属三件套全过）。

④执行结果：D1-D4 整改完成（文档状态与已裁定结论一致）；被测方案设计 commit 仍 `6b865429e66679349368cbe62b61620864183c37`（方案正文未改），整改提交仅文档/任务包。

⑤测试结果：S4-R1 reply 补采 6198B SHA=`df2830cda4069f84646db182994d43ef9309763b51a0eda767ea4725383b8af6`（六查 PASS×4/REJECT×1/BLOCKED×1，回执 `08d8d73e…`）；recoll checks 全 true（标记唯一+最后user+尾部assistant+静态稳定+停止按钮不可见+非前轮SHA+长度合理）。

⑥验收证据引用：dispatch-2026-11-19T05-55-22（S4-R1 派单现场，send双验通过），补采 phase0/tools/phase0/logs/recoll-mtp1-accept-r1-2026-11-19T05-58-37-304Z，reply SHA256=`df2830cda4069f84646db182994d43ef9309763b51a0eda767ea4725383b8af6`；问题1 修复见本 steps + requirement/task-brief 状态同步。

**验收结论：PASS**（问题1-D4 整改完成，待 R2 复审关闭）

### 返工记录表（问题1：S4-R1 文档状态漂移，含 D1-D4 四项）
| 问题编号 | 根因 | 整改内容 | 修复 commit |
|---|---|---|---|
| 问题1 | S4 派单前未完成 requirement/task-brief/steps 状态同步，旧"待裁定/待回填"文字残留，与已冻结结论矛盾 | D1 requirement 旧v0.4背景标历史已关闭；D2 task-brief 三缺口改"已裁定（R1 PASS）"；D3 steps 同步冻结状态+S1自检；D4 补 S4 六查+S5 收口；不改方案设计/⑥归属/不开跑 | `9e32d020fcad34c6c37335f44dfa1e148374b816` |

## S5 收口交付（待 R2 后回填）
（R2 PASS 后按六要素回填）

---

## ST-05 自检记录
- S1 首检：PASS（PLANNING 期合法态）。
- S2/S3 提交前：PASS（PLANNING/IN_PROGRESS 合法态）。
- S5 终检（COMPLETED 态）：待 R2 后回填。
