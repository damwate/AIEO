# 步骤清单：b-20261121-dispatch-reliability-trial

- 被测代码：分支 fix/dispatch-reliability，c8b3d042d61209f29c8cff48923e700c5a6b2980（生产代码试跑期间零修改）。
- 方案依据：DEC-119 ChatGPT 拍板"方案 R1 有条件通过"+执行序冻结 T1b→T1a→T2甲→T2乙→T3；每项独立 PASS/FAIL/BLOCKED 判据，失败即停。
- 试跑项通用验收基线：回执状态机（send-state.json）、reviewer 指针 SHA 前后对照、派单次数、DOM 结构化证据、归档字段完整性。

## S1 方案落仓与拍板（完成）

- ①本步骤目标：试跑方案 R1 成文落仓推送，交 ChatGPT 拍板讨论，固化执行序与判据。
- ②修改文件：新增 phase0/tools/trial_dispatch_reliability_plan_r1.md、brief_trial_dispatch_plan_r1.txt。
- ③修改内容：T0-T3 试跑项、验收判据表、安全红线、四讨论问。
- ④执行结果：方案提交 a51b8fa9c230b2ac32d7b63359b46b98762da5a7 推送成功；讨论轮派单 dispatch-2026-11-20T17-14-34 以分支新链路执行（--session-result 绑定），发送双验过、采集 fail-closed（INBOUND_WINDOW_COMPLETENESS_UNPROVEN）——恰为 T2 形态活体复现；L-018 补采 recoll-trial-plan-r1-2026-11-20T17-18-20-595Z 八查全过；拍板 reply 3093B SHA-256=555f8fe55b984452602a8632d28799d6b8f211a10fab1336f8c39f838079eecd。登记 DEC-119。
- ⑤测试结果：T0 正向观察成立——send-state.json 三态 NOT_SENT→SEND_ATTEMPTED→SEND_CONFIRMED{session_id=6aff4117-…,user_unit_key=fallback-turn-0:0:user}；reviewer 指针 SHA 前后不变 f32962e6…；派单次数 1。
- ⑥验收证据引用：dispatch-2026-11-20T17-14-34/、recoll-trial-plan-r1-2026-11-20T17-18-20-595Z/、decision-log §DEC-119；**验收结论：PASS（方案获裁定"有条件通过"，T0 正向观察成立；该观察不扩大为整链路验收——审查方原话照登）**。

## S2 T1b 归档自不一致预飞拦截

- ①本步骤目标：归档 session_id≠conversation_url 时发送前 SESSION_TARGET_INVALID 拒绝，零导航。
- ②修改文件：无生产代码（构造 trial 伪归档 basic/tasks/b-20261121-dispatch-reliability-trial/acceptance/t1b-session-result-invalid.json + 一次性简报）。
- ③判据（独立）：退出非零+错误码 SESSION_TARGET_INVALID；run.log 无任何 goto/会话就绪行；send-state.json=NOT_SENT；reviewer 指针 SHA 不变；派单次数 1。
- ④执行结果：构造归档 acceptance/t1b-session-result-invalid.json（conversation_url=6aff4117 真实会话，session_id=12345678-1234-5678-1234-567812345678，自不一致）+ 一次性简报 t1b-brief.txt（[TRIAL-T1B|…]）。运行 dispatch-2026-11-20T17-25-01：attach 既有页后**发送前**抛 SESSION_TARGET_INVALID 退出（gpt_dispatch.mjs:393 归档身份校验点）；run.log **零导航**（无 goto/会话就绪行）。如实登记异常工件：进程退出阶段出现 libuv 断言输出（Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), src\win\async.c:76，Windows/node 退出路径瞬态，不影响 fail-closed 结果，移交 S7 汇总）。
- ⑤测试结果：五判据全 PASS——Ⅰ退出非零+SESSION_TARGET_INVALID；Ⅱrun.log 零导航；Ⅲsend-state.json=NOT_SENT（无 SEND_ATTEMPTED）；Ⅳreviewer 指针 SHA 前后不变（f32962e6…）；Ⅴ派单次数=1（单证据目录，无重发）。
- ⑥验收证据引用：phase0/logs/dispatch-2026-11-20T17-25-01/（run.log+send-state.json+request.txt+tab-audit.json）；acceptance/t1b-pointer-sha-before.txt；**S2 结论：PASS**。

## S3 T1a 错页-重定向拦截（DEC-117 形态重放）

