// 机器可执行 Schema 的真实 Ajv 正/负例测试。
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import addKeywords from "ajv-keywords";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaDir = join(__dirname, "..", "..", "contracts", "v1.0");
const schemaNames = [
  "git-pointer.schema.json",
  "git-pointer-manifest.schema.json",
  "review-report.schema.json",
  "gpt-inbound-poc.schema.json",
  // T-P1-904 固定 20 文件清单中的 19 份 Schema（tasks-detail-response 必须先于
  // tasks-list-response 编译：后者以 $id 外部 $ref 引用前者）。
  "message-envelope.schema.json",
  "task-plan-request.payload.schema.json",
  "task-plan-submitted.payload.schema.json",
  "development-completed.payload.schema.json",
  "development-report.schema.json",
  "test-report.schema.json",
  "error-response.schema.json",
  "projects-create.schema.json",
  "batches-create.schema.json",
  "tasks-create.schema.json",
  "tasks-event.schema.json",
  "tasks-detail-response.schema.json",
  "tasks-list-response.schema.json",
  "messages-create.schema.json",
  "messages-ack.schema.json",
  "messages-list-response.schema.json",
  "reports-development.schema.json",
  "reports-test.schema.json",
  "reports-list-response.schema.json",
];

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
addKeywords(ajv);

const validators = Object.fromEntries(schemaNames.map((name) => {
  const schema = JSON.parse(readFileSync(join(schemaDir, name), "utf8"));
  return [name, ajv.compile(schema)];
}));

const commitA = "a".repeat(40);
const commitB = "b".repeat(40);
const commitC = "c".repeat(40);
const shaA = "1".repeat(64);
const shaB = "2".repeat(64);
const shaC = "3".repeat(64);

const pointer = {
  transport: "git_pointer",
  owner: "Hulkhao",
  repo: "AIEO",
  branch: "fix/AIEO-PHASE0-REVIEW-R10",
  commit_sha: commitA,
  path: "handoff/manifest.json",
  artifact_sha256: shaA,
  size_bytes: 1024,
  media_type: "application/vnd.aieo.git-material-manifest+json",
  contract_version: "1.0",
  task_id: "T-P1-001",
  execution_id: "EXEC-001",
};
const manifest = {
  transport: "git_pointer_manifest",
  contract_version: "1.0",
  task_id: "T-P1-001",
  execution_id: "EXEC-001",
  files: [
    {
      path: "handoff/task.md",
      artifact_sha256: shaB,
      size_bytes: 100,
      media_type: "text/markdown",
    },
  ],
};
const review = {
  contract_version: "1.0",
  task_id: "T-P1-001",
  execution_id: "EXEC-001",
  correlation_id: "CORR-001",
  reviewer_agent_id: "GPT-03",
  reviewed_commit: commitA,
  input_material_commit: commitB,
  input_material_manifest_path: "handoff/manifest.json",
  input_material_manifest_sha256: shaA,
  task_package_hash: shaB,
  base_commit: commitC,
  engineering_standard_version: "v1.0.0",
  knowledge_base_commit: commitC,
  result: "PASS",
  summary: "审查通过",
};

const poc = {
  test: "INBOUND_SCHEMA_M1_POC",
  text: "汉".repeat(1000),
  task_id: "T-P1-901",
  execution_id: "EXEC-901",
  correlation_id: "CORR-901",
};

const cases = [];
function valid(schema, name, value) { cases.push({ schema, name, value, expected: true }); }
function invalid(schema, name, value) { cases.push({ schema, name, value, expected: false }); }
// 双形态文件（请求/响应 $defs 合一）的形态级断言：按 JSON Pointer 取子模式独立编译。
function validSub(schema, sub, name, value) { cases.push({ schema, sub, name, value, expected: true }); }
function invalidSub(schema, sub, name, value) { cases.push({ schema, sub, name, value, expected: false }); }
function changed(value, mutate) {
  const copy = structuredClone(value);
  mutate(copy);
  return copy;
}

