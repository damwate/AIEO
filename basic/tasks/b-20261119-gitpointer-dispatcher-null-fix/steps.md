# 步骤清单（b-20261119-gitpointer-dispatcher-null-fix）

**方案状态：** v0.2 已冻结（S2 R1 规划协商 PASS，2026-11-19；拍板依据=用户委托 ChatGPT 渠道，reply `d6e3d0ac…` 4473B）。

**方案轮次与冻结依据：**

| 轮 | 结论 | 修订 | 复核 |
|---|---|---|---|
| R1（v0.1→v0.2） | **PASS**（reply `d6e3d0ac4c2388f28cad01d72c0f623ea935e8fdf246f98dbea8e5361ba1828d` 4473B，dispatch-2026-11-19T04-35-35，首轮无 fail-closed） | 修复落 fetch 边界 `dispatcher ?? undefined`（?? 非 ||、保留工厂 null 契约）+回归三件套+Node 原生 fetch 本地实读+不改 app 版/API/错误码+不触 DEC-010→v0.2 冻结 | S3 实施依此 |
| S4-R1 | REJECT（仅⑥证据可查，①-⑤ PASS；reply 补采 `f311df1b…` 3198B） | 补文件化负面对照机器证据+勘误+返工表（整改 `f80433f`，生产代码不变） | S4-R2 PASS |
| S4-R2 | **PASS**（reply 补采 `216db18bc8b2b2df322212c8746b0e47f2b1f76f47e43ac0b423cbb85c674168` 3709B，回执 `6b680d56…`） | ⑥证据可查关闭；六查全 PASS；S5 收口放行 | （终局） |

**验收轮次（ST-02 口径）：** S2 规划协商 R1 计 1 轮（首轮 PASS）；S4 独立验收 R1=REJECT 计 1 轮、R2=PASS 计 1 轮（两轮均发送双验通过后采集 fail-closed，按 L-018 禁重发+静态 DOM 补采取得结论计轮）；S4 问题1 一轮 REJECT 后 R2 关闭，未触三轮止损线。三次采集 fail-closed 全部静态 DOM 补采闭环，零重发零误投。

## S1 开工登记

①本步骤目标：按 Basic 工作流登记缺陷修复任务（requirement/task-brief/steps），登记基线 SHA，ST-05 自检。

②修改文件：basic/tasks/b-20261119-gitpointer-dispatcher-null-fix/{requirement.md,task-brief.md,steps.md}。

③修改内容：登记用户原话（接棒指令+按 AIEO 开发经验+历史 ChatGPT 委托）、执行者理解（根因=fetch init dispatcher:null→Node24 ERR_ASSERTION）、验收目标（双环境验证+3 回归+契约不变）、落点登记、边界红线、状态表。依据=c2-batch2 delivery §6/§7 + DEC-109 SEPARATE_DEFECT_CONFIRMED。

④执行结果：任务包建妥；ST-05 自检首跑 FAIL（task-brief 缺「优先级」）→补字段后复跑 PASS（Phase=PLANNING，Overall=IN_PROGRESS 合法态）。基线 HEAD=`93f2119bd4d173a1c162692b68094022c0a7ff5e`。

⑤测试结果：python -I basic/tool/check_taskpack.py basic/tasks/b-20261119-gitpointer-dispatcher-null-fix —— FAIL→PASS（PLANNING 期合法态）。

⑥验收证据引用：本任务包 S1 提交 `9395a97`（推送后登记于规划协商派单简报）；S1 独立验收经 S2 规划协商链直读签核（R1 裁定确认三件套）——dispatch-2026-11-19T04-35-35，reply SHA256=`d6e3d0ac4c2388f28cad01d72c0f623ea935e8fdf246f98dbea8e5361ba1828d`。

**验收结论：PASS**（开工登记完成；独立验收=S2 规划协商链直读签核）

## S2 规划协商

①本步骤目标：审查会话迁移（旧 6afdffa2 承载 7 条 user 超 L-018 §6 阈值）+缺陷修复方案 R1 独立复审+方案冻结。

②修改文件：basic/tasks/b-20261119-gitpointer-dispatcher-null-fix/{steps.md,task-brief.md}；phase0/logs/gpt-reviewer-session.json + 备份 pre-gpfix.json；phase0/tools/brief_gpfix_plan_r1.txt；派单现场 dispatch-2026-11-19T04-35-35。

