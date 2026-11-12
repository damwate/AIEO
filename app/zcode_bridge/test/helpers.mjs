// AIEO Phase 1 M3 ZCode Bridge — 测试共享夹具
//
// 语义：所有测试不访问真实 M1 HTTP 服务、不真实调用 ZCode CLI（不联网派任务）。
// M1 用 FileBackedFakeM1Client / InMemoryWorkspaceLock 假实现；
// CLI 用 mock 可执行文件（node 脚本模拟 zcode --json 输出）。

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { NdjsonLogger, memorySink } from "../src/logger.mjs";

export const BRIDGE_ROOT = resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));

/** 每用例独立临时目录。 */
export function makeTempDir(prefix = "aieo-zb-test-") {
  return mkdtempSync(join(tmpdir(), prefix));
}

/** 干净的 NDJSON 测试日志器（内存 sink，同时可回读断言）。 */
export function makeTestLogger(env = "test") {
  const sink = memorySink();
  const logger = new NdjsonLogger({ logDir: "(memory)", env, writer: sink.write });
  return { logger, sink };
}

/** 03-协议 §5 任务包（预置进假 M1；字段为最小必备集 + 风险）。 */
export function seedTaskPackage(overrides = {}) {
  return {
    task_id: "T-P1-014",
    project_id: "AI-IMAGE-SERVICE",
    batch_id: "BATCH-001",
    title: "实现供应商适配器",
    description: "统一供应商接口适配器 + 异常处理",
    workspace_path: "D:/AIEO/workspaces/demo",
    base_commit: "a".repeat(40),
    files_scope: ["src/providers/"],
    forbidden_paths: ["docs/", "app/platform/"],
    branch_naming: "feature/T-P1-014-provider-adapter",
    test_command: "pytest tests/providers -q",
    acceptance_criteria: ["统一接口", "异常处理", "测试通过"],
    risk: "MEDIUM",
    ...overrides,
  };
}

/** 03-协议 §6 开发报告（合法样例，§6 示例同构）。 */
export function validDevReport(overrides = {}) {
  return {
    task_id: "T-P1-014",
    execution_id: "EXEC-001",
    status: "COMPLETED",
    implementation_summary: "完成供应商接口适配器",
    git: {
      repository: "AI-IMAGE-SERVICE",
      branch: "feature/T-P1-014-provider-adapter",
      base_commit: "a".repeat(40),
      commit_sha: "b".repeat(40),
      changed_files: ["src/providers/base.py", "src/providers/new_provider.py"],
    },
    tests: {
      executed: true,
      commands: ["pytest tests/providers -q"],
      passed: 25,
      failed: 0,
      log_artifact_id: "ART-TEST-001",
    },
    known_issues: [],
    knowledge_updates_required: true,
    self_assessment: "实现完成，等待独立审查",
    correlation_id: "CORR-001",
    batch_id: "BATCH-001",
    ...overrides,
  };
}

/** 解析工具返回 JSON 文本。 */
export function parseToolText(callResult) {
  const text = callResult?.content?.[0]?.text;
  if (typeof text !== "string") throw new Error(`工具未返回文本内容: ${JSON.stringify(callResult)}`);
  return JSON.parse(text);
}

/** 启动 MCP stdio 子进程客户端（JSON-RPC over stdio，行分隔）。 */
export class StdioMcpClient {
  constructor(serverScript, env = {}) {
    this.proc = spawn(process.execPath, [serverScript], {
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    this._buf = "";
    this._waiters = [];
    this.proc.stdout.setEncoding("utf8");
    this.proc.stdout.on("data", (chunk) => {
      this._buf += chunk;
      let idx;
      while ((idx = this._buf.indexOf("\n")) >= 0) {
        const line = this._buf.slice(0, idx).trim();
        this._buf = this._buf.slice(idx + 1);
        if (!line) continue;
        const waiter = this._waiters.shift();
        if (waiter) waiter(JSON.parse(line));
      }
    });
    this.stderrChunks = [];
    this.proc.stderr.setEncoding("utf8");
    this.proc.stderr.on("data", (c) => this.stderrChunks.push(c));
  }

  send(obj) {
    this.proc.stdin.write(JSON.stringify(obj) + "\n");
  }

  /** 等待下一条响应（按 id 匹配，容忍乱序通知）。 */
  async waitFor(id, timeoutMs = 15_000) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      let waiter;
      const p = await Promise.race([
        new Promise((res) => { waiter = res; this._waiters.push(waiter); }),
        new Promise((res) => setTimeout(() => {
          const i = this._waiters.indexOf(waiter);
          if (i >= 0) this._waiters.splice(i, 1); // 超时移除，避免吞掉后续消息
          res("TIMEOUT");
        }, Math.max(1, deadline - Date.now()))),
      ]);
      if (p === "TIMEOUT") throw new Error(`等待 JSON-RPC id=${id} 超时; stderr=${this.stderrChunks.join("")}`);
      if (p.id === id) return p;
      // 不匹配的行（通知/其他响应）：继续排队到 waiters 尾部由后续调用消费
    }
  }

  /** 请求-响应便捷方法。 */
  async rpc(method, params, timeoutMs = 15_000) {
    this._id = (this._id ?? 0) + 1;
    const id = this._id;
    this.send({ jsonrpc: "2.0", id, method, params });
    return this.waitFor(id, timeoutMs);
  }

  async initialize() {
    const resp = await this.rpc("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "aieo-zb-test-client", version: "0.1.0" },
    });
    this.send({ jsonrpc: "2.0", method: "notifications/initialized" });
    return resp;
  }

  async callTool(name, args, timeoutMs = 15_000) {
    const resp = await this.rpc("tools/call", { name, arguments: args }, timeoutMs);
    return resp.result ?? resp;
  }

  async close() {
    try { this.proc.stdin.end(); } catch { /* already closed */ }
    await new Promise((resolve) => {
      if (this.proc.exitCode !== null) return resolve();
      this.proc.on("exit", resolve);
      setTimeout(resolve, 5000).unref?.();
    });
  }
}

/** 唯一临时任务/执行 ID。 */
export function uniqueTaskId() {
  return `T-P1-${String(100 + Math.floor(Math.random() * 900))}`;
}

export function randomCorrelation() {
  return randomUUID();
}
