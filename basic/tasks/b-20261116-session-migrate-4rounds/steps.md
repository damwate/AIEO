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
- ⑥验收证据引用：S1/S2/S3 合并独立验收 **R1**=现场 `dispatch-2026-11-16T13-18-39`（审查会话 6afb02e6-cb80-83ec-b241-2f35a51ca659；简报 `phase0/tools/session-migrate-4rounds-accept-r1.txt` 1198B；此前同会话两次派单 goto 超时/composer 超时均**未投递**，按 ST-08 路径①换新会话重派），reply 4733B，sha256=569d89bc34cc6a094a2053b93bc475a95c011f1c0fb020035d46a599fccecc9e；被测 commit=1022694967e519de8ae2a03fd3e6b799988c09a6（完整 SHA，已推送 origin/main）。R1 结论：**规则内容 ①L-018 PASS ②AGENTS.md PASS ③DEC-084 PASS ⑤零改动 PASS（限定可见差异）**；整体 REJECT 仅 ④任务包交付闭环未完成（见返工表问题1）；**待闭环后限定复审（R2），最终验收结论以 R2 为准**；R2 实况：返工问题1 整改 **PASS**，REJECT 仅问题2（S2⑥ 绑定补齐，本轮已整改）+delivery 最终状态待回填——**R2 整体仍未 PASS，最终验收结论以 R3 为准**

## S2 自检与残留排查（ST-05）

- ①本步骤目标：ST-05 检查器自检无 FAIL 缺口；全仓旧阈值残留排查（"10+ 轮/约 10 轮/10 轮以上"同义表达+其他文档独立迁移时机规定+模板/提示词/检查脚本）；GitPointer/安全停止/1200B 零改动核对
- ②修改文件：本任务包 acceptance/（自检与排查输出落库）
- ③修改内容：`python -I basic/tool/check_taskpack.py basic/tasks/b-20261116-session-migrate-4rounds` 实际输出落库；残留排查命中清单+逐项处置（改/历史保留）落库
- ④执行结果：ST-05 自检 IN_PROGRESS（①②PASS、③FAIL=仅 S1⑥ 验收证据引用未回填[待 S3 验收派单后闭环，开发期既定语义，非规则内容缺口]、④⑤⑥N/A、Overall FAIL、退出码 1，无规则内容缺口）；残留排查两轮：①旧阈值同义表达全仓 sweep（8 种模式，命中 25 处：LIVE 7 处均为变更记录/证据语境引用旧值并明示废止——AI-DEV-LESSONS.md:531 变更注记、DEC-084 三处、简报归档三处；其余 18 处均在历史区如实保留）；②独立迁移时机规定排查（33 文件：AI-DEV-LESSONS 轮换优先级条款、review-protocol §5.1、agent-contract 均"消息数不作硬依据"无数值阈值，属执行者主会话/中级版协议范畴，与审查会话 4 轮规则无冲突；DEC-008 为历史决策记录不改）；零改动核对=git diff 仅 AGENTS.md/AI-DEV-LESSONS.md/decision-log.md 三文件+本任务包新增，WORKFLOW/C1-C8/GitPointer/中级版代码/1200B 相关文本零触碰
- ⑤测试结果：命令与完整输出落库——`python -I basic/tool/check_taskpack.py basic/tasks/b-20261116-session-migrate-4rounds`（acceptance/st05-inprogress.txt，Overall FAIL 退出码 1=③验收证据未回填的开发期既定语义）；`python -I acceptance/residual-sweep.py`（acceptance/residual-sweep.txt）；`python -X utf8 -I acceptance/rotation-sweep.py`（acceptance/rotation-sweep.txt）
- ⑥验收证据引用（R2 整改后完整绑定）：ST-05 开发期输出=`acceptance/st05-inprogress.txt`（如实 IN_PROGRESS、Overall FAIL、退出码 1）；残留排查=`residual-sweep.txt` 原始版+`residual-sweep-utf8.txt` 规范版（总命中 31 vs 原版 25，差异为两次运行间新增文件计入扫描范围，**LIVE 均为 7**，不称"完全一致"）+`rotation-sweep.txt`；**R1 完整证据绑定：现场=`dispatch-2026-11-16T13-18-39`，reply sha256=`569d89bc34cc6a094a2053b93bc475a95c011f1c0fb020035d46a599fccecc9e`，被测 commit=`1022694967e519de8ae2a03fd3e6b799988c09a6`**（完整 40 位）；R2 限定复审（现场=`dispatch-2026-11-16T13-29-15/recoll` 归属校验型补采七查全过未重发，reply 3425B sha256=`aad362e870b747a6aafc131176dad28a47972eb3c7849c432b22864d2ef4c444`，核验对象=3dce96c3e5044b1a3f87e41f478fde5894b0f26d）：③④⑤ PASS，REJECT 仅 ①S2⑥ 缺完整 R1 绑定（本轮已补）+②delivery 最终状态未闭环（属待最终回填项，R2 通过后执行 COMPLETED 态 ST-05 并回填）；详见返工表问题1/问题2

