# T-P1-908 独立验收重现指南（REPRODUCE-GUIDE）

- 目的：验收第 1 轮 REJECT 阻断项 A8 补证——独立验收者按完整 40 位 SHA 读取分支后，可**自行执行**以下每条命令重现全部判定。
- 读图顺序：RUN-RECORD.md → 任务书 §11（main@67c177c4f9c96a13cf21f0d882ae6b59b302a721 的 docs/phase1/F001-SCHEDULER-BRIEF.md）→ 本指南逐项。
- 分支锚点（派单简报 round-2 携带完整 SHA）：scheduler=feature/T-P1-908-scheduler（A4 修复后 HEAD 含 2b3e622/8f3a635）；fixture=feature/T-P1-908-fixture@fda9183dafb77ca15578abb244b3b2d15999fafb；evidence=feature/T-P1-908-evidence（本文件所在分支，HEAD 见 round-2 简报）。
- 所有命令在仓库根目录执行；`E` 代指证据目录 `phase1/logs/t-p1-908-20261114/`。

## 逐项重现（A1–A8，对应任务书 §11 原文）

**A1 真实通道**（task_events 审计含 run 全部事件+零 DB 直改声明+每步证据文件存在且与 SHA256SUMS 一致）：
- `cat $E/acceptance/task-events-audit.json`——M1 REST 只读读回：tasks.T-P1-018.task_detail.status=`DEV_REPORTED`；artifacts.ART-OTH-011/ART-DIFF-005 均 http 200。
- `cat $E/acceptance/task-events-audit-serverlog.ndjson | grep task_event_submitted | grep T-P1-018`——M1 **服务端**审计（独立于调度器记录）：PLAN→PLANNING、ARCH_REVIEW→ARCH_REVIEW、PASS→READY、START→IN_PROGRESS 四次转换均为 API 层事件。
- `cat $E/acceptance/zero-db-direct-modification-declaration.md`——零 DB 直改声明+三条支持证据。
- `git show <scheduler-SHA>:phase1/tools/scheduler.py | grep -c sqlite3`——调度器源码无任何 DB 直改通道（预期 0）。
- 每步证据文件存在性：`$E/acceptance/triplet-audit.json`（21 个 run、149 组、incomplete=0）；与 SHA256SUMS 一致性见 A5。

**A2 闭环真实**：`cat $E/acceptance/task-events-audit.json` 的 tasks.T-P1-018（REST 读回 DEV_REPORTED）；reply 原始字节 SHA 三处一致核对：`sha256sum $E/s3-reply-raw.txt`（=RUN-RECORD §1 S3 行 1b3a4dcfa93a…）、S2 派单 unit hash（phase0/logs/dispatch-2026-11-14T07-57-15/）、M1 artifact ART-OTH-011 登记值（audit JSON artifacts 键下原文）。

**A3 幂等**：S4 重放 `cat $E/executions/ORCH-908019/evidence-steps/s4-*replay*`（artifact duplicate:true 同 ID + message 409 RES-0003）；S9 重放 `cat $E/executions/ORCH-908019/evidence-steps/s9-submit-replay-a3*`（accepted:true + report_registry.duplicate:true）。

**A4 失败采集**（登记类故意缺参→真实 REQ-0001→该 run ORCHESTRATED_FAIL+五要素）：
- `git show <scheduler-SHA> --stat`——修复提交 2b3e622（--inject-a4 实现）+ 8f3a635（注入向量改 905 §5-1 同形态）。
- `cat $E/executions/ORCH-908021-scheduler-console.log | tail -8`——真实链路 REQ-0001 原文（"report.correlation_id 缺失且当前会话无在途领取可继承"）+ RESULT=ORCHESTRATED_FAIL exit=1。
- `cat $E/executions/ORCH-908021/failure-report.json`——五要素（run_id/failed_step=9/last_confirmed_state/completed_operations_with_entity_ids/evidence_pointers）。
- `cat $E/executions/ORCH-908021/evidence-steps/s9-a4-inject-submit.json`——注入向量（占位值如实申报）+ 真实拒绝响应。
- 迭代如实留证：908020（首版向量过简→REQ-0002，`$E/executions/ORCH-908020-scheduler-console.log`）——错误码非 REQ-0001 时调度器 fail-closed 拒判，诚实不饰。
- 先例对照：main 仓库 phase1/logs/t-p1-905-d1prime-20261114/RUN-RECORD.md §5-1 + runtime 侧 bridge ndjson error_code=REQ-0001（duration 1ms，bridge 层 mcp_server.mjs:282）。

**A5 证据完整**：`cd <evidence 分支工作树> && sha256sum -c $E/SHA256SUMS`——全量实测通过（清单自身与校验输出文件按惯例自排除，见清单头注）；`cat $E/acceptance/triplet-audit.json`——每步三件套齐全 149/149。

**A6 契约符合**：`cat $E/executions/ORCH-908019/evidence-steps/s4-*.json | grep -o '"errors": \[\]'`——904 冻结双 Schema Ajv envelope+payload 0 errors 校验记录归档。

**A7 安全**：`cat $E/security-scan.txt`——SEC-SCAN-T-P1-908-001（793 文件 disk+git 树双范围）result: CLEAN；扫描器 runtime/t-p1-908/sec_scan_908.py（5 规则），可在 wt-ev 目录重跑复现。

**A8 重现核验**：本指南即重现程序；验收 reply 须逐项引用所读证据文件的完整 SHA（`sha256sum <file>` 自行计算）与分支+完整 40 位 commit SHA，不接受无 SHA 指针的断言。

## 验收者操作底线（照 round-1 简报纪律）

只按完整 40 位 SHA 读仓库（禁 HEAD）；只裁定不修改文件；回复 ≤500 字、A1–A8 每项 PASS/FAIL+证据 SHA 指针、末行 ACCEPT 或 REJECT。
