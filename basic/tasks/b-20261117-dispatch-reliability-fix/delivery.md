# 交付记录：b-20261117-dispatch-reliability-fix

## 1. 原始需求

用户 2026-11-17 指令："你用AIEO基础版开发吧，这种询问的跟chatgpt讨论，它来拍板，只要大的方案没问题就行，细节你俩解决"。逐字原文见 requirement.md。
生效链：DEC-094 会务拍板（ChatGPT 选 B=先清 #3/#4/#7 再建等级 B 试运行 Gate+残留处置甲；reply 996B SHA-256=`13cc2caa399f680ff1ebf934ce0ff13109051a04a548671f4b98b16ffefff228`，dispatch-2026-11-17T03-13-54/recoll）→规划复审 PASS（"方案通过，按此开工"，reply 1214B SHA-256=`ff2701c9ca48f20327aee868ca5d012bd51ed746564a19b3696efc0f1179a7e8`，dispatch-2026-11-17T04-45-47/recoll）→独立验收三项 PASS（reply 814B SHA-256=`a5d099d62e6881c3d625c3bf1c08454f49fe62c098a0eb9bf25fa18cb036a631`，dispatch-2026-11-17T06-11-17）。
被测基线=ee76a34ac5fb73d7e0fce6369060323c7f7a5016（开工前生产代码树逐字节一致已核，全程未漂移）。

## 2. 最终实现内容

- **#7 mtime 同型隐患 + 并发锁缺口（S2）：** `phase1/tools/review_leg.py` 的 `_find_dispatch_dir` 加 `since-2.0` 时钟负偏容差 + `brief_bytes` 字节归属校验（杜绝 Windows 时钟粒度负偏误杀本轮+并发串单），r3_dispatch 计算 brief_bytes 传入两处现场定位；`arch_review_leg.py` 同加 2.0s 容差（已有 brief_bytes）；`review_leg.py` 同构复制 `RunKeyLock`（contextlib+msvcrt/fcntl OS 级锁，无 stale 接管、不用 os.kill）包裹 run/resume/attach_reply 三入口（拆 _run_inner/_resume_with_lock/_attach_with_lock）。均对齐已 PASS 的 test_acceptance_leg.py:458-484 与 arch_review_leg.py:98-139。
- **#4 `--new-session` 指针覆盖（S3）：** `phase0/tools/dispatch_options.mjs` 新增 `--no-update-pointer` 解析 + 纯函数 `shouldUpdateReviewerPointer()`（默认写、显式 flag 跳过）+ **`sessionIdIsAttributable()` 归属校验**（新会话捕获 UUID 不得等于 attach 时既有 UUID；既有会话派单须等于目标 UUID；非法/缺失 UUID fail-closed）+ `extractSessionId()`；`gpt_dispatch.mjs` 指针写盘前先归属校验，失败抛 `SESSION_ATTRIBUTION_FAIL` 拒写指针与成功结果（规划复审要求"开关+归属校验两者都要"已落实）；5 个任务腿调用方（scheduler/review_leg/arch_review_leg/test_acceptance_leg/engineering_audit_leg）在 `--new-session` 后统一加 `--no-update-pointer`，从源头杜绝任务会话覆盖 reviewer 指针。
- **#3 新会话采集键漂移（S4）：** `phase0/tools/dispatch_options.mjs` 新增 `extractBriefMarker()`（简报首行 `[TAG|...]` 提取）；`inbound_dom.mjs` 新增 `resolveStartUnitByMarker()`（标记在 user unit 中**恰 1 条**命中才重绑起点 key，零/多处命中返回 null 走既有 fail-closed），`readReplySnapshot()` 接 `startMarker` 并以重绑后的 `startKey` 贯穿 collector/selectInboundReply，结果记 `start_key_resolved/start_resolved_by_marker` 留证；`gpt_dispatch.mjs` sendAndCollect 两次采集传 startMarker。**未引入自动 recoll 路径**（沿用外部 L-018 手工 recoll，从设计上消除"自动重发任务"风险，满足审查要求"自动 recoll 必须不重发"）。
- **测试补强：** `test_dispatch_options.mjs`（15/15，含 wrong-session/非法 UUID 负例、归属校验四型、标记提取）、`test_inbound_reply.mjs`（24/24，含标记唯一/歧义/零命中/仅 assistant 含标记 fail-closed）、`test_review_leg.py`/`test_arch_review_leg.py`（mtime 容差确定性+RunKeyLock 并发负例）。

