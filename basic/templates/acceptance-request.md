# 验收请求：<任务ID> 第 N 步

- 交付物：<文件路径 / 命令 / 产出说明>
- 本步骤目标（拍板原文照录）：
- 自测证据：<命令 + 输出摘要；未测项如实标注"未测"，不得留空>
- 验收通道：ChatGPT 独立验收（派单工具 phase0/tools/gpt_dispatch.mjs；证据入 phase0/logs/dispatch-<ts>/）

## 请复核方按四态给出结论

- PASS / REJECT / PARTIAL / BLOCKED（如实区分；复审环境限制≠代码缺陷）
- 回复格式：结论行 + 依据 +（REJECT/PARTIAL 时）具体修改要求
- 注意：同题第 3 轮不收敛即升级开会（AI-DEV-LESSONS §2），验收方与执行方共同遵守
