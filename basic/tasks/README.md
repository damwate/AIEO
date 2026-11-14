# tasks/ —— 每任务全记录（Basic）

每任务一个目录：`tasks/<任务ID>/`，任务ID 格式 `b-YYYYMMDD-<短名>`。

| 文件 | 内容 | 时机 |
|---|---|---|
| requirement.md | 需求原文（用户原话，不加工） | 开工即建 |
| task-brief.md | 任务书（模板 `../templates/task-brief.md`） | 开工即建 |
| steps.md | 拍板步骤清单与状态（待办/进行/完成/返工） | 拍板后 |
| acceptance/ | 每步验收证据（引用 phase0/logs/dispatch-<ts>/ + reply SHA256） | 每步验收后 |
| handoff.md | 交接包（权威模板 docs/phase1/handoff-template.md） | 交付时 |
| delivery.md | 完工总结 | 交付时 |

按需创建，不预建空壳；目录内文件即任务全记录，验收证据原文在 phase0/logs/，此处放引用与摘要。
