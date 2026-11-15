# Basic 可复制性验证报告（D1 实战：本机模拟新环境初始化）

- 任务：b-20261115-basic-replication-verify｜日期：2026-11-15｜演练目录：D:/AIEO-replication-test（clone 自 https://github.com/damwate/AIEO.git，HEAD=d05f46be4bc5ec942ee1b27c5a0bf0be64c59351）
- 方案冻结：规划 R1 裁定"修改后同意"（reply sha256=fc8478d79cc0a634e406bff7030e60a9862f8ab4eb254cd1e2903b3298cbd974）八项清单+两次体检对照+缺口 P0/P1/P2 分级，节点自主推进授权（增补②）
- **结论边界（必须先读）：本报告为"本机模拟验证"——临时目录与主工作区共享同一 OS/Git/Node/Python/Chrome/登录态/系统代理，不能等同于真正换一台新电脑。跨电脑实测标记为"待验证"，不冒充已完成。**

## 一、核验结果总表（八项清单）

| # | 核验项 | 结果 | 证据 |
|---|---|---|---|
| 1 | Clone 完整性（未认证公开拉取） | **PASS（经代理）** | 直连 `Connection was reset`→经系统代理端口 3260 clone 成功；HEAD=d05f46b；git fsck 干净；工作区 0 变更；clone 内 .git/config 无代理条目（仓库未携带主机网络配置，正确） |
| 2 | 环境依赖（OS/Git/Node/Python/PowerShell/Chrome） | PASS（本机共享） | check-env：node 24.14.0/git 2.47.1/Chrome CDP 9222 在线；**共享本机环境，新电脑需自装——见缺口 G4** |
| 3 | 环境体检两次对照 | **PASS（符合预期）** | 第一次（初始 clone）：2 FAIL=playwright 依赖缺失+chrome profile 缺失（均为 .gitignore 设计排除，非缺陷）；npm ci 后第二次：playwright OK，残留 1 FAIL=chrome profile（登录态不入 Git，C6 纪律正确） |
| 4 | Basic 核心工具（check_taskpack） | **PASS** | 3 个 COMPLETED 任务包（v03-activation/lessons-recoll/standard-design-input）全部 Overall=PASS 退出 0，与主工作区结论一致 |
| 5 | 公共工具链 | **PASS（附限制）** | check-push 诊断模式正常（ahead=0 无需推送，未用 --push --yes，执行前后 .git/config 0 代理条目+工作区净=零改动）；gpt_dispatch/inbound_dom/inbound_reply/session_lock/package.json 齐备（check-env OK）；**限制：session_lock 用 PowerShell+gpt_dispatch 写死 Windows Chrome 路径——派单链当前仅 Windows 实测，check-env 标注"跨平台"不等于派单链跨平台已验证** |
| 6 | 治理文档齐备 | **PASS** | WORKFLOW/ACCEPTANCE-CHECKLIST/templates 三件套（acceptance-request+handoff-package+task-brief）/tasks README/AGENTS.md（33 行）/docs/phase1/handoff-template.md 全部在 clone 内 |
| 7 | 部署边界条款对照 | **PASS** | "Basic 不依赖 Standard 业务运行时"成立（basic/ 工具全部独立跑通）；"复制新电脑需保留仓库公共工具并初始化环境"——npm ci 即可恢复 playwright（已验证），profile 需人工初始化（见缺口） |
| 8 | 可复制性与外部依赖 | **部分（如实登记）** | 仓库内无 skills/、无 monitor/：chatgpt-web-dispatch skill=主机级外部依赖（~/.agents/skills/，clone 后需按 skill 自身方式安装）；monitor=外部 agent-kit 仓库管理（非 WORKFLOW 规定的 Basic 必备组件，不作必检）；**登录态/Cookie 不入 Git（正确），但初始化步骤未文档化（见缺口 G2）** |

## 二、缺口清单（分级；只登记不修复）

