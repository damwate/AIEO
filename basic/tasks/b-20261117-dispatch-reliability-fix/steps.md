# 步骤清单：b-20261117-dispatch-reliability-fix

- 被测基线：ee76a34ac5fb73d7e0fce6369060323c7f7a5016（开工前生产代码树逐字节一致已核）
- 方案依据：DEC-094 ChatGPT 拍板 B（大方案）+ 用户 2026-11-17 授权细节自决；按 WORKFLOW 模块二"节点授权"条款，方案以 ChatGPT 复审+节点授权替代逐项拍板。每步仍交 ChatGPT 独立验收（模块四）。
- 步骤节奏：S1 设计→S2 #7→S3 #4→S4 #3→S5 交付；每步完成即停、交独立验收，不自我宣布通过。三缺陷按"风险低→高、纯 Python→碰派单主工具"排序：先 #7（腿脚本，不碰 gpt_dispatch）、再 #4（指针写盘）、最后 #3（采集判定，最贴 fail-closed 核心）。

## S1 设计（设计完成；规划复审派单 BLOCKED——chatgpt.com 网络不可达）

- **BLOCKED 登记（2026-11-17 04:14）：** 规划复审派单两次在 `page.goto` 阶段 `net::ERR_CONNECTION_RESET`（发送前失败，无重发风险）；按 L-014 探测：注册表代理 10581 在听但 chatgpt.com 经代理与直连均 `http_code=000`（网络路径不可达，非工具缺陷）。本次会务派单（03:14）与补采（03:18）约 1 小时前仍成功，链路其后中断。按 L-014 第4/5条：精确报告、不空转、继续不依赖该连接的工作。规划复审三点确认待链路恢复补派；大方案已由 DEC-094 拍板（选B+#3/#4/#7+边界），三点细化属用户授权"细节你俩解决"，实现在已批准范围内推进，独立验收留待恢复后补做。

- ①本步骤目标：固化三项缺陷的根因证据（带文件行号）、修复方案与回归测试设计；产出一轮 ChatGPT 规划复审（确认大方案下三项修复方向无越界、无触碰 DEC-010/冻结契约）。
- ②修改文件：无（设计步，产出落 acceptance/design-notes.md）。
- ③修改内容：三缺陷根因对照表（#3/#4/#7 各含抛出点/根因/修复方向/测试点）；修复边界（公共工具引用不复制、M1-M4 与冻结契约零修改、基线 ee76a34）；回归清单（既有用例数+新增用例设计）。
- ④执行结果：acceptance/design-notes.md 成文；规划复审派单落地。
- ⑤测试结果：不适用（设计步）。
- ⑥验收证据引用：（待派单回填：dispatch 目录+reply SHA）；规划复审结论。

## S2 修复 #7 mtime 容差 + 并发锁（本地实现完成；独立验收 BLOCKED——chatgpt.com 不可达）

- ①本步骤目标：review_leg.py/arch_review_leg.py 的 `_find_dispatch_dir` 同构对齐 test_acceptance_leg.py（since-2.0 负偏容差+brief_bytes 字节归属）；review_leg.py 按 D2 同构复制 RunKeyLock 包裹 run/resume/attach_reply。
- ②修改文件：phase1/tools/review_leg.py、phase1/tools/arch_review_leg.py、phase1/tools/test_review_leg.py（+可能 test_arch_review_leg.py）。
- ③修改内容：mtime 容差+brief_bytes 参数化；并发锁 acquire/release/run_key 绑定；新增 mtime 负偏确定性用例（容差内定位/容差外拒判）+跨进程锁竞争负例。
- ④执行结果：review_leg.py 增 RunKeyLock 类（同构复制 arch_review_leg.py，contextlib 导入）+run/resume/attach_reply 三个入口包裹（拆 _run_inner/_resume_with_lock/_attach_with_lock）；review_leg.py 与 arch_review_leg.py 的 `_find_dispatch_dir` 均加 `since-2.0` 时钟负偏容差；review_leg.py r3_dispatch 计算 brief_bytes 并传入两处现场定位（字节归属防并发串单）。原三腿行为零变化（仅加防御层）。
- ⑤测试结果：三腿全量 **92/92 passed 退出码 0**（test_review_leg 31：29+新增 mtime 确定性 test_32 + 并发锁 test_33；test_arch_review_leg 30：29+新增 mtime test_30；test_test_acceptance_leg 31 零回归）；日志 phase1/tools/test_all_s2.log（本地落盘证据）；lint 0 错误。
- ⑥验收证据引用：ChatGPT 独立验收 **BLOCKED**（chatgpt.com 网络不可达，见 S1 登记）；待链路恢复派单，绑定本步骤被测 commit（完整 40 位 SHA 回填）。

