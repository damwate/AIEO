# 步骤清单：b-20261116-gpt02-arch-review-leg

## S1 设计（PASS）

- ①本步骤目标：完成公共件复用方案裁定与编排结构设计。设计输入：charter v0.3（§3 架构边界/§4 状态流程/A-1 端点表/A-2 契约与简报/A-3 恢复矩阵）+review_leg.py 结构（1301 行：EngineM1Client/ReviewLedger/derive_recoll_driver/ReviewLeg 编排/setup_agents/main）。
- ②修改文件：无（设计步，产出落 acceptance/design-notes.md）。③修改内容：公共件抽取裁定（charter §3 决策点）：**最小参数化复用（方案 C+）**——EngineM1Client 白名单/事件白名单参数化（默认值=GPT-03 附录 B 常量，现行为零变化），ReviewLedger/derive_recoll_driver/utc_now_iso 直接 import 复用；arch_review_leg 自持 A0-A5 编排；review_leg.py 全文件唯一修改点=该参数化。
- ④执行结果：acceptance/design-notes.md（差异对照表/白名单口径/风险清单）。
- ⑤测试结果：不适用（设计步）。
- ⑥验收证据引用：acceptance/design-notes.md；回归门槛=29 用例（S2 后实测）；验收复核现场 dispatch-2026-11-16T17-25-55/recoll（归属校验型补采七查全过），reply sha256=7aa1f845817ca43725ad35ce6b8d2b2c07f8a6603a71adde46a519069b16632b，验收结论：PASS（G02-R2 统一覆盖本步骤产物，含 S1-S3 与实战整改全链；独立步骤派单验收未单独执行如实登记，验收由 G02-R1/R2 两轮承担）。

## S2 实施（PASS）

- ①本步骤目标：按 S1 裁定实现 GPT-02 腿与参数化。②修改文件：phase1/tools/review_leg.py、phase1/tools/arch_review_leg.py（新增）。③修改内容：review_leg.py EngineM1Client 参数化（check_event staticmethod→实例方法，默认参数=现行为）+arch_review_leg.py 新增（A0 前置核查/A1 简报四组输入+绑定字段+材料 manifest 锚定/A2 派单三态账本/A3 采集+归属校验+绑定注入+Ajv 冻结契约校验/A4 路线 B 登记 artifacts×2+messages ARCH_REVIEW_SUBMITTED/A5 事件推进 PASS→READY、REWORK→REWORK、BLOCKED 仅登记+A-3 九行 resume+attach-reply 人工退路+setup-agents/bootstrap）。
- （红线核对）M1-M4 零修改（未触碰 app/）；scheduler.py 零修改；既有冻结契约零修改（arch-review-report.schema.json 为 Gate3 后新增落位，DEC-087）；1200B 口径（A1 硬限不截断）；敏感信息不入日志（令牌走 gitignored runtime）。
- ④执行结果：arch_review_leg.py（~890 行）+review_leg.py 参数化；实现期修正三处（a1 死代码清理/docstring 转义/attach 现场完整性——人工归档快照随 reply 复制）。
- ⑤测试结果：见 S3（合跑 50/50）。
- ⑥验收证据引用：phase1/tools/arch_review_leg.py；phase1/tools/review_leg.py（diff=参数化段）；验收复核现场 dispatch-2026-11-16T17-25-55/recoll（归属校验型补采七查全过），reply sha256=7aa1f845817ca43725ad35ce6b8d2b2c07f8a6603a71adde46a519069b16632b，验收结论：PASS（G02-R2 统一覆盖本步骤产物，含 S1-S3 与实战整改全链；独立步骤派单验收未单独执行如实登记，验收由 G02-R1/R2 两轮承担）。

## S3 测试与实战（PASS——测试矩阵+零 mock 实战全链）

