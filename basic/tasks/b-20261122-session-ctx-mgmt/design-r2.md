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
- **并发安全（R2 复核追加，原子写≠并发安全）**：同 UUID 跨进程更新必须串行化——每账本配 <uuid>.lock 锁文件（O_EXCL 创建+PID+时间戳），持有 TTL=10s；获取锁重试退避 200ms×5 后仍失败=LEDGER_LOCK_TIMEOUT（fail-closed 转 UNCERTAIN，不静默放行）；锁持有进程崩溃=TTL 过期后接管（接管时核对 PID 存活）；锁内完成 读→改→写→rename 全程，锁释放用删除（幂等）。两个进程串行化后不存在后写覆盖前写；账本损坏（JSON 非法/字段缺失/类型错）=LEDGER_UNREADABLE fail-closed，不静默重建。
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
| T6 | 多仓共用 | 账本按 UUID 隔离无串用 |
| T7 | WARN 后新会话 | 自包含简报恢复审查上下文 |

## 6. 交付与部署序

1. agent-kit：monitor/session-budget.mjs+tests（分支或直提；agent-kit 治理按其仓库惯例）→本机 pull+deploy.ps1
2. AIEO：分支 fix/session-ctx-mgmt（gpt_dispatch 接入+check_conv_units 转正+L-018 修订+任务包）→自测（T1-T7）→独立验收→用户拍板合并（DEC-010）
