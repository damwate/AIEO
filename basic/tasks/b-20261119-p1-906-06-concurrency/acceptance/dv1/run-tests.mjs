// DV1 一次性验证执行器：加载契约→自检→跑正反例矩阵→落机器可读结果。只读输入，输出 test-results.json。
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { checkSchemaSelfConsistency, validateEvent } from "./semantic-validator.mjs";

const dir = new URL("./", import.meta.url);
const read = (f) => readFileSync(new URL(f, dir), "utf8");
const sha = (s) => createHash("sha256").update(s, "utf8").digest("hex");
const cases = JSON.parse(read("test-cases.json"));

const selfCheck = checkSchemaSelfConsistency();
const results = cases.cases.map((c) => {
  const r = validateEvent(c.event, c.context || []);
  const expectedPass = c.expect === "pass";
  const ok = expectedPass ? r.valid : !r.valid;
  return {
    id: c.id, event_type: c.event?.event_type, expect: c.expect,
    actual: r.valid ? "pass" : "reject", ok,
    errors: r.errors,
  };
});
const allOk = selfCheck.consistent && results.every((r) => r.ok);
const report = {
  contract: cases.contract,
  schema_self_consistency: selfCheck,
  summary: {
    total: results.length,
    pass_expected: results.filter((r) => r.expect === "pass").length,
    reject_expected: results.filter((r) => r.expect === "reject").length,
    matched: results.filter((r) => r.ok).length,
    all_ok: allOk,
  },
  input_sha256: {
    "event-contract.schema.json": sha(read("event-contract.schema.json")),
    "semantic-validator.mjs": sha(read("semantic-validator.mjs")),
    "test-cases.json": sha(read("test-cases.json")),
    "run-tests.mjs": sha(read("run-tests.mjs")),
  },
  results,
  generated_at: new Date().toISOString(),
};
writeFileSync(new URL("test-results.json", dir), JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify({ all_ok: allOk, summary: report.summary, schema: selfCheck }, null, 2));
if (!allOk) process.exitCode = 1;
