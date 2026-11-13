# T-P1-902 四模块集成验收 E2E（tests/integration/）

独立集成验收套件：M1 平台基座 / M2 GPT 控制器 / M3 ZCode Bridge / M4 Git Worker
四模块在**真实进程 + 真实 HTTP + 真实 Git** 下的跨模块契约测试与端到端验收。
依据 agent-contract §7、review-protocol §7 与 docs/立项/06 §2 验收七条。

## 运行

```bash
# 前置：python httpx 可用（M1 venv 同源）；node ≥ 18；git 可用
python tests/integration/e2e_four_modules.py
# 退出码 0 = 十一步全过；证据落盘 phase1/logs/integration-<UTC 时间戳>/
```

单一入口 `e2e_four_modules.py` 顺序执行十一步（每步独立 ok 判定，失败即停并落证据）：

| 步骤 | 内容 | 验收条目（06 §2） |
| --- | --- | --- |
| 01 | 启动真实 M1 uvicorn 子进程（临时 DB/日志/工件，空闲端口）+ OWNER 登录 + agents/项目/仓库/批次 + 父子任务 | ①② |
| 02 | 依赖门禁负例：父未 ACCEPTED 时子任务 PASS→READY 被拒（409 TASK-0002）、claim 被拒（409 TASK-0001）、READY 上 PASS 非法转换（409 TASK-0001） | ②③ |
| 03 | M3 leg（上）：真实 MCP stdio server 子进程（http 模式 + 服务令牌）claim_task（base_commit 必填）→ 重复 claim 409 TASK-0003 → START → report_progress（显式 project_id/batch_id） | ③④ |
| 04 | M4 leg：真实 GitWorker + 真实 git commit（scratch 仓库）→ GIT-0002 非祖先负例 → DIFF 工件/git_commit 登记 REGISTERED → 工件/commit 幂等 → 哈希不匹配 422 ART-0002 负例 | ③⑦ |
| 05 | M3 leg（下）：submit_result（真实 commit_sha）→ DEV_REPORTED → 重复提交幂等（duplicate=true，不投第二条消息） | ③④ |
| 06 | GIT_VALIDATE→PASS→review report PASS→TEST_ACCEPTANCE→test report PASS+EXECUTED_PASS → **ACCEPTED**（同执行同事务证据门） | ③ |
| 07 | M2 leg：headless 全管线（13 步 runDispatch，本地 DOM fixture）→ 本地登记簿产物桥接登记真实 M1 → 工件回读逐字节比对 | ①⑦ |
| 08 | 依赖解除：父 ACCEPTED 后子任务 PASS→READY→claim 成功 → BLOCKED 报告收尾；board 只计 ACCEPTED（completion=2/3≈66.67%） | ②⑥ |
| 09 | 消息幂等：同 message_id 不同内容 409 RES-0003 且不落第二条 → ACK 幂等 → dead-letter 严格只读（查询前后 PENDING 状态不变）→ sweep PENDING→SENT（人类专属）→ 服务身份 sweep/requeue/projects 403 | ④ |
| 10 | **真实进程重启**：terminate uvicorn → 同 DB 重启 → 任务/commit/报告/消息/board 全部逐键比对一致；服务令牌跨重启有效 | ⑤ |
| 11 | /audit 断言：12 类关键动作齐全（project/batch/task_created、task_transition、claim_task、artifact/git_commit/report_registered、message_registered/ack、service_credential_issued、login_success）+ 四个 actor | ⑦ |

## 模块参与方式（如实申报，DEC-017 边界内）

- **M3**：真实 MCP stdio 子进程（`app/zcode_bridge/bin/aieo-zcode-mcp.mjs`），`HttpM1Client` 默认 http 模式直连真实 M1。
- **M4**：真实 `GitWorker`（真实 git init/commit/branch）；M1 对接经 `m1_rest_client_for_m4.py`（M4 `M1Client` Protocol 的 REST 实现——Protocol 契约规定实现归属 M1 或测试，此处属测试夹具，不改 M4 模块代码）。M4 本地 `record_audit` 落 NDJSON 并如实标注 `AUDIT_LOCAL_ONLY`（M1 无 POST /audit 端点，服务端审计由操作自带）。
- **M2**：headless 全管线（`runDispatch` 13 步：双验发送/生成/确认窗/双稳定读/DEC-017 门禁/Schema 绑定/本地登记），fixture DOM 复用模块测试夹具；不连 chatgpt.com。M2 产物由编排侧桥接登记到真实 M1（`m2_leg.mjs` 输出摘要 → POST /artifacts + GET 回读）。M2 不直连 M1 HTTP 属申报边界（`MINIMAL_LOCAL_M1_NOT_FULL_PLATFORM`）。
- **M1**：真实 uvicorn 子进程（非 TestClient），含真实进程重启 leg。

