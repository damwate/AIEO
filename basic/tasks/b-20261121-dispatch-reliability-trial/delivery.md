# 交付记录：b-20261121-dispatch-reliability-trial

## 1. 原始需求

用户 2026-11-21 指令（逐字）："派单可靠性整改的代码和回归测试在远端 fix/dispatch-reliability 分支，提交是 c8b3d04，尚未合入 main。后续的 b193989 只更新了项目进度文文档。你获取下最新进展，然后跟chatgpt讨论测试方案"。讨论节点产出试跑方案 R1（a51b8fa9）并获 ChatGPT 拍板"有条件通过"（DEC-119，reply SHA-256=`555f8fe55b984452602a8632d28799d6b8f211a10fab1336f8c39f838079eecd`）；试跑为下一节点（L-020 节点自主推进授权），本任务承载其执行与验收。

## 2. 最终实现内容（试跑执行与判定，被测=分支 c8b3d04，生产代码零修改）

| 项 | 触发 | 判定 | 核心证据 |
|---|---|---|---|
| T1b 归档自不一致预飞拦截 | 伪归档 session_id≠conversation_url | **PASS** | SESSION_TARGET_INVALID 发送前抛出；run.log 零导航；回执=NOT_SENT；指针 SHA 不变；dispatch-2026-11-20T17-25-01 |
| T1a 错页-重定向拦截（DEC-117 形态重放） | 自一致伪归档指向不存在 UUID | **PASS（四判据）** | SESSION_TARGET_MISMATCH 于 assertDispatchTarget 发送前抛出（页面已重定向至根）；回执停留 NOT_SENT；指针 SHA 不变；落点 DOM 零新增 user 单元（pre/post 机器可读对照）；dispatch-2026-11-20T17-28-21 |
| T2甲 SEND_CONFIRMED 后进程中断 | 外置回执轮询至 SEND_CONFIRMED 后 1s kill -9 | **PASS（五判据）** | 回执 SEND_CONFIRMED{session_id=6b0083e0-…,user_unit_key=fallback-turn-0:0:user}；成功 result.json 缺失；指针 SHA 不变；派单 1 次；会话仅 1 user 单元（T3 机器复核）；dispatch-2026-11-20T17-30-24 |
| T2乙 生成超窗自然采集失败 | 约 8000 字长回复简报 | **BLOCKED（未能构造，如实登记）** | 回复在 300s 生产窗口内完成（17:32:03→17:35:48），GENERATION_TIMEOUT 未触发；单次尝试不再重试；机制可控性另证（窗口常量+T0 活体 fail-closed 现场）；dispatch-2026-11-20T17-32-03（成功现场归档，新会话正向路径第二观察） |
| T3 原会话补采（绑 T2甲 回执） | recoll 只读补采 6b0083e0 会话 | **PASS（九查）** | marker 唯一+最后 user 断言+回执键形绑定（fallback-turn-0:0:user ↔ 物化 …:0:user）+静态 DOM 稳定+尾部 assistant+停止按钮消失；reply 6786B SHA-256=`7d2cafbed6ffb76b29eb6b0458cd012b0a9dce0f81a5d3422ed7acc00082215d`；recoll-trial-t3-2026-11-20T17-37-35-807Z |

**总判定：4 PASS + 1 BLOCKED（未能构造，非缺陷）。** 冻结执行序 T1b→T1a→T2甲→T2乙→T3 全程遵守，无失败项故无中止。

## 3. 修改文件（零生产代码修改）

| 文件 | 性质 | 说明 |
|---|---|---|
| phase0/tools/trial_dispatch_reliability_plan_r1.md | 新增（S1） | 试跑方案 R1（commit a51b8fa9，拍板依据） |
| phase0/tools/brief_trial_dispatch_plan_r1.txt | 新增（S1） | 讨论轮简报（1102B） |
| phase0/tools/recoll_trial_plan_r1.mjs / recoll_trial_t3.mjs | 新增 | L-018 补采驱动两件（三参数 grep 核对；后者含回执键形绑定） |
| phase0/tools/trial_t1a_dom_audit.mjs | 新增 | T1a 落点 DOM 前后对照审计 |
| basic/tasks/b-20261121-dispatch-reliability-trial/ | 新增 | 本任务包（requirement/steps/acceptance 构造件） |
| 生产代码（phase0/phase1/contracts/M1） | **零修改** | 试跑纯观测被测分支 c8b3d04 现场行为 |

