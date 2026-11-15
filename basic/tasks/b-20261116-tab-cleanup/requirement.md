# 需求原文：Chrome tab 泄漏清理小任务（b-20261116-tab-cleanup）

- 任务ID：b-20261116-tab-cleanup
- 登记日期：2026-11-16
- 来源：b-20261115-gpt03-review-leg delivery.md「后续建议」①＋runtime/review-leg/pending-issues.jsonl（DEC-060 环境待办）＋用户 2026-11-16 开工指令
- 保管规则：以下原文一字不改存档，不加工；执行者理解单独存放于 task-brief.md

## 需求原文（来源原文，一字不改）

### 一、delivery.md 后续建议①（b-20261115-gpt03-review-leg，2026-11-16）

> ①tab 泄漏小任务立项；

### 二、pending-issues.jsonl（2026-11-15T18:50:33Z，DEC-060 登记）

> 浏览器 Chrome CDP 现存 4 个 chatgpt tab（2 个主页+2 个重复会话页=tab 泄漏，多次派单/补采 newPage 未关闭积累）——后续派单/补采须先做 tab 消歧（page-recovery 语义）。

> tab 泄漏：派单/补采链增加会话结束后的 tab 清理或复用策略（另立小任务）

### 三、用户开工指令（2026-11-16）

> ……然后按 delivery.md「后续建议」处理四项待拍板事项（T-P1-017 REWORK 处置 / Chrome tab 泄漏小任务 / GPT-02/04/05 接入立项 / WORKFLOW+M2 生效），继续按 L-020 稳步推进。

## 需求实质（登记性归纳，非原文）

在 M2 派单/补采工具链上修复 Chrome tab 泄漏：tab 消歧（多 tab 时选对页）+ 清理/复用策略（链路结束后不留积累 tab），不改变派单/采集的语义与 fail-closed 门禁。
