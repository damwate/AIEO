# #2 矩阵×批次 BLOCKER 语义钉死（零契约改动）

- 日期：2026-11-17
- 依据：DEC-097 ChatGPT 拍板 #2=A（仅补测试+文档钉死既有语义，不新增字段、不改契约、不升版本）
- 语义来源：`contracts/v1.0/engineering-audit-report.schema.json` description（既有冻结规则，非新增语义）；实现位于 `phase1/tools/engineering_audit_leg.py` a2_dispatch（C1/C3 映射）与 charter A-2 定稿。

## 既有规则（逐条钉死，均非本次新增）

1. **矩阵项结果域**：`standards_matrix[].result ∈ {PASS, ISSUE, BLOCKED}`；非法值 fail-closed（C1）。
2. **单项 BLOCKED → 批次 BLOCKED**：矩阵中任一标准项 result=BLOCKED → 批次总 result=BLOCKED（即使其余项 PASS/ISSUE）。
3. **多项 BLOCKED → 批次 BLOCKED**：多项 BLOCKED 与单项同映射，不叠加、不降级。
4. **无 BLOCKED 有 ISSUE → ACCEPTED_WITH_RISKS**：矩阵含 ISSUE 但无 BLOCKED，批次不得 ACCEPTED（须披露风险）。
5. **全 PASS / 理由豁免 → ACCEPTED**：`applicable=false` 须在 `findings` 说明理由（适用性不等于免检，fail-closed）。
6. **result×release_recommendation 一一映射（C3）**：ACCEPTED→SUBMIT_FOR_APPROVAL；ACCEPTED_WITH_RISKS→CONDITIONAL_SUBMIT_WITH_RISKS；BLOCKED→DO_NOT_SUBMIT；矛盾 fail-closed 禁登记。
7. **冻结映射未定义组合 → fail-closed**：矩阵仅 ISSUE 但总 result=BLOCKED（批次级 BLOCKER 独立决定总结果）须经正式契约演进（H2），当前实现不得默许（G05-DR 整改1 已披露偏差事实，登记后按本规则执行）。
8. **M1 状态零变化**：审计结论不自动推进任何 M1 状态（GPT-05 不推进状态，仅建议）。

## 测试覆盖（四型 + 矛盾）

| 型 | 用例 | 期望 |
|---|---|---|
| 单项 BLOCKED | test_09（reply_for("BLOCKED") 默认 ["PASS","BLOCKED"]） | 批次 result=BLOCKED，reco=DO_NOT_SUBMIT |
| 多项 BLOCKED | test_25（新增，["BLOCKED","PASS","BLOCKED","ISSUE"]） | 批次 result=BLOCKED，reco=DO_NOT_SUBMIT |
| 无 BLOCKED | test_09（ACCEPTED_WITH_RISKS，["PASS","ISSUE"]） | 批次 result=ACCEPTED_WITH_RISKS |
| 矛盾组合 | test_10（矩阵含 BLOCKED 总 ACCEPTED）、test_24（仅 ISSUE 总 BLOCKED）、test_11（result×reco 矛盾） | fail-closed 腿级 BLOCKED rc=2，不登记 |

## 范围声明

- 本次仅补测试+本钉死文档，零契约字段/版本变更；`standards_matrix[].findings` 保持单项 string（规划复审定案③）。
- 不重新审查四腿既有业务交付；不触碰 M1-M4 运行时、DEC-010 高危。
