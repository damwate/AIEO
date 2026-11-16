# 交付记录：b-20261117-gpt04-test-acceptance-leg

## 1. 原始需求

用户 2026-11-17 交接指令：按 DEC-026 路线推进 GPT-04（真实测试证据检查腿）/GPT-05（批次审计腿）逐角色立项；先按 L-018 第 6 条把审查会话主动迁移；立项模式照 GPT-02 先例（charter 草案→Gate1/Gate2 复审→开工授权）；并明示"接下来的工作如遇到问题你与chatgpt讨论，以chatgpt的意见为准，不用我拍板"（授权机制，DEC-089 登记；DEC-010 红线仍须用户本人）。charter `docs/phase1/GPT04-TEST-ACCEPTANCE-LEG-CHARTER-DRAFT.md` v0.3 §1 冻结原文见 requirement.md；生效链：Gate1 PASS_WITH_CONSTRAINTS（reply sha256=fc9ffcbe…4076c）→G1-01/02/03 整改→Gate2 PASS_WITH_CONSTRAINTS+开工授权生效（reply sha256=763cf463…1da9f，五项终裁，DEC-090）。GPT-05 立项经 Gate2 裁定顺延至本任务形成可验收闭环后。

## 2. 最终实现内容

- **`phase1/tools/test_acceptance_leg.py` 新增（~1130 行）：** A0 前置只读核查（TEST_ACCEPTANCE 态+allowed_events+acceptance_criteria+latest_execution 漂移停止（D3）+F-003 证据事实读入（GET artifact→本地 sha 回核→解析 execution_result/commit_sha/execution_id 三绑定））→A1 简报组装（四组输入+绑定字段+≤1200B 硬限不截断）→A2 真实派单（M2 链零修改复用，三态账本，现场字节精确关联）→A3 采集+归属强制校验（严格相等）+Ajv 三重校验（test-acceptance-review 冻结契约/TEST_ACCEPTANCE_SUBMITTED 任务级信封）+**15 组合矩阵 fail-closed（G2-01/02）**+G2-04 复述一致性拦截→A4 结论登记（artifacts×2+messages 任务级信封+**POST /api/v1/reports/test 原生登记端点内原子推进**；duplicate 409 RES-0003 先 GET /api/v1/reports?type=test&task_id= 五字段核实，禁盲重试；BLOCKED 结论一律 artifacts+messages 留证不调端点（D5））→A5 终态核对（原子异常=A-3 行9 fail-closed）+A-3 定稿 12 行 resume（_recover_result_from_m1 GET 查询权威恢复）+attach-reply 人工退路+RunKeyLock 跨进程互斥（Gate2 特别要求）+setup-agents（GPT-04/ENGINE-03 bootstrap）+mtime 2 秒容差派单现场定位（问题16 P1-1 整改）。
- **`contracts/v1.0/test-acceptance-review.schema.json` 落位冻结**（新增文件，H2 纪律；execution_result_observed=交叉核对字段，权威值由 F-003 证据决定）。
- **测试矩阵 `test_test_acceptance_leg.py`（31 用例）：** charter §7 A1~A7 全覆盖+负例（白名单越权 7 端点+排除清单/契约失败/简报超限/材料锚定/矩阵禁止组合×3/G2-04 复述不一致/duplicate 409 双分支/原子异常行9/崩溃窗口 GET 恢复/发送意图无确认/归属冲突账本注入/RunKeyLock/setup 幂等/mtime 容差确定性回归 test_31）。

## 3. 修改文件

