# 步骤清单：b-20261121-queue-phaseb

- 被测基线：6e0a26a3646577f4a95421307ccd7ade21433a38（DEC-141 授权基线）；分支 fix/parallel-stage2。
- 设计依据：parallel_queue_design_r1.md（R8 设计终验 PASS，DEC-141）。

## S1 骨架实现（完成）

- ①本步骤目标：TaskQueue 权威账本+InstancePool+Execution 记录+原子认领接口+C9_CHECKING 调用（调用既有 accountGateCheck 零重写）+崩溃恢复窗口表（W0-A 账本直扫/W0-B/W1/W2）+幂等防双执行。
- ②修改文件：phase0/tools/queue_core.mjs（新增）、queue_service.mjs（CLI，双入口统一认领接口）、queue_core_cli_args.mjs（参数解析）、test_queue_service.mjs（五项测试）。
- ③修改内容：三契约状态文件（task-ledger/executions/instance-pool，原子写+回读+结构校验 fail-closed）；claimTask 原子认领（账本 lockfile 临界区+有界重试+READY 校验+deps VERIFIED+实例 IDLE+login_validated+幂等防双执行）；c9CheckAndStart（C9_CHECKING 唯一门禁状态，BLOCKED=零浏览器操作任务回 READY，ALLOWED=EXECUTING+Execution 创建）；mirrorSendState（send-state.json 权威源镜像）；recoverExecutions（W0-A 账本直扫+执行扫描四窗口）；completeExecution（REPORTED+token 核销）；auditLedger（幂等唯一/孤儿检测）。
- ④执行结果：实现完成；五项测试 5/5 PASS；**开发过程真缺陷两件如实登记**——W0-A 恢复缺口（恢复器原只扫 executions，认领后 C9 前崩溃无 Execution 记录不可见→补账本直扫）+测试断言 JSON 空格错配（实际输出紧凑无空格；并发机制本身经独立复现验证 1 成功 3 正确拒绝）。
- ⑤测试结果：**五项 5/5 PASS**（双入口并发认领 4 子进程恰 1 成功/崩溃恢复五点逐窗口/C9 BLOCKED 零浏览器+归一化放行/C6 四方追溯/回滚演练幂等唯一无孤儿无丢失）+phase0 统一回归 **12/12**（queue-phaseb 挂入跑器）+四腿 **122 项 canonical 全 OK**（Python 零改动）。
- ⑥验收证据引用：本步无独立派单（实现步），任务关联派单现场 dispatch-2026-11-21T00-04-09 等迁移与评审轮（reply SHA 见 DEC-132/141）；phase0/logs/queue-phaseb-tests.json；third-round-regression-2026-11-21T08-54-24/；**验收结论：PASS（实现完成，回归零回归）**。

## S2 独立验收（待派）

- ①本步骤目标：Phase B 骨架交 ChatGPT 独立验收（DEC-141 授权链：验收 PASS 后 Phase C 另行授权）。
- ②修改文件：无。
- ③修改内容：无。
- ④执行结果：（待验收后回填）
- ⑤测试结果：（待验收后回填）
- ⑥验收证据引用：（待验收后回填）