## 集成期模块修复（T-P1-902 发现的跨模块缝隙，非套件内部问题）

1. **M3 `claim_task` 缺 `base_commit`**：M1 `ClaimRequest.base_commit` 必填（schemas.py），M3 未透传 → 真实 M1 下 422。修复：`mcp_server.mjs`（requireArgs + 透传）、`m1_client.mjs`（请求体）+ 3 个测试文件。
2. **M3 `report_progress` 上下文参数被 SDK 剥离**：`project_id`/`batch_id` 未在 zod inputSchema 声明（未声明参数被 MCP SDK 剥离），而 M1 claim 响应的任务视图不含 project_id（tasks 表无该列）→ 真实 M1 下必然 REQ-0001。修复：inputSchema 补两个可选参数（`mcp_stdio_smoke.test.mjs` ①-5b 回归）。
3. **M3 `changed_files: []` 校验自相矛盾**：校验器拒绝空数组但报错文案声称"允许为 []"；BLOCKED 报告本无实现变更。修复：允许 `[]`（`report_schema.mjs`，`submit_result_schema.test.mjs` ③-9 回归）。
4. **M1 服务白名单缺 `POST /api/v1/messages`**：03-协议 §3 要求服务 agent 投递 TASK_ACCEPTED/PROGRESS_UPDATED/DEVELOPMENT_COMPLETED，白名单缺它则消息流全断。修复：`security.py` 白名单补投递端点（管理操作 sweep/requeue/cancel 仍人类专属，`test_service_authorization.py` 补正例）。
5. **M4 DIFF 工件登记绝对路径**：M1 `validate_artifact_path` 要求仓库相对 POSIX 路径，M4 登记本地 diff_dir 绝对 Windows 路径 → 真实 M1 拒收。修复：登记确定性身份路径 `git-worker/diffs/<task_id>/diff-<sha>.patch`（本地 diff_dir 物理留证不变；M4 测试断言同步 + 路径格式锁定）。

## 证据布局（每次运行一个目录）

```
phase1/logs/integration-<UTC>/
├── e2e-evidence.json      # 十一步逐步结果 + details（三 ID、commit SHA、审计动作清单等）
├── e2e-run.log            # NDJSON 式运行日志
├── m1-server/             # M1 uvicorn 两次运行 stdout/stderr（run1 / run2 重启）
├── m3-mcp-ndjson/         # M3 MCP server C4 NDJSON（工具调用审计）
├── m2-leg/                # M2 headless 产物：request/reply/raw-units/result.json + 本地登记簿
├── m2-artifacts/          # M2 产物桥接登记前留存
├── m4-logs/ m4-diffs/     # M4 git worker NDJSON 日志与 DIFF patch
├── m4-audit-local.ndjson  # M4 本地审计（AUDIT_LOCAL_ONLY 标注）
├── scratch-repos.json     # scratch 仓库基线 SHA/分支
└── work-dir-archive.json  # work_dir 归档清单
```

## 文件说明

- `e2e_four_modules.py` — 主编排（十一步 + 逐步证据 + 退出码）。
- `mcp_stdio_client.py` — MCP stdio 行分隔 JSON-RPC 客户端（Python；语义对照 M3 测试夹具 StdioMcpClient）。
- `m1_rest_client_for_m4.py` — M4 `M1Client` Protocol 的 REST 实现（httpx；register_commit/register_artifact 对接真实 M1，record_audit 落本地 NDJSON）。
- `m2_leg.mjs` — M2 headless leg（复用模块测试夹具；stdout 最后一行输出摘要 JSON 供编排侧消费）。
