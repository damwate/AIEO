// AIEO Phase 1 M3 ZCode Bridge — FileBackedFakeM1Client（测试用内存假实现，状态落盘）
//
// 与 HttpM1Client 实现同一 M1Client 接口（见 m1_client.mjs 注释），行为按 C1 契约模拟：
//   - claimTask：任务不存在 → RES-0001；已被领取（无论是否同一持有者）→ TASK-0003
//     （C1 §2.3：claim 非幂等独占租约，不得并发重复领取）；
//   - submitMessage：message_id 主键去重；同 id 同内容 → 返回原 ack（duplicate=true）；
//     同 id 不同内容 → RES-0002（拒绝冒名复用主键）；
//   - registerDevReport：execution_id 唯一；重复 → 返回原登记结果（duplicate=true）。
//
// 状态持久化到 JSON 文件：MCP stdio 子进程（测试 ①）与测试进程共享同一假 M1 状态；
// 文件读写做同目录原子替换（tmp + rename），只作测试夹具，不参与任何互斥仲裁（DEC-001
// 互斥永远交给 OS 句柄锁，见 workspace_lock.mjs）。

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createHash } from "node:crypto";
import { aieoError } from "./errors.mjs";

function contentHash(obj) {
  return createHash("sha256").update(JSON.stringify(obj)).digest("hex").slice(0, 16);
}

function emptyState() {
  return {
    tasks: {},          // task_id → 任务包（测试预置）
    claims: {},         // task_id → {agent_id, session_id, claimed_at, correlation_id}
    messages: {},       // message_id → {envelope, ack, content_hash}
    dev_reports: {},    // execution_id → {report, dev_report_id}
    counters: { dev_report: 0 },
  };
}

export class FileBackedFakeM1Client {
  constructor({ statePath }) {
    if (!statePath) throw new Error("SYS-0001: FileBackedFakeM1Client 需要 statePath");
    this.statePath = statePath;
    if (!existsSync(statePath)) {
      mkdirSync(dirname(statePath), { recursive: true });
      this._save(emptyState());
    }
  }

  _load() {
    try {
      return JSON.parse(readFileSync(this.statePath, "utf8"));
    } catch {
      return emptyState();
    }
  }

  _save(state) {
    const tmp = `${this.statePath}.tmp-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
    writeFileSync(tmp, JSON.stringify(state, null, 2), "utf8");
    renameSync(tmp, this.statePath);
  }

  /** 测试夹具：预置任务（任务包结构 = 03-协议 §5 最小集）。 */
  seedTask(task) {
    const state = this._load();
    state.tasks[task.task_id] = task;
    this._save(state);
  }

  /** 测试夹具：清空状态。 */
  reset() {
    this._save(emptyState());
  }

  async claimTask(req) {
    const state = this._load();
    const task = state.tasks[req.task_id];
    if (!task) {
      throw aieoError("RES-0001", `RESOURCE_NOT_FOUND: 任务不存在: ${req.task_id}`, { correlation_id: req.correlation_id });
    }
    if (state.claims[req.task_id]) {
      const prev = state.claims[req.task_id];
      throw aieoError("TASK-0003", `TASK_ALREADY_CLAIMED: 任务已被领取（holder=${prev.agent_id}/${prev.session_id}），不得并发重复领取`, {
        details: { claimed_by: prev.agent_id, claimed_session: prev.session_id, claimed_at: prev.claimed_at },
        correlation_id: req.correlation_id,
      });
    }
    state.claims[req.task_id] = {
      agent_id: req.agent_id,
      session_id: req.session_id,
      claimed_at: req.claimed_at,
      correlation_id: req.correlation_id,
    };
    this._save(state);
    // 200 Task：返回任务详情 + 租约信息
    return { ...task, claim: state.claims[req.task_id] };
  }

  async submitMessage(envelope) {
    const state = this._load();
    const existing = state.messages[envelope.message_id];
    if (existing) {
      if (existing.content_hash !== contentHash(envelope)) {
        throw aieoError("RES-0002", `RESOURCE_CONFLICT: message_id ${envelope.message_id} 已存在但内容不同，禁止冒名复用去重键`);
      }
      return { ...existing.ack, duplicate: true };
    }
    const ack = {
      message_id: envelope.message_id,
      status: "PENDING",
      received_at: new Date().toISOString(),
    };
    state.messages[envelope.message_id] = { envelope, ack, content_hash: contentHash(envelope) };
    this._save(state);
    return { ...ack, duplicate: false };
  }

  async registerDevReport(report) {
    const state = this._load();
    const existing = state.dev_reports[report.execution_id];
    if (existing) {
      if (existing.content_hash !== contentHash(report)) {
        throw aieoError("RES-0003", `DUPLICATE_MESSAGE: execution_id ${report.execution_id} 已登记但报告内容不同，拒绝覆盖（历史保留）`);
      }
      return { registered: true, duplicate: true, dev_report_id: existing.dev_report_id };
    }
    state.counters.dev_report += 1;
    const devReportId = `DEV-${String(state.counters.dev_report).padStart(3, "0")}`;
    state.dev_reports[report.execution_id] = { report, dev_report_id: devReportId, content_hash: contentHash(report) };
    this._save(state);
    return { registered: true, duplicate: false, dev_report_id: devReportId };
  }
}
