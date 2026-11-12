// 独立回读一个 dispatch 目录：不复用运行中 snapshot，重新从 artifact/Schema/M1 登记簿核验。
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { sha256Hex, validateInboundJsonArtifact } from "./inbound_reply.mjs";

const args = process.argv.slice(2);
const directory = args[0];
if (!directory) {
  console.error("用法: node verify_inbound_result.mjs <dispatch-dir> [--schema <path>]");
  process.exit(2);
}
const schemaIndex = args.indexOf("--schema");
const schemaPath = schemaIndex >= 0 ? args[schemaIndex + 1] : null;
const dir = resolve(directory);
const result = JSON.parse(readFileSync(join(dir, "result.json"), "utf8"));
const replyBytes = readFileSync(join(dir, "reply.txt"));
const rawBytes = readFileSync(join(dir, "raw-units.json"));
const raw = JSON.parse(rawBytes.toString("utf8"));
const recomposed = raw.units.map((unit) => unit.text).join("\n");
const validation = validateInboundJsonArtifact({
  artifactPath: join(dir, "reply.txt"),
  schemaPath,
  expectedIds: {
    task_id: result.task_id ?? null,
    execution_id: result.execution_id ?? null,
    correlation_id: result.correlation_id ?? null,
  },
});

let registry = null;
let registeredRecord = null;
if (result.m1_registration?.registry_path && result.m1_registration?.artifact_id) {
  registry = JSON.parse(readFileSync(result.m1_registration.registry_path, "utf8"));
  registeredRecord = registry.records.find((record) => record.artifact_id === result.m1_registration.artifact_id) ?? null;
}

const checks = {
  reply_size_matches: replyBytes.length === result.size_bytes,
  reply_sha_matches: sha256Hex(replyBytes) === result.artifact_sha256,
  reply_readback_matches: sha256Hex(replyBytes) === result.reply_readback_sha256,
  raw_size_matches: rawBytes.length === result.raw_units_size_bytes,
  raw_sha_matches: sha256Hex(rawBytes) === result.raw_units_sha256,
  raw_readback_matches: sha256Hex(rawBytes) === result.raw_units_readback_sha256,
  raw_units_recompose_exactly: Buffer.from(recomposed, "utf8").equals(replyBytes),
  result_reply_exact: result.reply === recomposed,
  unit_metadata_consistent:
    raw.unit_count === raw.units.length && raw.unit_count === result.unit_count &&
    JSON.stringify(raw.unit_keys) === JSON.stringify(raw.units.map((unit) => unit.key)) &&
    JSON.stringify(raw.unit_keys) === JSON.stringify(result.unit_keys) &&
    raw.units.every((unit) => unit.text_sha256 === sha256Hex(Buffer.from(unit.text, "utf8")) && unit.size_bytes === Buffer.byteLength(unit.text, "utf8")),
  complete_range_proof_persisted:
    raw.range_proof?.complete === true && result.range_proof?.complete === true &&
    JSON.stringify(raw.range_proof) === JSON.stringify(result.range_proof),
  stability_complete: result.stability?.stable === true && Object.values(result.stability?.checks ?? {}).every(Boolean),
  completion_checks_complete: Object.values(result.completion_checks ?? {}).length > 0 && Object.values(result.completion_checks ?? {}).every(Boolean),
  reply_over_1200_bytes: replyBytes.length > 1200,
  json_schema_binding_pass: validation.status === "PASS" && validation.binding.status === "PASS",
  parsed_text_poc_length:
    validation.parsed_json?.text?.length >= 1000 && validation.parsed_json?.text?.length <= 1500,
  m1_record_exists: registeredRecord !== null,
  m1_record_content_exact: registeredRecord?.content === recomposed,
  m1_record_hash_exact: registeredRecord?.artifact_sha256 === sha256Hex(replyBytes),
  m1_record_size_exact: registeredRecord?.size_bytes === replyBytes.length,
  m1_record_ids_exact:
    registeredRecord?.task_id === result.task_id && registeredRecord?.execution_id === result.execution_id &&
    registeredRecord?.correlation_id === result.correlation_id,
  m1_record_units_exact:
    JSON.stringify(registeredRecord?.unit_metadata?.unit_keys) === JSON.stringify(result.unit_keys) &&
    registeredRecord?.unit_metadata?.unit_count === result.unit_count,
  m1_status_success: ["REGISTERED", "RECOVERED", "DUPLICATE"].includes(result.m1_registration?.status),
  m1_scope_honest: result.m1_registration?.adapter_scope === "MINIMAL_LOCAL_M1_NOT_FULL_PLATFORM",
};
const output = {
  verified_at: new Date().toISOString(),
  dispatch_directory: dir,
  checks,
  reply_bytes: replyBytes.length,
  reply_sha256: sha256Hex(replyBytes),
  raw_units_bytes: rawBytes.length,
  raw_units_sha256: sha256Hex(rawBytes),
  unit_count: raw.unit_count,
  unit_keys: raw.unit_keys,
  assistant_uuid: raw.assistant_uuid,
  range_windows: raw.range_proof?.windows?.length ?? 0,
  range_end_reason: raw.range_proof?.end_reason ?? null,
  stable_read_interval_ms: result.stability?.interval_ms ?? null,
  json_schema_binding: { ...validation, parsed_json: undefined },
  poc_text_code_points: validation.parsed_json?.text?.length ?? null,
  m1_artifact_id: result.m1_registration?.artifact_id ?? null,
  m1_registry_record_count: registry?.records?.length ?? null,
  all_checks_pass: Object.values(checks).every(Boolean),
};
writeFileSync(join(dir, "independent-verification.json"), `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(JSON.stringify(output, null, 2));
if (!output.all_checks_pass) process.exitCode = 1;
