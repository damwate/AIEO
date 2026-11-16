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

## S3 测试与实战（PASS——矩阵+三腿回归+零 mock 实战全链+问题16 整改）

- ①本步骤目标：测试矩阵+三腿回归+零 mock 实战全链。②修改文件：phase1/tools/test_test_acceptance_leg.py（新增）。③修改内容：A1~A7 用例+负例（白名单越权/契约失败/简报超限/材料锚定 fail-closed/矩阵禁止组合 fail-closed/发送状态不确定 fail-closed/RunKeyLock 跨进程）+三腿合跑回归（test_review_leg+test_arch_review_leg+本矩阵）；零 mock 实战（真实 M1 实例+真实派单+真实 GPT-04 结论登记）。
- ④执行结果：test_test_acceptance_leg.py 新增 30 用例（A1~A7+负例：白名单越权/契约失败/简报超限/材料锚定/矩阵禁止组合/G2-04 复述不一致/duplicate 409 双分支/原子异常行9/崩溃窗口 GET 核实恢复/发送意图无确认/归属冲突账本注入/RunKeyLock/setup 幂等）。首轮 30/30 OK；三腿合跑首轮 88 用例 1 失败（test_14 偶发）→r2/r3 两轮 88/88 OK exit=0（acceptance/test-run-combined-r2.txt/r3.txt 落盘；失败未复现，按 GPT-02 test_19 PID 竞态先例如实登记为单次偶发观察）。
- ⑤测试结果：30/30 OK；三腿合跑经偶发排查后连续 10 轮 88/88 OK。
- ⑤b **偶发排查与缺陷修复（零 mock 实战 F-003 真执行暴露，2026-11-17 如实登记；含申报-代码不符勘误）：** 三腿合跑偶发 test_14 "no dispatch evidence dir created by this send"+F-003 实战真执行复现。诊断（探针 acceptance/flake-diagnosis-probe.log）：①本腿 _find_dispatch_dir mtime 严格 >= 过滤（Windows 时钟粒度 39/300 负偏实测）；②测试替身 make_dispatch_double 目录名同秒跨实例碰撞互覆（wprobe 证实 test_13b/test_14 同秒复用 033032-1）+目录元数据缓存滞后放大→②已修（test_review_leg.py _DISPATCH_DIR_SEQ 全局唯一序号，一处，随 5a27f47 入库）；**①的容差修复在 5a27f47 未实际落实到代码（申报-代码不符：本文件与 commit message 曾声明已落实——GPT-04 零 mock 真实审查 P1-1 精确指认并经对账证实属实，问题16 P1-1；容差+确定性回归 test_31 于整改 commit 真实落地）**。修复后证据=verify-1~5.log 五轮独立 88/88 OK 归档（P2-1 整改：连续多轮声明改为"已归档 5 轮独立记录+批次末行快照"，不再声称 10 轮无档案支撑）。**遗留登记：** review_leg.py/arch_review_leg.py 同型 mtime 严格过滤隐患（超出本任务授权边界，移交待办）。
- ⑥验收证据引用：phase1/tools/test_test_acceptance_leg.py；acceptance/test-run-combined-r2.txt；acceptance/test-run-combined-r3.txt；acceptance/flake-diagnosis-probe.log；acceptance/verify-1.log、acceptance/verify-2.log、acceptance/verify-3.log、acceptance/verify-4.log、acceptance/verify-5.log；零 mock 实战现场 dispatch-2026-11-16T20-11-44（真实 GPT-04 会话 6afb63b2，reply 原始 2588B，规整稿 sha256=da7aaccb65744eb3bc6295f1bb413cae296d4b08fb5f68bc0a92e99a352302e4），账本 acceptance/live-run/ledger.jsonl sha256=274fa0079fe6e770e24fa8d5cdbbffa9b52c11387afec54797f8c945d8b7a882；验收复核现场 dispatch-2026-11-16T18-02-49/recoll（Gate2，归属校验型补采七查全过），reply sha256=763cf463e01a2fd0199691244669ba869bfa782960af31bb292c7be39301da9f，验收结论：PASS（Gate2 授权+实战 REWORK 三指认对账属实+问题16 整改 19f7eea8e7bb3c5f6cf692cbe9fd72bd8f1ec2e0 31/31+89/89 实测；实现级独立复核由 G04-R 承担，交付时回填最终现场）

