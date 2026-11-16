# 交付记录：b-20261117-gpt05-engineering-audit-leg

## 1. 原始需求

用户 2026-11-17 交接指令（DEC-026 决议二路线续行+授权机制 DEC-089）：GPT-05 工程总审计真实腿立项。charter v0.9 §1 冻结原文见 requirement.md；生效链：Gate1 PASS_WITH_CONSTRAINTS（reply sha256=bceb502a…083a5e480）→G05-R1 REJECT→R2 PASS→Gate2 首轮 REJECT（权限阻断）→R1/R2/R3 REJECT（P0-1/P0-2 PASS 渐进收敛）→R4 REJECT 仅②→R5 REJECT 仅两处→**Gate2-R6 PASS：授权链清理通过+设计冻结通过+开工授权授予**（reply sha256=90997e741ffae280…，dispatch-2026-11-16T22-30-47/recoll，DEC-092）。冻结基线=charter v0.9@58da7697976a2465aa7fc641837af97f1190a68a。

## 2. 最终实现内容

- **`phase1/tools/engineering_audit_leg.py` 新增（~1000 行）：** A0 前置核查（批次读取+**C2 双分页全量遍历+total 核对**，数量不一致 fail-closed=A11）→A1 简报（四组输入+绑定字段+≤1200B 硬限）→A2 真实派单（M2 零修改复用，mtime 容差现场定位）→A3 采集+归属强制校验+Ajv 冻结契约校验+**C1 矩阵汇总映射 fail-closed**+**C3 结论×建议一一映射 fail-closed**+豁免理由校验→**A4 三步独立登记**（A4a 简报 artifact→A4b 报告 artifact=结论唯一权威载体→A4c AUDIT_SUBMITTED 批次级信封 task_id=null）+聚合标志 A4_REGISTERED 三子齐才写+**message 409 五条件 AND**（P0-3）+**A4_MESSAGE_INTENT 前置账本**+**M1 readback→canonical envelope 映射**（账本预期骨架+九实质字段读回覆盖+agent_type 账本恢复+source_agent_id 断言）→A5 批次状态零变化核验+A-3 resume+attach-reply+RunKeyLock+setup-agents（GPT-05/ENGINE-04）。**无任何状态事件**（防御层 event_whitelist=空集）。
- **`contracts/v1.0/engineering-audit-report.schema.json` 落位冻结**（A-2 定稿 21 字段+standards_matrix 七字段，additionalProperties=false；新增文件 H2）。
- **`app/platform/security.py` 唯一 M1 变更例外（§3 权限方案）：** SERVICE_ALLOWED_ENDPOINTS 增补 ("GET","/api/v1/tasks") 与 ("GET","/api/v1/batches/{batch_id}")+authorize_principal 服务身份 GET /tasks 强制 batch_id 缺省 403 规则；OWNER 人工会话行为零变化。**行数偏差如实记录（问题17）：实际新增 9 行（原授权方案约 6 行）——额外行数对应 GET /api/v1/batches/{batch_id} 白名单勘误（A-1 原标注"已允许"实测缺失，test_20 AUTH-0002 暴露后实现纠偏）及强制规则错误响应；范围仍限 security.py 单模块。**
- **测试矩阵 `test_engineering_audit_leg.py`（23 用例）：** charter §7 证据矩阵 A1~A11 全覆盖（含 A5a/A5b 崩溃窗口+A8 矩阵矛盾+A9 建议矛盾+A10 权限拒绝+**A10b/c/d 平台权限回归实测**+A11 分页不一致）+负例（白名单越权/契约失败/材料锚定/归属冲突/RunKeyLock/setup 幂等）。

## 3. 修改文件

