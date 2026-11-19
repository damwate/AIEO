# 任务书：本机磁盘清理方案讨论（ChatGPT 规划协商）

- 任务ID：b-20261119-disk-cleanup-plan
- 日期：2026-11-19
- **版本选型：**
  - 选定版本：Basic
  - 任务等级：S1（材料提交/派单执行，不修改任何业务代码）
  - 选型理由：本任务为 AIEO 控制层动作——本机磁盘占用盘点 + 经派单工具向 ChatGPT 发起"清理方案讨论"并采集归档；不修改业务代码，对应 S1→Basic。
  - 批准人/日期：用户拍板，2026-11-19（用户指令原文见 requirement.md）

## 需求原文（用户原话，不加工）

见 `requirement.md`。

## 执行者理解（与原文分开，便于对账）

- 用户要求：就"本机磁盘清理"与 ChatGPT 讨论清理方案，并调用 AIEO 的 Basic 版本工具完成该协商。
- 本任务范围＝**规划协商**（Basic 工作流模块二）：本地只读盘点磁盘占用事实 → 整理"需求原文 + 理解 + 初步方案" → 经 `phase0/tools/gpt_dispatch.mjs` 派单 ChatGPT 讨论 → 采集回复并 SHA256 归档 → 汇总方案建议交用户拍板。
- **红线：** 数据删除属 DEC-010 高危红线；ChatGPT 网页会话无命令执行能力（CAP-20261113-001）。本任务**不执行任何删除/移动/清空操作**，只产出供用户拍板的分级方案；实际清理须用户本人拍板后另行实施。
- 会话处理：本任务与 AIEO 代码审查无关，使用 `--new-session --no-update-pointer`（DEC-094 #4），避免覆盖 `gpt-reviewer-session.json` 审查会话指针。

## 本机磁盘占用事实（2026-11-19 只读盘点）

- 分区：C 盘 148.9GB / 已用 140.7GB / 剩余 8.2GB；D 盘 326.6GB / 已用 307.1GB / 剩余 19.5GB（均偏紧，C 盘尤甚）。
- C:\Users\youting 合计约 83.26GB；AppData 下 >1GB 子项：Roaming\Tencent 8.5GB、Local\wsl 6.36GB、Roaming\Code 4.3GB、Temp 2.98GB、Local\kingoff 2.87GB、Roaming\kingsoft 2.93GB、Local\npm-cache 2.2GB、Roaming\ifonts_client 2.12GB、Roaming\Cursor 1.8GB、Roaming\miHoYo 1.32GB、.vscode\extensions 1.25GB、Roaming\Trae CN 1.17GB、Roaming\secoresdk 1.14GB、Local\McNeel 1.02GB。
- 明确缓存类：Downloads 4.72GB、Temp 2.98GB、npm-cache 2.2GB、pip\Cache 0.51GB、.cache 0.49GB、Windows\SoftwareDistribution\Download 0.25GB、Chrome\Default\Cache 0.23GB。
- 系统代理当前端口 1130（注册表 ProxyServer，监听中，经 curl 隧道 HTTP 200）；符合 L-014/L-016"配置只作候选、实测判活"口径。

## 验收目标（最终要实现什么）

- 新 dispatch 目录产出 request.txt + reply.txt + result.json；reply 为简报要求的结构化方案建议，并经归属校验确认属于本轮（简报标记文本唯一定位，L-018 第 4 条）。
- reply 原始字节 + SHA256 归档于步骤记录；任务包通过 check_taskpack 自检（ST-05）；全程零删除、零移动。

## 优先级：普通

## 任务状态（随进度更新）

| 字段 | 值 |
|---|---|
| 当前状态 | 完成 |
| 当前步骤 | （无） |
| 最终结果 | PASS（任务＝派单/采集/归档闭环达成；ChatGPT 回复为磁盘清理方案建议，实际删除须用户逐项拍板，未在本次执行） |

## 步骤清单

1. S1 规划协商：本地只读盘点磁盘占用 → 整理方案讨论简报（≤1200 字节）→ 经 gpt_dispatch.mjs 新会话派单 ChatGPT → 采集回复 + 归属校验 + SHA256 归档 → steps.md 六要素登记。
2. S2 汇总交拍板：将 ChatGPT 方案建议整理为"可自动清理/需用户确认/禁止删除"三分类，连同本机事实交用户拍板；**不执行任何删除**。
