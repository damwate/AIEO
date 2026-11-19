# delivery：b-20261119-gitpointer-dispatcher-null-fix（GitPointer dispatcher:null 生产路径缺陷修复）

- **最终结果：COMPLETED**——生产代码一行修复（fetch 边界 null→undefined 归一），24/24 单测全过，S4 独立验收 R1 REJECT（仅⑥证据缺口）→整改→R2 PASS，六查全 PASS。

## 1. 原始需求
用户 2026-11-19 接棒指令（"你继续接棒"+"请按照AIEO开发经验来"），交接「四、遗留与下一步」建议下一节点=dispatcher:null 缺陷修复（经规划协商后实施）；依据=c2-batch2 delivery §6/§7 + DEC-109「SEPARATE_DEFECT_CONFIRMED 另立任务必办」。委托渠道：拍板派单 ChatGPT（DEC-010 红线归用户本人）。

## 2. 最终实现内容
- **缺陷根因**：`phase0/tools/git_pointer.mjs:344` 无代理 env 时 `createGitPointerProxyDispatcher()` 返回 `null`，经 `:466` 传入 `fetchGitPointerBytes`，在 `:397` 作 `fetch(url,{dispatcher:null})` init 字段；Node v24 undici 对 null 抛 `ERR_ASSERTION`→readGitPointer 材料读取必失败（④-D 首轮实证）。
- **修复（生产代码仅一行）**：`:397` `dispatcher` → `dispatcher: dispatcher ?? undefined`（fetch 调用边界；用 ?? 非 ||；不改工厂返回 null 的既有契约；dispatcher 自动创建/所有权/关闭、显式注入、重试/超时/状态码/错误码/审计全不变；未改 app 版）。
- **回归测试（3 项新增，原 21 项不删不改）**：①无代理完整读取链捕获 fetch init.dispatcher===undefined 非 null（3 次请求全覆盖）；②Node v24 原生 fetch 对本地 HTTP 服务实读成功（非 mock 自证）；③有代理 env 注入 EnvHttpProxyAgent 且读后 closed===true。
- **负面对照机器证据**：`phase0/tools/gpfix_neg_control.mjs` + `phase0/logs/gpfix-negative-control.json`——原生 fetch(url,{dispatcher:null}) 捕获 ERR_ASSERTION（原文 message="assert(dispatcher)"，node v24.14，SHA=1b862f01…），证明回归非空心（L-017）。

## 3. 修改文件
- 生产代码：`phase0/tools/git_pointer.mjs`（一行）。
- 测试与报告：`phase0/tools/test_git_pointer.mjs`（+3 回归）、`phase0/logs/git-pointer-tests.json`/`.log`（24/24 重生成）。
- 派单与证据：`phase0/tools/brief_gpfix_plan_r1.txt`/`brief_gpfix_accept_r1.txt`/`brief_gpfix_accept_r2.txt`；`phase0/tools/recoll_gpfix_accept_r1.mjs`/`r2.mjs`；`phase0/tools/gpfix_neg_control.mjs`；`phase0/logs/dispatch-2026-11-19T04-35-35`（R1 规划）、`04-44-09`/`05-19-04`（S4 两次 fail-closed 现场）、`recoll-gpfix-accept-r1/r2`（补采，cwd 相对路径误落点 `phase0/tools/phase0/logs/` 按 a1d14ad 惯例原位入库）、`gpfix-negative-control.json`。
- 指针：`phase0/logs/gpt-reviewer-session.json`（6afdffa2→6afe7ccb）+ 备份 `pre-gpfix.json`。
- 任务包：`basic/tasks/b-20261119-gitpointer-dispatcher-null-fix/`（requirement/task-brief v0.2 冻结/steps/delivery）。
- 决策日志：DEC-111（本任务立项+修复+验收闭环登记）。

## 4. 测试结果
- `node phase0/tools/test_git_pointer.mjs`：**24/24 PASS**（原 21 + 回归 3），node v24.14.0，network_scope=INJECTED_LOCAL_HTTP_RESPONSES_ONLY_NO_REAL_GITHUB，报告 SHA256=`288c490eb738f78f6bd3212f378db464e13dbc921c82fc55c240afe96e520de2`。
- 负面对照 EXIT=0、assertion=true；证据 SHA256=`1b862f01f5815bdcc132722943480e390b1fefc2d4e195a77fb82a581b973627`（审查方 R2 独立重算一致）。
- S4 派单：R1 规划 PASS（reply `d6e3d0ac…` 4473B）；S4-R1 REJECT（仅⑥，reply 补采 `f311df1b…` 3198B）→整改→S4-R2 PASS（reply 补采 `216db18b…` 3709B，回执 SHA `6b680d56…`）。3 次采集 fail-closed 全部 L-018 禁重发+静态 DOM 补采闭环，零重发零误投，归属三件套全过。
- ST-05 终检：COMPLETED 态全项 PASS（见 steps.md ST-05 记录）；ST-01 绑定：count=1/parent=基线/5 文件 diff 与申报一致（审查方独立复核）。

## 5. Git commit
- `93f2119`（接棒前置：磁盘清理残留全量归档 62 文件 + DEC-110 S3 补记，ahead=0）。
- `9395a97`（S1 立项）；`ef99cb8`（S2 R1 PASS + 会话迁移 + 方案冻结）；`204901f`（**S3 被测 commit**：生产修复+24/24，基线 ef99cb8，单 commit 线性绑定）；`f80433f`（S4-R1 整改：负面对照机器证据+返工表，生产代码不变）；本提交（S4-R2 收口+delivery+DEC-111）。全部经 check-push 推送（ahead=0 逐次复核）。

## 6. 未解决问题
1. `app/gpt_controller/src/git_pointer.mjs` 未引入 undici dispatcher（文件头已声明代理集成属部署配置），当前无此缺陷、本任务按边界不改；若未来该文件引入 dispatcher 需重新评估。
2. ChatGPT 网页派单在该会话连续两次触发 `INBOUND_WINDOW_COMPLETENESS_UNPROVEN`（确定性虚拟化），均靠静态 DOM 补采闭环；补采驱动 cwd 相对路径落点 `phase0/tools/phase0/logs/` 为已知 L-018 现象（沿用 a1d14ad 原位入库惯例，未改驱动架构口径）。
3. CDP 9222 在派单工具按需拉起模式下工作正常；本轮无连接类故障。

## 7. 后续建议
1. 生产修复已闭环，可将 `decfd10`（c2-batch2）→本任务链作为"缺陷发现→另立任务→修复→S4 签核"的完整范例归档。
2. 待用户本人拍板项（DEC-010/DEC-107，本任务未推进）：多任务实施 P1–P3 逐级批准（⑥验证门随 P1 落地）、生产部署（打版≠部署）。
3. 审查会话 6afe7ccb 已承载 R1+S4-R1+S4-R2 三条 user 消息（未达 4 条阈值），下一任务按换题先例评估迁移。
4. ST-05 终检与 DEC-111 绑定本提交，收口后工作区净、ahead=0。
