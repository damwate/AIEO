# T-P1-908 独立验收重现指南（REPRODUCE-GUIDE v2）

- 目的：独立验收者按完整 40 位 SHA 读取分支后，可**自行执行**以下每条命令重现全部判定（任务书 §11 A8）。
- v2（2026-11-14，验收第 2 轮 REJECT 后修订）：新增 §0 字节保真读取通道；修正 A2 指针（run-908019 子目录）；A3/A6 改为精确文件名+实际 JSON 键；A4 改指 ORCH-908022（scheduler 08c8e7c 修正记录后的最终向量 run）；A7 扫描器入库 acceptance/sec_scan_908.py。
- 读图顺序：本指南 §0 → RUN-RECORD.md → 任务书 §11（main@c6109921132d2df825e87d38e34ecd8e678b84b0 的 docs/phase1/F001-SCHEDULER-BRIEF.md）→ 逐项。
- 分支锚点：scheduler=feature/T-P1-908-scheduler@08c8e7c366c708b219f3c737eef2c36abfcefc04；fixture=feature/T-P1-908-fixture@fda9183dafb77ca15578abb244b3b2d15999fafb；evidence=feature/T-P1-908-evidence（本文件所在分支；完整 SHA 见验收简报，HEAD 无法自指）。
- 所有命令在仓库根目录执行；`E` 代指证据目录 `phase1/logs/t-p1-908-20261114/`。

## §0 字节保真读取通道（先读，否则所有 sha256 都对不上）

本仓库所有 sha256 值都是**磁盘字节（LF）**的哈希；已实测全树与 git blob 内容逐字节一致。因此只有以下两条通道能返回与 SHA256SUMS 一致的字节，**二选一**：

1. `git clone https://github.com/damwate/AIEO && cd AIEO && git checkout <完整40位SHA>`（每次核验一个锚点即 checkout 对应 SHA）；
2. 单文件：`https://raw.githubusercontent.com/damwate/AIEO/<完整40位SHA>/<路径>` 下载后 `sha256sum`。

**禁止**用浏览器网页选中复制/查看源代码复制充当读取通道：DOM 复制会改写字节。第 2 轮验收 reply 所引 c0911edd…（s3-reply-raw.txt）、98562099…（校验输出）等哈希与 git blob 实测全部不符、且"SHA256SUMS 404"与该文件确实存在于 77a48d1 树中（130941 字节）相矛盾，即属通道性伪差（详见 RUN-RECORD §10 第 2 轮节）。用 §0 两通道之一即可复现一切哈希。

## 逐项重现（A1–A8，对应任务书 §11 原文）

**A1 真实通道**（task_events 审计含 run 全部事件+零 DB 直改声明+每步证据文件存在且与 SHA256SUMS 一致）：
- `cat $E/acceptance/task-events-audit.json`——M1 REST 只读读回：tasks.T-P1-018.task_detail.status=`DEV_REPORTED`；artifacts.ART-OTH-011/ART-DIFF-005 均 http 200。
- `grep task_event_submitted $E/acceptance/task-events-audit-serverlog.ndjson | grep T-P1-018`——M1 **服务端**审计（独立于调度器记录）：PLAN→PLANNING、ARCH_REVIEW→ARCH_REVIEW、PASS→READY、START→IN_PROGRESS 四次转换。
- `cat $E/acceptance/zero-db-direct-modification-declaration.md`——零 DB 直改声明+三条支持证据。
- `git show 08c8e7c366c708b219f3c737eef2c36abfcefc04:phase1/tools/scheduler.py | grep -c sqlite3`——调度器源码无任何 DB 直改通道（预期 0）。
- 每步证据文件存在性：`$E/acceptance/triplet-audit.json`（22 个 run、151 组三件套、incomplete=0）；与 SHA256SUMS 一致性见 A5。

**A2 闭环真实**：
- 任务终态：`cat $E/acceptance/task-events-audit.json` 的 tasks.T-P1-018（REST 读回 DEV_REPORTED）。
- reply 原始字节 SHA 三处一致：①`sha256sum $E/run-908019/s3-reply-raw.txt` = `1b3a4dcfa93a27609680d52ee5ba1c32849286997e00601829d6cda7714dda5a`（=RUN-RECORD §1 S3 行）；②S2 派单 unit hash——随证据分支提交的派单目录在仓库根 `phase0/logs/dispatch-2026-11-14T07-57-15/`（raw-units.json 内 user unit hash 字段），不在 $E 下；③M1 artifact ART-OTH-011 登记值（audit JSON artifacts 下原文）。
- ⚠️ **不要**用 $E 顶层 `s3-reply-raw.txt`：那是 ORCH-908008（BATCH-008/T-P1-007）已提交历史的遗留文件，仅存在于归档树中，与 A2 无关。A2 唯一正确指针=run-908019/ 子目录内同名文件。

