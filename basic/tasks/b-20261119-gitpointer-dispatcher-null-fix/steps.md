# 步骤记录：b-20261119-gitpointer-dispatcher-null-fix

## S1 任务登记
- ①目标：按 Basic 工作流登记缺陷修复任务（requirement/task-brief/steps），基线 SHA 登记，ST-05 自检。
- ②修改文件：本任务包三件套。
- ③内容：见 requirement.md / task-brief.md；依据=c2-batch2 delivery §6/§7 + DEC-109 SEPARATE_DEFECT_CONFIRMED。
- ④执行结果：完成；基线 HEAD=`93f2119`。
- ⑤测试结果：ST-05 自检首跑 FAIL（task-brief 缺「优先级」字段）→补字段后复跑 PASS（Phase=PLANNING，Overall=IN_PROGRESS，合法态）。
- ⑥证据：基线 HEAD=`93f2119`（全 40 位见下）；ST-05 两轮输出（FAIL→PASS）已记录。
- 基线完整 SHA：见 requirement.md 依据链；开工前 `git rev-parse HEAD` 实取登记于 S2 派单简报。

## S2 规划协商（完成）
- ①目标：审查会话迁移 + 缺陷修复方案 R1 复审（缺陷事实/理解/草案→ChatGPT 独立裁定→冻结方案）。
- ②修改文件：本 steps.md / task-brief.md（冻结 v0.2）；`phase0/logs/gpt-reviewer-session.json` 指针迁移 + 备份。
- ③内容：
  - 会话迁移：旧审查会话 6afdffa2（承载 7 条 user 消息，超 L-018 §6 的 4 条评估阈值）归档只读，指针备份 `phase0/logs/gpt-reviewer-session.pre-gpfix.json`；`--new-session` 首派即活。
  - R1 简报 `phase0/tools/brief_gpfix_plan_r1.txt`（1125B≤1200B，首行标记 `[GP-FIX-PLAN-R1|20261119]` 供归属校验）；裁定四问=根因影响面/修复落点/双环境验证/边界。
  - **R1=PASS（首轮通过，无 fail-closed、无补采）**：审查基线 `damwate/AIEO@9395a97`，逐项四项全 PASS；关键技术裁定=①修复落 fetch 边界 `dispatcher: dispatcher ?? undefined`（不改工厂返回契约、用 ?? 不用 ||）；②测试补充=保留原 null 契约断言+新增捕获 fetchImpl init 严格断言 `opts.dispatcher===undefined`/`!==null`+无代理覆盖完整 readGitPointer 链+有代理注入 HTTPS_PROXY 验 EnvHttpProxyAgent 且读取后关闭自有 dispatcher+本地注入响应覆盖 manifest/材料字节与 SHA256+特别区分 mock 捕获 undefined 与 Node v24 原生 fetch 对本地 HTTP 服务实读成功（至少保留一条原生 fetch 验证，不只用 mock 自证）+边界保持 dispatcher 自动创建/所有权/关闭与重试/超时/状态码/错误码/审计不变；③不改 app 版、不触 DEC-010/不部署/不合并/不连真 GitHub。
  - 规范化审查载荷 SHA256=`1389df3a23498ae06a8397f2bcee06d50085eba837bf3ca36ef0536df976399b`。
- ④执行结果：完成；新审查会话 **6afe7ccb-f2a8-83ec-83d2-b9910cc323f9**（归属校验 PASS）。
- ⑤测试结果：reply.txt SHA256=`d6e3d0ac4c2388f28cad01d72c0f623ea935e8fdf246f98dbea8e5361ba1828d`（4473B）与派单 `result.json.artifact_sha256` 逐字一致；conversation_url=新会话与指针一致；发送双验 polls=2。
- ⑥证据：派单目录 `phase0/logs/dispatch-2026-11-19T04-35-35/`（request/reply/raw-units/result/截图/run.log/tab-audit）；指针备份+新指针；R1 回执全文见该目录 reply.txt。
- 备注：方案冻结为 v0.2（吸收 R1 全部测试补充要求）；R1 PASS 仅代表方案通过，不代表代码已修复/缺陷已解除。

## S3 缺陷修复与双环境验证（完成）
- ①目标：按 R1 冻结方案修复 dispatcher:null 生产路径缺陷，双环境验证 + 回归断言，保持对外契约/边界不变。
- ②修改文件：`phase0/tools/git_pointer.mjs`（唯一权威源码）；`phase0/tools/test_git_pointer.mjs`（3 项回归）；`phase0/logs/git-pointer-tests.json`/`.log`（测试报告重生成）。
- ③内容：
  - 生产代码**仅一行**：`:397` fetch init `dispatcher` → `dispatcher: dispatcher ?? undefined`（git diff 核验一行变更，index 992b34a..524e9dc）；工厂 `createGitPointerProxyDispatcher` 无代理返回 null 的契约未动；dispatcher 自动创建/所有权/关闭、显式注入、重试/超时/状态/错误码/审计全不变；未改 app 版。
  - 回归①无代理完整读取链捕获 fetch init：`opts.dispatcher===undefined` 且 `!==null`（3 次请求 manifest+2 files 全覆盖）。
  - 回归② Node v24 原生 `globalThis.fetch` 对本地 HTTP 服务实读成功（createServer 按 req.url 路由 manifest+材料），证明 undici 原生语义兼容，非 mock 自证；捕获 init.dispatcher===undefined。
  - 回归③有代理 env 注入 HTTPS_PROXY→有效 EnvHttpProxyAgent（constructor.name 断言），读取结束后 `dispatcher.closed===true`（自有 dispatcher 正常关闭）。
