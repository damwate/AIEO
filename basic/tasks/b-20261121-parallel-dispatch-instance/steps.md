# 步骤清单：b-20261121-parallel-dispatch-instance

- 被测基线：main 81812dd（DEC-122 合入后 tip）；本任务实现于分支 fix/parallel-dispatch-instance，生产默认行为逐字节不变（C7）。
- 方案依据：DEC-123 PARA-R1 有条件通过（reply SHA-256=513e4d68746be70e167486f004d1988268d96082ee014c474a890cf6ff09ad11）+ 用户"开工"指令（2026-11-21）+ 用户补充授权"做完整个 DEC-123 之前都可以给 chatgpt 拍板，要我拍板的留到 11 点一起处理"。
- 阶段1范围：实现+本地回归，不碰真实 ChatGPT 并发；阶段2（N=2 真实并发）届时单独授权。

## S1 方案与授权（完成）

- ①本步骤目标：PARA-R1 方案落仓+评审拍板，固化实例域架构与六问裁定。
- ②修改文件：phase0/tools/parallel_dispatch_arch_r1.md、brief_parallel_arch_r1.txt。
- ③修改内容：P1-P5 设计+C1-C6 矩阵+分阶段授权建议+六讨论问。
- ④执行结果：方案提交 6376628b005009d8131c93571e0413d569a92282 推送；讨论派单 dispatch-2026-11-20T18-19-39（采集 fail-closed INBOUND_WINDOW_OVERLAP_CHANGED——L-018 家族新变体，禁重发）→ L-018 补采 recoll-parallel-r1-2026-11-20T18-23-58-833Z 八查全过；拍板 reply 9933B SHA-256=513e4d68746be70e167486f004d1988268d96082ee014c474a890cf6ff09ad11；登记 DEC-123。
- ⑤测试结果：不适用（方案步）。
- ⑥验收证据引用：phase0/logs/dispatch-2026-11-20T18-19-39/、recoll-parallel-r1-2026-11-20T18-23-58-833Z/（reply SHA-256=`513e4d68746be70e167486f004d1988268d96082ee014c474a890cf6ff09ad11`）、decision-log §DEC-123；**验收结论：PASS（方案有条件通过，六问全裁定）**。

## S2 实例域纯函数层（PASS）

- ①本步骤目标：--instance 解析+严格校验（防路径穿越/大小写歧义）+default 逐字节兼容+端口分配纯函数+指针单写者守卫+进程精确归属判定/脚本生成。
- ②修改文件：phase0/tools/dispatch_options.mjs（+INSTANCE_ID_PATTERN/normalizeInstanceId/deriveInstancePaths/allocateInstancePort/assertPointerWriterAllowed/matchesProfileOwnership/buildKillProfileScript；parseDispatchOptions 增 --instance）。
- ③修改内容：instance ID 校验正则 [a-z0-9][a-z0-9-]{0,31}+小写规范化；default 锁=gpt-session.lockfile/profile=gpt-poc/端口=9222（C7 逐字节）；命名实例锁=gpt-session-<ID>.lockfile/profile=gpt-poc-<ID>/端口走注册表（候选 9300-9399，探测碰撞检查，已登记稳定返回，耗尽 INSTANCE_PORT_EXHAUSTED）；非 default 实例写共享 reviewer 指针→POINTER_SINGLE_WRITER_VIOLATION fail-closed；进程归属=--user-data-dir 精确 token 匹配（大小写不敏感，禁子串通配——gpt-poc-a vs gpt-poc-a2 前缀碰撞负例）。
- ④执行结果：实现完成；测试 test_instance_config.mjs（现 24 项，R1/R2/R3 整改扩容）（ID 校验/C7 兼容/派生映射/parse 正负例/端口分配 5 型/指针守卫 3 态/进程归属正负例/清理脚本生成断言/实例锁域隔离+同锁互斥两条 OS 级负例）终态 **24/24 PASS**（初版 16→R1 整改 22→R2 整改 23→R3 整改 24（非普通对象原型约束）；phase0/logs/instance-config-tests.json）。
- ⑤测试结果：node --check 双文件语法 OK；冒烟全过。
- ⑥验收证据引用：phase0/tools/test_instance_config.mjs；phase0/logs/instance-config-tests.log；本步无独立派单（实现步），任务关联派单现场 dispatch-2026-11-20T18-19-39（S1 方案评审，reply SHA-256=`513e4d68746be70e167486f004d1988268d96082ee014c474a890cf6ff09ad11`）；**验收结论：PASS**。

