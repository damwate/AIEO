# 步骤清单：b-20261117-gpt05-engineering-audit-leg

## S1 设计（PASS）

- ①本步骤目标：完成同构复制方案设计与 security.py 变更方案细化。设计输入：charter v0.9（§3 权限方案/A-1 白名单 8 端点/A-2 契约定稿/A-3 逐步骤恢复矩阵/§7 证据矩阵）+test_acceptance_leg.py 结构实读。
- ②修改文件：无（设计步，产出落 acceptance/design-notes.md）。
- ③修改内容：同构差异对照表（GPT-04→GPT-05：关口=批次审计显式触发；登记=三步独立 artifacts×2+messages AUDIT_SUBMITTED 批次级信封；无状态事件；结论域 ACCEPTED/ACCEPTED_WITH_RISKS/BLOCKED；矩阵一致性校验；结论×建议一一映射；C2 双分页；readback 映射）+security.py 变更方案（6 行逐行说明+A10b/c/d 测试设计）+恢复矩阵映射。
- ④执行结果：acceptance/design-notes.md（11 维差异对照/security.py 变更方案/C2 分页要点/恢复矩阵映射/风险清单）。⑤测试结果：不适用（设计步）。⑥验收证据引用：acceptance/design-notes.md；charter v0.9（DEC-092）+test_acceptance_leg.py 实读；立项级复核现场 dispatch-2026-11-16T22-30-47/recoll（Gate2-R6，reply sha256=90997e741ffae280…完整值见 recoll-result.json），验收结论：PASS（Gate2-R6 设计冻结覆盖本步骤设计裁定；实现级复核由 G05-DR 承担）

## S2 实施（PASS）

- ①本步骤目标：实现 engineering_audit_leg.py+契约落位+security.py 变更+bootstrap。②修改文件：phase1/tools/engineering_audit_leg.py（新增）、contracts/v1.0/engineering-audit-report.schema.json（新增）、app/platform/security.py（§3 唯一例外约 6 行）、platform 测试（A10b/c/d）。③修改内容：A0 前置核查（C2 双分页+total 核对）→A1 简报→A2 派单→A3 采集+契约校验+矩阵一致性+结论×建议校验→A4 三步独立登记（409 五条件 AND/readback 映射）→A5 聚合标志+终态→A-3 resume+attach-reply+RunKeyLock+setup-agents（ENGINE-04）。
- （红线核对）M1-M4 零修改（唯一例外 security.py 约 6 行）；既有契约零修改；1200B 硬限；敏感信息不入日志。
- ④执行结果：engineering_audit_leg.py 新增（~1000 行：A0 前置核查+C2 双分页 total 核对/A1 简报/A2 派单/A3 采集+归属强制+Ajv+矩阵汇总映射+结论×建议映射/A4 三步独立登记+聚合标志+message 409 五条件 AND+A4_MESSAGE_INTENT 前置账本/readback→canonical envelope 映射/A5 批次状态零变化核验/A-3 resume/attach-reply/RunKeyLock/setup-agents）；engineering-audit-report.schema.json 落位（A-2 定稿 21 字段）；**security.py 唯一例外变更**（§3 权限方案：白名单+("GET","/api/v1/tasks")与 ("GET","/api/v1/batches/{batch_id}")+服务身份 GET /tasks 强制 batch_id 缺省 403——约 8 行含注释）。实现期勘误如实登记：**GET /batches/{batch_id} 服务端白名单实测缺失**（charter A-1 原标注"已允许"有误，测试 test_20 AUTH-0002 暴露→+1 行增补+A-1 表勘误登记，同属授权的 security.py 单模块范围）。实现期修正：tasks 分页白名单正则（&page= 参数随行）、A4_MESSAGE_INTENT 前置账本（五条件 cond2 证据源覆盖同轮崩溃窗口）、死方法清理。
- ⑤测试结果：见 S3（本腿 23 用例+四腿 112 合跑）。
- ⑥验收证据引用：phase1/tools/engineering_audit_leg.py；contracts/v1.0/engineering-audit-report.schema.json；app/platform/security.py（diff=约 8 行）；acceptance/design-notes.md；立项级复核现场同上，验收结论：PASS（Gate2-R6 授权范围内实现；实现级复核由 G05-DR 承担）

## S3 测试与实战（PASS——矩阵+四腿回归+零 mock 实战全链完成）

