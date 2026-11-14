# 零 DB 直改声明（zero-DB-direct-modification declaration）

- 任务：T-P1-908 / F-001（任务书 docs/phase1/F001-SCHEDULER-BRIEF.md v0.3 §2 S5"M1 REST 事件（禁 DB 直改）"、§11 A1）
- 声明人：编排执行会话（调度器实现者）
- 声明日期：2026-11-14（UTC）
- 范围：T-P1-908 全部 21 个 run（ORCH-908001–908021）涉及的全部 M1 状态机实体（projects/batches/agents/tasks/events/messages/artifacts/reports）

## 声明

调度器（phase1/tools/scheduler.py）及编排执行会话对 M1 状态机的全部状态变更**仅通过 M1 REST API 与 M3 MCP bridge 通道**执行；**未对 SQLite 数据库文件实施任何直接读写/UPDATE/DELETE**。状态推进（DRAFT→PLANNING→ARCH_REVIEW→READY→IN_PROGRESS→DEVELOPMENT_COMPLETED→DEV_REPORTED）全部经由 `POST /api/v1/tasks/{task_id}/events` 与 `POST /api/v1/tasks/{task_id}/claim`、M3 `claim_task`/`submit_result` 等契约 API 完成。

## 支持证据（独立于调度器自身记录）

1. **M1 服务端结构化审计日志**（runtime/t-p1-908/logs/platform-20261114.ndjson，M1 自有 logger 输出）：本目录 `task-events-audit-serverlog.ndjson`（28 行原文）覆盖 T-P1-018/T-P1-019/T-P1-020 的全部服务侧记录——每个状态转换均以 `task_event_submitted`（operation=submit_event result=SUCCESS）形式出现在 API 层；`claim`/`development_report_submitted` 等亦全为 API 事件。若存在 DB 直改，这些 API 层审计行不会存在。
2. **REST 只读读回**（本目录 `task-events-audit.json`）：T-P1-018 终态 `status=DEV_REPORTED`（M1 唯一持有状态机）、工件 ART-OTH-011/ART-DIFF-005 GET 200、消息收发 10/13 条——全部经由 API 读回且与调度器记录一致。
3. **调度器代码事实**：`scheduler.py` 仅含 urllib REST 客户端（M1Client）与 MCP stdio 子进程（McpClient），无 sqlite3 导入、无任何 DB 文件路径引用（可按 SHA 审计源码核实）。

## 边界说明

- M1 服务自身对其 SQLite 文件的写入是其内部实现（Flask/FastAPI 应用层），不属于"外部 DB 直改"。
- 编排会话在取证场景曾以只读方式查看 DB 行（如 905 先例的只读复核），但**写路径零 DB 直改**。
