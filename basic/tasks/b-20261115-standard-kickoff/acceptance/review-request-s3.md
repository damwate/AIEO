# S3 验收请求：b-20261115-standard-kickoff（阶段 B·C1 申报绑定自动核验工具）

## 绑定申报（ST-01，本工具自核验输出=机器证据，dogfooding）

- **待验收 commit（单 commit 申报）：** `093cd832eb1f9e0bd5f89ed8c5aa4f77fd8082d3`
- **diff 基线：** `a665d2cf3ed7a01c683bb2ba68b102248d2957ad`（会商1闭环+S2挂起登记 commit）
- **绑定核验：** `python -I toolkit/check-binding.py --baseline a665d2cf3ed7a01c683bb2ba68b102248d2957ad --target 093cd832eb1f9e0bd5f89ed8c5aa4f77fd8082d3 --count 1` → **PASS**（R1 区间数=1 ✓／R2 线性链 ✓／R4 最终对象 ✓）；完整机器输出归档 `acceptance/b3-practice/s3-self-binding.json`（numstat：6 文件 501 行新增：check-binding.py 221／test-check-binding.py 268／README 9／b3-practice 三件 JSON 各 1）
- 本请求所在回填 commit 不属验收 diff 范围（ST-01 ④）。

## 验收标准（规划 development-plan.md v0.2 阶段 B：B1-B5）

| 项 | 标准 | 证据 |
|---|---|---|
| B1 矩阵全场景 | 规划十场景全覆盖（含第 10 项 BLOCKED 禁止 PASS+不适用标注） | test-check-binding.py 16 用例；test_10a/10b/10c |
| B2 负例指名断言 | 每负例断言命中规则 id+具体原因+commit（非仅 exit code） | 各 test_03~09 断言 detail 内容 |
| B3 真实实战 | 真实仓库+真实申报数据实跑，对照人工核验，记录边界 | acceptance/b3-practice/ 4 件（S1/S2 首轮/S2-R3 申报+本请求自核验）：三历史申报 PASS 且 numstat 与验收轮机器值逐字一致；边界如实记录于 steps.md S3⑤ |
| B4 可复现 | 同输入+同对象+同版本→判定确定（无时间戳噪声） | test_b4（两次运行 JSON 全等） |
| B5 异常与安全 | 只读（.git 快照不变）/坏仓库 BLOCKED/非法输入 FAIL/git 异常 BLOCKED | test_b5a/b5c；工具 GIT_OPTIONAL_LOCKS=0+仅 4 只读命令；test_b5b 坏仓库 BLOCKED |
| 四工程要求 | 逐条 parent 核验/三态判定/具体原因断言/自身安全 | R2 逐链；verdict 聚合；规则 id+detail+remediation；R6 探针分离环境与对象 |

## 请验收方执行（验收六查）

①是否符合 S3 目标（工具+矩阵+实战）②是否符合规划阶段 B 设计（含 R2 复审补强的矩阵与工程要求）③修改是否超范围（diff=6 文件全为新增）④代码质量（Python 标准库/只读/fail-closed/可复现）⑤测试真实执行（可复跑 `python -I toolkit/test-check-binding.py`）⑥证据可核查（GitHub 直读指定 commit+本地实跑）。

**回执格式：** 六查逐项＋B1-B5 逐项＋总结论（PASS/REJECT＋问题编号）。