## S3 独立验收与交付

- ①本步骤目标：向用户报告 diff 待明文批准 → commit → push（check-push）→ ChatGPT 独立验收派单（被测对象绑定完整 40 位 SHA，禁 HEAD/短 SHA）→ delivery.md 七要素
- ②修改文件：本任务包 delivery.md、steps.md、task-brief.md、acceptance/
- ③修改内容：交付登记与验收证据按七要素闭环
- ④执行结果：R1 独立验收 **REJECT 仅 P1-04（交付闭环）**——规则内容①②③⑤全 PASS；按审查方六项清单收尾：S1⑥/S2⑥/S3⑥ 证据回填、delivery.md 七要素、task-brief 状态推进至"验收中"、residual-sweep UTF-8 规范版追加（原始版保留）；ST-05 检查器未改、开发期 IN_PROGRESS 原始输出未删（遵守审查方特别强调项）；闭环 commit 待用户明文批准（DEC-071），批准后绑定新完整 SHA 派 R2 限定复审
- ⑤测试结果：（R2 复审通过后 COMPLETED 态 ST-05 实际输出回填于此）
- ⑥验收证据引用：R1 见 S1⑥；R2=dispatch-2026-11-16T13-29-15/recoll（reply sha256=aad362e870b747a6aafc131176dad28a47972eb3c7849c432b22864d2ef4c444，核验对象=3dce96c3e5044b1a3f87e41f478fde5894b0f26d），③④⑤ PASS、REJECT 仅问题2+delivery 待回填；R3 限定复审（待派，绑定 R2 整改 commit 新完整 SHA）

## 返工记录表（首次 REJECT 时建表；按"同一问题"计数）

| 问题编号 | 轮次来源 | 问题描述 | 整改内容 | 修复 commit | 验证 |
|---|---|---|---|---|---|
| 问题1 | S3-R1 REJECT（P1-04） | 交付证据与任务状态未闭环：S1⑥/S2⑥/S3⑥ 未回填、delivery.md 缺失、task-brief 状态停留"开发中"；另 residual-sweep.txt 存在字符编码问题（审查方无法逐行核验原始输出） | 按审查方六项清单收尾：三处⑥证据回填+delivery.md 七要素+task-brief 状态推进；residual-sweep-utf8.txt 规范编码版追加（原始 GBK 版保留不删）；ST-05 与开发期原始输出未改动 | 3dce96c3e5044b1a3f87e41f478fde5894b0f26d | R2 限定复审：返工问题1 **PASS**（"整改内容如实，原始 ST-05 未篡改，符合 R1 整改要求"） |
| 问题2 | S3-R2 REJECT（①证据引用） | S2⑥ 引用了 R1 结论但未完整重复绑定 R1 现场/reply SHA256/被测 commit SHA 三件套；另审查方提示两版残留报告"总命中数不同，不得称完全一致" | S2⑥ 改为完整绑定（现场 dispatch-2026-11-16T13-18-39+reply sha256=569d89bc…cc9e+被测 1022694967…）；残留对比表述改为"总命中 31 vs 25（新增文件计入）、LIVE 均为 7" | （R2 整改 commit SHA 回填处） | R3 限定复审（待派） |
