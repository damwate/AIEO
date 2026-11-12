// 真实独立进程 M1 登记 worker；仅写本地测试 registry，不触发 GPT。
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { registerArtifact } from "./m1_artifact_registry.mjs";

const args = {};
for (let index = 2; index < process.argv.length; index += 2) {
  args[process.argv[index]] = process.argv[index + 1];
}
const outputPath = args["--output"];
try {
  const registration = registerArtifact({
    registryPath: resolve(args["--registry"]),
    artifactPath: resolve(args["--artifact"]),
    task_id: args["--task-id"],
    execution_id: args["--execution-id"],
    correlation_id: args["--correlation-id"],
    unit_metadata: { worker: args["--worker"], source: "REAL_MULTIPROCESS_TEST" },
  });
  const result = { worker: args["--worker"], pid: process.pid, result: "SUCCESS", registration };
  writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ worker: result.worker, status: registration.status, artifact_id: registration.artifact_id }));
} catch (error) {
  const result = {
    worker: args["--worker"],
    pid: process.pid,
    result: "FAILURE",
    error_code: error.code ?? "UNKNOWN",
    message: error.message,
  };
  if (outputPath) writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.error(JSON.stringify(result));
  process.exitCode = 1;
}
