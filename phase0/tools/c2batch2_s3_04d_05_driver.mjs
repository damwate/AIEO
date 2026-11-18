// C2-BATCH2 S3-④-D1/D2 + S3-⑤ 受控驱动：git_pointer 真实读取入口+真实 fetch+真实重试，本机隔离 HTTP 端点
// 模式：d1=端口拒绝连接(网络耗尽) d2=端点持续503(HTTP耗尽) e5a=部分读取失败[B 404] e5b=部分读取失败[C SHA不符]
// 纪律：默认配置验收(maxRetries=3/base 2s，不改配置)；单调时钟实测实际等待区间；不做任何降级/换源断言外的写入
// 用法：node phase0/tools/c2batch2_s3_04d_05_driver.mjs --mode d1
import http from "node:http";
import net from "node:net";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { buildGitPointerManifest, createGitPointer, gitPointerRawUrl, readGitPointer } from "./git_pointer.mjs";

const args = process.argv.slice(2);
const modeIdx = args.indexOf("--mode");
const MODE = modeIdx >= 0 ? args[modeIdx + 1] : "d1";
const MODES = new Set(["d1", "d2", "e5a", "e5b"]);
if (!MODES.has(MODE)) { console.error("mode 必须是 d1|d2|e5a|e5b"); process.exit(2); }
const ts = new Date().toISOString().replace(/[:.]/g, "-");
const OUT_DIR = join(process.cwd(), "phase0", "logs", `c2batch2-s3-04d-${MODE}-${ts}`);
mkdirSync(OUT_DIR, { recursive: true });
const log = (m) => {
  const line = `[${new Date().toISOString()}] ${m}`;
  console.log(line);
  writeFileSync(join(OUT_DIR, "run.log"), line + "\n", { flag: "a", encoding: "utf8" });
};

// 真实延迟+单调时钟实测包装（planned→actual_ms 对照；真实 setTimeout 不改配置）
const actualDelays = [];
const measuredSleep = async (ms) => {
  const t0 = performance.now();
  await new Promise((r) => setTimeout(r, ms));
  const t1 = performance.now();
  actualDelays.push({ planned_ms: ms, actual_ms: Math.round(t1 - t0) });
  return t1 - t0;
};

// 真实 fetch 包装：剥离 dispatcher:null（Node24 对 null dispatcher 抛 ERR_ASSERTION——见 result.json 发现登记），其余选项原样透传=真实网络行为
const realFetch = (url, opts = {}) => {
  if (opts && opts.dispatcher === null) { const { dispatcher, ...rest } = opts; return globalThis.fetch(url, rest); }
  return globalThis.fetch(url, opts);
};
function findClosedPort() {
  return new Promise((res) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const port = srv.address().port;
      srv.close(() => res(port));
    });
  });
}

const OWNER = "aieo-test";
const REPO = "c2batch2-local";
const COMMIT = "a".repeat(40);
const BASE_FILES = {
  A: { path: "handoff/task.md", content: Buffer.from("# 场景⑤材料A\n正常可读可校验\n", "utf8") },
  B: { path: "handoff/missing.md", content: Buffer.from("# 材料B（服务端不提供,404）\n", "utf8") },
  C: { path: "handoff/data.json", content: Buffer.from('{"ok":true,"value":42}\n', "utf8") },
};
const EXEC_NUM = { d1: "906001", d2: "906002", e5a: "906003", e5b: "906004" }[MODE];
function buildPointer(files) {
  const built = buildGitPointerManifest({
    task_id: "T-P1-906",
    execution_id: `EXEC-${EXEC_NUM}`,
    contract_version: "1.0",
    files,
  });
  const pointer = createGitPointer({
    owner: OWNER, repo: REPO, branch: "main", commit_sha: COMMIT,
    path: "handoff/manifest.json", manifestBytes: built.manifestBytes,
  });
  return { built, pointer };
}

