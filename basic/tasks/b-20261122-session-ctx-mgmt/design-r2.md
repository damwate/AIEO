# 会话上下文管理根治设计 v5（唯一权威版；v1-v4 历史见 git）

- 任务：b-20261122-session-ctx-mgmt；裁定链：CTX-R1 有条件通过→R2b 架构认可+并发缺口→R3 两竞态→R4 SQLite 方向认可+三边界未关→**本 v5 逐条关闭**（回应 R4 整改要求：事务时序+挂起边界/存储协议统一/测试矩阵同步）
- 架构（R4 已认可，不再变动）：核心=agent-kit monitor/session-budget.mjs；存储=**SQLite 单库唯一权威账本**；AIEO phase0/tools 只保留接入+验收测试

## 1. 存储（SQLite = 唯一权威账本）

- 库：~/.agents/session-usage/session-usage.db（WAL 模式，busy_timeout=5000ms）；驱动=Node 24 内置 node:sqlite（DatabaseSync，零原生依赖）
- 表：ledger(uuid TEXT PRIMARY KEY, turns INTEGER, in_bytes INTEGER, out_bytes INTEGER, total_bytes INTEGER, max_turn_bytes INTEGER, gen INTEGER NOT NULL, first_at TEXT, last_at TEXT, budget_version INTEGER NOT NULL)
- **v4 文档中的 JSON 账本（<uuid>.json+tmp/fsync/rename）、文件锁（<uuid>.lock/owner token/TTL/心跳/接管/选主）全部废弃**——SQLite 是唯一权威存储；无迁移输入（首版即 SQLite，无历史 JSON 账本需要迁移）；旧错误码 LEDGER_LOCK_TIMEOUT 废除，由 LEDGER_BUSY_TIMEOUT 取代
- UUID 口径不变：同 UUID 跨仓=同一行（同一 ChatGPT 会话的预算本应共享）；不同 UUID=不同行（隔离防串用）；UUID 缺失/非法=拒绝，不猜测

## 2. 事务协议（R4 P0-2 精确时序）

写路径 recordTurn(uuid, {inBytes, outBytes}) 的**完整时序**：

1. **事务外**读账本快照：SELECT gen, turns, … WHERE uuid=?——**账本无该行=INSERT 路径**（新会话，gen 从 0 起）；库打不开/损坏=LEDGER_UNREADABLE（fail-closed，不得静默建空库覆盖）
2. **事务外**纯内存计算新值（新 turns/in/out/max_turn_bytes/gen=G+1）——**禁止任何网络/浏览器/文件/等待类外部 I/O**
3. BEGIN IMMEDIATE（取得写事务资格）
4. 事务内条件更新：INSERT …（新行路径）或 UPDATE ledger SET …, gen=gen+1 WHERE uuid=? AND gen=G
5. changes==1 ⇒ COMMIT；changes==0 ⇒ ROLLBACK（显式结束本事务）后**重走第 1 步**。语义精确化（R6 P0）：**GEN_CONFLICT=放弃"旧快照写入尝试"，绝不放弃已确认的 turn 计数**——执行顺序=ROLLBACK 结束事务→重读账本最新状态→在最新状态上重新计算新值→开启新事务重试条件更新；**禁止静默丢弃已确认 turn**（丢计数=数据丢失）。重试上限 3 轮，仍冲突=LEDGER_GEN_CONFLICT_EXHAUSTED 如实上抛（调用方 UNCERTAIN），不无限循环
6. **并发首写竞态（R5 P0-1，R6 补事务边界）**：两进程同读"无该行"→后到者 INSERT 命中 PRIMARY KEY 唯一约束=SQL 异常（**不是 changes==0**）——处理**执行顺序**=①按错误码捕获（node:sqlite SQLITE_CONSTRAINT_PRIMARYKEY，不得把所有 SQLITE_CONSTRAINT 当首写冲突）→②**显式 ROLLBACK 结束当前事务**（SQLite 默认 ABORT 只回滚当前语句不结束事务；不 ROLLBACK 就重读会仍在原写事务内持有写锁）→③确认事务已结束→④重读账本取最新 gen→⑤开启**新事务**走 gen 条件更新→两轮数据都被累计（C8 断言=两 turn 都在账本中，非仅行存在）
7. **COMMIT 失败清理（R5 P0-2，R6 补连接处置映射）**：COMMIT 可能失败（如 BUSY）且事务仍活动——**状态检查结果必须映射到明确连接处置**：①COMMIT 失败+事务仍活动=显式 ROLLBACK，成功→连接可复用；②ROLLBACK 也失败=**废弃连接（close 不复用）**；③提交结果不确定（COMMIT 报错但实际可能已提交）=**该连接标记不可复用并关闭**，本轮 LEDGER_COMMIT_UNCERTAIN 如实上抛（不计成功、不重放同轮计数），调用方按 UNCERTAIN 处理，**后续调用必须新建连接**，不得误用提交状态不明的连接（C9 覆盖四分支：ROLLBACK 成功/ROLLBACK 失败关闭/结果不确定不复用/后续新连接）
8. **BUSY 等待预算统一（R5 P1-1，R6 修正口径冲突）**：**§1 与本步统一 busy_timeout=500ms**（§1 的 5000ms 已改）；单次 SQL 阻塞上限 500ms，外部重试 3 次（间隔 200ms），全程至多 4 次尝试——**计时口径=含重试间隔与 SQL 执行开销的实际墙上时间，不假设非阻塞耗时为零**；C10 断言=实测墙上时间上限（≈2-3s 内），不只检查配置值
9. SQLITE_BUSY 预算耗尽=**LEDGER_BUSY_TIMEOUT**（调用方转 UNCERTAIN 拒发，fail-closed）

