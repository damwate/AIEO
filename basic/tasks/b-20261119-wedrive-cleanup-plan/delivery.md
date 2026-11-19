# 交付总结：b-20261119-wedrive-cleanup-plan

## 1. 原始需求（用户原话）

> 那你没找到本地目录，我建议你跟chatgpt先讨论下；不是删聊天记录，是删微盘同步/下载到本地的文件

## 2. 最终实现内容

按 AIEO Basic 工作流模块二（规划协商）完成：只读定位企微微盘本地目录并盘点 → 整理方案讨论简报 → 经 `phase0/tools/gpt_dispatch.mjs` 向 ChatGPT 新会话派发 → 采集回复 + 归属校验 + SHA256 归档 → 产出分级清理建议交用户拍板。**全程零删除、零聊天记录触碰、零系统配置改动。**

## 3. 修改文件

- 新增 `basic/tasks/b-20261119-wedrive-cleanup-plan/`（requirement.md / task-brief.md / brief.txt / steps.md / acceptance/s1-dispatch-digest.txt / delivery.md）。
- 派单原始证据 `phase0/logs/dispatch-2026-11-19T03-45-33/`。
- 未改业务代码/系统配置/微盘文件；`--no-update-pointer` 未覆盖审查会话指针。

## 4. 测试结果

- 只读盘点定位微盘根目录 `D:\WeChat\WXWork\<企业ID>\WeDrive\`（12 企业ID），最大 18.32GB（疑为公司A），构成 zip 10.1GB / tmp 4.4GB / MOV 3.5GB。
- 派单：代理稳定一次成功；发送双验通过；回复 10224B；reply.txt SHA256=37aeb2e8edf52bf3c8b4d274e745765c314c1fa91cc4ddd0f6360813dddeaa70 与 artifact 一致；JSON 六键齐全；标记归属唯一命中。
- ST-05 任务包自检：6/6 PASS，Overall PASS。

## 5. Git commit

无（控制层只读盘点 + 派单，无业务代码变更；工作区原为 main ahead=0 behind=0 干净）。任务包文档是否入库由用户决定，本任务不自提交。

## 6. 未解决问题

- **未执行任何删除**（DEC-010 红线，须用户逐项拍板）。
- ChatGPT 关键警示：已停认证企业的 18.32GB 目录须按"潜在唯一副本"处理；无法证明均为纯下载副本，直接删同步目录可能同步到云端。
- 12 个企业 ID 的真实企业名/认证状态尚未映射（ChatGPT 建议先用 A-L 代号盘点）。

## 7. 后续建议

- 先执行 ChatGPT 的 P0 只读盘点：12 企业 ID 分布表 + 最大企业 307 文件明细（可用 A-L 代号，不暴露真实企业名）。
- 确认 4.4GB `.tmp` 是否被占用/属未完成下载；核实 20 个 zip、2 个 MOV 的云端副本与备份状态。
- 清理优先用企微客户端"释放本地空间/取消同步"功能（须确认仅移除本地），手动删目录仅作最后手段；备份优先外置盘/NAS（D 盘仅剩 21GB）。
- 不用磁盘清理工具/存储感知自动清理 WeDrive；不在企微运行时删 WeDrive 目录。
