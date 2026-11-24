# S1 补证复核 · 会话迁移记录

- 迁移原因：原审查会话 `6b050b37-40b8-83ec-9365-8a0ca627b757` 已达 **5 条 user 消息**，超过用户 2026-11-24 新规「每窗口最多 4 次对话」；按用户口径与 L-018 第 6 条主动迁移。
- 迁移时间：2026-11-24 约 18:20 +0800。
- 迁移简报：`briefs/s1-targeted-r1.txt`，正文 1153B + 自动 marker 38B = **1191B**（≤1200B，submit 校验通过），自包含接棒声明 + 任务/被测 SHA + 已确认证据路径 + 四类缺项 + 原边界 + 裁定/降档请求。
- 原会话备份：`phase0/logs/gpt-reviewer-session.pre-migrate-s1-20261124.json`（captured 2026-11-23T04:44:03Z，role=reviewer）。
- 迁移后：gpt-reviewer-session.json 同步更新为新 UUID；后续 S1 轮次在新会话继续。原会话归属证据（seq5/8/9/10/11）保留不变。
