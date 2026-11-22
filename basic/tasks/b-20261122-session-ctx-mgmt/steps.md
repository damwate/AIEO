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

## S4 独立验收（待执行）

①本步骤目标：代码验收派单（完整 SHA+三细节复验：isTransaction 属性用法/busy_timeout 连接级/C10 硬验收门）。

②③④⑤⑥：待派单后回填。
