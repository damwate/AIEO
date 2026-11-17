// v1.1 结构化契约 Ajv 2020 正/负例测试（DEC-097 #1=A）。
// 统一 findings 定义以稳定 $id 注册一次（addSchema），四份 v1.1 契约 $ref 同一 URI；
// 禁止远程自动加载。覆盖四契约结构化 findings 原样通过、负例 fail-closed、v1.0 历史兼容。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Ajv2020 = require("ajv/dist/2020.js");
const addFormats = require("ajv-formats");
const __dirname = dirname(fileURLToPath(import.meta.url));
const v10 = join(__dirname, "..", "..", "contracts", "v1.0");
const v11 = join(__dirname, "..", "..", "contracts", "v1.1");
const FINDINGS_ID = "https://aieo.local/contracts/v1.1/_defs/findings.schema.json";

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const findingsDef = JSON.parse(readFileSync(join(v11, "_defs", "findings.schema.json"), "utf8"));
ajv.addSchema(findingsDef); // 先注册统一定义，四契约 $ref 才能解析

const names = ["review-report", "arch-review-report", "test-acceptance-review", "engineering-audit-report"];
const validators = Object.fromEntries(names.map((n) => [
  n, ajv.compile(JSON.parse(readFileSync(join(v11, `${n}.schema.json`), "utf8"))),
]));
// v1.0 历史校验器（验证历史报告仍可读）
const v10Validators = Object.fromEntries(names.map((n) => [
  n, ajv.compile(JSON.parse(readFileSync(join(v10, `${n}.schema.json`), "utf8"))),
]));

