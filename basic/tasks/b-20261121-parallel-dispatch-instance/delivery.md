# 交付记录：b-20261121-parallel-dispatch-instance

## 1. 原始需求

用户 2026-11-21 指令（逐字）："你跟chatgpt讨论看看能否解决，能解决的话，标准版差不多就能用了"→方案 PARA-R1 有条件过评（DEC-123）→"开工"→补充授权："在做完整个DEC-123之前，你可以都给chatgpt拍板，如果chatgpt说要我拍板的，先留着我11点一起处理"。

## 2. 最终实现内容（阶段1：实例域，生产默认逐字节不变）

- **S2 纯函数层（dispatch_options.mjs）：** `--instance` 解析+`normalizeInstanceId`（[a-z0-9][a-z0-9-]{0,31}+小写规范化，防路径穿越/特殊字符/大小写歧义——DEC-123①边界1）；`deriveInstancePaths`（default=既有常量逐字节 C7：锁 gpt-session.lockfile/profile gpt-poc/端口 9222；命名实例锁 gpt-session-<ID>.lockfile/profile gpt-poc-<ID>/端口走注册表）；`allocateInstancePort`（候选 9300-9399+真实探测碰撞检查+已登记稳定返回+耗尽 fail-closed——DEC-123③"哈希仅候选非唯一性证明"）；`assertPointerWriterAllowed`（非 default 实例写共享 reviewer 指针→POINTER_SINGLE_WRITER_VIOLATION fail-closed——单写者不变量）；`matchesProfileOwnership`+`buildKillProfileScript`（进程归属按 --user-data-dir 完整启动参数精确 token 匹配、大小写不敏感、禁子串通配、归属不明不杀只计数、清理后 remaining 核对——DEC-123③加严）。
- **S3 gpt_dispatch.mjs 接线：** 锁路径实例化（acquireSessionLock 传 lockPath——session_lock.mjs 零改动，复用既有 opts.lockPath 能力）；命名实例端口在 mainLocked 内注册表锁临界区分配（读→并发探测→分配→原子写；注册表损坏 fail-closed INSTANCE_REGISTRY_INVALID）；复用调试端口前归属核验（CDP 活但无本实例 profile 进程→INSTANCE_PORT_FOREIGN fail-closed）；killProfileChrome 换精确归属脚本（own/foreign/remaining 留证）；result.json/run.log 实例域四件套留证（instance_id/lock/port/profile=可核验映射）。
- **S4 M1 并发核查（硬门槛）：** 五查全过（见 steps.md §S4 行号证据）；结论=登记簿共享路径+按登记簿路径 OS 锁串行+幂等键精确匹配+原子写双回读+故障注入重试零重发——跨实例并发登记安全，未知状态消除，N=2 前硬门槛满足。
- **测试：** test_instance_config.mjs 终态 24 项（含实例锁域隔离/同锁互斥两条 OS 级负例+R1/R2/R3 整改负例）24/24 PASS；phase0 统一回归 11/11 PASS（新增 instance-config 挂入跑器）；四腿 122 项 canonical 跑法（-I 逐模块）全 OK（详见 §4 验收整改轨迹）。

## 3. 修改文件

| 文件 | 变更 | 说明 |
|---|---|---|
| phase0/tools/dispatch_options.mjs | 改 | 实例域 7 个纯函数/常量+--instance 解析 |
| phase0/tools/gpt_dispatch.mjs | 改 | 四件套接线+端口注册表 IO+归属核验+清理精确化+留证字段 |
| phase0/tools/test_instance_config.mjs | 新增 | 16 项负例回归 |
| phase0/tools/run_phase0_regression.mjs | 改 | 跑器挂 instance-config |
| basic/tasks/b-20261121-parallel-dispatch-instance/ | 新增 | 任务包 |
| phase0/logs/instance-config-tests.*、third-round-regression-*、leg-rerun-instance/ | 新增 | 测试证据 |
| phase0/e2e-poc/session_lock.mjs、phase1/**（Python 全部）、契约/M1 运行时 | **零修改** | 锁模块复用既有 lockPath 参数；legs 零改动（C7 默认路径零回归为证） |

## 4. 测试结果

- **test_instance_config 终态 24/24 PASS**（初版 16→验收 R1 整改 22→R2 整改 23→R3 整改 24）；**phase0 统一回归 11/11 PASS**（含 m1-registry+m1-concurrency 多进程）；**四腿 36+30+25+31=122 项全 OK**（canonical：python -I -m unittest discover 逐模块；test_20 模板文本断言+test_21 派生驱动真跑三态验证为整改新增）。
- **组合跑环境伪影如实登记：** shell 含 PYTHONUTF8=1 时非隔离跑按 UTF-8 解码 tasklist 的 GBK 输出→UnicodeDecodeError→test_19 TypeError（1F+7E 波动）；`-I` 忽略环境变量→cp936→全过（实测对照两模式 utf8_mode/preferred）。属手册 §8.1 Windows 编码坑家族，非代码回归（Python 零改动）；canonical 跑法以 -I 为准，测试卫生备忘移交。

## 5. Git commit

被测基线：main `81812dd`；本任务实现提交=分支 fix/parallel-dispatch-instance（完整 SHA 见 S6/DEC-124 登记）；ST-01 绑定核验随验收派单执行。

## 6. 未解决问题与遗留移交

1. **阶段2（N=2 真实并发试跑）：** 需独立试跑授权（DEC-123 边界）；C9 账号级风控协调机制实现属阶段2 前置（未实现，如实登记）。
2. **测试卫生备忘：** 四腿组合单进程跑的编码伪影——canonical 跑法固定为 -I 逐模块；如需组合跑须先解决 subprocess text 解码显式 encoding（属测试代码整改，另行任务）。
3. **recoll 实例域纪律：** 派单与补采同实例 ID 同锁路径（DEC-123①边界3）——现有 recoll 驱动均 default 域；命名实例现场的补采驱动派生时须带同 lockPath（任务书已登记，阶段2 试跑执行）。
4. **N=3 扩容：** 另行裁定（DEC-123 边界）。

## 7. 后续建议

1. 阶段1 独立验收（本任务 S6 派单 ChatGPT）。
2. 验收 PASS 后：main 合并提请用户拍板（DEC-010，已按用户指令攒单至 11:00 统一处理）。
3. 阶段2 授权申请交 ChatGPT（含 C9 实现方案）。
