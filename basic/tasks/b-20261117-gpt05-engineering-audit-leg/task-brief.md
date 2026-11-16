# 任务书：GPT-05 工程总审计真实腿最小版接入

- 任务ID：b-20261117-gpt05-engineering-audit-leg
- 日期：2026-11-17
- **版本选型：**
  - 选定版本：Standard（工作产品=平台真实腿接入；作业流程=Basic 工作流 v0.3）
  - 任务等级：M3（同构先例=GPT-03/02/04 三任务均 M3）
  - 选型理由：平台代码类任务（charter v0.9 Gate2-R6 设计冻结+开工授权 DEC-092，用户 2026-11-17 授权机制）
  - 批准人/日期：审查方 Gate2-R6 复审通过（DEC-092，2026-11-17）

## 需求原文

见 requirement.md（charter v0.9 §1 冻结版逐字照录，开工授权 DEC-092）。

## 执行者理解（与原文分开，便于对账）

- 新增 `phase1/tools/engineering_audit_leg.py`（D2 同构复制：以 test_acceptance_leg.py 为结构参考，复用公共件，不抽新 runner 不重构三腿）；落点=批次审计关口（显式 CLI 触发=D1 终裁）；RunKeyLock 沿用。
- 契约=新增 `contracts/v1.0/engineering-audit-report.schema.json`（charter A-2 定稿 21 字段表+standards_matrix 七字段+一致性规则；新增文件 H2）。
- **登记路线=三步独立登记（A4a 简报 artifact→A4b 报告 artifact→A4c AUDIT_SUBMITTED 批次级信封）+聚合标志 A4_REGISTERED 三子齐才写**（charter A-3 定稿；无任何状态事件）；结论权威=审计报告 artifact 唯一权威载体（D2 统一口径）。
- **message 409 五条件 AND**（P0-3：响应指认+账本指纹+correlation_id 读回+规范化指纹一致+与报告 artifact 绑定一致，任一缺失 fail-closed）；**M1 readback→canonical envelope 映射**按 A-3 冻结（账本预期 envelope 为骨架+九实质字段读回覆盖+agent_type 账本恢复+source_agent_id 一致断言）。
- M1 白名单=charter A-1 定稿 8 端点（ENGINE-04 身份，客户端层校验）；**§3 权限方案=唯一 M1 变更**（security.py 约 6 行：SERVICE_ALLOWED_ENDPOINTS 增补 ("GET","/api/v1/tasks")+服务身份该路由强制 batch_id 缺省 403；OWNER 行为不变）——**开工记录风险披露**：持有 ENGINE-04 token 的调用方仍可查询任意已知 batch_id（不构成跨批次完全隔离，per-agent 授权表延期）。
- 矩阵一致性（C1 定稿映射）：任一项 BLOCKED→result=BLOCKED；ISSUE→ACCEPTED_WITH_RISKS；全 PASS 或有理由豁免→ACCEPTED 可选；矛盾 fail-closed。结论×建议（C3）：一一映射（BLOCKED→DO_NOT_SUBMIT），矛盾 fail-closed。
- C2 全量分页：任务与报告双分页遍历+total 核对+数量不一致 fail-closed；GET /reports 无 batch_id 过滤→按批次任务逐项查询。
- M2 派单链零修改；出站 ≤1200B；指纹算法=_req_sha/_canon_sha 三腿同构；message_id=run_key 折叠（冻结算法）。
- 恢复=charter A-3 定稿逐步骤矩阵；验收=§7 证据矩阵 12 用例（含 A10b/c/d 权限回归+A5a/A5b 崩溃窗口）。

## 验收目标（charter v0.9 §7 冻结）

- A1 正常审计轮（ACCEPTED→留证完成，M1 批次/任务状态零变化）～A7 BLOCKED 留证+A8 矩阵矛盾+A9 建议矛盾+A10 权限拒绝+A10b/c/d 权限回归+A11 分页不一致+A5a/A5b 崩溃窗口——详见 charter §7 矩阵。
- 工程四项：①三腿 89 用例回归全绿+M1 平台测试全绿+A10b/c/d 实测②本腿新增测试矩阵（A1~A11+负例）③零 mock 红线（真实 chatgpt.com 收发）④白名单外端点拒绝（ENGINE-04 越权负例）。
- ST-05 检查器自检无 FAIL；交付证据绑定被测 commit 完整 40 位 SHA。

## 优先级：高

## 任务状态（随进度更新）
| 字段 | 值 |
|---|---|
| 当前状态 | 完成 |
| 当前步骤 | 全部完成：S1-S4+零 mock 实战真实 BLOCKED 结论三步登记（findings 契约拦截第四证+A6 规整 loss=NONE）+G05-DR 三项收口整改（9c3c3a19）+G05-DR2 三项 PASS+文档收尾（收口 commit） |
| 最终结果 | PASS（G05-DR2 三项技术整改全 PASS+文档收尾后按已核验结果直接登记，复核对象 294f6ad2e6dbbbfd47b501bcba350bd4ca42cc23；Gate2-R6 设计冻结+开工授权不变；四腿 113/113；A10b/c/d 实测；零 mock 实战真实 BLOCKED/DO_NOT_SUBMIT 留证；PASS≠合并授权 DEC-010） |
