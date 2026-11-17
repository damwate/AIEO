# 步骤清单：b-20261117-dispatch-reliability-fix

- 被测基线：ee76a34ac5fb73d7e0fce6369060323c7f7a5016（开工前生产代码树逐字节一致已核）
- 方案依据：DEC-094 ChatGPT 拍板 B（大方案）+ 用户 2026-11-17 授权细节自决；按 WORKFLOW 模块二"节点授权"条款，方案以 ChatGPT 复审+节点授权替代逐项拍板。每步仍交 ChatGPT 独立验收（模块四）。
- 步骤节奏：S1 设计→S2 #7→S3 #4→S4 #3→S5 交付；每步完成即停、交独立验收，不自我宣布通过。三缺陷按"风险低→高、纯 Python→碰派单主工具"排序：先 #7（腿脚本，不碰 gpt_dispatch）、再 #4（指针写盘）、最后 #3（采集判定，最贴 fail-closed 核心）。

## S1 设计（完成；规划复审 PASS）

- **BLOCKED→恢复（2026-11-17 04:45）：** 早前"网络不可达"实为**测量误差**——SakuraCat VPN 端口再次漂移（10581→2497），我早前用整串解析取错端口（L-016 明禁）；按 L-016 分协议解析 https 端口 2497 后 chatgpt.com 200（1.4s）。纠正后重派规划复审成功。
- **规划复审 PASS**：dispatch-2026-11-17T04-45-47（发送双验过→INBOUND_START_UNIT_MISSING 第6次→禁重发→recoll 七查全过；reply 1214B SHA-256=`ff2701c9ca48f20327aee868ca5d012bd51ed746564a19b3696efc0f1179a7e8`）。ChatGPT "方案通过，按此开工"：三点边界/顺序/#4 开关+归属校验全确认；要求每项独立验收、#3 自动 recoll 不重发、保留负例、基线 ee76a34、三项全 PASS 后再进等级 B 试运行 Gate。详见 acceptance/design-notes.md §5。

- ①本步骤目标：固化三项缺陷的根因证据（带文件行号）、修复方案与回归测试设计；产出一轮 ChatGPT 规划复审（确认大方案下三项修复方向无越界、无触碰 DEC-010/冻结契约）。
- ②修改文件：无（设计步，产出落 acceptance/design-notes.md）。
- ③修改内容：三缺陷根因对照表（#3/#4/#7 各含抛出点/根因/修复方向/测试点）；修复边界（公共工具引用不复制、M1-M4 与冻结契约零修改、基线 ee76a34）；回归清单（既有用例数+新增用例设计）。
- ④执行结果：acceptance/design-notes.md 成文；规划复审派单落地。
- ⑤测试结果：不适用（设计步）。
- ⑥验收证据引用：dispatch-2026-11-17T04-45-47/recoll（规划复审；reply 1214B SHA-256=`ff2701c9ca48f20327aee868ca5d012bd51ed746564a19b3696efc0f1179a7e8`，"方案通过，按此开工"）；**验收结论：PASS**。

## S2 修复 #7 mtime 容差 + 并发锁（PASS）

- ①本步骤目标：review_leg.py/arch_review_leg.py 的 `_find_dispatch_dir` 同构对齐 test_acceptance_leg.py（since-2.0 负偏容差+brief_bytes 字节归属）；review_leg.py 按 D2 同构复制 RunKeyLock 包裹 run/resume/attach_reply。
- ②修改文件：phase1/tools/review_leg.py、phase1/tools/arch_review_leg.py、phase1/tools/test_review_leg.py（+可能 test_arch_review_leg.py）。
- ③修改内容：mtime 容差+brief_bytes 参数化；并发锁 acquire/release/run_key 绑定；新增 mtime 负偏确定性用例（容差内定位/容差外拒判）+跨进程锁竞争负例。
- ④执行结果：review_leg.py 增 RunKeyLock 类（同构复制 arch_review_leg.py，contextlib 导入）+run/resume/attach_reply 三个入口包裹（拆 _run_inner/_resume_with_lock/_attach_with_lock）；review_leg.py 与 arch_review_leg.py 的 `_find_dispatch_dir` 均加 `since-2.0` 时钟负偏容差；review_leg.py r3_dispatch 计算 brief_bytes 并传入两处现场定位（字节归属防并发串单）。原三腿行为零变化（仅加防御层）。
- ⑤测试结果：三腿全量 **92/92 passed 退出码 0**（test_review_leg 31：29+新增 mtime 确定性 test_32 + 并发锁 test_33；test_arch_review_leg 30：29+新增 mtime test_30；test_test_acceptance_leg 31 零回归）；日志 phase1/tools/test_all_s2.log（本地落盘证据）；lint 0 错误。
- ⑥验收证据引用：dispatch-2026-11-17T06-11-17（独立验收；reply 814B SHA-256=`a5d099d62e6881c3d625c3bf1c08454f49fe62c098a0eb9bf25fa18cb036a631`，#7 判 "PASS — 四腿116/116；容差、字节归属及RunKeyLock同构覆盖"）；**验收结论：PASS**。审查方明示按提交验收记录结论、未直读原始日志，如实登记不冒称。被测 commit 绑定见 delivery.md C1。

## S3 修复 #4 指针覆盖（PASS）