valid("git-pointer.schema.json", "GitPointer 正例", pointer);
valid("git-pointer.schema.json", "GitPointer 未知可选字段兼容", { ...pointer, future_optional: true });
invalid("git-pointer.schema.json", "缺 owner 必填", changed(pointer, (v) => delete v.owner));
invalid("git-pointer.schema.json", "commit_sha 短 SHA", changed(pointer, (v) => { v.commit_sha = "abc123"; }));
invalid("git-pointer.schema.json", "artifact_sha256 非 64 位小写 hex", changed(pointer, (v) => { v.artifact_sha256 = "X".repeat(64); }));
invalid("git-pointer.schema.json", "size_bytes 为零", changed(pointer, (v) => { v.size_bytes = 0; }));
invalid("git-pointer.schema.json", "path 穿越", changed(pointer, (v) => { v.path = "handoff/../secret"; }));
invalid("git-pointer.schema.json", "path 外部 URL", changed(pointer, (v) => { v.path = "https://example.com/x"; }));
invalid("git-pointer.schema.json", "根指针不得直指裸文本", changed(pointer, (v) => { v.media_type = "text/plain"; }));
invalid("git-pointer.schema.json", "task_id 格式错误", changed(pointer, (v) => { v.task_id = "TASK-1"; }));

valid("git-pointer-manifest.schema.json", "单文件 manifest 正例", manifest);
valid("git-pointer-manifest.schema.json", "多文件 manifest 正例", {
  ...manifest,
  files: [
    ...manifest.files,
    { path: "handoff/data.json", artifact_sha256: shaC, size_bytes: 200, media_type: "application/json" },
  ],
});
invalid("git-pointer-manifest.schema.json", "缺 files 必填", changed(manifest, (v) => delete v.files));
invalid("git-pointer-manifest.schema.json", "files 空数组", changed(manifest, (v) => { v.files = []; }));
invalid("git-pointer-manifest.schema.json", "不同文件项 path 重复", {
  ...manifest,
  files: [
    ...manifest.files,
    { path: "handoff/task.md", artifact_sha256: shaC, size_bytes: 999, media_type: "text/plain" },
  ],
});
invalid("git-pointer-manifest.schema.json", "文件项缺 hash", changed(manifest, (v) => delete v.files[0].artifact_sha256));
invalid("git-pointer-manifest.schema.json", "文件项 size_bytes 非整数", changed(manifest, (v) => { v.files[0].size_bytes = 1.5; }));
invalid("git-pointer-manifest.schema.json", "文件媒体类型不支持", changed(manifest, (v) => { v.files[0].media_type = "application/octet-stream"; }));
invalid("git-pointer-manifest.schema.json", "文件 path 绝对路径", changed(manifest, (v) => { v.files[0].path = "/etc/passwd"; }));
invalid("git-pointer-manifest.schema.json", "manifest transport 错误", changed(manifest, (v) => { v.transport = "git_pointer"; }));

valid("review-report.schema.json", "审查 PASS 正例", review);
valid("review-report.schema.json", "审查 BLOCKED 讨论字段与未知字段", {
  ...review,
  result: "BLOCKED",
  required_boundaries: ["补 Schema"],
  failure_paths: ["写盘失败则 BLOCKED"],
  remaining_findings: ["待补真实 POC"],
  unblocked: false,
  future_optional: { ignored: true },
});
valid("review-report.schema.json", "findings 正例", {
  ...review,
  result: "REWORK",
  findings: [{ finding_id: "F-001", severity: "MAJOR", description: "需修复" }],
});
invalid("review-report.schema.json", "result 枚举错误", changed(review, (v) => { v.result = "SUCCESS"; }));
invalid("review-report.schema.json", "缺 summary", changed(review, (v) => delete v.summary));
invalid("review-report.schema.json", "缺 execution_id 绑定", changed(review, (v) => delete v.execution_id));
invalid("review-report.schema.json", "reviewed_commit 非完整 SHA", changed(review, (v) => { v.reviewed_commit = "1234567"; }));
invalid("review-report.schema.json", "缺输入 manifest hash 绑定", changed(review, (v) => delete v.input_material_manifest_sha256));
invalid("review-report.schema.json", "correlation_id 格式错误", changed(review, (v) => { v.correlation_id = "corr-1"; }));
invalid("review-report.schema.json", "unblocked 类型错误", changed(review, (v) => { v.unblocked = "false"; }));

