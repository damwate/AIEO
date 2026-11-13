#!/usr/bin/env node
// AIEO Phase 1 聚合包机器核验工具（BYTE_INTEGRITY_GATE，T-P1-903 r4 决议新增）。
// 职责划分（T-P1-903 r4：对象身份门禁 + 双层保证）：
//   本工具在主会话本地受控环境承担字节级完整性保证：分片逐项核验 → 按索引片序拼接 →
//   base64 解码 → TAR 总哈希 → 解包 → 95/95 逐文件 SHA-256/size 对照 manifest；
//   独立审查者只做 Git blob SHA-1 对象身份字符串比对（零计算），不重复本机字节级工作。
// 输出机器核验记录 JSON（绑定 commit + manifest SHA），入库存证；任一步失败退出码 1。
// 仓库根执行。
//
// 用法：
//   node phase1/tools/bundle_gate.mjs --commit <40位SHA> --parts-index phase1/manifests/bundle-parts.index.json \
//        --tar phase1/manifests/T-P1-903-input-bundle.tar --manifest phase1/manifests/T-P1-903-input-manifest.json \
//        --output-dir phase0/logs/bundle-gate-<task>-<round>
//
// 解包使用系统 tar（Windows System32 bsdtar / Git Bash tar）；解包目录为临时目录，核验后删除。

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, readdirSync, statSync, rmSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { argv, exit, tmpdir } from "node:process";

const RE_SHA40 = /^[0-9a-f]{40}$/;
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const sha1 = (buf) => createHash("sha1").update(buf).digest("hex");
const gitBlobSha1 = (buf) => sha1(Buffer.concat([Buffer.from(`blob ${buf.length}\0`, "utf8"), buf]));

function die(msg) {
  console.error(`bundle_gate: ${msg}`);
  exit(2);
}

function parseOpts(keys) {
  const opts = {};
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      if (!keys.includes(key)) die(`未知参数 --${key}`);
      opts[key] = argv[i + 1];
      i += 1;
    }
  }
  for (const k of keys) if (!opts[k]) die(`缺 --${k}`);
  return opts;
}

function assertSafeRelPath(p) {
  if (typeof p !== "string" || p.length === 0) die(`非法路径: ${JSON.stringify(p)}`);
  if (/^([A-Za-z]:|[/\\])/.test(p)) die(`拒绝绝对路径: ${p}`);
  if (p.includes("\\")) die(`拒绝反斜杠路径: ${p}`);
  const segs = p.split("/");
  if (segs.some((s) => s.length === 0 || s === "." || s === "..")) die(`拒绝空段/./..: ${p}`);
  if (segs.some((s) => s.toLowerCase().endsWith(".git"))) die(`拒绝 .git 段: ${p}`);
}

function walkFiles(rel, out) {
  const st = statSync(rel);
  if (st.isDirectory()) {
    for (const name of readdirSync(rel).sort()) walkFiles(`${rel}/${name}`, out);
  } else {
    out.push(rel);
  }
}

function runCmd(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: "buffer", maxBuffer: 1024 * 1024 * 512 });
  return { status: r.status, stderr: r.stderr ? r.stderr.toString().trim() : "", stdout: r.stdout };
}

// ------------------------------------------------------------------ main
const opts = parseOpts(["commit", "parts-index", "tar", "manifest", "output-dir"]);
const commit = opts.commit;
if (!RE_SHA40.test(commit)) die("--commit 必须为完整 40 位 SHA");

const startedAt = new Date().toISOString();
const partsIndex = JSON.parse(readFileSync(opts["parts-index"], "utf8"));
const manifest = JSON.parse(readFileSync(opts.manifest, "utf8"));
const manifestSha = sha256(readFileSync(opts.manifest));

const checks = { parts: [], tar: {}, unpack: {} };
let failed = 0;
const fail = (where, msg) => { checks[where].error = msg; failed += 1; };

// ① 逐分片核验：磁盘文件字节 → sha256 / git blob sha1 / b64 字符数；解码 → raw_bytes / raw_sha256
//    全部对照 parts-index 声明；严格按索引片序处理。
const decodedChunks = [];
for (const part of partsIndex.parts) {
  assertSafeRelPath(part.path);
  const buf = readFileSync(part.path);
  const text = buf.toString("utf8");
  const b64Chars = text.replace(/\s+/g, "").length;
  const raw = Buffer.from(text.replace(/\s+/g, ""), "base64");
  const rec = {
    part: part.part,
    path: part.path,
    file_bytes: { disk: buf.length, index: part.file_bytes, match: buf.length === part.file_bytes },
    sha256: { disk: sha256(buf), index: part.sha256, match: sha256(buf) === part.sha256 },
    git_blob_sha1: { disk: gitBlobSha1(buf), index: part.git_blob_sha1, match: gitBlobSha1(buf) === part.git_blob_sha1 },
    b64_chars: { disk: b64Chars, index: part.b64_chars, match: b64Chars === part.b64_chars },
    raw_bytes: { decoded: raw.length, index: part.raw_bytes, match: raw.length === part.raw_bytes },
    raw_sha256: { decoded: sha256(raw), index: part.raw_sha256, match: sha256(raw) === part.raw_sha256 },
  };
  if (Object.values(rec).some((v) => v && typeof v === "object" && v.match === false)) failed += 1;
  decodedChunks.push(raw);
  checks.parts.push(rec);
}

