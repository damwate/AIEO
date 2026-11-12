// AIEO Phase 1 M3 ZCode Bridge — 库入口（统一导出公共 API）
//
// 跨进程契约边界：MCP 工具（claim_task/report_progress/submit_result）与 ZCode CLI 命令
// 形态是跨进程契约（platform-contract §11.5）；本文件导出的函数是包内实现接口，
// 不构成跨模块公共契约，其变更不触发契约变更流程。

export * from "./config.mjs";
export * from "./errors.mjs";
export * from "./logger.mjs";
export * from "./m1_client.mjs";
export * from "./fake_m1_client.mjs";
export * from "./message_builder.mjs";
export * from "./report_schema.mjs";
export * from "./mcp_server.mjs";
export * from "./cli_adapter.mjs";
export * from "./cancel.mjs";
export * from "./workspace_lock.mjs";