| 文件 | 变更 | 说明 |
|---|---|---|
| phase1/tools/test_acceptance_leg.py | 新增 | GPT-04 腿本体 |
| contracts/v1.0/test-acceptance-review.schema.json | 新增 | 冻结契约 |
| phase1/tools/test_test_acceptance_leg.py | 新增 | 31 用例测试矩阵 |
| phase1/tools/test_review_leg.py | 测试基建适配（+8/-2） | make_dispatch_double 目录名全局唯一序号（同秒跨实例碰撞互覆缺陷修复；GPT-02 测试适配先例） |
| review_leg.py / arch_review_leg.py / scheduler.py / app/ | **零修改** | D2 同构复制边界；两腿既有行为零变化 |
| docs/phase1/GPT04-TEST-ACCEPTANCE-LEG-CHARTER-DRAFT.md + decision-log.md（DEC-089/090） | 新增/追加 | 立项链 |
| basic/tasks/b-20261117-gpt04-test-acceptance-leg/ | 任务包+证据 | 四件套+acceptance（design-notes/test-run×2/verify×5/探针日志/live-run 全证据） |
| phase0/logs/dispatch-2026-11-16T17-46-33 / 17-55-13(recoll) / 18-02-49(recoll) | 现场归档 | 迁移现场+Gate1/Gate2 派单与补采 |
| phase0/tools/brief_gpt0405_migrate.txt 等 | 新增 | 迁移/Gate 简报+recoll 驱动 |

## 4. 测试结果

- **三腿合跑 89/89 OK，exit=0**（31 GPT-04+29 GPT-03+29 GPT-02；`python -m unittest test_review_leg test_arch_review_leg test_test_acceptance_leg`）；整改后独立验证批次 verify-1~5.log 五轮全 88/88 OK 归档（test_31 加入前），本腿 31/31 OK。
- 覆盖映射：charter §7 A1 正常轮（EXECUTED_PASS+PASS→ACCEPTED 含 ACCEPTED 证据门）/A2 REWORK（EXECUTED_FAIL+REWORK 与 EXECUTED_PASS+REWORK 两形态）/A3 采集 fail-closed 禁重发+人工 attach 恢复/A4 duplicate 409 双分支/A5 崩溃窗口 GET 五字段恢复/行8 原键重试/A6 attach 双形态/A7 BLOCKED 留证+行12 拒触。
- **零 mock 实战全链（T-P1-001/EXEC-001@5a27f47，2026-11-17）：** 真实 M1 实例 127.0.0.1:8002（独立 DB runtime/test-leg-20261117/，秘密 gitignored）+F-003 真实执行（test_worker 对 5a27f47 worktree 跑 30 用例，EXECUTED_PASS，三件套+双 SHA，证据 artifact ART-TEST-001~004 登记）→真实派单 dispatch-2026-11-16T20-11-44（简报发送双验通过，真实 GPT-04 新会话 6afb63b2-eba8-83ec-8ba9-31e20a46e165，reply 2588B）→A3 冻结契约校验 **fail-closed 真拦截**（真实回复 findings=结构化对象 vs 契约 string[]，raw 保留）→A6 人工保真规整（loss=NONE，逐字段映射审计 normalization-audit.json）→attach 经 POST /reports/test 登记→**M1 终态 REWORK**（合法推进）；账本 16 条归档（acceptance/live-run/ledger.jsonl sha256=274fa0079fe6e770e24fa8d5cdbbffa9b52c11387afec54797f8c945d8b7a882）。**真实 GPT-04 结论=REWORK 三条指认（P1-1 mtime 容差申报未落实代码/P1-2 零 mock 当时未完成/P2-1 十轮声明缺档案）经对账全部属实**——测试验收腿"真实拦截验收风险"功能验证成立；问题16 整改 commit=19f7eea8e7bb3c5f6cf692cbe9fd72bd8f1ec2e0（31/31+89/89 实测）。零 mock 红线达成（真实 chatgpt.com 收发，DEC-028 口径）。

## 5. Git commit（完整 SHA＋父提交）

| 提交 | 内容 |
|---|---|
| da17717fb35233c597d90f3c945e98703f02d3e2 | 会话迁移（DEC-089）+charter v0.1+授权机制登记 |
| bd899e1ff477eecccff75f4695fa1197c54f1ecf | Gate1 三约束整改 charter v0.2+Gate1 现场/补采归档 |
| 461ce5a14e13376bd0a4def37415d7fb88b4e0e6 | Gate2 终裁落实 charter v0.3+开工授权（DEC-090） |
| beca0970db0b7fea97e0501e5bcc77e737493e46 | 开工登记任务包四件套+ST-05 无 FAIL |
| 162426bbc9498333602493e2df8a2d7411f1d1d6 | S1-S3（腿本体+契约+30 用例+合跑） |
| 5a27f47854e6b10c50088416dba9b2c4da1b8178 | 偶发排查（替身命名唯一序号；①容差误申报未落实代码） |
| 19f7eea8e7bb3c5f6cf692cbe9fd72bd8f1ec2e0 | **问题16 整改（被测对象）**：P1-1 容差真落地+test_31+P2-1 归档+勘误+实战证据 |
| ed9d879c78d410741747bfaf528cca058388cc9a | 问题16 SHA 回填（终态） |