- ①本步骤目标：自一致归档指向不存在 UUID（00000000-0000-0000-0000-000000000000），真实导航落点在 Enter 前被拦截。
- ②修改文件：无生产代码（构造 acceptance/t1a-session-result-wrongpage.json + 一次性简报）。
- ③判据（独立，四项缺一不可）：Ⅰ回执停留 NOT_SENT（无 SEND_ATTEMPTED）；Ⅱreviewer 指针 SHA 前后不变；Ⅲ派单次数=1 无重发；Ⅳ重定向落点 DOM user 单元对照=零新增（落点页仍开可直读；若不可靠读取则结论=证据不足，不得凭 NOT_SENT 单证宣称零 Enter）。
- ④执行结果：构造自一致伪归档 acceptance/t1a-session-result-wrongpage.json（00000000-0000-0000-0000-000000000000，合法格式不存在会话）+ 一次性简报 t1a-brief.txt。**r1（dispatch-2026-11-20T17-25-49）传输层失败如实登记**：goto ERR_CONNECTION_TIMED_OUT（SakuraCat 代理 14281→1130 漂移，L-016 固化路径实测注册表 1130 可用后重启调试 Chrome），未达拦截逻辑、零发送，现场保留不算试跑证据。**r2（dispatch-2026-11-20T17-28-21）为有效试跑**：预起调试 Chrome（复用既有页#0=chatgpt.com 首页，保证落点页存活可读证）→ goto 伪会话"会话就绪"（domcontentloaded 达成）→ **assertDispatchPage 断言时页面已重定向至根路径 → SESSION_TARGET_MISMATCH 发送前停止**（dispatch_options.mjs:75 assertDispatchTarget）。
- ⑤测试结果：四判据全 PASS——Ⅰsend-state.json=NOT_SENT（run.log 零发送相关行，无 SEND_ATTEMPTED）；Ⅱreviewer 指针 SHA 前后不变 f32962e6…；Ⅲ派单次数=1（r2 单轮；r1 传输失败零发送另档保留）；Ⅳ重定向落点 DOM 前后对照=**零新增 user 单元**（pre=6aff4117 页物化 2 单元/1 user；post=落点 chatgpt.com 根 0 单元/0 user；机器可读对 trial-t1a-audit-pre.json/trial-t1a-audit-post.json）。附观察：DEC-117 时代的副作用会话系误投消息所创建，本次零发送仅重定向回根、无新会话产生——与既有事故形态一致。
- ⑥验收证据引用：phase0/logs/dispatch-2026-11-20T17-28-21/（run.log+send-state.json+request.txt+tab-audit.json）；acceptance/t1a-run-stdout.txt（r1）与 t1a-run2-stdout.txt（r2）；phase0/logs/trial-t1a-audit-pre.json+trial-t1a-audit-post.json；**S3 结论：PASS**。

## S4 T2甲 SEND_CONFIRMED 后进程中断

- ①本步骤目标：发送双验确认后立即 kill 派单进程，验证"发送已确认、采集未完成"边界留证与不重发。
- ②修改文件：无生产代码（一次性简报 [TRIAL-T2A|…]，--new-session + --no-update-pointer，AIEO_DISPATCH_SEND_RECEIPT 外置回执路径）。
- ③判据（独立）：回执=SEND_CONFIRMED（含 session_id+user_unit_key）；进程被 kill 后无成功 result.json；reviewer 指针 SHA 不变；派单次数=1；新会话仅此一条 user 消息。
- ④执行结果：一次性简报 t2a-brief.txt（[TRIAL-T2A|…]，--new-session + --no-update-pointer，AIEO_DISPATCH_SEND_RECEIPT 外置回执）。后台运行+1s 轮询外置回执，SEND_CONFIRMED 出现后 1 秒 kill -9（NODE_EXIT=137，KILLED=yes_at_46s）。新会话 6b0083e0-bc24-83ec-a9c2-7bcc4d9c0fb8（UUID 取自回执）；发送双验通过（polls=1）→ 回执翻转 SEND_CONFIRMED → 进程终止；页面现场保留（未清理，供 T3 补采）。
- ⑤测试结果：五判据全 PASS——Ⅰ回执=SEND_CONFIRMED{session_id=6b0083e0-…,user_unit_key=fallback-turn-0:0:user}；Ⅱ成功 result.json 缺失（kill 于采集完成前）；Ⅲreviewer 指针 SHA 前后不变 f32962e6…；Ⅳ派单次数=1（单证据目录）；Ⅴ新会话仅一条 user 消息（T3 补采 marker 命中=1 复核）。与 dispatch-2026-11-20T17-14-34（T0 活体观察）互证：回执链在"发送已确认、采集未完成"边界两侧均正确留证。
- ⑥验收证据引用：phase0/logs/dispatch-2026-11-20T17-30-24/（send-state.json+request.txt+run.log，无 result.json）；phase0/logs/trial-t2a-receipt.json（外置回执）；acceptance/t2a-run-stdout.txt；**S4 结论：PASS**。

## S5 T2乙 生成超窗自然采集失败

