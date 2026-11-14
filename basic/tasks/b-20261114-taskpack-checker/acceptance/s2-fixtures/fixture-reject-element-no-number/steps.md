# 步骤清单：fixture

## 拍板方案要点

（fixture 样例）

## S1 骨架
①本步骤目标：完成 S1 目标。
②修改文件：fixture/S1.md
③修改内容：S1 实现内容。
④执行结果：S1 执行完成。
⑤测试结果：S1 冒烟通过。
⑥验收证据引用：验收结论：PASS（dispatch-2026-11-14T10-00-01，reply sha256=a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4）。证据包内路径 acceptance/s2-fixtures/evidence/probe.txt。

## S2 规则实现
①本步骤目标：完成 S2 目标。
②修改文件：fixture/S2.md
③修改内容：S2 实现内容。
④执行结果：S2 执行完成。验收结论：REJECT（dispatch-2026-11-14T10-00-09，reply sha256=0f1e2d3c0f1e2d3c0f1e2d3c0f1e2d3c0f1e2d3c0f1e2d3c0f1e2d3c0f1e2d3c）。
⑤测试结果：S2 冒烟通过。问题1 修复验证通过。
⑥验收证据引用：验收结论：待复验（dispatch-2026-11-14T10-00-09，reply sha256=0f1e2d3c0f1e2d3c0f1e2d3c0f1e2d3c0f1e2d3c0f1e2d3c0f1e2d3c0f1e2d3c）。证据包内路径 acceptance/s2-fixtures/evidence/probe.txt。

## 返工记录

| 问题编号 | 问题 | 根因 | 修复 commit | 复验 |
|---|---|---|---|---|
| 问题1 | 样例缺陷 | 样例根因 | `cccccccccccccccccccccccccccccccccccccccc` | 待复验 |
