# 需求原文：派单可靠性整改·真实 ChatGPT 试跑（DEC-118 F06 验收边界闭环）

- 任务ID：b-20261121-dispatch-reliability-trial
- 日期：2026-11-21
- 立项依据：DEC-118（F06 验收边界：自动回归+本地 Chrome 仿真属开发自测，真实 ChatGPT 错页拦截、现场 marker 回退、原会话补采待试跑后独立复核）+ DEC-119（试跑方案 R1 ChatGPT 拍板"有条件通过"，执行序冻结）+ 用户 2026-11-21 指令"获取最新进展，然后跟 chatgpt 讨论测试方案"（讨论节点已闭环，试跑为下一节点，按 L-020 节点自主推进授权执行）。

## 需求原文（用户指令，逐字不加工）

> "派单可靠性整改的代码和回归测试在远端 fix/dispatch-reliability 分支，提交是 c8b3d04，尚未合入 main。后续的 b193989 只更新了项目进度文文档。你获取下最新进展，然后跟chatgpt讨论测试方案"

## ChatGPT 拍板结论（DEC-119 reply，原文归档 phase0/logs/recoll-trial-plan-r1-2026-11-20T17-18-20-595Z/reply.txt，SHA-256=555f8fe55b984452602a8632d28799d6b8f211a10fab1336f8c39f838079eecd）

> 最终拍板：①甲乙都跑；②T1a、T1b 都跑；③强制 DOM 零新增对照；④同意新 DEC 和任务包。
> 执行序：T1b → T1a → T2甲 → T2乙 → T3，按顺序执行；乙若无法稳定构造，如实记录。
> 边界：本轮是方案裁定，不代表试跑已经执行，也不代表试跑结果 PASS。

## 试跑范围（五项，按冻结执行序）

1. **T1b 归档自不一致预飞拦截**：归档内 session_id≠conversation_url → SESSION_TARGET_INVALID，零导航即停，回执=NOT_SENT。
2. **T1a 错页-重定向拦截（DEC-117 形态重放）**：自一致归档指向不存在 UUID → 真实导航落点被拦截，Enter 前停止，回执停留 NOT_SENT，重定向落点 DOM 零新增 user 单元（四项独立证据）。
3. **T2甲 发送双验后进程中断**：SEND_CONFIRMED 回执出现后立即 kill 派单进程 → 回执留证（session_id+user_unit_key）、无成功 result.json、不重发。
4. **T2乙 生成超窗自然采集失败**：长回复简报使生成超出 GENERATION_TIMEOUT_MS=300000 → GENERATION_TIMEOUT 路径触发；若窗口内完成则如实记录"未能构造"（单次尝试，禁循环）。
5. **T3 原会话补采**：对 T2甲 原会话 recoll 只读补采，绑定 T2甲 回执 SENT_USER_UNIT_KEY（与物化 marker 定位单元做键形对照登记），reply SHA256 落盘对账。

## 边界约束

- 被测代码=分支 fix/dispatch-reliability 提交 c8b3d042d61209f29c8cff48923e700c5a6b2980（含 a51b8fa9 方案文档提交；试跑期间生产代码零修改）。
- 全部简报一次性、非敏感、首行 [TRIAL-*|…] 标记；全程 --no-update-pointer/--session-result 绑定语义（均不写 reviewer 指针）。
- 任一项 FAIL/BLOCKED 即停留证，不以其他项通过抵消，不进入后续项；禁止重试循环。
- 副作用会话只登记留置（删除属 DEC-010 数据删除类，交用户拍板）。
- 试跑结论与开发自测（DEC-118 四组数字）分开登记；本地仿真不得冒充真实试跑。
- T2乙 超时窗口=生产默认 300000ms，不调 env 缩窗（保持生产形态；构造失败则如实记录）。
- 试跑完成后登记新 DEC（DEC-120）并交 ChatGPT 独立复核（DEC-118 F06 尾项）。
