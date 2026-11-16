# 步骤清单：b-20261117-gpt04-test-acceptance-leg

## S1 设计（PASS）

- ①本步骤目标：完成同构复制方案设计与 /reports/test 路线适配点清单。设计输入：charter v0.3（§3 D2 同构复制/A-1 白名单定稿/A-2 契约定稿/A-3 恢复矩阵 12 行/§4 15 组合矩阵）+arch_review_leg.py 结构实读（A0-A5 编排/EngineM1Client 参数化/RunKeyLock/_resume_inner/attach-reply）。
- ②修改文件：无（设计步，产出落 acceptance/design-notes.md）。
- ③修改内容：同构差异对照表（GPT-02→GPT-04：关口态 ARCH_REVIEW→TEST_ACCEPTANCE；登记路线 B artifacts×2+events→/reports/test 原生端点+duplicate 语义恢复；结论域映射 PASS→ACCEPTED/REWORK→REWORK；简报输入=验收标准+测试证据显式指针；契约=envelope+test-acceptance-review；ENGINE-02→ENGINE-03）+组合矩阵实现点+恢复矩阵 12 行映射。
- ④执行结果：acceptance/design-notes.md（13 维差异对照表/白名单 query 模板口径/矩阵与恢复矩阵实现映射/风险清单 5 项）。
- ⑤测试结果：不适用（设计步）。
- ⑥验收证据引用：acceptance/design-notes.md；charter v0.3（DEC-090）+arch_review_leg.py 1278 行实读；立项级复核现场 dispatch-2026-11-16T18-02-49/recoll（归属校验型补采七查全过），reply sha256=763cf463e01a2fd0199691244669ba869bfa782960af31bb292c7be39301da9f，验收结论：PASS（Gate2 终裁统一覆盖本步骤设计裁定=同构复制/白名单 7 端点/12 行恢复矩阵/契约字段；实现级独立复核由 G04-R 承担，交付时回填最终现场）

## S2 实施（PASS）

- ①本步骤目标：实现 test_acceptance_leg.py+契约落位+bootstrap。②修改文件：phase1/tools/test_acceptance_leg.py（新增）、contracts/v1.0/test-acceptance-review.schema.json（新增落位冻结）、phase1/tools/test_review_leg.py 不动、phase1/tools/review_leg.py 不动。③修改内容：A0 前置核查（TEST_ACCEPTANCE 态+allowed_events+验收标准/证据齐备）→A1 简报组装（显式证据指针+绑定字段+≤1200B）→A2 派单（M2 链复用三态账本）→A3 采集+归属强制校验+Ajv 契约校验→A4 结论登记（/reports/test：PASS/REWORK 提交端点内原子推进；15 组合矩阵 fail-closed；BLOCKED→artifacts+messages 留证）→A5 终态核对+A-3 12 行 resume+attach-reply 人工退路+RunKeyLock+setup-agents（ENGINE-03）。
- （红线核对）M1-M4 零修改（不触碰 app/）；scheduler.py 零修改；既有冻结契约零修改（新契约=新增文件）；1200B 硬限；敏感信息不入日志。
- ④执行结果：test_acceptance_leg.py 新增（~1100 行：A0 前置核查+F-003 事实读入/A1 简报四组输入/A2 派单三态账本/A3 采集+归属强制校验+Ajv 三重校验+15 组合矩阵/G2-04 复述一致性/A4 artifacts×2+messages 任务级信封+/reports/test 原生登记+duplicate 409 GET 五字段核实/A5 终态核对+原子异常行+A-3 12 行 resume+_recover_result_from_m1+attach-reply+RunKeyLock+setup-agents）；test-acceptance-review.schema.json 落位（新增文件，H2）。零修改：review_leg.py/arch_review_leg.py/scheduler.py/app/ 逐行未触碰。
- ⑤测试结果：见 S3（本腿 30 用例+三腿合跑 88）。
- ⑥验收证据引用：phase1/tools/test_acceptance_leg.py；contracts/v1.0/test-acceptance-review.schema.json；acceptance/design-notes.md；立项级复核现场 dispatch-2026-11-16T18-02-49/recoll（归属校验型补采七查全过），reply sha256=763cf463e01a2fd0199691244669ba869bfa782960af31bb292c7be39301da9f，验收结论：PASS（Gate2 授权范围内实现；本步骤代码级复核由 G04-R 承担，交付时回填最终现场）

