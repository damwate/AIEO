# 任务书：P1-01 派单可靠性原始证据独立审计

- 任务ID：b-20261119-p1-dispatch-evidence-audit
- 日期：2026-11-20
- **版本选型：**
  - 选定版本：Basic
  - 任务等级：S2
  - 选型理由：纯只读审计（零代码、零测试执行、证据核对与结论比对），范围由资格审查 R1 冻结，风险可控→Basic。
  - 批准人/日期：用户指令（2026-11-20"按照你们讨论的建议来"）+ ChatGPT P1HANDOFF-R1 裁定（DEC-116），2026-11-20

## 需求原文（用户原话，不加工）

> 来自codebuddy的交接文档已就绪，看看哪些能处理，然后跟chatgpt讨论，以chatgpt的观点为准我不参与细节讨论，不用我拍板，按照你们讨论的建议来就行

## 执行者理解（与原文分开，便于对账）

- 按 P1HANDOFF-R1 S1~S4 建立 P1-01 独立审计任务包：ChatGPT 以新独立会话对 b-20261117-dispatch-reliability-fix 三项历史验收做只读证据核对（原始证据 ↔ 验收结论一致性），执行者负责建包、派单、采集、登记与收口，不代替审计判断。

## 验收目标（最终要实现什么）

- 五问只读复核逐项有裁定（基于原始证据文件与 SHA 对账，不重跑测试）；审计 reply 归档 `acceptance/`；delivery.md 登记独立审计结论及发现；五件套齐备且逐文件 SHA256 可核；P1-01 验收后释放审查通道（FIFO 让位 P1-02）。

## 审计对象与证据路径（被测 commit `7f7830b80bdaa6a5c48510c74a621319bf32e419` 下读取）

- `basic/tasks/b-20261117-dispatch-reliability-fix/{requirement.md,task-brief.md,steps.md,delivery.md}`
- `basic/tasks/b-20261117-dispatch-reliability-fix/acceptance/`（design-notes.md、local-test-runs/*.log、dispatch-blocked/ 现场、各 request/回执）
- 历史验收 artifact SHA256=`a5d099d62e6881c3d625c3bf1c08454f49fe62c098a0eb9bf25fa18cb036a631`

## 五件套清单（资格审查 R1 冻结）

| # | 交付材料 | 本包落点 |
|---|---|---|
| 1 | requirement.md：原始需求、授权、审计边界 | 已建 |
| 2 | task-brief.md：任务 ID、被测 SHA、审计目标 | 本文件 |
| 3 | steps.md：证据读取顺序、核对标准、停止条件 | 已建 |
| 4 | delivery.md：独立审计结论及发现 | 审计完成后登记 |
| 5 | acceptance/：原始 MANIFEST、run.log、result.json、测试日志、SHA256 对账记录 | 审计派单后归档 |

## 优先级：普通

## 任务状态（随进度更新）

| 字段 | 值 |
|---|---|
| 当前状态 | 完成 |
| 当前步骤 | （无） |
| 最终结果 | 审计完成：五问终版 #1 FAIL/#2 BLOCKED/#3 BLOCKED/#4 PASS/#5 FAIL（R1+R2，F05 撤销）；发现 F01–F04/F06 移交批次复盘；历史 PASS 保持历史属性（reply SHA 0c320048…/b6882d01…） |
