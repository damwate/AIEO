# S3 限定复验请求 R3：b-20261115-standard-kickoff（只复核问题2 最小修复）

> 依据 S3-R2 裁定（reply sha256=865db50acb5fc05def09b6d38a438247aa28cc1f25bec27a8ded6810b9ade5a0，dispatch-2026-11-15T12-36-04）："后续复验只需针对问题2的最小修复，不需要重新审查问题1及其他已通过项"。

## 绑定申报（ST-01，机器口径）

- **待验收 commit（单 commit 申报）：** `c351d49ed6d29e354c0636237863c041987fad83`
- **diff 基线：** `59db01e`（S3-R2 回填链尾，完整 SHA=59db01e7785b1e28fee64e951d866c7b26c6fffc）
- **绑定核验（机器输出原文）：** parent=59db01e7785b1e28fee64e951d866c7b26c6fffc（git show -s %H %P）✓；rev-list --count=1 ✓；numstat → **2／0 toolkit/test-check-binding.py**（恰 1 文件 2 行新增）
- 本请求所在回填 commit 不属验收 diff 范围（ST-01 ④）。

## 最小修复内容

- `test_10a_empty_range_blocked`：增 `assertIn("区间 commit 数==0", d["rules"][-1]["detail"])`（R7 具体原因断言）
- `test_10b_empty_range_marked_na_still_blocked`：增同一原因断言（保留原"不适用"断言）
- 测试复跑：18/18 OK 退出 0（R2 时的 18 用例数不变，仅断言增强）

## 复验范围声明

- 只复核问题2（test_10a/b 原因断言）；问题1 与其他已过项不重审。BC-06 状态不动。

**回执格式：** 问题2 结论＋总结论（PASS/REJECT）。
