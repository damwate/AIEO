// GPT 派单参数与 M1 登记绑定的纯函数解析。
// 三 ID 要么全部缺省（通用非登记派单），要么与 --schema 同时完整提供。

import { readFileSync } from "node:fs";

export const DISPATCH_ID_RULES = Object.freeze({
  task_id: /^T-(P[0-9]+-)?[0-9]{3,}$/,
  execution_id: /^EXEC-[0-9]{3,}$/,
  correlation_id: /^(CORR-[0-9]{3,}|[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/,
});

function optionError(code, message, details = undefined) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  error.exitCode = 2;
  if (details !== undefined) error.details = details;
  return error;
}

function optionalArg(argv, flag) {
  const indices = argv.flatMap((value, index) => value === flag ? [index] : []);
  if (indices.length === 0) return null;
  if (indices.length > 1) throw optionError("DISPATCH_OPTION_DUPLICATE", `${flag} 不得重复提供`);
  const value = argv[indices[0] + 1];
  if (!value || value.startsWith("--")) {
    throw optionError("DISPATCH_OPTION_VALUE_MISSING", `${flag} 缺少值`, { flag });
  }
  return value;
}

export function parseDispatchOptions(argv, { readMessageFile = (path) => readFileSync(path, "utf8") } = {}) {
  if (!Array.isArray(argv)) throw new TypeError("argv 必须是数组");
  const newSession = argv.includes("--new-session");
  const registerM1Flag = argv.includes("--register-m1");
  const messageValue = optionalArg(argv, "--message");
  const messageFile = optionalArg(argv, "--message-file");
  if (messageValue !== null && messageFile !== null) {
    throw optionError("DISPATCH_MESSAGE_AMBIGUOUS", "--message 与 --message-file 只能提供一项");
  }
  const message = messageFile !== null ? readMessageFile(messageFile).trim() : messageValue;
  if (!message) {
    throw optionError(
      "DISPATCH_MESSAGE_REQUIRED",
      "用法: node gpt_dispatch.mjs [--new-session] (--message-file <txt> | --message <文本>) [--task-id <id> --execution-id <id> --correlation-id <id> --schema <path> | --schema <path>]",
    );
  }

  const ids = {
    task_id: optionalArg(argv, "--task-id"),
    execution_id: optionalArg(argv, "--execution-id"),
    correlation_id: optionalArg(argv, "--correlation-id"),
  };
  const schemaPath = optionalArg(argv, "--schema");
  for (const [field, value] of Object.entries(ids)) {
    if (value !== null && !DISPATCH_ID_RULES[field].test(value)) {
      throw optionError("DISPATCH_ID_INVALID", `${field} 格式不合法: ${value}`, { field });
    }
  }

  const providedIds = Object.entries(ids).filter(([, value]) => value !== null).map(([field]) => field);
  const m1RegistrationRequested = registerM1Flag || providedIds.length > 0;
  if (m1RegistrationRequested) {
    const missing = Object.entries(ids).filter(([, value]) => value === null).map(([field]) => field);
    if (missing.length > 0 || schemaPath === null) {
      throw optionError(
        "DISPATCH_M1_BINDING_INCOMPLETE",
        "请求 M1 登记或提供任一 task_id/execution_id/correlation_id 时，三 ID 与 --schema 必须全部提供；缺少任一项均在派单前失败",
        { missing_ids: missing, schema_provided: schemaPath !== null },
      );
    }
  }

  return {
    message,
    newSession,
    ids,
    schemaPath,
    m1RegistrationRequested,
    m1RegistrationStatus: m1RegistrationRequested ? "REQUESTED" : "NOT_REQUESTED",
  };
}
