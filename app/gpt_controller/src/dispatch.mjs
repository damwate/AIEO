// M2 派单编排：出站计量 → 契约自检（禁止盲发）→ 上限检测 → 发送双验（R3+ 严格时序）
// → 生成等待（300s 超时）→ 75s 确认窗 → 入站区间两次完整读取 → 原始 artifact 先落盘回读
// → JSON/Schema/三 ID 绑定 → M1 最小登记（失败只补登记，不重发 GPT）。
// 三 ID 强制：task_id/execution_id/correlation_id 缺一即拒（与 --schema 同时要求）。

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { resolveControllerConfig } from "./config.mjs";
import { controllerError } from "./errors.mjs";
import { assertOutboundWithinLimit } from "./outbound.mjs";
import { checkDomContract } from "./dom_contract.mjs";
import { readTailUnit, readReplySnapshot } from "./dom_view.mjs";
import { assertPreSendGate, insertAndVerifyComposer, verifySendAcceptance } from "./send_acceptance.mjs";
import { waitForGenerationEnd, assertFinalQuietness } from "./generation.mjs";
import { stopIfContextLimit } from "./context_limit.mjs";
import {
  assertInboundExtensionGate,
  compareInboundSnapshots,
  persistInboundArtifacts,
  validateInboundJsonArtifact,
} from "./inbound_reply.mjs";
import { normalizeIds } from "./validation.mjs";
import { extractConversationUrl } from "./browser_session.mjs";
import { acquireSessionLock } from "./session_lock.mjs";

function dispatchError(code, message, details = undefined) {
  return controllerError(code, message, details === undefined ? {} : { details });
}

// 三 ID 强制（port 自 phase0/tools/dispatch_options.mjs 的 API 化）：
// 三个 ID 要么全部省略（通用非登记派单），要么与 schemaPath 一起完整提供；
// 请求登记（registerM1）时三 ID 与 Schema 全部必填，缺一即拒。
export function normalizeDispatchRequest({
  message,
  ids = {},
  schemaPath = null,
  registerM1 = false,
} = {}) {
  if (typeof message !== "string" || message.trim().length === 0) {
    throw dispatchError("DISPATCH_MESSAGE_REQUIRED", "出站消息不能为空");
  }
  const normalizedIds = normalizeIds(ids);
  const providedIds = Object.values(normalizedIds).filter((value) => value !== null);
  const m1Requested = registerM1 === true || providedIds.length > 0;
  if (m1Requested) {
    const missing = Object.entries(normalizedIds).filter(([, value]) => value === null).map(([field]) => field);
    if (missing.length > 0 || schemaPath === null) {
      throw dispatchError(
        "DISPATCH_M1_BINDING_INCOMPLETE",
        "请求 M1 登记或提供任一 task_id/execution_id/correlation_id 时，三 ID 与 schemaPath 必须全部提供；缺少任一项均在发送前失败",
        { missing_ids: missing, schema_provided: schemaPath !== null },
      );
    }
  }
  return {
    message,
    ids: normalizedIds,
    schemaPath,
    m1RegistrationRequested: m1Requested,
    m1RegistrationStatus: m1Requested ? "REQUESTED" : "NOT_REQUESTED",
  };
}

// 发送前的完整出站计量（含信封/指针/验收要求整体字节数）；超限抛 OUTBOUND_MESSAGE_TOO_LARGE。
export function meterOutboundMessage(message) {
  return assertOutboundWithinLimit(message);
}

