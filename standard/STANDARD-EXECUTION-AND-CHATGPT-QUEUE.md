# AIEO Standard 多任务执行与 ChatGPT 网页队列实现机制

> 归档目的：将第三次 Standard 试运行验证过的执行机制、队列实现与适用规范沉淀为后续开发/测试资产。
> 关联成果：[完整测试报告](../basic/tasks/b-20261123-standard-third-trial/delivery.md) · [Codex 交接](../basic/tasks/b-20261123-standard-third-trial/CODEX-HANDOFF.md)
> 实现以代码为准：`phase0/tools/playwright_queue.py`；本文件说明架构，不替代现行契约。

## 1. 本次验证边界

第三次任务 `b-20261123-standard-third-trial` 含 R0–R3 多项需求及中途变更，但执行形态为 **Standard M1 单任务交替推进**：R2/R3 由实施子代理完成，主会话负责规划派单、复核与 R1，GDC 仓串行释放后实施 R1。

因此本次证明了：
- 多需求登记、暂停恢复、串行依赖和证据闭环；
- ChatGPT 网页队列的发送、归属、补采与裁定闭环；
- 第三方接口文档门禁与本地 Mock 验证。

本次**不证明**完整 M2 并发能力。多任务并行仍需单独验收写冲突、暂停恢复、会话串用、归属错误与并行净收益，不能从本次外推。

## 2. 多任务管理

### 2.1 任务包与依赖门禁

每个任务在 `basic/tasks/<任务ID>/` 保存：
- 原始需求与执行者理解；
- 版本/阶段选择、基线完整 SHA；
- 步骤、改动文件、测试结果与验收证据；
- 当前状态、停点、恢复第一步与最终交付。

上游未验收，下游不动工。共享仓库默认串行；只有仓库、worktree、分支和证据所有权均隔离时才允许并行。子 Agent 交付后，主 Agent 独立复跑测试并核对提交范围，不能仅凭子 Agent 自述验收。

### 2.2 暂停、切换与恢复

暂停时停止分配新步骤，确认子 Agent 停写并保存：
- 分支、worktree、完整 HEAD；
- 未提交与未跟踪文件位置；
- 已完成、待验收步骤；
- 在途派单序号与原轮状态；
- 恢复后的第一步。

恢复先对账检查点、名额和原轮，再继续。新的小任务使用独立任务 ID 与工作区，不能继承旧任务浏览器会话或简报归属。

### 2.3 主会话与子 Agent 分工

主会话接收状态变化、交付结论和阻塞；子 Agent 在任务包保留排查细节。主会话不代替子任务制造“已验证”结论，验收必须绑定真实测试日志、完整 SHA 和可读取 diff。

## 3. ChatGPT 网页队列架构

### 3.1 唯一入口与持久账本

业务 Agent 不直接操作 ChatGPT 页面，统一通过：

```bash
python -I phase0/tools/playwright_queue.py submit \
  --task <任务ID> --lane planning --round <轮次> --brief <文件>
python -I phase0/tools/playwright_queue.py worker
python -I phase0/tools/playwright_queue.py status
```

SQLite 账本位于 `runtime/playwright-queue/queue.sqlite3`，记录：
- task / lane / round / brief；
- QUEUED / RUNNING / BLOCKED / COMPLETED / NOT_SENT；
- 目标会话、发送目录、回复与补采证据。

lane 包括 planning、architecture、code-review、test-acceptance。任务+lane+round 形成唯一轮次；相同提交不会生成第二条不同业务请求。

### 3.2 单 worker 独占浏览器

worker 串行领取轮次，通过 Playwright/CDP 操作独立 Chrome profile。实例由端口注册表、profile 目录和会话锁共同约束，防止：
- 多 Agent 同时写输入框；
- 会话或页面串用；
- 滚动采集相互干扰；
- 重复发送同一业务问题。

worker 负责发送与首次采集，业务 Agent 只读账本与证据。遇到 BLOCKED 时，single-inflight 约束阻止后续轮次越过未决现场。

### 3.3 轮次标记与简报预算

每份简报自动加入：

```text
[AIEO-ROUND:<task+lane+round 的 SHA256 前24位>]
```

简报+标记不得超过 1200 UTF-8 字节，使用 Python 对 UTF-8 原始字节计量，不能依赖 PowerShell 默认编码。

### 3.4 回复归属三件套与七查

回复归属不凭“页面最后一句话”判断，必须同时满足：
1. 标记文本在 **role=user** 单元中唯一定位；
2. 是本轮最后一条 user 消息；
3. 回复 SHA256 排除前轮回复。

