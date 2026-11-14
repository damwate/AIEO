# AIEO Basic 工作流（初级版规范）

> **版本定位（纪要 §三）：** 日常开发协作的最小可用流程，以人为本驱动，OK 不依赖复杂调度器/状态机。战略依据：DEC-037 纪要"先实用，后完善，Basic MVP 优先"。
> **开工定档（纪要 §五）：** S1→Basic；S2→Basic 或 Standard（按风险定）；S3→Standard；S4/S5→Advanced。选型记录于任务书与交接文档，**全程不换轨**；超能力或风险升级时经用户批准换轨并登记 decision-log。

## 模块一：任务管理（任务接收与登记）

- 入口：用户发出需求（会话消息或任务书）。
- 登记：开工即建 `tasks/<任务ID>/`，保存需求原文（requirement.md）与任务书（task-brief.md，模板见 `templates/`）。
- 任务ID 约定：`b-YYYYMMDD-<短名>`（Basic 前缀，目录名即 ID）。
- 版本选型三要素记入任务书：选定版本、任务等级（S1–S5）、选型理由，批准人=用户。

## 模块二：规划协商（方案讨论与拍板）

- 执行者整理"需求原文 + 自己的理解 + 初步方案与实现步骤"，经派单工具发 ChatGPT 讨论。
- 双向对话至共识（执行者是唯一传递枢纽，负责转发与归纳；单条消息 ≤1200 UTF-8 字节，不盲发）。
- 共识方案交**用户拍板**后固化为步骤清单（steps.md）。未拍板不得动工。
- 30 分钟条款（DEC-040 边界）：仅适用于开工方案拍板——用户 30 分钟未反馈可按 ChatGPT 意见执行；main 合并/生产发布/数据删除等高危豁免（DEC-010 保留）。

## 模块三：开发执行

- 按拍板步骤逐条实现，每步留可核查产物（代码/文档/命令输出）。
- 步骤状态记录在 steps.md：待办 / 进行中 / 完成 / 返工中。
- 高危红线（DEC-010）：main 合并、生产发布、数据删除必须用户拍板。
- 秘密不进 Git（C6）：敏感信息、Cookie、Token、API Key 不入库不入历史。

## 模块四：独立验收

- 每步完成 → 验收请求（模板 `templates/acceptance-request.md`）派单 ChatGPT 独立验收。
- 结论四态如实区分：PASS / REJECT / PARTIAL / BLOCKED；复审环境限制 ≠ 代码缺陷；未验证项不得冒充 PASS。
- 证据归档：派单日志（request.txt / reply.txt 原始字节 + SHA256）入 `phase0/logs/dispatch-<时间戳>/`。

## 模块五：返工管理

- REJECT / PARTIAL → 修复后经同一验收通道重新验收。
- 止损机制（AI-DEV-LESSONS §2）：同一问题第 3 轮不收敛 → 停止返工，开会讨论，由用户决策最终做法（必须是执行者可实现且各方认可的方式）；**不得以增加参会 AI / 会话延长讨论**。

## 模块六：交付管理

- 全部步骤完成 → 整体测试 → Git 提交并推送（推送路径固化：`toolkit/check-push.mjs`）→ 完工总结（delivery.md）。
- 交接文档使用唯一权威模板 `docs/phase1/handoff-template.md`（v0.3，含"任务版本选型"必填字段）。

## 派单工具链（引用不复制，共识选项 A）

- **唯一权威源码：`phase0/tools/gpt_dispatch.mjs`**（含 inbound_dom.mjs 采集器）。本目录只引用，不复制脚本。
- 依赖：node ≥18、playwright（`phase0/tools/node_modules`）、Chrome gpt-poc profile（`runtime/chrome_profiles/gpt-poc`，CDP 9222）、会话锁 `phase0/e2e-poc/session_lock.mjs`。
- 纪律：单条 ≤1200 字节；reply 原始字节 + SHA256 归档；会话 URL 不得写入 shell 命令行（派单守卫拒绝）；Chrome 启停走冻结工具内建流程，临时脚本不得接管浏览器生命周期。
- 环境预检：`node toolkit/check-env.mjs`；推送诊断与执行：`node toolkit/check-push.mjs`。
