# Phase 0：技术验证与今晚开工任务

**版本：** v0.1  
**执行角色：** 智谱（ZCode）  
**管理角色：** GPT 项目经理 / GPT 架构师 / GPT 审查员  
**目标：** 验证关键技术路径，不开发完整 AIEO 平台。

## 1. 今晚的工作边界

今晚只做 Phase 0 技术验证和最小 Demo。

**禁止直接开始：**
- 完整 Vue 管理后台；
- 完整 FastAPI 业务系统；
- 全套数据库和复杂队列；
- 五个 GPT 角色的完整自动化工作流；
- 多电脑分布式调度；
- 自动合并主分支或生产发布。

今晚要先回答：网页 GPT 能否稳定收发消息？ZCode MCP 是否可用？AIEO 是否能从外部启动 ZCode 任务？Git 是否能自动采集？

## 2. 开始前必须盘点

请先输出环境盘点报告，不要假设以下信息已经具备：

- Windows 版本；
- Python 版本；
- Node.js 版本（如需）；
- Git 版本；
- Chrome 版本；
- ZCode 版本；
- ZCode MCP 配置入口和当前配置；
- 当前 ZCode 是否支持 MCP Server；
- 当前是否存在 CLI、Bot Channel 或受支持的外部任务启动方式；
- 目标 Git 仓库及本地路径；
- 当前项目工作区是否干净；
- 当前网络代理/VPN 对网页访问是否有影响。

敏感信息、Cookie、Token、API Key 不得写入报告或 Git。

## 3. POC-01：ZCode MCP 工具调用

### 目标

验证当前安装版本的 ZCode 是否能连接本地 AIEO MCP Server，并由智谱 Agent 主动调用工具。

### 最小实现

创建一个独立测试 MCP Server，只提供三个无破坏性工具：

- `aieo_poc_ping()`：返回服务状态和版本；
- `aieo_poc_get_test_task()`：返回固定的模拟任务；
- `aieo_poc_submit_result(task_id, result, summary)`：接收并保存模拟结果。

暂不开放任意文件读写、Shell 执行、Git 提交等高权限工具。

### 验收

1. ZCode 成功识别 MCP Server；
2. 智谱能主动调用 ping；
3. 智谱能读取模拟任务；
4. 智谱能提交模拟结果；
5. AIEO 测试端能看到调用记录；
6. 断开 MCP 后能明确报告错误，不伪造成功。

### 交付

- MCP Server 源码；
- ZCode 配置步骤；
- 调用日志；
- 截图；
- 验收结果；
- 当前版本限制。

## 4. POC-02：ZCode 外部任务启动能力

### 目标

验证 AIEO 外部进程是否可以通过受支持方式，让 ZCode 创建/启动一个新的指定开发任务。

分别调查并验证：

1. 官方 CLI 或受支持命令；
2. 官方 Bot Channel；
3. MCP 是否仅允许已运行 Agent 主动调用工具；
4. Windows GUI Automation 是否能可靠创建任务。

### 严格区分的能力

| 能力 | 说明 |
|---|---|
| Agent 调用 MCP | ZCode 中运行的 Agent 主动调用工具 |
| 外部触发新会话 | AIEO 从外部创建/启动 ZCode 新任务 |
| 外部读取会话状态 | AIEO 获取任务是否运行、结束或失败 |
| 外部取消任务 | AIEO 能否安全停止指定任务 |

不能用“Agent 能调用 MCP”推导出“外部程序能启动 Agent”。

### 验收

至少完成一次外部触发或明确证明当前版本不支持，并给出可靠替代方案。

如果不能外部启动，列出：
- 是否可以用 Bot Channel；
- 是否可以用 GUI 自动化；
- 哪种方式最稳定；
- 哪些步骤必须人工执行。

不要使用未公开私有接口、逆向协议或不稳定的内部数据库操作。

## 5. POC-03：GPT 浏览器收发消息

### 目标

使用 Playwright 控制独立 Chrome 配置目录，验证一个 GPT 会话的消息往返。通过后再扩展五个角色。

### 步骤

1. 启动独立 Chrome 用户数据目录；
2. 由用户手动登录 ChatGPT；
3. 手动打开一个测试 GPT 会话；
4. 保存该会话 URL 和角色 ID；
5. Playwright 定位会话；
6. 发送无敏感内容的测试消息；
7. 等待 GPT 回复真正结束；
8. 提取回复文本；
9. 保存消息时间、会话 URL、截图和提取结果；
10. 再发送第二条消息，验证上下文连续性。