- ①本步骤目标：测试矩阵+零 mock 实战全链。②修改文件：phase1/tools/test_arch_review_leg.py（新增）、phase1/tools/test_review_leg.py（适配）。③修改内容：测试矩阵（A1 正常轮 PASS→READY/A2 REWORK 停等/A3 采集失败恢复+禁重发计数/A4 幂等重放/A5 路线 B 续推+A-3 终态行/A6 attach 三态/A7 BLOCKED 仅登记+白名单越权负例+契约校验负例+简报超限+材料锚定 fail-closed+发送状态不确定 fail-closed+setup 幂等）；test_review_leg.py 29 用例回归（含 test_01 白名单断言适配实例方法调用，语义不变）。
- ②测试过程如实登记：首轮 7 失败→逐项定位修复（attach 绑定链自动组装/材料锚定测试意图修正/超限触发修正/A-3 终态断言口径/BLOCKED 事件契约字段 blocked_reason·blocked_owner·unblock_condition/attach 快照现场复制）→21/21；合跑 50/50（29 回归+21 新增）；首轮回归曾 1 次 fail（test_01 类调用适配期）与 1 次 test_19 PID 复用竞态偶发（复跑全绿，Windows pid 重用非代码缺陷，如实记录）。
- ②b **零 mock 边界事故与整改（2026-11-17 如实登记）：** 首轮/二轮运行期 test_13 夹具 BUG（BLOCKED 事件字段名不符→HTTP 422）使 leg3.resume 未停在 A-3 行 9 而走完整派单链，测试夹具任务（marker=GPT02-R1|a11）**真实发到 chatgpt.com 两次**（现场 dispatch-2026-11-16T16-08-26/16-11-53，新会话 6afb2ab2/6afb2b80；回复均为 BLOCKED——测试 commit 非 GitHub 可读，审查方正确拒绝；无敏感信息；两现场随 5f1d158 入库作为事故证据）。根因=make_leg 无替身路径无防线+夹具事件字段错误。整改：①测试基类 setUp 全局零 mock 守卫（未装替身路径的 gpt_dispatch 调用一律当场断言失败，不再依赖逐用例自觉）②test_13 夹具 BLOCKED 事件契约字段修复 ③守卫加固后 21/21 OK+双矩阵合跑 50/50 OK。
- ④执行结果：双矩阵合跑 OK；零 mock 实战 REWORK 结论四条 P1 缺陷已全修（返工表**问题14**，整改 commit=77318daba69eb9065ccf36f0b02d23f74e7bb005，证明用例 test_17~20）。
- ⑤测试结果：50 用例全绿 exit=0（`python -m unittest test_review_leg test_arch_review_leg`，2026-11-17 实测）。
- ⑥验收证据引用：phase1/tools/test_arch_review_leg.py；acceptance/test-run.txt；零 mock 实战现场 dispatch-2026-11-16T16-32-20（返工表问题14）；验收复核现场 dispatch-2026-11-16T17-25-55/recoll（归属校验型补采七查全过），reply sha256=7aa1f845817ca43725ad35ce6b8d2b2c07f8a6603a71adde46a519069b16632b，验收结论：PASS（G02-R2 统一覆盖本步骤产物，含 S1-S3 与实战整改全链；独立步骤派单验收未单独执行如实登记，验收由 G02-R1/R2 两轮承担）。

## S4 交付（PASS——G02-R2 复核通过，交付闭环）

- ①本步骤目标：交付登记与验收复核闭环。②修改文件：delivery.md、task-brief.md、acceptance/（简报/绑定报告/账本归档）。③修改内容：交付登记+C1 绑定核验 PASS（baseline=5b2cc461f990680c64e00d7c4950b2bdcbf42870→target=77318daba69eb9065ccf36f0b02d23f74e7bb005，acceptance/binding-report.json）+实战账本复制件归档（acceptance/live-ledger.jsonl/live-report.json）。
- ②执行结果：验收复核简报 review-request-g02r1.txt（1179B）派发。**错发事故如实登记：** 零 mock 实战 run 的 --new-session 覆盖了 gpt-reviewer-session.json（16:34:59 指向实战会话 6afb304c）→G02-R1 简报首发误入实战会话（dispatch-2026-11-16T17-03-07，发送成功回复已生成采集 fail-closed，留痕 wrong-session-record.json）→恢复指针后向审查主会话 6afb128e 正式派发（17:06-48 发送双验通过 fallback-turn-3:0:user→采集 fail-closed→recoll_g02r1.mjs 归属校验型补采七查全过 reply 6742B）。机制缺陷登记：gpt_dispatch --new-session 应不覆盖既有审查会话指针（或至少告警）——待办移交派单工具维护。
- ④执行结果：G02-R1 REJECT→R2 整改→**G02-R2 PASS**（reply sha256=7aa1f845817ca43725ad35ce6b8d2b2c07f8a6603a71adde46a519069b16632b，dispatch-2026-11-16T17-25-55/recoll 补采七查全过；三项整改全过+账本核对一致+边界维持；返工表问题15）。⑤测试结果：合跑 58/58 OK（29 回归+29）。⑥验收证据引用：acceptance/review-request-g02r1.txt、acceptance/review-request-g02r2.txt、phase0/logs/dispatch-2026-11-16T17-25-55/recoll/；验收复核现场 dispatch-2026-11-16T17-25-55/recoll（归属校验型补采七查全过），reply sha256=7aa1f845817ca43725ad35ce6b8d2b2c07f8a6603a71adde46a519069b16632b，验收结论：PASS（G02-R2 统一覆盖本步骤产物，含 S1-S3 与实战整改全链；独立步骤派单验收未单独执行如实登记，验收由 G02-R1/R2 两轮承担）。

## 返工记录表（首次 REJECT 时建表；按"同一问题"计数）

