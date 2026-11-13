# POC-03 验证报告：Playwright 控制系统 Chrome 网页 GPT 会话往返

**结论：PASS_WITH_CONSTRAINTS（功能全部验证通过；约束：登录环节的两大安全边界 + CDP 接管模式）**
**验证时间：** 2026-11-12 00:37–00:53（UTC+8）
**会话：** https://chatgpt.com/c/6af49ad6-4c0c-83ee-9485-0d32deb63df7（用户手工登录，人工创建测试会话"测试成功"）

## 1. 最终采用的技术方案（两次迭代）

### 迭代 1（失败）：Playwright `launchPersistentContext` 直启
- 结果：浏览器可启动、chatgpt.com 可访问（经系统代理 127.0.0.1:10391），但**无法完成登录**：
  - Google OAuth 直接拒绝："此浏览器或应用可能不安全"（Google 对 CDP 控制浏览器的既有策略）；
  - auth.openai.com 的 Cloudflare Turnstile 人机验证**人工也点不过**（自动化标记 `navigator.webdriver=true` 触发风控循环挑战）。
- 按项目约束（不绕过登录/安全验证、不注入隐身脚本），该路径判定为**登录不可行**。

### 迭代 2（成功）：普通方式启动 Chrome + CDP 接管
- `chrome.exe --remote-debugging-port=9222 --user-data-dir=<专用目录>` 普通启动（无自动化标记，代理继承系统设置）；
- **用户人工完成登录**（邮箱方式；Google 按钮仍被 Google 拒绝）并创建测试会话；
- Playwright `connectOverCDP("http://127.0.0.1:9222")`（官方受支持接口）接管页面执行自动化；
- 调试端口仅绑定 127.0.0.1，不暴露局域网；登录态存于专用配置目录 `runtime/chrome_profiles/gpt-poc`（gitignored），与日常 Chrome 隔离。

## 2. 自动化往返实测结果（--run，exit 0）

| 验收项（文档 05 §5） | 结果 | 实测证据 |
|---|---|---|
| 能定位正确会话 | ✅ | goto 会话 URL，页面就绪判定（unit>0 + composer + bodyLen>300）通过 |
| 能发送消息 | ✅ | insertText 填充 → 回读一致 → focus+Enter → 发送双验（尾部 unit 前进为 user + 停止按钮出现）两条消息均通过 |
| 能读取完整回复 | ✅ | msg1 回复=`确认`，msg2 回复=`确认`，与截图人工比对一致 |
| 不把旧回复误判为新回复 | ✅ | 每次发送前记录基线尾部（assistant UUID）；新回复 UUID（8e3a57a7/f893e52e）≠ 基线（8585c49e/8e3a57a7） |
| 能检测生成中状态 | ✅ | 生成态=可见停止按钮（结构化判定，无文本匹配）；两次均观察到"停止按钮出现→消失"翻转 |
| 完成判定 | ✅ | 翻转 + 75 秒确认窗 + 尾部 assistant DIL UUID 两次读取稳定 + Composer 空 |
| 登录失效或验证码出现时暂停 | ✅（设计+实测错误路径） | 页面 40 秒未就绪即停止并落盘错误截图（实测触发过一次，见 §4）；失败不重发 |
| 失败后不盲目重复发送 | ✅ | 发送未获双验只标 UNCERTAIN 退出，脚本内无重发逻辑 |
| 上下文连续性（第二条消息） | ✅ | msg2 回复包含 msg1 指定的词，会话上下文有效 |

## 3. 实测 DOM 契约（本机 2026-11-12 实测，与 ego 手册 2026-11-08 记录一致）

- 消息身份：`[data-content-search-unit-key]`（key 末段 `user`/`assistant`）✅ 存在（unitCount 随轮次增长）
- assistant UUID：`[data-dil-response][data-dil-message-id]` ✅ 存在
- 旧锚点 `[data-message-author-role]` 等确认不可用（手册结论）
- Composer：`[aria-label="询问 ChatGPT"]` ✅（`#prompt-textarea` 在当前版本不存在）
- **注意**：user 与 assistant unit 的 key 中段序号不同（`fallback-turn-N:0:user` vs `fallback-turn-N:1:assistant`），不能通过把 `:assistant` 替换为 `:user` 反查 user unit——首跑提取落空即此原因，已改为"包含我方消息特征串的最后一个 user unit"定位。
- assistant 气泡 innerText 带 `ChatGPT 说：` 前缀，提取时需剥离。

## 4. 过程中的失败与修复（如实记录）

1. `launchPersistentContext` 登录被 Google/Turnstile 拒绝 → 改 CDP 接管（见 §1）；
2. setup 轮询中 Page 句柄在跨域登录跳转（auth.openai.com→chatgpt.com）后变陈旧，`page.url()` 停留旧值 → 改由 CDP `/json` 端点直接读取 URL 落盘（该端点数据与真实标签页一致）；
3. 就绪判定对短会话过严（bodyLen>600，实测短会话仅 304）→ 改为结构化组合判定（unit>0 + composer + bodyLen>300）；
4. 回复提取按拼接 user key 定位落空（§3 注意点）→ 改特征串定位后 PASS。

## 5. 约束与对 AIEO 架构的影响

1. **登录必须人工完成一次**（邮箱方式），Google OAuth 与自动化浏览器不兼容；会话失效后同样需人工重登。GPT 五角色账号应使用专用账号+密码。
2. **自动化必须走 CDP 接管模式**（普通启动 Chrome + connectOverCDP），不能用 Playwright 直启做登录后自动化以外的事情——直启连人机验证都过不去，登录后的页面自动化两者皆可，但统一用一种模式更稳。
3. Turnstile/风控可能在未来任何登录时再次出现：出现时**暂停并交人工**（已实现为错误路径），AIEO 需设计"登录失效→OFFLINE/人工接管"状态。
4. 每会话同一时刻仅一个在途任务（本次已按此执行）。
5. 免费账号下回复延迟 4–6 秒，75 秒确认窗足够；更强模型/长任务时确认窗与看门狗节奏沿用 ego 手册参数。

## 6. 证据文件

- 截图：`phase0/screenshots/poc3-01-initial-cdp.png`（登录前）、`poc3-03-ready.png`、`poc3-04-filled-msg1/2.png`（填充态）、`poc3-05-sent-msg1/2.png`（发送后生成态）、`poc3-06-reply-msg1/2.png`（完整回复）、`poc3-error-not-ready.png`（错误路径实证）
- 结构化证据：`phase0/logs/gpt-poc-roundtrip-result.json`（基线/双验/完成判定/提取文本全记录）
- 日志：`phase0/logs/gpt-poc-roundtrip.log`、后台任务 stdout（全时间线）
- 脚本：`phase0/gpt-browser-poc/gpt_roundtrip.mjs`（--setup / --run 两模式）