| 编号 | 级别 | 缺口 | 证据 | 影响范围 | 修复建议 |
|---|---|---|---|---|---|
| G1 | **P1** | chrome profile（runtime/chrome_profiles/gpt-poc）初始化步骤未文档化：新环境需人工启动 Chrome（调试端口 9222）+人工登录 ChatGPT，WORKFLOW/check-env 均未写该步骤 | 第二次 check-env 残留 FAIL；.gitignore 排除 runtime/（设计正确） | 新环境派单主链不可用直到人工完成登录 | WORKFLOW 部署边界或 toolkit/README 增"新环境初始化步骤"（建 profile 目录+带端口启 Chrome+人工登录+ego-profile.json 配置）；不涉密（不写 Cookie 本身） |
| G2 | **P1** | skills 为主机级外部依赖未在部署边界条款登记：chatgpt-web-dispatch skill 不随仓库复制，新环境需另行安装 | 仓库内无 skills/；本机 ~/.agents/skills/chatgpt-web-dispatch 存在 | 派单流程文档引用 skill 但新环境缺失 | WORKFLOW 部署边界条款增"外部依赖清单"（skills/monitor agent-kit/ego-profile.json），标注获取方式（github.com/Hulkhao/agent-kit） |
| G3 | P2 | 派单链 Windows 专属限制未在文档显式声明：session_lock.mjs 用 PowerShell、gpt_dispatch 写死 Windows Chrome 路径，check-env 自述"跨平台 Linux/Windows"易被误读为派单链跨平台 | 源码审查（规划 R1 指出） | Linux/Mac 新环境派单链不可用 | 派单工具 README 或 WORKFLOW 部署边界注明"派单链当前 Windows 实测" |
| G4 | P2 | 新电脑环境自装清单未文档化：Node≥18/Git/Python3/Chrome/PowerShell 版本与获取方式散落各处 | 第一次 check-env（共享本机未实测自装） | 真正新电脑初始化缺一步清单 | 同 G1 一并成文"新环境初始化清单" |
| G5 | 待验证 | **跨电脑实测未执行**（本机模拟只能验证仓库复制维度） | 本报告结论边界 | "复制到新电脑即用"最终确认 | 条件允许时在第二台设备重复本演练 |

**P0（阻断即用）：无** —— 仓库复制维度未发现阻断项；核心工具 clone 后即可用（npm ci 一步恢复依赖）。
**环境未初始化类缺失（playwright/profile）与仓库自身缺陷已分开记录**（前者属正常初始化步骤，后者为零）。

## 三、通过项汇总

clone 完整性（经代理）／两次体检对照符合设计／check_taskpack 三包结论一致／check-push 诊断零副作用／治理文档全齐备／部署边界两条款实测成立／登录态不入 Git 纪律正确执行。

## 四、原始输出归档

本目录（acceptance/）原始输出 7 项：check-env-1st.txt／check-env-2nd.txt／taskpack-×3／check-push-diag.txt／clone-log.txt；执行记录补档 3 项（R1 验收 P1-1/P1-2 整改）：fsck-exec.txt（fsck 退出码 0 复跑记录）／npm-ci-exec.txt（如实补记：完整 stdout 未落盘，退出码与结果按执行时终端记录）／check-push-before-after.txt（当前态快照+执行时点快照未落盘如实标注，不补造）；报告=replication-report.md；清单=ls-MANIFEST.txt（准确区分原始输出/执行记录补档/报告）。
fsck 结论：clone 时执行（干净=无输出）；npm ci 结论：两次退出码 0、playwright 恢复由 check-env-2nd [OK] 佐证；check-push 零副作用：当前态快照（proxy=0 条/status=0 条/HEAD=origin/main=无领先）+执行时终端核验（steps.md S1③），执行时点前后快照未落盘已如实标注——该项证据为"部分可证"，不冒充完整。
