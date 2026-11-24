# 任务书：AIEO 标准版第三次试运行（GDC 生图链路三改实施 + 测试报告）

- 任务ID：b-20261123-standard-third-trial
- 日期：2026-11-23
- **版本选型：**
  - 选定版本：Standard
  - 任务等级：S3（对照纪要 §五：S3→Standard；本任务含前端+后端实施、契约影响面需规划协商，高于前两次 S2 纯分析试运行）
  - 选型理由：用户点名"用AIEO标准版处理""作为新的测试"；含真实代码实施（GDC 仓），但为单一任务 M1 交替推进，不启 M2 并行；执行纪律与派单按 codex 分支 `feat/standard-task-management` 的 aieo-standard SKILL.md + PLAYWRIGHT-QUEUE-WORKFLOW.md。
  - 批准人/日期：用户指令（2026-11-23，requirement.md 原话）

## 需求原文

见 requirement.md（不加工）。

## 执行者理解（与原文分开，便于对账）

- 本任务=标准版新测试，交付=GDC 生图链路三改实施 + 试运行测试报告。
- R0 前置：GDC 代码重新拉取核验（dev 缓存线已合并实况）+ 重新发布版本复核（缓存补漏）。
- R1 生图请求参数扩展：推送生图服务的参数=设计稿+提示词+**产品占比清单**（名称/颜色/评分/画面占比，样式同 issue #126 截图），且每个产品带**原图**一并送生图服务处理。此条用户明确"跟gpt仔细讨论后再处理"→ 先 planning 派单讨论，方案经用户确认后实施。
- R2 供应商优先级：生图服务后台已能调整供应商优先级；客户要求**花园计算器链接到生图后台的页面**也能调整顺序。
- R3 任务详情：生图服务后端任务详情当前只有结果，需补显**客户端输入参数**（设计稿/提示词/产品清单等）。
- 目标仓库：D:\Garden-Design-Calculator（GDC）。基线 commit 以开工时 dev HEAD 为准（已核 c3154aa0）。

## 验收目标（拍板时冻结；可观察结果）

- GDC dev 本地与 origin/dev 一致（ff-only 完成，无落后）；缓存线合并事实有 commit 证据。
- 重新发布的花园计算器缓存行为复核记录（证据：截图/日志，缓存命中与未缓存项清单）。
- 生图请求参数含产品占比清单+产品原图：契约/组装点改动 + 测试通过 + 实际请求样本证据（或 mock 证据）。
- 供应商优先级调整在 GDC 链接的后台页面可操作且持久生效：UI+接口证据。
- 任务详情接口/页面展示客户端输入参数：接口响应与页面证据。
- ChatGPT 规划讨论 reply 归档 + SHA256 绑定；测试报告落本包 delivery.md（含标准版新技能体系执行评估）。

## 优先级：高

## 任务状态（随进度更新）

| 字段 | 值 |
|---|---|
| 当前状态 | 验收中 |
| 当前步骤 | S4 验收中：首轮独立验收 MUST-FIX 两项已整改并回交；GDC HEAD=4f162d16、AIS HEAD=afc4d6c（均已推送），证据见 acceptance/mustfix-r2-remediation.md；待独立复验 |
| 最终结果 | R0/R0'闭环；R1/R2/R3本地实现完成；尺寸按文档与用户裁定改为auto，220/221固定尺寸已回滚；R2 修复 AIS 产品清单 422 与 GDC 单图原图槽位。详见 delivery.md 与 R2 整改文件 |

## 步骤清单（规划协商拍板后填写并冻结，未拍板留空不得动工）

1. R0 GDC 代码重新拉取+缓存合并核验：origin/dev 已前进至 c3154aa0（含 PR#127 缓存重试整合、PR#128 3D 参考图缓存修复），本地 dev ff-only 合并完成。
2. R0' 重新发布版本复核：缓存补漏核验（证据落 acceptance/）。
3. S1 登记+开工核对（check_taskpack --startup）。
4. S2 planning 派单：R1 生图参数扩展方案与 GPT 仔细讨论（playwright_queue lane=planning R1，简报≤1200B）。
5. S3 按确认方案实施 R1/R2/R3（GDC 前端+后端），测试同步。
6. S4 验收+证据归档+测试报告（delivery.md）+ decision-log 登记。

## 开工核对

- 已读技能: `.github/skills/aieo-standard/SKILL.md`

（技能取自 feat/standard-task-management 分支 worktree；并读 standard/WORKFLOW.md、standard/PLAYWRIGHT-QUEUE-WORKFLOW.md、basic/templates/task-brief.md）

| 经验 | 本任务防错动作 |
|---|---|
| L-014 | 连接异常第一动作走 check-push/注册表活端口探测；本次实测 .git/config 6822 死、注册表 1080 活，fetch 成功留证 |
| L-017 | 申报引用从最终归档取值并锁定被测 commit 完整 SHA |
| L-018 | 派单禁重发；fail-closed 走三步诊断+静态 DOM 补采；简报标记文本+最后 user+前轮 SHA 归属三件套 |
| L-022 | 派单简报用 Python 字节工具计量 ≤1200 UTF-8 字节，不用 PowerShell 计量 |
| L-019 | 同问题返工近止损线即停整改循环→会商→交用户 |
| L-021 | 申报统计口径与检查项数演进同步，ST-05 自检在派单验收前运行 |
