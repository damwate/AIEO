# S1 / S3 针对性补证复核（2026-11-24，用户授权各最多一轮）

> 授权范围：本地补证 + S1/S3 各最多一轮针对性补证复核；**保留 seq8/seq9 两轮 REJECT 不改写**，只复核未通过的证据项；两轮发出前按 L-018 核对会话消息数与预算、达阈值先评估迁移；回交附实际裁定、完整 reply SHA256、ST-05 结果；任务继续保持**验收中**。
> 用户已核对 `7dfdc858…` 中两份原始回复 SHA256 与登记一致。

## 1. S3（先走）：一轮针对性补证复核

### 派单与采集（seq10）
| 项 | 值 |
|---|---|
| 队列轮次 | `standard-queue` / seq 10 / `test-acceptance` / round `s3-targeted-r1` |
| 会话 UUID | `6b050b37-40b8-83ec-9365-8a0ca627b757`（沿用 test-acceptance 会话，无 NEW-SESSION） |
| 简报 marker | `[AIEO-ROUND:ab597a5a8c5e48037393eaf2]`；简报 739 字节（<1200B） |
| 失败派单目录 | `phase0/logs/dispatch-2026-11-24T08-37-23`（SEND_CONFIRMED，`user_unit_key=fallback-turn-0:0:user`） |
| 采集 | `INBOUND_WINDOW_COMPLETENESS_UNPROVEN` fail-closed（滚动中物化 unit 集合变化） |
| 诊断 | `diag_s3_targeted_r1.mjs` → `virtualization_inferred=true`（静态 DOM 路径适用） |
| 补采 | `recoll_s3_targeted_r1.mjs`，按 L-018 三参数全换核对（CONV_UUID + SENT_USER_UNIT_KEY + FAILED_DIR）+ 归属校验三件套（标记唯一 1 + 最后 user 断言 + 前轮 reply SHA 排除集） |
| 归属 | `marked_user_unit_key=c31ac34c-7286-5eb3-9526-d349e593ed27:0:user`；**七查全过** |
| **零重发** | 发送确认后禁重发→只读补采→`reconcile 10 --recoll` → **COMPLETED**（账本 seq10 state=COMPLETED） |
| 诊断/补采脚本 | `phase0/tools/diag_s3_targeted_r1.mjs`、`recoll_s3_targeted_r1.mjs`；现场归档 `acceptance/s3-targeted-r1-accept/` |

### 实际裁定（REJECT，证据不足型）
- **完整 reply SHA256**：`d33fd97f008c85710dd17df0007a0163d1f4e22ddc80cd1f7401dbf7deaac7ed`（6901 字节）
- 原始回复：`acceptance/s3-targeted-r1-accept/reply.txt`
- 只复核上轮未通过的 ①④⑤⑥，不重开已通过代码项：
  - ① 目标完成：**REJECT**（声称新增的 UTF-8 副本 / collect-only 清单在指定提交读不到）
  - ④ 证据质量：**REJECT**（UTF-8 副本、源 SHA256 对照、GDC/AIS 文件清单未形成完整可核查链）
  - ⑤ 测试真实执行：**PASS_WITH_CONSTRAINTS**（三份原始日志可读，含命令/SHA/时间/结果；GDC 145/2、AIS 78、队列 12 均有日志支持）
  - ⑥ 证据可核查：**PASS_WITH_CONSTRAINTS**（正式派单回复 SHA、被测代码 SHA、AIEO 归档 SHA 关系已记录；但补充文件路径与清单缺失）
- 审查方明确认可：GDC `90ce2233…`、AIS `a1f55b52…`、AIEO 复验归档 `4d184e8…`、补证归档 `7dfdc858…` 四个 SHA 绑定；AIEO SHA 对账 **PASS**（`c63fe3c…`→`4d184e8…`→`7dfdc858…` 用途区分合理）；⑤ 测试执行真实性本轮认可。
- **REJECT 根因（物理）**：审查方从**远端 GitHub 提交树**读取（按 Git Blob SHA 核对），本轮简报指定的「补证归档 `7dfdc858…`」树中**不含** `acceptance/s3-supplement/`（该目录返回 404），且原始日志是 UTF-16LE/NUL 交错、命令头仍是 `<10 target files>` / `<4 target files>` 占位符。我方本轮补证文件落在**本地未推送**提交 `df4383a`，审查方无法从远端读取。这是「证据不足」，非代码缺陷。
- 审查方给出的**唯一最小补证动作**：把三份 UTF-8 日志副本、原始日志 SHA256 对照表、GDC 10 文件 / AIS 4 文件 collect-only 清单确实提交到 `acceptance/s3-supplement/`，**给出新提交完整 SHA**；无需重跑 145/2、78、12，无需重审代码。

