# 任务书：DEC-093 #1/#2 H2 契约演进定向清理

- 任务ID：b-20261117-h2-contract-findings-evolution
- 日期：2026-11-17

## 版本选型

- 选定版本：Basic（作业流程 WORKFLOW v0.3；工作产品=契约新版本文件 v1.1 + 四腿报告校验路径切换 + 测试/文档）
- 任务等级：S2（按风险定：涉及冻结契约版本演进 H2 + 四腿校验切换，但 v1.0 零改、双版本并存、原样传递）
- 选型理由：DEC-097 ChatGPT 拍板 #1=A/#2=A；H2 先例 DEC-067=新增文件不改既有契约；无 M1 运行时变更。
- 批准人/日期：ChatGPT 拍板 DEC-097（2026-11-17）+ 用户授权；DEC-010 红线仍用户本人。

## 执行落点

- 目标仓库：damwate/AIEO（d:/AIEO）
- 目标分支：main（任务登记流；每步单独 commit，不合并不发布）
- 基线 commit：36b9adebfe42ef14de5feda4f2947ab40d094d4b

## 需求原文

见 requirement.md。

## 执行者理解（与原文分开）

### #1 findings 结构化契约演进（A）
- 四契约 findings 字段现状（实读）：`review-report.schema.json`=结构化对象数组（finding_id/severity 枚举 BLOCKER|CRITICAL|MAJOR|MINOR|INFO/description/file/line/category/impact/recommendation，required=finding_id+severity+description，additionalProperties=true）；`arch-review-report` / `test-acceptance-review` / `engineering-audit-report` = `string[]`。
- 四腿实战真实产出均为结构化对象（DEC-093 四次同型实证）→ 现行 v1.0 string[] 契约 fail-closed 拦截 → 历次靠 A6 人工保真规整 loss=NONE 绕过。
- 目标：`contracts/v1.1/` 新增四份契约，**共用统一 findings 定义**（物理共享 `$defs`/独立 `$ref` 文件，Ajv 需 addSchema；避免四份字段口径再分叉）；四腿报告校验切 v1.1；v1.0 四文件零改、历史报告可读；结构化 findings 原样传递禁止有损转换。
- 技术确认点（规划复审）：①统一 findings 定义放法（独立 `contracts/v1.1/_defs/findings.schema.json` + 四契约 `$ref` + 四腿 Ajv addSchema）是否认可；②GPT-03 review_leg.py 当前不校验 review-report.schema（仅 envelope），v1.1 切换对它是"新增报告校验"还是"仅新增契约文件不改腿行为"；③engineering-audit 的 `standards_matrix[].findings`（单项 string，非 findings 列表）是否保持 string 不动（避免扩大范围）。

### #2 矩阵×批次 BLOCKER 语义（A）
- engineering-audit-report.schema.json description 已含规则：任一 standards_matrix 项 BLOCKED→批次 result=BLOCKED；无 BLOCKED 有 ISSUE→ACCEPTED_WITH_RISKS；全 PASS 或理由豁免→ACCEPTED；result×release_recommendation 一一映射；矛盾 fail-closed。
- 目标：仅补测试（engineering_audit_leg 已有 C1 映射逻辑，补边界用例：单项 BLOCKED/多项 BLOCKED/无 BLOCKED/矛盾组合）+ 文档钉死语义；零契约改动、零新字段。

## 验收目标

- #1：v1.1 四契约 Ajv 正例（结构化 findings 原样通过）+ 负例（缺失 finding_id/severity/description、severity 非法枚举、string[] 旧格式在 v1.1 下 fail-closed）全过；四腿测试零回归（116/116 基线）；v1.0 四文件 Git 零 diff（字节级）；历史 v1.0 报告仍可被 v1.0 契约校验通过。
- #2：矩阵 BLOCKER 四型边界用例全过（单项/多项/无/矛盾）；文档落位；engineering_audit_leg 测试零回归。
- 每项独立 ChatGPT 验收；ST-05 健康；基线不漂移；未碰 DEC-010/M1 运行时/其他冻结契约。

## 优先级：高（阻塞等级 B 受控试运行 Gate）

## 任务状态

| 字段 | 值 |
|---|---|
| 当前状态 | 开发中 |
| 当前步骤 | S1（规划复审 PASS；S2/S3/S4 本地完成，#1/#2 独立验收待派；当前步骤仍为最早未获独立验收的 S2，故 ST-05 判 S2-S5 未到期） |
| 最终结果 | （未定） |