**A3 幂等**（文件名精确，勿用通配）：
- S4 重放：`cat $E/executions/ORCH-908019/evidence-steps/s4-replay-a3.json`——`artifact_replay_ok:true, message_replay_ok:true`；其中 artifact_replay={http:409, duplicate:true, artifact_id:ART-OTH-011}，message_replay={http:409}（RES-0003 不新增）。
- S9 重放：`cat $E/executions/ORCH-908019/evidence-steps/s9-submit-replay-a3.json`——submit 已 accepted:true 且 report_registry.duplicate:true 不新增（bridge 把 duplicate 嵌套在 report_registry 下，见 scheduler 35c98f9 修复说明）。

**A4 失败采集**（登记类故意缺参→真实 REQ-0001→该 run ORCHESTRATED_FAIL+五要素）：
- 修复提交：`git show 08c8e7c366c708b219f3c737eef2c36abfcefc04 --stat`（--inject-a4 实现 2b3e622→8f3a635→08c8e7c 记录修正）。
- 最终向量 run=**ORCH-908022**（T-P1-021/BATCH-022）：`tail -8 $E/executions/ORCH-908022-scheduler-console.log`——真实链路 REQ-0001 原文（"report.correlation_id 缺失且当前会话无在途领取可继承"）+ RESULT=ORCHESTRATED_FAIL exit=1。
- `cat $E/executions/ORCH-908022/failure-report.json`——五要素（run_id/failed_step=9/last_confirmed_state/completed_operations_with_entity_ids/evidence_pointers）。
- `cat $E/executions/ORCH-908022/evidence-steps/s9-a4-inject-submit.json`——注入向量：结构完整报告体（过 assertValidDevReport）+ `deliberately_omitted:["report.correlation_id"]` 唯一缺参 + `placeholder_fields_declared` 占位字段如实申报 + 真实拒绝响应；该请求于 bridge 层被拒（mcp_server.mjs:282），不达 M1、零实体登记。
- 迭代如实留证：908020（首版向量过简→REQ-0002，调度器 fail-closed 拒判；console log 同目录）、908021（REQ-0001 达标但证据 blob 记了过时五字段清单，与实际单缺参矛盾——scheduler 08c8e7c 修正记录后重跑为 908022）。
- 先例对照：main@…c6109921 仓库 phase1/logs/t-p1-905-d1prime-20261114/RUN-RECORD.md §5-1。

**A5 证据完整**：`git checkout <evidence 完整SHA> 后 cd 仓库根 && sha256sum -c $E/SHA256SUMS`——全量实测通过（清单自身与校验输出文件按惯例自排除，见清单头注）；`cat $E/acceptance/sha256sum-c-result.txt` 为执行方实测存档；`cat $E/acceptance/triplet-audit.json`（151/151）。

**A6 契约符合**：`cat $E/executions/ORCH-908019/evidence-steps/s4-ajv-validation.json`——`envelope:{valid:true,errors:[]}` 且 `payload:{valid:true,errors:[]}`（904 冻结双 Schema Ajv 0 errors 校验记录归档）。

**A7 安全**：`cat $E/security-scan.txt`——SEC-SCAN-T-P1-908-001 result: CLEAN（disk 全量 walk + git HEAD 树 git grep -a -P 五规则，双范围）；**独立重跑**：checkout 完整 SHA 后于仓库根执行 `python -I phase1/logs/t-p1-908-20261114/acceptance/sec_scan_908.py`（扫描器已入库本分支，5 规则，重跑输出落回 $E/security-scan.txt；预期末行 result: CLEAN）。

**A8 重现核验**：本指南即重现程序；验收 reply 须逐项引用所读证据文件的完整 SHA（在 §0 通道上自行 `sha256sum` 计算）与分支+完整 40 位 commit SHA，不接受无 SHA 指针的断言。

## 验收者操作底线（照 round-1 简报纪律）

只按完整 40 位 SHA 读仓库（禁 HEAD）；读取走 §0 字节保真通道；只裁定不修改文件；回复 ≤500 字、A1–A8 每项 PASS/FAIL+证据 SHA 指针、末行 ACCEPT 或 REJECT。
