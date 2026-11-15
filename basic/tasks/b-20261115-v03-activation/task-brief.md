# 任务书：WORKFLOW.md v0.3 生效落地（v03-activation）

- 任务ID：b-20261115-v03-activation
- 日期：2026-11-15
- **版本选型：**
  - 选定版本：Basic
  - 任务等级：S1（纪要 §五：文档类任务）
  - 选型理由：文档状态落定（版本头注记/清单声明）+ 自建检查器断言同步，无运行时代码交付、无外部行为变更；涉及工作流版本生效，保留 ChatGPT 独立验收 + 用户两道关口；低风险文档类
  - 批准人/日期：用户拍板，2026-11-15（v0.3 生效拍板原话"同意生效"+ 本会话开工指令；需求草稿确认拍板原话"同意"）

## 需求原文（用户原话，不加工）

见 `requirement.md`（2026-11-15 用户拍板"同意"确认版，一字不改存档）。

## 执行者理解（与原文分开，便于对账）

1. **生效动作**：basic/WORKFLOW.md 标题行去"（草案，待用户拍板生效）"；生效状态 blockquote（第 7 行）回填生效日期 2026-11-15 + 批准依据（用户拍板原话引用+存档位置：本任务包 requirement.md 与交接包 §5）；"草案/用户拍板生效前 v0.2 仍为现行版"改"已生效、v0.3 为现行版、v0.2 文件保留历史对照"。basic/ACCEPTANCE-CHECKLIST.md 同步转正式版（头部补已生效声明；该文件无草案字样需清除）。
2. **检查器与测试脚本同步演进**（L-017：断言随实态演进必须同步）：phase0/tools/s4-consistency-check.py ①a（草案版本头字面→已生效字面+生效日期+批准依据断言）、①b（草案期 v0.2 现行断言→已生效态断言）原地改写，检查项数不变（37 项保持）；s4-dv1-tests.py / s4-check-negpos-tests.py 涉及样本随实态同步，重跑保持 37/37 + 6/6 + 7/7 全过；另跑 basic/tool/check_taskpack.py 于 b-20261115-phasec-workflow-stats 确认 Phase=COMPLETED ①-⑥ 全 PASS Overall=PASS 不受影响。
3. **边界**：不碰 b-20261115-phasec-workflow-stats 任务包三文件（task-brief/steps/delivery，已 COMPLETED 历史裁定）；WORKFLOW.md 附录表 12 行冻结不动（检查器 ①c 锚定）；DEC-043 inbound_dom.mjs 收集器修复不动仍挂 backlog；v0.2 版本文件保留（历史对照）。
4. **本任务自身按 v0.3 全流程**：登记任务包→规划协商（ChatGPT 派单双向至共识）→用户拍板冻结步骤清单→执行→逐步独立验收；启用 v0.3 新条款 ST-05 申报前检查器自检 + ST-01 绑定申报核验。
5. **新态证据归档**：生效态四命令输出归档到本任务 acceptance/ 目录；b-20261115-phasec-workflow-stats 既有存档（phase0/tools/s4-*-output.txt 等）属历史证据不覆盖不改。
6. **首个日常任务**（v0.3 实战验证，低风险文档类）＝本任务生效 commit 后另立独立新任务，需求原文届时另行起草呈用户，不混入本任务。

## 验收目标（最终要实现什么；规划拍板时冻结细化，可观察结果）

- basic/WORKFLOW.md 版本头呈已生效态：标题无草案字样，生效状态 blockquote 含生效日期 2026-11-15 与批准依据（用户拍板原话），v0.3 为现行版、v0.2 保留历史对照；
- basic/ACCEPTANCE-CHECKLIST.md 头部转正式版已生效声明；
- s4-consistency-check.py ①a/①b 断言与已生效实态一致，检查项数 37 不变；
- 四命令重跑全过且输出归档于本任务 acceptance/：一致性 37/37（退出 0）+ dv1 6/6（退出 0）+ negpos 7/7（退出 0）+ check_taskpack（b-20261115-phasec-workflow-stats）Phase=COMPLETED ①-⑥ 全 PASS Overall=PASS（退出 0）；
- 已 COMPLETED 任务包三文件零改动（git diff 可证）；每步派单验收证据（dispatch 目录+reply SHA256）齐备。

## 优先级：普通

## 任务状态（随进度更新）

| 字段 | 值 |
|---|---|
| 当前状态 | 开发中 |
| 当前步骤 | S1 文档生效（2026-11-15 用户拍板"我同意，你可以与chatgpt讨论"冻结步骤清单，详见 steps.md） |
| 最终结果 | （任务完成前暂空） |
