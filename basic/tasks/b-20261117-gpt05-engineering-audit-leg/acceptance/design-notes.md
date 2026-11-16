# S1 设计笔记：GPT-05 工程总审计真实腿（同构差异对照与 security.py 变更方案）

- 日期：2026-11-17；依据：charter v0.9（Gate2-R6 设计冻结 DEC-092）+test_acceptance_leg.py 实读
- D2 终裁=同构复制：以 test_acceptance_leg.py 为结构参考，复用公共件（EngineM1Client/ReviewLedger/derive_recoll_driver/utc_now_iso/_canon_sha 同构/_req_sha/OUTBOUND_LIMIT/REST_TIMEOUT/PHASE0_TOOLS/CONTRACT_DIR/DISPATCH_LOG_DIR/ORCHESTRATOR_AGENT）；**不修改 review_leg.py/arch_review_leg.py/test_acceptance_leg.py 任何一行**；M1-M4 零修改（唯一例外=security.py 约 6 行，§3 权限方案，Gate2-R6 授权）。

## 1. 同构差异对照表（GPT-04 → GPT-05）

| 维度 | GPT-04（test_acceptance_leg） | GPT-05（engineering_audit_leg） | 依据 |
|---|---|---|---|
| 关口/触发 | TEST_ACCEPTANCE 态任务轮询 | **批次审计显式 CLI 触发**（--batch-id；D1 终裁一期唯一触发方式） | charter §1/§4 |
| 审计输入 | 任务字段+F-003 证据事实 | 批次字段+**任务全景（C2 双分页遍历+total 核对）**+材料指针 | charter A-2 |
| 结论域 | PASS/REWORK/BLOCKED | **ACCEPTED/ACCEPTED_WITH_RISKS/BLOCKED**（不同域不混用） | 角色 §6 |
| 一致性校验 | 15 组合矩阵+G2-04 复述 | **矩阵汇总映射（BLOCKED→BLOCKED/ISSUE→WITH_RISKS）+结论×建议一一映射** | charter C1/C3 |
| 登记路线 | /reports/test 原生端点原子推进 | **三步独立登记**：A4a 简报 artifact→A4b 报告 artifact→A4c AUDIT_SUBMITTED 批次级信封（task_id=null）+聚合标志；**无状态事件** | charter A-3 |
| 结论权威 | test_reports 表（端点内建） | **审计报告 artifact=唯一权威载体**（message=登记关联）；绑定不一致腿级 BLOCKED | charter D2 |
| 409 语义 | duplicate 非幂等返回→GET 五字段核实 | artifact 409=path+SHA 回核；**message 409=五条件 AND**（P0-3） | charter A-3 |
| readback | GET /reports 行核对 | **M1 readback→canonical envelope 映射**（账本预期骨架+九字段覆盖+agent_type 账本恢复+source_agent_id 断言+同一 _canon_sha） | charter P0-3 |
| M1 状态影响 | PASS/REWORK 推进任务态 | **零推进**（批次/任务状态不动；无 events） | charter §4 |
| 白名单 | 7 端点 | **8 端点**（+GET /batches/{id}、GET /tasks?batch_id=、GET /messages?correlation_id=） | charter A-1 |
| 身份 | GPT-04/ENGINE-03 | GPT-05/ENGINE-04 | charter §6 |
| 运行时 | runtime/test-acceptance-leg/tal-<key> | runtime/engineering-audit-leg/eal-<key>；EVT-EAL-<key> | 同构 |

## 2. security.py 变更方案（§3 唯一例外，约 6 行）

```python
# ①SERVICE_ALLOWED_ENDPOINTS 增补（一行）：
("GET", "/api/v1/tasks"),
# ②authorize_principal 服务身份强制规则（约 5 行，缺省 403 杜绝全局枚举）：
if (request.method, route_path) == ("GET", "/api/v1/tasks"):
    if not request.query_params.get("batch_id"):
        raise forbidden(
            "AUTH-0002 FORBIDDEN: service identity task list queries require batch_id"
        )
```
- OWNER 人工会话行为零变化（kind!="service" 提前放行）。
- 回归门槛：M1 平台既有测试全绿+A10b（无 batch_id→403）/A10c（带 batch_id→200）/A10d（OWNER 无 batch_id→200）+四腿合跑。
- 残余风险（开工记录披露）：持有 ENGINE-04 token 的调用方仍可查询任意已知 batch_id——不构成跨批次完全隔离；per-agent 授权表延期。

## 3. C2 双分页实现要点

- GET /api/v1/tasks?batch_id=X&page_size=200：响应 {items,total,...}；循环 page=1.. 直到累计 len==total；total 与实收不一致→OrchestrationError fail-closed（A11）。
- 报告全景：GET /api/v1/reports?type=…&task_id={tid} 按批次任务逐项查询（端点无 batch_id 过滤——charter 声明）；仅统计计数与 result 摘要（供简报），明细经材料指针。

## 4. 恢复矩阵映射（charter A-3 定稿）

resume 分支序：无 A1_BRIEF→A0/A1 重组装；A1_BRIEF 无 A2_*→续首次发送；意图无确认→fail-closed；发送锚点无 A3_REPLY_CAPTURED→recoll 补采；A3 有+A4a/b/c 缺→_resume_register 逐三步 skip 补登记；A4a-c 齐 A4_REGISTERED 无→补聚合标志；矛盾→fail-closed。attach-reply 同 GPT-04（allow_no_anchor 人工链）。

## 5. 风险清单

- ①GET /tasks 分页响应字段名（items/total）以实测为准（替身覆盖）。
- ②standards_matrix 校验须容忍 GPT-05 回复 extra 空数组等合法形态（契约 additionalProperties=false 内已定）。
- ③批次任务数大时简报全景截断风险：简报只放 id+status 压缩清单（≤1200B 硬限不变，明细走材料）。
- ④security.py 变更后 GPT-02/03/04 腿运行期技术上可调 GET /tasks 列表——客户端白名单未含=默认拒绝（行为不变，A1 平台测试+四腿合跑复证）。
- ⑤实战批次：live M1（8002）现有批次 BATCH-001 含 1 个 REWORK 任务——真实审计结论预期 BLOCKED/ACCEPTED_WITH_RISKS（真实结论即价值）。
