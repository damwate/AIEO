# steps：b-20261116-session-migrate-4rounds（会话迁移评估阈值 约10轮→4轮）

- 拍板记录：用户 2026-11-16 任务指令（requirement.md 全文）+ 方案复审共识（ChatGPT"共识达成，按 3 处补充口径后实施"，reply sha256=bf4bbc1d305870a6712881cbd3e5957a33aaf0cd1b0e615bb45e09cda6f6bb04，现场 dispatch-2026-11-16T11-59-52，新会话 6afaf06f-f9b4-83ee-b6e8-c2f789d1dc4c）+ 用户实施批准（"可以"）；按 L-020 节点自主推进授权执行
- 冻结方案要点：
  - 规则唯一定义点=docs/AI-DEV-LESSONS.md L-018 第 6 条；AGENTS.md 映射行同步固化"累计达 4 轮"；decision-log 登记 DEC-084（顺延编号，不覆盖既有 DEC-071）
  - 口径（共识定稿）：计数仅含 user 消息（不含 AI 回复/工具调用）；新会话正式接棒后归零；第 4 条 user 消息=主动评估触发点，非强制迁移点；暂不迁移须记录理由，此后每增 2 条 user 消息重评一次
  - 三类例外：临近完成验收/简单任务上下文清晰/用户明确要求暂不迁移——例外不长期绕过，延期后按 2 条重评
  - 不改动：1200 UTF-8 字节限制/GitPointer 交接契约/CONTEXT_LIMIT_STOP 安全停止语义/交接四项判定/中级版代码与测试/历史任务包记录/agent-kit 手册
  - 仅修改必需文件：docs/AI-DEV-LESSONS.md、AGENTS.md、docs/phase1/decision-log.md、本任务包三件套

## S1 规则修改（M1~M3）

- ①本步骤目标：L-018 第 6 条阈值文字改为 4 轮口径（含补充口径规则文字）；AGENTS.md 映射行固化"累计达 4 轮"；decision-log 登记 DEC-084
- ②修改文件：docs/AI-DEV-LESSONS.md、AGENTS.md、docs/phase1/decision-log.md、本任务包三件套
- ③修改内容：M1=L-018 第 6 条"主动迁移"段改写（4 轮口径+评估非强制+归零+重评+三类例外）；M2=AGENTS.md"审查会话上下文上限"映射行补"累计达 4 轮"；M3=decision-log 追加 DEC-084（用户指令原文/共识依据 reply sha256/生效范围/旧阈值废止）。既有其他条款零删改；历史记录不改写。**被测 commit 完整 SHA 见申报记录（ST-01 绑定申报）**
- ④执行结果：M1 完成（L-018 第 6 条"主动迁移"段改写：4 条 user 消息阈值+评估非强制+接棒归零+每增 2 条重评+三类例外；旧"实测约 10+ 轮"表述废止）；M2 完成（AGENTS.md 映射行固化"累计达 4 条 user 消息"）；M3 完成（DEC-084 登记，含编号勘误声明）；既有其他条款零删改
- ⑤测试结果：（S2 ST-05 实际输出回填）
- ⑥验收证据引用：S1/S2/S3 合并独立验收 **R1**=现场 `dispatch-2026-11-16T13-18-39`（审查会话 6afb02e6-cb80-83ec-b241-2f35a51ca659；简报 `phase0/tools/session-migrate-4rounds-accept-r1.txt` 1198B；此前同会话两次派单 goto 超时/composer 超时均**未投递**，按 ST-08 路径①换新会话重派），reply 4733B，sha256=569d89bc34cc6a094a2053b93bc475a95c011f1c0fb020035d46a599fccecc9e；被测 commit=1022694967e519de8ae2a03fd3e6b799988c09a6（完整 SHA，已推送 origin/main）。R1 结论：**规则内容 ①L-018 PASS ②AGENTS.md PASS ③DEC-084 PASS ⑤零改动 PASS（限定可见差异）**；整体 REJECT 仅 ④任务包交付闭环未完成（见返工表问题1）；**待闭环后限定复审（R2），最终验收结论以 R2 为准**；R2 实况：返工问题1 整改 **PASS**，REJECT 仅问题2（S2⑥ 绑定补齐，本轮已整改）+delivery 最终状态待回填——**R2 整体仍未 PASS，最终验收结论以 R3 为准**；R3 实况（现场 dispatch-2026-11-16T13-36-34，reply 1830B sha256=055132f39fb786b9ee8ce19460a1b80c67f61e9575ec507722a24df4d33ad082，核验对象=f13e451192feb74535d8e6b371a618281a5a1fe3）：①② **PASS**，REJECT 仅③范围表述（问题3）；R4 实况（现场 dispatch-2026-11-16T13-41-50，reply 1668B sha256=925d497d2d86a79fda5cf94b64094a6b71b0bfc9f2baa1a5061db5742df96dff，核验对象=f56f8931a796b39ecbcc1cb66950fd30f247e72d）：③范围未扩大 **PASS**，REJECT 仅①②登记/口径（问题4，本轮整改）；R5 实况（现场 dispatch-2026-11-16T13-47-29，reply 2476B sha256=c1206905352a7642663082dcbe7347813f5049c64c17b91b89c2a091c8bd3688，核验链=9ac602b76624598e5d52a0689fabf6ee905209c7→2164b211894ffa375d2e1b600dcce1287d1b0e74 逐级直接后继）：①②③三项 **PASS**——**验收结论：PASS**（规则内容①②③⑤于 R1 PASS；登记/口径缺口经 R3/R4 整改、R5 复核全 PASS）

