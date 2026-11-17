# S1 设计说明：DEC-093 #1/#2 H2 契约演进定向清理

- 日期：2026-11-17
- 依据：DEC-097 ChatGPT 实读拍板 #1=A/#2=A（reply 46b21068…，dispatch-2026-11-17T07-49-00）
- 基线：36b9adebfe42ef14de5feda4f2947ab40d094d4b

## 1. 实读证据：四契约 findings 现状（不同族）

| 契约 | findings 字段现状 | 行号 |
|---|---|---|
| review-report.schema.json | 结构化对象数组；required=finding_id/severity/description；severity 枚举 BLOCKER\|CRITICAL\|MAJOR\|MINOR\|INFO；additionalProperties=true | 52-69 |
| arch-review-report.schema.json | string[] | 39-43 |
| test-acceptance-review.schema.json | string[] | 73-79 |
| engineering-audit-report.schema.json | string[]（顶层，批次级） | 130-136 |

- 四腿实战真实产出均结构化对象（DEC-093 四次同型实证：GPT-02/03/04/05 均触发契约 fail-closed，靠 A6 人工保真规整 loss=NONE 绕过）。
- 冻结边界：四份 v1.0 schema description 均标"修改本文件须走契约版本演进流程，禁止原地改语义（H2）"；DEC-067 H2 先例=新增文件不改既有冻结契约。

## 2. 四腿报告校验消费方式（实读）

| 腿 | schema 常量 | 校验方式 | 备注 |
|---|---|---|---|
| GPT-02 arch_review_leg.py | ARCH_SCHEMA=contracts/v1.0/arch-review-report.schema.json（line 61） | run_ajv_validation Ajv2020 | CONTRACT_VERSION="1.0"（line 85） |
| GPT-04 test_acceptance_leg.py | TEST_SCHEMA=…/test-acceptance-review.schema.json（line 70） | run_ajv_validation | CONTRACT_VERSION="1.0"（line 106） |
| GPT-05 engineering_audit_leg.py | AUDIT_SCHEMA=…/engineering-audit-report.schema.json（line 61） | run_ajv_validation（line 614-634） | CONTRACT_VERSION="1.0"（line 97） |
| GPT-03 review_leg.py | 无报告 schema 常量 | 仅 message-envelope+messages-create Ajv（line 761-782） | 不校验 review-report.schema.json |

- 四腿 report 构造 findings 均来自 `parsed.get("findings", [])`（arch line 520 / test line 632 / eng line 565），即 ChatGPT 回复原样透传——这正是"结构化原样传递"的落点。

## 3. v1.1 设计方案（待规划复审确认）

- **统一 findings 定义**：新增 `contracts/v1.1/_defs/findings.schema.json`，`$id=https://aieo.local/contracts/v1.1/_defs/findings.schema.json`，`$defs.finding` 采用 review-report v1.0 结构化字段（可加 `source`/`evidence_ref` 可选字段以承载四腿差异，但 required 统一 finding_id/severity/description）。四份 v1.1 契约用 `$ref` 指向该定义；四腿 Ajv 校验前 `addSchema(findings 定义)` 以解析跨文件 `$ref`（Ajv2020 要求）。
- **v1.1 契约**：`contracts/v1.1/{review-report,arch-review-report,test-acceptance-review,engineering-audit-report}.schema.json`，基于 v1.0 逐字段复制，仅顶层 findings 改结构化 `$ref`；`$id` 路径改 v1.1；description 标"v1.1 结构化 findings 演进，v1.0 冻结历史报告仍可读"。
- **v1.0 零改**：四份 v1.0 文件 Git 字节级零 diff（验收硬指标）。

## 4. 三个技术确认点——ChatGPT 规划复审定案（2026-11-17，reply SHA-256=635e60469ac3bcee3aba6a1229a80eda82db0583a28f4c3bd35cde2bec64369a，dispatch-2026-11-17T07-54-13）

1. **统一 findings 定义放法=前者**：独立 `_defs` 文件 + 四契约 `$ref` + 四腿 Ajv `addSchema`（物理唯一，避免长期漂移）。补充约束：`$defs` 用稳定 `$id`，四契约引用同一 URI；Ajv 每实例注册一次，禁依赖远程自动加载。
2. **GPT-03 校验范围=增加校验**：保留原 envelope 校验，**新增 v1.1 报告 schema 校验**，失败仍 fail-closed。理由："仅新增文件却不执行校验，不算真正切换 v1.1；只补校验能力，不重审既有业务逻辑"。（我原倾向①腿零改被审查方推翻，按裁定执行。）
3. **`standards_matrix[].findings`=保持 string**：单项说明文本，顶层 findings 才是结构化发现记录，不扩大范围；原样保留禁改语义。

**#2 定案=A**：仅补测试+文档。单项 BLOCKED→批次 BLOCKED；多项 BLOCKED→批次 BLOCKED；无 BLOCKED→按既有 ISSUE/PASS 汇总；矩阵与批次 result 矛盾→fail-closed 禁登记；不增字段、不改契约、不升版本。
**范围红线**：只覆盖契约演进+BLOCKER 语义，不碰 M1-M4、DEC-010，不重新验收四腿既有业务交付。验收=v1.0 零 diff、v1.1 Ajv 正负例、四腿 116/116 零回归、两项独立验收。

## 5. #2 BLOCKER 语义钉死（零契约改动）

- 语义来源：engineering-audit-report.schema.json description line 5 既有规则（任一矩阵项 BLOCKED→result=BLOCKED；无 BLOCKED 有 ISSUE→ACCEPTED_WITH_RISKS；全 PASS/理由豁免→ACCEPTED；result×release_recommendation 一一映射；矛盾 fail-closed）。
- 四型测试：①单项 BLOCKED→BLOCKED/DO_NOT_SUBMIT；②多项 BLOCKED→BLOCKED/DO_NOT_SUBMIT；③无 BLOCKED 有 ISSUE→ACCEPTED_WITH_RISKS/CONDITIONAL_SUBMIT_WITH_RISKS；④result×reco 矛盾→fail-closed 不登记。
- 文档：在 acceptance/ 落语义说明，注明来源=v1.0 description 既有规则，非新增语义。

## 6. 回归清单

- 四腿合跑基线 116/116（b-20261117-dispatch-reliability-fix 交付实测），本任务零回归。
- phase0/tools/test_schemas.mjs（review-report 契约 Ajv 30/30 基线）需补 v1.1 正/负例。
- ST-05 检查器；v1.0 四文件零 diff；基线不漂移；DEC-010/M1 运行时零触碰。
