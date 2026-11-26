# 过程记录 b-20261126-bms-change-recv-erf

## 规划状态

当前为 Standard 换轨后的规划协商阶段。S2 退款代码修正在 ChatGPT 复审通过前不得动工；旧诊断 worktree 的 3 行候选修改仅作问题证据，不属新仓实施。

## 开工事实

- 已通读 Standard WORKFLOW、继承的 Basic 六模块、AI-DEV-LESSONS L-014/L-017/L-018/L-019 和环境盘点 §4/§5。
- Standard 环境预检=`evidence/standard-check-env.log`：Node/Git/gpt_dispatch/inbound_dom/Playwright/session lock/Chrome profile 均存在；CDP 9222 未启动为工具按需拉起正常态；6822 无监听。
- 新旧功能文件 Git blob 与 patch-id 一致；service 7 个 WIP 文件和文档 stash 未触碰。旧路径本机 dev JVM 已全部停止。
- ST-01 初次 FAIL 原因为申报使用短 SHA；改用完整 40 位后三仓 PASS，不隐瞒初次失败记录。

## S0 迁移范围、历史证据与绑定核验

①本步骤目标：确认新仓基线唯一、提交未扩范围、已有实测证据可追踪，并识别退款阻断。

②修改文件：AIEO 任务夹 `handoff.md`、`acceptance-review-20261126.md`、`requirement.md`、`task-brief.md`、`steps.md`、`evidence/`；业务仓文件未在本步骤修改。

③修改内容：基线 service=`28611b52d4f7dc5290c9a1692a88a076f468fead`、目标=`a0789c1126b4df0258522b757a7ba842c4e7bc26`；UI 基线=`1a0742d6caa1471473dd8c917543df43e282f1b5`、目标=`342791f9a649fec84b97916ac8232fd41573ff4c`；文档基线=`d347e32c2eefa3c62247b6599240d1bc025048d3`、目标=`c2ca13738464645a05dcd044dae39cd45f62a32d`。

④执行结果：7+3 个功能文件新旧 blob 全部相同；三仓 ST-01 PASS；新 service 的退款负 E/负 F 问题确认仍存在；§7 不能登记全量通过。

⑤测试结果：`node toolkit/check-env.mjs` 完成且关键依赖全部 OK；三份 `toolkit/check-binding.py` 均 verdict=PASS。历史动态结果见 acceptance-review：正向/超收/NO_PAYMENT/ZERO 有证据，退款 2168 首笔失败；AsOrder、进度款、凭证查重和浏览器实测未完成。

⑥验收证据引用：验收结论：PASS（迁移范围与绑定项；dispatch-2026-11-26T13-45-22，reply sha256=`533c19306d81de19874059ed5222baa0104f6f0aea76d149ec36c3b87dab70e2`，ChatGPT 已核实 baseline/target、提交数与目标文件）。退款缺陷单列为 S1 问题1，不影响 S0 迁移事实。证据包内路径=`evidence/st01-service.json`、`evidence/st01-ui.json`、`evidence/st01-document.json`、`acceptance-review-20261126.md`。

## S1 退款修正方案规划协商

①本步骤目标：由 ChatGPT 独立复核负 E/负 F 根因、R4 口径及候选 3 行修正，冻结实施与验证矩阵。

②修改文件：规划简报、phase0 dispatch/recoll 证据、steps.md。

③修改内容：待 ChatGPT 回复后登记；当前不得预设 PASS 或写业务代码。

④执行结果：**S1-R1=REJECT（暂不实施）**。ChatGPT 认可三处符号根因，但指出多笔退款会重复抵扣完整 F，要求先确定历史现金来源；未据此修改业务代码。

⑤测试结果：已有负例=变更单 2168、实退 100 元失败且未落库；ChatGPT 给出动态序列 100→600→600，要求产品退款累计依次为 0→200→800，另需覆盖 1092.67 临界、1092.68 超限、E=0/F=0/r>1/负 paidAmount。

⑥验收证据引用：验收结论：PASS（S1-R3 规划通过；dispatch-2026-11-26T14-05-50，reply sha256=`7e0efa0120d52e3085021df169e2051bd1e3539cdc7e8ad0240d545ac67287e8`）。R1/R2 的 REJECT 与返工记录保留；R3 明确 8 文件、真实行锁、成功状态、审批中拦截和动态矩阵，允许进入 S2。

### S1-R2 补充裁定与第 2 次返工