## S2 自检与残留排查（ST-05）

- ①本步骤目标：ST-05 检查器自检无 FAIL 缺口；全仓旧阈值残留排查（"10+ 轮/约 10 轮/10 轮以上"同义表达+其他文档独立迁移时机规定+模板/提示词/检查脚本）；GitPointer/安全停止/1200B 零改动核对
- ②修改文件：本任务包 acceptance/（自检与排查输出落库）
- ③修改内容：`python -I basic/tool/check_taskpack.py basic/tasks/b-20261116-session-migrate-4rounds` 实际输出落库；残留排查命中清单+逐项处置（改/历史保留）落库
- ④执行结果：ST-05 自检 IN_PROGRESS（①②PASS、③FAIL=仅 S1⑥ 验收证据引用未回填[待 S3 验收派单后闭环，开发期既定语义，非规则内容缺口]、④⑤⑥N/A、Overall FAIL、退出码 1，无规则内容缺口）；残留排查两轮：①旧阈值同义表达全仓 sweep（8 种模式，命中 25 处：LIVE 7 处均为变更记录/证据语境引用旧值并明示废止——AI-DEV-LESSONS.md:531 变更注记、DEC-084 三处、简报归档三处；其余 18 处均在历史区如实保留）；②独立迁移时机规定排查（33 文件：AI-DEV-LESSONS 轮换优先级条款、review-protocol §5.1、agent-contract 均"消息数不作硬依据"无数值阈值，属执行者主会话/中级版协议范畴，与审查会话 4 轮规则无冲突；DEC-008 为历史决策记录不改）；零改动核对=git diff 仅 AGENTS.md/AI-DEV-LESSONS.md/decision-log.md 三文件+本任务包新增，WORKFLOW/C1-C8/GitPointer/中级版代码/1200B 相关文本零触碰
- ⑤测试结果：命令与完整输出落库——`python -I basic/tool/check_taskpack.py basic/tasks/b-20261116-session-migrate-4rounds`（acceptance/st05-inprogress.txt，Overall FAIL 退出码 1=③验收证据未回填的开发期既定语义）；`python -I acceptance/residual-sweep.py`（acceptance/residual-sweep.txt）；`python -X utf8 -I acceptance/rotation-sweep.py`（acceptance/rotation-sweep.txt）
- ⑥验收证据引用（R2 整改后完整绑定）：ST-05 开发期输出=`acceptance/st05-inprogress.txt`（如实 IN_PROGRESS、Overall FAIL、退出码 1）；残留排查=`residual-sweep.txt` 原始版+`residual-sweep-utf8.txt` 规范版（总命中 31 vs 原版 25，差异为两次运行间新增文件计入扫描范围，**LIVE 均为 7**，不称"完全一致"）+`rotation-sweep.txt`；**R1 完整证据绑定：现场=`dispatch-2026-11-16T13-18-39`，reply sha256=`569d89bc34cc6a094a2053b93bc475a95c011f1c0fb020035d46a599fccecc9e`，被测 commit=`1022694967e519de8ae2a03fd3e6b799988c09a6`**（完整 40 位）；R2 限定复审（现场=`dispatch-2026-11-16T13-29-15/recoll` 归属校验型补采七查全过未重发，reply 3425B sha256=`aad362e870b747a6aafc131176dad28a47972eb3c7849c432b22864d2ef4c444`，核验对象=3dce96c3e5044b1a3f87e41f478fde5894b0f26d）：③④⑤ PASS，REJECT 仅 ①S2⑥ 缺完整 R1 绑定（本轮已补）+②delivery 最终状态未闭环（属待最终回填项，R2 通过后执行 COMPLETED 态 ST-05 并回填）；R5 限定复审（现场 dispatch-2026-11-16T13-47-29，reply sha256=c1206905352a7642663082dcbe7347813f5049c64c17b91b89c2a091c8bd3688）：①修复绑定 PASS ②累计产物/单次变更区分 PASS ③范围 PASS——**验收结论：PASS**；详见返工表问题1/问题2