valid("gpt-inbound-poc.schema.json", "入站 POC 1000 汉字正例", poc);
valid("gpt-inbound-poc.schema.json", "入站 POC 1500 汉字上界", changed(poc, (v) => { v.text = "汉".repeat(1500); }));
invalid("gpt-inbound-poc.schema.json", "入站 POC text 不足 1000", changed(poc, (v) => { v.text = "汉".repeat(999); }));
invalid("gpt-inbound-poc.schema.json", "入站 POC text 超 1500", changed(poc, (v) => { v.text = "汉".repeat(1501); }));
invalid("gpt-inbound-poc.schema.json", "入站 POC text 混入非汉字", changed(poc, (v) => { v.text = `${"汉".repeat(999)}A`; }));
invalid("gpt-inbound-poc.schema.json", "入站 POC test 标识错误", changed(poc, (v) => { v.test = "OTHER"; }));
invalid("gpt-inbound-poc.schema.json", "入站 POC 缺 correlation_id", changed(poc, (v) => { delete v.correlation_id; }));

// ---- T-P1-904：19 份新增 Schema 的正/负例（字段与实装一致，patterns 取自 app/platform/schemas.py）----
const agentRef = { agent_id: "ZCODE-01", agent_type: "developer" };
const systemRef = { agent_id: "AIEO-ORCHESTRATOR", agent_type: "system" };
const ts = "2026-11-14T00:00:00.000000+00:00";

const envelopeDevCompleted = {
  schema_version: "1.0",
  message_id: "MSG-20261114-000001",
  message_type: "DEVELOPMENT_COMPLETED",
  created_at: "2026-11-14T00:00:00.000Z",
  source: agentRef,
  target: systemRef,
  project_id: "AI-IMAGE-SERVICE",
  batch_id: "BATCH-001",
  task_id: "T-P1-001",
  correlation_id: "CORR-001",
  payload: { task_id: "T-P1-001", execution_id: "EXEC-001", status: "COMPLETED", implementation_summary: "完成" },
};
const envelopePlanRequest = {
  ...envelopeDevCompleted,
  message_id: "MSG-20261114-000002",
  message_type: "TASK_PLAN_REQUEST",
  source: systemRef,
  target: { agent_id: "GPT-01", agent_type: "system" },
  task_id: null,
  payload: {
    project_id: "AI-IMAGE-SERVICE",
    batch_id: "BATCH-001",
    requirement: "增加一个生图供应商并支持故障切换",
    engineering_standard_version: "v1.0.0",
    knowledge_base_commit: commitA,
  },
};
const envelopeApproval = {
  ...envelopeDevCompleted,
  message_id: "MSG-20261114-000003",
  message_type: "APPROVAL_REQUIRED",
  source: systemRef,
  target: { agent_id: "HUMAN-USER", agent_type: "user" },
  batch_id: null,
  task_id: null,
};

valid("message-envelope.schema.json", "信封 task 级 DEVELOPMENT_COMPLETED 正例", envelopeDevCompleted);
valid("message-envelope.schema.json", "信封 batch 级 TASK_PLAN_REQUEST 正例（task_id null）", envelopePlanRequest);
valid("message-envelope.schema.json", "信封 project 级 APPROVAL_REQUIRED 正例（batch/task 均 null）", envelopeApproval);
valid("message-envelope.schema.json", "信封未知可选字段兼容（C1 §2.2 规则 4）", { ...envelopeDevCompleted, future_optional: { ignored: true } });
invalid("message-envelope.schema.json", "信封缺 message_id", changed(envelopeDevCompleted, (v) => delete v.message_id));
invalid("message-envelope.schema.json", "信封 message_id 格式错误", changed(envelopeDevCompleted, (v) => { v.message_id = "MSG-20261114-1"; }));
invalid("message-envelope.schema.json", "信封 schema_version 缺 MINOR", changed(envelopeDevCompleted, (v) => { v.schema_version = "1"; }));
invalid("message-envelope.schema.json", "信封 message_type 越权扩展", changed(envelopeDevCompleted, (v) => { v.message_type = "NEW_TYPE"; }));
invalid("message-envelope.schema.json", "batch 级携带 task_id 被拒（实装 REQ-0001）", changed(envelopePlanRequest, (v) => { v.task_id = "T-P1-001"; }));
invalid("message-envelope.schema.json", "task 级缺 batch_id 被拒", changed(envelopeDevCompleted, (v) => delete v.batch_id));
invalid("message-envelope.schema.json", "project 级携带 batch_id 被拒", changed(envelopeApproval, (v) => { v.batch_id = "BATCH-001"; }));
invalid("message-envelope.schema.json", "信封 correlation_id 非法", changed(envelopeDevCompleted, (v) => { v.correlation_id = "corr-1"; }));
invalid("message-envelope.schema.json", "信封 agent_type 非法", changed(envelopeDevCompleted, (v) => { v.source = { agent_id: "ZCODE-01", agent_type: "worker" }; }));
invalid("message-envelope.schema.json", "信封 created_at 非时间戳", changed(envelopeDevCompleted, (v) => { v.created_at = "yesterday"; }));