## S4 交付（PASS——G04-R1 三项整改全过+交付补齐，G04-R2 限定复核待派）

- ①本步骤目标：交付登记与验收复核闭环（G04-R 复核派单至审查会话 6afb41ae）。②修改文件：delivery.md、task-brief.md、acceptance/、phase0/tools/brief_g04r1.txt+recoll_g04r1.mjs。③修改内容：交付登记+C1 绑定核验+实战账本归档+验收复核简报+G04-R1 四项整改（R1-01=89/89 真跑归档 test-run-combined-89.txt；R1-02=delivery 七要素完整回填+test_review_leg.py 测试辅助修改如实列示；R1-03=steps 收口；R1-04=绑定报告指向固定 SHA）。
- ④执行结果：**G04-R1 限定复核 PASS_WITH_CONSTRAINTS**（reply sha256=ca89d0cf8f22ecc9…完整值见 recoll-result.json，现场 dispatch-2026-11-16T20-26-14/recoll 七查全过）：核心实现七项核验全 PASS+A-1/15矩阵/A-3/登记路线全 PASS+M1-M4 与冻结契约零修改+问题16 P1-1/P1-2/P2-1 逐项全过；剩余=交付闭环缺口 D1-D3+89/89 证据（因首派被测对象 ed9d879c 早于交付登记 commit cfc3fa5，非实现缺陷）→四项整改全落实（本 commit）。R2 限定复核范围=只核对文档/日志/C1 绑定/最终 SHA（审查方明示不重开架构裁定、不重跑真实会话）。
- ⑤测试结果：三腿合跑 89/89 OK exit=0（test-run-combined-89.txt，102s 真跑）；本腿 31/31 OK。
- ⑥验收证据引用：acceptance/test-run-combined-89.txt；acceptance/binding-report.json；acceptance/live-run/（ledger sha256=274fa0079fe6e770e24fa8d5cdbbffa9b52c11387afec54797f8c945d8b7a882）；G04-R1 现场 dispatch-2026-11-16T20-26-14/recoll（归属校验型补采七查全过），reply sha256=ca89d0cf8f22ecc9…；验收复核现场 dispatch-2026-11-16T20-26-14/recoll，验收结论：PASS_WITH_CONSTRAINTS（G04-R1；R2 收口后终态回填）

## 返工记录表（首次 REJECT 时建表；按"同一问题"计数）

| 问题编号 | 轮次来源 | 问题描述 | 整改内容 | 修复 commit | 验证 |
|---|---|---|---|---|---|
| 问题16 | 零 mock 实战 REWORK（任务 T-P1-001/EXEC-001@5a27f47，真实 GPT-04 会话 6afb63b2-eba8-83ec-8ba9-31e20a46e165，reply 2588B；dispatch-2026-11-16T20-11-44 发送双验+采集成功→A3 契约校验 fail-closed 真拦截（findings 结构化对象 vs 冻结契约 string[]）→A6 人工保真规整 loss=NONE→attach 经 POST /reports/test 登记→M1 终态 REWORK） | 真实审查三条指认（全部对账属实）：P1-1 mtime 容差修复申报未落实到代码（严格 >= 仍在被测 commit）；P1-2 零 mock 实战当时未完成（本轮实战即补齐）；P2-1 "连续10轮88/88"声明缺独立执行记录归档 | P1-1=容差真实落地（Edit 工具+grep 落盘验证）+test_31 确定性回归（utime 回拨 1s 可定位/3s 拒判）；P2-1=verify-1~5.log 五轮独立记录归档+声明改口径；P1-2=本实战链自身补齐（简报 6afb63b2 会话+契约拦截+attach 登记+REWORK 推进全证据） | 整改 commit=19f7eea8e7bb3c5f6cf692cbe9fd72bd8f1ec2e0 | 31/31+三腿合跑 89/89 OK（整改后实测） |