## S3 独立验收与交付

- ①本步骤目标：向用户报告 diff 待明文批准 → commit → push（check-push）→ ChatGPT 独立验收派单（被测对象绑定完整 40 位 SHA，禁 HEAD/短 SHA）→ delivery.md 七要素
- ②修改文件：本任务包 delivery.md、steps.md、task-brief.md、acceptance/
- ③修改内容：交付登记与验收证据按七要素闭环
- ④执行结果：R1 独立验收 **REJECT 仅 P1-04（交付闭环）**——规则内容①②③⑤全 PASS；按审查方六项清单收尾：S1⑥/S2⑥/S3⑥ 证据回填、delivery.md 七要素、task-brief 状态推进至"验收中"、residual-sweep UTF-8 规范版追加（原始版保留）；ST-05 检查器未改、开发期 IN_PROGRESS 原始输出未删（遵守审查方特别强调项）；闭环 commit 待用户明文批准（DEC-071），批准后绑定新完整 SHA 派 R2 限定复审
- ⑤测试结果（COMPLETED 态实测，R5 通过后实跑）：命令=`python -X utf8 -I basic/tool/check_taskpack.py basic/tasks/b-20261116-session-migrate-4rounds`；实际输出=Phase COMPLETED＋①需求记录 PASS ②步骤清单 PASS ③步骤验收记录 PASS ④REJECT返工记录 PASS ⑤返工次数 PASS ⑥交付记录 PASS＋**Overall PASS**＋退出码=**0**；完整原始输出落库 `acceptance/st05-completed.txt`；首轮 COMPLETED 输出（④FAIL=问题4 修复 commit 占位未绑定）如实保留为 `acceptance/st05-completed-run1-fail4.txt`，绑定后复跑通过；开发期 `st05-inprogress.txt` 原样保留未覆盖
- ⑥验收证据引用：R1 见 S1⑥；R2=dispatch-2026-11-16T13-29-15/recoll（reply sha256=aad362e870b747a6aafc131176dad28a47972eb3c7849c432b22864d2ef4c444，核验对象=3dce96c3e5044b1a3f87e41f478fde5894b0f26d），③④⑤ PASS、REJECT 仅问题2+delivery 待回填；R3=dispatch-2026-11-16T13-36-34（reply sha256=055132f39fb786b9ee8ce19460a1b80c67f61e9575ec507722a24df4d33ad082，核验对象=f13e451192feb74535d8e6b371a618281a5a1fe3），①② PASS、REJECT 仅问题3；R4=dispatch-2026-11-16T13-41-50（reply sha256=925d497d2d86a79fda5cf94b64094a6b71b0bfc9f2baa1a5061db5742df96dff，核验对象=f56f8931a796b39ecbcc1cb66950fd30f247e72d），③ PASS、REJECT 仅①②登记/口径（问题4）；R5=dispatch-2026-11-16T13-47-29（reply sha256=c1206905352a7642663082dcbe7347813f5049c64c17b91b89c2a091c8bd3688，核验链=9ac602b7…→2164b211…）：三项 PASS——**验收结论：PASS**（COMPLETED 态 ST-05 已按 R5 指引实际取证，见 S3⑤；最终交付闭环以 R6 复核为准）。**会话迁移评估记录（L-018 第 6 条新规自用）：R4 派单=当前审查会话 6afb02e6… 第 4 条 user 消息，达评估阈值；评估=任务处交付收尾（规则内容①②③⑤全 PASS，仅登记/口径更正），按例外①"临近完成验收"暂不迁移，理由如实记录；按"每增 2 条重评"规则，下次评估点=第 6 条 user 消息**

