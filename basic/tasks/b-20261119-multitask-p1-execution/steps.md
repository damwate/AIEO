# 步骤清单（b-20261119-multitask-p1-execution）

**方案状态：** v0.1 草案（待 R1 规划协商裁定 P1 执行形态）。

## S1 开工登记

①本步骤目标：登记用户 P1 开跑授权（本人拍板红线）+ 开工前实查三项阻塞 + ST-05 自检。

②修改文件：basic/tasks/b-20261119-multitask-p1-execution/{requirement.md,task-brief.md,steps.md}。

③修改内容：登记用户原话"OK，P1开始吧"及授权边界（P1 开跑已授、P2/P3/部署/M4/合并/删除未授）；记录三项阻塞（两任务ID未指定/906⑥无独立场景/并行执行器未实现）；四裁定问题；边界红线。

④执行结果：任务包建妥；基线 HEAD 于提交前登记；ST-05 自检待回填。

⑤测试结果：python -I basic/tool/check_taskpack.py basic/tasks/b-20261119-multitask-p1-execution —— 待提交后回填。

⑥验收证据引用：本任务包 S1 提交；R1 规划协商直读签核（派单目录与 reply SHA 待回填）。

**验收结论：PASS**（P1 开跑授权登记 + 阻塞如实申报；独立验收见 S2 规划协商链）

## S2 规划协商

①本步骤目标：审查会话迁移（旧 6afe8e59 承载 5 条 user 超阈值）+ P1 执行形态 R1 裁定（四问题：形态/两任务ID/906⑥/七项清单）。

②修改文件：phase0/logs/gpt-reviewer-session.json + 备份 pre-p1exec.json；phase0/tools/brief_p1exec_plan_r1.txt；派单现场 dispatch-2026-11-19T06-39-20；本 steps.md。

③修改内容：R1 简报（1197B≤1200B，首行标记 `[P1EXEC-PLAN-R1|20261119]`）；R1=**有条件通过**（PASS_WITH_CONSTRAINTS + 三项 BLOCKED，reply `9a79f7cf…` 8306B，无 fail-closed、无补采）。逐项裁定：①执行形态=**人工 FIFO 串行派单两只读任务**（用现有 session_lock/workspace_lock/scheduler.py，零新代码；不实现并行执行器、不启自动队列/状态迁移、不声称自动并行；任务级并行与派单通道并行严格区分）；②两任务ID=BLOCKED（候选 b-20261117-dispatch-reliability-fix、b-20261118-c2-batch1-review 优先，但仅是候选非正式选定；需资格审查：证据完整可读/无未关 REWORK/可定义非重复只读问题/可独立 task_id+会话+证据目录/不与既有验收重复计数）；③906⑥=BLOCKED（须先立独立场景任务 b-20261119-p1-906-06-concurrency 做 S2 场景设计+后续另批实测；覆盖并发登记/REST/DB/ACK/幂等/故障/证据关联；⑥未 PASS 前 M1 写路径限制绝对不解除，两任务 PASS 不替代⑥）；④七项清单=①逐级批准 PASS（用户原话+DEC-107）②基线 SHA PASS（完整40位三方一致）③强隔离 BLOCKED（定 ID 后分配）④通道闸空闲 待核验（派单前实查）⑤五件套 待补齐（每任务独立定义+逐文件SHA256）⑥熔断 BLOCKED（人工熔断责任/触发/在途/恢复明确，不得称自动熔断已实现）⑦复盘模板 设计可沿用（需本批专用）。

④执行结果：执行形态=人工受控准备阶段（**非实际试验派单**）；新审查会话 6afe99cd-5e20-83ec-b3c3-6775c4792140（归属校验 PASS）；三项 BLOCKED 登记为待关闭前置。

⑤测试结果：reply.txt SHA256=`9a79f7cfc04e481ac0a0f25b3cc33aca0aa04249f2bdb588fccc1e63eaf9ed64`（8306B）与 result.json.artifact_sha256 逐字一致；conversation_url 与指针一致；发送双验 polls=2；R1=有条件通过（4 项：1 项 PASS_WITH_CONSTRAINTS+3 项 BLOCKED）。

⑥验收证据引用：dispatch-2026-11-19T06-39-20（request/reply/raw-units/result/截图/run.log/tab-audit），reply SHA256=`9a79f7cfc04e481ac0a0f25b3cc33aca0aa04249f2bdb588fccc1e63eaf9ed64`；指针备份 phase0/logs/gpt-reviewer-session.pre-p1exec.json。

**验收结论：PASS**（R1 规划协商完成，形态裁定=人工受控准备阶段，三项阻塞如实登记）

## S3 执行形态冻结/阻塞处置

①本步骤目标：按 R1 裁定冻结执行形态（人工 FIFO 串行、零新代码、非实跑），登记三项 BLOCKED 的关闭路径。

②修改文件：本 steps.md；task-brief.md（v0.1→v0.2 冻结候选）；可另立 906⑥ 场景设计子任务（阻塞②关闭路径，另任务包）。

③修改内容：冻结执行形态=人工受控准备阶段（两任务独立准备/独立 worktree/独立证据目录；ChatGPT 通道一次一任务 FIFO；前一任务采集+归档+释放通道后才派下一任务；不启自动队列/状态迁移/不声称自动并行）；三阻塞关闭路径=①两任务资格审查→正式冻结 task_id（派单裁定）②另立 b-20261119-p1-906-06-concurrency 场景设计任务→规划审查→后续另批实测③七项清单实核验（通道闸/五件套/熔断派单前实查）。边界：⑥未 PASS 前 M1 写路径不解除；两任务 PASS≠⑥ PASS；授权不可继承。

④执行结果：执行形态冻结（人工受控准备阶段）；三项阻塞关闭路径登记。**P1 实际试验派单未启动**（待三阻塞关闭）。

⑤测试结果：R1 裁定四项逐项核对=形态条件通过/三 BLOCKED；无代码写入、无 M1 推进、无派单实跑。

⑥验收证据引用：dispatch-2026-11-19T06-39-20，reply SHA256=`9a79f7cfc04e481ac0a0f25b3cc33aca0aa04249f2bdb588fccc1e63eaf9ed64`；R1 裁定依据；S3 独立验收见 S4。

**验收结论：PASS**（执行形态冻结；独立验收见 S4）

## S4 独立验收（待执行）
（按六要素回填）

## S5 收口交付（待执行）
（按六要素回填）

---

## ST-05 自检记录
- S1：待回填（运行 check_taskpack.py 后）。