- R2=REJECT（dispatch-2026-11-26T13-57-50，reply sha256=`927dba7d6220fb8d0bac6613137113ecdaa211a621081da9e1fc42a69b1f5931`）。只读累计现金方向获认可，但需补：①仅 completed=99 的退款业务类型记录计入成功退款；②同一 recordId 的并发控制。
- R3=**PASS**（dispatch-2026-11-26T14-05-50，reply sha256=`7e0efa0120d52e3085021df169e2051bd1e3539cdc7e8ad0240d545ac67287e8`）：200/205/300 类型、真实 `SELECT ... FOR UPDATE`、锁内检查、NULL 状态按活跃、快照非空、失败闭锁和锁内禁止远程调用均成为实施硬约束。
- 问题1返工计数=2；第 3 次方案若仍不能通过，将按 Standard 停止常规返工并进入三方会商，不盲目续轮。

## 返工记录

| 问题编号 | 触发验收 | 根因 | 次数 | 修复 commit | 当前处置 |
|---|---|---|---|---|---|
| 问题1：多笔退款重复抵扣 F | S1-R1 REJECT（上述 reply SHA） | 本笔计算只使用完整 F，无历史退款现金来源，导致多笔非产品费用重复抵扣 | 1 | `e60d072b5df08e5b92d44fd15728de05ebe75bd1`（R2 规划修订，非业务代码实施） | S1-R2 规划 project 只读累计现金接口 + BIM 剩余 F 分摊；未实施 |
| 问题1：多笔退款重复抵扣 F | S1-R2 REJECT（dispatch-2026-11-26T13-57-50，reply sha256=`927dba7d6220fb8d0bac6613137113ecdaa211a621081da9e1fc42a69b1f5931`） | 历史必须仅计成功退款；跨服务先读后写及审批中重复退款存在竞态 | 2 | `e60d072b5df08e5b92d44fd15728de05ebe75bd1`（R2 规划修订，非业务代码实施） | S1-R3 补 completed 状态、审批中拦截、project 主键行锁与现金快照复核；未实施 |
| 问题2：多笔退款完成与业务额重复应用 | S2-R1/R2 REJECT（dispatch-2026-11-26T14-44-32 / 14-50-13） | 负向确认非幂等；审计额、审批应用额及大池子消费口径需分离，不能用 recordId 猜首次退款 | 2 | 问题2 R3 规划修订 commit 待登记 | R3=PASS：负向幂等 + flowBusinessAmount + calcIncomeSkuAmountNew 改读 Flow.amount，实施中 |

## S2 R3 实施与动态回归

①本步骤目标：按 S1-R3 PASS 在干净 worktree 完成 8 文件退款修正，并跑通逐笔审批动态矩阵。

②修改文件：bim manager `ProjectService`、fallback、`ProjectCostFlowParam`、`ChangeOrderServiceImpl`；project `ProjectController`、api param、`ProjectService`、`ProjectServiceImpl`。当前仍为未提交 diff，业务 commit 待动态与独立验收后形成。

③修改内容：负 F 剩余额分摊、退款上限取绝对值、E!=0 拆分、成功退款现金只读接口、历史现金快照参数、project 主键行锁与审批中拦截。首次编译因 fallback 缺 `throws SystemException` 失败，修正后 service/UI package 均 PASS。

④执行结果：问题2 R3 方案 PASS，最终按 9 文件实施：R3 的 8 文件 + `ApprovalFlowServiceImpl`。首笔 100 已完成，第二笔 600 已正确落库（total=-600、sku=-200）；第二笔完成曾触发负向确认状态错误，现增加负向幂等、flowBusinessAmount 分离及大池子读取 Flow.amount，待重编译后从第二笔财务续验。

⑤测试结果：service/UI 首次 package PASS；R3 动态已证实金额计算与 F-only 累计正确。业务额去重、第二至第四笔完成、第五笔超限及合同/大池子副作用仍待动态复核，未提前标 PASS。

⑥验收证据引用：IN_PROGRESS（问题2 R3 规划 PASS：dispatch-2026-11-26T14-54-50，reply sha256=`387d1a607fd8f85fcd648bf9ad0223e791cbc512173911e466db06ad711b2acf`；动态证据=`evidence/refund-r3-dynamic*.json` 和 `runtime/logs/refund-r3-dynamic*.log`；最终 commit、独立验收与 reply SHA 待形成）。
