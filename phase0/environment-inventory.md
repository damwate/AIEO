# AIEO Phase 0 环境盘点报告

**盘点时间：** 2026-11-12（今晚开工前）
**盘点人：** ZCode / 智谱（P0-001）
**说明：** 本报告全部来自实际命令查询，无假设值。敏感信息（Cookie/Token/API Key）未写入。

## 1. 操作系统与基础软件

| 项目 | 实际值 | 查询方式 |
|---|---|---|
| Windows 版本 | 10.0.26300.9974（x64） | `cmd /c ver` |
| Python | 3.12.10（主用，`C:\Users\youting\AppData\Local\Programs\Python\Python312\python.exe`）；另有 3.14.6 | `python --version` |
| Node.js | v24.14.0（`C:\Program Files\nodejs\node.exe`） | `node --version` |
| npm | 11.9.0 | `npm --version` |
| Git | 2.47.1.windows.1（`D:\Program Files\Git\cmd\git.exe`） | `git --version` |
| Chrome | 157.0.8103.39，路径 `C:\Program Files\Google\Chrome\Application\chrome.exe` | 注册表 BLBeacon + 文件系统 |
| chromedriver | 已随 Chrome 附带 `C:\Program Files\Google\Chrome\Application\chromedriver-win64` | 文件系统 |

## 2. ZCode 现状

| 项目 | 实际值 |
|---|---|
| ZCode 桌面版 | Electron 应用，安装于 `D:\Program Files\ZCode\ZCode.exe` |
| ZCode CLI | **存在官方 CLI**：`node "D:\Program Files\ZCode\resources\glm\zcode.cjs"`，版本 **0.17.1**（`zcode doctor` 实测） |
| CLI 登录态 | 已登录（当前会话即由该 CLI 驱动运行） |
| MCP 配置入口（用户级） | `~/.zcode/cli/config.json` → `mcp.servers`（当前不存在该文件，需新建） |
| MCP 配置入口（工作区级） | `<repo>/.zcode/config.json` → `mcp.servers`（当前不存在，需新建） |
| 当前 MCP 配置 | **空**：用户级和工作区级均无任何 MCP Server 配置 |
| 外部任务启动方式 | CLI 官方支持 `--prompt <text>`（无界面运行单条提示）、`--cwd`、`--mode <build|edit|plan|yolo|guarded>`、`--json`、`--resume <sess_...>`、`-c`（继续最近会话）、`--target`、`app-server`（stdio 协议服务器） |
| Bot Channel | CLI 帮助与命令列表中**未见** Bot Channel 命令 |

## 3. Playwright 现状（2026-11-12 二次修订：补查本地项目安装）

| 项目 | 实际值 |
|---|---|
| npm 全局 playwright | 未安装（全局仅 @anthropic-ai、cc-connect、cline、openclaw） |
| Python playwright | 未安装 |
| **本地项目安装（初次盘点遗漏，已补查）** | `D:\Garden-Design-Calculator\src\frontend`：playwright 1.63.0 + @playwright/test 1.63.0（声明 ^1.55.0），含 playwright.config.ts；VSCode 扩展 vscjava.migrate-java-to-azure 内置 playwright 1.57.0 |
| 浏览器缓存 | `~/AppData/Local/ms-playwright/` 有 chromium-1243、chromium_headless_shell-1243、ffmpeg-1011（2026-10-12 安装，与 Garden 项目 1.63 匹配） |
| AIEO POC 使用 | `phase0/gpt-browser-poc` 内独立安装 **playwright 1.65.0**（npm 源直连可达） |

**说明：** 初次盘点仅检查了 npm 全局与 Python 包，遗漏本地项目安装，用户纠正后补查更正。AIEO POC-03 按设计文档要求使用 `executablePath` 驱动**系统 Chrome 157**（独立用户数据目录），不依赖 playwright 自带 chromium，故 1243/1254 build 差异无影响，无需下载浏览器。

## 4. 网络与代理（对 ChatGPT 访问至关重要）

