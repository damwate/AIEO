# tasks/ —— 每任务全记录（Basic）

每任务一个目录：`tasks/<任务ID>/`，任务ID 格式 `b-YYYYMMDD-<短名>`。

| 文件 | 内容 | 时机 |
|---|---|---|
| requirement.md | 需求原文（用户原话，不加工） | 开工即建 |
| task-brief.md | 任务书（模板 `../templates/task-brief.md`，含版本选型/验收目标/状态） | 开工即建 |
| steps.md | 拍板步骤清单；**每步记录六要素**：①目标 ②修改文件 ③修改内容（含**本次待验收 commit 完整 SHA**）④执行结果 ⑤测试结果（未测项如实标"未测"）⑥验收证据引用（**结论 PASS/REJECT/BLOCKED + 对应步骤 + 待验收 commit + dispatch 目录 + reply SHA**，三者完整对应）；返工按"同一问题"计数登记 | 拍板后逐步填写 |
| acceptance/ | 每步验收证据（引用 phase0/logs/dispatch-<ts>/ + reply SHA256） | 每步验收后 |
| handoff.md | 交接包（权威模板 docs/phase1/handoff-template.md） | 交付时 |
| delivery.md | 完工总结七要素（原始需求/最终实现/修改文件/测试结果/Git commit/未解决问题/后续建议） | 交付时 |

按需创建，不预建空壳；验收证据原文在 phase0/logs/，此处放引用与摘要。
代码抽取登记（若本任务从中级版复制了代码）：来源文件路径、源 commit 完整 SHA、修改点、对应测试，记入 steps.md 对应步骤或代码头注释（禁止 import 中级版运行时模块）。
