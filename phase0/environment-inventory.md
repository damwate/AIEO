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

## 3. Playwright 现状

| 项目 | 实际值 |
|---|---|
| npm 全局 playwright | 未安装 |
| Python playwright | 未安装 |
| 浏览器缓存 | `~/AppData/Local/ms-playwright/` 已有 `chromium-1243`、`chromium_headless_shell-1243`、`ffmpeg-1011`（说明本机曾安装过某版本的 Playwright 浏览器） |

结论：POC-03 需在项目内 `npm install playwright`（或 python -m pip install playwright），并可复用 `launchPersistentContext` + 本机 Chrome。

## 4. 网络与代理（对 ChatGPT 访问至关重要）

| 项目 | 实际值 | 实测证据 |
|---|---|---|
| WinHTTP 代理 | 直接访问（无代理） | `netsh winhttp show proxy` |
| 用户级系统代理 | **启用**：`http=127.0.0.1:10391;https=127.0.0.1:10391;socks=127.0.0.1:10391` | 注册表 `HKCU\...\Internet Settings`，ProxyEnable=1 |
| 代理端口监听 | 127.0.0.1:10391 正在监听（PID 3164） | `netstat -ano` |
| 直连 chatgpt.com | **超时不可达**（curl 000，15s） | `curl -I https://chatgpt.com` |
| 经代理 chatgpt.com | **HTTP 200**（约 2.3s） | `curl -I -x http://127.0.0.1:10391 https://chatgpt.com` |
| open.bigmodel.cn | 200（智谱 API 可达，ZCode 正常工作） | `curl -I` |

**影响与对策：**
- Chrome 默认走系统代理 → 用户手工登录 ChatGPT 无障碍；
- **Playwright 启动浏览器时必须显式带代理参数**（`--proxy-server=http://127.0.0.1:10391` 或 Playwright `proxy` 选项），否则无法访问 ChatGPT；
- ZCode CLI/智谱 API 不需要该代理。

## 5. Git 仓库现状

| 项目 | 实际值 |
|---|---|
| 仓库路径 | `D:\AIEO`（本次初始化，默认分支 main） |
| 初始化前状态 | 非Git仓库，仅含 `docs/立项/` 7份设计文档 |
| 工作区状态 | 干净（本次盘点后 `git status` 确认） |
| 提交身份 | mingong@aliyun.com（用户全局 Git 配置） |
| POC 分支 | `feature/AIEO-PHASE0-POC`（本次创建，不合并 main，等待 GPT 独立审查） |

## 6. 盘点结论（对照文档 05 §2 检查单）

- ✅ Windows/Python/Node/Git/Chrome/ZCode 版本均已实测确认；
- ✅ ZCode **支持 MCP**（配置入口明确，`/mcp` 命令存在），当前无任何已配置 Server；
- ✅ ZCode **存在官方受支持的外部任务启动方式候选**：CLI `--prompt`（POC-02 重点验证）、`app-server`；
- ⚠️ ChatGPT 网页必须经本地代理 10391 访问，自动化脚本必须显式配置代理；
- ⚠️ Playwright 库本身未安装，需在 `phase0/gpt-browser-poc` 内安装；
- ✅ Git 仓库干净，POC 全部在 `feature/AIEO-PHASE0-POC` 分支进行。