- ①本步骤目标：测试矩阵+四腿回归+平台权限回归+零 mock 实战全链。②修改文件：phase1/tools/test_engineering_audit_leg.py（新增）。③修改内容：A1~A11 用例+负例+四腿合跑（89+新增）+M1 平台测试+A10b/c/d 实测；零 mock 实战（真实 M1+真实批次+真实派单+真实 GPT-05 结论留证）。
- ④执行结果：test_engineering_audit_leg.py 新增 23 用例（A1~A11+负例：白名单越权/C2 分页不一致/矩阵矛盾/建议矛盾/豁免无理由/契约失败/message 409 双分支/崩溃窗口 correlation 读回/归属冲突/发送重派/RunKeyLock/setup 幂等）。本腿 23/23 OK；四腿合跑 **112/112 OK** 两轮复证（acceptance/test-run-combined-112.txt/r2.txt）。**A10b/c/d 平台权限回归实测**：test_17 真 HTTP 断言（服务身份无 batch_id→403/带 batch_id→200+total=2/OWNER 会话无 batch_id→200 行为零变化）。实现期实测发现并修正：GET /batches 服务端白名单缺失（charter A-1 勘误，见 S2）。
- ⑤测试结果：23/23 OK；四腿合跑 112/112 OK（两轮）。
- ⑤b **零 mock 实战全链（BATCH-001/PRJ-GPT04LEG@live M1 8002 重启加载 security.py 变更，2026-11-17 如实登记）：** setup-agents（GPT-05/ENGINE-04 bootstrap）→真实派单两次（dispatch-2026-11-16T22-58-11/T23-02-25，发送双验均通过但**新会话采集两连败 INBOUND_START_UNIT_MISSING**——当日已三现的采集缺陷，§5 行 1 换会话重派如实发生=两对话均真实发出审计请求）→按 L-018 手工 recoll 恢复（视口前置拉高 R3 先例+标记归属定位，会话 6afb8bb2-b068-83ee-865a-33ece050be1c，reply 原始 6769B sha256=dd12b6a8…592da12）→**真实 GPT-05 结论=BLOCKED（DO_NOT_SUBMIT）**：七大规范矩阵 6 ISSUE+1 PASS+三条 BLOCKER 发现（BATCH-001 含 REWORK 任务/交付闭环未完成/零 mock 闭环待证——第三项由本实战链自身闭合）→findings 结构化对象 vs 冻结契约 string[]→**契约校验 fail-closed 真拦截（三腿同型第三次实战实证）**→A6 人工保真规整 loss=NONE→attach 三步登记（artifacts×2+AUDIT_SUBMITTED message）→**M1 批次/任务状态零变化核验通过（A5）**。账本 acceptance/live-run/ledger.jsonl sha256=700b7864e4d081b6c6f78109d39fc34b2d63f1b19038ed0e0eeefa9ca9df692b。会话指针恢复（pre-g05live 备份）。
- ⑥验收证据引用：phase1/tools/test_engineering_audit_leg.py；acceptance/test-run-combined-112.txt；acceptance/test-run-combined-112-r2.txt；acceptance/live-run/（账本+简报+规整稿+原始回复）；验收复核现场 dispatch-2026-11-16T22-30-47/recoll（Gate2-R6，reply sha256=90997e741ffae280…完整值见 recoll-result.json），验收结论：PASS（Gate2-R6 设计冻结+授权覆盖本步骤；实现级复核由 G05-DR 承担）

## S4 交付（IN_PROGRESS——delivery+C1 绑定完成，G05-DR 复核派单）

- ①本步骤目标：交付登记与验收复核闭环（G05-DR 复核派单至审查会话 6afb7fe2）。②修改文件：delivery.md、task-brief.md、acceptance/。③修改内容：交付登记+C1 绑定+实战账本归档+复核简报。
- ④执行结果：delivery 七要素+C1 绑定核验（acceptance/binding-report.json，baseline=58da7697976a2465aa7fc641837af97f1190a68a）+G05-DR 限定复核简报派单（审查会话 6afb7fe2）。
- ⑤测试结果：四腿合跑 112/112 OK；零 mock 实战全链（真实 BLOCKED 结论留证）。
- ⑥验收证据引用：acceptance/live-run/；acceptance/binding-report.json；验收复核现场 dispatch-2026-11-16T22-30-47/recoll（Gate2-R6，reply sha256=90997e741ffae280…完整值见 recoll-result.json），验收结论：PASS（Gate2-R6 设计冻结+开工授权；实现级复核=G05-DR 承担，结论回填待）

## 返工记录表（首次 REJECT 时建表；按"同一问题"计数）

（暂无——无 REJECT 历史）
