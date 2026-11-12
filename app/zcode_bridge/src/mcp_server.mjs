// AIEO Phase 1 M3 ZCode Bridge — AIEO MCP Server（stdio，受控工具集）
//
// 借鉴 POC-01（phase0/zcode-mcp-poc/server.mjs，MCP 6/6 PASS，SDK 1.32.2 同版）。
// 受控工具集（module-boundaries §2 M3；跨进程契约，受契约版本管理 §11.5）：
//   claim_task(task_id, correlation_id[, agent_id])
//       → M1 POST /api/v1/tasks/{task_id}/claim；非幂等独占租约；重复领取 → TASK-0003。
//         本会话同时只允许一个在途领取（单会话单任务），重复领取同会话也按 TASK-0003 fail-closed。
//   report_progress(task_id, correlation_id, stage[, detail, progress_percent])
//       → PROGRESS_UPDATED 消息经 M1 POST /api/v1/messages 投递入 Inbox。
//   submit_result(report)
//       → 03-协议 §6 开发报告结构校验（REQ-0002 字段级）→
//         M1 POST /api/v1/reports/development 登记 + DEVELOPMENT_COMPLETED 消息入 Inbox。
//
// MINOR-003 落地：每次工具调用写一条 C4 NDJSON 记录（event=mcp.tool.call），
// 参数摘要进 message，身份/关联字段进 C4 专用列；不落完整入参（脱敏边界 §5.4）。
// 工具只做"任务领取 / 进度上报 / 结果提交"，不开放文件读写、Shell、Git 等高权限能力（POC-01 边界）。

import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { aieoError, isAieoError, toC3Payload } from "./errors.mjs";
import { buildEnvelope } from "./message_builder.mjs";
import { assertValidDevReport } from "./report_schema.mjs";
import { redactValue } from "./logger.mjs";

export const SERVER_NAME = "aieo-zcode-bridge";
export const SERVER_VERSION = "0.1.0";
export const CONTRACT_VERSION = "1.0.0";

// message_id 秒级序号：进程内跨 server 实例共享、单调递增。
// 若按实例各自初始化（旧实现），同一进程内两个实例在同一秒创建时会产生相同
// MSG-YYYYMMDD-NNNNNN → M1 message_id 幂等去重把第二条不同内容消息判为 RES-0002。
// 跨进程唯一性最终由 M1 message_id 主键约束保证（契约边界，见 message_builder 说明）。
let _msgSeq = Math.floor((Date.now() / 1000) % 86_400);
function nextMessageSeq() {
  const nowBase = Math.floor((Date.now() / 1000) % 86_400);
  _msgSeq = Math.max(_msgSeq + 1, nowBase * 10); // 时钟回拨时保持单调
  return _msgSeq * 10 + Math.floor(Math.random() * 10);
}

const RE_TASK_ID = /^T-(P\d+-)?\d{3,}$/;
// 与 message_builder 保持一致：CORR- 前缀大小写敏感；UUIDv4 十六进制大小写均可
const RE_CORRELATION = /^(CORR-[A-Z0-9]+|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})$/;

/**
 * 构造 AIEO MCP Server 实例（不自动连接；由 startAieoMcpServer 或测试连接传输层）。
 * @param {object} deps 依赖注入
 * @param {import("./m1_client.mjs").M1Client} deps.m1Client  M1 契约接口（生产 HttpM1Client / 测试假实现）
 * @param {import("./logger.mjs").NdjsonLogger} deps.logger C4 NDJSON 日志器
 * @param {{agentId?: string, agentType?: string, sessionId?: string,
 *          orchestratorAgentId?: string, projectId?: string}} [opts]
 */
