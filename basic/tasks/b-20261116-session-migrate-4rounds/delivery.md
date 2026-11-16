# delivery：b-20261116-session-migrate-4rounds（会话迁移评估阈值 约10轮→累计4条user消息）

## 1. 原始需求

用户 2026-11-16 指令（requirement.md 全文照录）：将 AIEO basic 版本约 10 轮的会话迁移评估机制调整为 4 轮，累计达到 4 轮后主动评估并执行新聊天交接；沿用 GitPointer、安全停止和交接流程，不改变 1200 UTF-8 字节限制及其他规则；同步检查并更新相关文档、代码、测试和示例；交付证据绑定完整 40 位 Commit SHA。

## 2. 最终实现内容

- **L-018 第 6 条改写（规则唯一定义点）**：会话迁移评估阈值=当前审查会话累计达到 4 条 user 消息时主动评估是否迁移交接；计数仅含 user 消息（不含 AI 回复/工具调用）；新会话正式接棒后计数归零；第 4 条=主动评估触发点非强制迁移点；暂不迁移须记录理由并每增 2 条 user 消息重评；三类例外（临近完成验收/简单任务上下文清晰/用户明确要求）不构成长期绕过机制；旧"实测约 10+ 轮"废止并注明变更依据（用户指令+ChatGPT 复审共识 reply sha256=bf4bbc1d305870a6712881cbd3e5957a33aaf0cd1b0e615bb45e09cda6f6bb04）。
- **AGENTS.md**：第一动作映射表"审查会话上下文上限"行固化"累计达 4 条 user 消息"。
- **DEC-084 登记**（decision-log 顺延编号，含审查方 DEC-071 编号口误勘误）：指令原文/共识依据/裁定口径/落点/不改项/审批边界。
- **不变项（R1 验收确认零触碰）**：1200 UTF-8 字节单条限制、GitPointer 交接契约、CONTEXT_LIMIT_STOP 安全停止语义、交接流程、中级版 context_limit.mjs/session_store.mjs/tests、WORKFLOW、C1-C8、历史任务记录。
- 方案复审：新会话 `6afaf06f-f9b4-83ee-b6e8-c2f789d1dc4c`（旧会话轮次多按 L-018 迁移），"共识达成，按 3 处补充口径后实施"。

## 3. 修改文件

- AGENTS.md（1 行映射）
- docs/AI-DEV-LESSONS.md（L-018 第 6 条 1 段改写）
- docs/phase1/decision-log.md（追加 DEC-084，+11 行）
- basic/tasks/b-20261116-session-migrate-4rounds/（requirement.md、task-brief.md、steps.md、delivery.md、acceptance/：commit-msg.txt、st05-inprogress.txt、residual-sweep.py/.txt、rotation-sweep.py/.txt、residual-sweep-utf8.txt）
- phase0/tools/session-migrate-4rounds-plan-r1.txt（复审简报 1199B）、phase0/tools/session-migrate-4rounds-accept-r1.txt（验收简报 1198B）
- phase0/logs/dispatch-2026-11-16T11-59-52/（复审现场）、phase0/logs/dispatch-2026-11-16T13-18-39/（验收 R1 现场）、phase0/logs/gpt-reviewer-session.json（会话指针）

## 4. 测试结果

- ST-05 检查器自检：开发期 `acceptance/st05-inprogress.txt`（①②PASS、③FAIL=仅 S1⑥ 验收证据未回填[开发期既定语义]、退出码 1）；**COMPLETED 态取证待 R2 复审通过后执行并落库**（检查器未改、开发期原始输出保留）。
- 残留排查：8 种旧阈值模式全仓 sweep（residual-sweep.txt 原始版+residual-sweep-utf8.txt 规范版，LIVE=7 均为变更记录/证据语境）；独立迁移时机规定排查 33 文件（rotation-sweep.txt，无数值阈值冲突）。
- 独立验收 R1（现场 dispatch-2026-11-16T13-18-39，reply 4733B，sha256=569d89bc34cc6a094a2053b93bc475a95c011f1c0fb020035d46a599fccecc9e）：**规则内容 ①L-018 PASS ②AGENTS.md PASS ③DEC-084 PASS ⑤零改动 PASS；整体 REJECT 仅 ④交付闭环未完成**（P1-04，见 steps.md 返工表问题1）→已按审查方六项清单收尾。
- R2 限定复审（现场 dispatch-2026-11-16T13-29-15/recoll 归属校验型补采七查全过未重发，reply 3425B，sha256=aad362e870b747a6aafc131176dad28a47972eb3c7849c432b22864d2ef4c444，核验对象=3dce96c3e5044b1a3f87e41f478fde5894b0f26d）：返工问题1 **PASS**（原始 ST-05 未篡改、历史证据未删）、UTF-8 残留报告 PASS（逐行核验 LIVE=7，审查方提示总命中数差异不得称"完全一致"）、修改范围 PASS；REJECT 仅 ①S2⑥ 缺 R1 完整绑定（已补，见 steps.md S2⑥）+②delivery 最终状态未闭环（待 R3 通过后 COMPLETED 态 ST-05 取证回填，不提前置"完成"）。

## 5. Git commit

- **被测 commit=1022694967e519de8ae2a03fd3e6b799988c09a6**（完整 40 位 SHA；父=push 时基线；用户 2026-11-16 "同意"明文批准后提交，`toolkit/check-push.mjs` 推送成功 ahead=0 behind=0）；R1 验收严格锁定该 SHA（审查方明示不用 HEAD）。
- **交付闭环 commit=3dce96c3e5044b1a3f87e41f478fde5894b0f26d**（完整 40 位 SHA；用户 2026-11-16 "yes" 批准后提交并推送，R2 限定复审核验对象，ahead=1 behind=0 已确认）；R2 整改 commit=（R3 前回填完整 SHA）。

## 6. 未解决问题

- R3 限定复审待派（绑定 R2 整改 commit 新完整 SHA）。
- COMPLETED 态 ST-05 取证待 R3 通过后执行（要求 ①～⑥ 全 PASS、Overall PASS、退出码 0；审查方明示"以实际运行输出为证据，不预先填写 PASS"）。
- 远程 main 已随批准推送（ahead=0）；后续轮次证据 commit 依用户预批准推进。

## 7. 后续建议

- 4 条 user 消息迁移评估规则已生效（L-018 第 6 条为唯一定义点，AGENTS.md 映射行同步）：后续派单按口径计数，当前审查会话（6afb02e6…）已 1 条 user 消息（R1 本身），计满 4 条触发评估。
- "暂不迁移记录理由+每增 2 条重评"与三类例外在实战中按 L-018 第 6 条执行并如实登记。
- 中级版（standard/）如需同阈值另立任务，本次不改中级版（R1 确认零触碰）。
