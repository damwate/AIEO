# Basic 新环境初始化清单（SETUP-CHECKLIST）

> **依据：** b-20261115-basic-replication-verify D1 实战演练（本机模拟验证通过，reply sha256=a8bd85a2…）+ 规划 R1 裁定（reply sha256=068a3bf6…46ac，五项修改采纳）。**适用对象：** 全新电脑/干净目录从零搭建 Basic 工作环境。
> **边界：** 本清单为初始化指引；派单链当前仅 Windows 实测（见 WORKFLOW 部署边界）；跨电脑实测（G5）仍为待验证项。

## 1. 基础环境自装（主机级，一次性）

| 组件 | 版本要求 | 用途 |
|---|---|---|
| Git | ≥2.40 实测 2.47.1 | 版本管理（提交身份需配置 user.name/user.email） |
| Node.js | **≥20.18.1**（规划 R1 上调；实测 24.14.0） | 派单工具链/playwright/kit 工具 |
| Python | ≥3.12 实测 3.12（须 `-I` 隔离模式运行检查器） | check_taskpack/一致性检查器 |
| Chrome | 最新稳定版 | 派单浏览器（CDP 9222） |
| PowerShell | Windows 内置 5.1+ | session_lock.mjs 依赖（**派单链 Windows 专属限制**，Linux/Mac 未实测） |

## 2. 仓库获取与网络

- `git clone https://github.com/damwate/AIEO.git`（公开仓库；**直连时好时坏**——失败时经系统代理端口 clone，活端口发现用 `node toolkit/check-push.mjs` 诊断模式，L-014 第 6 条）。
- **clone 与 check-push 网络能力区分（规划 R1）**：clone 是一次性获取（可手动代理）；check-push 是日常推送（自动发现活端口，只读不改配置）。两者都用系统代理但工具化程度不同，勿混用配置方式。
- 核对：`git log -1`（HEAD 与 GitHub 一致）+ `git fsck --no-progress`（干净=无输出）+ `git status`（净）。

## 3. 依赖安装

- `npm --prefix phase0/tools ci`（恢复 playwright/ajv/undici；node_modules 不随 Git 复制是设计行为）。
- 验证：第二次 `node toolkit/check-env.mjs` 应只剩 chrome profile 一项 FAIL（见 §4）。

## 4. Chrome Profile 初始化（人工步骤，登录态不入 Git——C6 纪律）

1. 启动带调试端口的 Chrome：`chrome.exe --remote-debugging-port=9222 --remote-allow-origins=* --user-data-dir=<仓库>\runtime\chrome_profiles\gpt-poc`（runtime/ 不随 Git 复制，首次需创建）。
2. **人工登录 ChatGPT**（Plus 账号）；登录态/Cookie 只存本机 profile，绝不入库。
3. 配置本机账号钉扎 `~/.agents/ego-profile.json`（**与 profile 分开的本机配置**，同样不入 Git）：defaultProfileId/defaultAccount/spaceExpect 三字段，方法见 chatgpt-web-dispatch skill 的「本机账号钉扎」节。
4. **人工登录验证**（规划 R1）：浏览器打开 chatgpt.com 确认会话有效。**敏感数据检查（路径事实与核验方法）**：`runtime/` 位于**仓库目录内部**（`<仓库>/runtime/`），但已被 `.gitignore` 排除、不应有任何文件被 Git 跟踪——用 `git check-ignore -v runtime/chrome_profiles/gpt-poc`（应命中规则）与 `git ls-files runtime/`（应为 0）核验，不能只凭 `git status` 判断忽略文件安全；`~/.agents/ego-profile.json` 位于用户主目录，独立于仓库，同样不得进入 Git。
5. 复跑 `node toolkit/check-env.mjs`：全部 OK（CDP 在线）。

## 5. 外部依赖清单（主机级，不在仓库内——G2 登记）

| 依赖 | 获取方式 | 说明 |
|---|---|---|
| chatgpt-web-dispatch skill | github.com/Hulkhao/agent-kit（pull+deploy） | 派单流程手册与模板；**clone 本仓库不自动具备** |
| monitor/（dispatch-manager） | 同上（agent-kit 仓库） | 双循环监控；**非 Basic 必备组件**（D1 验证裁定），不派单监控场景可不装 |
| ego-profile.json | 本机手工配置 | 账号钉扎，绝不入 Git |

## 6. 初始化完成确认

- `node toolkit/check-env.mjs` 全 OK；`python -I basic/tool/check_taskpack.py basic/tasks/b-20261115-v03-activation` 应 PASS 退出 0（对照主工作区结论）；`node toolkit/check-push.mjs` 诊断模式正常报告 ahead/behind。
- 派单前置：ChatGPT 已登录+ego-profile 就绪+审查会话 UUID（`phase0/logs/gpt-reviewer-session.json`，新环境首次派单用 `--new-session`）。