## S3 修复 #4 指针覆盖（本地实现完成；独立验收 BLOCKED——chatgpt.com 不可达）

- ①本步骤目标：`--new-session` 写 reviewer 指针前增加显式保护（开关/页归属校验二选一，设计步定稿），消除无条件覆盖；把 wrong-session 事故复现固化为集成负例。
- ②修改文件：phase0/tools/gpt_dispatch.mjs、phase0/tools/test_tab_hygiene.mjs（或新增集成测试）。
- ③修改内容：指针写盘前置校验/开关；多页 context 选错页拒写；集成负例。
- ④执行结果：采用**纯增量、默认行为不变**方案（避免大方案细节未复审时擅改默认语义）——dispatch_options.mjs 新增 `--no-update-pointer` 解析 + `shouldUpdateReviewerPointer()` 纯函数（默认写、显式 flag 跳过）；gpt_dispatch.mjs 指针写盘改由该纯函数守卫，URL 解析/result.json 绑定不变；5 个任务腿调用方（scheduler/review_leg/arch_review_leg/test_acceptance_leg/engineering_audit_leg）全部在 `--new-session` 后加 `--no-update-pointer`，从源头杜绝任务会话覆盖 reviewer 指针（wrong-session 两次复现的直接成因）。
- ⑤测试结果：dispatch options **13/13**（含新增默认/显式两态+纯函数 4 断言，test_dispatch_options.mjs）；inbound reply **23/23** 零回归；三腿 **92/92** 零回归（命令数组变更后）；engineering_audit_leg **24/24** 零回归；5 个改动 Python 文件 AST_PARSE_OK。证据落 acceptance/local-test-runs/；lint 0。
- ⑥验收证据引用：ChatGPT 独立验收 **BLOCKED**（chatgpt.com 不可达）；待链路恢复派单，绑定被测 commit 完整 40 位 SHA。设计取舍（开关 vs 归属强校验）待 ChatGPT 规划复审确认——本实现两者均不破坏，后续可按裁定收紧。

## S4 修复 #3 新会话采集（设计就绪；实现 BLOCKED——需真实 chatgpt.com 往返验证，网络不可达）

- **BLOCKED 登记（2026-11-17 04:30）：** #3 根因 CONFIRMED（inbound_dom.mjs:97-99 固定 key 精确匹配 + 虚拟列表键漂移），但候选修复（首采前置视口拉高 1920×20000 / 标记文本归属定位回退）改的是派单链 fail-closed 核心路径（8 轮审查史的关键工具），必须有真实 `chatgpt.com` 往返才能验证不削弱门禁。当前 chatgpt.com 经代理与直连均 `http_code=000`（S1 已记），无法做真实验收。按 L-014/DEC-094"不自动授权真实任务开工"+ fail-closed 纪律：**不向核心采集路径写入未经真实验证的推测性改动**；沿用已实证有效的手工 recoll+视口前置拉高（L-018）作为现行规避，S4 待链路恢复后实现+验收。

- ①本步骤目标：把视口前置拉高前移到首采；采集定位支持标记文本归属/expectedUnitKeys 消除固定 key 漂移依赖；采集 fail-closed 时自动触发同会话 recoll（不重发）；保留既有 fail-closed 负例强度。
- ②修改文件：phase0/tools/gpt_dispatch.mjs、phase0/tools/inbound_dom.mjs / inbound_reply.mjs（如需）、phase0/tools/test_inbound_reply.mjs。
- ③修改内容：首采视口前置；标记文本/expectedUnitKeys 归属定位；自动 recoll 触发；负例（固定 key 漂移不误判、七查 fail-closed 仍拦）。
- ④执行结果：（待执行回填）。
- ⑤测试结果：（待执行回填：test_inbound_reply 24 既有+新增零回归）。
- ⑥验收证据引用：（待派单回填）。

## S5 交付（待验收）

- ①本步骤目标：整体合跑+交付登记+C1 绑定；申请"重新验收"确认三项收口（ChatGPT 明示 B 完成后重新验收再申请等级 B 试运行授权）。
- ②修改文件：delivery.md、task-brief.md、acceptance/。
- ③修改内容：交付七要素；被测 commit 绑定；合跑证据；后续建议（等级 B 试运行 Gate 立项）。
- ④执行结果：（待执行回填）。
- ⑤测试结果：（待执行回填：合跑计数）。
- ⑥验收证据引用：（待派单回填）。

## 返工记录表（首次 REJECT 时建表；按"同一问题"计数）

（无 REJECT 历史，暂不建表）
