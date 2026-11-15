# 任务书：Basic D1 可复制性实战验证

- 任务ID：b-20261115-basic-replication-verify
- 日期：2026-11-15
- **版本选型：**
  - 选定版本：Basic
  - 任务等级：S1（纪要 §五：验证+文档类，无代码交付）
  - 选型理由：环境演练+报告成文；发现的缺口只登记不修复（修复另立任务）；低风险
  - 批准人/日期：节点自主推进授权（WORKFLOW 增补②），DEC-045 D1 产品级标准验证

## 需求原文（用户原话，不加工）

见 `requirement.md`（2026-11-15 节点授权确认版）。

## 执行者理解（与原文分开，便于对账）

1. **演练环境**：本机临时目录（如 D:/AIEO-replication-test，演练后保留作证据，不入 Git）；clone 源=https://github.com/damwate/AIEO.git（验证未认证公开拉取是否可行——若仓库私有则如实记录该缺口）。
2. **核验清单**：①clone 成功性与完整性（git log/fsck）②node toolkit/check-env.mjs 在 clone 目录可运行且输出合理 ③python -I basic/tool/check_taskpack.py 对 3 个既有任务包跑通且结论与本机一致 ④node toolkit/check-push.mjs 诊断模式（不推送）在 clone 目录可运行 ⑤治理文档齐备（WORKFLOW/ACCEPTANCE-CHECKLIST/templates 三件套/tasks README/AGENTS.md）⑥对照 WORKFLOW 部署边界条款逐项（复制新电脑需保留仓库公共工具并初始化环境）核验。
3. **产出**：《Basic 可复制性验证报告》（落位 standard/ 或 docs/，规划协商定；建议 basic/tasks 本包 acceptance/ 存演练原始输出+报告成文）；缺口清单分级（阻断"即用"/影响效率/记录性）。
4. **边界**：不修改 basic/ 现行文件与任何工具代码；不删除演练目录前须保留证据；发现的问题登记于报告，修复另立任务。

## 验收目标（最终要实现什么；可观察结果）

- 演练全流程留痕（clone/check-env/taskpack/check-push 原始输出归档）；
- 成文验证报告：通过项+缺口清单（分级）+修复建议，每项结论有演练输出佐证；
- 经 ChatGPT 独立复审通过（节点授权，登记依据）。

## 优先级：普通

## 任务状态（随进度更新）

| 字段 | 值 |
|---|---|
| 当前状态 | 完成 |
| 当前步骤 | 全部步骤完成（S1 PASS[R4 reply sha256=a8bd85a2…d9af，问题1-3 全关闭]/S2 交付登记） |
| 最终结果 | PASS：《Basic 可复制性验证报告》成文并通过独立验收（P0=0/P1=2/P2=2/待验证 1；结论=仓库复制维度可用+两条款实测成立+四缺口登记修复另立；本机模拟≠跨电脑实测如实标注） |

## 步骤清单（规划协商后冻结）

（待冻结）