③修改内容：R1 简报（1125B≤1200B，首行标记 `[GP-FIX-PLAN-R1|20261119]`）列四裁定点（根因影响面/修复落点/双环境验证/边界）；R1=PASS 首轮——审查基线 damwate/AIEO@9395a97，四项全 PASS；技术裁定=落 fetch 边界 `dispatcher ?? undefined`（?? 非 ||、不改工厂 null 契约）、回归断言严格化（捕获 fetch init、无代理完整链、Node 原生 fetch 本地实读非 mock 自证、有代理 EnvHttpProxyAgent 读后关闭）、边界保持（不改 app 版/API/错误码/重试/超时/审计、不触 DEC-010）；task-brief 冻结 v0.2。新审查会话 6afe7ccb-f2a8-83ec-83d2-b9910cc323f9（--new-session 首派即活，归属校验 PASS）。

④执行结果：方案冻结 v0.2；新审查会话就位；规范化审查载荷 SHA256=`1389df3a23498ae06a8397f2bcee06d50085eba837bf3ca36ef0536df976399b`。

⑤测试结果：reply.txt SHA256=`d6e3d0ac4c2388f28cad01d72c0f623ea935e8fdf246f98dbea8e5361ba1828d`（4473B）与 result.json.artifact_sha256 逐字一致；conversation_url 与指针一致；发送双验 polls=2；R1 裁定=PASS。

⑥验收证据引用：dispatch-2026-11-19T04-35-35（request/reply/raw-units/result/截图/run.log/tab-audit），reply SHA256=`d6e3d0ac4c2388f28cad01d72c0f623ea935e8fdf246f98dbea8e5361ba1828d`；指针备份 phase0/logs/gpt-reviewer-session.pre-gpfix.json；提交 ef99cb8。

**验收结论：PASS**（R1 规划协商首轮通过，方案冻结 v0.2）

## S3 缺陷修复与双环境验证

①本步骤目标：按冻结方案 v0.2 修复 dispatcher:null 生产路径缺陷，双环境验证 + 回归断言，保持对外契约/边界不变。

②修改文件：phase0/tools/git_pointer.mjs（唯一权威源码）；phase0/tools/test_git_pointer.mjs；phase0/logs/git-pointer-tests.json/.log；本 steps.md。

③修改内容：生产代码仅一行 `:397` fetch init `dispatcher`→`dispatcher: dispatcher ?? undefined`（?? 非 ||、工厂返回 null 契约不动、dispatcher 生命周期/显式注入/重试/超时/状态码/错误码/审计全不变、未改 app 版）；新增 3 回归（①无代理完整读取链捕获 fetch init.dispatcher===undefined 非 null，3 请求全覆盖；②Node v24 原生 globalThis.fetch 对本地 HTTP 服务实读成功，非 mock 自证；③有代理 HTTPS_PROXY→EnvHttpProxyAgent 注入且读后 closed===true）。

④执行结果：修复完成，被测 commit=`204901f276ae656254258266ba9955ee83dcfe0c`（单 commit，基线 ef99cb8，count=1、parent=基线、5 文件 diff 与申报一致）。

⑤测试结果：node phase0/tools/test_git_pointer.mjs —— 24/24 PASS（原 21 项含"无代理返回 null"契约不删不改 + 新增 3 回归），node v24.14.0，network_scope=INJECTED_LOCAL_HTTP_RESPONSES_ONLY_NO_REAL_GITHUB，EXIT=0；报告 SHA256=`288c490eb738f78f6bd3212f378db464e13dbc921c82fc55c240afe96e520de2`。负面对照隔离复现 dispatcher:null→ERR_ASSERTION（正式机器证据于 S4 整改归档）。

⑥验收证据引用：dispatch-2026-11-19T04-35-35（规划基线协商），reply SHA256=`d6e3d0ac4c2388f28cad01d72c0f623ea935e8fdf246f98dbea8e5361ba1828d`；测试报告 phase0/logs/git-pointer-tests.json（SHA 288c490e…）；被测 commit 204901f。

**验收结论：PASS**（S3 自报；独立验收=见 S4）

## S4 独立验收

①本步骤目标：S4 独立验收六查（合目标/合方案/无超范围/代码质量/测试真实/证据可查），R1 对问题1 REJECT→整改→R2 PASS。

②修改文件：本 steps.md（S4 R1/R2 记录+返工表）；phase0/tools/gpfix_neg_control.mjs；phase0/logs/gpfix-negative-control.json；phase0/tools/recoll_gpfix_accept_r1.mjs/r2.mjs；派单现场 dispatch-2026-11-19T04-44-09/05-19-04。