| 文件 | 变更 | 说明 |
|---|---|---|
| phase1/tools/engineering_audit_leg.py | 新增 | GPT-05 腿本体 |
| contracts/v1.0/engineering-audit-report.schema.json | 新增 | 冻结契约（A-2 定稿） |
| phase1/tools/test_engineering_audit_leg.py | 新增 | 23 用例测试矩阵 |
| **app/platform/security.py** | **+9 行（§3 唯一例外；原授权约 6 行，偏差=GET batches 白名单勘误与错误响应行，问题17 正式记录）** | 白名单增补两行+服务身份 batch_id 强制规则；OWNER 行为零变化 |
| phase1/tools/review_leg.py / arch_review_leg.py / test_acceptance_leg.py / scheduler.py | **零修改** | D2 同构复制边界 |
| docs/phase1/GPT05-ENGINEERING-AUDIT-LEG-CHARTER-DRAFT.md + decision-log.md（DEC-092） | charter 沿革+A-1 勘误+登记 | 立项链 |
| basic/tasks/b-20261117-gpt05-engineering-audit-leg/ | 任务包+证据 | 四件套+acceptance（design-notes/test-run×2/探针/live-run 全证据） |

## 4. 测试结果

- **四腿合跑 112/112 OK，exit=0 两轮复证**（23 GPT-05+29 GPT-03+29 GPT-02+31 GPT-04；acceptance/test-run-combined-112.txt/r2.txt）。
- **A10b/c/d 平台权限回归实测（security.py 变更真 HTTP 验证）**：服务身份无 batch_id→**403**；带 batch_id→**200**（total=2）；OWNER 会话无 batch_id→**200 行为零变化**（test_17+实战 live 实例复核）。
- **零 mock 实战全链（BATCH-001/PRJ-GPT04LEG@live M1 8002 重启加载 security.py 变更）：** setup-agents bootstrap→真实派单两次（发送双验均通过；新会话采集缺陷两连败 INBOUND_START_UNIT_MISSING 如实登记，§5 行 1 换会话重派）→L-018 手工 recoll 恢复（视口前置拉高+标记归属，会话 6afb8bb2-b068-83ee-865a-33ece050be1c，raw reply 6769B sha256=dd12b6a8692cca8e9edca0a45eefed84c6d144e5690a40ac25ba1b4c0592da12）→**真实 GPT-05 结论=BLOCKED（DO_NOT_SUBMIT）**：standards_matrix 七项（6 ISSUE+1 PASS）+三条 BLOCKER 发现（BATCH-001 含 REWORK 任务/交付闭环未完成/零 mock 闭环待证）→findings 结构化对象 vs 冻结契约 string[]→**契约校验 fail-closed 真拦截（三腿同型第四次实战实证）**→A6 人工保真规整 loss=NONE→attach 三步登记→**A5 批次/任务状态零变化核验通过**。账本 acceptance/live-run/ledger.jsonl sha256=700b7864e4d081b6c6f78109d39fc34b2d63f1b19038ed0e0eeefa9ca9df692b；规整稿 reply.txt sha256=dc2d94499ad5e25d3b021c3fcb3f9de7192094ecfd6b22a70db9716bcfcc63fd。零 mock 红线达成（真实 chatgpt.com 收发，DEC-028 口径）。

## 5. Git commit（完整 SHA＋父提交）

| 提交 | 内容 |
|---|---|
| 0ad84d4cddf3cbd5a47ac9b49d0a31dae758897d | Gate2-R2 三 P0 整改 charter v0.6 |
| c0d0fdf1fa83b89eae877dd47a1ea338957665ce | Gate2-R3 P0-3 唯一阻断整改 charter v0.7+迁移采纳 |
| cb0683c6589ef91d1a8f49cc77c2ed654dd5e957 | 第三次迁移+Gate2-R4 ②整改 charter v0.8 |
| 58da7697976a2465aa7fc641837af97f1190a68a | **Gate2-R5 两处修正 charter v0.9（冻结基线）** |
| 497ca06…（第二次迁移）/ da5e5aa… / d2548e2 | Gate2 现场归档/施工登记/S1-S3 |
| d2548e20786c4bc3ca5a627de522a902006536eb | **S1-S3 实现（腿本体+契约+security.py 例外+23 用例+112 合跑）** |
| cf5527026fe3bb6fc7bc5d373e2402e38328a49a | Gate2-R6 现场+零 mock 实战全链归档 |

