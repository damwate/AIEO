# 会话上下文管理根治设计 R2（吸收 CTX-R1 裁定）

- 任务：b-20261122-session-ctx-mgmt；R1 裁定=有条件通过（dispatch-2026-11-22T07-43-45，reply SHA256 见 acceptance/）；本版=R2 设计整改
- 架构原则（R1 裁定）：**核心在 agent-kit monitor 层统一实现**（会话生命周期管理跨仓共性问题），账本数据存**本地持久化目录**（非 git 追踪），按会话 UUID 隔离；AIEO phase0/tools 只保留接入+验收测试

## 1. 核心模块：agent-kit `monitor/session-budget.mjs`（新增）

**API（纯函数+文件 I/O，不依赖浏览器）：**

```
loadLedger(uuid)            → ledger | null（不存在=可证明为空）
assess(uuid, opts?)         → { state: NORMAL|WARN|HARD, totals, thresholds }
                              账本缺失=NORMAL(空)；读取损坏/IO错误=throw LEDGER_UNREADABLE（调用方 fail-closed 转 UNCERTAIN）
recordTurn(uuid, {inBytes,outBytes}) → 原子写更新（tmp→rename→fsync 目录尽力而为）
STATE: NORMAL <24KB ≤ WARN <48KB ≤ HARD（in+out 累计 UTF-8 字节；含 maxTurnBytes 单轮峰值字段）
```

- **账本路径**：`~/.agents/session-usage/<uuid>.json`（机器级本地持久化；同 UUID 跨仓共享=同一 ChatGPT 会话的预算本就该共享；不同 UUID 天然隔离，防串用）
- **字段**（R1 裁定）：`{uuid, turns, in_bytes, out_bytes, total_bytes, max_turn_bytes, first_at, last_at, budget_version:1}`
- **原子化**（P1-1）：写临时文件→fsync→rename→父目录 fsync 尽力而为（Windows 平台差异登记）。
- **并发安全协议 v4（SQLite 事务账本——用被证明的原语替代手搓锁；回应 R3 两竞态与"采用真正原子条件更新语义"整改要求）**：
  - **存储**：单库 ~/.agents/session-usage/session-usage.db（SQLite，WAL 模式，busy_timeout=5000ms），表 ledger(uuid TEXT PRIMARY KEY, turns, in_bytes, out_bytes, total_bytes, max_turn_bytes, gen INTEGER, first_at, last_at, budget_version)——每会话一行；同 UUID 跨仓=同一行（共享口径），不同 UUID=不同行（隔离口径不变）。
  - **原子条件提交（回应 P0-2）**：BEGIN IMMEDIATE → UPDATE ledger SET ... gen=gen+1 WHERE uuid=? AND gen=?（gen=读取时值）→ changes==0 ⇒ GEN_CONFLICT ⇒ ROLLBACK 放弃（旧持锁者恢复后提交必然命中 0 行，不可被接管插入——WHERE 求值与写入提交在 SQLite 锁内原子完成）→ changes==1 ⇒ COMMIT。检查与提交之间不存在窗口：真正的原子条件更新。
  - **接管机制整体删除（回应 P0-1）**：没有锁文件就没有接管竞态——SQLite 内部锁（WAL+busy_timeout）负责写者串行化；hung 进程不持有跨 I/O 的锁（事务短即提交/回滚），挂起期间他人正常推进，hung 者恢复后条件 UPDATE 因 gen 已变命中 0 行。心跳/TTL/选主/接管恢复规则全部不再需要（如实登记为"机制消除"而非"规则补齐"）。
  - **fail-closed**：SQLITE_BUSY 重试 3×500ms 后=LEDGER_BUSY_TIMEOUT（转 UNCERTAIN 拒发）；库损坏/打不开=LEDGER_UNREADABLE（fail-closed，不静默重建）；账本"不存在"=可证明为空（NORMAL 空账本语义不变）。
  - **驱动**：Node 24 内置 node:sqlite（DatabaseSync，零原生依赖，deploy.ps1 无需编译）；agent-kit monitor/session-budget.mjs 只做 SQL 封装+assess 状态机。
  - **获取失败语义**：活跃锁退避 200ms×5 后=LEDGER_LOCK_TIMEOUT（fail-closed 转 UNCERTAIN，不静默放行）；账本损坏=LEDGER_UNREADABLE 不静默重建。