- ④执行结果：完成。
- ⑤测试结果：`node phase0/tools/test_git_pointer.mjs` → **total=24 passed=24 failed=0**（原 21 项全 PASS 含"无代理返回 null"契约不删不改 + 新增 3 项回归），node=v24.14.0，network_scope=INJECTED_LOCAL_HTTP_RESPONSES_ONLY_NO_REAL_GITHUB，EXIT=0。
- ⑥证据：测试报告 `phase0/logs/git-pointer-tests.json`（SHA256=`288c490eb738f78f6bd3212f378db464e13dbc921c82fc55c240afe96e520de2`，24/24）+ `.log`；生产 diff 如上；被测 commit=`204901f276ae656254258266ba9955ee83dcfe0c`（S4 绑定已核）。
- 勘误（S4 R1 揭出，如实登记）：S3 初稿⑤曾口头声称"负面对照已复现 ERR_ASSERTION"，但当时仅 ad-hoc `node -e` 执行、未归档机器证据——该表述不实，已在 S4 ⑥ 整改项补正式证据（见下）。

## S4 独立验收
### S4-R1：REJECT（仅第⑥项证据可查，其余五项 PASS）
- 被测 commit=`204901f276ae656254258266ba9955ee83dcfe0c`，基线=`ef99cb82315a1839d3fcca3a3d20ac7681a43199`（ST-01：count=1、parent=基线、5 文件 diff 与申报一致，审查方独立复核确认）。
- 派单 `dispatch-2026-11-19T04-44-09` 发送双验通过（polls=1）后采集 fail-closed `INBOUND_WINDOW_COMPLETENESS_UNPROVEN`；按 L-018 禁重发→静态 DOM 补采驱动 `recoll_gpfix_accept_r1.mjs`（四参数全换：CONV_UUID=6afe7ccb/MARKER=[GP-FIX-ACCEPT-R1|20261119]/PREV_REPLY_SHA=d6e3d0ac/FAILED_DIR=04-44-09，grep 核对）→补采目录 `phase0/tools/phase0/logs/recoll-gpfix-accept-r1-2026-11-19T05-17-22-034Z`（cwd 相对路径误落点，按 a1d14ad 惯例原位入库），reply 3198B SHA256=`f311df1bca23a54d72d7f47744696b5fd7958bb572a95b936bc3d931067203fa`，归属三件套 PASS（标记唯一1+最后user断言+前轮SHA排除），checks 中 `index_continuity:false` 如实记录（该断言属场景①口径，非本验收项，审查方未据此扣项）。
- 六查裁定：①目标PASS ②方案PASS（?? 非 ||、工厂null契约保留、三项回归齐） ③无超范围PASS（app版未改/DEC-010未触） ④代码质量PASS（仅一行） ⑤测试真实性PASS（24/24、原生fetch非mock、21项未删） ⑥证据可查=**REJECT（ADJUST）**——S3 声称的负面对照未归档机器证据。
- 规范化裁定载荷 SHA256=`31361e64558b8e71f6f7018ce5d94ae51d94f6a77a7803a769b6fb220dcd8148`。
- 唯一整改项：补可复核负面对照（Node v24 + 本地 HTTP + fetch(url,{dispatcher:null}) → ERR_ASSERTION，原始输出/命令/版本/SHA256 归档 + 更新 steps.md）；不改生产代码/不重新设计测试；R2 仅复审第⑥项。

### 返工记录（首次 REJECT 建表，WORKFLOW 模块五）
| 轮次 | 问题 | 根因 | 整改 | 状态 |
|---|---|---|---|---|
| R1 REJECT | 问题1（六查⑥证据可查）：负面对照仅口头声称、无归档机器证据 | S3 用 ad-hoc `node -e` 复现未落盘（亦违 skill 禁 ad-hoc -e 纪律） | 新增文件化脚本 `phase0/tools/gpfix_neg_control.mjs`，归档 `phase0/logs/gpfix-negative-control.json`（ERR_ASSERTION 原文+node v24.14+命令+SHA256=`1b862f01f5815bdcc132722943480e390b1fefc2d4e195a77fb82a581b973627`），勘误 S3⑤ | 整改完成，待 R2 复审 |

### S4-R2：待派单（仅复审第⑥项）

## S5 收口交付（待执行）
- 完工六查 + delivery 七要素 + commit + check-push 推送。

---

## ST-05 自检记录
- （S1 阶段运行 `python -I basic/tool/check_taskpack.py basic/tasks/b-20261119-gitpointer-dispatcher-null-fix` 后回填）