| 项目 | 实际值 | 实测证据 |
|---|---|---|
| WinHTTP 代理 | 直接访问（无代理） | `netsh winhttp show proxy` |
| 用户级系统代理 | **启用**：晨间=10391，**13:45 复测=2482**（`http=127.0.0.1:2482;https=127.0.0.1:2482;socks=127.0.0.1:2482`）——**端口会随代理工具重启而变，勿写死** | 注册表 `HKCU\...\Internet Settings`，ProxyEnable=1；查询命令 `powershell -NoProfile -Command "Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings' | Select ProxyServer,ProxyEnable"` |
| 代理端口监听 | 晨间 10391（PID 3164）→ 午后 2482 监听中（0.0.0.0，PID 8280）；10391/6822 午后均无监听 | `netstat -ano -p TCP | grep ":2482 "` |
| 直连 chatgpt.com | **超时不可达**（curl 000，15s） | `curl -I https://chatgpt.com` |
| 经代理 chatgpt.com | **HTTP 200**（晨间经 10391 约 2.3s；13:49 经 2482 实测 github.com 0.6s） | `curl -I -x http://127.0.0.1:2482 https://github.com` |
| open.bigmodel.cn | 200（智谱 API 可达，ZCode 正常工作） | `curl -I` |
| **找活代理端口的固定方法（2026-11-14 定稿）** | ①注册表 ProxyServer（浏览器同款，最可靠）→ ②`netstat` 确认监听 → ③`curl -x` 实测 200；端口永远动态获取，不写死 | 本表 + `toolkit/check-push.mjs --ports <端口>` |

**影响与对策：**
- Chrome 默认走系统代理 → 用户手工登录 ChatGPT 无障碍；
- **Playwright 启动浏览器时必须显式带代理参数**（`--proxy-server=http://127.0.0.1:10391` 或 Playwright `proxy` 选项），否则无法访问 ChatGPT；
- ZCode CLI/智谱 API 不需要该代理。

## 5. Git 仓库现状（2026-11-14 补记：Git 推送代理实测）

| 项目 | 实际值 |
|---|---|
| 仓库路径 | `D:\AIEO`（本次初始化，默认分支 main） |
| 初始化前状态 | 非Git仓库，仅含 `docs/立项/` 7份设计文档 |
| 工作区状态 | 干净（本次盘点后 `git status` 确认） |
| 提交身份 | mingong@aliyun.com（用户全局 Git 配置） |
| POC 分支 | `feature/AIEO-PHASE0-POC`（本次创建，不合并 main，等待 GPT 独立审查） |
| **Git 推送代理（本仓库，2026-11-14 补查）** | `.git/config` 两条：`http.proxy=http://127.0.0.1:6822` 与 `http.https://github.com.proxy=http://127.0.0.1:6822`（URL 级条目优先于通用项，`git -c http.proxy=` 覆盖不了它）；查询方式 `git config --show-origin --list` |
| **6822 端口实况（2026-11-14 二次修正）** | **常无监听**——配置指向的代理进程多数时间未运行，属"配置存在但服务不在"，报错 `Failed to connect to 127.0.0.1 port 6822` 即此因 |
| **GitHub 直连连通性（2026-11-14 实测，随时间变化）** | **时好时坏**：上午直连 Connection was reset，午间直连 HTTP 200。不要把"直连不可达"当永久结论，每次先试 |
| **推送决策路径（2026-11-14 定稿，已固化为工具）** | **`node toolkit/check-push.mjs`（诊断）→ `--push --yes --ports <端口>`（真实推送）**：自动执行 ①绕仓库代理直连 dry-run → ②失败探测候选端口（配置解析+AIEO_CHECK_PORTS+--ports，如系统代理 2482）→ ③都不通按 L-014 精确报告并继续其他工作；不改写 .git/config、执行前确认。手动等价：`git -c http.https://github.com.proxy=http://127.0.0.1:<活端口> -c http.proxy=http://127.0.0.1:<活端口> push` | 13:52 实战：直连 reset→6822 死→2482 活→推送成功 62d1187 |

**补记说明（2026-11-14，二次修正）：** 6822 是 `.git/config` 里的历史配置端口，与系统代理 10391 均不保证在监听；**直连连通性随时间变化**，推送以"先直连、再查活代理、最后报告"为固定决策路径。连接类故障的行为纪律见 `docs/AI-DEV-LESSONS.md` **L-014**。

## 6. 盘点结论（对照文档 05 §2 检查单）

- ✅ Windows/Python/Node/Git/Chrome/ZCode 版本均已实测确认；
- ✅ ZCode **支持 MCP**（配置入口明确，`/mcp` 命令存在），当前无任何已配置 Server；
- ✅ ZCode **存在官方受支持的外部任务启动方式候选**：CLI `--prompt`（POC-02 重点验证）、`app-server`；
- ⚠️ ChatGPT 网页必须经本地代理 10391 访问，自动化脚本必须显式配置代理；
- ⚠️ Playwright 库本身未安装，需在 `phase0/gpt-browser-poc` 内安装；
- ✅ Git 仓库干净，POC 全部在 `feature/AIEO-PHASE0-POC` 分支进行。
- ⚠️ **Git 推送 GitHub（2026-11-14 二次修正）**：`.git/config` 的 6822 代理常无监听，直连连通性随时间变化——推送按固定决策路径执行（先绕代理直连→再查 10391/6822 活端口→都不通按 L-014 报告并继续其他工作），禁止反复重试或停工。