// ② 拼接 → TAR 总哈希三项：总字节数 / SHA-256 / git blob SHA-1，对照索引；并对照磁盘 TAR 本体
const tarBuf = readFileSync(opts.tar);
const tarDiskSha = sha256(tarBuf);
const tarRebuilt = Buffer.concat(decodedChunks);
checks.tar = {
  total_bytes: { rebuilt: tarRebuilt.length, disk: tarBuf.length, index: partsIndex.tar.total_bytes },
  sha256: { rebuilt: sha256(tarRebuilt), disk: tarDiskSha, index: partsIndex.tar.sha256 },
  git_blob_sha1: { disk: gitBlobSha1(tarBuf), index: partsIndex.tar.git_blob_sha1 },
};
checks.tar.total_bytes.match = tarRebuilt.length === tarBuf.length && tarBuf.length === partsIndex.tar.total_bytes;
checks.tar.sha256.match = sha256(tarRebuilt) === tarDiskSha && tarDiskSha === partsIndex.tar.sha256;
checks.tar.git_blob_sha1.match = gitBlobSha1(tarBuf) === partsIndex.tar.git_blob_sha1;
if (!(checks.tar.total_bytes.match && checks.tar.sha256.match && checks.tar.git_blob_sha1.match)) failed += 1;

// ③ 解包到临时隔离目录 → 95/95 数量/路径/size/SHA-256 逐文件对照 manifest（二进制不跳过）
if (failed === 0) {
  const extractRoot = mkdtempSync(join(tmpdir(), "bundle-gate-"));
  try {
    const t = runCmd("tar", ["-xf", opts.tar, "-C", extractRoot]);
    if (t.status !== 0) {
      checks.unpack.error = `tar 解包退出码 ${t.status}: ${t.stderr}`;
      failed += 1;
    } else {
      const extracted = [];
      walkFiles(extractRoot, extracted);
      const relExtracted = extracted.map((p) => p.slice(extractRoot.length + 1).replace(/\\/g, "/")).sort();
      const manifestPaths = manifest.files.map((f) => f.path).sort();
      const missing = manifestPaths.filter((p) => !relExtracted.includes(p));
      const extra = relExtracted.filter((p) => !manifestPaths.includes(p));
      const perFile = manifest.files.map((entry) => {
        assertSafeRelPath(entry.path);
        const buf = readFileSync(join(extractRoot, entry.path));
        return {
          path: entry.path,
          sha256: sha256(buf),
          manifest_sha256: entry.artifact_sha256,
          match: sha256(buf) === entry.artifact_sha256 && buf.length === entry.size_bytes,
        };
      });
      const mismatched = perFile.filter((f) => !f.match);
      checks.unpack = {
        extracted_count: relExtracted.length,
        manifest_count: manifestPaths.length,
        missing,
        extra,
        sha256_matched: perFile.length - mismatched.length,
        sha256_mismatched: mismatched.length,
        per_file: perFile,
      };
      if (missing.length || extra.length || mismatched.length) failed += 1;
    }
  } finally {
    rmSync(extractRoot, { recursive: true, force: true });
  }
}

// ④ 机器核验记录落盘（绑定 commit + manifest SHA + 工具自述）
const record = {
  bundle_gate_version: "1.0",
  gate: "BYTE_INTEGRITY_GATE",
  division_of_labor: "T-P1-903 r4：主会话本地受控环境承担字节级完整性（本记录）；独立审查者承担 Git blob SHA-1 对象身份门禁（OBJECT_IDENTITY_GATE，另行登记）；两门禁分开记录、不得互相替代",
  task_id: manifest.task_id,
  execution_id: manifest.execution_id,
  commit_sha256_anchored: commit,
  manifest_path: opts.manifest.replace(/\\/g, "/"),
  manifest_sha256: manifestSha,
  manifest_file_count: manifest.files.length,
  parts_index_path: opts["parts-index"].replace(/\\/g, "/"),
  tar_path: opts.tar.replace(/\\/g, "/"),
  started_at: startedAt,
  finished_at: new Date().toISOString(),
  exit_code: failed === 0 ? 0 : 1,
  checks,
};
mkdirSync(opts["output-dir"], { recursive: true });
const outJson = join(opts["output-dir"], "bundle-gate-result.json");
writeFileSync(outJson, `${JSON.stringify(record, null, 2)}\n`, "utf8");
const line = `[${new Date().toISOString()}] commit=${commit} parts=${checks.parts.length}/${partsIndex.chunking.total_parts} tar_ok=${failed === 0 || checks.tar.sha256.match} unpack=${checks.unpack.sha256_matched ?? "n/a"}/${checks.unpack.manifest_count ?? "n/a"} exit=${record.exit_code}\n`;
writeFileSync(join(opts["output-dir"], "bundle-gate-run.log"), line, "utf8");
console.log(line.trim());
console.log(`bundle_gate: -> ${outJson.replace(/\\/g, "/")}`);
exit(record.exit_code);
