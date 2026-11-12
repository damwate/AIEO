// 测试 ⑤：NDJSON 日志字段符合 C4（platform-contract §5.1 全量字段表）
//
// 落盘位置：runtime/logs/zcode_bridge/test-runs/<时间戳>/（AIEO_ZCODE_BRIDGE_LOG_DIR
// 优先级覆盖；生产默认 runtime/logs/zcode_bridge，本用例只验证字段合规与轮转文件名）。

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync, rmSync, mkdirSync, utimesSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { NdjsonLogger, memorySink, redactValue, C4_FIELDS, C4_REQUIRED_FIELDS } from "../src/logger.mjs";
import { loadConfig, PROJECT_ROOT } from "../src/config.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
// C4 §5.2：普通运行日志按日期轮转；真实落盘目录按 C6 从配置解析（默认 runtime/logs/zcode_bridge）
const runtimeLogRoot = resolve(__dirname, "..", "..", "..", "runtime", "logs", "zcode_bridge", "test-runs", `m3-${Date.now()}`);
mkdirSync(runtimeLogRoot, { recursive: true });

function readNdjson(dir) {
  const files = readdirSync(dir).filter((f) => f.endsWith(".ndjson"));
  assert.ok(files.length >= 1, "应存在 bridge-*.ndjson 文件");
  return files.flatMap((f) => readFileSync(join(dir, f), "utf8").trim().split("\n")).filter(Boolean).map((l) => JSON.parse(l));
}