// 完整派单管线。deps.view 必填（真实 Playwright 视图或仿真视图）；
// deps.lock 可注入（默认真实 OS 句柄锁）；deps.sessionStore/session 提供五角色会话绑定。
export async function runDispatch(deps = {}) {
  const {
    view,
    message,
    ids = {},
    schemaPath = null,
    registerM1 = false,
    sessionStore = null,
    sessionId = null,
    lock = null,
    lockHolder = "gpt_controller.dispatch",
    config = null,
    configOverrides = {},
    env = process.env,
    outputDir = null,
    expectedUnitKeys = null,
    conversationUrlResolver = null,
    logger = null,
    requireUnitsForContract = true,
    // deps.readReplySnapshot 仅供测试注入（模拟上游门禁被放宽/失效，验证 dispatch 收敛点纵深防御，
    // T-P1-901 F-101）；生产路径不传，恒用真实 readReplySnapshot。
    readReplySnapshot: injectedReplyReader = null,
  } = deps;

  if (!view) throw dispatchError("DISPATCH_VIEW_REQUIRED", "必须提供 DOM 视图（真实浏览器或仿真）");

  const cfg = config ?? resolveControllerConfig({
    ...configOverrides,
    ...(deps.timeouts ?? {}),
  }, env);
  const log = logger ?? { log: () => {} };

  // 0. 请求规范化 + 出站计量：任何失败都发生在接触浏览器之前（不点击发送）。
  const request = normalizeDispatchRequest({ message, ids, schemaPath, registerM1 });
  const metering = meterOutboundMessage(request.message);
  log.log({
    event: "dispatch.outbound_metering",
    message: `出站消息 ${metering.bytes} UTF-8 字节（上限 ${metering.max_bytes}）`,
    task_id: request.ids.task_id,
    execution_id: request.ids.execution_id,
    correlation_id: request.ids.correlation_id,
    operation: "meter_outbound",
    result: "SUCCESS",
    details: { size_bytes: metering.bytes },
  });

  // 1. 会话锁（跨进程互斥；同一会话同一时刻仅一个在途任务）。
  const sessionLock = lock ?? acquireSessionLock({ holder: lockHolder });
  try {
    return await runDispatchLocked({
      view, request, metering, cfg, log, sessionStore, sessionId, outputDir,
      expectedUnitKeys, conversationUrlResolver, requireUnitsForContract, replyReader: injectedReplyReader,
    });
  } finally {
    if (!lock) sessionLock.release();
  }
}

