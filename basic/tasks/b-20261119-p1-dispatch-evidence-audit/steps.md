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

## S2 审计派单（待执行，门槛：七项核验全 PASS）

①本步骤目标：以**全新独立审查会话**（--new-session，不复用 6aff4117 规划会话，资格审查 R1 §三/P1HANDOFF-R1 ③强隔离）派发只读审计简报。

②修改文件：phase0/tools/brief_p1audit01_r1_<date>.txt；phase0/logs/dispatch-<ts>/；本 steps.md。

③修改内容：简报（≤1200B，标记 `[P1AUDIT01-R1|<date>]`）含：task_id、被测 commit 完整 SHA、五问、排除项、证据路径、回执要求（逐项裁定+发现清单）；发送双验+reply SHA256 核验。

④执行结果：待回填。

⑤测试结果：待回填（发送双验 polls、reply SHA256、归属校验）。

⑥验收证据引用：待回填。

## S3 审计采集与登记（待执行）

①本步骤目标：采集审计 reply，归档 acceptance/（reply 原文+SHA256 对账记录），将逐项裁定登记 delivery.md。

②修改文件：acceptance/、delivery.md、本 steps.md。

③修改内容：reply 原文字节与 SHA256、五问逐项裁定、发现清单（证据缺失/不一致/未披露项）、不重跑不重复计数约束遵守声明。

④⑤⑥：待回填。

## S4 独立验收（待执行）/ S5 收口交付（待执行）

（按六要素回填；COMPLETED 前置=五件套逐文件存在+非空+全量 SHA256 核验）

---

## ST-05 自检记录
- S1：IN_PROGRESS（2026-11-20 自检；建包登记六要素齐备，S2~S5 未到期；合法进行态）
