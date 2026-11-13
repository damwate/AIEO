# POC-04 验证报告：Git 自动采集

**结论：PASS（9/9 步全过，脚本化可复现）**
**验证时间：** 2026-11-12 00:20（UTC+8）

## 1. 验证方式

脚本 `phase0/git-poc/git_collect.py`（Python 3.12 + Git CLI）在**自建一次性测试仓库** `runtime/git-poc-test-repo`（gitignored，不入库）上完整走一遍任务型 Git 流。不触碰任何真实生产分支。

## 2. 实测结果（git-poc-result.json）

| 步骤 | 内容 | 结果 | 实测值 |
|---|---|---|---|
| 1 | 检查工作区状态 | ✅ | `git status --porcelain` 为空 |
| 2 | 记录基线 Commit | ✅ | `c9bd71a5…`（40 位） |
| 3 | 创建任务分支 | ✅ | `feature/AIEO-POC-001` |
| 4 | 修改无风险测试文件 | ✅ | 新增 `src/calc.py` |
| 5 | 执行简单测试 | ✅ | `TEST PASS: 2/2 assertions`，exit 0 |
| 6 | 提交 Git | ✅ | `feat(POC-001): add calc.py add() 实现与自测` |
| 7 | 读取 Commit SHA | ✅ | `772172a981033c420ce003a015acd5ec1ae71f78` |
| 8 | 读取 Git Diff | ✅ | changed_files=`['src/calc.py']`，diff stat 含 calc.py |
| 9 | 工作区干净检查 | ✅ | 检出未提交文件=True；清理后干净=True |

执行日志：`phase0/logs/git-poc-run.log`；结构化证据：`phase0/logs/git-poc-result.json`（含 duration_sec=1.4）。

## 3. 过程中修复的两个 Windows 实际问题

1. 运行测试产生的 `src/__pycache__/` 导致步骤 9 误判脏区 → 清理逻辑补充（真实工程中应由 .gitignore 覆盖）；
2. git 对象只读属性导致 `shutil.rmtree` 拒绝访问 → 增加 chmod 重试（`_force_remove`）。

## 4. 对 AIEO 的意义

文档 03 §6 要求的 AIEO 自行 Git 检查能力（分支存在性、基线一致性、Diff 范围校验、工作区干净、测试证据采集）在本机全部可行，POC-05 端到端闭环直接复用该脚本。