完成采集还检查停止按钮消失、尾部为 assistant、assistant UUID 存在且稳定、目标范围物化、重复读取稳定等。assistant 回显 marker 属正常行为，不能计入 user 归属；第三次试运行已修复该跨角色误判并加入 12 项 queue 回归测试。

## 4. fail-closed 与补采

### 4.1 发送结果分类

- **NOT_SENT**：证明未发送，可修正环境后换轮次派遣；
- **SEND_CONFIRMED 但采集失败**：禁止重发，进入只读诊断/补采；
- **归属或完整性不能证明**：BLOCKED，不得伪造 COMPLETED。

### 4.2 L-018 只读补采

补采脚本必须显式核对三参数：
- `CONV_UUID`（换会话必须换）；
- `SENT_USER_UNIT_KEY`（发送回执原值，fallback 键漂移只作参考）；
- `FAILED_DIR`（原 dispatch 目录）。

采集失败可 reload 让会话尾部重新物化；虚拟列表不完整时使用静态 DOM 与视口升级。补采不得发送新消息。

### 4.3 reconcile 闭环

`reconcile <seq> --recoll <目录>` 校验：
- 原发送回执和 dispatch 目录；
- brief 原文一致；
- 报告 user unit key 与定位结果；
- 回复、SHA256、raw units、七查记录。

全部通过才把原轮改为 COMPLETED。不能用一条新消息掩盖原轮采集失败。

## 5. 第三方接口与付费测试门禁

本次新增的 L-023 与 Basic/Standard skill 已形成长期规则：

1. 官方文档必须找到并归档（URL、模型、通道、版本、日期、快照 SHA256）；缺失=UNKNOWN，禁止供应商间继承结论。
2. 用文档校准用户直觉，不机械硬编码早期假设；auto、省略字段和显式参数分别处理。
3. 禁止黑盒探测；HTTP 200、历史响应、输出尺寸均不能替代官方契约或计费证据。
4. 按官方契约 L0 → 配置/最终 Transport Mock L1/L2 → 只读证据 L3 → 用户授权付费验收 L4 分层。
5. 接口初建可经授权做完整业务验收；后续按影响面做有意义的目标测试，不每次做付费全量矩阵。
6. `PARAMETER_ACCEPTED`、`OUTPUT_CONFORMED`、`BILLING_CONFIRMED` 三态独立；失败即停，不自动重试或 failover 再扣费。

## 6. 规范索引

| 规范 | 用途 |
|---|---|
| [AGENTS.md](../AGENTS.md) | 异常第一动作、节点推进、DEC-010 与开工纪律 |
| [Standard WORKFLOW](WORKFLOW.md) | Standard 阶段与任务执行主流程 |
| [多任务实施计划](MULTITASK-IMPLEMENTATION-PLAN.md) | 多任务拆分、依赖与并行门禁 |
| [Playwright Queue Workflow](PLAYWRIGHT-QUEUE-WORKFLOW.md) | 派单、暂停切换、主会话汇报与队列操作 |
| [Basic SKILL](../.github/skills/aieo-basic/SKILL.md) | 单任务执行与第三方接口基本规则 |
| [Standard SKILL](../.github/skills/aieo-standard/SKILL.md) | 多任务、队列、第三方接口与付费测试规则 |
| [AI-DEV-LESSONS](../docs/AI-DEV-LESSONS.md) | L-014 网络、L-017 证据绑定、L-018 补采、L-019 止损、L-021 申报、L-022 字节、L-023 接口/付费 |
| [任务包检查器](../basic/tool/README.md) | 开工核对、ST-01 绑定与 ST-05 步骤验收 |
| [第三次完整报告](../basic/tasks/b-20261123-standard-third-trial/delivery.md) | 实测结果、缺陷、回归对照与未决边界 |
| [Codex 交接](../basic/tasks/b-20261123-standard-third-trial/CODEX-HANDOFF.md) | 业务项目、提交 SHA、验收清单与测试命令 |

## 7. 后续测试重点

1. 真正 M2：两个以上独立任务并行，验证零写冲突、零会话串用、零归属错误与净收益。
2. 暂停恢复：在子 Agent 写码和 ChatGPT 在途两种状态分别演练，确认检查点可恢复且不重复发送。
3. 队列稳定性：减少虚拟列表补采频率，保持 fail-closed，不以降低归属校验换取成功率。
4. 逐文件验收：审查方必须能读取完整 SHA 对应 diff；描述级审查不能冒充代码验收。
5. 业务效果：产品外观、占比和原图参与需经用户授权的完整业务验收，不用孤立参数测试替代。
