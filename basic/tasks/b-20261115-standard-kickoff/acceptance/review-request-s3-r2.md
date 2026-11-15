# S3 限定复验请求：b-20261115-standard-kickoff（只复核问题1/问题2）

> 依据 S3-R1 裁定（reply sha256=59ae93368215b7f9…，recoll-2026-11-15T12-28-22-485Z）："修复问题1和问题2后，提交最终整改 commit，并提供新的绑定申报及测试执行记录，再按这两个问题限定范围复验"。R1 已过项（绑定申报/范围/B1 静态/B3 实战/B4 设计/⑥）不重审。

## 绑定申报（ST-01，工具自核验=机器证据）

- **待验收 commit（单 commit 申报）：** `76f9abfe44e78e1f30078841ebb3fbd05a0f2b8b`
- **diff 基线：** `3e5ef5044aa6ebec39ead5c30066c9e2d5218b48`（S3 回填链尾）
- **绑定核验（机器输出原文）：** parent=3e5ef50…（git show -s %H %P）✓；rev-list --count=1 ✓；`git diff --numstat 基线..待验收` → **12／8 toolkit/check-binding.py；64／2 toolkit/test-check-binding.py**（恰 2 文件）
- 本请求所在回填 commit 不属验收 diff 范围（ST-01 ④）。

## 两项整改对照

| 问题 | R1 要求 | 修正落位 |
|---|---|---|
| 问题1（fail-open 真缺陷） | R4/numstat 非零退出→BLOCKED 不得 PASS 放行；增加故障注入测试 | ①`check-binding.py` R4 `rev-list target..HEAD` 与 numstat `diff --numstat` 改非零退出即 `raise GitCmdError`→RX BLOCKED（try_git 其余失败路径原有 raise 不变）；②注入测试 b5d（注入 rev-list 失败→verdict BLOCKED/退出 2/无 R4 PASS）与 b5e（注入 numstat 失败→BLOCKED+RX）；③正常路径 R4 PASS 与 numstat 输出保持原行为（原 16 用例未改动断言） |
| 问题2（负例 commit 身份断言） | 有具体对象的负例断言 commits 含预期 SHA；数量类明确验收数量字段；R7 断言规则 id+原因+退出码 | test_03（R2 commits 含孤儿 target）/test_04（R3 commits 含 merge commit SHA）/test_06+test_08（R4 commits 含过期 target）/test_09（R6 commits 含坏 SHA）/test_05（R1 detail 断言"申报=3 实际=2"数量字段，原有）/test_10a/b/c（断言规则 id=R7+BLOCKED+退出码 2）；另 b5c 只读快照升级为文件内容 SHA-256 对比 |

## 测试执行记录（整改后全量复跑）

- `python -I toolkit/test-check-binding.py` → **18/18 OK**（16 原有断言未改+2 注入新增），退出码 0。
- 附注：R1 复验方 ⑤ 因环境 DNS 无法 clone 未能独立实跑 16 用例（如实记 BLOCKED 不冒充）——本请求提交时仓库已推送，可直读指定 commit 复跑。

## 复验范围声明

- 只复核问题1/问题2；R1 已过项不重审；不把 S3 REJECT 扩大为 S2 新问题（沿用 R1 边界）。BC-06 状态不动。

**回执格式：** 问题1/问题2 逐项结论＋总结论（PASS/REJECT＋问题编号）。