**C1 绑定核验 PASS**（baseline=58da7697976a2465aa7fc641837af97f1190a68a→target=交付终态 commit，acceptance/binding-report.json）。**验收链：** Gate2-R6 设计冻结+开工授权（DEC-092）→S1-S3 实现→零 mock 实战真实 BLOCKED 结论登记（findings 结构化 fail-closed 第四证+A6 规整）→**G05-DR 实现级限定复核 REJECT（限定收口三项）**（reply sha256=f108e753d7fc2ccd…，dispatch-2026-11-16T23-12-38/recoll 七查全过；主体成果认可：真实收发/人工恢复/三步登记/测试回归；三项=①C1 缺失方向校验②A4c 成功路径登记后读回③A5 任务快照核验+9 行偏差记录）→**问题17 整改（commit 9c3c3a19c3156d557cb2fcb7dadc7ea301757fcc：三项全落实+24/24+四腿 113/113 OK）**→**G05-DR2 限定复核：三项技术整改全 PASS+9 行偏差记录修正后**（reply sha256=7c55c2e6e0b76ca4…，dispatch-2026-11-16T23-28-37/recoll 七查全过）→**纯文档收尾（本 commit）后按已核验结果直接登记：任务状态 COMPLETED、最终结果 PASS、复核对象 294f6ad2e6dbbbfd47b501bcba350bd4ca42cc23**（审查方明示无需第三轮实现级复核）。

## 6. 未解决问题

- **契约演进待办（三腿同族第四次实证）：** engineering-audit-report findings 由 string[] 演进为结构化对象（真实 GPT-05 输出 findings={severity,finding,evidence_refs,required_action}）——本轮人工保真规整过渡，正式演进须走 H2 流程。
- **矩阵×批次级 BLOCKER 语义细化：** 真实审计结论=BLOCKED（批次级 findings 三条 BLOCKER）而 standards_matrix 为 6 ISSUE+1 PASS（无 BLOCKED 项）——冻结映射规则未覆盖"批次级 BLOCKER 独立于矩阵项"的合法形态（腿端未拦截、登记如实）；语义细化随契约演进一并处理。
- **新会话采集缺陷（当日四现）：** --new-session 后 INBOUND_START_UNIT_MISSING/COMPLETENESS 两型采集失败（迁移三+实战两连败）——手工 recoll+视口前置拉高为有效恢复路径；根因移交派单工具维护任务。
- **跨批次隔离延期（Gate2-R6 收尾清单强制保留）：** 持有 ENGINE-04 服务 token 的调用方仍可查询任意已知 batch_id 的任务列表——本方案不构成跨批次完全隔离；per-agent 授权表及迁移不纳入本期。
- **消息 source-principal 服务端绑定缺失：** 平台级增强候选，登记遗留。
- **实战 M1 实例（8002）与 GPT-04 实例数据仍在 runtime（gitignored）：** 证据已归档，实例可关闭。

## 任务终态

- **COMPLETED／最终结果=PASS**（G05-DR2 三项技术整改全 PASS+文档收尾；Gate2 设计冻结与开工授权不变；PASS≠合并授权，DEC-010 红线仍用户本人）。

## 7. 后续建议

- ①G05-DR 限定复核（本任务 S4）通过后：GPT-02/03/04/05 四腿齐备，受控试运行（等级 B）前置能力就绪——下一节点按 DEC-026 路线评估（批次编排/自动触发链/新 commit 重审触发等）。
- ②契约演进（findings 结构化+矩阵×批次 BLOCKER 语义）四契约同族一并立项走 H2 流程。
- ③派单工具维护：新会话采集缺陷根因排查（当日四现）+--new-session 指针覆盖缺陷（两次复现）。
- ④本任务 PASS≠合并授权（DEC-010）：security.py 变更已在 main（任务登记流），无合并动作需求；不发布。
