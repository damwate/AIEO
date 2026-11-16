# 交付记录：b-20261116-gpt02-arch-review-leg

## 1. 原始需求

用户 Gate3 拍板（DEC-087，2026-11-16"确认原文，批准开工"）确认 charter `docs/phase1/GPT02-ARCH-REVIEW-LEG-CHARTER-DRAFT.md` v0.3 §1 冻结原文：在 GPT-03 审查真实腿最小版（`phase1/tools/review_leg.py`，DEC-058~062）同框架基础上，接入 GPT-02 架构审核真实腿最小版——M1 状态机 ARCH_REVIEW 态任务自动触发一次真实 chatgpt.com 架构审核派单（复用 M2 派单链与 fail-closed 门禁），采集审核回复并经冻结契约校验后登记 M1，审核结论（通过/返工/阻塞）落档并按 M1 既有状态机推进（PASS→READY／REWORK→REWORK）；GPT-04/05、多轮返工重审自动化不在本期。异常按 charter §5 分类处置，人工随时可介入。立项链：DEC-026 路线→charter v0.3（Gate1+Gate2 闭环 DEC-067）→Gate3（DEC-087）。

## 2. 最终实现内容

- **`phase1/tools/arch_review_leg.py` 新增（1226 行）：** A0 前置只读核查（ARCH_REVIEW 态+allowed_events+四组输入字段齐备+依赖读取）→A1 简报组装（任务身份/审核范围/依赖信息/审核材料 GitHub 指针+固定 commit 锚定，材料 manifest=blob 清单确定性指纹，≤1200B 硬限不截断）→A2 真实派单（M2 链零修改复用，三态账本，发送/采集失败分类，限一次换会话重派）→A3 采集+归属强制校验（located/sent 键严格相等）+绑定字段注入+Ajv 三重校验（arch-review-report 冻结契约/message-envelope/messages-create 分支）→A4 路线 B 登记（artifacts×2+message ARCH_REVIEW_SUBMITTED 批次级信封，幂等 409 双证/artifact 409 GET 回核）→A5 事件推进（PASS→READY/REWORK→REWORK；BLOCKED 仅登记+腿级停止）+A-3 九行恢复矩阵（含路线 B 崩溃窗口多重证据恢复）+attach-reply 人工退路（同契约同幂等键）+RunKeyLock 跨进程互斥（OS 级字节锁）+setup-agents bootstrap。
- **`review_leg.py` 唯一修改：** EngineM1Client 白名单/事件白名单参数化（默认=附录 B 常量，GPT-03 行为零变化）。
- **`contracts/v1.0/arch-review-report.schema.json` 落位冻结**（Gate3 后，与 Gate2 定稿草案逐字段一致；H2 纪律=新增文件不改既有契约）。
- **ENGINE-02 六端点白名单（charter A-1）：** /reports/review 不入（绑定 CODE_REVIEW）；事件白名单 PASS/REWORK；BLOCKED/GIT_VALIDATE 等调用层禁入。
- **测试矩阵 `test_arch_review_leg.py`（29 用例）：** charter §7 A1~A7 全覆盖+负例（白名单越权/契约失败/简报超限/材料不在锚 commit/INTENT-only/确认缺键/发送状态不确定）+问题14 证明用例（test_17~20）+G02-R1 整改证明（test_17b/18b/20b/21）。

## 3. 修改文件

| 文件 | 变更 | 说明 |
|---|---|---|
| phase1/tools/arch_review_leg.py | 新增 | GPT-02 腿本体 |
| phase1/tools/review_leg.py | 参数化（+14/-7） | 唯一修改点；29 用例回归三次全绿 |
| phase1/tools/test_arch_review_leg.py | 新增 | 29 用例测试矩阵 |
| phase1/tools/test_review_leg.py | 适配（3 行） | test_01 白名单守卫实例方法调用，语义不变 |
| contracts/v1.0/arch-review-report.schema.json | 新增 | 冻结契约（Gate3 后落位） |
| docs/phase1/decision-log.md | 追加 DEC-086/087 | 登记 |
| basic/tasks/b-20261116-gpt02-arch-review-leg/ | 任务包+证据 | 四件套+acceptance（设计记录/测试输出/绑定报告/实战账本/简报/补采驱动） |
| phase0/logs/dispatch-2026-11-16T15-19-59/17-03-07/17-06-48/17-25-55/ | 现场归档 | 验收链现场+补采产物+错发留痕 |
| docs/PHASE-STATUS.md | 未改 | （阶段状态无变化声明；如验收后需更新另行登记） |

## 4. 测试结果

