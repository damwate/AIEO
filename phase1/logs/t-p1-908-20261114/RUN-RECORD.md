# T-P1-908 RUN-RECORD — F-001 中央调度引擎最小版（scheduler.py）编排执行记录

- 任务：T-P1-908 / F-001（任务书 docs/phase1/F001-SCHEDULER-BRIEF.md v0.3，DEC-032 定稿）
- 交付物：phase1/tools/scheduler.py（Python stdlib 单文件，~1160 行），分支 **feature/T-P1-908-scheduler**（worktree runtime/t-p1-908/wt-dev）
- 开工授权：DEC-033（2026-11-14 13:35，用户原话"2点30之前你自己拍板"重申，DEC-031 会务代理窗口内）；执行形态照 DEC-028 先例：完成后另行独立验收，不因开工获得合并/发布权限
- **终局结果：ORCHESTRATED_PASS（run ORCH-908019，2026-11-14T08:01:35Z，exit 0）**——task **T-P1-018** 实达 **DEV_REPORTED**（M1 状态机唯一持有），A3 重放 verified
- 本记录归档：feature/T-P1-908-evidence 分支 phase1/logs/t-p1-908-20261114/
- 生成时间：2026-11-14（UTC 计时；本地=UTC+8）

## 1. PASS run（ORCH-908019）十步绑定表

| 步 | CONFIRMED (UTC) | 实体/结果 | 证据 |
|---|---|---|---|
| S0 | 07:57:13 | 锁 locks/run-908019.lock（O_CREAT\|O_EXCL）；PRECHECK 只读全过，零业务副作用 | executions/ORCH-908019/evidence-steps/s0-precheck-* |
| S1 | 07:57:14 | project=AIEO-ORCH-908019 batch=BATCH-019 task=T-P1-018；agents GPT-01/ZCODE-01/GIT-WORKER-01 平台级幂等复用（409→复用先例）；服务令牌仅入 gitignored runtime（C6） | s1-bootstrap-* |
| S2 | 07:59:43 | 出站 886B ≤1200B；派单 dispatch-2026-11-14T07-57-15（回读双验通过，发送双验） | phase0/logs/dispatch-2026-11-14T07-57-15/ |
| S3 | 07:59:43 | 真实 ChatGPT 规划回复解析 plan；reply sha256=1b3a4dcfa93a…（原始字节+SHA 留证） | run-908019/s3-reply-raw.txt |
| S4 | 07:59:44 | Ajv 双校验（envelope+payload 0 errors）；ART-OTH-011 + MSG-20261114-075943（HTTP 202 收件箱受理）；A3 重放：artifact duplicate:true 同 ID、message 409 RES-0003 不新增 | s4-* |
| S5 | 07:59:44 | M1 events DRAFT→READY，task T-P1-018=READY | s5-* |
| S6 | 07:59:46 | M3 MCP 真实 claim（单 MCP 进程跨 S6-S9）；execution=EXEC-010；注入重复 claim → TASK-0003 fail-closed（A4） | s6-* |
| S7 | 07:59:46 / 08:01:31 | START 事件 IN_PROGRESS；开发交接 dev-handoff.json；方案 b：编排会话=真实执行者，四项验收实测（--version 退出0/无参退出2/--help 不变/仅改单文件）后写 dev-done.json(ready:true, run_id=908018→本轮 908019) | s7-*、dev-done.json、dev-handoff.json |
| S8 | 08:01:35 | 仓库 REPO-001（local_path 跨 run 幂等复用）；M4 GitWorker 真实 commit_and_collect：**commit fda9183dafb77ca15578abb244b3b2d15999fafb**（feature/T-P1-908-fixture，base 67c177c4f9c96a13cf21f0d882ae6b59b302a721，diff sha256=d262403c6768…）；m1_registration REGISTERED artifact=ART-DIFF-005；管道测试 node bundle_gate.mjs --version exit 0（156ms，log 留档 log_sha256=98e0fe3b1845…；未注册 ART→报告 log_artifact_id=null 为 schema 明示允许） | s8-m4-invoker-*、s8-m4-evidence.json |
| S9 | 08:01:35 | 开发报告（03-协议 §6 完整结构）accepted → DEVELOPMENT_COMPLETED → **task T-P1-018 status=DEV_REPORTED**（GET 只读核实）；A3 重放 submit → accepted:true + report_registry.duplicate:true 不新增 | s9-progress/submit/submit-replay-a3/report-close |

PASS run 全程 4 分 24 秒（锁获取 07:57:11 → PASS 08:01:35）。console：executions/ORCH-908019-scheduler-console.log。

## 2. 全量 19 run 结果表（908001–908019）

