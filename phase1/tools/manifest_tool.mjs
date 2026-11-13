#!/usr/bin/env node
// AIEO Phase 1 证据链工具（T-P1-902 起替代 T-P1-901 第 8 轮的 inline 一行脚本）。
// 三个子命令，对应交接包 §3 材料核验协议 v2 的开发方机械核验三步：
//   manifest — 生成输入材料 manifest（逐文件磁盘字节 SHA-256 / size / media_type）
//   verify   — 磁盘字节 vs manifest 逐文件比对 → 核验报告 JSON（不入 manifest，
//              报告引用 manifest SHA 会自引用；method 指向同轮 blob 复核目录，F-601）
//   recheck  — commit 后对 git blob 全量重比（ls-tree 存在性 + cat-file blob SHA-256）
//              → phase0/logs/blob-recheck-<tag>/ 证据（受 amend 时序约束，不入 manifest）
// 本工具自身入 manifest 可审。仓库根执行；路径一律仓库根相对 POSIX（禁绝对/反斜杠/../）。
//
// 用法：
//   node phase1/tools/manifest_tool.mjs manifest --task T-P1-902 --execution EXEC-921 \
//        --purpose "..." --output phase1/manifests/T-P1-902-input-manifest.json -- <path>...
//   node phase1/tools/manifest_tool.mjs verify --manifest <manifest.json> \
//        --recheck-dir phase0/logs/blob-recheck-T-P1-902-r1 --output <report.json>
//   node phase1/tools/manifest_tool.mjs recheck --commit <40位SHA> --manifest <manifest.json> \
//        --output-dir phase0/logs/blob-recheck-T-P1-902-r1
// 退出码：manifest=1 有路径缺失；verify/recheck=1 当且仅当存在 mismatch/missing。

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { spawnSync } from "node:child_process";
import { argv, exit } from "node:process";

const RE_SHA40 = /^[0-9a-f]{40}$/;
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const mediaTypeOf = (path) => (extname(path).toLowerCase() === ".json" ? "application/json" : "text/plain");

function die(msg) {
  console.error(`manifest_tool: ${msg}`);
  exit(2);
}

/** 解析 --key value 形式参数（argv[2] 为子命令，自 argv[3] 起解析）；返回 {opts, positionals}。 */
function parseArgs(spec) {
  const opts = {};
  const positionals = [];
  const keys = new Set(spec);
  for (let i = 3; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--") {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (a.startsWith("--")) {
      const key = a.slice(2);
      if (!keys.has(key)) die(`未知参数 --${key}`);
      opts[key] = argv[i + 1];
      i += 1;
    } else {
      positionals.push(a);
    }
  }
  return { opts, positionals };
}

/** 路径合法性：仓库根相对 POSIX 身份路径（绝对盘符/反斜杠/../空段/".git" 尾段一律拒绝）。 */
function assertSafeRelPath(p) {
  if (typeof p !== "string" || p.length === 0) die(`非法路径（空）: ${JSON.stringify(p)}`);
  if (/^([A-Za-z]:|[/\\])/.test(p)) die(`拒绝绝对路径: ${p}`);
  if (p.includes("\\")) die(`拒绝反斜杠路径（须 POSIX 正斜杠）: ${p}`);
  const segs = p.split("/");
  if (segs.some((s) => s.length === 0 || s === "." || s === "..")) die(`拒绝空段/./..: ${p}`);
  if (segs.some((s) => s.toLowerCase().endsWith(".git"))) die(`拒绝 .git 段: ${p}`);
}

/** 递归展开输入（文件原样，目录全量下钻），返回去重排序的相对路径列表。 */
function expandInputs(inputs) {
  const out = new Set();
  const walk = (rel) => {
    assertSafeRelPath(rel);
    const st = statSync(rel);
    if (st.isDirectory()) {
      // 排除版本控制外的产物目录/文件：它们不进 git，列进 manifest 会让 recheck 必然失败
      for (const name of readdirSync(rel).sort()) {
        if (name === ".git" || name === "node_modules" || name === "__pycache__" || name === ".pytest_cache") continue;
        if (/\.(pyc|pyo)$/.test(name)) continue;
        walk(`${rel}/${name}`);
      }
    } else {
      out.add(rel);
    }
  };
  for (const raw of inputs) {
    if (typeof raw !== "string" || raw.length === 0) die("空输入路径");
    const rel = raw.replace(/\\/g, "/");
    assertSafeRelPath(rel);
    walk(rel);
  }
  return [...out].sort();
}