## S3 gpt_dispatch 接线（PASS）

- ①本步骤目标：锁路径/端口/profile 四件套实例化+启动端口归属核验+清理脚本精确化+实例域留证。
- ②修改文件：phase0/tools/gpt_dispatch.mjs。
- ③修改内容：INSTANCE 派生+PROFILE_DIR/DEBUG_PORT/CDP_URL 实例域化（default 逐字节=C7）；acquireSessionLock 传 lockPath+holder 带 instance 后缀；mainLocked 内命名实例端口分配（注册表锁内 读→并发探测→分配→原子写，instance-ports.json 损坏 fail-closed INSTANCE_REGISTRY_INVALID）；startChromeWithDebugPort 复用前归属核验（CDP 活但无本实例 profile 进程→INSTANCE_PORT_FOREIGN fail-closed）；killProfileChrome 换 buildKillProfileScript（own/foreign/remaining 三计数留证，归属不明不杀）；result.json 增 instance_id/instance_lock_path/instance_debug_port/instance_profile_dir；run.log 实例域行留证；指针守卫置于浏览器操作前。
- ④执行结果：实现完成；recoll 驱动同锁路径纪律登记于任务书（派单与补采同实例 ID 同锁路径——DEC-123 ①边界3；现有 recoll 驱动均 default 域）。
- ⑤测试结果：phase0 统一回归 **11/11 PASS**（schemas/inbound-reply/dispatch-binding/instance-config/m1-registry/m1-concurrency/browser-virtual-list/git-pointer/completion-judge/greet/session-lock-v6；evidence third-round-regression-2026-11-20T18-34-42）；C7 证明=不传 --instance 时全部既有测试零回归。
- ⑥验收证据引用：phase0/logs/third-round-regression-2026-11-20T18-34-42/result.json；本步无独立派单（实现步），任务关联派单现场 dispatch-2026-11-20T18-19-39（S1 方案评审，reply SHA-256=`513e4d68746be70e167486f004d1988268d96082ee014c474a890cf6ff09ad11`）；**验收结论：PASS**。

## S4 M1 登记并发核查（DEC-123 ⑥ 硬门槛；PASS）

- ①本步骤目标：registerArtifactWithRetry 并发安全性五查（同 artifact 并发登记/共享状态竞争/重试重复登记/部分写入覆盖丢失/失败恢复无副作用）。
- ②修改文件：无（核查步，零代码改动）。
- ③修改内容：代码级审计 m1_artifact_registry.mjs（331 行全读）。
- ④执行结果（五查结论）：①同 artifact 并发登记→`acquireRegistryLock`（按登记簿路径 OS 句柄锁+60s 有界重试，:110-127）串行化临界区（读→幂等检查→序号→写），并发同 artifact=精确幂等键命中→DUPLICATE 不新增记录；②共享文件竞争→OS 句柄锁+`writeRegistryAtomic`（临时文件 pid+ts→回读验证→rename→提交后二次回读，:52-72）；③重试重复登记→幂等键精确匹配返回 DUPLICATE，身份三 ID 同 hash 不同→M1_ARTIFACT_HASH_CONFLICT 拒复用旧记录（:157-167）；④部分写入/覆盖/丢失→原子写双回读；登记簿损坏→M1_REGISTRY_READ_FAILED fail-closed 拒按空簿继续（:33-40）；⑤失败恢复→M1_INJECTED_FIRST 故障注入在读取前触发，重试同 artifact→RECOVERED/DUPLICATE，gpt_resend_count 恒 0（不重触发 GPT），CLI 还验证发送双验计数前后不变。登记簿路径=共享全局（phase0/logs/m1-artifact-registry.json），跨实例并发登记由登记簿锁串行——共享账本语义正确。
- ⑤测试结果：既有 test_m1_artifact_registry.mjs+test_m1_concurrency.mjs（多真实进程：OS 锁/序号唯一/幂等/hash 冲突）随统一回归 **PASS**；未发现需整改项，未知状态已消除（硬门槛满足）。
- ⑥验收证据引用：phase0/tools/m1_artifact_registry.mjs（行号见④）；phase0/logs/third-round-regression-2026-11-20T18-34-42/；本步无独立派单（核查步），任务关联派单现场 dispatch-2026-11-20T18-19-39（S1 方案评审，reply SHA-256=`513e4d68746be70e167486f004d1988268d96082ee014c474a890cf6ff09ad11`）；**验收结论：PASS**。

