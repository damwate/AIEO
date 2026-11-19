// 生成单文件 DV1/DV2 验证器：把 schema + 语义校验器 + 用例 + runner 内联，便于审查方独立执行。
import { readFileSync, writeFileSync } from "node:fs";
const dir = "basic/tasks/b-20261119-p1-906-06-concurrency/acceptance/dv1/";
const schema = readFileSync(dir + "event-contract.schema.json", "utf8").trim();
const cases = readFileSync(dir + "test-cases.json", "utf8").trim();
let validator = readFileSync(dir + "semantic-validator.mjs", "utf8");
validator = validator
  .replace(/^import \{ readFileSync \}.*\n/m, "")
  .replace(/^const SCHEMA_PATH.*\n/m, "")
  .replace(/^const schema = JSON\.parse.*\n/m, "const schema = " + schema + ";\n");
const runner = [
  "",
  "const embedCases = " + cases + ";",
  "const selfCheck = checkSchemaSelfConsistency();",
  "const rows = embedCases.cases.map((c) => {",
  "  const r = validateEvent(c.event, c.context || []);",
  "  const want = c.expect === 'pass';",
  "  return { id: c.id, event_type: c.event?.event_type, expect: c.expect, actual: r.valid ? 'pass' : 'reject', ok: want ? r.valid : !r.valid, errors: r.errors };",
  "});",
  "const all_ok = selfCheck.consistent && rows.every((r) => r.ok);",
  "console.log(JSON.stringify({ artifact: 'dv1-standalone', contract: embedCases.contract, all_ok, schema_self_consistency: selfCheck, total: rows.length, matched: rows.filter((r) => r.ok).length, rows }, null, 2));",
  "",
].join("\n");
writeFileSync(dir + "dv1-standalone.mjs",
  "// DV2b 自包含验证器：仅运行 `node dv1-standalone.mjs`，无需其他文件。\n" + validator + runner,
  "utf8");
console.log("STANDALONE_BUILT");