function runGit(args) {
  const r = spawnSync("git", args, { encoding: "buffer", maxBuffer: 1024 * 1024 * 512 });
  if (r.error) die(`git ${args[0]} 执行失败: ${r.error.message}`);
  return r;
}

// ---------------------------------------------------------------- manifest
function cmdManifest() {
  const { opts, positionals } = parseArgs(["task", "execution", "purpose", "output"]);
  for (const k of ["task", "execution", "purpose", "output"]) {
    if (!opts[k]) die(`manifest 缺 --${k}`);
  }
  if (positionals.length === 0) die("manifest 需在 -- 后给出至少一个输入路径");
  const files = expandInputs(positionals).map((path) => {
    const buf = readFileSync(path);
    return { path, artifact_sha256: sha256(buf), size_bytes: buf.length, media_type: mediaTypeOf(path) };
  });
  const manifest = {
    transport: "git_pointer_manifest",
    contract_version: "1.0",
    task_id: opts.task,
    execution_id: opts.execution,
    purpose: opts.purpose,
    files,
  };
  writeFileSync(opts.output, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`manifest: ${files.length} files -> ${opts.output}`);
  exit(0);
}

// ------------------------------------------------------------------ verify
function cmdVerify() {
  const { opts } = parseArgs(["manifest", "output", "recheck-dir"]);
  for (const k of ["manifest", "output", "recheck-dir"]) {
    if (!opts[k]) die(`verify 缺 --${k}`);
  }
  assertSafeRelPath(opts["recheck-dir"]);
  const manifest = JSON.parse(readFileSync(opts.manifest, "utf8"));
  if (manifest.transport !== "git_pointer_manifest") die("manifest transport 不是 git_pointer_manifest");
  const manifestBuf = readFileSync(opts.manifest);
  const perFile = manifest.files.map((entry) => {
    assertSafeRelPath(entry.path);
    const buf = readFileSync(entry.path);
    const disk = sha256(buf);
    return {
      path: entry.path,
      disk_sha256: disk,
      manifest_sha256: entry.artifact_sha256,
      size_bytes: buf.length,
      match: disk === entry.artifact_sha256 && buf.length === entry.size_bytes,
    };
  });
  const mismatched = perFile.filter((f) => !f.match);
  const report = {
    report_version: "1.3",
    task_id: manifest.task_id,
    execution_id: manifest.execution_id,
    generated_by: "main session (local execution environment), per handoff §3 protocol v2 division of labor",
    manifest_path: opts.manifest.replace(/\\/g, "/"),
    manifest_sha256: sha256(manifestBuf),
    // F-601 整改延续：method 必须指向本轮（同轮）blob 复核证据目录；
    // 锚定 commit 以该证据 recheck-result.json 的 commit_sha256_anchored 字段为准，不硬编码随 amend 变化的 SHA。
    method: `disk bytes SHA-256 per file vs manifest artifact_sha256; post-commit git blob recheck recorded in ${opts["recheck-dir"]}/ (amend-only-evidence-dir flow with review-anchor tag, per handoff §3 F-301/F-404 remediation); the anchoring commit of that recheck is recorded in its commit_sha256_anchored field (F-601: this report must reference the recheck evidence directory of the same round)`,
    commands: [
      "node phase1/tools/manifest_tool.mjs manifest …  # generate manifest (each file disk-byte sha256)",
      "node phase1/tools/manifest_tool.mjs verify --manifest <manifest> --recheck-dir <same-round recheck dir> --output <report>",
      "git ls-tree -r <reviewed_commit> --name-only  # all paths existence (post-commit, see blob-recheck evidence)",
      "git cat-file blob <reviewed_commit>:<path>    # post-commit blob SHA-256 recheck, all files (see blob-recheck evidence)",
    ],
    exit_code: mismatched.length === 0 ? 0 : 1,
    total_files: perFile.length,
    matched_files: perFile.length - mismatched.length,
    mismatched_files: mismatched.length,
    per_file: perFile,
  };
  writeFileSync(opts.output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`verify: ${report.matched_files}/${report.total_files} match, mismatch=${report.mismatched_files} -> ${opts.output}`);
  exit(report.exit_code);
}

