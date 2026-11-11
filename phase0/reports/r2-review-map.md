# R2 审查点定位图（供第三轮独立审查，不含任何 PASS 结论）

**R2 代码提交：** `7c03fde98aac80482e91524b02f139ec69ebc153`（父提交 `559f62774591e11f28284c0f860917066aa96bfb`）
**完整 Diff：** `phase0/logs/r2-review/r2-code-diff_559f627..7c03fde.patch`（750 行）或 GitHub commit 页
**行号基准：** R2 提交中的文件版本。三个代码文件 mtime（01:46:42–01:47:27）早于 run3 启动时刻（01:47:51，见 `logs/e2e-run.log`），run3 之后代码未被改动（7c03fde 中代码文件与 run3 执行版本一致）。

## 逐审查点：代码位置与诚实回答

### MAJOR-001-1 generationObserved 是否可能被历史停止按钮状态误触发

- `completion_judge.mjs:16-18`：tracker 每条消息**新建**（`sendAndCollect` 内 `e2e_orchestrate.mjs:189`），无跨轮状态。
- 初始值来源：`initialObserved: stopOk`（`e2e_orchestrate.mjs:189`）。`stopOk` 仅在**本轮 Enter 之后的 30 秒发送双验窗口内**被置位（`e2e_orchestrate.mjs:170-177` 循环），且双验通过的前提是尾部 unit 从基线**前进为 user**（`e2e_orchestrate.mjs:172` `tail.key !== baseline?.key`），即停止按钮的可见观察与本轮发送绑定。
- 流程保证：msg2 发生前 msg1 的 6 项判定已确认结束（含停止按钮不可见），编排流程中不存在上一轮生成态残留。
- 残余边界（如实声明）：`stopOk` 是窗口期内的闩锁值；若有人在该窗口内人工向同一会话发送消息，观察源不可区分。编排自动化流程中不发生该情形，但**未被代码级排除**，属运行边界而非误判缺陷（发生在发送后 30 秒内的人工干预会先破坏基线检查）。

### MAJOR-001-2 generationEnded 是否确实要求本轮可见→不可见

- `completion_judge.mjs:24-27`：`trackGeneration` —— 只有先 `generationObserved=true`（本轮真实观察到可见），其后某次观察 `!==true` 才置 `generationEnded=true`。顺序不可倒置。
- 测试场景 6（`test_completion_judge.mjs`）证明：从未观察到（observed=false）时 ended 永不置位、判定拒绝。

### MAJOR-001-3 300 秒超时是否存在异常吞噬或错误恢复

- `completion_judge.mjs:36-54`：deadline 循环，超时抛 `Error(code=GENERATION_TIMEOUT, tracker)`。
- `sendAndCollect` 无 try/catch 包裹该调用（`e2e_orchestrate.mjs:186-192`）→ 异常直接传播到 `main().catch`（`e2e_orchestrate.mjs:323-330`）：写 evidence（`e2e_loop_pass=false` + error）→ `process.exit(1)`。**无吞噬、无重试、无恢复**。
- 代码中所有 `.catch(() => {})` 仅用于非判定路径（browser.close、截图、killProfileChrome、innerText 兜底读取），不影响判定结果。
- 反向测试场景 2 真实执行该分支：150 次轮询（300000/2000）后断言抛出与 tracker 状态。

### MAJOR-001-4 最终停止按钮复查是否存在时序竞争

- 序列（`e2e_orchestrate.mjs:186-207`）：tracker 返回（已确认 ended）→ 75 秒确认窗 → `finalStopVisible = stopButtonVisible(page)`（195 行，时点读取）→ 读 tailAfter → 等 3 秒 → 读 tailAgain → 读 composerEmpty → 6 项判定。
- **诚实回答：存在理论上的极小时序窗口**——若确认窗与两次 UUID 读取之间生成状态重启（例如平台自动续跑），`uuid_stable`（两次读取 3 秒间隔）大概率捕获；但在**最后一次读取之后**重启则已判定的 confirmed 不会回滚。缓解：75 秒确认窗（手册口径，滤工具链间隙）+ UUID 双读 + 本 POC 会话无工具调用；**残余风险无法在不依赖服务端信号的前提下完全消除**，已作为 Phase 1 控制器实现时的已知边界记录（如需更强保证，Phase 1 可延长终读间隔或加第三次复核）。

