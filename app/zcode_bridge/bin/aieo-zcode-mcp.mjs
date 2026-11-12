#!/usr/bin/env node
// AIEO Phase 1 M3 ZCode Bridge — MCP Server stdio 启动入口
//
// 用法（ZCode 客户端 / 手工调试）：
//   node bin/aieo-zcode-mcp.mjs
// 环境变量（C6，见 src/config.mjs）：AIEO_ENV / AIEO_ZCODE_BRIDGE_M1_BASE_URL /
//   AIEO_ZCODE_BRIDGE_M1_MODE（http|fake-file）/ AIEO_ZCODE_BRIDGE_M1_FAKE_STATE /
//   AIEO_ZCODE_BRIDGE_LOG_DIR / AIEO_ZCODE_BRIDGE_ALLOWED_MODES ...
//
// 测试形态：AIEO_ZCODE_BRIDGE_M1_MODE=fake-file + AIEO_ZCODE_BRIDGE_M1_FAKE_STATE=<path>
//   → 使用 FileBackedFakeM1Client（内存假实现语义 + 状态文件落盘，供测试进程核验），
//     不访问任何真实 HTTP 服务。

import { loadConfig, ensureDir } from "../src/config.mjs";
import { NdjsonLogger } from "../src/logger.mjs";
import { HttpM1Client } from "../src/m1_client.mjs";
import { FileBackedFakeM1Client } from "../src/fake_m1_client.mjs";
import { createAieoMcpServer, startAieoMcpServer, SERVER_NAME, SERVER_VERSION, CONTRACT_VERSION } from "../src/mcp_server.mjs";

const config = loadConfig();

// fail-fast 清单（C6 §7.1-5：一次性输出全部缺失/非法项）——当前 M3 只有 WARNING 级项
for (const w of config.configWarnings) {
  process.stderr.write(`[aieo-zcode-bridge][config-warning] ${w}\n`);
}

ensureDir(config.logDir);
const logger = new NdjsonLogger({ logDir: config.logDir, env: config.env, retentionDays: config.logRetentionDays });

logger.info("server.start", `${SERVER_NAME}@${SERVER_VERSION} 启动（contract=${CONTRACT_VERSION}, mode=${config.m1ClientMode}）`, {
  operation: "start_server", result: "SUCCESS",
});

let m1;
if (config.m1ClientMode === "fake-file") {
  if (!config.m1FakeStatePath) {
    process.stderr.write("[aieo-zcode-bridge][fatal] fake-file 模式需要 AIEO_ZCODE_BRIDGE_M1_FAKE_STATE\n");
    process.exit(2);
  }
  m1 = new FileBackedFakeM1Client({ statePath: config.m1FakeStatePath });
} else {
  m1 = new HttpM1Client({
    baseUrl: config.m1BaseUrl,
    serviceToken: config.m1ServiceToken,
    logger,
  });
}

const server = createAieoMcpServer(
  { m1Client: m1, logger },
  { sessionId: process.env.AIEO_ZCODE_BRIDGE_SESSION_ID || undefined }
);

try {
  await startAieoMcpServer(server);
} catch (err) {
  logger.error("server.start_failed", `MCP stdio 连接失败: ${err.message}`, {
    operation: "start_server", result: "FAILURE", error_code: "SYS-0001", retryable: false,
  });
  process.exit(1);
}

process.on("exit", () => {
  logger.info("server.stop", `${SERVER_NAME} 退出`, { operation: "stop_server", result: "SUCCESS" });
  logger.close();
});