### 本地补证（已做，授权内）
`acceptance/s3-supplement/`：
- `gdc-90ce2233-r3.utf8.log` / `ais-a1f55b52-r3.utf8.log` / `aieo-queue-4d184e8-r3.utf8.log`：三份原始日志的 UTF-8（无 BOM）副本，正文逐字重编码、头部含 `Source` 路径与 `Source SHA256` 来源标注、CMD 行以实际文件清单补齐占位符；**原件保留**在 `acceptance/test-logs/` 未改。
- `SHA256-CONTRAST.md`：原始日志 → UTF-8 副本 SHA256 对照表（并注明 Git Blob SHA ≠ 内容 SHA256，口径不混用）。
- `COLLECT-ONLY-MANIFEST.md`：GDC 10 文件 / AIS 4 文件清单 + 在被测 SHA 上实测 collect-only 计数（GDC 9 文件 123 + 网关 24 = 147 = 145 passed/2 skipped；AIS 4 文件 = 78），清单来自 `CODEX-HANDOFF.md` 与 `codex-r3-remediation.md` 交叉核对。
- 文件清单补齐依据真实执行记录，**未重跑测试、未访问生产、未调用真实供应商**。

## 2. S1（补齐再发 → 因缺项改为先回报，不派单）
- 见 `acceptance/s1-supplement/GAP-REPORT.md`。
- 已找到可核查：GDC reflog 重拉记录（c3154aa0 ff-only）、8870 部署产物 `dep-*.js` 四份（在 `7dfdc858…` 树中）、`EVIDENCE.md` bundle 特征核验、操作时间线（steps/delivery/HANDOFF）。
- **确实找不到的具体缺项（先回报）**：
  - G1 c3154aa0 的**重新发布执行记录**（现有 `gdc-*-66ead431.sh` 全属 66ead431 部署，非 c3154aa0 重发）。
  - G2 **用户抽测原始记录**（「还行」仅二手转述，11-23 会话原始日志未保留）。
  - G3 R0' **对应测试执行日志**（`gdc-t1-browser-e2e-20261123.md` 属 66ead431 期 T1 E2E 且场景 2 FAIL，非重发复核日志）。
  - G4 c3154aa0 本地构建 `dist` 产物未归档（对应残留项②逐字节未锁定）。
- 按原边界登记三项：bundle 特征核验（不升级）、未做浏览器复测（保留为未执行）、未锁定逐字节对应（保留）。
- 按用户「若历史记录找不到，先回报具体缺项」+「S1 补齐再发」，**本轮未发起 S1 派单**。

## 3. L-018 会话消息数 / 字节预算核对（发出前）
| 轮次 | 发出前 user 消息数 | 累计字节 | 档位 | 迁移评估 |
|---|---|---|---|---|
| S3（seq10） | 3 | 11238 B (in 2315 / out 8923) | NORMAL | 未达 4 条阈值，不需评估 |
| S3 发出后 | 4 | 11977 B (in 3054 / out 8923) | NORMAL | **已达 4 条阈值**：本次授权仅一轮且已发出、后续无新轮次，记录理由不迁移（迁移反增交接成本、上下文边界明确、证据链可自包含；符合 L-018 第6条例外①②），此后每增 2 条重评 |
| S1 | — | — | — | 未发派单，无新 user 消息 |

> 会话账本 `~/.agents/session-usage/session-usage.db`，uuid=`6b050b37…`，budget_version=1（NORMAL<24KB≤WARN<48KB≤HARD）。两轮均未触发 SESSION_BUDGET_EXCEEDED。

## 4. ST-05 结果
`python -I basic/tool/check_taskpack.py basic/tasks/b-20261123-standard-third-trial`：
- ①需求记录 PASS、②步骤清单 PASS、④REJECT返工记录 PASS、⑤返工次数 PASS、开工核对 PASS、⑥交付记录 N/A（阶段 IN_PROGRESS 未到期）。
- **③步骤验收记录 FAIL**：S1、S3 仍缺「验收结论：PASS」。**如实保留**，不伪造 PASS、不标完成（与两轮 REJECT 及「任务保持验收中」一致）。

## 5. 状态与边界
- seq8 `s1-formal` REJECT（SHA `87b19055…`）、seq9 `s3-formal` REJECT（SHA `81b313df…`）**原样保留**；本文件只登记新增的 seq10 针对性复核。
- 任务保持**验收中**；未合并 main/dev、未生产发布、未付费验收；SQLite 迁移不等于 PostgreSQL 已演练。
- **未 push**：本地补证提交未推送到远端（授权范围仅本地补证 + 两轮派单），因此审查方本轮从远端树读不到 `s3-supplement/`。是否 push 以及是否就「新提交 SHA」再发起一轮复核，需用户另行授权 / 决策。