test("⑤-1 真实落盘：每行合法 JSON，必填字段齐全，字段集 ⊆ C4 字段表", () => {
  const log = new NdjsonLogger({ logDir: runtimeLogRoot, env: "test", retentionDays: 30 });
  log.info("mcp.tool.call", "领取任务成功", {
    operation: "claim_task", result: "SUCCESS", duration_ms: 12,
    task_id: "T-P1-014", execution_id: "EXEC-001", project_id: "AI-IMAGE-SERVICE", batch_id: "BATCH-001",
    correlation_id: "CORR-501", trace_id: "trace-501", agent_id: "ZCODE-01", agent_type: "developer",
    session_id: "SES-TEST", error_code: undefined, retryable: undefined, attempt: 1,
  });
  log.error("cli.tree_kill", "进程树终止兜底", {
    operation: "trigger", result: "SUCCESS", task_id: "T-P1-014", process_id: process.pid, exit_code: 1, duration_ms: 400,
  });
  log.close();

  const rows = readNdjson(runtimeLogRoot);
  assert.ok(rows.length >= 2);
  for (const row of rows) {
    for (const f of C4_REQUIRED_FIELDS) {
      assert.ok(row[f] !== undefined, `缺 C4 必填字段 ${f}`);
    }
    for (const f of Object.keys(row)) {
      assert.ok(C4_FIELDS.includes(f), `字段 ${f} 不在 C4 §5.1 字段表内`);
    }
    assert.equal(row.service, "zcode_bridge");
    assert.equal(row.module, "M3");
    assert.equal(row.env, "test");
    // timestamp ISO 8601 UTC（...Z 结尾，存储统一 UTC）
    assert.match(row.timestamp, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    assert.ok(["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"].includes(row.level));
    // result 枚举（C4 §5.1-19）
    if (row.result !== undefined) assert.ok(["SUCCESS", "FAILURE", "RETRY", "BLOCKED", "SKIPPED"].includes(row.result));
  }
  const call = rows.find((r) => r.event === "mcp.tool.call");
  assert.equal(call.operation, "claim_task");
  assert.equal(call.task_id, "T-P1-014");
  assert.equal(call.duration_ms, 12);
  assert.equal(call.correlation_id, "CORR-501");
  const kill = rows.find((r) => r.event === "cli.tree_kill");
  assert.equal(kill.process_id, process.pid, "外部 CLI/子进程生命周期事件应含 process_id");
  assert.equal(kill.exit_code, 1);
});

test("⑤-2 表外字段 fail-closed：拒绝整条写入并降级记录 field_rejected", () => {
  const sink = memorySink();
  const log = new NdjsonLogger({ logDir: "(memory)", env: "test", writer: sink.write });
  const ok = log.info("some.event", "带表外字段", { task_id: "T-P1-014", evil_field: "x" });
  assert.equal(ok, true);
  const recs = sink.records();
  assert.equal(recs.length, 1);
  assert.equal(recs[0].event, "log.field_rejected");
  assert.match(recs[0].message, /evil_field/);
  assert.ok(!("evil_field" in recs[0]), "表外字段不得落盘");
  assert.equal(recs[0].result, "SKIPPED");
});

test("⑤-3 非法 result 枚举与缺必填字段：原记录不落盘，降级写拒绝记录", () => {
  const sink = memorySink();
  const log = new NdjsonLogger({ logDir: "(memory)", env: "test", writer: sink.write });
  // result 枚举非法：原记录不落盘，降级写 log.record_rejected（与表外字段处理一致）
  assert.equal(log.info("e1", "坏 result", { result: "OK" }), true);
  assert.equal(log.info("e2", "坏 retryable", { retryable: "yes" }), true); // retryable 非枚举字段，布尔校验留给调用方
  const badRequired = new NdjsonLogger({ logDir: "(memory)", env: "test", writer: sink.write });
  // 防御路径：env 缺失时拒绝写入且无法降级（降级记录同样缺 env），仅 stderr 报告
  const broken = Object.create(badRequired);
  broken.env = undefined;
  assert.equal(broken.info("e3", "缺 env"), false);
  const recs = sink.records();
  assert.equal(recs.length, 2, "e1 降级记录 + e2 正常记录；e3 被拒");
  assert.equal(recs[0].event, "log.record_rejected");
  assert.match(recs[0].message, /e1/);
  assert.equal(recs[1].event, "e2");
});

test("⑤-4 脱敏（C4 §5.4）：敏感键整值丢弃", () => {
  const redacted = redactValue({
    authorization: "Bearer secret-token",
    cookie: "sid=abc",
    password: "hunter2",
    api_key: "AKIA...",
    nested: { token: "t", keep: "v", deeper: [{ secret: "s", ok: 1 }] },
    normal: "fine",
  });
  assert.equal(redacted.authorization, "[REDACTED:string]");
  assert.equal(redacted.cookie, "[REDACTED:string]");
  assert.equal(redacted.password, "[REDACTED:string]");
  assert.equal(redacted.api_key, "[REDACTED:string]");
  assert.equal(redacted.nested.token, "[REDACTED:string]");
  assert.equal(redacted.nested.keep, "v");
  assert.equal(redacted.nested.deeper[0].secret, "[REDACTED:string]");
  assert.equal(redacted.nested.deeper[0].ok, 1);
  assert.equal(redacted.normal, "fine");
});

test("⑤-5 C6 落盘路径解析：AIEO_ZCODE_BRIDGE_LOG_DIR > AIEO_LOG_DIR > 默认 runtime/logs/zcode_bridge", () => {
  assert.equal(loadConfig({}).logDir, join(PROJECT_ROOT, "runtime", "logs", "zcode_bridge"));
  assert.equal(
    loadConfig({ AIEO_LOG_DIR: "runtime/logs" }).logDir,
    join(PROJECT_ROOT, "runtime", "logs", "zcode_bridge"),
    "共享 AIEO_LOG_DIR 追加 zcode_bridge 子目录"
  );
  assert.equal(
    loadConfig({ AIEO_ZCODE_BRIDGE_LOG_DIR: "tmp/custom-log" }).logDir,
    join(PROJECT_ROOT, "tmp", "custom-log"),
    "模块级变量优先"
  );
});

test("⑤-6 保留期轮转清理：过期 bridge-*.ndjson 被删除，30 天内保留", () => {
  const dir = join(runtimeLogRoot, "..", `retention-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  const old = join(dir, "bridge-2026-01-01.ndjson");
  const fresh = join(dir, "bridge-2099-01-01.ndjson");
  for (const f of [old, fresh]) {
    writeFileSync(f, '{"timestamp":"2026-01-01T00:00:00.000Z"}\n', "utf8");
  }
  // 以真实时钟为准（sweepRetention 默认 this.clock()）：old 设为远早于 now-30d 的 mtime
  utimesSync(old, new Date("2020-01-01"), new Date("2020-01-01"));
  const sink = memorySink();
  const log = new NdjsonLogger({ logDir: dir, env: "test", writer: sink.write, retentionDays: 30 });
  const removed = log.sweepRetention();
  assert.equal(removed, 1);
  assert.equal(existsSync(old), false);
  assert.equal(existsSync(fresh), true);
  rmSync(dir, { recursive: true, force: true });
});