// ----------------------------------------------------------------- recheck
function cmdRecheck() {
  const { opts } = parseArgs(["commit", "manifest", "output-dir"]);
  for (const k of ["commit", "manifest", "output-dir"]) {
    if (!opts[k]) die(`recheck 缺 --${k}`);
  }
  const commit = opts.commit;
  if (!RE_SHA40.test(commit)) die("recheck --commit 必须为完整 40 位 SHA");
  const manifest = JSON.parse(readFileSync(opts.manifest, "utf8"));
  const manifestSha = sha256(readFileSync(opts.manifest));
  // ① 存在性：一次 ls-tree 取全量路径集合
  const ls = runGit(["ls-tree", "-r", commit, "--name-only"]);
  if (ls.status !== 0) die(`git ls-tree 退出码 ${ls.status}: ${ls.stderr.toString().trim()}`);
  const inTree = new Set(ls.stdout.toString("utf8").split("\n").filter(Boolean));
  // ② 内容：逐文件 cat-file blob 重算 SHA-256（全量，无抽样）
  const perFile = manifest.files.map((entry) => {
    assertSafeRelPath(entry.path);
    const present = inTree.has(entry.path);
    let blobSha = null;
    let match = false;
    if (present) {
      const cat = runGit(["cat-file", "blob", `${commit}:${entry.path}`]);
      if (cat.status === 0) {
        blobSha = sha256(cat.stdout);
        match = blobSha === entry.artifact_sha256 && cat.stdout.length === entry.size_bytes;
      }
    }
    return { path: entry.path, blob_sha256: blobSha, manifest_sha256: entry.artifact_sha256, size_bytes: entry.size_bytes, match };
  });
  const missing = perFile.filter((f) => f.blob_sha256 === null).map((f) => f.path);
  const mismatched = perFile.filter((f) => f.blob_sha256 !== null && !f.match);
  const code = missing.length === 0 && mismatched.length === 0 ? 0 : 1;
  mkdirSync(opts["output-dir"], { recursive: true });
  const result = {
    recheck_version: "1.0",
    task_id: manifest.task_id,
    execution_id: manifest.execution_id,
    commit_sha256_anchored: commit,
    manifest_sha256: manifestSha,
    method: "git ls-tree -r <commit> --name-only (existence) + git cat-file blob <commit>:<path> SHA-256 (content), all files, no sampling",
    exit_code: code,
    total_files: perFile.length,
    paths_present_in_tree: perFile.length - missing.length,
    paths_missing_in_tree: missing,
    blob_matched: perFile.length - missing.length - mismatched.length,
    blob_mismatched: mismatched.length,
    per_file: perFile,
  };
  const outJson = join(opts["output-dir"], "recheck-result.json");
  const outLog = join(opts["output-dir"], "recheck-run.log");
  writeFileSync(outJson, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  const line = `[${new Date().toISOString()}] commit=${commit} tree=${result.paths_present_in_tree}/${result.total_files} blob=${result.blob_matched}/${result.total_files} exit=${code}\n`;
  writeFileSync(outLog, line, "utf8");
  console.log(line.trim());
  console.log(`recheck: -> ${outJson.replace(/\\/g, "/")}`);
  exit(code);
}

// ------------------------------------------------------------------ router
const sub = argv[2];
if (sub === "manifest") cmdManifest();
else if (sub === "verify") cmdVerify();
else if (sub === "recheck") cmdRecheck();
else die("用法: manifest_tool.mjs manifest|verify|recheck …");
