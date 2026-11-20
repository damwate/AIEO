# 任务书：多 Agent 并行派单·实例域实现（阶段1）

- 任务ID：b-20261121-parallel-dispatch-instance
- 日期：2026-11-21

## 版本选型

- 选定版本：Standard（多任务并行基础能力；作业流程=WORKFLOW v0.3+派单纪律）
- 任务等级：S2（触及派单主工具 gpt_dispatch 与锁/进程归属，但默认行为逐字节不变+全负例覆盖）
- 选型理由：DEC-123 拍板授权阶段1；生产默认不变原则下纯增量实现。
- 批准人/日期：ChatGPT PARA-R1 拍板（DEC-123，2026-11-21）+ 用户"开工"指令（2026-11-21）；DEC-010 红线仍用户本人。

## 执行落点

- 目标仓库：damwate/AIEO；目标分支：任务分支 fix/parallel-dispatch-instance（完成后交独立验收再议合并）
- 工作目录：d:/AIEO
- 基线 commit：81812dd（main tip，DEC-122 合入后）

## 需求原文

见 requirement.md（用户指令逐字 + DEC-123 拍板）。

## 执行者理解

- 实例域四件套=lockPath/profileDir/debugPort/kill 归属，由 --instance 派生；default 实例逐字节=既有常量（C7）。
- 端口分配走注册表文件（runtime/locks/instance-ports.json）+原子写+分配临界区锁+探测碰撞检查（哈希仅候选）；实例身份/锁/端口/profile 可核验映射（run.log+result.json 留证）。
- 进程归属按完整启动参数 --user-data-dir 精确 token 匹配（大小写不敏感），禁子串通配；归属不明不杀只计数。
- M1 登记簿=共享全局路径+按登记簿路径 OS 锁串行——跨实例并发登记安全（审计结论），既有 test_m1_concurrency 多进程测试为证。

## 验收目标

- 全部新增负例 PASS+既有全量回归零回归（含四腿 120 项）；C7 默认兼容证明；启动端口归属核验 fail-closed；killProfileChrome 精确归属。
- M1 五查结论落档；被测 commit 完整 SHA 登记（ST-01）。

## 优先级：高（标准版多任务并行=阶段1 前置；用户已拍板开工）

## 边界

- 不碰真实 ChatGPT 并发（阶段2 另授权）；不动 C9 账号级风控协调（阶段2 范畴）；DEC-010 红线不触碰。

## 任务状态（随进度更新）

| 字段 | 值 |
|---|---|
| 当前状态 | 完成 |
| 当前步骤 | S6 交付完成（S1 方案 PASS / S2 纯函数 16/16 PASS / S3 接线+回归 11/11 PASS / S4 M1 五查 PASS / S5 四腿 120 项 PASS / S6 待独立验收）；基线 main 81812dd |
| 最终结果 | （任务完成前暂空） |
