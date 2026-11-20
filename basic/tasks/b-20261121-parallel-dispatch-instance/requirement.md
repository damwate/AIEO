# 需求原文：多 Agent 并行派单·实例域实现（阶段1：实现+本地回归）

- 任务ID：b-20261121-parallel-dispatch-instance
- 日期：2026-11-21
- 立项依据：DEC-123（PARA-R1 有条件通过规划评审，授权边界=允许独立任务包规划+方案复审；本轮不授权改码的边界由用户"开工"指令+DEC-123 阶段1 授权解除——阶段1 范围=实现+本地回归，不碰真实 ChatGPT 并发）+ 用户 2026-11-21 指令"开工"。

## 需求原文（用户指令，逐字不加工）

> "开工"
> （前序拍板上下文："你跟chatgpt讨论看看能否解决，能解决的话，标准版差不多就能用了"、"初级版只能处理1个任务，这种中级版同时处理多个任务，中级版又能提高一大截生产力"）

## ChatGPT 拍板结论（DEC-123 reply，归档 phase0/logs/recoll-parallel-r1-2026-11-20T18-23-58-833Z/reply.txt，SHA-256=513e4d68746be70e167486f004d1988268d96082ee014c474a890cf6ff09ad11）

PARA-R1 有条件通过：①锁粒度=实例域+三边界（ID 严格校验防穿越/锁保持 fail-closed/派单与 recoll 同实例同锁路径）；②N=2 起步（本任务不涉及）；③killProfileChrome 精确归属+加严（规范化路径+完整启动参数识别+归属不明不杀+清理后核对+端口碰撞检查）；④DEC 登记 FIFO 合并期人工对齐；⑤C1-C6+补充 C7 默认兼容/C8 资源碰撞异常退出/C9 账号级风控协调（C9 属阶段2 试跑范畴）；⑥M1 并发核查纳入且为 N=2 前硬门槛（本任务完成核查，阶段2 前保持有效）。

## 本任务范围（阶段1）

- S2 实例域纯函数层：--instance 解析+normalizeInstanceId 严格校验+deriveInstancePaths（default 逐字节=C7）+allocateInstancePort 端口注册表碰撞检查+assertPointerWriterAllowed 指针单写者守卫+matchesProfileOwnership/buildKillProfileScript 进程精确归属。
- S3 gpt_dispatch 接线：锁路径/端口/profile 四件套传递+启动时端口归属核验（CDP 活但非本实例 profile→fail-closed）+成功路径清理收敛+run.log/result.json 实例域留证。
- S4 M1 登记并发核查（DEC-123 五查，代码级审计+既有 test_m1_concurrency 多进程证据；结论=N=2 前硬门槛已满足）。
- S5 本地回归：新增负例测试+既有全量回归零回归（dispatch-binding/inbound-reply/m1×2/四腿 120 项等）。
- 阶段2（N=2 真实并发试跑）与 C9 账号级风控协调实现**不在本任务**（届时单独授权）。

## 边界约束

- 生产默认逐字节不变（C7：不传 --instance=default 行为=原行为）。
- 不碰真实 ChatGPT 并发；全部验证=本地纯函数/锁/进程编排负例。
- reviewer 指针保持单写者：非 default 实例禁止写共享指针（fail-closed 守卫）。