③修改内容：S4-R1 六查①-⑤ PASS、⑥证据可查对问题1判 REJECT（S3 口述负面对照未归档机器证据，裁定载荷 `31361e64…`）；针对问题1整改（提交 f80433f）新增文件化负面对照脚本+归档 JSON（ERR_ASSERTION 原文 message=`assert(dispatcher)`、node v24.14、命令、SHA `1b862f01…`）+S3 勘误+返工表；S4-R2 仅复审问题1=PASS（六检查点全 PASS、审查方独立重算证据 SHA 一致、确认 f80433f 无生产代码改动）。两次派单均发送双验通过后采集 fail-closed `INBOUND_WINDOW_COMPLETENESS_UNPROVEN`→按 L-018 禁重发+静态 DOM 补采（recoll 四参数全换 grep 核对、归属三件套全过）。

④执行结果：S4 终态 PASS（六查全 PASS）；被测 commit 仍 `204901f276ae656254258266ba9955ee83dcfe0c`（生产代码未改，整改提交 f80433f 仅证据/文档）。

⑤测试结果：S4-R1 reply 补采 3198B SHA=`f311df1bca23a54d72d7f47744696b5fd7958bb572a95b936bc3d931067203fa`（六查⑥ 对问题1判 REJECT）；S4-R2 reply 补采 3709B SHA=`216db18bc8b2b2df322212c8746b0e47f2b1f76f47e43ac0b423cbb85c674168`（问题1 PASS，回执 `6b680d56…`）；负面对照 assertion=true EXIT=0。ST-01 绑定 count=1/parent=基线，审查方独立复核确认。

⑥验收证据引用：dispatch-2026-11-19T05-19-04（S4-R2 派单），reply SHA256=`216db18bc8b2b2df322212c8746b0e47f2b1f76f47e43ac0b423cbb85c674168`；S4-R2 补采 phase0/tools/phase0/logs/recoll-gpfix-accept-r2-2026-11-19T05-22-01-227Z；负面对照 phase0/logs/gpfix-negative-control.json（SHA 1b862f01…）；被测 commit 204901f、问题1修复 commit `f80433fe380bf62ec675209bb374a78e5881e486`。

**验收结论：PASS**（S4-R2 六查全 PASS，被测 commit 204901f；S4 PASS ≠ 任务完成，S5 收口另行）

### 返工记录表（问题1：S4-R1 六查⑥证据可查 REJECT）
| 问题编号 | 根因 | 整改内容 | 修复 commit |
|---|---|---|---|
| 问题1 | S3 用 ad-hoc `node -e` 复现负面对照未落盘，缺可查机器证据（亦违 skill 禁 ad-hoc -e 纪律） | 文件化脚本 `phase0/tools/gpfix_neg_control.mjs` + 归档 `phase0/logs/gpfix-negative-control.json`（ERR_ASSERTION 原文、node v24.14、命令、SHA 1b862f01…）+ S3 勘误 + 返工表；生产代码不变 | `f80433fe380bf62ec675209bb374a78e5881e486` |

## S5 收口交付

①本步骤目标：完工六查 + delivery 七要素 + DEC-111 登记 + commit + check-push 推送。

②修改文件：basic/tasks/b-20261119-gitpointer-dispatcher-null-fix/delivery.md；本 steps.md；task-brief.md（状态=完成）；docs/phase1/decision-log.md（DEC-111）。

③修改内容：delivery 七要素落盘（原始需求/最终实现/修改文件/测试结果/Git commit/未解决问题/后续建议）；task-brief 状态=完成、最终结果=PASS；DEC-111 登记立项+修复+验收闭环。

④执行结果：完工六查满足（全步骤 PASS/整体测试完成/无遗留未关闭返工项/工作区符合预期/已 commit/完工总结形成）；工作区净、ahead=0。

⑤测试结果：python -I basic/tool/check_taskpack.py basic/tasks/b-20261119-gitpointer-dispatcher-null-fix —— COMPLETED 态全项 PASS。

⑥验收证据引用：dispatch-2026-11-19T04-35-35（规划协商基线，首派复核），reply SHA256=`d6e3d0ac4c2388f28cad01d72c0f623ea935e8fdf246f98dbea8e5361ba1828d`；delivery.md + DEC-111 + 收口提交（不属验收 diff，被测 commit 仍 204901f）。

**验收结论：PASS**（S5 收口完成；任务 COMPLETED）

---

## ST-05 自检记录
- S1：FAIL（task-brief 缺「优先级」）→补字段→PASS（PLANNING/IN_PROGRESS 合法态）。
- S3 提交前：PASS（Phase=PLANNING，Overall=IN_PROGRESS）。
- S4-R1 整改提交前：PASS（Phase=PLANNING，Overall=IN_PROGRESS）。
- S5 终检（COMPLETED 态）：全项 PASS（见交付）。