### MAJOR-001-5 UUID 稳定性检查是否真正读取两次独立结果

- `e2e_orchestrate.mjs:196`（tailAfter = readTailUnit）与 `:198`（tailAgain = readTailUnit），中间隔 `waitForTimeout(3000)`（197 行）。两次都是**独立的 `page.evaluate` 全新 DOM 查询**，非缓存/复制。判定在 `completion_judge.mjs:67-69`（字符串严格相等）。

### MAJOR-001-6 反向测试是否覆盖生产代码全部关键分支

生产分支 → 测试映射（`test_completion_judge.mjs`，注入时钟/生成源，被测为 `sendAndCollect` 同一函数）：

| 生产分支 | 位置 | 测试场景 |
|---|---|---|
| 翻转成功路径（observed→ended→confirmed） | judge:36-48, 60-77 | 场景 1 |
| GENERATION_TIMEOUT 分支 | judge:49-53 | 场景 2（断言轮询恰 150 次） |
| COMPLETION_NOT_CONFIRMED（final_stop_button） | judge:79-88 | 场景 3（断言 checks 键） |
| COMPLETION_NOT_CONFIRMED（uuid_stable） | 同上 | 场景 4 |
| COMPLETION_NOT_CONFIRMED（composer_empty） | 同上 | 场景 5 |
| 从未观察到生成 → 拒绝 | judge:24-27 + 62-63 | 场景 6 |
| 双验种子路径（initialObserved） | judge:16-18 | 场景 1（种子后首轮即翻转） |

`finalizeCompletion`/`verifyCompletion`/`waitForGenerationEnd`/`trackGeneration`/`createGenerationTracker` 五个导出函数全部被执行；两个错误码均被断言。**未覆盖**：`e2e_orchestrate.mjs` 的 main catch 落盘路径（judge 测试不含），该路径已在 R1 返工的真实失败中执行过（临时仓库文件锁导致 exit 1，`logs/e2e-run.log` 历史段）。

### MAJOR-001-7 真实浏览器证据是否与最终提交 SHA 对应

- run3 执行时间 01:47:51–01:51:28（`logs/e2e-run.log`）；三代码文件 mtime 01:46:42–01:47:27，早于启动；7c03fde 提交于其后，且该提交对代码文件无后续改动（Diff 中代码文件只有这一次变更）。
- run3 日志含 **R2 代码独有的新日志行**（旧代码不可能输出）：`生成状态跟踪: observed=true ended=true`（`e2e_orchestrate.mjs:191`）与 `完成判定6项: {...}`（`e2e_orchestrate.mjs:207`）——`logs/e2e-evidence.json` 的 `steps[1].completion_checks`、`steps[5].completion_checks` 与日志一致。
- run3 产出提交 `f0b48418fe973a851fed8fbf4be204ad9ee0cdc0`（一次性仓库 runtime/e2e-repo，gitignored），源码+diff+SHA256 存档于 `logs/e2e-commit-evidence-f0b48418/`，可供独立比对。

## 审查材料索引

| 材料 | 路径 |
|---|---|
| R2 完整 Diff | `logs/r2-review/r2-code-diff_559f627..7c03fde.patch` / GitHub commit 7c03fde |
| 判定模块 | `phase0/e2e-poc/completion_judge.mjs` |
| 编排脚本（生产调用方） | `phase0/e2e-poc/e2e_orchestrate.mjs`（sendAndCollect: 140-215 区段） |
| 反向测试 | `phase0/e2e-poc/test_completion_judge.mjs` + `logs/rework2-judge-tests.{log,json}` |
| run3 结构化证据 | `logs/e2e-evidence.json`（steps + acceptance） |
| run3 提交存档 | `logs/e2e-commit-evidence-f0b48418/` |
| R2 返工报告（含未实测声明） | `reports/rework2-2026-11-12.md` |
