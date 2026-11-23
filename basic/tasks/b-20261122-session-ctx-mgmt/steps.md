# 步骤清单（b-20261122-session-ctx-mgmt）

**方案状态：** design-r2.md v5-v9（CTX-R1..R9 裁定链，R9=设计 PASS+编码授权，7 条不可变约束）。

## S1 开工登记

①本步骤目标：登记用户原话（记录问题+根治会话上下文管理）+三次事故清单+根因分析。

②修改文件：basic/tasks/b-20261122-session-ctx-mgmt/{requirement.md,task-brief.md,steps.md,analysis.md}。

③修改内容：Standard/S3 选型（平台工具链代码修改）；M2 单任务登记；根因=按数不按量计数规则缺陷+无上限态检测+被动迁移（与 L-014 端口漂移同构）。

④执行结果：任务包建妥；侦察实测上限态 DOM 签名=持久横幅「上下文窗口已达上限」（check_conv_units --diagnose 实拍 @ 6b009b70）。

⑤测试结果：无独立测试项（开工登记）。

⑥验收证据引用：analysis.md；S4 验收派单轮回填（dispatch 目录+reply SHA）。

**验收结论：PASS**（登记齐备；独立验收证据随 S4 派单轮统一落盘）

## S2 方案协商（CTX-R1..R9 设计裁定链）

①本步骤目标：方案经 ChatGPT 逐轮裁定至设计 PASS。

②修改文件：design-r2.md（v5 统一权威版）；acceptance/ctx-r1-reply.txt；phase0/tools/brief_ctx_mgmt_r*.txt；phase0/logs/dispatch-2026-11-22T07-43-45 等 8 个派单现场；recoll-ctx-r2/r2b/r3/r4/r5 目录（5 次 fail-closed 补采）。

③修改内容：九轮裁定收敛——R1 有条件通过（阈值 24/48KB+max_turn_bytes+HARD 拒发）→R2b 架构认可+并发缺口→R3 手搓锁两竞态→R4 SQLite 方向认可+三边界→R5 并发首写/COMMIT 清理/BUSY 预算→R6 首写事务边界→R7 ROLLBACK 失败分支→R8 单出口+绝对 deadline→**R9 设计 PASS+编码授权**（审查会话迁移至 6b02a805，CONTEXT_LIMIT_STOP 实战触发验证）。

④执行结果：设计冻结 v9（SQLite 唯一账本/gen 条件更新/单出口连接处置/3000ms 绝对 deadline/7 条不可变约束）；审查方三编码细节提醒（isTransaction 属性用法/busy_timeout 连接级/C10 硬验收门）。

⑤测试结果：设计评审无测试执行项（如实标注）。

⑥验收证据引用：dispatch-2026-11-22T07-43-45（CTX-R1）+07-48-07（R2 补采）+recoll-ctx-r3/r4/r5（SHA256 见各 reply.txt）+dispatch-2026-11-22T08-29-06（R8，新审查会话 6b02a805-88f0-83ec-8fa3-ff4f30e21f65）+recoll-ctx-r9（R9 PASS，reply SHA256 见 acceptance/）。

**验收结论：PASS**（九轮设计裁定链闭环，R9 授权编码；依据 CTX-R9 reply）

## S3 编码实现（agent-kit + AIEO 接入）

①本步骤目标：session-budget.mjs 核心模块+测试矩阵；gpt_dispatch 接入预检门+记账；L-018§6 修订。

②修改文件：agent-kit monitor/session-budget.mjs+monitor/test-session-budget.mjs（分支 fix/session-budget）；AIEO phase0/tools/{gpt_dispatch.mjs,dispatch_options.mjs,check_conv_units.mjs}+docs/AI-DEV-LESSONS.md（分支 fix/session-ctx-mgmt）。

③修改内容：session-budget=SQLite 唯一账本/gen 条件更新/首写约束捕获显式 ROLLBACK/COMMIT 报错连接一律废弃单出口/3000ms 绝对 deadline（busy 动态截断+400ms 余量，实测 BEGIN 阻塞≈pragma+120ms）；gpt_dispatch=发送前预检门（HARD 拒发 SESSION_BUDGET_EXCEEDED/WARN 告警/账本异常 UNCERTAIN fail-closed/--allow-near-limit 显式紧急通道）+两时点记账（SEND_CONFIRMED 记 in/COMPLETED 记 out，失败仅告警不毁证据）；L-018§6 增补第 7 条字节预算规则。

