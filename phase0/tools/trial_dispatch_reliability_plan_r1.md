# 派单可靠性整改·真实 ChatGPT 试跑方案 R1（供审查方拍板讨论）

- **被测代码：** 分支 `fix/dispatch-reliability`，整改提交 `c8b3d042d61209f29c8cff48923e700c5a6b2980`（docs 更新 `b193989c53f06e3e9f41db16028cf7715fba7e4b`）；本方案文件随该分支提交。
- **依据：** `docs/phase1/decision-log.md` §DEC-118（F06 验收边界：自动回归+本地仿真属开发自测；真实 ChatGPT 错页、现场 marker 回退、原会话补采待试跑后独立复核）；`basic/tasks/b-20261117-dispatch-reliability-fix/delivery.md` §7；`docs/PHASE-STATUS.md` v0.15（下一节点=智谱 Windows 试跑+独立复核）。
- **已完成开发自测（登记于 DEC-118）：** 四审查入口 120 项、派单参数 16 项、入站采集 24 项、本地 Chrome 仿真 6 项（错页零 Enter+marker 字段回读）。

## 试跑对象（c8b3d04 新能力清单）

1. `--session-result <result.json>`：既有会话派单绑定归档完整 UUID；归档内 session_id 与 conversation_url 不一致 → `SESSION_TARGET_INVALID` 发送前停止；绑定路径不写 reviewer 指针（`shouldUpdateReviewerPointer=false`）。
2. `assertDispatchPage/assertDispatchTarget`：Enter 前页面↔目标核对（新会话=根路径+无消息单元；既有会话=UUID 严格相等），不符 → `SESSION_TARGET_MISMATCH`。
3. send-state 回执链：`NOT_SENT`（启动）→ `SEND_ATTEMPTED`（Enter 前原子落盘，tmp+rename+flush）→ `SEND_CONFIRMED`（发送双验通过后，含 session_id+user_unit_key）；`AIEO_DISPATCH_SEND_RECEIPT` 可外置回执路径。
4. 未决发送暂停：仅明确未发送自动重试；发送双验未过/UNCERTAIN 挂起查证，不盲目重发。
5. `extractSessionId/sessionIdIsAttributable` 硬化（严格 UUID 正则、小写归一、支持 `/g/<id>/c/` 路径）；`request.txt` 归档未裁剪原文（字节级 marker 匹配基础）。
6. 四审查入口（review/arch_review/engineering_audit/test_acceptance）重派判断同步+回归 120 项。

## 试跑项与验收判据

| 项 | 触发方式 | 期望证据（全记录于 dispatch 证据目录） |
|---|---|---|
| T0 正向观察 | 讨论轮派单本身：`--session-result` 绑定审查会话 6aff4117 归档 | send-state.json 三态齐全；SEND_CONFIRMED 含 session_id+user_unit_key；reviewer 指针 SHA 发送前后不变 |
| T1a 错页-重定向（DEC-117 形态重放） | `--session-result` 指向伪造归档：conversation_url 为不存在 UUID（合法格式） | `SESSION_TARGET_MISMATCH` 退出非零；回执停留在 NOT_SENT（永不到 SEND_ATTEMPTED=零 Enter）；派单次数=1；指针 SHA 不变；重定向落点（副作用会话，如有）零新增 user 单元并登记留置 |
| T1b 归档自不一致 | 归档内 session_id≠conversation_url | 发送前 `SESSION_TARGET_INVALID`；零导航即停；回执=NOT_SENT |
| T2 发送双验后采集失败 | 发送双验通过后人为令采集失败（触发方式待拍板，见问题①） | 回执=SEND_CONFIRMED（session_id+user_unit_key 留证）；result.json 无成功状态或缺失；不重发（派单次数=1）；指针 SHA 不变 |
| T3 原会话补采 | 对 T2 原会话 recoll 只读补采；三参数全新（CONV_UUID+SENT_USER_UNIT_KEY+FAILED_DIR，SENT_USER_UNIT_KEY 取自 T2 回执） | 回复完整取回，reply SHA256 落盘对账；补采过程零发送（recoll 只读）；按派单次数/指针写入/归档字段三对照登记结论 |

T2 触发方式候选：
- **甲（进程中断）：** 轮询 send-state.json 出现 SEND_CONFIRMED 后立即 kill 派单进程——确定性最高，精确构造"发送已确认、采集失败"形态，与回执链语义完全对齐；
- **乙（自然超窗）：** 简报要求超长回复使采集窗口自然耗尽——贴近 L-018 真实事故形态，但耗时不定、且窗口参数可能随会话长度自适应，失败点不够精确。

## 安全红线

- 全部简报一次性、非敏感、首行 `[TRIAL-Tx|…]` 标记；全程 `--no-update-pointer`（T0 走绑定路径本身亦不写指针）。
- 任一门失败即停留证，禁止重试循环；副作用会话只登记留置（删除属 DEC-010 数据删除类，交用户拍板）。
- 全程分支代码执行；结论登记 decision-log 新 DEC；拟建 `b-20261121-dispatch-reliability-trial` 任务包承载试跑验收记录（ST-05 随包走）。

## 提请审查方拍板（讨论轮四问）

1. **T2 触发方式：** 甲（进程中断，确定性强）vs 乙（自然超窗，贴近真实事故形态）——采何者，或两者都跑？
2. **T1 变体取舍：** T1a（重定向，真实错页路径）与 T1b（归档自不一致，预飞拦截）都跑，还是只跑 T1a？
3. **T1a"零 Enter"证据强度：** 回执停留 NOT_SENT + 指针 SHA 不变之外，是否强制要求重定向落点 DOM 单元数对照（零新增 user 单元）？
4. **登记与任务包：** 试跑结论登记新 DEC + 新建 b-20261121 试跑任务包——是否同意？
