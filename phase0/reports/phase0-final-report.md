# AIEO Phase 0 技术验证最终报告

**日期：** 2026-11-12（凌晨完成）
**执行：** 智谱（ZCode，主会话）
**分支：** `feature/AIEO-PHASE0-POC`（不合并 main，等待 GPT 独立审查）
**最终结论：** **PASS_WITH_CONSTRAINTS** —— 五项关键路径全部实测可行，带明确约束进入 Phase 1。

---

## 1. 结论矩阵

| POC | 验证目标 | 结论 | 关键证据 |
|---|---|---|---|
| P0-001 | 环境盘点 | ✅ 完成 | environment-inventory.md（含用户纠正 Playwright 后的修订版） |
| POC-01 | ZCode MCP 工具调用 | ✅ **PASS**（6/6 验收） | mcp-validation.md；调用记录 7 条（冒烟 4 + 外部会话 3，按 PID 区分） |
| POC-02 | 外部启动 ZCode 任务 | ✅ **PASS_WITH_CONSTRAINTS** | zcode-trigger-validation.md；外部会话 sess_02b4fbba 结构化返回 |
| POC-03 | Playwright 控制 Chrome 网页 GPT 会话 | ✅ **PASS_WITH_CONSTRAINTS** | gpt-browser-validation.md；两条消息完整往返 + 上下文连续性 PASS |
| POC-04 | Git 自动采集 | ✅ **PASS**（9/9 步） | git-validation.md；git-poc-result.json |
| POC-05 | 端到端最小闭环 | ✅ **PASS** | 本章 §4；e2e-evidence.json（6 步全过） |

## 2. 实际测试环境（盘点要点）

- Windows 10.0.26300.9974 / Node v24.14.0 / Python 3.12.10 / Git 2.47.1
- Chrome 157.0.8103.39（系统安装，含 chromedriver）
- ZCode 桌面版 + **官方 CLI 0.17.1**（`resources\glm\zcode.cjs`，支持 `--prompt/--cwd/--mode/--json/--resume`）
- 网络：直连 chatgpt.com **不通**，必须经系统代理 `127.0.0.1:10391`（Chrome 自动继承，自动化需注意）；智谱 API 直连正常
- 详细：`phase0/environment-inventory.md`（含一次用户纠正记录：本地已装 playwright 1.63）

## 3. 已验证的技术路径（Phase 1 按此实施）

### 3.1 GPT 网页控制（POC-03）
```text
普通方式启动系统 Chrome（专用 profile + 127.0.0.1:9222 调试端口）
  → 用户人工登录（邮箱方式，一次）
  → Playwright connectOverCDP 接管
  → 结构化 DOM 契约收发消息（发送双验 / 停止按钮生成态 / 75s 确认窗 / DIL UUID 身份）
```
实测 DOM 契约与 ego 手册（2026-11-08）一致；五角色扩展沿用同一控制器，每会话绑定 URL+agent_id，同一会话同一时刻仅一个在途任务。

### 3.2 ZCode 接入（POC-01/02）
```text
AIEO MCP Server（stdio，受控工具集）→ ~/.zcode/cli/config.json mcp.servers
  → 新 ZCode 会话自动连接 → Agent 主动调用工具（任务领取/进度上报/结果提交）
外部触发：zcode --prompt "<任务包>" --cwd <项目> --mode <按风险> --json
  → 结构化返回 sessionId/traceId/response/usage
```
- Agent 主动回调通道已具备（submit_result 即最小形态）；
- 外部启动为官方 CLI，非逆向协议。

### 3.3 Git 采集（POC-04）
`git_collect.py` 演示了状态检查/基线/分支/提交/SHA/Diff/干净检查全链，9/9 PASS，可封装为 AIEO Git Worker。

## 4. 端到端闭环实录（POC-05，总耗时约 3.5 分钟）

| 步骤 | 实测结果 |
|---|---|
| 1. AIEO 脚本向 GPT 会话派规划任务 | 发送双验通过 |
| 2. GPT-01 返回结构化任务 | JSON 有效：T-E2E-001，instruction+acceptance |
| 3. 官方 CLI 外部触发 ZCode 新会话 | sess_72a9ef82；产出 src/e2e_add.js + test_e2e_add.js；自测 TEST PASS |
| 4. AIEO Git 采集 | 分支 feature/AIEO-E2E-001；基线 607e6a6 → 提交 **00744f75387802606f5a213d4d66b83dfed0bebf**；工作区干净；Diff 24 行 |
| 5. 将 Diff 发回 GPT 审查 | 发送双验通过 |
| 6. GPT-03 返回审查 JSON | `{"result":"PASS","findings":[],"summary":"代码符合 T-E2E-001..."}` |
| 7. 证据落盘 | logs/e2e-evidence.json + 4 张截图 + 全程日志 |

