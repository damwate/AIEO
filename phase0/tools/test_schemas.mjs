// 机器可执行 Schema 的真实 Ajv 正/负例测试。
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import addKeywords from "ajv-keywords";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaDir = join(__dirname, "..", "..", "contracts", "v1.0");
const schemaNames = [
  "git-pointer.schema.json",
  "git-pointer-manifest.schema.json",
  "review-report.schema.json",
  "gpt-inbound-poc.schema.json",
];

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
addKeywords(ajv);

const validators = Object.fromEntries(schemaNames.map((name) => {
  const schema = JSON.parse(readFileSync(join(schemaDir, name), "utf8"));
  return [name, ajv.compile(schema)];
}));

const commitA = "a".repeat(40);
const commitB = "b".repeat(40);
const commitC = "c".repeat(40);
const shaA = "1".repeat(64);
const shaB = "2".repeat(64);
const shaC = "3".repeat(64);

const pointer = {
  transport: "git_pointer",
  owner: "Hulkhao",
  repo: "AIEO",
  branch: "fix/AIEO-PHASE0-REVIEW-R10",
  commit_sha: commitA,
  path: "handoff/manifest.json",
  artifact_sha256: shaA,
  size_bytes: 1024,
  media_type: "application/vnd.aieo.git-material-manifest+json",
  contract_version: "1.0",
  task_id: "T-P1-001",
  execution_id: "EXEC-001",
};
const manifest = {
  transport: "git_pointer_manifest",
  contract_version: "1.0",
  task_id: "T-P1-001",
  execution_id: "EXEC-001",
  files: [
    {
      path: "handoff/task.md",
      artifact_sha256: shaB,
      size_bytes: 100,
      media_type: "text/markdown",
    },
  ],
};
const review = {
  contract_version: "1.0",
  task_id: "T-P1-001",
  execution_id: "EXEC-001",
  correlation_id: "CORR-001",
  reviewer_agent_id: "GPT-03",
  reviewed_commit: commitA,
  input_material_commit: commitB,
  input_material_manifest_path: "handoff/manifest.json",
  input_material_manifest_sha256: shaA,
  task_package_hash: shaB,
  base_commit: commitC,
  engineering_standard_version: "v1.0.0",
  knowledge_base_commit: commitC,
  result: "PASS",
  summary: "审查通过",
};

const poc = {
  test: "INBOUND_SCHEMA_M1_POC",
  text: "汉".repeat(1000),
  task_id: "T-P1-901",
  execution_id: "EXEC-901",
  correlation_id: "CORR-901",
};

const cases = [];
function valid(schema, name, value) { cases.push({ schema, name, value, expected: true }); }
function invalid(schema, name, value) { cases.push({ schema, name, value, expected: false }); }
function changed(value, mutate) {
  const copy = structuredClone(value);
  mutate(copy);
  return copy;
}

valid("git-pointer.schema.json", "GitPointer 正例", pointer);
valid("git-pointer.schema.json", "GitPointer 未知可选字段兼容", { ...pointer, future_optional: true });
invalid("git-pointer.schema.json", "缺 owner 必填", changed(pointer, (v) => delete v.owner));
invalid("git-pointer.schema.json", "commit_sha 短 SHA", changed(pointer, (v) => { v.commit_sha = "abc123"; }));
invalid("git-pointer.schema.json", "artifact_sha256 非 64 位小写 hex", changed(pointer, (v) => { v.artifact_sha256 = "X".repeat(64); }));
invalid("git-pointer.schema.json", "size_bytes 为零", changed(pointer, (v) => { v.size_bytes = 0; }));
invalid("git-pointer.schema.json", "path 穿越", changed(pointer, (v) => { v.path = "handoff/../secret"; }));
invalid("git-pointer.schema.json", "path 外部 URL", changed(pointer, (v) => { v.path = "https://example.com/x"; }));
invalid("git-pointer.schema.json", "根指针不得直指裸文本", changed(pointer, (v) => { v.media_type = "text/plain"; }));
invalid("git-pointer.schema.json", "task_id 格式错误", changed(pointer, (v) => { v.task_id = "TASK-1"; }));

