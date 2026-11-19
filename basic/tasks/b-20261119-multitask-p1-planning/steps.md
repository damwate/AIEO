# 步骤清单（b-20261119-multitask-p1-planning）

**方案状态：** v0.1 草案（待 R1 规划协商复审冻结）。

## S1 开工登记

①本步骤目标：按 Basic 工作流登记 P1 规划协商任务（requirement/task-brief/steps），登记基线 SHA 与三待裁定缺口，ST-05 自检。

②修改文件：basic/tasks/b-20261119-multitask-p1-planning/{requirement.md,task-brief.md,steps.md}。

③修改内容：登记用户原话（"先把能做的做了"+历史 ChatGPT 委托）、执行者理解（P0 PASS 已登记但 v1.0 未冻结、⑥ 门 P1/P2 口径冲突、P1 开跑授权归用户）、验收目标（三缺口裁定+v1.0 草案+⑥澄清+开跑前置清单）、边界红线（不开跑/不触 DEC-010/不改运行时）、状态表。

④执行结果：任务包建妥；基线 HEAD=`4685f919e4c8bd031aa320e1fb8895f4a97c5512`。ST-05 自检待回填。

⑤测试结果：python -I basic/tool/check_taskpack.py basic/tasks/b-20261119-multitask-p1-planning —— 待回填（PLANNING 期合法态预期）。

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

## S4 独立验收（待执行）
（按六要素回填）

## S5 收口交付（待执行）
（按六要素回填）

---

## ST-05 自检记录
- S1：待回填（运行 check_taskpack.py 后）。
