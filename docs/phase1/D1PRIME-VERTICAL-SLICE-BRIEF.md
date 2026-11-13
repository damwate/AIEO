# T-P1-905：D1′ 真实端到端垂直切片任务书

**版本：** v0.2【号段已会务裁定回填（方案 A，dispatch-2026-11-13T19-27-30 §五）；全文待用户 2026-11-14 10:30 审阅】
**任务来源：** 06 §10.2 P0-B（重排路线）；06 §10.3 号段表；DEC-022 原则批准；EXP-PLANNING-001 §二.6（重大假设大规模投入前验证）
**开工条件：** T-P1-904（契约机器化缩编版 20 文件，06 §10.3.1）完成并通过验收。
**验证对象：** FEASIBILITY-REGISTER F-002（真实网页 GPT 收发，命门前提）、F-004（D1′ 可行性）、F-007（契约消费者缺位）。

---

## 1. 目标与定位

一条**真实低风险需求**走完最小闭环，验证"网页自动化能否稳定支撑真实开发闭环"这一全项目命门前提。D1′ 是 06 §10.2 P0-B，是 Phase 4 多角色闭环的前置验证器，也是契约体系的第一个真实消费者。

**诚实边界：** D1′ 验证的是**前提可行性**，不是工程形态——派单通道允许使用现役已验证的 `phase0/tools/gpt_dispatch.mjs`（CDP 接管，DEC-002），不要求 M2 工程化先行（工程化归 Phase 4）；调度仍可由主会话人工编排（F-001 的工程化在 D1′ 通过后立项）。

## 2. 范围：最小闭环九步

| # | 步骤 | 通道 | 证据要求 |
|---|---|---|---|
| 1 | M1 REST 真实建项目/需求批次/任务 | `POST /api/v1/...`（C7 服务身份认证） | 请求/响应 JSON |
| 2 | 任务包组装出站（≤1200 字节，长材料走 Git 指针 DEC-007/012） | gpt_dispatch.mjs | request.txt + SHA |
| 3 | 真实 ChatGPT 规划会话（GPT-01 角色定位） | gpt_dispatch.mjs `--new-session` | 会话 UUID + reply.txt + assistant DIL UUID |
| 4 | 回复经 M1 REST 登记 | artifacts+messages（三 ID 强制 DEC-015，幂等键完整） | artifact_id + 幂等重放不新增 |
| 5 | 状态机推进至 READY | M1 REST 事件（**禁 DB 直改**） | task_events 审计 |
| 6 | ZCode 真实领取 | M3 `bin/aieo-zcode-mcp.mjs` `claim_task`（重复领取 → TASK-0003） | claim 响应 JSON |
| 7 | ZCode 真实开发：低风险真实需求的最小变更（候选=AIEO 仓库自身小改进，文档/脚本级；**开工时定案，须真实且低风险**） | ZCode CLI/MCP（DEC-005 双通道） | 任务分支 + 过程记录 |
| 8 | 真实提交与采集 | 任务分支 commit → M4 采集 sha+diff（`commit_and_collect`） | commit SHA + diff 证据 |
| 9 | 报告登记闭环 | MCP `report_progress` + `submit_result` → M1 `POST /api/v1/reports/development` | development_report id + DEVELOPMENT_COMPLETED 入 Inbox |

## 3. 硬边界（DEC-017 全部适用，不解除）

- 公开仓库（damwate/AIEO）；单 assistant unit；稳定 DOM 集合；**任何不确定 → fail-closed/BLOCKED**；
- 扩展场景（多 unit/动态裁切/私有权限/故障注入）不触碰，归属 T-P1-906 分批复审；
- 不合并 main（DEC-010）；ZCode 开发在任务分支；
- 派单遵守会话锁 + 代理探活（DEC-004 口径更新 2026-11-14：系统代理当前=127.0.0.1:13772，历史 10391/6822 已过时，探活规则不变）；
- 回复信任以 reply.txt 原始字节 + SHA 为准；超时 ≠ 任务失败。

## 4. 契约 Schema 子集（T-P1-904 固定范围供给，06 §10.3.1）

- 消息信封/规划请求与结果/开发完成消息/报告/端点 Schema：由 T-P1-904 缩编版 20 文件供给，本任务为消费方（会务裁定方案 A：先机器化后切片，避免边开发边补契约的范围漂移）；
- 回复登记：复用 `contracts/v1.0/gpt-inbound-poc.schema.json`（Ajv 37/37 已验证）；
- 若 904 交付物存在缺口，按其 matrix.json PENDING 记录如实处理，不得本任务内无登记扩边。

## 5. 交付物

1. 全链证据目录 `phase1/logs/d1prime-<ts>/`（每步命令、输出、截图、SHA）；
2. 全链记录文档（绑定各步 commit/UUID/ID）；
3. FEASIBILITY-REGISTER F-002/F-004/F-007 状态更新（VERIFIED 或如实登记失败形态）；
4. PHASE-STATUS 更新；
5. 复盘记录：成功路径与 fail-closed 事件**均如实登记**，不伪装成功。

## 6. 验收标准

1. §2 九步每步有可复现证据（命令+输出+SHA）；
2. 真实 GPT 规划回复 ≥1 轮，经 Schema/三 ID 校验并 M1 登记成功；
3. 真实 commit 经 M4 采集且 SHA 独立可验证；
4. 全链状态推进均经 M1 REST，audit_logs 完整；
5. 结论三态如实：全链通 = PASS；任一步 fail-closed = 按实际登记（BLOCKED/REWORK），**不得将网页自动化失败伪装为 GPT 完成**（06 §3 验收红线）。

## 7. 明确不在范围

多角色全链（GPT-02~05 真实腿）、返工循环、测试执行 Worker（F-003 随后补位）、并发/多项目、管理后台 UI、私有仓库权限、多 assistant unit、M2/M3 工程化改造。
