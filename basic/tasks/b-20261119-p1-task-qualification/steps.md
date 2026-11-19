# 步骤清单（b-20261119-p1-task-qualification）

**方案状态：** v0.1 草案（待 R1 资格审查裁定）。

## S1 登记

①本步骤目标：登记 P1 阻塞①（两任务ID资格审查与冻结）任务包 + ST-05 自检。

②修改文件：basic/tasks/b-20261119-p1-task-qualification/{requirement.md,task-brief.md,steps.md}。

③修改内容：登记来源（P1 execution R1 reply 9a79f7cf）、四候选、五资格审查标准、边界。

④执行结果：任务包建妥；基线提交前登记；ST-05 待回填。

⑤测试结果：check_taskpack.py 待提交后回填。

⑥验收证据引用：本任务包 S1 提交；R1 派单直读签核（待回填）。

**验收结论：PASS**（登记完成；独立验收见 S2 规划协商链）

## S2 规划协商

①本步骤目标：审查会话迁移（旧 6afe99cd 归档只读）+ 四候选五标准资格审查 R1 裁定 + 两 task_id 冻结。

②修改文件：phase0/logs/gpt-reviewer-session.json + 备份 pre-p1qual.json；phase0/tools/brief_p1qual_plan_r1.txt；派单现场 dispatch-2026-11-19T06-47-59；本 steps.md。

③修改内容：R1 简报（1164B，标记 `[P1QUAL-PLAN-R1|20261119]`）；R1=**PASS，阻塞① CLOSED**（reply `04410b05…` 8779B，无 fail-closed）。四候选终局：①dispatch-reliability-fix=入选（证据完整/无未关问题/可定义非重复复核/可独立建档/不重复计数全 PASS，被测 `7f7830b8`，历史验收 artifact `a5d099d6…`）；②c2-batch1-review=淘汰（四项 REWORK 未关①④⑤⑥+原始派单证据本版本不可完整读）；③aisvc-f3-rework=入选（F3b-01 R3 PASS 已关、可审 R3 后变更血缘、跨仓 SHA 可核，被测 `0c53c963`、对照 `d50ce915`，历史 artifact `ddf605d5…`）；④c2-batch2-scenarios=淘汰（S3 未关+⑥不可冒充）。**审查方独立推翻执行者"aisvc 不宜首选"提示**，据证据裁定入选。

④执行结果：两 task_id 正式冻结=P1-01 `b-20261119-p1-dispatch-evidence-audit`（被测 `7f7830b80bdaa6a5c48510c74a621319bf32e419`，只读复核=派单可靠性三项历史验收原始证据与结论一致性，不重跑测试/不重算历史PASS）；P1-02 `b-20261119-p1-aisvc-postpass-lineage-audit`（被测 `0c53c963d93e33c15ebd4498742828fcf9ffc57d` 对照 `d50ce915cb047537640a8393e08882e922443d47`，只读复核=F3 R3 PASS 后变更/合并血缘，不重跑 pytest/不重评历史R3）。新会话 6afe9bd3-4bb0-83ec-9f56-8ea548321098（归属校验 PASS）。

⑤测试结果：reply.txt SHA256=`04410b05b134663fa82e0aacd0d9fb2ecdf473855703c4e6a6f8ca1bd110c722`（8779B）与 result.json.artifact_sha256 逐字一致；回执摘要 SHA256=`41b6024656f96e20b8d05f1b25a5ce626068dfe6ec3e467c5bf148e124a9839c`（规范化记录 1896B）；发送双验 polls=2；R1=PASS。

⑥验收证据引用：dispatch-2026-11-19T06-47-59（request/reply/raw-units/result/截图/run.log/tab-audit），reply SHA256=`04410b05b134663fa82e0aacd0d9fb2ecdf473855703c4e6a6f8ca1bd110c722`；指针备份 phase0/logs/gpt-reviewer-session.pre-p1qual.json。

**验收结论：PASS**（R1 资格审查通过，两 task_id 冻结；独立验收见 S4）

## S3 两任务冻结

①本步骤目标：按 R1 裁定把两 P1 只读审计任务的身份/复核问题/五件套清单落为冻结结论（本任务不创建独立执行任务包，留给后续逐任务执行）。

②修改文件：本 steps.md；task-brief.md（v0.1→v0.2 冻结候选）。

③修改内容：P1-01/P1-02 的 task_id/来源/被测 SHA/只读复核问题/五件套清单/排除项按 R1 原文登记（见 S2③）。共同强制约束：不重跑⑥、不把⑥未执行冒充 PASS、不重复计算历史 PASS、历史 PASS 不等于本轮复核 PASS、两任务分别建 task_id/会话UUID/证据目录。

④执行结果：两任务冻结结论落盘；P1 阻塞① CLOSED。

⑤测试结果：R1 逐项核对=四候选五标准终局 2 入选 2 淘汰、两 task_id 完整 SHA 绑定、五件套各 5 项、排除项齐全；零代码/不实跑/不合并/不部署/不删数据。

⑥验收证据引用：dispatch-2026-11-19T06-47-59，reply SHA256=`04410b05b134663fa82e0aacd0d9fb2ecdf473855703c4e6a6f8ca1bd110c722`；R1 裁定依据；S3 独立验收见 S4。

**验收结论：PASS**（两任务身份冻结；独立验收见 S4）

## S4 独立验收（待执行）
（待回填）

## S5 收口交付（待执行）
（待回填）

---

## ST-05 自检记录
- S1：待回填。
