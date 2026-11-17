# 交付记录：b-20261117-h2-contract-findings-evolution（DEC-093 #1/#2 H2 契约演进定向清理）

## 1. 原始需求

用户 2026-11-17 指令"细节跟 ChatGPT 讨论由它拍板"→ DEC-096 路径 B（先清 #1/#2 再立试运行 Gate）→ DEC-097 ChatGPT 实读拍板 #1=A/#2=A。逐字原文见 requirement.md。
验收链 reply SHA：DEC-096=`9b61ad44…`、DEC-097=`46b21068…`、规划复审=`635e6046…`、GPT-03 落点 C=`…`（dispatch-08-06-08）、最终验收=`3b4c094c…`。基线 36b9adebfe42ef14de5feda4f2947ab40d094d4b。

## 2. 最终实现内容

- **#1 findings 结构化契约演进（A）**：`contracts/v1.1/` 新增 5 文件——`_defs/findings.schema.json`（统一结构化定义，稳定 $id，required=finding_id/severity/description，severity 枚举 BLOCKER|CRITICAL|MAJOR|MINOR|INFO，additionalProperties=true）+ `review-report` / `arch-review-report` / `test-acceptance-review` / `engineering-audit-report` 四份 v1.1 契约（基于 v1.0 逐字段复制，仅顶层 findings 改 `$ref` 统一定义；`standards_matrix[].findings` 保持 string）。四份 v1.0 冻结文件 Git 字节级零 diff（SHA 与基线一致，审查方核验确认）。
- **四腿切换**：arch/test/eng 三腿 `*_SCHEMA` 路径与 `CONTRACT_VERSION` 切 v1.1，Ajv 校验 `addSchema(findingsDef)`；测试 fixture findings 由 string[] 改结构化对象（test-only）。GPT-03 按规划复审定案②(C)：保留 envelope 校验，新增 `issues[]` 必须字符串数组的 fail-closed 显式校验+ledger(R4_ISSUES_VALID)，**不映射 findings、不构造完整 review-report、不改业务逻辑**；该落点经追加会商 ChatGPT 裁定 C（dispatch-08-06-08）。
- **#2 BLOCKER 语义钉死（A）**：`acceptance/blocker-semantics.md` 钉死 8 条既有规则（来源=v1.0 schema description，非新增语义）+四型测试映射；新增 test_25 多项 BLOCKED→批次 BLOCKED/DO_NOT_SUBMIT（单项 test_09/无 BLOCKED test_09/矛盾 test_10/11/24 既有覆盖）。零契约字段/版本变更。

## 3. 修改文件

| 文件 | 变更 | 说明 |
|---|---|---|
| contracts/v1.1/_defs/findings.schema.json | 新增 | 统一结构化 findings 定义（四契约共用 $id） |
| contracts/v1.1/{review,arch-review,test-acceptance-review,engineering-audit-report}.schema.json | 新增 ×4 | v1.1 结构化契约，顶层 findings → $ref |
| contracts/v1.0/*.schema.json（4 份） | **零修改** | 字节级零 diff（审查方核验 SHA 一致） |
| phase1/tools/arch_review_leg.py / test_acceptance_leg.py / engineering_audit_leg.py | 改 | SCHEMA 切 v1.1 + CONTRACT_VERSION=1.1 + Ajv addSchema |
| phase1/tools/review_leg.py | 改 | GPT-03 issues[] fail-closed 校验（裁定 C） |
| phase1/tools/test_*.py（4 腿 + test_acceptance） | 改 | fixture 结构化 + test_05c/test_25 新增 |
| phase0/tools/test_schemas_v11.mjs | 新增 | v1.1 契约 Ajv 正/负例 6 用例 |
| basic/tasks/b-20261117-h2-contract-findings-evolution/ | 新增 | 任务包四件套 + acceptance（设计说明/三会商简报/blocker-semantics/测试运行证据） |
| 冻结契约 v1.0、M1-M4 运行时、DEC-010 | **零触碰** | 规划复审边界 |

## 4. 测试结果

- 四腿合跑 **118/118**（基线 116 + test_05c GPT-03 issues fail-closed + test_25 多项 BLOCKED；acceptance/local-test-runs-legs.log）。
- v1.1 契约 **6/6**（acceptance/evidence/v11-schema-run.log）；v1.0 契约 **141/141** 零回归。
- 工程审计独立 **25/25**（acceptance/evidence/eng-audit-25-run.log）。
- lint/AST **0 诊断**（acceptance/evidence/lint-evidence.log：8 文件 ast.parse=PASS + ESM 实跑有效 + IDE read_lints totalCount=0）。
- v1.0 四 schema 与基线 Git blob SHA 完全一致（审查方独立核验确认）。

## 5. Git commit（被测提交与验收链）

被测源码 commit：`245108c379335453abe250131908cfe747bb9d3a`（完整 40 位；基线 36b9ade…；经四轮独立验收，源码恒定未改）。证据补齐 commit：`4af23cc86b9927fcc8e0e8236ddccc22250801e5`。
验收链：08-22 未推送拒判（流程缺口）→08-25 补采集得仍不可核验 FAIL→08-34 审查方成功读取源码、核验通过但缺三项运行证据 FAIL→08-38 证据补齐 **#1 PASS #2 PASS 可交付**（dispatch-2026-11-17T08-36-25，reply 462B SHA-256=`3b4c094c41af0b7631a4a52404519aa0e534ce12870da5b86aa43cd26c76b5d1`）。四轮返工均属流程/证据补齐，非代码缺陷（steps.md 返工表登记）。被测 SHA 绑定方式：steps.md S2/S3/S4 ⑥ 引用 reply SHA 与被测 commit。

## 6. 未解决问题（含残留与范围边界）

- 审查会话 6afc054f 本任务累计 6+ 条 user 消息（超 DEC-084 阈值），因任务中段迁移会打断证据链+归属，暂不迁（steps.md 登记理由），本任务收口后评估迁移。
- 复用会话中同一标记 `[H2-ACCEPT]` 出现两轮，08-25 补采采用"锚定最后 user+标记断言+前轮 SHA 排除"适配（recoll_h2_accept.mjs，已归档 dispatch-08-25-03/recoll），属 L-018 同型扩展。
- DEC-093 其余遗留 #3/#4/#5/#6/#7 已在上节点（DEC-095）或不在本任务范围（per-agent 授权表、source-principal 绑定等），本任务仅 #1/#2。
- 未触碰 DEC-010 高危；未申请等级 B 试运行开工。

## 7. 后续建议

1. 按 DEC-096 建议顺序，下一步新建《受控试运行（等级 B）Charter》→规划复审（范围/数量/权限/退出标准，依 DEC-096 八维边界+三红线）→正式 Gate 授权→首批真实任务受控试跑→阶段复盘→906 顺延决策。
2. 受控试运行前评估审查会话迁移（DEC-084，见 §6）。
3. v1.1 契约双版本并存期，建议后续在平台侧明确"新报告用 v1.1、历史报告按 v1.0 读"的路由约定（本任务仅落契约与腿切换，未改平台路由）。
