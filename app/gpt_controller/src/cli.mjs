// M2 CLI（真实派单入口；测试只走 API）。
//   node src/cli.mjs dispatch --message-file <txt> [--task-id .. --execution-id .. --correlation-id .. --schema ..]
// 退出码约定：参数/校验类失败（含 1200 字节超限）→ 2；运行失败 → 1。超限不发送、不截断、不拆分。

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { asControllerError, controllerError } from "./errors.mjs";
import { runDispatch } from "./dispatch.mjs";
import { createLogger } from "./logging.mjs";
import { startChromeWithDebugPort, attachChatgptPage, DEFAULT_PROFILE_DIR } from "./browser_session.mjs";
import { createPlaywrightDomView } from "./dom_view.mjs";

function cliError(message, details = undefined) {
  return controllerError("CLI_USAGE_INVALID", message, details === undefined ? {} : { details });
}

function optionalArg(argv, flag) {
  const indices = argv.flatMap((value, index) => (value === flag ? [index] : []));
  if (indices.length === 0) return null;
  if (indices.length > 1) throw cliError(`${flag} 不得重复提供`);
  const value = argv[indices[0] + 1];
  if (!value || value.startsWith("--")) throw cliError(`${flag} 缺少值`, { flag });
  return value;
}

function parseArgv(argv) {
  const message = optionalArg(argv, "--message");
  const messageFile = optionalArg(argv, "--message-file");
  if (message !== null && messageFile !== null) throw cliError("--message 与 --message-file 只能提供一项");
  return {
    message: messageFile !== null ? readFileSync(resolve(messageFile), "utf8") : message,
    newSession: argv.includes("--new-session"),
    registerM1: argv.includes("--register-m1"),
    ids: {
      task_id: optionalArg(argv, "--task-id"),
      execution_id: optionalArg(argv, "--execution-id"),
      correlation_id: optionalArg(argv, "--correlation-id"),
    },
    schemaPath: optionalArg(argv, "--schema"),
    outputDir: optionalArg(argv, "--output-dir"),
  };
}

async function main(argv) {
  const args = parseArgv(argv);
  if (!args.message || args.message.trim().length === 0) {
    throw cliError("用法: node src/cli.mjs dispatch (--message <文本> | --message-file <txt>) [--register-m1 --task-id .. --execution-id .. --correlation-id .. --schema ..]");
  }
  const logger = createLogger({ env: process.env });
  const ids = Object.fromEntries(Object.entries(args.ids).filter(([, value]) => value !== null));
  logger.log({ event: "cli.dispatch_start", message: "CLI 派单开始", operation: "dispatch" });

  await startChromeWithDebugPort({ profileDir: DEFAULT_PROFILE_DIR, log: (m) => logger.log({ event: "browser.chrome", message: m }) });
  const { browser, page } = await attachChatgptPage();
  const view = createPlaywrightDomView(page);
  try {
    const result = await runDispatch({
      view,
      message: args.message,
      ids,
      schemaPath: args.schemaPath,
      registerM1: args.registerM1,
      outputDir: args.outputDir,
      logger,
    });
    console.log("=====REPLY_BEGIN=====");
    console.log(result.reply);
    console.log("=====REPLY_END=====");
    return 0;
  } finally {
    await browser.close().catch(() => {});
  }
}

const invoked = process.argv[1] ? resolve(process.argv[1]) : null;
if (invoked && invoked === resolve(fileURLToPath(import.meta.url))) {
  main(process.argv.slice(2)).then(
    () => process.exit(0),
    (error) => {
      const normalized = asControllerError(error);
      console.error(JSON.stringify(normalized.toJSON(), null, 2));
      // 校验/用法类（发送前失败）→ 2；运行失败 → 1。
      const preSend = [
        "OUTBOUND_MESSAGE_TOO_LARGE", "DISPATCH_", "CLI_", "SESSION_URL_INVALID",
        "INVALID_AGENT_ID", "GIT_POINTER_SCHEMA_INVALID", "GIT_HANDOFF_",
      ].some((prefix) => normalized.code.startsWith(prefix));
      process.exit(preSend ? 2 : 1);
    },
  );
}