## 3. 修改文件

| 文件 | 变更 | 说明 |
|---|---|---|
| phase0/tools/dispatch_options.mjs | 改 | --no-update-pointer 解析 + shouldUpdateReviewerPointer/sessionIdIsAttributable/extractSessionId/extractBriefMarker 纯函数 |
| phase0/tools/gpt_dispatch.mjs | 改 | 指针写盘前归属校验 fail-closed；sendAndCollect 传 startMarker；attachPage 返回既有 UUID |
| phase0/tools/inbound_dom.mjs | 改 | resolveStartUnitByMarker + readReplySnapshot startKey 重绑（#3 核心） |
| phase0/tools/test_dispatch_options.mjs / test_inbound_reply.mjs | 改 | 新增负例测试（归属/键漂移/标记） |
| phase1/tools/review_leg.py / arch_review_leg.py | 改 | mtime 2.0s 容差+brief_bytes；review_leg RunKeyLock 同构 |
| phase1/tools/test_review_leg.py / test_arch_review_leg.py | 改 | mtime 负偏确定性+并发锁负例 |
| phase1/tools/scheduler.py / engineering_audit_leg.py / test_acceptance_leg.py | 改 | 派单命令加 --no-update-pointer |
| basic/tasks/b-20261117-dispatch-reliability-fix/ | 新增 | 任务包四件套+acceptance（design-notes/plan-review/acceptance 请求/现场回归/本地测试日志） |
| phase0/logs/dispatch-2026-11-17T03-13-54 / T04-45-47 / T06-08-30 / T06-11-17 | 新增 | 会商、规划复审、S4 现场、独立验收四现场证据（含 recoll reply/原始字节） |
| 冻结契约（contracts/）、M1 运行时（app/）、DEC-010 高危 | **零修改** | 规划复审边界确认 |

## 4. 测试结果

- **四腿合跑 116/116 OK**（test_review_leg 31 + test_arch_review_leg 30 + test_test_acceptance_leg 31 + test_engineering_audit_leg 24；acceptance/local-test-runs/leg-suite-full.log）。其中新增 mtime 容差确定性 + 并发锁负例（test_32/test_33/test_30）。
- **dispatch-options 15/15**（acceptance/local-test-runs/dispatch-options-final.log）：默认/显式 flag 两态、shouldUpdateReviewerPointer 纯函数、归属校验四型（新会话命中/不命中既有 UUID、既有会话同/异目标、非法/缺失 UUID）、标记提取。
- **inbound-reply 24/24**（acceptance/local-test-runs/inbound-reply-final.log）：标记唯一命中重绑、零命中/歧义/仅 assistant 含标记均 fail-closed，既有 23 用例零回归。
- **5 个改动 Python 文件 AST_PARSE_OK；lint 0 错误。**
- **现场实证 dispatch-2026-11-17T06-08-30（真实 chatgpt.com 往返）：** `[S4-LIVE-VERIFY]` 派单 `--no-update-pointer`，发送双验通过（polls=1）→ **未再出现 INBOUND_START_UNIT_MISSING**（该缺陷当日已六现：03-13-54/04-13-35/04-14-04/04-45-47 等）→ 内联采集 COMPLETED（1 assistant unit，41B，2 区间窗口，回复"ACK S4 采集修复验证"）→ 归属校验 PASS → **reviewer 指针前后 SHA 一致**（`5e6545a9c9903b755f1c200b316141ad929846c4458b99a9ab42edcbce61699e`，#4 保护实证）。
- **归谬留证：** 04-13-35/04-14-04 两现场为早前误判网络不可达（SakuraCat 端口漂移 10581→2497，我整串解析取错端口 = L-016 明禁；分协议解析后 chatgpt.com 200）时的发送前 `page.goto` reset（无发送、无重发），归档于 acceptance/dispatch-blocked/。

