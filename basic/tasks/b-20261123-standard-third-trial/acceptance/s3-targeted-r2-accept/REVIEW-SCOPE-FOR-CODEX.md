# 请 Codex 审核：本轮「针对性补证复核」的复审内容与边界

> 用途：交 codex 独立审核执行者（AIEO 会话）这一轮通过 `standard-queue` 发给 ChatGPT 审查方的复审内容、补证真实性与流程合规性。本文只描述「复审什么、依据什么、不碰什么」，不预设立场。

## 1. 复审对象
- 任务：`b-20261123-standard-third-trial`（第三次 Standard 试运行）。
- 步骤：**S3 — R1/R2/R3 与 auto 尺寸本地实施**（业务代码在 GDC / AIS 两仓，AIEO 只存流程与证据）。
- 复审性质：**针对性补证复核**，不是重新验收、不是代码返工。

## 2. 保留的历史裁定（不改写、不推翻）
| 轮次 | 队列 seq | 裁定 | 完整 reply SHA256 |
|---|---|---|---|
| S1 正式派单 | seq8 `s1-formal` | REJECT | `87b19055d5d8c15487cd3c7759ea8bacb4fdfdba1b7f838cb6ae7b3208a97a39` |
| S3 正式派单 | seq9 `s3-formal` | REJECT | `81b313dfcc8fc135b4bf2a404031da55aa01d2dcff832b3739d32329adcf0ffd` |
| S3 第一轮针对性复核 | seq10 `s3-targeted-r1` | REJECT（证据不足型） | `d33fd97f008c85710dd17df0007a0163d1f4e22ddc80cd1f7401dbf7deaac7ed` |
| S3 第二轮针对性复核 | seq11 `s3-targeted-r2` | **PASS_WITH_CONSTRAINTS**（S3 本步骤补证闭环） | `da668776dfe9da79c77782f662debd4d4aa2535ceab0674d5dde1c85e15714ca` |

seq11 只复核①④⑥：①目标完成 PASS（远端五份补证文件按 Blob SHA 全部可读）、④证据质量 PASS_WITH_CONSTRAINTS（六项 SHA256 逐字节吻合、GDC 10/10 与 AIS 4/4 清单文件可读；collect-only 计数无独立控制台日志，不升级为独立执行日志）、⑥证据可核查 PASS；⑤沿用认可不重开。三轮 REJECT 原样保留。审查方明确「ST-05 步骤验收记录仍需更新，不能因本次独立复核就宣称任务包整体完成」。

用户已核对 `7dfdc858…` 中两份原始回复 SHA256 与登记一致；执行者亦复核三份全一致。

## 3. 只复核「上轮未通过的证据项」
审查方 seq10 已明确认可、本轮**不重开**：
- ⑤ 测试真实执行 → `PASS_WITH_CONSTRAINTS`（GDC 145/2、AIS 78、AIEO 队列 12 三份原始日志真实可读，含命令/被测 SHA/时间/结果）
- AIEO SHA 对账 → `PASS`（`c63fe3c…` R3整改回交 → `4d184e8…` 独立复验归档 → `7dfdc858…` 返工关联登记，用途区分合理，GDC/AIS 被测 SHA 未因此变化）
- 四个完整 SHA 绑定、代码修复方向与机制（沿用上轮 PASS）

本轮**只重审 seq10 仍未通过的 ①目标完成 / ④证据质量 / ⑥证据可核查**，请审查方就 S3 本步骤独立裁定 PASS/REJECT。

## 4. seq10 REJECT 的根因与本轮补证
- **根因**：审查方按 Git Blob SHA 从**远端 GitHub 提交树**读取证据；seq10 简报指定的「补证归档 `7dfdc858…`」树中不含 `acceptance/s3-supplement/`（404），且原始日志为 UTF-16LE/NUL 交错、CMD 头仍是 `<10 target files>` / `<4 target files>` 占位符。补证当时只在本地未推送提交里，远端不可读。
- **审查方给出的唯一最小补证动作**（原文）：「把三份 UTF-8 日志副本、原始日志 SHA256 对照表、GDC 10 文件 / AIS 4 文件 collect-only 清单，确实提交到 `acceptance/s3-supplement/`，然后给出新提交完整 SHA。无需重新跑 145/2、78、12 项测试，也不需要重新审查已通过的代码。」

