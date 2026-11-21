# 需求原文：Queue Service Phase B 骨架编码及五项测试（DEC-141 授权执行）

- 任务ID：b-20261121-queue-phaseb
- 日期：2026-11-21
- 立项依据：DEC-141（QUEUE-DESIGN-R8 设计终验 PASS+Phase B 骨架编码及其五项测试授权签发，授权基线 6e0a26a3646577f4a95421307ccd7ade21433a38）+ 用户指令"开工吧，不要等我；当你按预定方案准备做什么的时候果断开工，不用等"。

## 需求原文（用户指令，逐字不加工）

> "开工吧，不要等我；当你按预定方案准备做什么的时候果断开工，不用等"

## 授权边界（DEC-141 照登）

授权=Phase B 骨架编码及其五项测试（独立有限非运行态）。未授权=Phase C/Bash 替换/C9C6 修改/N=2 重启/N=3/main 合并。

## 本任务范围

- 队列核心库 queue_core.mjs（三契约状态文件+原子认领+C9_CHECKING 调用+崩溃恢复窗口表+幂等）+ CLI queue_service.mjs + 测试 test_queue_service.mjs（五项）。
- 设计依据=parallel_queue_design_r1.md（R6 终验版）；C9 门=调用既有 accountGateCheck（零重写）；Phase B=影子语义（EXECUTING 由外部实际派单驱动，Queue 记账）。

## 边界约束

- 零修改 gpt_dispatch.mjs/C9/C6 已验收实现；零运行态变更（不动现役 bash 编排）；五项测试全 PASS+既有回归零回归；交 ChatGPT 独立验收（Phase B 验收）后才议 Phase C。
