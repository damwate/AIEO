# 需求原文：Instance/Conversation Queue Service 设计（DEC-134 立项，设计先行）

- 任务ID：b-20261121-instance-conversation-queue
- 日期：2026-11-21
- 立项依据：DEC-134（Queue Service 立项 PASS，第一轮只做设计八件，设计过审才编码）+ 用户指令"如有必要，专门做一个管理窗口和聊天的队列服务也行，这些都可以跟GPT讨论"+ 用户架构指令"并行任务都是单独的子agent处理，当前会话作为中控管理整体"。

## ChatGPT 裁定（DEC-134，reply SHA-256=84740406635d86cf114c9eade29806376dcd69c25d817e74bc65e4ef7cd6f00e）

第一轮交付八件：①Queue Service 架构设计；②Instance/Task/Execution 三类核心数据契约；③任务状态机与异常状态转换表；④C9、C6 接口关系；⑤人机验证识别及人工处置方案；⑥实例池容量、并发限制和克隆约束；⑦Bash 迁移方案及回滚方案；⑧分阶段验收标准。设计经审查后才能编码。最终原则：实例池管窗口、队列管任务、C9 管门禁、C6 管证据、GPT 管审查决策；人机验证=必须能识别/暂停/记录/人工恢复的系统状态。

## 设计硬约束（含用户 2026-11-21 追问固化的 profile 生命周期不变量）

1. **Profile 生命周期不变量（用户追问"清理会不会清掉登录信息"查证后固化）：** 自清理=仅终止 Chrome 进程（Stop-Process），**永不删除/修改 profile 目录**——登录信息随目录持久保留（实证：default profile 历经数十次清理循环数日保持登录；agent-a/b 克隆后经多轮清理用户肉眼确认仍登录）。浏览器关闭顺序=browser.close()（优雅，cookie 落盘）→killProfileChrome（兜底孤儿进程）。Queue 设计必须把"profile 目录只增不删（删除=DEC-010 另批）"作为硬不变量写入。
2. 侧栏账号级共享：CONV_UUID 精确导航为必须，禁"最新一条"启发式（C4 实测）。
3. C9 启动门/实例锁/一轮一会话/失败即弃：全部保持既有裁定语义。
4. 人机验证四态判定器（DEC-134）：NORMAL/VERIFICATION_SUSPECTED/ACCOUNT_VERIFICATION_REQUIRED/UNKNOWN_BLOCK_PAGE，人工恢复后才复派。

## 边界

- 本任务第一轮=设计八件交付，不含编码；设计交 ChatGPT 审查通过后才进入编码轮。
