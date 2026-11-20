# 并行派单阶段2 授权申请 + C9 账号级风控协调实现方案 R1（供审查方评审拍板）

- **申请事项：** ①C9 账号级风控协调实现方案评审（DEC-123 裁定的阶段2 前置硬条件）；②阶段2 授权：N=2 真实并发试跑。
- **基线：** main `4a961e4`（DEC-127 并行阶段1 已合入，R7 终签 PASS）；本方案随 main 提交。

## 一、C9 账号级风控协调实现方案 R1

**目标（照审查方 R2/R3 裁定口径）：** 账号级退避独立于实例锁——任何实例观察到 429/明确账号级限制，所有实例遵守同一退避状态；不允许一个实例已退避、另一个继续密集派单；不得把账号级退避错误实现为实例级退避。

**机制（全部复用已验证模式：M1 登记簿锁/原子写、端口注册表、实例域纯函数）：**

1. **共享状态文件（全实例同路径）：** `runtime/locks/account-risk-state.json`
   ```json
   { "version": 1, "state": "NORMAL|BACKOFF", "backoff_until": "<ISO>",
     "reason": "429-observed|manual", "observed_by": "<instance>", "observed_at": "<ISO>" }
   ```
2. **纯函数（dispatch_options.mjs，与实例域同层可测）：**
   - `evaluateAccountGate(state, nowMs)`：NORMAL→ALLOWED；BACKOFF 且 now<until→BLOCKED{until,reason}；BACKOFF 且 now≥until→EXPIRED_ALLOW；
   - `applyAccountBackoff(state, nowMs, reason, minutes)`：until=now+minutes；时长口径=下限 9 分钟（手册风暴通道）/上限 60 分钟（提请拍板③）；
   - 结构校验与端口注册表同纪律：损坏/数组/Map/Date/非普通对象→`ACCOUNT_STATE_INVALID` fail-closed。
3. **写入临界区：** `acquireSessionLock({ lockPath: <state>.lockfile })` 读改写原子（tmp+rename+回读）——与 M1/端口注册表同模式。
4. **gpt_dispatch 两处集成：**
   - **启动门**（mainLocked 最前、零浏览器操作前）：gate=BLOCKED 即 `ACCOUNT_BACKOFF_ACTIVE` 退出——实例域锁之前判定，退避期内任何实例的派单在拿锁前就被拒；
   - **观察点**：goto 后页面就绪检查处，body 含 "Too many requests"/429 标记（**只观察不诱发**，手册纪律）→ `applyAccountBackoff(9min)` + 本轮 `ACCOUNT_BACKOFF_TRIGGERED` fail-closed 退出；测试缝=AIEO_ACCOUNT_BACKOFF_MINUTES 环境变量（仅测试注入，生产默认关）。
5. **recoll 模板同步加启动门**：补采只读但退避期同样守 gate（避免退避期密集刷页）；default 实例同守（C9 是账号级，不分实例）。
6. **C7 兼容：** NORMAL 状态下 gate 零操作，单实例既有行为逐字节不变。

**测试计划（本地，不碰真实 ChatGPT）：** 纯函数全分支（NORMAL/BLOCKED/EXPIRED）、状态损坏与异型结构负例、临界区并发写、启动门 fail-closed、观察点注入触发、C7 兼容回归。

**真实证据边界（如实）：** 实现只保证机制在位；"真实 429→全实例退避"的实际行为在阶段2 C5 观察记录（不诱发、不制造限流）。

## 二、阶段2 试跑设计（N=2，全部一次性非敏感简报）

| 项 | 构造 | 判据 |
|---|---|---|
| C1 | 双实例并行各派独立新会话 | 双双成功互不干扰；回执/归档/UUID 独立对应 |
| C2 | 同实例域双进程并发 | 一成功一 fail-closed 锁冲突（互斥保持） |
| C3 | 一实例派单成功触发其浏览器清理 | 另一实例在途页/进程不受影响 |
| C4 | 双实例各自补采闭环 | 只回原会话，不跨实例串档 |
| C5 | 429 观察（不诱发） | 出现即全实例统一退避并如实记录 |
| C7 真实 | 不传 --instance 单实例派单 | 默认路径行为照旧 |
| C8 真实 | 端口冲突/锁残留观察 | fail-closed 行为符合设计 |

- 每项独立 PASS/FAIL/BLOCKED；失败即停；禁重试循环；副作用会话只登记留置（删除=DEC-010 用户另批）。
- 简报：`[TRIAL-P2-*|…]`，`--new-session --no-update-pointer`（不触碰审查会话与用户会话）。
- 分支：阶段2 全程在 `fix/parallel-stage2` 分支，不碰 main。

## 三、阶段3 预告（不在本申请内）

C6 观察期（N=2 连续多轮无隔离/误杀/串档/风控异常）→ 数据提交 → N=3 另行裁定。

## 四、提请拍板（四问）

1. C9 方案（共享状态文件+启动门+观察点+写入临界区+recoll 同门）是否认可？
2. 阶段2 授权（N=2 真实并发试跑，按上表矩阵）是否批准？
3. 退避时长口径（下限 9 分钟/上限 60 分钟）是否认可？
4. 阶段3（N=3 评估）进入条件是否按"C6 观察期无异常+资源数据提交"？