- **fail-closed**（P1-3）：账本损坏/读取失败→assess 抛 LEDGER_UNREADABLE，调用方置 UNCERTAIN 禁自动放行，要求修复账本或新会话
- **阈值**：默认 WARN=24576B/HARD=49152B（24/48KB，首版工程预算估计值，budget_version=1）；env `SESSION_BUDGET_WARN/HARD` 可覆盖；按真实样本校准后 bump version

## 2. AIEO 接入：`phase0/tools/gpt_dispatch.mjs`

1. **发送前预检门（HARD 在发送前执行）**：目标会话 assess→HARD=拒发 `SESSION_BUDGET_EXCEEDED`+输出迁移指引（--new-session+自包含简报要素清单）；WARN=告警继续；assess 抛错→UNCERTAIN 拒发（P1-3）。紧急通道=`--allow-near-limit`（显式旗标+输出留痕，无静默绕过）
2. **账本更新**：发送双验通过后记 in_bytes（payload）；采集 COMPLETED 后记 out_bytes（reply）；单轮峰值=max(in+out)
3. **UNCERTAIN 诊断增强**：未送达分支追加横幅扫描（复用 check_conv_units --diagnose 同款关键词逻辑）→命中=输出 `CONTEXT_LIMIT_BANNER_SUSPECTED`（根因报告，与字节预算独立：预算=预测风险，横幅=已发生耗尽，任一触发进保护流程）
4. **依赖注入**：module 路径解析顺序=env `AGENT_KIT_DIR`→`D:/CommonProjects/agent-kit`（本机已 deploy）；模块缺失=派单前 fail-closed 报 `SESSION_BUDGET_CORE_MISSING`（不静默降级）

## 3. `check_conv_units.mjs --diagnose`（已实现，转正登记）

横幅关键词扫描（上下文/已达上限/maximum length/too long/无法发送）+composer/send 键态；只读；关键词命中=诊断信息非状态门（遵守手册 §5.1 边界）。

## 4. L-018§6 修订（规范层）

在"4 条 user 消息即评估迁移"规则旁增补：**字节预算规则**（账本+预检门为主防线，消息数规则为冗余备份）；登记 6b009b70 案例（~8 轮撞上限，单轮 reply 达 10KB，按数计失真）；阈值首版为估计值声明。

## 5. 验收测试矩阵（R1 裁定 7 条，全须真实执行）

| # | 场景 | 预期 |
|---|---|---|
| T1 | 7 条消息但累计>48KB | 拦截（SESSION_BUDGET_EXCEEDED） |
| T2 | 仅 2 条消息但单轮输出 10KB | 正确累计（max_turn_bytes 反映） |
| T3 | 账本损坏 | UNCERTAIN 禁放行 |
| T4 | DOM 出现上限横幅 | 检测命中（--diagnose+诊断路径） |
| T5 | 新会话 UUID | 独立账本建立 |
| T6a | 同一 UUID 两仓读写 | 命中同一份账本（共享口径） |
| T6b | 不同 UUID | 账本完全隔离无串用 |
| T7 | WARN 后新会话 | 自包含简报恢复审查上下文 |
| C1 | 两进程并发更新同 UUID | 累计值不丢失（锁串行化+gen CAS） |
| C2 | 锁被占用 | 等待方按超时转 UNCERTAIN |
| C3 | 持锁进程异常退出 | 过期锁安全接管（唯一接管者） |
| C4 | 旧持锁者接管后继续写 | gen CAS 失败，不覆盖新账本 |
| C5 | 释放锁 | token 不匹配不删他人锁 |

## 6. 交付与部署序

1. agent-kit：monitor/session-budget.mjs+tests（分支或直提；agent-kit 治理按其仓库惯例）→本机 pull+deploy.ps1
2. AIEO：分支 fix/session-ctx-mgmt（gpt_dispatch 接入+check_conv_units 转正+L-018 修订+任务包）→自测（T1-T7）→独立验收→用户拍板合并（DEC-010）