主会话独立复核：文件真实存在、`node test_e2e_add.js` 复跑 PASS、git log 与证据一致。

## 5. 技术限制与约束（必须写入 Phase 1 设计）

1. **GPT 登录必须人工一次**：Google OAuth 在自动化控制的 Chrome 中被 Google 直接拒绝；auth.openai.com Turnstile 对 Playwright 直启的浏览器人工也过不去。→ 用邮箱+密码登录专用 profile；登录失效→暂停转人工（AIEO 需有 OFFLINE/人工接管状态）。
2. **自动化必须用 CDP 接管模式**：普通启动 Chrome + `connectOverCDP`（官方接口）。不用任何隐身/绕过手段（项目红线）。
3. **ChatGPT 网页依赖系统代理**：直连不通；AIEO 部署机必须保持代理在线，浏览器自动化继承/显式配置代理。
4. **外部取消 ZCode 任务无受支持接口**：CLI 无 cancel 命令。→ 超时 + 软取消（取消标记文件）+ 进程树终止兜底。
5. **会话级实时状态订阅缺失**：`--json` 为结束后返回。→ 运行中状态靠 Agent 经 MCP 主动上报。
6. **Bot Channel 当前版本不存在**；GUI Automation 兜底无需启用。
7. **MCP 配置改动需重启会话**生效；配置 schema 严格（多余字段静默丢弃）。
8. **ChatGPT 页面是运行时 UI 契约不是 API**：DOM 改版会使控制器失效，AIEO 需内置契约自检（unit 锚点计数、composer 探测）与结构化失败上报，禁止盲发。
9. ZCode 桌面端 MCP 状态页（Settings → MCP）与 CLI 会话状态可交叉核对；坏服务器会产生 `mcp.server.failed` 日志（已实测）。

## 6. 风险与建议（P0-007）

| 风险 | 等级 | 缓解 |
|---|---|---|
| ChatGPT 风控升级导致会话封禁/验证频繁 | 中 | 单会话单任务低频派发；错误路径暂停转人工；不绕过 |
| 代理中断导致 GPT 不可达 | 中 | 部署机网络健康检查（chatgpt.com 探活）前置 |
| DOM 改版 | 中 | 契约自检 + 手册式锚点更新流程（参照 ego 手册维护模式） |
| 大 payload 网页传输失真 | 低 | 按 ego 手册 §3.2：材料走 Git 仓库指针，网页只发短消息 |
| ZCode CLI 版本升级行为变化 | 低 | CLI 命令前先 `--version` 探测；锁定版本验收 |

## 7. 未验证事项（如实声明）

- Playwright `--resume`/`-c` 会话续跑未实测；
- 五个 GPT 角色并行会话未实测（本次仅单会话，符合文档"一次只验证一个会话"）；
- ZCode 桌面端 Settings → MCP 的 UI 状态页未截图核验（CLI 路径证据已充分）；
- 长回复（>4KB）网页传输、附件通道未测（Phase 1 按 Git 指针方案规避）；
- 锁屏/注销下的 Worker 稳定性未测（文档 01 §7 列为 Phase 1 稳定性测试项）。

## 8. 交付物清单

```text
phase0/
├── README.md / environment-inventory.md
├── zcode-mcp-poc/   server.mjs + smoke_test.py + package.json（6/6 冒烟）
├── gpt-browser-poc/ gpt_roundtrip.mjs（--setup/--run）
├── e2e-poc/         e2e_orchestrate.mjs（端到端编排）+ greet 产物（外部会话产出）
├── git-poc/         git_collect.py（9/9）
├── reports/         mcp / zcode-trigger / gpt-browser / git / 本报告
├── screenshots/     poc3-*（10 张）、e2e-*（4 张）
└── logs/            mcp-call-records.json、gpt-poc-roundtrip-result.json、
                     e2e-evidence.json、zcode-external-launch.stdout.json 等真实证据
```

敏感信息检查：无 Cookie/Token/API Key/浏览器 profile 入库；`.gitignore` 已覆盖 runtime/、chrome_profiles/。

## 9. 进入 Phase 1 的建议

按 `06-MVP实施计划与验收标准.md` 推进，优先级：
1. Phase 1 平台基座（任务状态机 + 消息 Inbox/Outbox，SQLite）；
2. GPT Browser Controller 按 §3.1 架构实现（CDP 接管 + 契约自检 + 人工接管状态）；
3. ZCode Bridge 按 §3.2 架构实现（MCP 受控工具集 + CLI 外部触发 + 软取消协议）；
4. Git Worker 封装 git_collect 能力并加证据校验（分支/基线/Diff 范围）。

**等待 GPT 独立审查后再进入下一阶段。**
