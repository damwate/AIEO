# 任务书：Basic 可复制性缺口修复（G1-G4）

- 任务ID：b-20261115-replication-gaps-fix
- 日期：2026-11-15
- **版本选型：**
  - 选定版本：Basic
  - 任务等级：S1（文档类）
  - 选型理由：纯文档增补（部署边界/README），无代码；低风险
  - 批准人/日期：节点自主推进授权（WORKFLOW 增补②），来源=D1 验证报告后续建议①②

## 需求原文（用户原话，不加工）

见 `requirement.md`（2026-11-15 节点授权确认版）。

## 执行者理解（与原文分开，便于对账）

1. G1+G4→「新环境初始化清单」：环境自装（Node≥18/Git/Python3/Chrome/PowerShell）→clone（网络方案：直连或代理，check-push 工具化）→npm ci→chrome profile 初始化（带 9222 端口启动+人工登录 ChatGPT+ego-profile.json 配置指引）→check-env 两次对照确认。
2. G2→外部依赖清单：chatgpt-web-dispatch skill（github.com/Hulkhao/agent-kit 获取+deploy 方式）、monitor/（agent-kit）、ego-profile.json（本机配置不入 Git）。
3. G3→派单链 Windows 专属声明（session_lock PowerShell+Chrome 路径）。
4. 落位：部署边界条款增补于 basic/WORKFLOW.md（模块五区域，不动其他条款）；清单全文或放 toolkit/README.md（规划协商定）。
5. 边界：不动工具代码；WORKFLOW 增补走用户指令生效后增补③通道（非统计驱动）；检查器 37 项实测保持。

## 验收目标（可观察结果）

- 新环境初始化清单成文（按 D1 演练实测步骤，逐步可执行）；
- 外部依赖清单+Windows 限制声明落位 WORKFLOW 部署边界；
- 四命令 37/37 保持；经 ChatGPT 复审通过（节点授权）。

## 优先级：普通

## 任务状态（随进度更新）

| 字段 | 值 |
|---|---|
| 当前状态 | 待规划 |
| 当前步骤 | 规划协商（ChatGPT 复审+节点授权冻结） |
| 最终结果 | （任务完成前暂空） |

## 步骤清单（规划协商后冻结）

（待冻结）