const errorResponse = {
  code: "TASK-0001",
  message: "INVALID_STATE_TRANSITION: REWORK 状态不接受 dispatch 事件",
  details: { field: "event", reason: "当前状态 REWORK 无该出边" },
  retryable: false,
  correlation_id: "CORR-001",
};
valid("error-response.schema.json", "C3 错误体正例", errorResponse);
valid("error-response.schema.json", "C3 错误体无 details 正例", changed(errorResponse, (v) => delete v.details));
invalid("error-response.schema.json", "C3 错误体缺 retryable", changed(errorResponse, (v) => delete v.retryable));
invalid("error-response.schema.json", "C3 错误码组名非法", changed(errorResponse, (v) => { v.code = "XXX-0001"; }));
invalid("error-response.schema.json", "C3 错误码序号非 4 位", changed(errorResponse, (v) => { v.code = "TASK-001"; }));
invalid("error-response.schema.json", "C3 错误体缺 correlation_id", changed(errorResponse, (v) => delete v.correlation_id));
invalid("error-response.schema.json", "C3 错误体 message 为空", changed(errorResponse, (v) => { v.message = ""; }));

valid("task-plan-request.payload.schema.json", "规划请求 payload 正例", envelopePlanRequest.payload);
invalid("task-plan-request.payload.schema.json", "规划请求缺 requirement", changed(envelopePlanRequest.payload, (v) => delete v.requirement));
invalid("task-plan-request.payload.schema.json", "规划请求 knowledge_base_commit 短 SHA", changed(envelopePlanRequest.payload, (v) => { v.knowledge_base_commit = "abc123"; }));
invalid("task-plan-request.payload.schema.json", "规划请求 batch_id 格式错误", changed(envelopePlanRequest.payload, (v) => { v.batch_id = "B1"; }));

const planSubmitted = {
  result: "SUCCESS",
  batch_id: "BATCH-001",
  project_id: "AI-IMAGE-SERVICE",
  requirement_summary: "增加一个生图供应商并支持故障切换",
  tasks: [
    {
      task_id: "T-P1-001",
      title: "新增供应商接口适配器",
      description: "实现统一供应商接口",
      priority: "P1",
      dependencies: [],
      files_scope: ["src/providers/"],
      acceptance_criteria: ["实现统一接口", "覆盖异常处理", "通过指定单元测试"],
      engineering_standard_items: ["requirements", "architecture", "implementation", "code_quality", "testing", "git"],
      risks: [],
    },
  ],
  open_questions: [],
};
valid("task-plan-submitted.payload.schema.json", "任务计划提交正例（03-协议 §4 同构）", planSubmitted);
invalid("task-plan-submitted.payload.schema.json", "任务计划 tasks 为空", changed(planSubmitted, (v) => { v.tasks = []; }));
invalid("task-plan-submitted.payload.schema.json", "任务计划缺 result", changed(planSubmitted, (v) => delete v.result));
invalid("task-plan-submitted.payload.schema.json", "任务计划 priority 非法", changed(planSubmitted, (v) => { v.tasks[0].priority = "P4"; }));
invalid("task-plan-submitted.payload.schema.json", "任务计划依赖 task_id 格式错误", changed(planSubmitted, (v) => { v.tasks[0].dependencies = ["TASK-1"]; }));
invalid("task-plan-submitted.payload.schema.json", "任务计划缺 requirement_summary", changed(planSubmitted, (v) => delete v.requirement_summary));

