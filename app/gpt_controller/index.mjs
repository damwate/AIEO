// @aieo/gpt-controller 公共 API（M2）。
// 模块边界见 docs/phase1/module-boundaries.md §2 M2；payload 契约见
// docs/phase1/platform-contract-v1.0.md §2.6（BLOCKED-1 PASS_WITH_CONSTRAINTS，DEC-017）。

export { GptControllerError, controllerError, asControllerError } from "./src/errors.mjs";
export { resolveControllerConfig, CONTROLLER_DEFAULTS, AIEO_ROOT } from "./src/config.mjs";
export {
  ID_RULES, normalizeIds, normalizeAgentId, normalizeSessionUrl, requireObject,
} from "./src/validation.mjs";
export { SessionStore, decideSessionRotation } from "./src/session_store.mjs";
export { acquireSessionLock, withSessionLock, LOCK_PATH_DEFAULT } from "./src/session_lock.mjs";
export { createLogger, resolveLogDir } from "./src/logging.mjs";
export {
  MAX_OUTBOUND_BYTES, measureOutboundBytes, assertOutboundWithinLimit,
  buildGitPointerInstruction, buildOutboundMessage,
} from "./src/outbound.mjs";
export {
  MANIFEST_MEDIA_TYPE, MEDIA_TYPES, GIT_POINTER_DEFAULTS, resolveGitPointerConfig,
  sha256Hex as gitPointerSha256Hex, validateRepoRelativePath, inferMediaType,
  scanSecrets, assertNoSecrets, validateGitPointer, validateGitPointerManifest,
  buildGitPointerManifest, parseGitPointerManifest, createGitPointer,
  gitPointerRawUrl, fetchGitPointerBytes, readGitPointer,
} from "./src/git_pointer.mjs";
export { normalizeGitHandoff, readPublicGitHandoff, buildHandoffInstruction } from "./src/git_handoff.mjs";
export {
  CONTEXT_LIMIT_MARKER, detectContextLimit, stopIfContextLimit,
  decideContextLimitRotation, rotateIfContextLimit, beginFreshBlankSession,
} from "./src/context_limit.mjs";
export { checkDomContract } from "./src/dom_contract.mjs";
export { createPlaywrightDomView, readDomWindow, readTailUnit, readReplySnapshot } from "./src/dom_view.mjs";
export {
  assertPreSendGate, insertAndVerifyComposer, verifySendAcceptance, sendWithAcceptance,
} from "./src/send_acceptance.mjs";
export { waitForGenerationEnd, assertFinalQuietness } from "./src/generation.mjs";
export {
  MIN_STABLE_READ_INTERVAL_MS, CHATGPT_AUX_PREFIX, proveAdjacentWindowOverlap,
  createInboundRangeCollector, selectInboundReply, compareInboundSnapshots,
  verifyArtifactFile, persistInboundArtifacts, extractCompleteJson, validateInboundJsonArtifact,
} from "./src/inbound_reply.mjs";
export { registerArtifact, registerArtifactWithRetry } from "./src/m1_registration.mjs";
export { normalizeDispatchRequest, meterOutboundMessage, runDispatch } from "./src/dispatch.mjs";
export {
  CHATGPT_HOME, DEFAULT_DEBUG_PORT, chromeLaunchArgs, cdpReady,
  killProfileChrome, startChromeWithDebugPort, attachChatgptPage,
  extractConversationUrl, existingSessionReadyProbe,
} from "./src/browser_session.mjs";
