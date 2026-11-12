// AIEO Phase 1 M3 ZCode Bridge — 开发报告结构校验（03-协议 §6 智谱开发报告）
//
// submit_result 工具的入参按本结构校验；校验失败 → REQ-0002（字段级明细）。
// 边界（如实声明）：contracts/v1.0/ 尚无 development-report.schema.json（该目录现只有
// git-pointer / git-pointer-manifest / review-report / gpt-inbound-poc 四个 Schema），
// 本文件按 03-协议 §6 示例结构实现最小必填校验；机器 Schema 由 M1 落地后替换引用，
// 禁止复制修改契约文件（platform-contract §10-4）。

import { aieoError } from "./errors.mjs";

const RE_TASK_ID = /^T-(P\d+-)?\d{3,}$/;
const RE_EXECUTION_ID = /^EXEC-\d{3,}$/;
const RE_SHA40 = /^[0-9a-f]{40}$/;
const REPORT_STATUS = new Set(["COMPLETED", "BLOCKED"]);
const TEST_EXECUTED_RESULTS = new Set(["EXECUTED_PASS", "EXECUTED_FAIL", "NOT_EXECUTED", "CLAIMED_ONLY", "BLOCKED"]);

/**
 * 校验开发报告结构（03-协议 §6）。返回字段级错误数组，空 = 合法。
 * 结构（§6 示例逐字段）：task_id / execution_id / status / implementation_summary /
 *   git{repository, branch, base_commit, commit_sha, changed_files} /
 *   tests{executed, commands, passed, failed, log_artifact_id} /
 *   known_issues / knowledge_updates_required / self_assessment
 */
export function validateDevReport(report) {
  const errors = [];
  const add = (field, reason) => errors.push({ field, reason });
  if (typeof report !== "object" || report === null || Array.isArray(report)) {
    add("$", "报告必须是对象");
    return errors;
  }
  if (typeof report.task_id !== "string" || !RE_TASK_ID.test(report.task_id)) {
    add("task_id", `格式 T-(P\\d+-)?\\d{3,}，实际 "${report.task_id}"`);
  }
  if (typeof report.execution_id !== "string" || !RE_EXECUTION_ID.test(report.execution_id)) {
    add("execution_id", `格式 EXEC-<3位以上序号>，实际 "${report.execution_id}"`);
  }
  if (!REPORT_STATUS.has(report.status)) {
    add("status", "枚举 COMPLETED/BLOCKED（03-协议 §6 / C2 development_reports.status）");
  }
  if (typeof report.implementation_summary !== "string" || report.implementation_summary.length === 0) {
    add("implementation_summary", "必填非空字符串");
  }
  // git 子对象
  const git = report.git;
  if (typeof git !== "object" || git === null || Array.isArray(git)) {
    add("git", "必填对象 {repository, branch, base_commit, commit_sha, changed_files}");
  } else {
    if (typeof git.repository !== "string" || git.repository.length === 0) add("git.repository", "必填非空字符串");
    if (typeof git.branch !== "string" || git.branch.length === 0) add("git.branch", "必填非空字符串");
    if (typeof git.base_commit !== "string" || !RE_SHA40.test(git.base_commit)) add("git.base_commit", "必须为完整 40 位 SHA（禁止短 SHA）");
    if (typeof git.commit_sha !== "string" || !RE_SHA40.test(git.commit_sha)) add("git.commit_sha", "必须为完整 40 位 SHA（禁止短 SHA）");
    if (!Array.isArray(git.changed_files) || git.changed_files.length === 0 || !git.changed_files.every((f) => typeof f === "string" && f.length > 0)) {
      add("git.changed_files", "必填非空字符串数组（允许为 []，但字段必须存在且为数组）");
    }
  }
  // tests 子对象
  const tests = report.tests;
  if (typeof tests !== "object" || tests === null || Array.isArray(tests)) {
    add("tests", "必填对象 {executed, commands, passed, failed, log_artifact_id}");
  } else {
    if (typeof tests.executed !== "boolean") add("tests.executed", "必填布尔（测试实际是否执行，区分 CLAIMED_ONLY）");
    if (!Array.isArray(tests.commands) || !tests.commands.every((c) => typeof c === "string")) add("tests.commands", "字符串数组");
    if (!Number.isInteger(tests.passed) || tests.passed < 0) add("tests.passed", "非负整数");
    if (!Number.isInteger(tests.failed) || tests.failed < 0) add("tests.failed", "非负整数");
    if (tests.log_artifact_id !== undefined && tests.log_artifact_id !== null
      && (typeof tests.log_artifact_id !== "string" || !/^ART-[A-Z0-9-]+\d*$/.test(tests.log_artifact_id))) {
      add("tests.log_artifact_id", "格式 ART-<用途>-<序号>（无日志时可为 null）");
    }
    // executed=true 但无测试命令或无结果枚举支撑 → 记录为错误（测试执行事实必须可核，03-协议 §8）
    if (tests.executed === true && (!Array.isArray(tests.commands) || tests.commands.length === 0)) {
      add("tests.commands", "tests.executed=true 时必须提供实际执行的测试命令");
    }
  }
  if (!Array.isArray(report.known_issues)) add("known_issues", "数组（可为空）");
  if (typeof report.knowledge_updates_required !== "boolean") add("knowledge_updates_required", "必填布尔");
  if (typeof report.self_assessment !== "string" || report.self_assessment.length === 0) {
    add("self_assessment", "必填非空字符串");
  }
  // status=BLOCKED 时报告必须给出阻塞说明（C2: BLOCKED 必须可追责；03-协议 §1: 附证据引用）
  if (report.status === "BLOCKED" && Array.isArray(report.known_issues) && report.known_issues.length === 0
    && typeof report.self_assessment === "string" && report.self_assessment.length > 0) {
    add("known_issues", "status=BLOCKED 时 known_issues 不得为空（必须记录阻塞原因与解除条件）");
  }
  return errors;
}

/** 校验失败 → 抛 REQ-0002（含字段级 details）；合法时原样返回报告。 */
export function assertValidDevReport(report) {
  const errors = validateDevReport(report);
  if (errors.length > 0) {
    throw aieoError("REQ-0002", `SCHEMA_VALIDATION_FAILED: 开发报告不符合 03-协议 §6 结构（${errors.length} 项错误）`, {
      details: { field_errors: errors },
    });
  }
  return report;
}