assess(uuid) 读路径：普通 SELECT（无需事务）；同上错误语义。

## 3. 事务挂起边界（R4 P0-1）

- **事务必须极短**：事务内只有第 4-5 步的 SQL 执行——**禁止**网络、浏览器、文件 I/O、用户交互、等待或其他外部操作（计算全部在第 2 步事务外完成）
- **两种挂起形态的界定**：
  - *读取后、开事务前挂起*（C4 场景）：他人可正常提交；恢复后条件 UPDATE 命中 0 行=GEN_CONFLICT 放弃——安全
  - *已开写事务后挂起*（C6 场景）：SQLite 写锁被持有，其他写者阻塞至 busy_timeout 耗尽=LEDGER_BUSY_TIMEOUT **fail-closed 拒发**——**不声称"挂起期间其他写者正常推进"**；缓解=事务极短纪律（毫秒级）+busy 重试窗口；进程死亡时 SQLite 自动回滚未提交事务（C3 场景），他人继续
- 诚实声明：进程存活但事务内挂死是 SQLite 写锁的固有边界，防线=挂起概率极低（事务内无外部 I/O）+BUSY 超时 fail-closed（宁可拒发不可静默）

## 4. 阈值与状态机（不变，R1-R4 已认可）

- 状态：NORMAL<24KB ≤WARN<48KB ≤HARD（in+out 累计 UTF-8 字节；budget_version=1 首版工程预算估计值；env SESSION_BUDGET_WARN/HARD 覆盖须校验，非法值不得静默放宽门槛；校准后 bump version）
- WARN=告警+建议 --new-session；HARD=默认拒发（发送前执行）+迁移指引；紧急通道仅 --allow-near-limit 显式旗标留痕，不绕过账本更新与审计
- UNCERTAIN 独立于 NORMAL（P1-2）：诊断证据不足=UNCERTAIN 禁自动放行
- 横幅扫描与字节预算**两条独立诊断路径**（预测 vs 已发生），任一触发进保护流程；模块缺失=SESSION_BUDGET_CORE_MISSING 不静默降级

## 5. 验收矩阵（T1-T7 保留 + C1-C7 SQLite 专项，采纳 R4 裁定表）

| # | 场景 | 预期 |
|---|---|---|
| T1 | 7 条消息但累计>48KB | 拦截 SESSION_BUDGET_EXCEEDED |
| T2 | 仅 2 条消息但单轮输出 10KB | 正确累计（max_turn_bytes 反映） |
| T3 | 账本损坏 | UNCERTAIN 禁放行 |
| T4 | DOM 出现上限横幅 | 检测命中（--diagnose+诊断路径） |
| T5 | 新会话 UUID | 独立账本行建立 |
| T6 | 多仓共用 | 同 UUID 同行共享；异 UUID 行隔离无串用 |
| C8 | 两进程并发首次写同 UUID | 唯一约束捕获→显式 ROLLBACK→重读→新事务 gen 更新；**断言两 turn 都在账本** |
| C9 | COMMIT 失败四分支 | ROLLBACK 成功可复用/ROLLBACK 失败废弃连接/结果不确定连接关闭不复用/后续调用新连接 |
| C10 | BUSY 等待预算 | 实测墙上时间上限（含间隔与开销，≈2-3s 内），耗尽=LEDGER_BUSY_TIMEOUT |
| T7 | WARN 后新会话 | 自包含简报恢复审查上下文 |
| C1 | 两独立进程并发更新同 UUID | 累计值不丢失 |
| C2 | 写事务被占用 | busy 等待超时=LEDGER_BUSY_TIMEOUT 转 UNCERTAIN |
| C3 | 写事务进程异常退出 | SQLite 自动回滚，其他进程继续写入 |
| C4 | A 事务外读 G 后暂停；B 提交 G+1；A 恢复 | 条件更新 changes=0，放弃旧写入 |
| C5 | 旧协议残留 | 代码与测试均不依赖锁文件/token/TTL/接管 |
| C6 | 事务内进程挂起 | 其他写者按 busy 期限 fail-closed，不误报成功 |
| C7 | 库损坏/schema 不兼容/初始化失败 | LEDGER_UNREADABLE，不静默建空库覆盖 |

## 6. 交付与部署序（不变）

1. agent-kit：monitor/session-budget.mjs+tests（T1-T7/C1-C7 真实执行存证）→本机 pull+deploy.ps1
2. AIEO：分支 fix/session-ctx-mgmt（gpt_dispatch 接入预检门+UNCERTAIN 横幅诊断+check_conv_units --diagnose 转正+L-018§6 修订）→自测→独立验收→用户拍板合并（DEC-010）