- **双矩阵合跑 58/58 OK，exit=0**（29 GPT-03 回归+29 GPT-02；`python -m unittest test_review_leg test_arch_review_leg`，phase1/tools，2026-11-17 实测；acceptance/test-run.txt 原始输出落盘，含守卫标注）。
- 覆盖映射：charter §7 A1 正常轮/A2 返工/A3 采集 fail-closed/A4 幂等重放/A5 断点恢复（含路线 B 崩溃窗口）/A6 人工退路/A7 BLOCKED 仅登记；负例=白名单越权/契约失败/简报超限/材料锚定/发送状态不确定/事件 409 双证。
- **零 mock 实战（921001/T-P1-001）：** 真实 M1 实例 8001（独立 DB）+真实派单（dispatch-2026-11-16T16-32-20，简报 918B，材料锚定 d0eb87ecb1d00f190d9d2129ae78db250837b35c=GitHub 已推送）→GPT-02 真实结论 **REWORK**（四条 P1 实质缺陷=返工表问题14）→契约校验 fail-closed 真拦截（findings 格式错位，raw 保留）→A6 人工保真规整（loss=NONE）attach 登记→REWORK 推进（M1 终态 REWORK）；账本 14 条归档（acceptance/live-ledger.jsonl sha256=7190e52dd4dd4cb88a4c40996470f9fbe3bfb3c2363848b3fe2902747a30c703、live-report.json sha256=c953152c41a3b9278ba7274418f3b616c342b9f5d07db1036023690950571703）。零 mock 红线达成（真实 chatgpt.com 收发，DEC-028 口径）。

## 5. Git commit（完整 SHA＋父提交）

| 提交 | 父提交 | 内容 |
|---|---|---|
| 0e37ccf020adb4456bf77df3fce58c399f2ab2bd | 5b2cc461f990680c64e00d7c4950b2bdcbf42870 | 开工登记（DEC-086/087+契约落位+四件套） |
| 5f1d1586cb1f915639743620556be8dc08f9c754 | 0e37ccf020adb4456bf77df3fce58c399f2ab2bd | S1-S3（实现+测试矩阵+事故整改） |
| d0eb87ecb1d00f190d9d2129ae78db250837b35c | 5f1d1586cb1f915639743620556be8dc08f9c754 | 零 mock 守卫整改（漏派事故） |
| 7377cec77359a932f62405b579df6219f9fbaaa4 | d0eb87ecb1d00f190d9d2129ae78db250837b35c | 零 mock 实战全链登记 |
| 77318daba69eb9065ccf36f0b02d23f74e7bb005 | 7377cec77359a932f62405b579df6219f9fbaaa4 | 问题14 四条 P1 整改（**被测对象**，C1 绑定核验 PASS） |
| 56c7575c8030b1f8382af0bdb7d1fbd2a86afaba | 77318daba69eb9065ccf36f0b02d23f74e7bb005 | 收尾登记（delivery+绑定报告+账本归档+G02-R1 简报） |
| 9996a992508d67132bab428d0ffe90ecbae58cc8 | 56c7575c8030b1f8382af0bdb7d1fbd2a86afaba | G02-R1 REJECT 三项 R2 整改（**G02-R2 核验对象**） |
| d9c53b7（超限版）/22f8388（定稿） | 9996a99… | G02-R2 简报归档 |

**验收链：** G02-R1 REJECT（reply sha256=1aa4f4537da93c222308e6bd556b9d6bd7785675e9832481ffcf55b0f0ebeecc，dispatch-2026-11-16T17-06-48/recoll 补采七查全过）→R2 整改（9996a99…）→**G02-R2 PASS**（reply sha256=7aa1f845817ca43725ad35ce6b8d2b2c07f8a6603a71adde46a519069b16632b，dispatch-2026-11-16T17-25-55/recoll 补采七查全过；三项整改全过+账本核对一致+边界维持）。**C1 绑定核验 PASS**（baseline=5b2cc461…→target=77318daba69…，acceptance/binding-report.json）。

## 6. 未解决问题

- **契约演进待办：** arch-review-report findings 由 string[] 演进为结构化对象（Gate2 定稿与角色规范真实输出错位；本轮人工保真规整过渡，正式演进须走 H2 契约版本流程）——独立待办。
- **review_leg.py 同类并发锁缺口：** 问题14 P1-02 同族（review_leg 无 run_key 互斥）——登记后续待办，本任务不扩大范围。
- **gpt_dispatch --new-session 会话指针覆盖缺陷：** 实战 run 覆盖 gpt-reviewer-session.json 致 R1 简报误发实战会话一次（已恢复+留痕 wrong-session-record.json；审查方确认不改判三项结论）——移交派单工具维护任务。
- **错发会话 6afb304c 内已生成的回复**未采集（采集 fail-closed 保留现场）——价值有限（上下文错位），如需可另行补采。

## 7. 后续建议

- ①DEC-088 登记（本任务交付闭环）+PHASE-STATUS 下一项=GPT-04/05 逐角色接入立项（DEC-026 路线续行）。
- ②派单工具维护任务：gpt_dispatch --new-session 会话指针覆盖缺陷修复（错发事故根因）。
- ③契约演进（findings 结构化）单独立项走 H2 流程。
- ④M1 实战实例（127.0.0.1:8001，runtime/arch-leg-20261117/）已可关闭；证据已归档。
- ⑤审查会话 6afb128e 已累计 5 条 user 消息（DEC-084 阈值已过）：下一任务开工前主动迁移新会话（简报自包含 ≤1200B）。
- ⑥本任务 PASS≠合并授权（DEC-010）：arch_review_leg.py 等变更已在 main（任务登记流），无合并动作需求；不发布。
