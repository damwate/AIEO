# AIEO 审查协议（GPT 独立审查会话）

**版本：** v0.1（草稿）
**日期：** 2026-11-12
**状态：** 待 Phase 1 开工会议评审定稿；核心条款（★）已在 Phase 0 与 GPT 讨论定稿
**依据：** `phase0/reports/phase0-closeout.md` §2 第 2/4/5/6/7 条（★）、`phase0/logs/dispatch-2026-11-11T20-45-33/reply.txt` 建议 5/10/11、`docs/立项/03-任务消息与报告协议.md` §7/§8/§10、`docs/立项/04-任务状态机数据库与Git规范.md` §6

---

## 1. 审查对象与输入纪律（★，GPT 建议 9）

1. **审查直接读 Git，不采信自述**：审查会话依据仓库实际代码与证据文件判断；Agent 的口头/文字结论、开发报告中的数字一律不作为验证结果（03-协议 §6"开发报告中的数字不能替代系统实际采集的证据"）；
2. 审查输入由**主会话**提供：目标 commit SHA + 父 commit SHA + 验收标准 + 证据路径。子 Agent 不直接对接审查会话（agent-contract §6-3）；
3. 每轮审查的派单文本、GPT 原始结论 JSON、截图归档 `logs/dispatch-<时间戳>/`（延续 `phase0/logs/dispatch-*/` 惯例）。

## 2. 审查启动简报模板（★，GPT 建议 5）

首条简报必须让新会话**不依赖任何旧聊天记录**即可开展独立审查。缺项即退回主会话补齐：

```markdown
# 审查启动简报：<审查对象名称（如 R11 / Phase1 集成验收）>

## 1. 你的角色
独立审查者；直接读取 Git 与证据文件；输出三态结论；不受被审查方自述影响。

## 2. 仓库与分支
- 仓库：<remote URL>
- 分支：<分支名>

## 3. 审查对象
- 目标 commit SHA：<40 位完整 SHA>
- 父 commit SHA：<40 位完整 SHA>（目标必须基于此父 commit，不符即 BLOCKED）

## 4. 验收标准
<逐条可判定条目；来自 06-计划 §2 或任务单验收条款>

## 5. 允许修改范围
<本 commit 应只改动哪些目录/文件；Diff 超出范围即 REWORK>

## 6. 必查文件与证据
<代码文件清单 + 证据文件路径（测试日志、报告、JSON）；逐项列出>

## 7. 测试环境
<OS / Node / Python / Git / Chrome 版本；代理约束；复现测试所需命令>

## 8. 历史遗留风险
<此前轮次未闭合的问题、已知 MINOR、声明过的未验证事项>

## 9. 判定规则
<本文件 §3 的三态定义 + 本轮特殊规则；输出 JSON 结构>
```

## 3. 结论三态（★，GPT 建议 10）

| 结论 | 含义 | 要求 |
|---|---|---|
| `PASS` | 验收标准全部满足，证据充分 | findings 可为空；发现的 MINOR 不阻断但必须逐条列出并复验 |
| `REWORK` | 发现代码缺陷，必须修复后重新审查 | findings 必填：severity（MAJOR/MINOR）、file、line、category、description、impact、recommendation（结构沿用 03-协议 §7）；每个 finding 指向具体文件行 |
| `BLOCKED` | **证据不足无法核实，或环境/依赖阻塞** | 说明缺失的证据或阻塞原因；**证据不足时判 BLOCKED 而不是 PASS**——不误判通过（★ closeout §2.5） |

判定规则：
1. 任一 MAJOR finding → REWORK；
2. 无法核验任一验收条目（证据缺失、日志与 commit 不符、父 commit 不符）→ BLOCKED；
3. 测试验收区分五态（03-协议 §8）：`EXECUTED_PASS` / `EXECUTED_FAIL` / `NOT_EXECUTED` / `CLAIMED_ONLY` / `BLOCKED`——`CLAIMED_ONLY` 视为未验收，不得据此给 PASS；
4. 输出必须为机器可解析 JSON（沿用 03-协议 §7 结构 + `result` 字段），同时归档原始回复到 `logs/dispatch-<时间戳>/reply.txt`。

## 4. 测试结果绑定 commit SHA（★，GPT 建议 11）

1. 每份测试原始日志**必须在日志内容中注明被测 commit 的完整 SHA**；
2. 不得用其他 commit 的成功日志证明当前 commit 通过；
3. commit 变更 → 原审查结论失效，必须重新审查（03-协议 §10、04-规范 §6 规则 8）；REWORK 产生的新 commit 走新一轮简报（目标 SHA = 新 commit，父 SHA = 上一被审 commit）；
4. 审查报告绑定：Task ID、Task Package Hash、Base Commit、Reviewed Commit、工程规范版本（03-协议 §10）。

