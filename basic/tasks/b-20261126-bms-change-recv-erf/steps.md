# 过程记录 b-20261126-bms-change-recv-erf

## 规划状态

当前为 S2 R4：S2 独立验收 **REJECT**（问题2第3次）后，已按用户 2026-11-27 指示完成两处 P0 修复并提交（`8a745547eef28c7976753799a92aa13b0701c8cd`，ST-01 PASS），待 codex 验收。验收人由 ChatGPT 变更为 codex 系用户拍板（触发 L-019 止损后的处置）。

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
| 问题2：多笔退款完成与业务额重复应用 | S2-R1/R2 REJECT（dispatch-2026-11-26T14-44-32 / 14-50-13） | 负向确认非幂等；审计额、审批应用额及大池子消费口径需分离，不能用 recordId 猜首次退款 | 2 | `cec4b280607a9467991ddea6102b98fa98b9f6d6`（问题2 R3 规划修订，非业务代码实施） | R3=PASS：负向幂等 + flowBusinessAmount + calcIncomeSkuAmountNew 改读 Flow.amount，实施中 |
| 问题2：多笔退款完成与业务额重复应用 | S2 独立验收 REJECT（dispatch-2026-11-26T16-02-15，reply sha256=`7f9bc3e5dd614cfef63f803fc9fa8b197a445eddc1e86fa25adf8f39c1bbeb11`） | 两处 P0 实现缺陷：①`getChangeBusinessAmount()` 用 `selectById(record.getId())` 把 costRecord 主键当 Flow 主键，后续退款回退完整 T 破坏业务额去重；②PM 完成条件 `payDate==null` 为独立 OR，flow.amount=0 且 payAmount 非零时仍清零真实实收 | 3 | `8a745547eef28c7976753799a92aa13b0701c8cd`（业务代码修复，1 文件 +13/−3） | 触发 L-019 止损，停止对 ChatGPT 的常规返工循环；按用户 2026-11-27 指示修复提交后改交接 codex 验收 |

## S2 R3 实施与动态回归

①本步骤目标：按 S1-R3 PASS 在干净 worktree 完成 8 文件退款修正，并跑通逐笔审批动态矩阵。

②修改文件：9 文件，独立分支 `task/bms-change-recv-erf-refund`，被测 commit=`3ac3ded3b5c5b252424c799f0496546a7589219f`，parent=`a0789c1126b4df0258522b757a7ba842c4e7bc26`；ST-01 PASS。

③修改内容：负 F 剩余额分摊、退款上限取绝对值、E!=0 拆分、成功退款现金只读接口、历史现金快照、project 主键行锁与审批中拦截；负向 Confirmed 幂等；costRecord/flow 业务额分离；calcIncomeSkuAmountNew 改读 Flow.amount；PM 保留真实 payAmount，零实收才直接完成。完整 diff=`evidence/service-refund-r3-full.diff`。

④执行结果：最终业务 commit 已形成，未推送。动态矩阵完成：100、600、292.67、600 四笔均到 99，产品退款累计 0→200→492.67→1092.67；最后 0.01 超限拒绝且无新增。最后 600 为 `flow.amount=0 / payAmount=-600`，未再被 PM 清零。旧第二笔全额 flow.amount 与第三笔 PM 修复前直接完成均单独标为历史测试数据，不冒充干净合同断言。

⑤测试结果：service/UI package PASS；ST-01 R1/R2/R4 PASS；动态退款金额、F-only 累计、负向幂等、后续业务额和超限断言通过。其他 §7 场景（AsOrder、进度款、凭证查重、浏览器及 F=0/E=0/r>1 补充边界）仍未完成。

⑥验收证据引用：S2 独立验收=**REJECT**（问题2第3次；dispatch-2026-11-26T16-02-15，reply sha256=`7f9bc3e5dd614cfef63f803fc9fa8b197a445eddc1e86fa25adf8f39c1bbeb11`）：多笔F分摊/事务行锁/负向幂等/0.01超限四项 PASS；业务额分离、PM实收两项 P0 REJECT，修复见下节 S2 R4。动态最终证据=`evidence/refund-r3-dynamic-final7.json`、`evidence/refund-r3-final-flow-records.json`；ST-01=`evidence/st01-service-r3.json`。