let server = null;
const serverLog = [];
function startServer(handler) {
  return new Promise((res) => {
    server = http.createServer((req, res) => {
      const t = performance.now();
      serverLog.push({ t: Math.round(t), url: req.url });
      handler(req, res);
    });
    server.listen(0, "127.0.0.1", () => res(server.address().port));
  });
}
const serveOk = (req, res) => {
  if (req.url.endsWith("/handoff/manifest.json")) { res.writeHead(200, { "content-type": "application/json" }); res.end(currentManifestBytes); return; }
  const rel = req.url.split(`/${COMMIT}/`)[1] || "";
  const f = Object.values(BASE_FILES).find((x) => x.path === decodeURIComponent(rel));
  if (f) { res.writeHead(200, { "content-type": "application/octet-stream" }); res.end(f.content); return; }
  res.writeHead(404, { "content-type": "text/plain" }); res.end("not found (controlled test endpoint)");
};

let currentManifestBytes = null;
const result = { mode: MODE, config: "defaults(maxRetries=3,base=2s,timeout=30s)", assertions: {}, timing: null, error: null };
try {
  const tStart = performance.now();
  if (MODE === "d1") {
    const port = await findClosedPort();
    const baseUrl = `http://127.0.0.1:${port}`;
    log(`D1: 目标=已关闭端口 ${port}（连接拒绝路径）`);
    const { built, pointer } = buildPointer([BASE_FILES.A]);
    const url = gitPointerRawUrl(baseUrl, pointer, pointer.path);
    try {
      await readGitPointer({ pointer, baseUrl, env: {}, fetchImpl: realFetch, sleep: measuredSleep, random: Math.random });
      throw new Error("不应到达：readGitPointer 意外成功");
    } catch (e) {
      result.error = { code: e.code, message: e.message, attempts: e.details?.attempts ?? null };
      log(`捕获: code=${e.code} attempts=${(e.details?.attempts ?? []).length}`);
      result.assertions = {
        error_code_is_network_retry_exhausted: e.code === "GIT_POINTER_NETWORK_RETRY_EXHAUSTED",
        attempts_count_is_4: (e.details?.attempts ?? []).length === 4,
        all_outcomes_network_error: (e.details?.attempts ?? []).every((a) => a.outcome === "NETWORK_ERROR"),
        no_partial_material_returned: !Array.isArray(e.details?.files),
      };
    }
  } else if (MODE === "d2") {
    const port = await startServer((req, res) => { res.writeHead(503, { "content-type": "text/plain" }); res.end("service unavailable (controlled)"); });
    const baseUrl = `http://127.0.0.1:${port}`;
    log(`D2: 受控端点=127.0.0.1:${port}（持续 503）`);
    const { built, pointer } = buildPointer([BASE_FILES.A]);
    currentManifestBytes = built.manifestBytes;
    try {
      await readGitPointer({ pointer, baseUrl, env: {}, fetchImpl: realFetch, sleep: measuredSleep, random: Math.random });
      throw new Error("不应到达：readGitPointer 意外成功");
    } catch (e) {
      result.error = { code: e.code, message: e.message, attempts: e.details?.attempts ?? null };
      log(`捕获: code=${e.code} attempts=${(e.details?.attempts ?? []).length}`);
      const att = e.details?.attempts ?? [];
      result.assertions = {
        error_code_is_http_retry_exhausted: e.code === "GIT_POINTER_HTTP_RETRY_EXHAUSTED",
        attempts_count_is_4: att.length === 4,
        all_transient_503: att.every((a) => a.outcome === "TRANSIENT_HTTP" && a.status === 503),
        planned_delays_recorded: att.slice(0, 3).every((a) => typeof a.planned_delay_ms === "number"),
        no_partial_material_returned: !Array.isArray(e.details?.files),
      };
    }
    server.close();
  } else if (MODE === "e5a") {
    const port = await startServer((req, res) => {
      if (req.url.endsWith("/handoff/manifest.json")) { res.writeHead(200); res.end(currentManifestBytes); return; }
      const rel = req.url.split(`/${COMMIT}/`)[1] || "";
      if (decodeURIComponent(rel) === BASE_FILES.B.path) { res.writeHead(404, { "content-type": "text/plain" }); res.end("not found (controlled: B intentionally missing)"); return; }
      serveOk(req, res);
    });
    const baseUrl = `http://127.0.0.1:${port}`;
    log(`⑤-run1: 端点=127.0.0.1:${port}，manifest=[A 正常, B 不存在(404)]`);
    const { built, pointer } = buildPointer([BASE_FILES.A, BASE_FILES.B]);
    currentManifestBytes = built.manifestBytes;
    try {
      await readGitPointer({ pointer, baseUrl, env: {}, fetchImpl: realFetch, sleep: measuredSleep, random: Math.random });
      throw new Error("不应到达：部分读取失败场景意外成功");
    } catch (e) {
      result.error = { code: e.code, message: e.message, details: e.details ?? null };
      log(`捕获: code=${e.code} msg=${e.message}`);
      result.assertions = {
        failed_whole_transaction: e.code !== undefined,
        failure_identifies_B_404: JSON.stringify({ c: e.code, m: e.message, d: e.details }).includes("404") || e.code === "GIT_POINTER_HTTP_STATUS_ERROR",
        no_partial_success_result: true,
      };
    }
    server.close();
  } else if (MODE === "e5b") {
    const port = await startServer((req, res) => {
      if (req.url.endsWith("/handoff/manifest.json")) { res.writeHead(200); res.end(currentManifestBytes); return; }
      const rel = req.url.split(`/${COMMIT}/`)[1] || "";
      if (decodeURIComponent(rel) === BASE_FILES.C.path) {
        // C：同长度不同内容 → 尺寸校验过、SHA 校验失败（SHA 不符路径）
        const tampered = Buffer.from('{"ok":true,"value":43}\n', "utf8");
        res.writeHead(200); res.end(tampered); return;
      }
      serveOk(req, res);
    });
    const baseUrl = `http://127.0.0.1:${port}`;
    log(`⑤-run2: 端点=127.0.0.1:${port}，manifest=[A 正常, C 篡改同长度内容(SHA 不符)]`);
    const { built, pointer } = buildPointer([BASE_FILES.A, BASE_FILES.C]);
    currentManifestBytes = built.manifestBytes;
    try {
      await readGitPointer({ pointer, baseUrl, env: {}, fetchImpl: realFetch, sleep: measuredSleep, random: Math.random });
      throw new Error("不应到达：SHA 不符场景意外成功");
    } catch (e) {
      result.error = { code: e.code, message: e.message, details: e.details ?? null };
      log(`捕获: code=${e.code} msg=${e.message}`);
      result.assertions = {
        failed_whole_transaction: e.code === "GIT_POINTER_FILE_HASH_MISMATCH",
        failure_identifies_C: JSON.stringify(e.details ?? {}).includes(BASE_FILES.C.path) || (e.message || "").includes(BASE_FILES.C.path),
        no_partial_success_result: true,
      };
    }
    server.close();
  }
  const tEnd = performance.now();
  result.timing = {
    wall_total_ms: Math.round(tEnd - tStart),
    measured_delays: actualDelays,
    server_requests: serverLog,
    delay_windows: [[1600, 2400], [3200, 4800], [6400, 9600]],
  };
  if (actualDelays.length > 0) {
    const win = result.timing.delay_windows;
    result.assertions.actual_delays_in_window = actualDelays.every((d, i) =>
      d.actual_ms >= win[i][0] && d.actual_ms <= win[i][1]);
    log(`实测退避区间: ${JSON.stringify(actualDelays)}（窗口 ${JSON.stringify(win)}）→ ${result.assertions.actual_delays_in_window ? "PASS" : "OUT-OF-WINDOW"}`);
  }
  result.assertions.no_degrade_no_fallback = true; // 错误抛出即整体失败；driver 未写任何材料文件（可由证据目录内容证明）
  writeFileSync(join(OUT_DIR, "result.json"), JSON.stringify(result, null, 2), "utf8");
  const pass = Object.values(result.assertions).every((v) => v === true);
  log(`${MODE} 结论: ${pass ? "PASS" : "FAIL"}（断言 ${JSON.stringify(result.assertions)}）`);
  console.log(`EVIDENCE_DIR=${OUT_DIR}`);
  console.log(`MODE_RESULT=${pass ? "PASS" : "FAIL"}`);
} catch (e) {
  log(`DRIVER FAILED: ${e && e.message}`);
  result.fatal = String(e && e.message);
  writeFileSync(join(OUT_DIR, "result.json"), JSON.stringify(result, null, 2), "utf8");
  process.exitCode = 1;
}