## 5. 审查会话轮换（★，closeout §2.2；GPT 风险 1 / 建议 1-3）

### 5.1 触发条件（按优先级，消息数不作硬依据）

| 优先级 | 触发条件 | 说明 |
|---|---|---|
| 1（强制） | 阶段边界 | Phase 1 开工即新建审查会话（GPT 建议 1、会务定稿 summary） |
| 2 | 上下文容量/完整性风险 | 使用率约 70-80%、出现压缩迹象、关键约束重复丢失、任务切换导致上下文污染 |
| 3 | 任务边界 | 一个审查对象完结、下一个未开始 |
| 4（仅提醒） | 消息数量 | 不反映上下文负载，仅作提醒阈值，不作硬依据 |
| 5（辅助信号） | 响应延迟 | 延迟异常可能意味着已发生上下文压缩，此时轮换刻不容缓 |

轮换在**任务可暂停、有明确交接点**时执行，不在关键操作进行中执行。

### 5.2 轮换与《会话交接包》联动（★，GPT 建议 3）

轮换前必须生成《会话交接包》（按 `handoff-template.md`）并提交仓库；新会话核对仓库实际状态后，以交接包 + 第 1 轮《审查启动简报》为起点。

### 5.3 轮换操作

**触发硬条件：页面出现“上下文窗口已达上限”，或当前会话长期无有效反馈时，不在旧会话重试。** 不使用“带摘要继承”作为默认迁移方式：长会话继承可能把上下文负担带入新会话。默认执行：

1. 生成并提交《会话交接包》（可用 `handoff/REVIEWER-BOOTSTRAP.md` 模板）；
2. 开启**全新空白会话**，首条消息自包含：仓库、分支、目标 commit、交接文档路径、任务、验收标准、输出 JSON 格式；
3. 新会话建立后，将新的会话 URL 与配置更新到 `phase0/logs/gpt-reviewer-session.json`（沿用现有 JSON 结构：conversation_url / captured_at / role）。

```bash
node phase0/tools/gpt_dispatch.mjs --new-session --message-file <审查启动简报文件>
```

- 网页 `insertText` 出站单条 ≤1200 UTF-8 字节；长材料走 GitPointer，不反复粘贴长文本（详见 `platform-contract-v1.0.md` §2.6）；
- 入站 DOM 回复不受 1200 字节限制，必须完整提取并保存 artifact/hash；读取失败或证据不全返回 BLOCKED，不宣称已审查；
- 若当前会话已经返回有效结果，可直接使用该结果，不为轮换而轮换；失效或再次达上限时立即按本节约换，不反复死磕同一路径。

### 5.4 当前审查会话（截至 2026-11-12，事实）

- Phase 0 十一轮审查旧会话 `https://chatgpt.com/c/6af4af83-0718-83e8-be08-e427bfb06b96` 已显示“上下文窗口已达上限”，停止向其继续派发；
- 当前候选会话 `https://chatgpt.com/c/6af52d27-e44c-83ee-95a4-888c1709afcb` 已返回 BLOCKED-1 首轮有效反馈（`phase0/logs/payload-choice-inherited-reply.txt`）；若其失效，按 §5.3 使用 `handoff/REVIEWER-BOOTSTRAP.md` 开启全新会话，不继承摘要。

## 6. 归档要求

| 材料 | 位置 |
|---|---|
| 每轮派单文本 / GPT 原始结论 / 截图 / run.log | `logs/dispatch-<时间戳>/` |
| 返工整改报告 | `phase0/reports/`（Phase 1 沿用该目录或新建 `reports/phase1/`，[开工会议定稿]） |
| 审查辅助材料（代码定位图、Diff 存档） | `phase0/reports/` 惯例，如 `r2-review-map.md` |
| 阶段审查闭环汇总 | 对应阶段收尾文档（如 `phase0-closeout.md` §1 表格格式） |

## 7. Phase 1 集成验收的审查流程

对应 `agent-contract.md` §7：四模块完成 → 冻结候选集成 commit → 跨模块契约测试 + E2E → 修复产生新 commit 并重跑受影响测试 → 独立审查会话针对**最终候选 commit** 验收（简报按本文件 §2，验收标准取 06-计划 §2 七条）→ 结论绑定 commit SHA 归档。