## S3 测试与实战（IN_PROGRESS——矩阵+三腿回归完成，零 mock 实战进行中）

- ①本步骤目标：测试矩阵+三腿回归+零 mock 实战全链。②修改文件：phase1/tools/test_test_acceptance_leg.py（新增）。③修改内容：A1~A7 用例+负例（白名单越权/契约失败/简报超限/材料锚定 fail-closed/矩阵禁止组合 fail-closed/发送状态不确定 fail-closed/RunKeyLock 跨进程）+三腿合跑回归（test_review_leg+test_arch_review_leg+本矩阵）；零 mock 实战（真实 M1 实例+真实派单+真实 GPT-04 结论登记）。
- ④执行结果：test_test_acceptance_leg.py 新增 30 用例（A1~A7+负例：白名单越权/契约失败/简报超限/材料锚定/矩阵禁止组合/G2-04 复述不一致/duplicate 409 双分支/原子异常行9/崩溃窗口 GET 核实恢复/发送意图无确认/归属冲突账本注入/RunKeyLock/setup 幂等）。首轮 30/30 OK；三腿合跑首轮 88 用例 1 失败（test_14 偶发）→r2/r3 两轮 88/88 OK exit=0（acceptance/test-run-combined-r2.txt/r3.txt 落盘；失败未复现，按 GPT-02 test_19 PID 竞态先例如实登记为单次偶发观察）。
- ⑤测试结果：30/30 OK；三腿合跑经偶发排查后连续 10 轮 88/88 OK。
- ⑤b **偶发排查与两处真缺陷修复（零 mock 实战 F-003 真执行暴露，2026-11-17 如实登记）：** 三腿合跑首两轮各 1 次失败（test_14 "no dispatch evidence dir created by this send"）+F-003 实战真执行复现同一失败。诊断（探针驱动 acceptance/flake-diagnosis-probe.log）：①本腿 _find_dispatch_dir 的 mtime 严格 >= 过滤——Windows 时钟粒度下文件 mtime 可早于同刻 time.time() 采样（探针实测 39/300 负偏）→加 2 秒容差（request.txt 与本轮 brief 字节严格一致=归属强证据不变，容差仅放宽候选窗口，最新优先仍取本次尝试）；②测试替身 make_dispatch_double 目录名=秒级时间戳+实例内 n——同秒跨实例碰撞时 mkdir(exist_ok=True) 复用同目录互覆现场（探针 wprobe 证实 test_13b/test_14 同秒复用 033032-1）+Windows 目录元数据缓存滞后放大→test_review_leg.py 加全局唯一序号（_DISPATCH_DIR_SEQ，一处；测试基建适配沿 GPT-02 3 行适配先例）。修复后连续 10 轮 88/88 OK（首修复批 1 次失败与已知 test_19 PID 复用竞态（DEC-088 登记）同率且未再现）。**遗留登记：** review_leg.py/arch_review_leg.py 同型 mtime 严格过滤隐患（两腿实战未触发；修复属已 PASS 腿代码，超出本任务授权边界，登记待办移交）。
- ⑥验收证据引用：phase1/tools/test_test_acceptance_leg.py；acceptance/test-run-combined-r2.txt；acceptance/test-run-combined-r3.txt；acceptance/flake-diagnosis-probe.log

## S4 交付（PLANNED）

- ①本步骤目标：交付登记与验收复核闭环（G04-R 复核派单至审查会话 6afb41ae）。②修改文件：delivery.md、task-brief.md、acceptance/。③修改内容：交付登记+C1 绑定核验+实战账本归档+验收复核简报。
- ④执行结果：（后回填）⑤测试结果：（后回填）⑥验收证据引用：（交付时回填）

## 返工记录表（首次 REJECT 时建表；按"同一问题"计数）

（暂无——无 REJECT 历史）