const devReportFull = {
  task_id: "T-P1-001",
  execution_id: "EXEC-001",
  status: "COMPLETED",
  implementation_summary: "完成供应商接口适配器",
  git: {
    repository: "AI-IMAGE-SERVICE",
    branch: "feature/T-P1-001-provider-adapter",
    base_commit: commitA,
    commit_sha: commitB,
    changed_files: ["src/providers/base.py", "src/providers/new_provider.py"],
  },
  tests: { executed: true, commands: ["pytest tests/providers -q"], passed: 25, failed: 0, log_artifact_id: "ART-TEST-001" },
  known_issues: [],
  knowledge_updates_required: true,
  self_assessment: "实现完成，等待独立审查",
};
valid("development-completed.payload.schema.json", "DEVELOPMENT_COMPLETED payload 正例", { ...devReportFull, session_id: "SESS-001" });
invalid("development-completed.payload.schema.json", "DEVELOPMENT_COMPLETED BLOCKED 缺阻塞三字段", changed(devReportFull, (v) => { v.status = "BLOCKED"; }));
invalid("development-completed.payload.schema.json", "DEVELOPMENT_COMPLETED git.commit_sha 短 SHA", changed(devReportFull, (v) => { v.git.commit_sha = "abc123"; }));
invalid("development-completed.payload.schema.json", "DEVELOPMENT_COMPLETED 缺 implementation_summary", changed(devReportFull, (v) => delete v.implementation_summary));
invalid("development-completed.payload.schema.json", "DEVELOPMENT_COMPLETED execution_id 格式错误", changed(devReportFull, (v) => { v.execution_id = "E-1"; }));

valid("development-report.schema.json", "开发报告正例（03-协议 §6 同构）", devReportFull);
valid("development-report.schema.json", "开发报告 BLOCKED 带三字段正例", changed(devReportFull, (v) => {
  v.status = "BLOCKED";
  v.blocked_reason = "依赖仓库未就绪";
  v.blocked_owner = "AIEO-ORCHESTRATOR";
  v.unblock_condition = "仓库配置完成后继续";
}));
invalid("development-report.schema.json", "开发报告 BLOCKED 缺 unblock_condition", changed(devReportFull, (v) => {
  v.status = "BLOCKED";
  v.blocked_reason = "x";
  v.blocked_owner = "y";
}));
invalid("development-report.schema.json", "开发报告缺 task_id", changed(devReportFull, (v) => delete v.task_id));

const testReportFull = {
  task_id: "T-P1-001",
  execution_id: "EXEC-001",
  commit_sha: commitB,
  execution_result: "EXECUTED_PASS",
  result: "PASS",
  artifact_id: "ART-TEST-001",
  payload: { commands: ["pytest tests/providers -q"], passed: 25, failed: 0 },
};
valid("test-report.schema.json", "测试报告正例", testReportFull);
invalid("test-report.schema.json", "测试报告 execution_result 非法", changed(testReportFull, (v) => { v.execution_result = "PASSED"; }));
invalid("test-report.schema.json", "测试报告 result 非法", changed(testReportFull, (v) => { v.result = "SUCCESS"; }));
invalid("test-report.schema.json", "测试报告 commit_sha 短 SHA", changed(testReportFull, (v) => { v.commit_sha = "abc123"; }));
invalid("test-report.schema.json", "测试报告缺 commit_sha", changed(testReportFull, (v) => delete v.commit_sha));

valid("projects-create.schema.json", "项目创建请求正例", { project_id: "AI-IMAGE-SERVICE", name: "AI 生图服务", description: "示例项目" });
validSub("projects-create.schema.json", "#/$defs/response", "项目响应正例", {
  project_id: "AI-IMAGE-SERVICE", name: "AI 生图服务", description: "示例项目", status: "ACTIVE",
  knowledge_version: "v1", created_at: ts, updated_at: ts,
});
invalid("projects-create.schema.json", "项目请求缺 name", changed({ project_id: "AI-IMAGE-SERVICE", name: "x" }, (v) => delete v.name));
invalid("projects-create.schema.json", "项目 project_id 小写非法", changed({ project_id: "ai-image", name: "x" }, () => {}));
invalidSub("projects-create.schema.json", "#/$defs/response", "项目响应 status 非法", changed({
  project_id: "AI-IMAGE-SERVICE", name: "x", status: "RUNNING", created_at: ts, updated_at: ts,
}, () => {}));

