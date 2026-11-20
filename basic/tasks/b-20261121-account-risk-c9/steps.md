# 步骤清单：b-20261121-account-risk-c9

- 被测基线：c2e1b071083b17141d8d866f0575a5c68c70c4497bc90be45dde0c1d3a4854f1（main DEC-128 tip）；分支 fix/parallel-stage2。
- 方案依据：DEC-128 五约束；方案文档 parallel_stage2_apply_r1.md §一。

## S1 C9 实现（完成）

- ①本步骤目标：账号级风控协调机制落地——共享状态文件+纯函数三件+gpt_dispatch 双检查点+被动观察点+recoll 同门。
- ②修改文件：phase0/tools/dispatch_options.mjs（ACCOUNT_BACKOFF_MIN/MAX_MINUTES+accountStatePath+normalizeAccountState+evaluateAccountGate+applyAccountBackoff+readAccountStateFile+writeAccountStateFileAtomic）；phase0/tools/gpt_dispatch.mjs（accountGateCheck 双检查点+observeAccountRisk 被动观察+maybeApplyManualBackoff 运维缝+两处 goto 后观察调用）；phase1/tools/review_leg_recoll_template.mjs（C9 启动门——只读判定，缺失=NORMAL，活动 BACKOFF=补采暂停）。
- ③修改内容：五约束逐条——A 退避只延不缩（until=max(旧,新)）；B 缺失=NORMAL 初始化、损坏/异型（数组/Map/Date/坏结构）=ACCOUNT_STATE_INVALID fail-closed；C 过期归一化 NORMAL（expired-normalized）+可写侧原子写回；D 双检查点（startup 零浏览器操作前+pre-spawn/pre-reuse 浏览器操作前），残余竞态窗口（复查后至操作完成的微窗口）如实登记于方案文档 §一.4 由观察点写回+下轮启动门兜底；E 观察点被动（body 含 too many requests/429 才触发，时长 9min 默认=AIEO_ACCOUNT_BACKOFF_MINUTES 可覆盖，钳位[9,60]）；运维缝=AIEO_ACCOUNT_BACKOFF_TRIGGER_MINUTES 手动写入；C7=NORMAL 时 gate 零操作。
- ④执行结果：实现完成；test_account_gate.mjs 新建 8 项全 PASS；phase0 统一回归 12/12（新增 account-gate 挂入跑器）；四腿 36+30+25+31=122 项 canonical 全 OK（Python 仅模板增门，行为零变化）。
- ⑤测试结果：见④；node --check 三文件 OK。
- ⑥验收证据引用：本步无独立派单（实现步），任务关联派单现场 dispatch-2026-11-20T23-22-34（STAGE2-R1 申请轮，reply SHA-256=`c2e1b071083b17141d8d866f0575a5c68c70c4497bc90be45dde0c1d3a4854f1`）；phase0/logs/account-gate-tests.json、third-round-regression-2026-11-20T23-31-35/；**验收结论：PASS（实现完成，回归零回归）**。

## S2 独立验收（待派）

- ①本步骤目标：C9 实现交 ChatGPT 独立验收（DEC-128 ②：验收 PASS 后方可执行真实 N=2）。
- ②修改文件：无。
- ③修改内容：无。
- ④执行结果：（待验收后回填）
- ⑤测试结果：（待验收后回填）
- ⑥验收证据引用：（待验收后回填）