| run | 结果 | 失败步 | 根因（真实失败证据驱动） | 驱动修复 commit |
|---|---|---|---|---|
| 908001 | FAIL | 2 | 派单通道一次性异常"回读不一致，STOP"（Composer 残留草稿污染插入） | 环境清理（manual-takeover） |
| 908002 | FAIL | S1 | 代理 409 RES-0002：agents 平台级非 run 域，重复创建冲突 | b159978 |
| 908003 | FAIL | 2 | "Composer 非空，STOP"（908001 残留草稿） | manual-composer-clean.mjs CDP 清理 |
| 908004 | FAIL | 2 | 出站 URL 带 scheme 触发 Composer 链接化→边界软换行→回读不一致 | 55147dd（+人工 linkify 探测证实） |
| 908005 | FAIL | 3 | ChatGPT UI 以"JSON"标签代码块渲染，无 ``` 围栏，正则不兼容 | 872e9a5 |
| 908006 | FAIL | 4 | Ajv：TASK_PLAN_* task_id 须 const null；CORR-908006-01 不符 CORR-\d{3,} | ad010b6 |
| 908007 | FAIL | 4 | message POST HTTP 202 被误判失败（实际 MSG-20261114-062128 已入库） | cb9b344 |
| 908008 | FAIL | 4 | artifact 409 RES-0002：M1 artifact path 全局唯一，证据登记路径未绑定 run | b474055 |
| 908009 | FAIL | 4 | 同 908008：s4 局部 ev_rel 变量漏改（首修只改了 s3） | 96b324e |
| 908010 | FAIL | 7 | execution_id=None：claim 结果嵌套 task.task.latest_execution.execution_id | 09ad3e8（S7 超时链路同 run 验证：900s 等待→ORCHESTRATED_FAIL，零业务副作用） |
| 908011 | FAIL | 8 | S8 模板渲染 NameError: RUN_ID（生成文件变量误入 f-string 表达式）；同修隐藏转义错 | aba9b74（新增模板渲染冒烟门禁） |
| 908012 | FAIL | 8 | 仓库登记 409：local_path 全局唯一（registry.py:58，908011 跨 run 残留登记） | 96eda32（幂等复用 REPO-001，同 agents 先例） |
| 908013 | FAIL | 8 | invoker AttributeError: csrf（adapter 初始化顺序：call() 登录期读 self.csrf） | a13652e |
| 908014 | FAIL | 8 | M4 INVALID_COMMIT_MESSAGE：_COMMIT_SUBJECT 词表（worker.py:69-72）无 phase1 | 7cab971（feat(contract)，同文件先例 916d8b2） |
| 908015 | FAIL | 8 | M4 evidence unparsable：Windows 管道 cp936 编码 diff 中文注释（0xa3…）；同 run 证 M4 链路真实走通（git 提交 7f36dc9 落地） | 7764a92 |
| 908016 | FAIL | 8 | 同字节复现：-I 隔离模式隐含 -E 忽略 PYTHON* 环境变量 | b5061f3（-X utf8 旗标） |
| 908017 | FAIL | 9 | S9 REQ-0002：开发报告缺 §6 四必填（tests/known_issues/knowledge_updates_required/self_assessment，report_schema.mjs 只读契约）；同 run S8 全链路首通（471ade9/ART-DIFF-003） | a153fd4 |
| 908018 | FAIL | 9 | A3 重放判定误读：bridge 把 duplicate 嵌套 report_registry 下；submit 主体已 accepted、任务实达 DEV_REPORTED（commit 6faa2f0/ART-DIFF-004） | 35c98f9 |
| **908019** | **PASS** | — | — | —（终局 run） |

18 FAIL 全部按五要素留证（run_id/失败步号/最后确认状态/已完成操作含实体 ID/证据指针）：executions/ORCH-*/failure-report.json + evidence-steps/ + console log + 对应 dispatch dir。调度器三态分界遵守：BLOCKED 仅限 S0（全程未触发），其余失败均为 ORCHESTRATED_FAIL。

## 3. 调度器提交链（feature/T-P1-908-scheduler）

5112321 初版 → b159978 → 55147dd → 872e9a5 → ad010b6 → cb9b344 → b474055 → 96b324e → 09ad3e8 → 180a829 → aba9b74 → 96eda32 → a13652e → 7cab971 → 7764a92 → b5061f3 → a153fd4 → **35c98f9**（共 18 提交：1 初版 + 17 个真实失败驱动修复）。每个 commit message 均注明暴露该缺陷的真实 run 与只读契约出处。模板渲染冒烟门禁（自 aba9b74 起）：render → compile 通过方准进入 S8；7cab971 追加 M4 提交信息正则 fullmatch 断言。

## 4. fixture 分支交付与重置链（feature/T-P1-908-fixture）

- 基线：67c177c4f9c96a13cf21f0d882ae6b59b302a721（main HEAD，开工时）。
- 开发内容（方案 b 真实开发）：phase1/tools/bundle_gate.mjs 新增 `--version`（+7 行：输出版本行 bundle_gate version 1.0 与输出记录 bundle_gate_version 元数据一致、退出码 0、不执行核验流程、其余参数行为不变；代码注释 T-P1-010 run ORCH-908011 系开发首次落地时 authored）。
- 中间失败 run 的 M4 提交与重置（§10 跨 run 隔离：每 run 实体全新；S8 后失败的 run 按设计态重置环境后重放同一 patch，patch 本体归档 env-reset-908015-commit.patch）：908015→7f36dc9、908016→9a54728、908017→471ade9、908018→6faa2f0 均已 reset --hard 回基线（分支从未推送，无共享历史改写；各 SHA 及失败上下文如实留档）。
- **终局保留：fda9183dafb77ca15578abb244b3b2d15999fafb（908019 PASS run 的 M4 真实提交）**，worktree 干净。合并 main 留用户拍板（DEC-010）。

## 5. 人工接管检查点记录（brief §1 声明范围内）

| 时间(UTC) | 事项 | 载体 |
|---|---|---|
| 开工前 | M1 新库启动（env.sh + python -m app.platform.main，DB/日志/工件目录均指向 gitignored runtime）；Chrome gpt-poc profile 由派单工具/人工脚本按需拉起——调度器零启动/零停止 M1 与 Chrome | runtime/t-p1-908/env.sh（不提交） |
| ~06:0x | 908003 前清 Composer 残留草稿（CDP Ctrl+A+Delete） | manual-takeover/manual-composer-clean.mjs |
| ~06:07 | 908004 回读不一致诊断：截图+DOM 摘要（只读） | manual-takeover/manual-page-diagnose.mjs、diag-page.png |
| ~06:08 | 链接化根因探测（A/B/C 三段对照，证实 scheme 边界软换行） | manual-takeover/manual-linkify-probe.mjs |

以上均为派单通道人工接管检查点（§1 允许），不触碰 M1/M2/M3/M4 代码，零 mock 不受影响。

## 6. 零 mock 与 C6 边界声明

- 全链路真实：M1 REST（urllib+cookiejar+CSRF）、M3 MCP bridge（真实子进程 JSON-RPC，initialize→claim/report/submit）、M4 GitWorker（真实 git 提交+真实 M1 注册）、ChatGPT 真实网页派单（playwright CDP，双验门禁未放宽）。
- M1/M2/M3/M4 代码零修改（仅只读消费契约；本文所引 app/* 行号均为只读核对）。
- 服务令牌/AIEO_SESSION_SECRET/AIEO_PLATFORM_ADMIN_PASSWORD 仅存 gitignored runtime（C6）；证据树不含任何令牌（见 security-scan.txt）。
- M1 四条 PENDING 消息 ACK 不在本任务范围（任务书 §不在范围清单）。

## 7. 脱敏扫描

security-scan.txt（SEC-SCAN-T-P1-908-001）：范围=本证据目录 + 18 个 dispatch dir（≥T05），disk 全量 walk + git HEAD 树 git grep -a -P；规则 R1 ait_* 令牌 / R2 csrf_token 值 / R3 ADMIN_PASSWORD / R4 SESSION_SECRET / R5 通用 ≥16 字符密钥赋值。结果：**CLEAN（0 RAW 泄漏）**——见 security-scan.txt 原文。

## 8. A1–A8 可验收化对照（任务书 §12/§11）

| # | 判定 | 证据 |
|---|---|---|
| A1 | 调度器单文件 stdlib、十步 S0-S9 可执行 | wt-dev phase1/tools/scheduler.py；908019 console 十步 CONFIRMED |
| A2 | S0 PRECHECK 零业务副作用+锁生命周期 | s0-precheck-*；锁 O_CREAT\|O_EXCL；失败 run 自释放（locks 目录每 run 结束为空） |
| A3 | 幂等重放验证 | S4 artifact duplicate:true/message 409 RES-0003（s4-*）；S9 submit report_registry.duplicate:true（s9-submit-replay-a3） |
| A4 | 注入重复 claim fail-closed | s6-*：TASK-0003 expected |
| A5 | S2 出站 ≤1200B | s2-*：886 bytes (limit 1200) |
| A6 | 真实开发+真实提交 | dev-done.json 四项验收；M4 commit fda9183；ART-DIFF-005 |
| A7 | 终态 DEV_REPORTED 且 M1 唯一持有 | s9-*：GET /api/v1/tasks/T-P1-018 status=DEV_REPORTED |
| A8 | 失败报告五要素+RAW 泄漏阻断 | 18 份 failure-report.json；security-scan.txt CLEAN |

## 9. 移交与遗留

- 合并拍板（DEC-010）留用户：三分支 feature/T-P1-908-{scheduler,fixture,evidence} 已推送，等待独立验收（新空白会话派单，A1-A8 简报 ≤1200B）后由用户决定合并。
- FEASIBILITY-REGISTER v0.3 批注待用户审阅；M1 PENDING 消息 ACK 超范围；M3 CLI 独立驱动开发腿为后续升级目标（DEC-032 ①如实申报）。
- 908011 run-state.json result 字段为 None 的取证瑕疵：该 run 在 S8 模板渲染抛 NameError（未走 OrchestrationError 通道），失败事实由 console+failure-report.json 如实留证；后续版本已由冒烟门禁杜绝该类缺陷。
