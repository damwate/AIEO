# 需求原文：DEC-093 #1/#2 H2 契约演进定向清理

- 任务ID：b-20261117-h2-contract-findings-evolution
- 日期：2026-11-17
- 立项依据：DEC-096（ChatGPT 拍板 B：先清 #1/#2 再立等级B试运行 Gate）+ DEC-097（ChatGPT 实读后拍板 #1=A/#2=A）+ 用户 2026-11-17"细节跟 ChatGPT 讨论由它拍板"授权。

## 需求原文（逐字不加工）

> "你推进吧，不用等我决策，我不决策这些细节，你跟chatgpt讨论后执行即可，chatgpt拍板这些细节"

## ChatGPT 拍板结论（DEC-097 reply 原文归档 phase0/logs/dispatch-2026-11-17T07-49-00/reply.txt，SHA-256=46b21068aa867e2c443b5ec2664ea9ee1da0ef8ae10bed2359c1dfa4707d7047）

> #1=A：新增四份 v1.1 结构化契约 + 四腿校验切 v1.1；v1.0 冻结零改、历史报告保持可读（双版本并存）；四份 v1.1 共用统一 findings 定义（避免字段口径分叉）；四腿结构化 findings 原样传递、禁止有损转换。
> #2=A：仅补测试+文档钉死既有 BLOCKER 语义，不新增字段、不改契约版本。测试须覆盖单项 BLOCKED、多项 BLOCKED、无 BLOCKED、矛盾组合。
> 拍板边界：v1.0 冻结零改；v1.1 新增文件保留历史兼容；不借机改造其他冻结契约；两项均独立验收完成后再申请等级 B Gate。

## 本任务范围（仅 #1/#2，不扩大）

- **#1**：在 `contracts/v1.1/` 新增四份结构化 findings 契约（review-report / arch-review-report / test-acceptance-review / engineering-audit-report），共用统一 findings 定义；四腿（GPT-02/03/04/05）报告校验切到 v1.1；v1.0 四文件零修改、历史报告仍可按 v1.0 读取。
- **#2**：补测试+文档钉死 engineering-audit 既有矩阵×批次 BLOCKER 语义（description 已含"任一矩阵项 BLOCKED→批次 result=BLOCKED"），零契约改动、零新字段。

## 边界约束

- DEC-097：v1.0 冻结零改、不借机改其他冻结契约、结构化原样传递不有损。
- ChatGPT DEC-096：**不重新审查四腿已交付成果、不扩大清理范围**。
- 基线 = 本任务开工 HEAD（实查后回填；上游 DEC-097 时 HEAD=36b9ade）；C1 绑定被测 commit 完整 40 位。
- 不触碰 DEC-010 高危；不申请等级 B 试运行开工；M1-M4 运行时零修改（v1.1 契约+腿脚本+测试+文档）。
- 每项独立交 ChatGPT 验收；ST-05 检查器自检；每步绑定被测 commit。
