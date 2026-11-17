# 任务书：派单链可靠性缺陷清理（#3/#4/#7）

- 任务ID：b-20261117-dispatch-reliability-fix
- 日期：2026-11-17

## 版本选型

- 选定版本：Basic（作业流程=WORKFLOW v0.3；工作产品=phase0/tools 派单公共工具 + phase1/tools 审查腿脚本的可靠性修复）
- 任务等级：S2（按风险定：涉及派单链采集/指针写盘/并发锁，工具自身缺陷修复，ST-06 允许在拍板边界内修被测工具）
- 选型理由：DEC-094 ChatGPT 拍板 B 项；纯工具链修复，无平台运行时/冻结契约变更；Basic 首期"文档优先、少量脚本、人工可跑"。
- 批准人/日期：ChatGPT 会务拍板（DEC-094，2026-11-17）+ 用户 2026-11-17 授权；DEC-010 红线仍用户本人。

## 执行落点

- 目标仓库：damwate/AIEO（本地 d:/AIEO，远程 https://github.com/damwate/AIEO.git）
- 目标分支：main（任务登记流；每步完成后单独 commit，不合并、不发布）
- 工作目录：d:/AIEO
- 基线 commit：ee76a34ac5fb73d7e0fce6369060323c7f7a5016（开工前生产代码树逐字节一致已核）

## 需求原文

见 requirement.md（用户指令逐字 + ChatGPT 拍板 DEC-094）。

## 执行者理解（与原文分开，便于对账）

三项缺陷根因已由只读调查坐实（带文件行号，见 steps.md S1 设计证据）：

### #3 新会话采集缺陷（CONFIRMED）
- 抛出点：inbound_dom.mjs:120-125（findStartIndex<0 且 at_top）、inbound_reply.mjs:126-130/224-225/262-267。
- 根因：新会话首派 user key=`fallback-turn-0:0:user`（gpt_dispatch.mjs:242-262 发送双验捕获），采集时以该固定字符串精确匹配（inbound_dom.mjs:97-99）。ChatGPT 虚拟化列表按滚动位置动态生成/重排 `fallback-turn-N:*` 键，确认窗后起点被裁出→精确匹配失败；这是设计上的 fail-closed，非误判。
- 有效恢复：禁重发 + CDP 视口拉高 1920×20000 全量物化 + 标记文本归属校验补采（recoll 驱动）。
- 修复方向：把视口前置拉高从"补采专用"前移到首采；采集定位支持标记文本/expectedUnitKeys 而非仅固定 key；失败时自动触发同一会话的 recoll（不重发）。

### #4 `--new-session` 指针覆盖缺陷（事故 CONFIRMED，机制 HYPOTHESIS 偏 CONFIRMED）
- 无条件覆盖点：gpt_dispatch.mjs:375-390，发送后轮询 page.url() 命中即写 REVIEWER_SESSION（line 42）。
- 事故实证：dispatch-2026-11-16T17-03-07/wrong-session-record.json（错误 URL=`6afb304c…`）；DEC-088（误发实战会话一次）、DEC-093 遗留④（两次复现）。
- 机制：attachPage()（gpt_dispatch.mjs:151-161）不传 conversationUuid，pickChatGptPage（tab_hygiene.mjs:50-59）无 uuid 时取 chatgpt[0]；多页 context 下可能复用/捕获错误页 URL。
- 修复方向：`--new-session` 写指针前提供显式开关（如 `--no-update-pointer`）或新会话强制 ctx.newPage()+校验会话从无到有；把事故复现固化为集成负例。

### #7 mtime 同型隐患 + 并发锁缺口（CONFIRMED）
- mtime：review_leg.py:500-508 严格 `>= since` 无 2.0s 容差、无 brief_bytes（并发按 mtime 串单）；arch_review_leg.py:367-389 有 brief_bytes 但无容差；已修参照 test_acceptance_leg.py:458-484（since-2.0 + brief_bytes）+测试 test_31。
- 并发锁：review_leg.py 全文无 RunKeyLock（run/resume/attach_reply 均无锁）；arch_review_leg.py:98-139 与 test_acceptance_leg.py:119-155 已有 RunKeyLock。
- 修复方向：两腿 `_find_dispatch_dir` 同构对齐（2.0s 容差+brief_bytes）；review_leg.py 按 D2 同构复制 RunKeyLock 包裹 run/resume/attach_reply；补 mtime 负偏确定性用例+并发锁负例。

## 验收目标

- 每缺陷至少一条确定性回归测试（负例命中目标层）+ 既有测试零回归：
  - #3：新会话首采视口前置后能稳定物化定位；固定 key 漂移时走标记归属定位不误判；六/七查 fail-closed 负例仍过。既有 test_inbound_reply.mjs（24 用例）、test_tab_hygiene.mjs（21 用例）零回归。
  - #4：`--no-update-pointer`（或等价）下 reviewer 指针不被 `--new-session` 覆盖；多页 context 选错页被拒写；既有 test_tab_hygiene.mjs 零回归。
  - #7：两腿 mtime 容差 1s 内定位/3s 外拒判确定性；review_leg.py 并发锁竞争实测（跨进程）；三腿各自测试（test_review_leg.py 29 / test_arch_review_leg.py 29 / test_test_acceptance_leg.py 31）零回归。
- 合跑：三腿+入站集全绿（基线 89 用例 + 新增）。
- 每步交 ChatGPT 独立验收，绑定被测 commit 完整 40 位 SHA。
- ST-05 检查器自检无 FAIL；不触碰 DEC-010；被测基线 ee76a34 不漂移。

## 优先级：高（阻塞等级 B 受控试运行）

## 任务状态（随进度更新）

| 字段 | 值 |
|---|---|
| 当前状态 | 阻塞 |
| 当前步骤 | S1（最早未获独立验收的步骤；S1/S2/S3 本地工作已完成但独立验收 BLOCKED，S4 待网络恢复实现+验收）。阻塞原因=#3 实现需真实 ChatGPT 往返验证但 chatgpt.com 经代理/直连均不可达（http_code=000，2026-11-17 04:14/04:30 两次探测）；无任何步骤取得 PASS 验收结论，故当前步骤仍为 S1 |
| 最终结果 | （未定；阻塞不是结论） |