## S5 四腿回归与环境伪影诊断（PASS）

- ①本步骤目标：四审查入口回归零回归确认；组合跑异常定位与如实登记。
- ②修改文件：无（Python 零改动）。
- ③修改内容：不适用。
- ④执行结果：四腿逐模块 `python -I -m unittest discover` **34+30+25+31=120 项全 OK**（exit=0，phase0/logs/leg-rerun-instance/）。组合单进程跑曾出现 1F+7E/1E 波动——**根因定位=环境伪影非代码回归**：当前 shell 含 PYTHONUTF8=1（UTF-8 模式），非隔离跑下 subprocess text=True 按 UTF-8 解码 tasklist 的 GBK 输出（0xd0 起始字节）→UnicodeDecodeError→stdout=None→test_19 TypeError；`-I` 忽略环境变量→cp936→全过（实测对照：python -c utf8_mode=1 preferred=utf-8 vs python -I utf8_mode=0 preferred=cp936）。与手册 §8.1 Windows 编码坑同族；EGO-LITE 手册纪律"Python open 默认 GBK 加 encoding"的进程级变体。
- ⑤测试结果：canonical 跑法（-I 逐模块）120/120；组合跑伪影如实登记不隐瞒；本任务 JS 改动与 Python 零交集，回归与改动无因果。
- ⑥验收证据引用：phase0/logs/leg-rerun-instance/{test_review_leg,test_arch_review_leg,test_engineering_audit_leg,test_test_acceptance_leg,combined}.log；本步无独立派单（本地回归步），任务关联派单现场 dispatch-2026-11-20T18-19-39（S1 方案评审，reply SHA-256=`513e4d68746be70e167486f004d1988268d96082ee014c474a890cf6ff09ad11`）；**验收结论：PASS（120/120；组合跑伪影=环境编码，移交测试卫生备忘）**。

## S6 交付登记与独立验收（进行中）

- ①本步骤目标：delivery 成文、DEC-124 登记、ST-05 终检、推送、交 ChatGPT 独立验收（阶段1 完成判定）。
- ②修改文件：delivery.md、docs/phase1/decision-log.md、docs/PHASE-STATUS.md、本 steps.md。
- ③修改内容：阶段1 完成判定表+遗留移交（阶段2 授权/N=3/测试卫生备忘）。
- ④执行结果：delivery.md 成文；DEC-124 登记；ST-05 终检 6/6 PASS；分支 fix/parallel-dispatch-instance 推送；独立验收派单至审查会话（--session-result 绑定，采集 fail-closed 即 L-018 补采）。用户补充授权（2026-11-21）："做完整个DEC-123之前都给chatgpt拍板，要我拍板的留到11点一起处理"——main 合并属 DEC-010 已入攒单队列。
- ⑤测试结果：汇总=16/16 新负例+11/11 phase0 统一回归+120/120 四腿（canonical -I 逐模块）；组合跑编码伪影如实登记（PYTHONUTF8=1 机制，非代码回归）。
- ⑥验收证据引用：独立验收派单现场+reply SHA（验收后回填至 DEC-124）；**验收结论：PASS（阶段1 实现+本地回归完成，独立验收见 DEC-124）**。

## S7 验收整改轮（R1 FAIL→R2 复验→R3 复验→R4 终验轨迹；终签见 S8）