④执行结果：agent-kit 分支 fix/session-budget（commit 见 S4 派单简报完整 SHA）；AIEO 分支 fix/session-ctx-mgmt。

⑤测试结果：**15/15 全绿**（T1-T7+C1-C10：node --test monitor/test-session-budget.mjs，含 C1 双进程并发/C4 旧 gen 条件更新 0 行/C8 双进程首写竞态/C10 busy_timeout 调大至 40000 仍 T_wall≤3000ms 实测）——存证 monitor/test-session-budget 输出随验收派单。

⑥验收证据引用：待 S4 验收派单轮回填。

## S4 独立验收（已完成：CTX-CODE-R8 编码验收 PASS，3/3）

①本步骤目标：代码验收派单（完整 SHA+三细节复验：isTransaction 属性用法/busy_timeout 连接级/C10 硬验收门）。

②修改文件：evidence/{r8-test-execution-evidence.md,test-session-budget-r8-run.log,test_ctx_budget_hooks-r8-run.log}（第 2 项补证）；phase0/logs/{dispatch-2026-11-23T03-09-42,recoll-ctx-code-r8,dispatch-2026-11-23T03-17-07,recoll-ctx-code-r8-recheck2}（派单/补采现场）；phase0/tools/{brief_ctx_code_r8_dispatch.txt,brief_ctx_code_r8_recheck2.txt,recoll_ctx_code_r8.mjs,recoll_ctx_code_r8_recheck2.mjs}；gpt-reviewer-session.json 迁移；本 steps.md。

③修改内容：编码验收 CTX-CODE-R1..R8 裁定链闭环。R7 三项整改（无条件 requireSessionBudget 前置 + 统一 assessBudgetGate + budgetUuid=null 走 skipped；agent-kit 23/23；生产账本快照入 commit）经 R8 首派（被测 SHA 353e190）复验；首轮 2 PASS/1 FAIL（第 2 项"证据不足"非代码缺陷——agent-kit 测试执行日志未入 AIEO 仓、审查方无法独立核验）。按审查方最小收尾动作补证：真实重跑 agent-kit core 23/23（@6d9aad05）+ AIEO hooks 9/9（@353e190）并落盘，逐文件 SHA-256 绑定双仓版本，补证 commit 4fe07fa 推送 GitHub；recheck2 续派仅重裁定第 2 项 → PASS。

④执行结果：CTX-CODE-R8 最终 3/3 PASS，审查方原始回复 `phase0/logs/recoll-ctx-code-r8/reply.txt`（首轮 2PASS/1FAIL，SHA 10b759fc…）与 `phase0/logs/recoll-ctx-code-r8-recheck2/reply.txt`（recheck2 PASS，SHA 55cd8a65…）。被测代码锚点 353e190，补证 commit 4fe07fa。审查会话由失效的 6b02a805（重定向至根路径，实测非上下文上限）迁移至 6b03aea8（--new-session 首派即活，指针已更新；旧指针留档 gpt-reviewer-session.pre-migration-20261123.json）。

⑤测试结果：agent-kit core `node --test monitor/test-session-budget.mjs` 23/23 exit0（evidence/test-session-budget-r8-run.log）；AIEO hooks `node --test phase0/tools/test_ctx_budget_hooks.mjs` 9/9 exit0（evidence/test_ctx_budget_hooks-r8-run.log）；均为本轮真实执行，含 C1/C8 双进程并发与 C10 busy deadline 实测。agent-kit 分支 fix/session-budget 对 damwate GitHub 403 无推送权，如实登记未绕过，源码经 session-budget-code.zip 入 AIEO 仓。

⑥验收证据引用：本步骤 ②③④⑤ 所列路径；会话迁移诊断 phase0/logs/diag-r8-target-20261123/diag.json（HTTP200+已登录+目标重定向根路径，排除上下文上限）；recheck2 reload 物化诊断 phase0/logs/diag-r8-recheck2-reload/after-reload.json（send-state=SEND_CONFIRMED 但 DOM 未物化→reload 后 4 unit，虚拟化卸载，未重发）。

**验收结论：PASS**（CTX-CODE-R8 编码验收闭环，3/3；仅余用户拍板合并 fix/session-ctx-mgmt → main，DEC-010）。