## 返工记录表（首次 REJECT 时建表；按"同一问题"计数）

| 问题编号 | 轮次来源 | 问题描述 | 整改内容 | 修复 commit | 验证 |
|---|---|---|---|---|---|
| 问题1 | S3-R1 REJECT（P1-04） | 交付证据与任务状态未闭环：S1⑥/S2⑥/S3⑥ 未回填、delivery.md 缺失、task-brief 状态停留"开发中"；另 residual-sweep.txt 存在字符编码问题（审查方无法逐行核验原始输出） | 按审查方六项清单收尾：三处⑥证据回填+delivery.md 七要素+task-brief 状态推进；residual-sweep-utf8.txt 规范编码版追加（原始 GBK 版保留不删）；ST-05 与开发期原始输出未改动 | 3dce96c3e5044b1a3f87e41f478fde5894b0f26d | R2 限定复审：返工问题1 **PASS**（"整改内容如实，原始 ST-05 未篡改，符合 R1 整改要求"） |
| 问题2 | S3-R2 REJECT（①证据引用） | S2⑥ 引用了 R1 结论但未完整重复绑定 R1 现场/reply SHA256/被测 commit SHA 三件套；另审查方提示两版残留报告"总命中数不同，不得称完全一致" | S2⑥ 改为完整绑定（现场 dispatch-2026-11-16T13-18-39+reply sha256=569d89bc…cc9e+被测 1022694967…）；残留对比表述改为"总命中 31 vs 25（新增文件计入）、LIVE 均为 7" | f13e451192feb74535d8e6b371a618281a5a1fe3 | R3 限定复审：① **PASS**（"已完整列出…没有再称总数一致"） |
| 问题3 | S3-R3 REJECT（③范围表述） | R3 简报与登记声称 R2 整改 commit"仅任务包+派单证据归档"，实际还含新增工具脚本 phase0/tools/recoll_migrate4r2.mjs（R2 归属校验型补采驱动，L-018 第 3 条要求派生驱动可核验；先例 recoll_r19/r20.mjs 同型归档 phase0/tools，前任务 R16 先例"只读诊断脚本可保留"） | 范围表述更正+如实登记：delivery.md §3 修改文件清单补录该脚本并注明依据；R3 简报中不准确表述在 R4 简报更正为"任务包回填+派单简报归档+L-018 补采驱动"；不重写历史、不从提交中剥离（驱动为补采链必要产物） | f56f8931a796b39ecbcc1cb66950fd30f247e72d | R4：③范围未扩大 **PASS**；但①修复 commit 占位未绑定、②"累计产物 vs 本次提交变更"混述仍 REJECT → 问题4 续办 |
| 问题4 | S3-R4 REJECT（①②登记/口径） | ①返工表问题3"修复 commit"仍为占位未绑定完整 SHA；②R4 简报把 recoll_migrate4r2.mjs 描述为 R3 整改 commit 变更内容——实际该驱动由父提交 f13e451192feb74535d8e6b371a618281a5a1fe3 引入，R3 整改 commit 仅新增 R3 现场归档、R3 复审简报与任务包回填（任务累计产物≠单次提交变更） | ①问题3 修复 commit 已绑定 f56f8931a796b39ecbcc1cb66950fd30f247e72d；②delivery §3 补注驱动引入提交归属，R5 起范围口径按"单次提交变更"如实描述 | 9ac602b76624598e5d52a0689fabf6ee905209c7（任务包回填，另含纯证据 commit 2164b211894ffa375d2e1b600dcce1287d1b0e74） | R5 限定复审：①②③ 三项 **PASS**（"recoll_migrate4r2.mjs 的引入归属和本次提交边界现在表达清楚，没有发现额外漏记"） |
