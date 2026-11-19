# 任务书：P1-02 AISVC 后验变更及合并血缘审计

- 任务ID：b-20261119-p1-aisvc-postpass-lineage-audit
- 日期：2026-11-20
- **版本选型：**
  - 选定版本：Basic
  - 任务等级：S2
  - 选型理由：纯只读审计（commit diff/父子关系/分支血缘核对，零代码、零测试执行），范围由资格审查 R1 冻结，风险可控→Basic。
  - 批准人/日期：用户指令（2026-11-20"按照你们讨论的建议来"）+ ChatGPT P1HANDOFF-R1 裁定（DEC-116），2026-11-20

## 需求原文（用户原话，不加工）

> 来自codebuddy的交接文档已就绪，看看哪些能处理，然后跟chatgpt讨论，以chatgpt的观点为准我不参与细节讨论，不用我拍板，按照你们讨论的建议来就行

## 执行者理解（与原文分开，便于对账）

- 按 P1HANDOFF-R1 S5（P1-01 验收释放通道后）以**又一个全新独立会话**派发跨仓血缘审计：ChatGPT 对 YotinGarden/AI-Image-Service 的 `0c53c963`↔`d50ce915` 做 commit diff、父子关系、合并与分支血缘只读核对；执行者建包、派单、采集、登记、收口，不代替审计判断。

## 验收目标（最终要实现什么）

- 五问只读复核逐项有裁定（commit diff 与合并/分支证据核对，不重跑 pytest）；审计 reply 归档 `acceptance/`；delivery.md 登记独立审计报告；五件套齐备且逐文件 SHA256 可核。

## 审计对象与证据路径

- 被审计仓库 `github.com/YotinGarden/AI-Image-Service`：在 `d50ce915cb047537640a8393e08882e922443d47` 与 `0c53c963d93e33c15ebd4498742828fcf9ffc57d` 两完整 SHA 上做 compare/diff 与父子/分支血缘核对。
- 本仓任务包 `basic/tasks/b-20261119-aisvc-f3-rework/`（acceptance/ 内 R1/R2/R3 原始回复与 JSON、MANIFEST.txt）。
- R3 历史 PASS artifact SHA256=`ddf605d5d6bf4771b480aada4e178e277e89dd3d6568233c50a19a65846655b3`。

## 五件套清单（资格审查 R1 冻结）

| # | 交付材料 | 本包落点 |
|---|---|---|
| 1 | requirement.md：审计来源及授权边界 | 已建 |
| 2 | task-brief.md：两个对照 SHA 和审计问题 | 本文件 |
| 3 | steps.md：commit diff、父子关系、分支血缘核查步骤 | 已建 |
| 4 | delivery.md：独立审计报告 | 审计完成后登记 |
| 5 | acceptance/：MANIFEST、R3 原始回复、JSON、commit diff、合并及分支证据 | 审计派单后归档 |

## 优先级：普通

## 任务状态（随进度更新）

| 字段 | 值 |
|---|---|
| 当前状态 | 阻塞 |
| 当前步骤 | S2 审计派单（阻塞于 FIFO：P1-01 完成验收并释放通道后派发） |
| 最终结果 | （未定） |