const HEX40 = "a".repeat(40);
const HEX64 = "b".repeat(64);
const structuredFindings = [
  { finding_id: "F-1", severity: "BLOCKER", description: "执行证据链断裂", file: "x.py", line: 12, category: "evidence", impact: "不可登记", recommendation: "补证据" },
  { finding_id: "F-2", severity: "MINOR", description: "命名问题" },
];
const cases = [
  ["四契约：结构化 findings 原样通过（v1.1）", () => {
    const base = {
      "review-report": { contract_version: "1.1", task_id: "T-001", execution_id: "EXEC-001", correlation_id: "CORR-001", reviewer_agent_id: "GPT-03", reviewed_commit: HEX40, input_material_commit: HEX40, input_material_manifest_path: "a/b.json", input_material_manifest_sha256: HEX64, task_package_hash: HEX64, base_commit: HEX40, engineering_standard_version: "es-v1", knowledge_base_commit: HEX40, result: "REWORK", summary: "s", findings: structuredFindings },
      "arch-review-report": { contract_version: "1.1", task_id: "T-001", review_round_id: "r1", reviewer_agent_id: "GPT-02", engine_agent_id: "ENGINE-02", input_material_commit: HEX40, input_material_manifest_sha256: HEX64, brief_sha256: HEX64, result: "REWORK", summary: "s", findings: structuredFindings, unblocked: false },
      "test-acceptance-review": { contract_version: "1.1", task_id: "T-001", review_round_id: "r1", reviewer_agent_id: "GPT-04", engine_agent_id: "ENGINE-03", commit_sha: HEX40, execution_id: "EXEC-001", execution_result_observed: "EXECUTED_PASS", result: "REWORK", summary: "s", findings: structuredFindings },
      "engineering-audit-report": { contract_version: "1.1", batch_id: "BATCH-001", audit_round_id: "r1", reviewer_agent_id: "GPT-05", engine_agent_id: "ENGINE-04", input_material_commit: HEX40, input_material_manifest_sha256: HEX64, brief_sha256: HEX64, standards_matrix: [{ standard_id: "S1", applicable: true, requirement: "r", evidence_refs: [], result: "BLOCKED", findings: "单项说明", residual_risks: "" }], result: "BLOCKED", release_recommendation: "DO_NOT_SUBMIT", summary: "s", findings: structuredFindings, risks: [] },
    };
    for (const n of names) {
      const ok = validators[n](base[n]);
      assert.equal(ok, true, `${n} 结构化 findings 应通过: ${JSON.stringify(validators[n].errors)}`);
    }
  }],
  ["负例：v1.1 缺 required 字段 / severity 非法枚举 fail-closed", () => {
    const mk = (f) => ({ contract_version: "1.1", task_id: "T-001", review_round_id: "r1", reviewer_agent_id: "GPT-02", engine_agent_id: "ENGINE-02", input_material_commit: HEX40, input_material_manifest_sha256: HEX64, brief_sha256: HEX64, result: "PASS", summary: "s", findings: f });
    assert.equal(validators["arch-review-report"](mk([{ finding_id: "F", description: "无 severity" }])), false, "缺 severity 应拒");
    assert.equal(validators["arch-review-report"](mk([{ severity: "CRITICAL", description: "无 id" }])), false, "缺 finding_id 应拒");
    assert.equal(validators["arch-review-report"](mk([{ finding_id: "F", severity: "HUGE", description: "x" }])), false, "非法 severity 枚举应拒");
    assert.equal(validators["arch-review-report"](mk([{ finding_id: "F", severity: "MINOR" }])), false, "缺 description 应拒");
  }],
  ["负例：legacy string[] findings 在 v1.1 下 fail-closed", () => {
    const bad = { contract_version: "1.1", task_id: "T-001", review_round_id: "r1", reviewer_agent_id: "GPT-02", engine_agent_id: "ENGINE-02", input_material_commit: HEX40, input_material_manifest_sha256: HEX64, brief_sha256: HEX64, result: "PASS", summary: "s", findings: ["旧格式字符串"] };
    assert.equal(validators["arch-review-report"](bad), false, "string[] 在 v1.1 应拒（须结构化对象）");
  }],
  ["正例：结构化 finding 附加字段允许（additionalProperties=true）", () => {
    const ok = { contract_version: "1.1", task_id: "T-001", review_round_id: "r1", reviewer_agent_id: "GPT-02", engine_agent_id: "ENGINE-02", input_material_commit: HEX40, input_material_manifest_sha256: HEX64, brief_sha256: HEX64, result: "PASS", summary: "s", findings: [{ finding_id: "F", severity: "INFO", description: "ok", custom_tag: "leg-specific" }] };
    assert.equal(validators["arch-review-report"](ok), true);
  }],
  ["v1.0 历史兼容：旧 string[] findings 报告仍可被 v1.0 契约校验通过", () => {
    const legacy = { contract_version: "1.0", task_id: "T-001", review_round_id: "r1", reviewer_agent_id: "GPT-02", engine_agent_id: "ENGINE-02", input_material_commit: HEX40, input_material_manifest_sha256: HEX64, brief_sha256: HEX64, result: "PASS", summary: "s", findings: ["旧格式仍然可读"] };
    assert.equal(v10Validators["arch-review-report"](legacy), true, "v1.0 历史 string[] 报告须仍可读");
  }],
  ["engineering-audit v1.1：standards_matrix[].findings 保持 string（规划复审③）", () => {
    const ok = { contract_version: "1.1", batch_id: "BATCH-001", audit_round_id: "r1", reviewer_agent_id: "GPT-05", engine_agent_id: "ENGINE-04", input_material_commit: HEX40, input_material_manifest_sha256: HEX64, brief_sha256: HEX64, standards_matrix: [{ standard_id: "S1", applicable: false, requirement: "r", evidence_refs: [], result: "PASS", findings: "豁免理由文本", residual_risks: "" }], result: "ACCEPTED", release_recommendation: "SUBMIT_FOR_APPROVAL", summary: "s", findings: [], risks: [] };
    assert.equal(validators["engineering-audit-report"](ok), true);
    const bad = JSON.parse(JSON.stringify(ok));
    bad.standards_matrix[0].findings = { not: "string" };
    assert.equal(validators["engineering-audit-report"](bad), false, "矩阵内 findings 须仍为 string");
  }],
];

let passed = 0;
for (const [label, fn] of cases) {
  try { fn(); console.log("PASS", label); passed += 1; }
  catch (e) { console.error("FAIL", label, "-", e.message); process.exitCode = 1; }
}
console.log(`SUMMARY total=${cases.length} passed=${passed} failed=${cases.length - passed}`);