## 5. Git commit（含验收链与独立复核）

被测 commit：`7f7830b80bdaa6a5c48510c74a621319bf32e419`（完整 40 位，本任务实现与验收证据最终提交）；基线 `ee76a34ac5fb73d7e0fce6369060323c7f7a5016`；决策单元 `3b6fe1a…`（DEC-094）；S2/S3 实现 `f14c7d1…`。绑定方式：steps.md 各步 ⑥ 引用 reply SHA 与被测 commit。

**验收链与独立复核：**

- **规划复审 PASS**（dispatch-2026-11-17T04-45-47/recoll，reply SHA-256=`ff2701c9…7a7e8`）：ChatGPT "方案通过，按此开工"；三点边界认可（不碰冻结契约/M1/DEC-010，若需改边界暂停重新会商）/顺序 #7→#4→#3/#4 开关+归属校验两者都要（可简化实现但不得删任一安全条件，失败 fail-closed）；验收要求每项独立提交/测试/验收、#3 自动 recoll 不重发、保留负例、基线固定、三项全 PASS 后再进等级 B 试运行 Gate。
- **独立验收三项 PASS**（dispatch-2026-11-17T06-11-17，reply SHA-256=`a5d099d6…36a631`）：#7 PASS（四腿 116/116；容差、字节归属及 RunKeyLock 同构覆盖无遗漏）；#4 PASS（15/15 含 wrong-session/非法 UUID 负例；现场指针前后 SHA 一致、归属校验通过）；#3 PASS（24/24 歧义与零命中 fail-closed；现场首采成功并完成内联采集，未重发任务）；"三项PASS可交付"；边界检查按记录冻结契约/M1/DEC-010 未触碰、未增自动 recoll、负例保留。
- **审查方 caveat 如实登记：** ChatGPT 回复末尾明示"以上依据本轮提交的验收记录作结论，尚未直接读取 acceptance/ 原始文件；不冒称已核验原始日志"——本交付不将其表述为"已直读原始证据的强验收"，按审查方自述记录。

## 6. 未解决问题（含约束满足与残留）

- DEC-094 执行边界全部满足：被测基线 ee76a34 未漂移；未触碰 DEC-010 高危；未申请等级 B 试运行开工（本次交付止于三项修复收口）。
- 残留处置甲（DEC-094）：`review_leg_recoll_driver.mjs` 已恢复 HEAD；`recoll_g05r2.mjs` 归档 G05 acceptance/live-run（SHA 核对一致）后清除——均已完成（见 3b6fe1a 提交）。
- 已知遗留（不属本任务范围，移交后续）：DEC-093 遗留 #1 findings 结构化契约演进（H2）、#2 矩阵×批次 BLOCKER 语义、#5 per-agent 授权表、#6 source-principal 绑定、#7 两腿 mtime 同项已在本任务收口。
- 会话指针：当前 reviewer 会话 6afbc6a9-b26c-83ee-9c27-b6c6e6f75664（DEC-094 迁移），验收派单后 captured_at 刷新、URL 未变。

## 7. 后续建议

1. **三项全 PASS 已满足 DEC-094/规划复审前置条件**——可按 DEC-026 路线向 ChatGPT 提请**等级 B 受控试运行 Gate 审议**（本次方案通过/三项 PASS 均不等于试运行授权）。
2. 进入受控试运行前，建议先处理 DEC-093 遗留 #1/#2（findings 结构化契约演进四契约同族、矩阵×批次 BLOCKER 语义），避免真实任务审查时契约口径不一致。
3. 将 #3/#4 的 wrong-session、键漂移和归属失败负例纳入回归。现场归档证明既有会话的一次收发与采集完成。纯函数测试覆盖错页判定和 marker 匹配，原始现场未直接证明新会话错页受阻、指针前后 SHA 对照或 marker 实际走了回退路径。#7 的 review_leg 跨进程竞争及错误简报字节反例缺口见 P1-01 终审。后续整改和试跑范围见 DEC-118。

