# POC-01 验证报告：ZCode MCP 工具调用

**结论：PASS（当前版本 ZCode CLI 0.17.1 / 桌面版 Electron 均具备 MCP 接入能力）**
**验证时间：** 2026-11-12 00:20–00:30（UTC+8）
**验证人：** 智谱（ZCode 主会话）

## 1. 实现物

- MCP Server：`phase0/zcode-mcp-poc/server.mjs`（Node ESM，官方 SDK `@modelcontextprotocol/sdk` 1.x，stdio 传输）
- 仅三个无破坏性工具（未开放文件读写/Shell/Git）：
  | 工具 | 作用 | 副作用 |
  |---|---|---|
  | `aieo_poc_ping` | 返回状态/版本/时间/PID | 无 |
  | `aieo_poc_get_test_task` | 返回固定模拟任务 T-POC-001 | 无 |
  | `aieo_poc_submit_result(task_id, result, summary)` | 校验 task_id 并落盘结果 | 追加写 `phase0/logs/mcp-submitted-results.json` |
- 所有工具调用自动追加 `phase0/logs/mcp-call-records.json`（AIEO 测试端可见），写失败不影响工具返回。

## 2. ZCode 配置步骤（可复现）

1. 编辑用户级配置 `C:\Users\youting\.zcode\cli\config.json`（此前不存在，新建）：
   ```json
   {
     "mcp": {
       "servers": {
         "aieo-poc": {
           "type": "stdio",
           "command": "node",
           "args": ["D:\\AIEO\\phase0\\zcode-mcp-poc\\server.mjs"]
         },
         "aieo-poc-broken": {
           "type": "stdio",
           "command": "cmd",
           "args": ["/c", "exit", "1"]
         }
       }
     }
   }
   ```
   说明：`aieo-poc-broken` 是**故意配置的坏服务器**（启动即退出），用于验证"断开/失败时能明确报错"。schema 严格：未知键会导致服务器被静默丢弃，必须用 `type/command/args` 规范字段与绝对路径。
2. 新建的 ZCode 会话启动时**自动连接**用户级 MCP（官方文档口径 + 本次实测）。

## 3. 验收结果（逐条对照文档 05 §3）

| # | 验收项 | 结果 | 证据 |
|---|---|---|---|
| 1 | ZCode 成功识别 MCP Server | ✅ | 外部会话日志 `mcp.configured_servers.connect.started`（traceId 7048f9ba） |
| 2 | 智谱能主动调用 ping | ✅ | 调用记录 PID 21952：`aieo_poc_ping` |
| 3 | 智谱能读取模拟任务 | ✅ | 调用记录 PID 21952：`aieo_poc_get_test_task` |
| 4 | 智谱能提交模拟结果 | ✅ | `REC-1794414270767-6851` 落盘，内容与会话自述一致 |
| 5 | AIEO 测试端能看到调用记录 | ✅ | `phase0/logs/mcp-call-records.json` 共 7 条，按 server_pid 可区分来源 |
| 6 | 断开 MCP 后能明确报错，不伪造成功 | ✅ | 坏服务器产生 `mcp.server.failed`（warn，ZCode 日志）；会话明确报告"aieo-poc-broken 未暴露可调用工具"，未伪造调用 |

## 4. 测试命令与输出摘要

```text
# 冒烟测试（标准 MCP stdio 客户端直连）
python -I phase0/zcode-mcp-poc/smoke_test.py
[PASS] initialize: serverInfo={'name': 'aieo-poc', 'version': '0.1.0'}
[PASS] tools/list: tools=['aieo_poc_ping', 'aieo_poc_get_test_task', 'aieo_poc_submit_result']
[PASS] call aieo_poc_ping / get_test_task / submit_result
[PASS] call submit(错误task_id) -> isError=True
SMOKE: ALL PASS

# 外部会话真实调用（经 ZCode CLI 启动的新会话，见 POC-02 报告）
# mcp-call-records.json 按 PID 分组：
PID 2976  （冒烟测试直连）        : ping, get_test_task, submit×2
PID 21952 （ZCode 会话内 server） : ping, get_test_task, submit
```

## 5. 证据文件清单

- `phase0/zcode-mcp-poc/server.mjs`、`smoke_test.py`、`package.json`
- `phase0/logs/mcp-call-records.json`（7 条调用记录）
- `phase0/logs/mcp-submitted-results.json`（2 条提交记录）
- `phase0/logs/mcp-broken-server-log-evidence.txt`（坏服务器 ZCode 日志证据）
- `phase0/logs/zcode-external-launch.stdout.json`（外部会话结构化返回）

## 6. 当前版本限制与说明

- MCP 配置修改后需**重启会话**才生效（新会话自动连接；已在运行的会话不会热加载）。
- ZCode 桌面端可在 Settings → MCP 查看连接状态；CLI 会话的状态通过 ZCode 日志（`~/.zcode/cli/log/`）观察。
- MCP 工具在 yolo 模式下由会话自动授权调用；更严格的权限模式下需逐次批准（本次未测）。
- schema 严格校验：配置里多余字段会导致 server 被静默丢弃（官方 diagnosing-mcp skill 明示），配置必须规范。