- ①本步骤目标：长回复简报（约 8000+ 字分节清单）使生成超出生产默认 GENERATION_TIMEOUT_MS=300000，触发 GENERATION_TIMEOUT 路径（发送已确认）。
- ②修改文件：无生产代码（一次性简报 [TRIAL-T2B|…]，--new-session + --no-update-pointer）。
- ③判据（独立）：若触发——GENERATION_TIMEOUT 错误+回执 SEND_CONFIRMED+无成功 result.json+派单次数=1；若窗口内完成（采集成功）——**如实登记"未能构造"**（单次尝试，禁延长/循环派单），采集成功现场一并归档。
- ④执行结果：一次性简报 t2b-brief.txt（[TRIAL-T2B|…]，约 8000 字 20 节清单，--new-session + --no-update-pointer，生产默认 GENERATION_TIMEOUT_MS=300000 不调 env）。新会话 6b008445-79e8-83ec-a6c7-c1a56b288cd6；发送双验通过→SEND_CONFIRMED→**回复于窗口内完成（17:32:03 派单→17:35:48 采集落盘，全程 <300s），GENERATION_TIMEOUT 未触发，采集成功 exit 0**。
- ⑤测试结果：**未能构造（如实登记，单次尝试，不再重试/延长）**——约 8000 字回复在 300s 生产窗口内生成完毕，自然超窗路径本轮未触发。机制可控性已另行证明：窗口常量与 GENERATION_TIMEOUT 路径在代码中确认（gpt_dispatch.mjs:61/302），且 T0 现场（17-14-34）已实证"发送确认后采集失败"的 fail-closed 行为。成功采集现场归档（含回执链 SEND_CONFIRMED+成功 result.json，作为新会话正向路径第二观察）。
- ⑥验收证据引用：phase0/logs/dispatch-2026-11-20T17-32-03/（完整成功现场）；phase0/logs/trial-t2b-receipt.json；acceptance/t2b-run-stdout.txt；**S5 结论：BLOCKED（未能构造）——非缺陷判定，按裁定如实登记，T2乙 判据以"不可稳定构造即如实记录"为终态**。

## S6 T3 原会话补采（绑定 T2甲 回执）

- ①本步骤目标：对 T2甲 原会话（新会话，UUID 取自 SEND_CONFIRMED 回执）recoll 只读补采；回执 SENT_USER_UNIT_KEY（fallback-turn-N:M:user 相对键形）与物化 marker 定位单元键做键形对照登记。
- ②修改文件：派生 recoll 驱动 phase0/tools/recoll_trial_t3.mjs（三参数：CONV_UUID=T2甲会话/MARKER=TRIAL-T2A/FAILED_DIR=T2甲派单目录；新会话无前轮 reply，PREV_REPLY_SHA256 用零哨兵并在 result.json 注明）。
- ③判据（独立）：marker 唯一命中+最后 user 断言+静态 DOM 两次读取稳定+尾部 assistant+停止按钮消失；键形对照：回执键 ":0:user" 尾段=物化键尾段（首轮首单元）；reply SHA256 落盘；补采过程零发送；派单次数=1（recoll 只读）。
- ④执行结果：派生 phase0/tools/recoll_trial_t3.mjs（三参数已换：CONV_UUID=6b0083e0-…/MARKER=TRIAL-T2A/FAILED_DIR=dispatch-2026-11-20T17-30-24，grep 核对；前轮 SHA=零哨兵并注明）。首跑遇 CDP 拒连——**非异常：T2乙 成功路径按既有语义 killProfileChrome 整浏览器关闭（gpt_dispatch.mjs:553-554）**；重启调试 Chrome 后二跑：驱动新开页导航原会话（页不在场分支）→ 生成态探测（已停）→ 视口拉高物化 → 静态 DOM 两次读取稳定。
- ⑤测试结果：九查全 PASS——marker 唯一命中 1 条+最后 user 断言+**回执键形绑定**（receipt fallback-turn-0:0:user ↔ 物化 bd5e3ccf-d915-5e8b-967c-a0b5b4e189e7:0:user，尾段 "0:user" 一致，双键留档）+尾部 assistant+停止按钮消失+前轮 SHA 零哨兵排除+长度合理。reply 6786B SHA-256=`7d2cafbed6ffb76b29eb6b0458cd012b0a9dce0f81a5d3422ed7acc00082215d`，内容=TRIAL-T2A 占位文本（目的/边界/登记三节）。会话结构机器复核：**unit_total=2（user 1+assistant 1）——T2甲"新会话仅一条 user 消息"判据成立**。补采全程只读零发送；临时页已清理。
- ⑥验收证据引用：phase0/logs/recoll-trial-t3-2026-11-20T17-37-35-807Z/（reply.txt+result.json+units-diag.json+run.log）；T2甲 回执 phase0/logs/trial-t2a-receipt.json；**S6 结论：PASS**。

## S7 交付登记与独立复核

- ①本步骤目标：DEC-120 登记、delivery.md 成文、ST-05 终检、提交推送，交 ChatGPT 独立复核（DEC-118 F06 尾项）。
- ②修改文件：docs/phase1/decision-log.md、本任务包 delivery.md、docs/PHASE-STATUS.md。
- ③修改内容：五项判定表（每项 PASS/FAIL/BLOCKED+证据指针）、与开发自测数字分开登记、遗留与移交清单。
- ④执行结果：（待填）
- ⑤测试结果：（待填）
- ⑥验收证据引用：（待填）