### 验收

- 能定位正确会话；
- 能发送消息；
- 能读取完整回复；
- 不把旧回复误判为新回复；
- 能检测生成中状态；
- 登录失效或验证码出现时暂停；
- 失败后不会盲目重复发送。

### 注意

- 不绕过验证码或登录保护；
- 不使用逆向私有接口；
- 不把日常 Chrome 配置目录直接交给自动化程序；
- 不将浏览器 Cookie 或认证数据写入项目仓库；
- 一次只验证一个会话，稳定后再扩展五个角色。

## 6. POC-04：Git 自动采集

在专用测试仓库或明确授权的测试分支上验证：

1. 检查工作区状态；
2. 记录基线 Commit；
3. 创建 `feature/AIEO-POC-001` 分支；
4. 修改一个无业务风险的测试文件；
5. 执行一个简单测试；
6. 提交 Git；
7. 读取 Commit SHA；
8. 读取 Git Diff；
9. 检查工作区是否干净。

禁止在真实生产分支上做 POC。

## 7. POC-05：端到端最小演示

如果前面 POC 均可用，完成一次最小闭环：

```text
AIEO 测试脚本
   -> 向 GPT 测试会话发送任务
   -> 获取结构化任务/指令
   -> 通过已验证方式触发 ZCode
   -> 智谱完成一个无风险小任务
   -> Git 提交
   -> AIEO 读取 Commit 和 Diff
   -> 将 Diff 发送给 GPT 测试审查
   -> 保存审查报告
```

若外部触发 ZCode 不可用，不要伪造端到端成功。应将断点和人工步骤如实记录。

## 8. 今晚任务分解

| 编号 | 任务 | 优先级 | 依赖 |
|---|---|---|---|
| P0-001 | Windows/ZCode/Chrome/Git 环境盘点 | P0 | 无 |
| P0-002 | ZCode MCP 最小 Server | P0 | P0-001 |
| P0-003 | ZCode 外部任务启动能力调查与验证 | P0 | P0-001 |
| P0-004 | Playwright 单会话收发消息 | P0 | P0-001 |
| P0-005 | Git 自动采集 Demo | P1 | P0-001 |
| P0-006 | 端到端最小演示 | P1 | P0-002~005 |
| P0-007 | 技术风险和架构决策报告 | P0 | 前述任务 |

如果时间不足，优先完成 P0-001 至 P0-004，不要为了赶进度降低安全要求。

## 9. 智谱最终交付物

必须提交：

```text
phase0/
├── README.md
├── environment-inventory.md
├── zcode-mcp-poc/
├── zcode-trigger-poc/
├── gpt-browser-poc/
├── git-poc/
├── reports/
│   ├── mcp-validation.md
│   ├── zcode-trigger-validation.md
│   ├── gpt-browser-validation.md
│   ├── git-validation.md
│   └── phase0-final-report.md
├── screenshots/
└── logs/
```

报告必须说明：
- 实际测试环境；
- 实际执行步骤；
- 成功/失败；
- 证据文件；
- 未验证事项；
- 当前版本限制；
- 建议采用的最终技术路线；
- 是否允许进入 Phase 1。

不得提交任何 Cookie、密码、Token、API Key、浏览器用户数据目录或真实客户数据。

## 10. Git 交付

建议使用独立分支：

```text
feature/AIEO-PHASE0-POC
```

完成后提交：
- Commit SHA；
- 改动文件清单；
- 测试命令和结果；
- Phase 0 报告。

不要合并 main。等待 GPT 独立审查。

## 11. 完成判定

Phase 0 只有在以下条件满足时才算完成：

- 环境盘点完整；
- ZCode MCP 调用有实际证据；
- ZCode 外部任务启动能力有明确结论；
- GPT 浏览器消息往返有实际证据；
- Git 采集有实际证据；
- 端到端闭环成功，或明确记录无法闭环的技术边界；
- 所有代码和报告已提交 Git；
- 没有泄漏敏感信息。

最终结论只能是：
- `PASS_PHASE1`：可以进入 Phase 1；
- `PASS_WITH_CONSTRAINTS`：有明确限制，按替代架构进入 Phase 1；
- `BLOCKED`：关键路径不通，需要先解决阻塞。