valid("git-pointer-manifest.schema.json", "单文件 manifest 正例", manifest);
valid("git-pointer-manifest.schema.json", "多文件 manifest 正例", {
  ...manifest,
  files: [
    ...manifest.files,
    { path: "handoff/data.json", artifact_sha256: shaC, size_bytes: 200, media_type: "application/json" },
  ],
});
invalid("git-pointer-manifest.schema.json", "缺 files 必填", changed(manifest, (v) => delete v.files));
invalid("git-pointer-manifest.schema.json", "files 空数组", changed(manifest, (v) => { v.files = []; }));
invalid("git-pointer-manifest.schema.json", "不同文件项 path 重复", {
  ...manifest,
  files: [
    ...manifest.files,
    { path: "handoff/task.md", artifact_sha256: shaC, size_bytes: 999, media_type: "text/plain" },
  ],
});
invalid("git-pointer-manifest.schema.json", "文件项缺 hash", changed(manifest, (v) => delete v.files[0].artifact_sha256));
invalid("git-pointer-manifest.schema.json", "文件项 size_bytes 非整数", changed(manifest, (v) => { v.files[0].size_bytes = 1.5; }));
invalid("git-pointer-manifest.schema.json", "文件媒体类型不支持", changed(manifest, (v) => { v.files[0].media_type = "application/octet-stream"; }));
invalid("git-pointer-manifest.schema.json", "文件 path 绝对路径", changed(manifest, (v) => { v.files[0].path = "/etc/passwd"; }));
invalid("git-pointer-manifest.schema.json", "manifest transport 错误", changed(manifest, (v) => { v.transport = "git_pointer"; }));

valid("review-report.schema.json", "审查 PASS 正例", review);
valid("review-report.schema.json", "审查 BLOCKED 讨论字段与未知字段", {
  ...review,
  result: "BLOCKED",
  required_boundaries: ["补 Schema"],
  failure_paths: ["写盘失败则 BLOCKED"],
  remaining_findings: ["待补真实 POC"],
  unblocked: false,
  future_optional: { ignored: true },
});
valid("review-report.schema.json", "findings 正例", {
  ...review,
  result: "REWORK",
  findings: [{ finding_id: "F-001", severity: "MAJOR", description: "需修复" }],
});
invalid("review-report.schema.json", "result 枚举错误", changed(review, (v) => { v.result = "SUCCESS"; }));
invalid("review-report.schema.json", "缺 summary", changed(review, (v) => delete v.summary));
invalid("review-report.schema.json", "缺 execution_id 绑定", changed(review, (v) => delete v.execution_id));
invalid("review-report.schema.json", "reviewed_commit 非完整 SHA", changed(review, (v) => { v.reviewed_commit = "1234567"; }));
invalid("review-report.schema.json", "缺输入 manifest hash 绑定", changed(review, (v) => delete v.input_material_manifest_sha256));
invalid("review-report.schema.json", "correlation_id 格式错误", changed(review, (v) => { v.correlation_id = "corr-1"; }));
invalid("review-report.schema.json", "unblocked 类型错误", changed(review, (v) => { v.unblocked = "false"; }));

valid("gpt-inbound-poc.schema.json", "入站 POC 1000 汉字正例", poc);
valid("gpt-inbound-poc.schema.json", "入站 POC 1500 汉字上界", changed(poc, (v) => { v.text = "汉".repeat(1500); }));
invalid("gpt-inbound-poc.schema.json", "入站 POC text 不足 1000", changed(poc, (v) => { v.text = "汉".repeat(999); }));
invalid("gpt-inbound-poc.schema.json", "入站 POC text 超 1500", changed(poc, (v) => { v.text = "汉".repeat(1501); }));
invalid("gpt-inbound-poc.schema.json", "入站 POC text 混入非汉字", changed(poc, (v) => { v.text = `${"汉".repeat(999)}A`; }));
invalid("gpt-inbound-poc.schema.json", "入站 POC test 标识错误", changed(poc, (v) => { v.test = "OTHER"; }));
invalid("gpt-inbound-poc.schema.json", "入站 POC 缺 correlation_id", changed(poc, (v) => { delete v.correlation_id; }));

let passed = 0;
let failed = 0;
for (const testCase of cases) {
  const validate = validators[testCase.schema];
  const actual = validate(testCase.value);
  const ok = actual === testCase.expected;
  const detail = actual ? "valid" : (validate.errors ?? []).map((error) => `${error.instancePath || "/"} ${error.message}`).join("; ");
  console.log(`${ok ? "PASS" : "FAIL"} [${testCase.schema}] ${testCase.name} -> ${actual} (${detail})`);
  if (ok) passed += 1;
  else failed += 1;
}
console.log(`SCHEMA_TEST_SUMMARY total=${cases.length} passed=${passed} failed=${failed}`);
if (failed > 0) process.exitCode = 1;
