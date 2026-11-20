# 需求原文：C9 账号级风控协调实现（阶段2 前置硬条件）

- 任务ID：b-20261121-account-risk-c9
- 日期：2026-11-21
- 立项依据：DEC-128（C9 有条件认可五约束+阶段2 有条件批准，C9 独立验收 PASS 为 N=2 前置）+ 用户"继续开发吧"。

## 需求原文（用户指令，逐字不加工）

> "合并到main，然后继续开发吧"

## ChatGPT 拍板结论（DEC-128，reply 归档 recoll-stage2-r1-2026-11-20T23-26-25-564Z，SHA-256=c2e1b071083b17141d8d866f0575a5c68c70c4497bc90be45dde0c1d3a4854f1）

五约束：A 退避期限不得被缩短（已有 BACKOFF 只能延长或维持）；B 缺失状态=明确 NORMAL 初始化、损坏=fail-closed 禁静默 NORMAL；C EXPIRED_ALLOW 须原子归一化；D 检查点覆盖实际浏览器操作边界（启动门+操作前复查，残余竞态窗口如实说明）；E 观察点被动（无真实 429=NOT_OBSERVED 不记 PASS）。退避 9-60min 钳位。

## 本任务范围

C9 实现（纯函数三件+文件 IO+gpt_dispatch 启动门/复查/观察点+recoll 模板同门+C7 零影响）+本地回归+交 ChatGPT 独立验收。N=2 真实试跑属阶段2 本体（验收 PASS 后按 DEC-128 范围执行）。

## 边界约束

- 不执行 N=2 真实并发（本任务止于 C9+验收）；不碰 main（fix/parallel-stage2 分支）；DEC-010 红线用户本人。
