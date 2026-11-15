# delivery：b-20261115-basic-replication-verify（Basic D1 可复制性实战验证）

## 原始需求

见 `requirement.md`（2026-11-15 节点自主推进授权确认版；方案冻结=规划 R1 裁定"修改后同意"五项全采纳+节点授权增补②，reply sha256=fc8478d7…cbd974）。

## 最终实现内容

- **《Basic 可复制性验证报告》**（acceptance/replication-report.md）：八项核验清单逐项验证——①clone 完整性（直连 reset→经系统代理 3260 成功，HEAD=d05f46b，fsck 净，工作区净，clone 内无代理条目）②环境依赖（本机共享）③体检两次对照（1st=2 FAIL 均设计排除项→npm ci→2nd=1 FAIL 仅 profile，登录态不入 Git 正确）④check_taskpack×3 COMPLETED 包全 PASS 与主区一致 ⑤check-push 诊断零副作用（部分可证：执行时点快照未留存如实标注）⑥治理文档全齐备 ⑦部署边界两条款实测成立 ⑧skills/monitor=主机级外部依赖如实登记。
- **缺口清单**：P0=0；P1=2（G1 chrome profile 初始化步骤未文档化／G2 skills 外部依赖未在部署边界登记）；P2=2（G3 派单链 Windows 专属限制未声明／G4 新电脑自装清单缺）；待验证=1（G5 跨电脑实测）。**只登记不修复，修复另立任务。**
- **结论边界**：本机模拟≠真正新电脑（G5 待验证），不冒充完成。

## 修改文件

- 本任务包（requirement/task-brief/steps/delivery/acceptance/ 12 文件含 9 原始输出+3 补档+报告+MANIFEST+复验请求）
- **未改动**：basic/ 现行文件、工具代码（recoll_rep_plan.mjs=派单基础设施过程审计附件，经先例裁定排除出被测范围）、演练 clone 目录保留于 D:/AIEO-replication-test（不入 Git）

## 测试结果

clone 内四类核验全过（taskpack×3+check-push 诊断+check-env 两次对照）；主工作区一致性 37/37 不受影响。

## Git commit

- 链：d05f46b（登记）→85895dd（S1 被测）→5950512（R1 整改）→db5b7e1（返工表）→2e6ad71（R2 整改）→78102e5/2f434ce（R3 修正）→本 commit（S2 交付登记）
- 验收链：规划 reply sha256=fc8478d7…（修改后同意）→R1=26bcf99f…（REJECT 3 P1）→R2=3ac8c1f0…（2 项遗留）→R3=913f9a33…（1 处遗留）→R4=a8bd85a25129fa8f634a4b676551578967ad86ef34db1d52b1e87348b9bfd9af（**S1 整体验收 PASS，问题1-3 全关闭**）；审查会话迁移 2 次（6af93e42 满→短指针模式新会话承接）

## 未解决问题

无阻断项。缺口 G1-G4 待修复任务（另立），G5 跨电脑实测待条件。过程如实记录：①MANIFEST SHA256 与工作区 CRLF/仓库 LF 差异导致两轮 SHA 不匹配（根因清晰后统一按 Git blob 计算）；②误将 git SHA-1 混入 SHA256 清单一轮（即发现即改）；③演练首检输出未落盘主动删目录重做（验收方特别认可的证据纪律）。

## 后续建议

①G1+G4 合并为"新环境初始化清单文档化"小任务（WORKFLOW 部署边界或 toolkit/README 增补）；②G2 外部依赖清单登记（skills/monitor agent-kit 获取方式）；③G5 有第二台设备时重复本演练；④Basic 产品化剩余项=代码类任务 v0.3 实战（待真实需求）+backlog 两项（挂，重启条件在案）。