export function createAieoMcpServer(deps, opts = {}) {
  if (!deps?.m1Client) throw new Error("SYS-0001: createAieoMcpServer 需要注入 m1Client");
  if (!deps?.logger) throw new Error("SYS-0001: createAieoMcpServer 需要注入 logger");

  const agentId = opts.agentId ?? "ZCODE-01";
  const agentType = opts.agentType ?? "developer";
  const orchestratorAgentId = opts.orchestratorAgentId ?? "AIEO-ORCHESTRATOR";
  // agent_session_id：UUIDv4（C2 agents 表约定）；单会话单任务守卫的会话身份
  const sessionId = opts.sessionId ?? `SES-${randomUUID()}`;
  const m1 = deps.m1Client;
  const logger = deps.logger;

  /** 单会话单任务守卫：当前会话的在途领取状态。 */
  let activeClaim = null; // {task_id, claimed_at, correlation_id}

  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  /** 工具调用统一包装：计时 + C4 NDJSON 调用记录（MINOR-003）+ C3 错误折算。 */
  function wrapTool(toolName, handler, extraColumns = null) {
    return async (args, callExtras = {}) => {
      const t0 = Date.now();
      const base = {
        operation: toolName,
        task_id: args?.task_id,
        correlation_id: args?.correlation_id,
        agent_id: args?.agent_id ?? agentId,
        agent_type: agentType,
        session_id: sessionId,
        ...(extraColumns ? extraColumns(args) : {}),
      };
      try {
        const result = await handler(args, callExtras);
        logger.info("mcp.tool.call", `${toolName} 成功`, {
          ...base,
          result: "SUCCESS",
          duration_ms: Date.now() - t0,
          ...(result.logColumns ?? {}),
        });
        return { content: [{ type: "text", text: JSON.stringify(result.payload, null, 2) }] };
      } catch (err) {
        const c3 = toC3Payload(err, args?.correlation_id ?? null);
        logger.error("mcp.tool.call", `${toolName} 失败: ${c3.message}`, {
          ...base,
          result: "FAILURE",
          duration_ms: Date.now() - t0,
          error_code: c3.code,
          retryable: c3.retryable,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(c3, null, 2) }],
          isError: true,
        };
      }
    };
  }

  function requireArgs(args, required) {
    for (const [k, fmt] of required) {
      const v = args?.[k];
      if (typeof v !== "string" || v.length === 0) {
        throw aieoError("REQ-0001", `INVALID_ARGUMENT: 缺少必填参数 ${k}`);
      }
      if (fmt && !fmt.test(v)) {
        throw aieoError("REQ-0001", `INVALID_ARGUMENT: 参数 ${k} 格式不合法: "${v}"`);
      }
    }
  }

  // ---- claim_task ----
  server.registerTool(
    "claim_task",
    {
      title: "AIEO 任务领取",
      description:
        "领取 AIEO 任务（M1 独占租约，仅 READY 且依赖满足）。重复领取（含本会话重复领取）将返回 TASK-0003 拒绝。",
      inputSchema: {
        task_id: z.string().min(1).describe("任务 ID，格式 T-(P\\d+-)?\\d{3,}"),
        correlation_id: z.string().min(1).describe("本次交互关联 ID（CORR-<序号> 或 UUIDv4）"),
        agent_id: z.string().optional().describe("执行端 agent_id（默认本服务身份 ZCODE-01）"),
      },
    },
    wrapTool("claim_task", async (args) => {
      requireArgs(args, [["task_id", RE_TASK_ID], ["correlation_id", RE_CORRELATION]]);
      if (activeClaim) {
        throw aieoError("TASK-0003", `TASK_ALREADY_CLAIMED: 本会话已领取任务 ${activeClaim.task_id}（单会话单任务），须先 submit_result 结束当前任务`, {
          details: { active_task: activeClaim.task_id, claimed_at: activeClaim.claimed_at },
          correlation_id: args.correlation_id,
        });
      }
      const claimedAt = new Date().toISOString();
      const task = await m1.claimTask({
        task_id: args.task_id,
        agent_id: args.agent_id ?? agentId,
        agent_type: agentType,
        correlation_id: args.correlation_id,
        session_id: sessionId,
        claimed_at: claimedAt,
      });
      // 缓存任务上下文（project/batch），供本会话后续 report_progress / submit_result 组信封
      activeClaim = {
        task_id: args.task_id,
        project_id: task?.project_id ?? null,
        batch_id: task?.batch_id ?? null,
        claimed_at: claimedAt,
        correlation_id: args.correlation_id,
      };
      // TASK_ACCEPTED 确认领取消息入 Inbox（03-协议 §3；领取租约本身由 /claim 端点记录）
      let messageAck = null;
      if (activeClaim.project_id && activeClaim.batch_id) {
        const envelope = buildEnvelope({
          message_type: "TASK_ACCEPTED",
          project_id: activeClaim.project_id,
          batch_id: activeClaim.batch_id,
          task_id: args.task_id,
          correlation_id: args.correlation_id,
          source: { agent_id: agentId, agent_type: agentType },
          target: { agent_id: orchestratorAgentId, agent_type: "system" },
          payload: { claimed_at: claimedAt, session_id: sessionId },
          messageIdSeq: nextSeq(),
        });
        const ack = await m1.submitMessage(envelope);
        messageAck = { message_id: ack.message_id, status: ack.status };
      }
      return {
        payload: {
          accepted: true,
          session_id: sessionId,
          task,
          message_ack: messageAck,
        },
        logColumns: { execution_id: task?.execution_id, message_id: messageAck?.message_id },
      };
    })
  );

  // ---- report_progress ----
  server.registerTool(
    "report_progress",
    {
      title: "AIEO 进度上报",
      description:
        "向 AIEO 上报开发进度（PROGRESS_UPDATED 消息入 Inbox）。--json 仅在结束后返回，运行中状态靠本工具主动上报。",
      inputSchema: {
        task_id: z.string().min(1).describe("任务 ID"),
        correlation_id: z.string().min(1).describe("本次交互关联 ID（与领取时一致）"),
        stage: z.string().min(1).describe("阶段名，如 implementing / testing / blocked"),
        detail: z.string().optional().describe("进度说明（一句话，不含敏感信息）"),
        progress_percent: z.number().int().min(0).max(100).optional().describe("进度百分比 0-100"),
      },
    },
    wrapTool("report_progress", async (args) => {
      requireArgs(args, [["task_id", RE_TASK_ID], ["correlation_id", RE_CORRELATION], ["stage", /^[a-z0-9_.-]{1,64}$/i]]);
      if (activeClaim && activeClaim.task_id !== args.task_id) {
        throw aieoError("RES-0002", `RESOURCE_CONFLICT: 本会话在途任务为 ${activeClaim.task_id}，不允许跨任务上报进度`, {
          correlation_id: args.correlation_id,
        });
      }
      // project/batch 上下文：取自领取缓存；无缓存（如会话重连后补报进度）时由调用方经
      // project_id/batch_id 参数补充（zod passthrough），两者皆无 → REQ-0001
      const projectId = activeClaim?.project_id ?? args.project_id;
      const batchId = activeClaim?.batch_id ?? args.batch_id;
      if (typeof projectId !== "string" || projectId.length === 0 || typeof batchId !== "string" || batchId.length === 0) {
        throw aieoError("REQ-0001", "INVALID_ARGUMENT: 缺少 project_id/batch_id 上下文（本会话未领取任务且未随参数提供）", {
          correlation_id: args.correlation_id,
        });
      }
      const envelope = buildEnvelope({
        message_type: "PROGRESS_UPDATED",
        project_id: projectId,
        batch_id: batchId,
        task_id: args.task_id,
        correlation_id: args.correlation_id,
        source: { agent_id: agentId, agent_type: agentType },
        target: { agent_id: orchestratorAgentId, agent_type: "system" },
        payload: redactValue({
          stage: args.stage,
          detail: args.detail ?? null,
          progress_percent: args.progress_percent ?? null,
          session_id: sessionId,
        }),
        messageIdSeq: nextSeq(),
      });
      const ack = await m1.submitMessage(envelope);
      return {
        payload: { delivered: true, message_id: ack.message_id, status: ack.status, duplicate: ack.duplicate === true },
        logColumns: { message_id: ack.message_id },
      };
    })
  );

  // ---- submit_result ----
  server.registerTool(
    "submit_result",
    {
      title: "AIEO 提交结果",
      description:
        "提交开发报告（03-协议 §6 结构）。先结构校验（REQ-0002），再经 M1 登记开发报告并投递 DEVELOPMENT_COMPLETED 消息。",
      inputSchema: {
        // 结构校验下沉到 assertValidDevReport（REQ-0002 字段级明细，C3 §4.2）：
        // 若用 zod 顶层对象强约束，畸形报告会在协议层被拒（-32602），拿不到字段级错误。
        // 工具描述承载 03-协议 §6 结构；未知可选字段按 C1 §2.2-4 忽略不拒收。
        report: z.record(z.unknown()).optional().describe(
          "开发报告，结构对齐 03-协议 §6：{task_id, execution_id, status(COMPLETED|BLOCKED), "
          + "implementation_summary, git{repository, branch, base_commit(40位SHA), commit_sha(40位SHA), changed_files}, "
          + "tests{executed, commands, passed, failed, log_artifact_id?}, known_issues, "
          + "knowledge_updates_required, self_assessment, correlation_id?, batch_id?}"
        ),
      },
    },
    wrapTool("submit_result", async (args) => {
      const report = args?.report;
      if (!report || typeof report !== "object") {
        throw aieoError("REQ-0001", "INVALID_ARGUMENT: 缺少必填参数 report");
      }
      assertValidDevReport(report); // REQ-0002 with field_errors
      const correlationId = report.correlation_id ?? activeClaim?.correlation_id;
      if (typeof correlationId !== "string" || correlationId.length === 0) {
        throw aieoError("REQ-0001", "INVALID_ARGUMENT: report.correlation_id 缺失且当前会话无在途领取可继承");
      }
      if (activeClaim && activeClaim.task_id !== report.task_id) {
        throw aieoError("RES-0002", `RESOURCE_CONFLICT: 本会话在途任务为 ${activeClaim.task_id}，不允许提交其他任务的结果`, {
          correlation_id: correlationId,
        });
      }
      // 信封上下文：git.repository 即 project_id（03-协议 §6 示例）；batch_id 取领取缓存或 report.batch_id
      const projectId = report.git?.repository ?? activeClaim?.project_id ?? "";
      const batchId = report.batch_id ?? activeClaim?.batch_id ?? "";
      if (projectId.length === 0 || batchId.length === 0) {
        throw aieoError("REQ-0001", "INVALID_ARGUMENT: 无法确定 project_id/batch_id（报告 git.repository 缺失且本会话无领取缓存）", {
          correlation_id: correlationId,
        });
      }

      // ① 开发报告登记（幂等：execution_id 唯一；重复 → 返回原登记结果，不重复执行副作用）
      const registry = await m1.registerDevReport({ ...report, correlation_id: correlationId });
      if (registry.duplicate) {
        // 同一报告已登记并投递过：不再产生第二条 DEVELOPMENT_COMPLETED（03-协议 §9-1 重复消息不重复处理）
        return {
          payload: {
            accepted: true,
            report_registry: { registered: true, duplicate: true, dev_report_id: registry.dev_report_id },
            message_ack: { skipped: true, reason: "duplicate_registration_no_new_message" },
          },
          logColumns: { execution_id: report.execution_id, result: "SUCCESS" },
        };
      }
      // ② DEVELOPMENT_COMPLETED 消息入 Inbox（幂等：message_id 主键去重）
      const envelope = buildEnvelope({
        message_type: "DEVELOPMENT_COMPLETED",
        project_id: projectId,
        batch_id: batchId,
        task_id: report.task_id,
        correlation_id: correlationId,
        source: { agent_id: agentId, agent_type: agentType },
        target: { agent_id: orchestratorAgentId, agent_type: "system" },
        payload: redactValue({ ...report, session_id: sessionId }),
        messageIdSeq: nextSeq(),
      });
      const ack = await m1.submitMessage(envelope);

      if (activeClaim && activeClaim.task_id === report.task_id) activeClaim = null; // 任务结束，会话可领取下一个
      return {
        payload: {
          accepted: true,
          report_registry: { registered: registry.registered, duplicate: registry.duplicate === true, dev_report_id: registry.dev_report_id },
          message_ack: { message_id: ack.message_id, status: ack.status, duplicate: ack.duplicate === true },
        },
        logColumns: { message_id: ack.message_id, execution_id: report.execution_id },
      };
    }, (args) => ({ task_id: args?.report?.task_id, correlation_id: args?.report?.correlation_id }))
  );

  /** message_id 序号：委托进程级共享计数器（见模块头 nextMessageSeq 说明）。 */
  const nextSeq = nextMessageSeq;

  server.registrationState = { agentId, agentType, sessionId, getActiveClaim: () => activeClaim };
  return server;
}

/** 启动 stdio 传输（bin 入口）。 */
export async function startAieoMcpServer(server) {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  return transport;
}