### S2-R4 独立验收 REJECT 两处 P0 修复（L-019 止损后按用户指示路径）

①本步骤目标：修复 S2 独立验收（问题2第3次 REJECT）裁定的两处 P0——历史 Flow 关联查询错误、PM 零完成可清零真实实收。

②修改文件：`service-project/src/main/java/com/ecog/service/project/service/impl/ApprovalFlowServiceImpl.java` 1 文件（+13/−3），commit=`8a745547eef28c7976753799a92aa13b0701c8cd`，parent=`3ac3ded3b5c5b252424c799f0496546a7589219f`；ST-01 PASS（`evidence/st01-r4-fix.json`，R1/R2/R4 均 PASS）。

③修改内容：
- P0-1 `getChangeBusinessAmount()`：由错误的 `new ProjectApprovalFlow().selectById(record.getId())`（把 costRecord 主键当 Flow 主键）改为 `object_id=record.getId()` + `object_type=ChangeOrderFlow` 查询（与创建侧 `flow.setObjectId(costRecord.getId())` 真实关联一致）；`selectList` 显式校验唯一性，>1 条抛异常 fail-closed；Flow 存在但 amount 为空仍 fail-closed；仅"确实查不到 Flow"（旧数据）才回退 `record.getAmount()`，不再把"主键查不到"误当"旧数据没有 Flow"。
- P0-2 PM 完成条件：由 `payDate==null || (amount==0 && zeroCash)` 改为 `zeroCashAmount && (payDate==null || zeroBusinessAmount)`——仅"无真实实收"（payAmount 空/0）才按零现金直接完成；非零 payAmount 一律保留并进财务审核，payDate 为空不再能覆盖实收；`flow.getAmount()` 判空防 NPE。AsOrderFlow 同分支一并受保护。

④执行结果：commit 已形成于 `task/bms-change-recv-erf-refund`，未推送、未合并 master、未发布。`mvn -pl service-project -am package -DskipTests` **BUILD SUCCESS**，真实日志=`evidence/build-service-refund-r4.log`（4766 字节，含 Reactor Summary 与 BUILD SUCCESS，补齐上一轮 0 字节日志缺陷）。累计 diff 仍为同一批 9 文件（+196/−23）=`evidence/service-refund-r4-full.diff`（sha256=`3c3f47e45d13e0611efa36459ef3c2b74658a8c37d42be6f2844cd1e939e2e1c`）。

⑤测试结果：编译打包 PASS；ST-01 PASS。service-bim 源码本轮未动（bim.jar sha256 与 r3 构建相同=`c5b75eb63cf4557072c32599b92f989f2969538c3fb2bed82abb9098cce83e0a`），project.jar r4 构建=`ec62907b5fe34b2ef9c0a51d2dfbc70930811ed755b545dc7120f0b49ba6fa65`（`evidence/r4-jar-sha256.txt`）。动态回归本轮未重跑：验收方要求的两笔干净动态证据（干净基线多笔退款证明 otherPrice/addAmount 各只应用一次 T；flow.amount=0 + payAmount 非零 + payDate=null 的 PM 场景证明真实实收不清零）移交 codex 验收执行；此前干净基线尝试受 Sku 3100050 存量 0 阻塞的事实已在验收评审登记，codex 需先解决存量或改用新合同数据。

⑥验收证据引用：待 codex 验收（用户 2026-11-27 指示，交接材料=handoff.md §15）。S2 独立验收（问题2第3次 REJECT）reply 原文=`D:/AIEO/phase0/logs/dispatch-2026-11-26T16-02-15/reply.txt`（sha256=`7f9bc3e5dd614cfef63f803fc9fa8b197a445eddc1e86fa25adf8f39c1bbeb11`，artifact_sha256 与派单日志一致）。