async function runDispatchLocked({
  view, request, metering, cfg, log, sessionStore, sessionId, outputDir,
  expectedUnitKeys, conversationUrlResolver, requireUnitsForContract,
  // replyReader：测试注入的回复读取器（null = 生产真实 readReplySnapshot，T-P1-901 F-101）。
  replyReader: injectedReplyReader = null,
}) {
  // 2. 五角色会话绑定：同一会话同一时刻仅一个在途任务。
  const dispatchId = `DISPATCH-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;
  if (sessionStore && sessionId) {
    sessionStore.beginDispatch(sessionId, dispatchId);
  }

  // 3. DOM 契约自检：unit 锚点 / composer 探测；自检失败禁止盲发。
  const contract = await checkDomContract(view, { requireUnits: requireUnitsForContract });
  if (!contract.ok) {
    throw dispatchError("DOM_CONTRACT_CHECK_FAILED", "DOM 契约自检失败，禁止盲发", contract);
  }
  log.log({
    event: "dispatch.dom_contract_ok",
    message: "DOM 契约自检通过",
    operation: "check_dom_contract",
    result: "SUCCESS",
    details: contract.checks,
  });

  // 4. 发送前上下文上限检测（横幅可能晚于就绪出现，持续检测 5s）。
  await stopIfContextLimit({ view });

  // 5. pre-send 生成门 + 插入回读 + Enter + 发送双验（R3+ 严格时序）。
  const baseline = await readTailUnit(view);
  const { send_receipt } = await (async () => {
    const gate = await assertPreSendGate(view);
    const insert = await insertAndVerifyComposer(view, request.message);
    await view.pressEnter();
    const acceptance = await verifySendAcceptance({
      view,
      baselineKey: baseline?.key ?? null,
      sendAcceptTimeoutMs: cfg.sendAcceptTimeoutMs,
      pollIntervalMs: cfg.pollIntervalMs,
    });
    return { send_receipt: { ...acceptance, pre_send_stop_visible: gate.pre_send_stop_visible, composer_readback_verified: insert.readback_verified, message_bytes: metering.bytes } };
  })();
  log.log({
    event: "dispatch.send_accepted",
    message: `发送双验通过（polls=${send_receipt.polls}，user_unit_key=${send_receipt.user_unit_key}）`,
    task_id: request.ids.task_id,
    execution_id: request.ids.execution_id,
    correlation_id: request.ids.correlation_id,
    operation: "send_message",
    result: "SUCCESS",
    details: send_receipt,
  });

  // 6. 生成等待（默认 300s 超时 → GENERATION_TIMEOUT）+ 75s 确认窗。
  const generation = await waitForGenerationEnd({
    view,
    generationObserved: send_receipt.stop_observed_after_tail,
    generationTimeoutMs: cfg.generationTimeoutMs,
  });
  await view.sleep(cfg.confirmWindowMs);

  // 7. 最终安静检查：停止按钮不可见 + composer 空。
  const quietness = await assertFinalQuietness({ view });

  // 8. 确认窗后两次完整读取（间隔 ≥3s），比较 key/数量/逐 unit 哈希/UUID。
  const replyReader = injectedReplyReader ?? readReplySnapshot;
  const firstReadStartedMs = view.now();
  const firstSnapshot = await replyReader(view, send_receipt.user_unit_key, { expectedUnitKeys });
  await view.sleep(cfg.stableReadIntervalMs);
  const secondReadStartedMs = view.now();
  const secondSnapshot = await replyReader(view, send_receipt.user_unit_key, { expectedUnitKeys });
  const stability = compareInboundSnapshots(firstSnapshot, secondSnapshot, secondReadStartedMs - firstReadStartedMs);
  const snapshot = secondSnapshot;
  // DEC-017 扩展门禁收敛点（T-P1-901 F-001/F-101）：真实浏览器路径的唯一强制复核点。
  // 独立函数 assertInboundExtensionGate 可被直接测试；即使上游 readReplySnapshot/selectInboundReply
  // 的门禁被放宽或失效，此处仍无条件复核；畸形快照同样 fail-closed。
  // 错误码 INBOUND_ 前缀 → C3 PROVIDER-0004（外部网页行为超出已验证契约）。
  assertInboundExtensionGate(snapshot);
  log.log({
    event: "dispatch.reply_stable",
    message: `完成判定通过，${snapshot.unit_count} 个 assistant unit，回复 ${Buffer.byteLength(snapshot.reply, "utf8")} UTF-8 字节`,
    task_id: request.ids.task_id,
    execution_id: request.ids.execution_id,
    correlation_id: request.ids.correlation_id,
    operation: "wait_reply",
    result: "SUCCESS",
    details: { assistant_uuid: snapshot.assistant_uuid, unit_count: snapshot.unit_count },
  });

  // 9. 原始 artifact 先落盘并回读校验；失败即提取失败。
  const extractedAt = new Date().toISOString();
  let artifacts = null;
  if (outputDir) {
    const dir = join(outputDir, dispatchId);
    artifacts = persistInboundArtifacts({ directory: dir, snapshot, extractedAt });
  } else {
    // 无 outputDir 时使用临时校验（不落盘的证据链不完整，登记路径强制要求 outputDir）。
    if (request.m1RegistrationRequested) {
      throw dispatchError("DISPATCH_OUTPUT_DIR_REQUIRED", "请求 M1 登记时必须提供 outputDir 以持久化原始 artifact");
    }
  }

  // 10. 全文 JSON/Schema/三 ID 绑定（从已回读 artifact 校验）。
  const validation = artifacts
    ? validateInboundJsonArtifact({ artifactPath: artifacts.reply.path, schemaPath: request.schemaPath, expectedIds: request.ids })
    : { status: "NOT_REQUESTED", json: { status: "NOT_REQUESTED" }, schema: { status: "NOT_REQUESTED" }, binding: { status: "NOT_REQUESTED" } };

  // 11. 真实会话 URL（登记路径强制；取不到即拒绝写成功结果）。
  let conversationUrl = null;
  let sessionIdCaptured = null;
  const urlSource = conversationUrlResolver ?? (() => extractConversationUrl(view.url?.() ?? null));
  const captured = urlSource({ view, userUnitKey: send_receipt.user_unit_key });
  if (captured?.conversation_url) {
    conversationUrl = captured.conversation_url;
    sessionIdCaptured = captured.session_id;
    if (sessionStore && sessionId) {
      sessionStore.captureUrl(sessionId, conversationUrl);
    }
  }
  if (request.m1RegistrationRequested && (!conversationUrl || !sessionIdCaptured)) {
    throw dispatchError("SESSION_URL_UNAVAILABLE", "未取得真实会话 URL，拒绝写成功结果", { conversation_url: conversationUrl });
  }

  // 12. M1 最小登记（失败只重试登记，绝不重发 GPT）。
  let m1Registration = null;
  if (request.m1RegistrationRequested) {
    const artifactKind = request.schemaPath.replaceAll("\\", "/").endsWith("/review-report.schema.json")
      ? "REVIEW_REPORT"
      : "GPT_SCHEMA_VALIDATED_JSON";
    m1Registration = await import("./m1_registration.mjs").then((m) => m.registerArtifactWithRetry({
      registryPath: cfg.registryPath,
      artifactPath: artifacts.reply.path,
      ...request.ids,
      artifact_kind: artifactKind,
      schema_validation: validation.schema.status,
      unit_metadata: {
        user_unit_key: snapshot.user_unit_key,
        next_user_unit_key: snapshot.next_user_unit_key,
        unit_keys: snapshot.unit_keys,
        unit_count: snapshot.unit_count,
        assistant_uuid: snapshot.assistant_uuid,
        range_proof: snapshot.range_proof,
      },
    }));
  }

  // 13. 结果落盘 + 在途任务清位。
  const result = {
    at: extractedAt,
    dispatch_id: dispatchId,
    message_bytes: metering.bytes,
    send_receipt,
    generation,
    quietness,
    reply: snapshot.reply,
    user_unit_key: snapshot.user_unit_key,
    next_user_unit_key: snapshot.next_user_unit_key,
    unit_keys: snapshot.unit_keys,
    unit_count: snapshot.unit_count,
    assistant_uuid: snapshot.assistant_uuid,
    stability: { stable: stability.stable, interval_ms: stability.interval_ms, checks: stability.checks },
    range_proof: snapshot.range_proof,
    json_schema_binding: validation,
    m1_registration: m1Registration
      ? { status: m1Registration.status, artifact_id: m1Registration.artifact_id, adapter_scope: m1Registration.adapter_scope, attempts: m1Registration.attempts }
      : { status: "NOT_REQUESTED", adapter_scope: "MINIMAL_LOCAL_M1_NOT_FULL_PLATFORM" },
    artifact_sha256: artifacts?.reply.artifact_sha256 ?? null,
    size_bytes: artifacts?.reply.size_bytes ?? null,
    reply_path: artifacts?.reply.path ?? null,
    raw_units_path: artifacts?.raw_units.path ?? null,
    raw_units_sha256: artifacts?.raw_units.artifact_sha256 ?? null,
    session_id: sessionIdCaptured,
    conversation_url: conversationUrl,
    completion_checks: {
      dom_contract_ok: contract.ok,
      pre_send_stop_visible: send_receipt.pre_send_stop_visible === false,
      send_double_verified: send_receipt.ok === true,
      generation_observed: generation.generation_observed === true,
      generation_ended: generation.generation_ended === true,
      final_stop_button_not_visible: quietness.final_stop_button_not_visible === true,
      composer_empty: quietness.composer_empty === true,
      stable_unit_read: stability.stable === true,
      reply_artifact_readback: artifacts ? artifacts.reply.readback_verified === true : false,
      raw_units_artifact_readback: artifacts ? artifacts.raw_units.readback_verified === true : false,
      json_schema_binding: validation.status === "PASS" || validation.status === "NOT_REQUESTED",
      m1_registration: !request.m1RegistrationRequested || ["REGISTERED", "RECOVERED", "DUPLICATE"].includes(m1Registration?.status),
    },
    ...Object.fromEntries(Object.entries(request.ids).filter(([, value]) => value !== null)),
  };
  const allComplete = Object.values(result.completion_checks).every(Boolean);
  if (!allComplete) {
    // 完成判定未全绿：保存证据，不写成功结果。
    if (outputDir) writeFileSync(join(outputDir, dispatchId, "incomplete-result.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
    throw dispatchError("COMPLETION_CHECKS_FAILED", "完成判定未全部通过，拒绝返回成功结果", result.completion_checks);
  }
  if (outputDir) {
    mkdirSync(join(outputDir, dispatchId), { recursive: true });
    writeFileSync(join(outputDir, dispatchId, "request.txt"), request.message, "utf8");
    writeFileSync(join(outputDir, dispatchId, "result.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
  }
  if (sessionStore && sessionId) {
    sessionStore.completeDispatch(sessionId, dispatchId);
  }
  log.log({
    event: "dispatch.completed",
    message: `派单完成 artifact_sha256=${result.artifact_sha256}`,
    task_id: request.ids.task_id,
    execution_id: request.ids.execution_id,
    correlation_id: request.ids.correlation_id,
    session_id: sessionIdCaptured,
    operation: "dispatch",
    result: "SUCCESS",
    details: { artifact_sha256: result.artifact_sha256, size_bytes: result.size_bytes },
  });
  return result;
}