- ①本步骤目标：`--new-session` 写 reviewer 指针前增加显式保护（开关/页归属校验二选一，设计步定稿），消除无条件覆盖；把 wrong-session 事故复现固化为集成负例。
- ②修改文件：phase0/tools/gpt_dispatch.mjs、phase0/tools/test_tab_hygiene.mjs（或新增集成测试）。
- ③修改内容：指针写盘前置校验/开关；多页 context 选错页拒写；集成负例。
- ④执行结果：采用**纯增量、默认行为不变**方案（避免大方案细节未复审时擅改默认语义）——dispatch_options.mjs 新增 `--no-update-pointer` 解析 + `shouldUpdateReviewerPointer()` 纯函数（默认写、显式 flag 跳过）；gpt_dispatch.mjs 指针写盘改由该纯函数守卫，URL 解析/result.json 绑定不变；5 个任务腿调用方（scheduler/review_leg/arch_review_leg/test_acceptance_leg/engineering_audit_leg）全部在 `--new-session` 后加 `--no-update-pointer`，从源头杜绝任务会话覆盖 reviewer 指针（wrong-session 两次复现的直接成因）。
- ⑤测试结果：dispatch options **13/13**（含新增默认/显式两态+纯函数 4 断言，test_dispatch_options.mjs）；inbound reply **23/23** 零回归；三腿 **92/92** 零回归（命令数组变更后）；engineering_audit_leg **24/24** 零回归；5 个改动 Python 文件 AST_PARSE_OK。证据落 acceptance/local-test-runs/；lint 0。
- ⑥验收证据引用：dispatch-2026-11-17T06-11-17（独立验收，SHA-256=`a5d099d62e6881c3d625c3bf1c08454f49fe62c098a0eb9bf25fa18cb036a631`，#4 判 "PASS — 15/15含wrong-session/非法UUID负例；现场指针前后SHA一致、归属校验通过"）；**验收结论：PASS**。规划复审要求"开关+归属校验两者都要"已落实（shouldUpdateReviewerPointer+sessionIdIsAttributable）。被测 commit 绑定见 delivery.md C1。

## S4 修复 #3 新会话采集（PASS）

- ①本步骤目标：消除 #3 固定 key 漂移导致的首采 fail-closed（标记文本唯一定位重绑），保留既有 fail-closed 强度；不重发。
- ②修改文件：phase0/tools/gpt_dispatch.mjs、phase0/tools/dispatch_options.mjs、phase0/tools/inbound_dom.mjs、phase0/tools/test_inbound_reply.mjs、phase0/tools/test_dispatch_options.mjs。
- ③修改内容：dispatch_options.extractBriefMarker（简报首行 [TAG] 提取）；inbound_dom.resolveStartUnitByMarker（标记唯一命中 user unit 才重绑起点 key，零/多处命中 fail-closed）+readReplySnapshot 接 startMarker 并用 startKey 贯穿 collector/selectInboundReply；gpt_dispatch.sendAndCollect 两次采集传 startMarker；结果记 start_key_resolved/start_resolved_by_marker 留证。未加自动 recoll（沿用外部 L-018，避免重发风险，审查要求"自动 recoll 不重发"以不引入自动重发路径的方式满足）。
- ④执行结果：#3 键漂移修复落地；**现场实证** dispatch-2026-11-17T06-08-30：真实派单 `[S4-LIVE-VERIFY]` 首采未再 INBOUND_START_UNIT_MISSING、内联采集 COMPLETED（41B/2窗，回复"ACK S4 采集修复验证"），而同一缺陷当日已六现（03-13-54/04-13-35/04-14-04/04-45-47 等）。
- ⑤测试结果：inbound-reply **24/24**（含新增标记唯一/歧义/零命中/仅 assistant 含标记 fail-closed 用例）；dispatch-options **15/15**；四腿 116/116 零回归；lint 0。证据 acceptance/local-test-runs/。
- ⑥验收证据引用：dispatch-2026-11-17T06-11-17（独立验收，SHA-256=`a5d099d62e6881c3d625c3bf1c08454f49fe62c098a0eb9bf25fa18cb036a631`，#3 判 "PASS — 24/24歧义与零命中均fail-closed；现场首采成功并完成内联采集，未重发任务"）；**验收结论：PASS**。被测 commit 绑定见 delivery.md C1。

## S5 交付（PASS）

- ①本步骤目标：整体合跑+交付登记+C1 绑定；三项独立验收 PASS 已由 ChatGPT 给出（等级 B 试运行 Gate 另行申请，本任务不申请）。
- ②修改文件：delivery.md、task-brief.md、steps.md、acceptance/。
- ③修改内容：交付七要素；被测 commit 绑定（7f7830b8…完整 40 位）；合跑证据；后续建议（等级 B 试运行 Gate 立项）。
- ④执行结果：delivery.md 成文（七要素+C1 绑定）；task-brief 状态更新为完成。
- ⑤测试结果：合跑 116/116 + dispatch-options 15/15 + inbound-reply 24/24（见 S2-S4 与 delivery §4）。
- ⑥验收证据引用：dispatch-2026-11-17T06-11-17 独立验收三项 PASS（reply SHA-256=`a5d099d62e6881c3d625c3bf1c08454f49fe62c098a0eb9bf25fa18cb036a631`，"三项PASS可交付"）；**验收结论：PASS**。被测 commit 绑定 7f7830b80bdaa6a5c48510c74a621319bf32e419。

## 返工记录表（首次 REJECT 时建表；按"同一问题"计数）

（无 REJECT 历史，暂不建表）
