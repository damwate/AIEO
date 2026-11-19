# 步骤清单（b-20261119-p1-dispatch-evidence-audit）

**方案状态：** v0.1（S1 登记；S2 派单受 P1HANDOFF-R1 S3 门槛约束：七项核验全 PASS 才可派）。

## S1 建包登记

①本步骤目标：按资格审查 R1 冻结文本与 DEC-116 S1 授权建立 P1-01 审计任务包 + ST-05 自检。

②修改文件：basic/tasks/b-20261119-p1-dispatch-evidence-audit/{requirement.md,task-brief.md,steps.md}。

③修改内容：登记被测 commit `7f7830b80bdaa6a5c48510c74a621319bf32e419`、历史 artifact SHA `a5d099d6…`、五问只读复核问题、排除项、共同强制约束、五件套清单、FIFO 派单门槛。

④执行结果：任务包建妥；ST-05 自检回填于下方。

⑤测试结果：python -I basic/tool/check_taskpack.py basic/tasks/b-20261119-p1-dispatch-evidence-audit —— 待提交后回填。

⑥验收证据引用：资格审查 R1 reply SHA256 `04410b05b134663fa82e0aacd0d9fb2ecdf473855703c4e6a6f8ca1bd110c722`（dispatch-2026-11-19T06-47-59）；P1HANDOFF-R1 reply SHA256 `fedb72e25bac2dd46e56a00b261d8634a9ae23de2b79720ebb311c00a36ee2dc`（dispatch-2026-11-19T18-33-05）；DEC-113/116。

**验收结论：PASS**（建包登记完成，冻结内容逐字落包）

## S2 审计派单（2026-11-20 执行）

①本步骤目标：以**全新独立审查会话**（--new-session，不复用 6aff4117 规划会话，资格审查 R1 §三/P1HANDOFF-R1 ③强隔离）派发只读审计简报。

②修改文件：phase0/tools/brief_p1audit01_r1_20261120.txt；phase0/logs/dispatch-2026-11-19T18-43-43/；本 steps.md。

③修改内容：简报 1195B≤1200B，标记 `[P1AUDIT01-R1|20261120]`，含 task_id、被测 commit 完整 SHA、五问、排除项、读法分层（acceptance/ 在冻结 SHA 读+结论文件在当前 main 读）、回执要求；派单前按 circuit-breaker.md 六项检查全过（七项核验全 PASS 后执行，P1HANDOFF-R1 S3 门槛达成）。

④执行结果：发送双验通过；审计会话 `6aff4393-8e90-83ec-97cb-5c2eaa1d40a6`（指针已接棒）；会话账本=6aff4117 处置裁定/6aff4393 本审计/P1-02 另立（登记于 b-20261119-multitask-p1-execution）。

⑤测试结果：reply.txt 6459B，SHA256=`0c3200480a0f80426682e64a657879d2b7824bd7ca0bddbe45217ac427897c1c` 与 result.json.artifact_sha256 一致；stability 两读一致；completion checks 全过。

⑥验收证据引用：dispatch-2026-11-19T18-43-43（request/reply/raw-units/result/截图/run.log/tab-audit）；简报 brief_p1audit01_r1_20261120.txt。

**验收结论：PASS**（审计派单成、独立会话、采集完整）

## S3 审计采集与登记（2026-11-20 执行）

①本步骤目标：采集审计 reply，归档 acceptance/，将逐项裁定与发现清单登记 delivery.md；对存疑发现按 L-017 配反证回审。

②修改文件：acceptance/sha256-reconciliation-f05.md、acceptance/MANIFEST.txt、delivery.md、本 steps.md。

③修改内容：R1 裁定=五问 3 FAIL（#1/#4/#5）+2 BLOCKED（#2/#3）+发现 F01–F06+排除遵守声明；最终"本轮独立证据审计不能签署 PASS"（历史三项 PASS 保持历史属性）。执行会对 F05 复核：冻结 commit 下 reply.txt（814B 含"ChatGPT 说："首行）SHA256=声明 artifact `a5d099d6…` 逐字一致（工具链口径=artifact 即 reply.txt 全文字节），反证落 acceptance/sha256-reconciliation-f05.md，待 R2 同会话复核；F01–F04/F06 不受影响维持登记。

④执行结果：裁定与发现全部如实登记 delivery.md；无改写、无自我改判。

⑤测试结果：reply SHA256 复算一致；对账命令可复现（见反证文件）。

⑥验收证据引用：dispatch-2026-11-19T18-43-43/reply.txt；acceptance/sha256-reconciliation-f05.md；acceptance/MANIFEST.txt。

**验收结论：PASS**（采集登记完成；审计实体结论按原样登记，F05 待审查方 R2 复核）

## S4 独立验收（待执行）/ S5 收口交付（待执行）

（按六要素回填；COMPLETED 前置=五件套逐文件存在+非空+全量 SHA256 核验）

---

## ST-05 自检记录
- S1：IN_PROGRESS（2026-11-20 自检；建包登记六要素齐备，S2~S5 未到期；合法进行态）
