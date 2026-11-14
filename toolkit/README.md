# toolkit/ —— 通用工具包（跨版本共用）

原则（开工会议第一题共识）：按真实故障沉淀，**不提前造工具**；唯一权威源码；执行前确认；不擅自改 Git 配置；端口可配置。

## 工具清单

### check-push.mjs —— Git 推送诊断与执行（L-014 路径固化）

- 用法：
  - `node toolkit/check-push.mjs` —— 诊断模式：dry-run 试推各路径，**不真正推送**
  - `node toolkit/check-push.mjs --push` —— 诊断+真实推送（TTY 交互确认）
  - `node toolkit/check-push.mjs --push --yes` —— 非交互确认推送（仅在已获用户授权时使用）
  - `--ports 10391,6822` —— 附加候选代理端口
- 路径（L-014 固化）：①绕仓库代理直连 → ②失败探测活代理端口重试 → ③仍失败输出精确报告（操作/路径/建议三要素），继续其他工作不得罢工
- 约束：只读解析 `.git/config` 代理项；任何情况下**不改写 Git 配置**（`-c` 命令行临时覆盖不是改配置）；执行前需确认
- 端口候选来源：只读解析仓库代理配置 ∪ 环境变量 `AIEO_CHECK_PORTS` ∪ `--ports`
- 退出码：0 成功 / 1 推送失败或无可用路径 / 2 环境错误 / 3 用户取消

### check-env.mjs —— 环境体检（跨平台 Linux/Windows）

- 用法：`node toolkit/check-env.mjs [--ports a,b] [--cdp-port 9222]`
- 检查项：OS/node/git 版本、仓库状态（分支/ahead-behind/未提交数）、代理配置与端口监听、Chrome CDP、派单工具链关键文件
- 端口可配置：代理端口 `AIEO_CHECK_PORTS`/`--ports`（默认只读解析仓库代理配置）；CDP 端口 `AIEO_CDP_PORT`/`--cdp-port`（默认 9222 = phase0 冻结派单工具链值）
- 说明：**退出码恒 0**（报告型工具）。端口未监听/CDP 不在线属常见波动（L-014、`phase0/environment-inventory.md` §5"配置存在≠服务在跑"），由阅读者判断

## 待办（已登记未实施）

- `phase0/tools/inbound_dom.mjs` 采集器缺陷修复：ChatGPT 页面 DOM 每轮编号跳位（0=user、2=assistant），长会话多窗口取证合并被误判缺 unit（DEC-043 登记）；修复须带测试 + 独立复核。

## 依赖与纪律

node ≥18，零第三方依赖（纯 Node 内置模块）。脚本经 Git 根目录定位，不依赖启动目录；禁止个人绝对路径与固定代理端口；历史证据不得移动。