## 4. 测试结果（与 DEC-118 开发自测分开登记）

DEC-118 开发自测（四审查入口 120 项+派单参数 16+入站 24+本地 Chrome 仿真 6）为纯函数/仿真证据；本任务全部为**真实 chatgpt.com 现场**证据（真实导航/真实发送/真实回执/真实补采）。两类证据不互替，审查方原话"试跑结论与开发自测分开登记，不能把本地 Chrome 仿真结果冒充真实 ChatGPT 试跑结果"已遵守。

## 5. 过程异常与如实登记

- **T1a r1 传输层失败（dispatch-2026-11-20T17-25-49）：** SakuraCat 代理 14281→1130 漂移（L-016 固化路径处置：注册表分协议解析→实测 200→重启调试 Chrome），goto ERR_CONNECTION_TIMED_OUT 未达拦截逻辑，零发送，另档保留不计入拦截证据。
- **libuv 退出断言工件：** T1b/T1a 派单进程异常退出阶段出现 `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING) (src\win\async.c:76)`——Windows/node 退出路径瞬态，不影响 fail-closed 结果与退出语义判定（run.log 致命错误行为准），移交后续任务评估。
- **T2乙 未构造成功：** 见上表；不再二次构造（裁定"不得反复延长或循环派单"）。
- **新会话产物：** T2甲/T2乙 各建一个一次性试跑会话（6b0083e0/6b008445），属试验构造非副作用；T1a 未产生副作用会话（零发送仅重定向回根）；无 DEC-010 处置项。

## 6. Git commit

被测 commit：`c8b3d042d61209f29c8cff48923e700c5a6b2980`（分支 fix/dispatch-reliability，全程未漂移；审查方独立比对确认领先 5 提交均无生产代码修改）；独立复核基线（S7 补录时点）`e8ff3d37c8e197aa2fcaf4104877f5608e16b7db`；本任务最终证据提交=本 delivery 所在 commit。

## 7. 独立复核结论（S7，2026-11-21）

- **独立复核通过**（ChatGPT，dispatch-2026-11-20T17-42-01 → recoll-trial-verify-r1-2026-11-20T17-47-55-116Z，reply 5548B SHA-256=`285b96bc61853333dc400a2539bab51b508c29bca641ad3a9bd9e08c1c7c231a`）：五项终判 T1b/T1a/T2甲/T3 PASS + T2乙 BLOCKED，与试跑判定一致；DEC-118 F06 真实试跑独立复核尾项**可以关闭**。
- **表述口径（审查方裁定，已遵守）：** 准确表述="4 项 PASS、1 项 BLOCKED（未能构造）；核心发送前拦截、发送确认留证和原会话补采链路通过；自然超时场景仍未获得真实触发证据"——**禁止写成"五项全部通过"**。
- **main 合并：** 审查方裁定**可提请用户拍板**（进入 DEC-010 人工审批准备阶段，非合并许可；未获用户明确批准不执行合并）。审批材料四收尾：S7 补录（本节）、如实列 4 PASS+1 BLOCKED、libuv 列独立遗留、最终完整 SHA 核对合并范围。

## 8. 未解决问题与后续建议

1. **T2乙 遗留（保留 BLOCKED，审查方明示不要求继续试跑）：** 自然超时路径未获真实触发证据；属覆盖范围限制非代码缺陷，不得改写为 PASS；如后续获授权可单次补造。
2. **libuv 退出断言（独立遗留，审查方裁定保留异常登记）：** T1b/T1a 退出阶段 `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING) (src\win\async.c:76)`；不推翻拦截结果，但不得断言无害、不得删除登记、不得包装为已修复；建议后续独立任务查因与影响面。
3. **main 合并（待用户拍板）：** 整改分支仍停留 fix/dispatch-reliability；DEC-010 红线=用户本人拍板；本任务不执行合并。
