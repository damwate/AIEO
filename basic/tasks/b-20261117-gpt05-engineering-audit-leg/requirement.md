# 需求原文：GPT-05 工程总审计真实腿最小版接入

- 任务ID：b-20261117-gpt05-engineering-audit-leg
- 日期：2026-11-17
- 立项链：DEC-026 决议二路线 → charter `docs/phase1/GPT05-ENGINEERING-AUDIT-LEG-CHARTER-DRAFT.md` v0.9（Gate1 PASS_WITH_CONSTRAINTS→G05-R1/R2→Gate2 六轮收敛→**Gate2-R6 PASS 设计冻结+开工授权授予**，reply sha256=90997e741ffae280…完整值见 dispatch-2026-11-16T22-30-47/recoll）→ **开工授权生效（DEC-092 登记；授权依据=用户 2026-11-17 授权机制"以 ChatGPT 意见为准"，DEC-089 登记；DEC-010 红线仍须用户本人）**

## 开工授权记录（2026-11-17，Gate2-R6 收尾清单逐项）

- 授权范围：新增 phase1/tools/engineering_audit_leg.py+contracts/v1.0/engineering-audit-report.schema.json（A-2 定稿落位）+ENGINE-04 bootstrap+security.py 约 6 行（§3 权限方案：白名单增补+服务身份 batch_id 强制规则）+简报/账本/恢复/测试/验收证据+四腿合跑回归。
- **开工记录风险披露（Gate2-R6 强制要求）：** 持有 ENGINE-04 服务 token 的调用方仍可查询任意已知 batch_id 的任务列表——本方案**不构成跨批次完全隔离**；per-agent 批次授权表及数据库迁移延期（不纳入本期）；缓解=令牌 gitignored runtime+客户端单 --batch-id+全链绑定 batch_id+审计证据可追责。
- 绑定限制：冻结基线=charter v0.9@58da7697976a2465aa7fc641837af97f1190a68a（实现不得擅自扩大范围）；M1-M4 零修改（唯一例外=security.py 约 6 行）；既有契约零修改；不重构三腿；DEC-017 不解除；DEC-010 红线须用户本人。

## 需求原文（charter v0.9 §1 冻结版，逐字）

> "在 GPT-04 测试验收真实腿最小版（`phase1/tools/test_acceptance_leg.py`，b-20261117-gpt04-test-acceptance-leg，DEC-091）同框架基础上，接入 **GPT-05 工程总审计真实腿最小版**：对指定批次（batch_id 显式指定）自动组装批次审计简报并触发**一次**真实 chatgpt.com 总审计派单（复用 M2 派单链与 fail-closed 门禁），采集审计回复并经冻结契约校验后登记 M1（artifacts+messages，AUDIT_SUBMITTED 批次级信封），审计结论（ACCEPTED/ACCEPTED_WITH_RISKS/BLOCKED）落档留证；**批次状态推进、多批次编排、自动触发链不在本期**。异常按 §5 分类处置，人工随时可介入。"

## 边界约束（charter v0.9 §9 不在范围清单，逐字）

批次状态自动推进与编排；多批次/自动触发链；任务级审查改造（三腿既有）；生产发布审批链；scheduler.py 修改；新 commit 重审触发；既有契约文件修改；M1-M4 代码修改（§3 权限方案 security.py 约 6 行除外）；管理后台；公共 runner 抽取与已 PASS 三腿重构；消息 source-principal 服务端绑定改造（遗留待办）。