## 5. 本轮已提交的补证（`acceptance/s3-supplement/`，新提交完整 SHA `7cc4fc1d4a175198bc5d87f7a6aa7d55b2bad7c8`，已 push 到 `origin/feat/standard-task-management`）
| 文件 | 内容 | 真实性约束 |
|---|---|---|
| `gdc-90ce2233-r3.utf8.log` | GDC 145/2 日志 UTF-8 副本 | 原件保留 `test-logs/`，头部标注 `Source` 路径 + `Source SHA256` |
| `ais-a1f55b52-r3.utf8.log` | AIS 78 日志 UTF-8 副本 | 同上 |
| `aieo-queue-4d184e8-r3.utf8.log` | AIEO 队列 12 日志 UTF-8 副本 | 同上 |
| `SHA256-CONTRAST.md` | 原件/副本内容 SHA256 对照表 | 明确 Git Blob SHA ≠ 内容 SHA256，口径不混用 |
| `COLLECT-ONLY-MANIFEST.md` | GDC 10 文件、AIS 4 文件清单 + 在被测 SHA 实测 collect-only 计数 | GDC 9 文件 123 + 网关 24 = 147 = 145+2；AIS 4 文件 = 78；清单源于 `CODEX-HANDOFF.md`、`codex-r3-remediation.md` 交叉核对 |

文件清单补齐依据真实执行记录（pytest `--collect-only` 在被测 SHA 上实测），**未重跑测试、未访问生产、未调用真实供应商**。

## 6. 被测 / 归档 SHA（简报分别标明）
- GDC 被测：`90ce2233b4da9d844cf1e165c43cec2ecdd3cddd`
- AIS 被测：`a1f55b523f90763bcd12823bf52cff9d710381a6`
- AIEO 复验归档：`4d184e8de4eab56519c4e0f57a6e37afbc7984ac`
- AIEO 补证归档：`7dfdc858891d4319088c8744618fb48d7db65f4a`
- 本轮补证提交（远端可读）：`7cc4fc1d4a175198bc5d87f7a6aa7d55b2bad7c8`

## 7. 流程合规性（请 codex 重点核验）
- 授权：用户授权「本地补证 + S1/S3 各最多一轮针对性补证复核」，后追加「授权 push + 复核（放宽各最多一轮）」。S1 因历史记录缺项（见 `acceptance/s1-supplement/GAP-REPORT.md`）按「先回报具体缺项」**未派单**。
- L-018：每轮发出前核对会话消息数与字节预算；seq11 发出前会话已达 4 条 user 消息阈值，已评估并记录「暂不迁移」理由（见 `L-018-pre-dispatch.md`）。两轮采集均 fail-closed，按 L-018 禁重发→三步诊断→静态 DOM 全量物化补采→归属校验三件套（标记唯一定位 + 最后 user 断言 + 前轮 reply SHA 排除集）→七查→reconcile COMPLETED，零重发。
- 简报预算：`submit` 把 `[AIEO-ROUND:24位]\n`（38B）拼到正文前再校验 ≤1200 UTF-8 字节；seq11 草稿正文 1185B（合 1222B）会被 `playwright_queue.py:100` 拒绝，已精简到正文 948B / 含 marker 986B 后提交。
- push：按 L-014 走 `check-push.mjs --push --yes`（注册表活代理 1080，直连失败），只推 `feat/standard-task-management`，**未触碰 main**、未合并、未生产发布、未付费验收。
- ST-05：③ 步骤验收记录 FAIL（S1/S3 仍缺 PASS 结论），如实保留，不伪造 PASS。
- 任务状态：**保持验收中**（IN_PROGRESS）。

## 8. 边界（请 codex 确认未被突破）
- 不合并 main/dev、不生产发布、不付费业务验收。
- SQLite 迁移 PASS 不扩展为 PostgreSQL 已演练；本地 mock/接口参数通过不等于真实供应商出图效果或计费已验收。
- 不改已 PASS 源码、不补造历史日志、不把二手转述冒充原始记录。

## 9. 请 Codex 回答
1. 复审范围（只复核①④⑥、保留三轮 REJECT、不重开已认可项）是否符合「针对性补证复核」语义？
2. 补证文件的内容与来源标注是否真实、可核查、与被测 SHA 绑定正确？
3. push / 简报预算 / L-018 补采 / ST-05 处置是否符合 AGENTS.md 与 `docs/AI-DEV-LESSONS.md` 的开发经验？
4. S1 因缺项「先回报不派单」是否恰当？三项原边界（bundle 特征核验不升级、未做浏览器复测、逐字节未锁定）登记是否到位？