**C1 绑定核验 PASS**（baseline=769fcec1f632db47aeef4dab0532cdd011468d95→target=交付终态 commit，线性链核验 R2/R4 PASS，acceptance/binding-report.json 指向固定 SHA）。**验收链：** 真实 G04 实战 REWORK（会话 6afb63b2，reply 原始 2588B，规整稿 sha256=da7aaccb65744eb3bc6295f1bb413cae296d4b08fb5f68bc0a92e99a352302e4）→问题16 整改（19f7eea8）→**G04-R1 限定复核 PASS_WITH_CONSTRAINTS**（reply sha256=ca89d0cf8f22ecc9…，dispatch-2026-11-16T20-26-14/recoll 七查全过；核心实现+问题16 三项整改全过；四项交付补齐整改 G04-R1-01~04 全落实：89/89 真跑归档 test-run-combined-89.txt/delivery 完整回填/steps 收口/绑定报告指向固定 SHA）→**G04-R2 限定复核 PASS_WITH_CONSTRAINTS**（dispatch-2026-11-16T20-38-58 一次采集成功；五项核验全 PASS：89/89 日志与 test_31 一致/delivery 七要素齐备/S3-S4 证据真实/C1 绑定 10 commits 线性链/问题16 整改不变）→G04-R3 极窄复核确认本收口 commit（R2 结论回填+COMPLETED 登记）。**任务最终状态=COMPLETED，最终结果=PASS**（以 R3 极窄复核确认收口 commit 为准；G02 先例同构）。

## 6. 未解决问题

- **契约演进待办：** test-acceptance-review findings 由 string[] 演进为结构化对象（Gate2 定稿与角色真实输出错位，与 DEC-088 遗留①同族；本轮人工保真规整过渡，正式演进须走 H2 契约版本流程）——独立待办。
- **review_leg.py/arch_review_leg.py 同型 mtime 严格过滤隐患：** 两腿实战未触发；修复属已 PASS 腿代码超出本任务授权边界——移交待办（与 DEC-088 遗留②并发锁缺口同族）。
- **gpt_dispatch --new-session 会话指针覆盖缺陷：** 本实战再次复现（实战派单覆盖 gpt-reviewer-session.json→已从备份恢复 6afb41ae；实战前已备份 pre-live）——移交派单工具维护任务（DEC-088 遗留③）。
- **契约-实现 duplicate 描述不一致（G1-02 遗留）：** reports-test.schema.json description 与 reports.py 实际行为不符——本任务不改冻结契约，恢复设计以实际代码为准；另走契约演进流程。
- **实战 M1 实例（127.0.0.1:8002，runtime/test-leg-20261117/）仍在运行**：证据已归档，实例可关闭。

## 7. 后续建议

- ①G04-R 验收复核（本任务 S4，派单至审查会话 6afb41ae）通过后：GPT-05 立项启动（Gate2 裁定顺延条件达成；charter 草案→Gate1/Gate2 同模式）。
- ②契约演进（findings 结构化，GPT-02/04 两契约同族）单独立项走 H2 流程。
- ③派单工具维护：--new-session 会话指针覆盖缺陷修复（两次实战复现，备份-恢复流程已固化为本任务纪律）。
- ④review_leg/arch_review_leg mtime 同型隐患+并发锁缺口（DEC-088 遗留②）合并移交派单/腿维护任务。
- ⑤本任务 PASS≠合并授权（DEC-010）：全部变更已在 main（任务登记流），无合并动作需求；不发布。
- ⑥G04-R2 复核原始回复：phase0/logs/dispatch-2026-11-16T20-38-58/reply.txt（一次采集成功，无补采）。
