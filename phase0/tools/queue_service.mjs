// Queue Service Phase B CLI（DEC-141 授权；双入口统一认领接口——人工中控与未来 Queue 进程同接口）。
// 子命令：seed-instance / create-task / claim / c9-check / mirror-send / complete / recover / audit / status
// 零浏览器代码：EXECUTING 由外部实际派单驱动（Phase B 影子语义），本 CLI 记账与恢复。
import { processArgs } from "./queue_core_cli_args.mjs";

const AIEO_ROOT = process.env.AIEO_QUEUE_ROOT || "D:/AIEO";

async function main() {
  const args = processArgs(process.argv.slice(2));
  const cmd = args._[0];
  const core = await import("./queue_core.mjs");
  const root = args.root || AIEO_ROOT;
  switch (cmd) {
    case "seed-instance": {
      const inst = core.seedInstance({
        aieoRoot: root, instanceId: args.instance,
        profileDir: args.profile || `D:/AIEO/runtime/chrome_profiles/gpt-poc-${args.instance}`,
        debugPort: Number(args.port), lockPath: args.lock || `D:/AIEO/runtime/locks/gpt-session-${args.instance}.lockfile`,
        loginValidated: args["login-validated"] === "true",
      });
      console.log(JSON.stringify({ seeded: inst.instance_id, status: inst.status, login_validated: inst.login_validated }));
      break;
    }
    case "create-task": {
      const t = core.createTask({
        aieoRoot: root, taskId: args["task-id"], title: args.title || "", kind: args.kind || "code",
        payloadRef: args["payload-ref"] || "", branch: args.branch || null,
        priority: Number(args.priority || 0), deps: (args.deps || "").split(",").filter(Boolean),
      });
      console.log(JSON.stringify({ created: t.task_id, status: t.status }));
      break;
    }
    case "claim": {
      const r = core.claimTask({ aieoRoot: root, taskId: args["task-id"], instanceId: args.instance });
      console.log(JSON.stringify({ claimed: true, ...r }));
      break;
    }
    case "c9-check": {
      const r = core.c9CheckAndStart({
        aieoRoot: root, taskId: args["task-id"], instanceId: args.instance,
        claimToken: args.token, dispatchDir: args["dispatch-dir"] || null,
      });
      console.log(JSON.stringify(r));
      if (!r.allowed) process.exitCode = 3;
      break;
    }
    case "mirror-send": {
      // 权威源=dispatch 归档 send-state.json（P0-3 整改）：从归档读取，调用方声明仅交叉核对
      const r = core.mirrorSendState({
        aieoRoot: root, taskId: args["task-id"], dispatchDir: args["dispatch-dir"] || null,
        checkpoint: args.checkpoint || "SENT", sendState: args["declare-send-state"] || null,
      });
      console.log(JSON.stringify({ mirrored: r.execution.task_id, send_state: r.authoritative_state, diffs: r.diffs, checkpoint: r.execution.last_checkpoint }));
      break;
    }
    case "complete": {
      const e = core.completeExecution({ aieoRoot: root, taskId: args["task-id"], claimToken: args.token, replySha256: args["reply-sha"] || null });
      console.log(JSON.stringify({ completed: e.task_id, checkpoint: e.last_checkpoint, exec_ms: e.c6.throughput.exec_ms }));
      break;
    }
    case "recover": {
      const results = core.recoverExecutions({ aieoRoot: root });
      console.log(JSON.stringify({ recovered: results }));
      break;
    }
    case "audit": {
      console.log(JSON.stringify(core.auditLedger({ aieoRoot: root })));
      break;
    }
    case "status": {
      const paths = core.queuePaths(root);
      for (const f of ["task-ledger.json", "executions.json", "instance-pool.json"]) {
        try {
          const data = JSON.parse((await import("node:fs")).readFileSync(`${paths.dir}/${f}`, "utf8"));
          console.log(`--- ${f} ---`);
          console.log(JSON.stringify(data, null, 1));
        } catch { console.log(`--- ${f} --- (missing)`); }
      }
      break;
    }
    default:
      console.error(`未知子命令: ${cmd}（可用：seed-instance/create-task/claim/c9-check/mirror-send/complete/recover/audit/status）`);
      process.exitCode = 2;
  }
}
main().catch((e) => { console.error(e.message); process.exitCode = 1; });