| 问题编号 | 轮次来源 | 问题描述 | 整改内容 | 修复 commit | 验证 |
|---|---|---|---|---|---|
| 问题14 | 零 mock 实战（921001/T-P1-001，GPT-02 真实结论 REWORK） | 真实审核四条 P1 缺陷：P1-01 回复归属校验只记录 target_matches_sent_key 未强制比较（不一致不拦截）；P1-02 run_key 无跨进程互斥+_find_dispatch_dir 按 mtime 选最新目录并发串单风险；P1-03 路线 B artifact 登记不可恢复窗口（M1 已建而账本未写时崩溃→恢复重 POST）；P1-04 事件 409 走 _register_step 的 kind 映射缺失（A-3 行 6 原 event_id 续推无法执行） | 四条全修：P1-01 归属强制断言（双键均存在不等即 fail-closed，test_17）；P1-02 OS 级字节锁 RunKeyLock（Windows msvcrt.locking/POSIX fcntl.flock，进程死自动释放，不用 os.kill(pid,0)——Windows 上等于 TerminateProcess 会误杀；run/resume/attach 三入口全包裹，test_18）+派单现场精确关联定位（request.txt 与本次简报字节一致，现场权威字节=磁盘 brief.txt 原始内容防换行翻译错位，test_11 替身补齐 request.txt）；P1-03 artifact 409 特化（服务端 path+SHA 冲突+GET 回核 task/sha 匹配→恢复 ID；不依赖账本指纹——崩溃窗口正是对象；M1 实测同 path+SHA=201 duplicate 原语义自然恢复，409 语义为真冲突 fail-closed，test_19 两分支）；P1-04 事件独立核验（提交前 A5_EVENT_INTENT 落账本，409 双证=账本 intent 指纹+响应指认或 M1 终态已达；M1 实测重放=200 幂等响应，409 为防御层，test_20 单条记录断言） | 整改 commit=77318daba69eb9065ccf36f0b02d23f74e7bb005 | 双矩阵合跑 54/54 OK；G02-R1 复核确认 P1-03 代码通过、余三项部分通过→续办转问题15 |
| 问题15 | G02-R1 限定复核 REJECT（reply sha256=1aa4f4537da93c22da251c4e02e57b6f2ec24324350e3df88696da77843fbc953 完整值见 recoll-result.json，现场 dispatch-2026-11-16T17-06-48/recoll 归属校验型补采七查全过） | 三项：①P1-1 归属校验空值绕过（located_key="" 空串为假跳过比较仍可登记）②P1-2 A-3 崩溃窗口（A4_MESSAGE 已落账本、A4_RESULT_RECORDED 未写时 resume fail-closed 无法自动续推）③测试强度不足（test_18 非真跨进程、test_20 未进 409 分支、test_17 缺空值负例）+真实 M1 账本可核验引用未给出 | R2 全修：①发送锚点存在时 located_key 必须非空字符串且严格 ==（None/空串/非字符串/不一致全 fail-closed；空串经 or 链归一 None 萰 lacks 分支拦截，test_17b 三形态）②_recover_result_from_evidence 多重证据链恢复（A3_CONTRACT_VALID+report.json brief 绑定+M1 artifact 读回，全一致才补账本续推，test_21 崩溃注入）③test_18b 真跨进程竞争（独立子进程持锁/主进程拒绝/子进程死 OS 释放后取得）+test_20b 409 分支实测（响应指认→核验通过；不指认+终态不符→fail-closed）+test_17b 空值负例；账本引用=acceptance/live-ledger.jsonl（sha256=7190e52dd4dd4cb88a4c40996470f9fbe3bfb3c2363848b3fe2902747a30c703）+live-report.json（sha256=c953152c41a3b9278ba7274418f3b616c342b9f5d07db1036023690950571703）随 56c7575 入库 | R2 整改 commit=9996a992508d67132bab428d0ffe90ecbae58cc8 | 双矩阵合跑 58/58 OK（29 回归+29 GPT-02），test-run.txt 落盘；G02-R2 复核 PASS |

### 实战记录（零 mock 全链，2026-11-17）

- **现场：** 真实 M1 实例 127.0.0.1:8001（独立 DB runtime/arch-leg-20261117/，秘密 gitignored）；真实任务 T-P1-001（PRJ-GPT02LEG/BATCH-001，OWNER bootstrap PLAN→ARCH_REVIEW）；真实派单 dispatch-2026-11-16T16-32-20（简报 918B≤1200，材料锚定 d0eb87ecb1d00f190d9d2129ae78db250837b35c=GitHub 已推送，会话 6afb304c-37d8-83ee-8d7f-09a1471c7547，回复 4633B）。
- **全链：** A0 前置核查 PASS→A1 简报（绑定字段入账本）→A2 真实派单发送双验→A3 真实采集+契约校验 **fail-closed 真拦截**（审查回复 findings=结构化对象 vs 冻结契约 items=string，格式错位；raw 保留不登记）→A6 人工退路（内容保真规整 loss=NONE→attach→artifacts×2+message 登记）→A5 REWORK→REWORK 推进；**M1 最终状态=REWORK**；账本 14 条、报告 report.json（brief_sha256=a74fb9b2…、manifest=116a39bb…）。
- **实战价值实证：** GPT-02 真实审核发现四条 P1 实质缺陷（见返工表问题14）——架构审核腿真实拦截架构风险的功能验证成立；契约校验负例与人工退路（A6）均以真实现场验证。
- **遗留登记：** ①契约演进待办=arch-review-report findings 由 string[] 演进为结构化对象（Gate2 定稿与角色规范真实输出错位；本轮以人工规整保真过渡，正式演进须走契约版本流程 H2）②审核会话 6afb304c 为实战单轮会话（非审查主会话）。
