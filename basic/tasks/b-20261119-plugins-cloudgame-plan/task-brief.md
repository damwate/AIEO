# 任务书：插件/软件多版本与云游戏替代性考察讨论（ChatGPT 规划协商）

- 任务ID：b-20261119-plugins-cloudgame-plan
- 日期：2026-11-19
- **版本选型：**
  - 选定版本：Basic
  - 任务等级：S1（材料提交/派单执行，不修改业务代码）
  - 选型理由：控制层考察结果整理 + 经派单工具向 ChatGPT 发起讨论并采集归档；不删任何文件/软件、不改业务代码，对应 S1→Basic。
  - 批准人/日期：用户拍板，2026-11-19（用户指令原文见 requirement.md）

## 需求原文（用户原话，不加工）

见 `requirement.md`。

## 执行者理解（与原文分开，便于对账）

- 用户此前要求考察已装软件/插件的多版本与闲置情况，并评估云原神/云异环能否替代本地游戏（硬要求：免费+免费排队不久）；本轮追加"考察完之后同样可以跟 chatgpt 讨论"。
- 本任务范围＝规划协商（Basic 模块二）：将已完成的只读考察结果整理为自包含简报 → 经 `phase0/tools/gpt_dispatch.mjs` 新会话派单 ChatGPT 讨论 → 采集回复 + 归属校验 + SHA256 归档 → 汇总方案交用户拍板。
- **红线：** 数据删除属 DEC-010 高危红线；本任务**不删除任何文件、不卸载任何软件**，只产出方案。实际清理须用户本人逐项拍板。ChatGPT 网页会话无命令执行能力（CAP-20261113-001），只给方案。
- 会话处理：`--new-session --no-update-pointer`（DEC-094 #4），不覆盖 reviewer 审查会话指针。

## 考察事实（2026-11-19 只读，已产出）

- 多版本：WebView2 135+143（多应用依赖）、Java8 jdk+jre 配套、VC++ 多版本、FileZilla 3.69+3.70、SakuraCat/Podman/7-Zip 各 x2（疑注册表 32/64 视图）。
- VSCode 扩展约 1.3GB：claude-code 374MB、continue 230MB（9月未动）、redhat.java 178MB、migrate-java-to-azure 128MB、intellicode+示例 72MB（2025初未动）等。
- 云游戏：云原神/云异环均官方、PC 网页可玩、数据互通；免费每日 15 分钟，免费排队优先级最低（高峰原神等半小时），免排队须买卡。两游戏用户仍在玩。
- 完整软件清单见 `b-20261119-bigfiles-cleanup-plan/acceptance/installed-software.json`。

## 验收目标

- 新 dispatch 目录产出 request.txt + reply.txt + result.json；reply 为结构化方案建议，经归属校验确认属于本轮（简报标记唯一定位，L-018 第 4 条）。
- reply 原始字节 + SHA256 归档；任务包通过 check_taskpack 自检（ST-05）；全程零删除、零卸载。

## 优先级：普通

## 任务状态

| 字段 | 值 |
|---|---|
| 当前状态 | 完成 |
| 当前步骤 | （无） |
| 最终结果 | PASS（派单/采集/归档方案讨论闭环达成；ChatGPT 回复为插件/云游戏方案建议，实际清理须用户逐项拍板，未执行） |

## 步骤清单

1. S1 规划协商：整理考察简报（≤1200B）→ 经 gpt_dispatch 新会话派单 ChatGPT → 采集回复 + 归属校验 + SHA256 归档 → steps.md 六要素登记。
2. S2（后续，本任务不含执行）：用户逐项拍板后再清理/卸载。