valid("batches-create.schema.json", "批次创建请求正例", {
  project_id: "AI-IMAGE-SERVICE", requirement: "增加一个生图供应商并支持故障切换",
  engineering_standard_version: "v1.0.0", knowledge_base_commit: commitA,
});
validSub("batches-create.schema.json", "#/$defs/response", "批次响应正例", {
  batch_id: "BATCH-001", project_id: "AI-IMAGE-SERVICE", requirement: "增加一个生图供应商并支持故障切换",
  status: "PLANNING", engineering_standard_version: "v1.0.0", knowledge_base_commit: commitA,
  created_at: ts, updated_at: ts,
});
invalid("batches-create.schema.json", "批次请求 knowledge_base_commit 短 SHA", changed({
  project_id: "P1", requirement: "x", engineering_standard_version: "v1", knowledge_base_commit: "abc",
}, () => {}));
invalidSub("batches-create.schema.json", "#/$defs/response", "批次响应 status 非法", changed({
  batch_id: "BATCH-001", project_id: "P1", requirement: "x", status: "RUNNING",
  engineering_standard_version: "v1", knowledge_base_commit: commitA, created_at: ts, updated_at: ts,
}, () => {}));

const taskView = {
  task_id: "T-P1-001",
  batch_id: "BATCH-001",
  parent_id: null,
  title: "新增供应商接口适配器",
  description: null,
  status: "READY",
  priority: "P1",
  weight: 1.0,
  files_scope: ["src/providers/"],
  acceptance_criteria: ["实现统一接口"],
  engineering_standard_items: ["implementation", "testing"],
  task_package_hash: shaA,
  engineering_standard_version: "v1.0.0",
  knowledge_base_commit: commitA,
  blocked_reason: null,
  blocked_owner: null,
  unblock_condition: null,
  cancelled_by: null,
  cancelled_reason: null,
  created_at: ts,
  updated_at: ts,
  dependencies: [{ depends_on_task_id: "T-P1-000", status: "ACCEPTED" }],
  latest_execution: null,
  allowed_events: ["arch_review_pass"],
};
valid("tasks-create.schema.json", "任务创建请求正例", {
  batch_id: "BATCH-001", title: "新增供应商接口适配器", priority: "P1",
  files_scope: ["src/providers/"], acceptance_criteria: ["实现统一接口"],
  engineering_standard_items: ["implementation", "testing"],
  engineering_standard_version: "v1.0.0", knowledge_base_commit: commitA, dependencies: [],
});
validSub("tasks-create.schema.json", "#/$defs/response", "任务响应正例（task_view 同构）", taskView);
invalid("tasks-create.schema.json", "任务请求 weight 为零", changed({
  batch_id: "BATCH-001", title: "x", engineering_standard_version: "v1", knowledge_base_commit: commitA, weight: 0,
}, () => {}));
invalid("tasks-create.schema.json", "任务请求 priority 非法", changed({
  batch_id: "BATCH-001", title: "x", engineering_standard_version: "v1", knowledge_base_commit: commitA, priority: "P4",
}, () => {}));
invalidSub("tasks-create.schema.json", "#/$defs/response", "任务响应 status 非法", changed(taskView, (v) => { v.status = "DONE"; }));
invalidSub("tasks-create.schema.json", "#/$defs/response", "任务响应缺 allowed_events", changed(taskView, (v) => delete v.allowed_events));

valid("tasks-event.schema.json", "状态事件请求正例", { event: "claim", event_id: "EVT-001", correlation_id: "CORR-001" });
validSub("tasks-event.schema.json", "#/$defs/response", "状态事件响应正例", {
  task_id: "T-P1-001", event_id: "EVT-001", event: "claim",
  from_status: "READY", to_status: "DISPATCHED", duplicate: false, processed_at: ts,
});
invalid("tasks-event.schema.json", "状态事件请求缺 event_id", changed({ event: "claim", correlation_id: "CORR-001" }, () => {}));
invalidSub("tasks-event.schema.json", "#/$defs/response", "状态事件响应缺 duplicate", changed({
  task_id: "T-P1-001", event_id: "EVT-001", event: "claim",
  from_status: "READY", to_status: "DISPATCHED", processed_at: ts,
}, () => {}));

valid("tasks-detail-response.schema.json", "任务详情响应正例", taskView);
invalid("tasks-detail-response.schema.json", "任务详情 status 非法", changed(taskView, (v) => { v.status = "DONE"; }));
invalid("tasks-detail-response.schema.json", "任务详情 weight 为零", changed(taskView, (v) => { v.weight = 0; }));
invalid("tasks-detail-response.schema.json", "任务详情缺 dependencies", changed(taskView, (v) => delete v.dependencies));

