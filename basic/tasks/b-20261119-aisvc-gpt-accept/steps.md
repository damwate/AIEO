# 步骤清单（用户拍板冻结）

**用户拍板原文（2026-11-19）：** "完事之后你调用AIEO项目的basic功能提交chatgpt验收下，验收之前看看AIEO的开发经验文档"

**冻结方案要点：** 把 dispatch-2026-11-18T16-28-13/request.txt 的 [F2F3F4补强终审|AI-Image-Service] 简报原文（1139 字节，被审SHA 47f2ecc）保持一字不改，经 `phase0/tools/gpt_dispatch.mjs --message-file` 向现有审查会话（phase0/logs/gpt-reviewer-session.json：6afdc528-88ac-83ec-a9da-282ae6cf5432）派发并采集回复归档。拍板依据=用户直接指令（L-020 节点自主推进授权；本任务无代码改动，无独立规划协商环节需求）。

**会话迁移评估（L-018 第 6 条，2026-11-19）：** 该审查会话昨日累计 user 消息已超 4 条评估阈值；决定本轮**暂不迁移**——理由：简报含"你上轮:F2 FAIL/F3 PARTIAL、F4 PASS_WITH_CONSTRAINTS"回指，依赖会话上下文连续性，新会话需重写简报并补裁定点位；本轮验收闭环后再评估迁移。

## S1 派单执行：补强终审派发+回复采集+归档登记

①本步骤目标：[F2F3F4补强终审] 简报送达 ChatGPT 审查会话，采集其 JSON 验收回复并归档登记。

②修改文件：（无业务代码修改）新增本任务包文件；新增派生补采驱动 phase0/tools/recoll_f2f3f4_final.mjs；派单证据由 gpt_dispatch 写入 phase0/logs/dispatch-2026-11-18T17-03-40/。

③修改内容：派单消息=冻结简报原文 1139B（冻结commit 5c08c9c8b35c069960ef048b351e43bf4c64334a，与派单归档 request.txt 经 diff 实证 byte-identical）；本次待验收 commit=（本任务无代码 commit；被审对象=AI-Image-Service@47f2ecc1f17f51cc1cbb2e326602f9447ed3407e，只读）。

④执行结果：发送——17:03Z 派单发送双验通过（polls=1，dispatch-2026-11-18T17-03-40）；采集 fail-closed——INBOUND_WINDOW_COMPLETENESS_UNPROVEN（虚拟列表滚动完整性不可证，与昨日三轮同型）；按 L-018 禁重发走静态 DOM 补采——派生驱动 recoll_f2f3f4_final.mjs（三常量核对 CONV_UUID+MARKER+FAILED_DIR；视口拉高 80000 全量物化，两次读取间隔 12s 稳定）；补采七查全过（marked_user_unique/last_user_assertion/adjacent_assistant_tail/stable_static_dom_read/final_stop_button_not_visible/not_prev_reply_sha/response_length_plausible），回复 4975B 落盘；证据目录位置更正——驱动 OUT_DIR 因 cwd=phase0/tools 嵌套生成于 phase0/tools/phase0/logs/，已整目录 mv 至规范位置 phase0/logs/recoll-f2f3f4-final-2026-11-18T17-08-40-367Z（文件未改，SHA 以 MANIFEST 为准）。

⑤测试结果：未测（S1 派单执行类任务，无代码测试）。环境预检（2026-11-19 实查）：系统代理注册表 ProxyServer=127.0.0.1:8514，经代理 curl chatgpt.com 实测 HTTP 200/1.7s（直连超时）；Chrome gpt-poc profile CDP 9222 存活（无显式 proxy 参数，跟随系统代理）；ST-05 检查器自检=IN_PROGRESS 无 FAIL（冻结 commit 5c08c9c 时点）。

⑥验收证据引用：验收结论：PASS（本步骤派单/采集/归档闭环达成任务验收目标）；派单回复裁定=REWORK（如实转达，返工对象=AI-Image-Service 开发侧，见 delivery.md）；dispatch 目录=phase0/logs/dispatch-2026-11-18T17-03-40；recoll 目录=phase0/logs/recoll-f2f3f4-final-2026-11-18T17-08-40-367Z；reply SHA256=b786a75e2987a2ff02b63548677783d1152c6d15e1567b15eeb0d4462aec2fee（4975B，与 recoll result.json 一致）；包内证据=acceptance/reply-raw.txt、acceptance/reply-parsed.json、acceptance/recoll-result.json、acceptance/brief-frozen-1139B.txt、acceptance/MANIFEST.txt（SHA256 清单见 acceptance/MANIFEST.txt）。

**验收结论：PASS**（本步骤动作闭环；被审对象裁定 REWORK 已如实转达并单列于 delivery.md，不并入本步骤结论）
