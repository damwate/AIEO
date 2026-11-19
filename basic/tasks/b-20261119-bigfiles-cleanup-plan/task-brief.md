# 任务书：大文件与已安装软件清理方案讨论（ChatGPT 规划协商）

- 任务ID：b-20261119-bigfiles-cleanup-plan
- 日期：2026-11-19
- **版本选型：**
  - 选定版本：Basic
  - 任务等级：S1（材料提交/派单执行，不修改业务代码）
  - 选型理由：控制层只读盘点 + 经派单工具向 ChatGPT 发起"大文件/已安装软件清理方案"讨论并采集归档；不删任何文件、不改业务代码，对应 S1→Basic。
  - 批准人/日期：用户拍板，2026-11-19（用户指令原文见 requirement.md）

## 需求原文（用户原话，不加工）

见 `requirement.md`。

## 执行者理解（与原文分开，便于对账）

- 用户在上轮微盘清理完成后，要求继续盘点"其他大文件和已安装的软件"，并**跟 ChatGPT 讨论**清理方案。
- 本任务范围＝规划协商（Basic 模块二）：只读盘点 C/D 盘大文件、一级目录占用、已安装软件与 WSL → 整理简报 → 经 `phase0/tools/gpt_dispatch.mjs` 新会话派单 ChatGPT 讨论 → 采集回复 + 归属校验 + SHA256 归档 → 汇总方案交用户拍板。
- **红线：** 数据删除属 DEC-010 高危红线；本任务**不删除任何文件、不卸载任何软件**，只产出方案。实际清理须用户本人逐项拍板后另行实施。ChatGPT 网页会话无命令执行能力（CAP-20261113-001），只给方案。
- 会话处理：`--new-session --no-update-pointer`（DEC-094 #4），不覆盖 reviewer 审查会话指针。

## 本机事实（2026-11-19 只读盘点）

### 清理后磁盘基线
- C 盘 已用 126.39GB / 可用 **22.47GB**；D 盘 已用 282.24GB / 可用 **44.39GB**（上轮微盘清理后：C 11→22.47GB、D 21→44.39GB；回收站已空）。
- 微盘残留：`D:\WeChat\WXWork\1688854962592099\WeDrive` 仅 0GB/2 文件（11:54 重新生成，客户端仍在运行所致），可忽略。

### D 盘一级目录占用 Top
| 目录 | GB | 说明 |
|---|---|---|
| `202412\YuanShen` | 144.43 | 原神游戏本体 |
| `Neverness To Everness` | 86.32 | 异环游戏（Client 80.56 + NTELauncher 5.75） |
| `Program Files` | 9.58 | 软件安装 |
| `javacode` | 6.46 | 含 `ecog_bim.sql` 1.73GB 备份 |
| `VideoHighlighter-Web-Windows-0.14.2` | 6.07 | 视频高亮工具 |
| `WeChat` | 6.03 | 微信 |
| `Program Files (x86)` | 4.77 | 软件安装 |
| `AI-Game-Clipper` | 3.58 | AI 游戏剪辑 |

### >1GB 大文件（C/D 用户区）
- 几乎全部是异环 `Neverness...\Client\WindowsNoEditor\HT\Content\{PatchPaks,Paks}` 下的 `pakchunk*.ucas/.pak`，单个 1.8–13.43GB。
- `C:\...\wsl\{...}\ext4.vhdx` 6.36GB（WSL Ubuntu-24.04 虚拟磁盘）。
- `D:\javacode\...\ecog_bim.sql` 1.73GB（数据库全量备份 20261026）。

### 已安装软件（注册表 34 项，安装位置在 D 盘的代表项）
原神、异环、微信、VS Code 1.147、Java 8 JDK/JRE、Navicat 16、ZCode 3.18.2、Git 2.47.1、TreeSize Free、PixPin、FileZilla、CC Switch、必剪、雷神加速器、网易邮箱大师、FireDaemon OpenSSL 3、KeePass。
- WSL 发行版：Ubuntu-24.04（Stopped）、podman-machine-default（Stopped）。

## 验收目标

- 新 dispatch 目录产出 request.txt + reply.txt + result.json；reply 为简报要求的结构化方案建议，经归属校验确认属于本轮（简报标记唯一定位，L-018 第 4 条）。
- reply 原始字节 + SHA256 归档；任务包通过 check_taskpack 自检（ST-05）；全程零删除、零卸载。

## 优先级：普通

## 任务状态

| 字段 | 值 |
|---|---|
| 当前状态 | 完成 |
| 当前步骤 | （无） |
| 最终结果 | PASS（任务＝派单/采集/归档方案讨论闭环达成；ChatGPT 回复为大文件/软件清理方案建议，实际删除/卸载须用户逐项拍板，未执行） |

## 步骤清单

1. S1 规划协商：只读盘点大文件/软件 → 整理方案讨论简报（≤1200B）→ 经 gpt_dispatch 新会话派单 ChatGPT → 采集回复 + 归属校验 + SHA256 归档 → steps.md 六要素登记。
2. S2 汇总交拍板：将 ChatGPT 方案整理为分级建议交用户拍板；**不执行任何删除/卸载**。
