# POC-02 验证报告：ZCode 外部任务启动能力

**结论：PASS_WITH_CONSTRAINTS（官方 CLI `--prompt` 可从外部可靠启动新开发任务；外部取消与细粒度状态订阅能力有限，见 §5）**
**验证时间：** 2026-11-12 00:22–00:27（UTC+8）
**验证人：** 智谱（ZCode 主会话，AIEO 模拟外部调度方）

## 1. 四项能力严格区分实测（对照文档 05 §4）

| 能力 | 结果 | 实测方式与证据 |
|---|---|---|
| Agent 调用 MCP | ✅ 已验证 | 见 mcp-validation.md（外部会话内 Agent 主动调用 3 个工具） |
| 外部触发新会话 | ✅ **已验证** | 官方 CLI `zcode --prompt <任务> --cwd D:\AIEO --json`，从本主会话（模拟 AIEO 外部进程）启动，返回新会话 `sess_02b4fbba-90d3-4917-860f-e3d9a03cb640` |
| 外部读取会话状态 | ⚠️ 基础可用 | `--json` 返回结构化结果：`projection.status="idle"`、`turnCount`、`usage`（token/请求数）、最终 `response` 文本。运行中实时状态订阅未见公开 CLI 参数，见 §5 |
| 外部取消任务 | ❌ 未发现受支持方式 | CLI 帮助与子命令中无会话级 cancel 命令（`/dwf cancel` 仅针对 dynamic workflow）。替代：进程级终止（taskkill CLI 进程树），但属于进程管理而非受支持的"安全停止指定任务"接口 |

## 2. 实际执行步骤（可复现）

```bash
node "D:\Program Files\ZCode\resources\glm\zcode.cjs" \
  --prompt "<自包含任务指令：调 MCP ping → 读取 T-POC-001 → 实现 greet.js+test_greet.js → 运行测试 → MCP 提交结果>" \
  --cwd "D:\AIEO" \
  --json \
  > stdout.json 2> stderr.log
```

- 未打开 TUI，进程跑完自动退出（exit 0，耗时约 2 分 20 秒）；
- 权限模式默认 `--mode yolo`（help 明示 `--prompt` 默认 yolo），适合无人值守，AIEO 生产化时建议按风险选择 `build`/`edit`/`guarded`。

## 3. 外部返回（stdout.json 摘录，完整文件见日志目录）

```json
{
  "sessionId": "sess_02b4fbba-90d3-4917-860f-e3d9a03cb640",
  "traceId": "7048f9ba-a9ae-4470-9838-aa6553944d28",
  "turnId": "turn_6e445122-2524-4705-b6d0-077478f9ca31",
  "response": "- 任务实现：已创建 phase0/e2e-poc/src/greet.js 和 test_greet.js ...测试 PASS ... T-POC-001 已以 SUCCESS 提交，记录 ID 为 REC-1794414270767-6851 ... aieo-poc 可用；aieo-poc-broken 未暴露可调用工具 ...",
  "usage": { "modelRequestCount": 8, "inputTokens": 144413, "outputTokens": 2072 },
  "projection": { "status": "idle", "turnCount": 1 }
}
```

## 4. 独立核验（不信会话自述）

| 核验项 | 结果 |
|---|---|
| `phase0/e2e-poc/src/greet.js` / `test_greet.js` 真实存在 | ✅（目录列表时间戳 00:24） |
| 主会话独立复跑 `node test_greet.js` | ✅ PASS，exit 0 |
| MCP 提交记录 `REC-1794414270767-6851` 落盘 | ✅（mcp-submitted-results.json） |
| MCP 调用来自新会话独立 server 进程 | ✅（PID 21952 ≠ 冒烟测试 PID 2976） |
| 未执行 git 命令、未越出 files_scope | ✅（git status 干净，仅新增指定文件） |

## 5. 当前版本限制与替代方案

1. **外部取消任务**：未发现受支持命令。替代方案：
   - AIEO 层面给任务设超时 + `taskkill /T` 终止 CLI 进程树（可靠但粗暴，不保存会话现场）；
   - 或在任务提示词中要求 Agent 周期性检查"取消标记文件"（软取消，需要任务包协议配合）；
   - 建议 AIEO 生产实现中采用"超时 + 软取消优先 + 进程终止兜底"。
2. **运行中实时状态**：`--json` 为运行结束后的最终结构化输出；运行中的进度需靠 Agent 主动通过 MCP 上报（今晚已具备：submit_result 工具即该通道的最小形态）。
3. **会话恢复**：CLI 支持 `--resume <sessionId>` 与 `-c`，可用于追加指令/续跑（本次未实测，列为待验证）。
4. **Bot Channel**：CLI 命令清单中不存在，当前版本不可用。
5. **GUI Automation 兜底**：因官方 CLI 已可外部启动，无需 pywinauto 兜底（文档 01 §4.4 首选顺序的 1、2 已满足）。

## 6. 证据文件清单

- `phase0/logs/zcode-external-launch.stdout.json`（外部启动结构化返回）
- `phase0/logs/zcode-external-launch.stderr.log`（空，无错误）
- `phase0/logs/mcp-call-records.json`（PID 21952 三条 = 新会话真实调用）
- `phase0/e2e-poc/`（新会话产出的代码与测试文件）
- 第一次启动因后台 shell 相对路径重定向失败（node 未执行），改绝对路径后成功——记录在案，非产品缺陷。
