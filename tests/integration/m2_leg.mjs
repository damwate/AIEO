// T-P1-902 集成验收 — M2 GPT 控制器 leg（headless 全管线，本地 DOM fixture）
//
// 复用 M2 模块测试夹具（fixtures/sim_page.mjs + tests/helpers.mjs），走真实
// runDispatch 13 步管线：发送双验 → 生成 → 确认窗 → 两次完整读取（≥3000ms）→
// DEC-017 收敛门禁 → artifact 落盘回读 → Schema 三 ID 绑定 → M1 本地登记簿登记。
// 不连 chatgpt.com（DEC-017 边界，如实申报）；登记簿为
// MINIMAL_LOCAL_M1_NOT_FULL_PLATFORM，产物由编排侧桥接登记到真实 M1（见 e2e_four_modules.py 步骤 5）。
//
// 用法（编排侧调用）：
//   node m2_leg.mjs --task-id T-P1-101 --execution-id EXEC-101 --correlation-id CORR-101 \
//        --output-dir <tmp> --schema <reply.schema.json 绝对路径>
// 成功时 stdout 最后一行输出摘要 JSON：{"ok":true,...}；任何失败以非 0 退出码结束。

import { readFileSync, existsSync, copyFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

import { runDispatch } from "../../app/gpt_controller/src/dispatch.mjs";
import { SessionStore } from "../../app/gpt_controller/src/session_store.mjs";
import {
  SESSION_URL,
  baseSessionUnits,
  cleanupTempDir,
  createFixturePage,
  fakeLock,
  newTempDir,
  replyScript,
  sessionHtml,
} from "../../app/gpt_controller/tests/helpers.mjs";

const M2_TEST_DIR = fileURLToPath(new URL("../../app/gpt_controller/tests/", import.meta.url));

// ---------- CLI 参数 ----------
function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, "");
    out[key] = argv[i + 1];
  }
  return out;
}

const args = parseArgs(process.argv);
const TASK_ID = args["task-id"];
const EXECUTION_ID = args["execution-id"];
const CORRELATION_ID = args["correlation-id"];
const OUTPUT_DIR = args["output-dir"] ? resolve(args["output-dir"]) : null;
const SCHEMA_PATH = args["schema"] ? resolve(args["schema"]) : join(M2_TEST_DIR, "fixtures", "reply.schema.json");

for (const [name, value] of [["task-id", TASK_ID], ["execution-id", EXECUTION_ID], ["correlation-id", CORRELATION_ID], ["output-dir", OUTPUT_DIR]]) {
  if (!value) {
    process.stderr.write(`[m2-leg][fatal] 缺少 --${name}\n`);
    process.exit(2);
  }
}

// ---------- 会话页 fixture（单 assistant unit 核心路径，DEC-017） ----------
// 回复 JSON 绑定真实任务三 ID（Schema required + 收敛门禁三 ID 一致性）。
const REPLY_JSON = JSON.stringify({
  status: "SUCCESS",
  task_id: TASK_ID,
  execution_id: EXECUTION_ID,
  correlation_id: CORRELATION_ID,
  summary: "集成验收：模块边界与平台契约一致，审查完成",
});

const tmp = newTempDir("aieo-int-m2-");
let result = null;
try {
  const page = createFixturePage({
    html: sessionHtml({ units: baseSessionUnits() }),
    viewportUnits: 4,
    onSend: ({ text, page: p }) => replyScript({ replyText: REPLY_JSON })({ text, page: p }),
  });

  const store = new SessionStore({ filePath: join(tmp, "sessions.json") });
  const session = store.create({ agent_id: "M2-R3" });

  result = await runDispatch({
    view: page,
    message: "请按指定 Schema 输出审查结论。",
    ids: { task_id: TASK_ID, execution_id: EXECUTION_ID, correlation_id: CORRELATION_ID },
    schemaPath: SCHEMA_PATH,
    registerM1: true,
    sessionStore: store,
    sessionId: session.session_id,
    configOverrides: {
      runtimeDir: tmp,
      generationTimeoutMs: 60000,
      confirmWindowMs: 1000,
      stableReadIntervalMs: 3000,
      sendAcceptTimeoutMs: 15000,
      pollIntervalMs: 500,
    },
    lock: fakeLock(),
    outputDir: OUTPUT_DIR ?? tmp,
  });

  // ---------- 完成判定与登记核对 ----------
  const checks = Object.entries(result.completion_checks ?? {});
  const failed = checks.filter(([, v]) => !v);
  if (failed.length > 0) {
    process.stderr.write(`[m2-leg][fatal] completion_checks 未全绿: ${JSON.stringify(Object.fromEntries(failed))}\n`);
    process.exit(1);
  }
  if (result.json_schema_binding?.status !== "PASS") {
    process.stderr.write(`[m2-leg][fatal] schema binding 非 PASS: ${JSON.stringify(result.json_schema_binding)}\n`);
    process.exit(1);
  }
  if (result.m1_registration?.status !== "REGISTERED") {
    process.stderr.write(`[m2-leg][fatal] M1 登记非 REGISTERED: ${JSON.stringify(result.m1_registration)}\n`);
    process.exit(1);
  }
  if (result.m1_registration?.adapter_scope !== "MINIMAL_LOCAL_M1_NOT_FULL_PLATFORM") {
    process.stderr.write(`[m2-leg][fatal] adapter_scope 与申报边界不符: ${result.m1_registration?.adapter_scope}\n`);
    process.exit(1);
  }

  const registryPath = join(tmp, "m1-artifact-registry.json");
  if (!existsSync(registryPath)) {
    process.stderr.write(`[m2-leg][fatal] 登记簿不存在: ${registryPath}\n`);
    process.exit(1);
  }
  // 登记簿持久化到编排侧 outputDir（tmp 目录随后清理，登记簿是集成证据之一）
  const persistentRegistryPath = join(String(OUTPUT_DIR ?? tmp), "m1-artifact-registry.json");
  copyFileSync(registryPath, persistentRegistryPath);
  const registry = JSON.parse(readFileSync(registryPath, "utf8"));
  const record = registry.records?.[0];
  if (!record || record.task_id !== TASK_ID || record.content !== REPLY_JSON) {
    process.stderr.write(`[m2-leg][fatal] 登记簿记录与三 ID/内容不符: ${JSON.stringify(record)?.slice(0, 300)}\n`);
    process.exit(1);
  }

  const summary = {
    ok: true,
    dispatch_id: result.dispatch_id,
    session_id: result.session_id,
    conversation_url: result.conversation_url ?? SESSION_URL,
    user_unit_key: result.user_unit_key,
    unit_keys: result.unit_keys,
    reply_sha256: createHash("sha256").update(REPLY_JSON, "utf8").digest("hex"),
    reply_bytes: Buffer.byteLength(REPLY_JSON, "utf8"),
    registry_artifact_id: record.artifact_id,
    registry_artifact_sha256: record.artifact_sha256 ?? record.content_sha256,
    registry_path: persistentRegistryPath,
    result_path: result.result_json_path ?? join(String(OUTPUT_DIR ?? tmp), String(result.dispatch_id), "result.json"),
    reply_content: REPLY_JSON,
  };
  process.stdout.write(JSON.stringify(summary) + "\n");
} catch (err) {
  process.stderr.write(`[m2-leg][fatal] ${err?.stack ?? err}\n`);
  process.exit(1);
} finally {
  cleanupTempDir(tmp);
}