valid("tasks-list-response.schema.json", "任务列表信封正例（外部 $ref 解析）", {
  items: [taskView], page: 1, page_size: 50, total: 1,
});
invalid("tasks-list-response.schema.json", "任务列表缺 total", changed({ items: [taskView], page: 1, page_size: 50 }, () => {}));
invalid("tasks-list-response.schema.json", "任务列表项 status 非法（$ref 内部校验）", changed({
  items: [changed(taskView, (v) => { v.status = "DONE"; })], page: 1, page_size: 50, total: 1,
}, () => {}));
invalid("tasks-list-response.schema.json", "任务列表 page 为零", changed({ items: [], page: 0, page_size: 50, total: 0 }, () => {}));

const messageRow = {
  message_id: "MSG-20261114-000001",
  schema_version: "1.0",
  message_type: "DEVELOPMENT_COMPLETED",
  direction: "INBOUND",
  source_agent_id: "ZCODE-01",
  target_agent_id: "AIEO-ORCHESTRATOR",
  project_id: "AI-IMAGE-SERVICE",
  batch_id: "BATCH-001",
  task_id: "T-P1-001",
  correlation_id: "CORR-001",
  payload: { task_id: "T-P1-001", execution_id: "EXEC-001", status: "COMPLETED", implementation_summary: "完成" },
  status: "PENDING",
  retry_count: 0,
  max_retries: 8,
  next_retry_at: null,
  last_error_code: null,
  last_error_message: null,
  delivered_at: null,
  acked_at: null,
  dead_lettered_at: null,
  processing_status: "PENDING",
  processed_at: null,
  created_at: ts,
  updated_at: ts,
};
valid("messages-create.schema.json", "消息提交请求正例（task 级）", envelopeDevCompleted);
valid("messages-create.schema.json", "消息提交请求 batch 级正例", envelopePlanRequest);
validSub("messages-create.schema.json", "#/$defs/response", "消息提交响应正例（message_view 同构）", messageRow);
invalid("messages-create.schema.json", "消息提交 batch 级携带 task_id 被拒", changed(envelopePlanRequest, (v) => { v.task_id = "T-P1-001"; }));
invalid("messages-create.schema.json", "消息提交 task 级缺 batch_id 被拒", changed(envelopeDevCompleted, (v) => delete v.batch_id));
invalid("messages-create.schema.json", "消息提交缺 payload", changed(envelopeDevCompleted, (v) => delete v.payload));
invalidSub("messages-create.schema.json", "#/$defs/response", "消息提交响应缺 status", changed(messageRow, (v) => delete v.status));

valid("messages-ack.schema.json", "ACK 请求空体正例", {});
valid("messages-ack.schema.json", "ACK 请求带 agent_id 正例", { agent_id: "ZCODE-01" });
validSub("messages-ack.schema.json", "#/$defs/response", "ACK 响应正例（ACKED）", changed(messageRow, (v) => {
  v.status = "ACKED";
  v.acked_at = ts;
  v.processing_status = "PROCESSED";
  v.processed_at = ts;
}));
invalid("messages-ack.schema.json", "ACK 请求 agent_id 小写非法", changed({ agent_id: "zcode-01" }, () => {}));
invalidSub("messages-ack.schema.json", "#/$defs/response", "ACK 响应 status 非法", changed(messageRow, (v) => { v.status = "DONE"; }));

valid("messages-list-response.schema.json", "消息列表信封正例", { items: [messageRow], page: 1, page_size: 50, total: 1 });
invalid("messages-list-response.schema.json", "消息列表缺 page", changed({ items: [messageRow], page_size: 50, total: 1 }, () => {}));
invalid("messages-list-response.schema.json", "消息列表项 direction 非法", changed({
  items: [changed(messageRow, (v) => { v.direction = "BOTH"; })], page: 1, page_size: 50, total: 1,
}, () => {}));

