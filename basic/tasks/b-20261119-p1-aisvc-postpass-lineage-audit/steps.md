# 步骤清单（b-20261119-p1-aisvc-postpass-lineage-audit）

**方案状态：** v0.1（S1 登记；S2 派单受 FIFO 约束：P1-01 完成验收并释放通道后才可派）。

## S1 建包登记

①本步骤目标：按资格审查 R1 冻结文本与 DEC-116 S1 授权建立 P1-02 审计任务包 + ST-05 自检。

②修改文件：basic/tasks/b-20261119-p1-aisvc-postpass-lineage-audit/{requirement.md,task-brief.md,steps.md}。

③修改内容：登记被审计仓库/分支、被测 `0c53c963d93e33c15ebd4498742828fcf9ffc57d`、对照 `d50ce915cb047537640a8393e08882e922443d47`、R3 artifact SHA `ddf605d5…`、五问只读复核问题、排除项、共同强制约束、五件套清单、FIFO 派单约束。

④执行结果：任务包建妥；ST-05 自检回填于下方。

⑤测试结果：python -I basic/tool/check_taskpack.py basic/tasks/b-20261119-p1-aisvc-postpass-lineage-audit —— 待提交后回填。

⑥验收证据引用：资格审查 R1 reply SHA256 `04410b05b134663fa82e0aacd0d9fb2ecdf473855703c4e6a6f8ca1bd110c722`（dispatch-2026-11-19T06-47-59）；P1HANDOFF-R1 reply SHA256 `fedb72e25bac2dd46e56a00b261d8634a9ae23de2b79720ebb311c00a36ee2dc`（dispatch-2026-11-19T18-33-05）；DEC-113/116。

**验收结论：PASS**（建包登记完成，冻结内容逐字落包）

## S2 审计派单（2026-11-20 执行）

①本步骤目标：以**全新独立审查会话**（--new-session，不复用 6aff4117 规划会话与 P1-01 审计会话）派发跨仓血缘审计简报。

②修改文件：phase0/tools/brief_p1audit02_r1_20261120.txt；phase0/logs/dispatch-2026-11-19T18-55-47/；本 steps.md。

③修改内容：简报 1188B≤1200B，标记 `[P1AUDIT02-R1|20261120]`，含 task_id、两对照完整 SHA、被审计仓库、五问、排除项、R3 artifact SHA、回执要求；门槛=P1-01 已验收收口释放通道（FIFO，见 P1-01 包 S5）。

④执行结果：发送双验通过；P1-02 审计会话 `6aff4668-21dc-83ec-997e-06a1794dd50f`（指针已接棒）；会话账本=6aff4117 处置裁定/6aff4393 P1-01/6aff4668 本审计。

⑤测试结果：reply.txt 2981B，SHA256=`128f9e0398dd6fbd0d3b11bf532f43a5d0de8f1d3f55d67ef1a1609443e948f4` 与 result.json.artifact_sha256 一致；stability 两读一致；completion checks 全过。

⑥验收证据引用：dispatch-2026-11-19T18-55-47（request/reply/raw-units/result/截图/run.log/tab-audit，reply SHA256=`128f9e0398dd6fbd0d3b11bf532f43a5d0de8f1d3f55d67ef1a1609443e948f4`）；简报 brief_p1audit02_r1_20261120.txt。

**验收结论：PASS**（审计派单成、独立会话、采集完整）

## S3 审计采集与登记（2026-11-20 执行，R1 已登记、#4 供证 R2 进行中）

①本步骤目标：采集审计 reply，归档 acceptance/，登记 delivery.md；对 BLOCKED 项按 L-017 配供证回审。

②修改文件：acceptance/branch-cleanup-evidence.md、acceptance/MANIFEST.txt、delivery.md、本 steps.md。

③修改内容：R1 裁定=五问 **4 PASS + 1 BLOCKED + 0 FAIL**（#1/#2 PASS 纯说明性修改、#3 PASS FF 保留、#5 PASS 衔接正确；#4 分支清理 BLOCKED=证据缺口非发现误删）；发现 F-01/F-02/F-03 如实登记；排除遵守声明全遵守。执行会对 #4 供证：reflog（FF 合并 origin/fix→main，分支 tip=0c53c963 即合并产物）+delivery §8 用户本人拍板登记+现况 main=origin/main=0c53c963、仅存 main、父提交线性，落 acceptance/branch-cleanup-evidence.md，待 R2 同会话复核定裁。

④执行结果：R1 全文按原样登记；供证文件落包；无改写、无自我改判。

⑤测试结果：reply SHA256 复算一致；供证命令可复现（git rev-parse/log/branch 实测记录于供证文件）。

⑥验收证据引用：dispatch-2026-11-19T18-55-47/reply.txt；acceptance/branch-cleanup-evidence.md；acceptance/MANIFEST.txt。

**验收结论：PASS**（R1 采集登记完成；#4 待审查方 R2 复核）

## S4 独立验收（待执行）/ S5 收口交付（待执行）

（按六要素回填；COMPLETED 前置=五件套逐文件存在+非空+全量 SHA256 核验）

---

## ST-05 自检记录
- S1：IN_PROGRESS（2026-11-20 自检；建包登记六要素齐备，S2~S5 未到期；合法进行态）
