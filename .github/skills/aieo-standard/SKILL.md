---
name: aieo-standard
description: 按 AIEO Standard 中级版执行已定档的多任务管理、批准方案批量入池、并行开发、加急交接和 ChatGPT FIFO 派单。也适用于 Standard 平台及治理工作。
---

# AIEO Standard 多任务工作流

以仓库根目录的 [AGENTS.md](../../../AGENTS.md) 为共同纪律。接手时核对已批准的版本、阶段、任务包和实际仓库状态。任务仍登记在 `basic/tasks/`，复用任务包、完整 SHA 与独立验收的证据规则。平台契约变更、扩展场景验收和真实写路径并行按各自授权执行。DEC-010 高危操作由用户本人拍板。 [Standard 工作流](../../../standard/WORKFLOW.md) · [多任务阶段门禁](../../../standard/MULTITASK-IMPLEMENTATION-PLAN.md)

## 任务池与派单

1. 同一任务池由一个主 IDE Agent 调度。用户批准大功能的固定方案后，登记子任务、依赖、验收条件和基线。未满足依赖的任务等待，下游从已验收的提交或产物开工。普通任务排队尾，加急任务排队首。 [任务池与派单规则](../../../standard/PLAYWRIGHT-QUEUE-WORKFLOW.md)
2. 按已批准阶段控制实际并行度，三任务是目标上限。保留独立 worktree、分支、开发会话和验收会话。加急时按队列计算让位任务并随加急操作确认。停止新步骤，确认停写、保存检查点并核清在途派单后再交接名额。安全让位任务按队列恢复。 [并行治理](../../../standard/parallel-governance-draft.md) · [任务池与派单规则](../../../standard/PLAYWRIGHT-QUEUE-WORKFLOW.md)
3. 启用 Playwright 队列的任务从同一个服务工作区提交和查询。worker 独占浏览器；派单按提交顺序逐轮完成，绑定任务、用途和原轮次。重试查询沿用原键，疑似已发送则核对和补采。发布给审查方的关联信息以简报和证据为准。 [队列操作说明](../../../standard/PLAYWRIGHT-QUEUE-WORKFLOW.md#chatgpt-唯一派单入口)
4. 审查 REWORK 返回原任务，验收 PASS 和证据落盘后释放名额并回收子 Agent。接管时对账占额、暂停任务和未决派单。记录真实覆盖和剩余门禁。 [验收基线](../../../docs/reviews/STANDARD-TASK-MANAGEMENT-ACCEPTANCE.md)

开工时把已读技能路径、实际命中的经验编号和防错动作写进任务书。运行 `python -I basic/tool/check_taskpack.py basic/tasks/<任务ID> --startup` 核对。 [开工核对](../../../basic/tool/README.md#开工核对)

## 常用开发经验

| 情形 | 先读的条目 |
|---|---|
| 并发写入、锁、崩溃后续跑 | L-004 跨进程互斥，L-010 并发交错与反例，L-013 扩展能力逐项放行 |
| 同轮绑定、错页或采集失败 | L-003 本轮归属，L-018 发送证据、补采和上下文预算 |
| 多任务交付和派单简报 | L-005 会话交接，L-017 逐项一致性核验，L-021 申报统计，L-022 UTF-8 计量 |
| 网络异常或整改停滞 | L-014 固化连接排查，L-019 止损与会商 |

异常发生时先按根规则查经验库与环境清单，再执行命中的处置顺序。 [开发经验库](../../../docs/AI-DEV-LESSONS.md) · [环境清单](../../../phase0/environment-inventory.md)