const devReportResponse = {
  task_id: "T-P1-001", execution_id: "EXEC-001", status: "COMPLETED",
  transition: { from_status: "IN_PROGRESS", to_status: "DEV_REPORTED" },
  created_at: ts, duplicate: false,
};
valid("reports-development.schema.json", "开发报告登记请求正例", {
  task_id: "T-P1-001", execution_id: "EXEC-001", status: "COMPLETED",
  payload: { implementation_summary: "完成供应商接口适配器" },
});
validSub("reports-development.schema.json", "#/$defs/response", "开发报告登记响应正例", devReportResponse);
valid("reports-development.schema.json", "开发报告登记 BLOCKED 请求正例", {
  task_id: "T-P1-001", execution_id: "EXEC-001", status: "BLOCKED",
  blocked_reason: "依赖未就绪", blocked_owner: "AIEO-ORCHESTRATOR", unblock_condition: "仓库配置完成",
});
invalid("reports-development.schema.json", "开发报告登记 BLOCKED 缺 blocked_reason", changed({
  task_id: "T-P1-001", execution_id: "EXEC-001", status: "BLOCKED",
  blocked_owner: "AIEO-ORCHESTRATOR", unblock_condition: "仓库配置完成",
}, () => {}));
invalid("reports-development.schema.json", "开发报告登记 execution_id 格式错误", changed({
  task_id: "T-P1-001", execution_id: "E-1", status: "COMPLETED",
}, () => {}));
invalidSub("reports-development.schema.json", "#/$defs/response", "开发报告登记响应缺 duplicate", changed(devReportResponse, (v) => delete v.duplicate));

const testReportResponse = {
  task_id: "T-P1-001", execution_id: "EXEC-001", commit_sha: commitB,
  execution_result: "EXECUTED_PASS", result: "PASS",
  transition: { from_status: "TEST_ACCEPTANCE", to_status: "ACCEPTED" },
  created_at: ts, duplicate: false,
};
valid("reports-test.schema.json", "测试报告登记请求正例", testReportFull);
validSub("reports-test.schema.json", "#/$defs/response", "测试报告登记响应正例", testReportResponse);
invalid("reports-test.schema.json", "测试报告登记 execution_result 非法", changed(testReportFull, (v) => { v.execution_result = "PASSED"; }));
invalid("reports-test.schema.json", "测试报告登记缺 result", changed(testReportFull, (v) => delete v.result));
invalidSub("reports-test.schema.json", "#/$defs/response", "测试报告登记响应缺 transition", changed(testReportResponse, (v) => delete v.transition));

const devListItem = {
  type: "development", task_id: "T-P1-001", execution_id: "EXEC-001",
  result: "COMPLETED", payload: { implementation_summary: "完成" }, created_at: ts,
};
const reviewListItem = {
  type: "review", task_id: "T-P1-001", execution_id: "EXEC-001",
  reviewed_commit: commitB, reviewer: "GPT-03", result: "PASS",
  task_package_hash: shaA, base_commit: commitA, payload: {}, created_at: ts,
};
const testListItem = {
  type: "test", task_id: "T-P1-001", execution_id: "EXEC-001",
  commit_sha: commitB, execution_result: "EXECUTED_PASS", result: "PASS",
  artifact_id: null, payload: {}, created_at: ts,
};
valid("reports-list-response.schema.json", "报告列表三形态正例", {
  items: [devListItem, reviewListItem, testListItem], page: 1, page_size: 50, total: 3,
});
invalid("reports-list-response.schema.json", "报告列表 development result 枚举非法", changed({
  items: [changed(devListItem, (v) => { v.result = "PASS"; })], page: 1, page_size: 50, total: 1,
}, () => {}));
invalid("reports-list-response.schema.json", "报告列表 review 缺 task_package_hash", changed({
  items: [changed(reviewListItem, (v) => delete v.task_package_hash)], page: 1, page_size: 50, total: 1,
}, () => {}));
invalid("reports-list-response.schema.json", "报告列表缺 page_size", changed({
  items: [devListItem], page: 1, total: 1,
}, () => {}));

let passed = 0;
let failed = 0;
for (const testCase of cases) {
  let validate = validators[testCase.schema];
  if (testCase.sub) {
    // 子模式校验：$id 已在首轮编译时注册，可按 pointer 解析（如 #/$defs/response）。
    validate = ajv.compile({ $ref: `${validators[testCase.schema].schema.$id}${testCase.sub}` });
  }
  const actual = validate(testCase.value);
  const ok = actual === testCase.expected;
  const detail = actual ? "valid" : (validate.errors ?? []).map((error) => `${error.instancePath || "/"} ${error.message}`).join("; ");
  console.log(`${ok ? "PASS" : "FAIL"} [${testCase.schema}] ${testCase.name} -> ${actual} (${detail})`);
  if (ok) passed += 1;
  else failed += 1;
}
console.log(`SCHEMA_TEST_SUMMARY total=${cases.length} passed=${passed} failed=${failed}`);
if (failed > 0) process.exitCode = 1;