- ①本步骤目标：消化验收 R1 三项（P1-1/P1-2/recoll 同锁）与 R2 复验两项遗留（P1-2 数组绕过/recoll readFileSync 缺失），达成阶段1 最终 PASS。
- ②修改文件：dispatch_options.mjs（decidePortReuse/validatePortRegistry+数组拒绝）、gpt_dispatch.mjs（决策函数接线+注册表外层校验加严）、review_leg_recoll_template.mjs（INSTANCE_ID 派生+注册表端口解析+lockPath+readFileSync 补导）、review_leg.py（--dispatch-instance 贯通 ctor/derive/头断言）、test_instance_config.mjs（终态 24 项）、test_review_leg.py（test_20 文本断言+test_21 真跑验证）。
- ③验收 R1（dispatch-2026-11-20T18-53-31→recoll-instance-r1-…，reply SHA-256=9ef11dfa9c69c65f0012ef0d45fe84684b43353a625582716edbcc9f241a1849）：FAIL——P1-1 归属查询 null 放行（fail-open）、P1-2 注册表未逐项校验、recoll 同锁未闭合；审查方认可其余 8 项 PASS（ID 校验/C7 兼容/端口哈希仅候选/进程精确归属/映射留证/M1 五查/C8 本地/绑定）。R2（dispatch-2026-11-20T19-17-44→recoll-instance-r2-…，reply SHA-256=1db00a651569fe1c…全值见 result.json）：P1-1 PASS；P1-2 FAIL（数组形 ports 绕过——Object.entries([9301])→["0",9301] 溜过正则）；recoll FAIL（readFileSync 缺失=真跑必 ReferenceError，test_20 仅文本断言的盲区）；另要求交付证据数字同步（本节即同步）。
- ④R2 整改执行：P1-2=validatePortRegistry 入口拒绝数组/非映射+default 实例禁登记（我方测试还抓出 R2 建议外的同族缺口——default 实例名匹配正则漏过，已同批修复）；recoll=补 readFileSync 导入+日志行打印实际解析端口（cdp=URL）供真跑断言；test_21=命名实例真跑三态（注册表存在→解析 9301+同锁路径行；缺失→INSTANCE_REGISTRY_MISSING；default→9222），注册表备份/恢复防污染。
- ⑤测试结果：instance-config **24/24**（R3 整改后 19-38-48）；phase0 统一回归 **11/11**（19-39-06）；四腿 **36+30+25+31=122 项全 OK**（canonical -I 逐模块；test_21 的 subprocess 显式 encoding=utf-8+errors=replace——手册 §8.1 纪律，环境无关）。
- ⑥验收证据引用：本步无独立派单（整改步），任务关联派单现场 dispatch-2026-11-20T18-53-31（R1）/19-17-44（R2），reply SHA 见③；**验收结论：R3 已完成（数组拒绝 PASS/recoll 真跑 PASS，余非普通对象边界移交 S8）**。

## S8 验收 R3/R4 终验轮（进行中）

- ①本步骤目标：消化 R3 唯一遗留（非普通对象边界）与 R4/R5 唯一遗留（文档一致性），达成阶段1 最终 PASS。
- ②修改文件：dispatch_options.mjs（validatePortRegistry 普通对象原型约束+getPrototypeOf null 顺序守卫）、test_instance_config.mjs（+4 负例）、delivery.md（证据同步 assert 化）、本文件（数字订正即本条）。
- ③验收轨迹（如实）：R3（dispatch-2026-11-20T19-33-39→recoll-instance-r3-…，reply SHA-256=1b068a621caf79865ed2e3eaedd4b206742c42defd793bbec545b7b8eaf7861e）=P1-2 数组拒绝 PASS/P1-1 无回归 PASS/recoll 真跑 PASS，仅余 Map/Date 边界；R4（dispatch-2026-11-20T19-40-00→recoll-instance-r4-…，reply SHA-256=8b9f6922623d5a978634b755e04eb8a49f0a3a97d486db33568117dcab67b996）=原型约束 PASS/负例 PASS/delivery 同步 PASS，仅余本文件旧数字（本条订正）。
- ④执行结果：24/24+11/11+122 项维持；代码仅校验函数与测试改动，四腿路径未动（R4 审查方确认不要求重跑）。
- ⑤测试结果：instance-config 24/24；phase0 11/11（19-39-06）。
- ⑥验收证据引用：R4 现场 dispatch-2026-11-20T19-40-00、recoll-instance-r4-2026-11-20T19-42-23-594Z；本步无独立派单；**验收结论：待 R5 终签（审查方明示"收口后即可签署阶段1最终 PASS"）**。
- ⑤R5 补记：R5（dispatch-2026-11-20T19-43-30→recoll-instance-r5-…，reply SHA-256 全值见 result.json）指出本文档残留旧口径（本条所在轮次已逐项订正：§S2 现 24 项/§S7 标题与⑥状态/§S8 R4 全 SHA）与 delivery §2 旧数字（已同步）；R5 后仅余本文档一致性，R6 定点复核。
