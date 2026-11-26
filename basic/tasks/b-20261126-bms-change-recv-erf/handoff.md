# 会话交接包：BMS 变更单收款重构（Er+F）→ codex 验收

**生成时间：** 2026-11-26  **生成者：** ZCode 开发会话
**性质：** 事实（附证据）／决策（注明版本）／待确认——逐条标注

## 1. 目标与阶段

变更单收款从"金额写死"重构为"实收下限 = 理论变更金额 Er+F"（覆盖收款额→实收产品额→大池子→提成影响链）。当前阶段：**代码已提交，待部署回归验收**。

**任务版本选型：** Basic（S2——需求已定稿、改动已实施、剩余为验收执行）；批准人/日期：用户 2026-11-26。

## 2. 仓库与基线（事实）

**验收基线为 YotinGarden GitHub 新仓库**（2026-11-26 迁移；老仓库 `D:/javacode/yotin`（gitee）上的同名推送 `d95e7c07`/`0188505` 已作废，勿以老仓库为验收对象）：

- service：`D:/YotinGarden/bms-service` `master` @ `a0789c11`（feat(project): 变更单收款金额控制重构，7 文件 +156/−37）——**已推送 GitHub**（28611b52..a0789c11）
- 前端：`D:/YotinGarden/bms-ui` `master` @ `342791f9`（feat(bms): 变更单收款页实收下限Er+F前端校验与提示，3 文件 +54/−18）——**已推送 GitHub**（1a0742d6..342791f9）
- 文档：`D:/YotinGarden/bms-document` `master` @ `c2ca137`（02 §3.3 / 03 §5.1 / 05 全套；05 §8.3 已登记上述代码 SHA 与迁移记录）
- 新仓库工作区残留他人 WIP（bms-service 7 文件"客户转设计师"、bms-document stash@{0} commission-audit），**不属本任务，勿动勿提交**
- 首要文件=需求文档：`D:/YotinGarden/bms-document/01_业务功能/04_变更与结算专题/05_变更收款金额控制需求文档_20261126.md`（v3 定稿，含口径沿革/规则 R1-R10/实施位置/验收矩阵 §7/完成状态 §8.3）

## 3. 已完成事项（事实）

1. 需求文档 v3 定稿（用户三次口径修正 + ChatGPT R9 裁定，reply sha256 `c84c8d75a10b3196…`，`D:/AIEO/phase0/logs/dispatch-2026-11-26T11-32-13/reply.txt`）
2. 三处代码：service-bim `ChangeOrderServiceImpl.addChangeOrderCostFlow`（权威下限 `实收+1 ≥ min(changeAmount, E+F)`，排除 AsOrder）；bms-ui `list_set` 预校验 + `receivables` 提示/比对行（commit 见 §2；两仓库均 rebase 到远端最新 quote-preview 系列之后）
3. 编译：两仓库 `mvn -q -DskipTests compile` PASS
4. 文档同步：02 §3.3、03 §5.1、05 全套

## 4. 未完成事项（事实）

- 部署后按 05 §7 验收矩阵实测（13 场景：电商/整装/超折扣/贴下限/超收/售后/退款/凭证查重等）——**全部未开始，这是本次交接的验收范围**
- R8 提出的 13 个大池子场景与 05 §7 矩阵重叠部分一并回归

## 5. 架构决策（决策）

- 下限=Er+F 通式（E=skuPrice+retailSkuPrice，F=addition+design+freight，与 changeAmount 同口径）；电商 F=0 退化为 Er（出处：05 §3/§4，用户 2026-11-26）
- D1：r>1 封顶仅作用校验侧 `min(changeAmount,E+F)`，**存储 changeAmount 保持 Er+F**（05 §8.1，用户已批准）
- AsOrder 不适用正向下限（R9 Q4）；售后单不弹收款页（`saveAndConfirmByAsOrder` 独立路径），前端无需排除，后端兜底
- 不变项：大池子 calcIncomeSkuAmountNew 不重构、退款累计上限 a×r、强收只拦 none、凭证查重、0929 等额校验不恢复（05 §8.2）

## 6. 模块契约（决策）

无新契约；落库矩阵见 02 §3.3.2（amount=业务额/totalAmount=现金流/skuAmount=产品额）。

## 7. 测试环境与已知约束（事实）

- 测试机 192.168.0.217（mstsc yotin/yotin@666），dev MySQL 47.96.67.90:8306；联调指南 `D:/YotinGarden/bms-document/00_系统基础/05_测试环境联调指南.md`
- 潜伏缺陷登记（非本任务）：`QuoteServiceImpl.quoteNew:497` 购销分支 changeAmount 漏 retailSkuPrice，生效路径均被重算覆盖，可选防御性修复（05 §3）

## 8. 历史审查结论（事实）

R7（7ea5f57d…最小清单）→ R8（65ac56e8…大池子复核）→ R9（c84c8d75…六问裁定），证据 `D:/AIEO/phase0/logs/dispatch-2026-11-26T*/reply.txt`。

## 9. 已知风险（事实 + 待确认）

- 变更收款与进度款对同一笔钱重复释放大池子：无技术兜底，靠业务流程（历史遗留，另立任务）
- 整装超收 ratio>1：R9 裁定不截断；实施时复核 calcIncomeSkuAmountNew 本笔入 F 时点（R8 已核不重复计入）

## 10. 测试命令与结果（事实）

`cd D:/YotinGarden/bms-service && mvn -q -DskipTests compile` → exit 0；`cd D:/YotinGarden/bms-ui && mvn -q -DskipTests compile` → exit 0（2026-11-26，迁移后内容与 a0789c11/342791f9 提交一致）。

## 11. 下一步（计划）

1. 部署 217 测试环境（`D:/YotinGarden/bms-service` 构建 service-bim/service-project jar + `D:/YotinGarden/bms-ui` 构建 bms jar，基线 SHA 见 §2）
2. 按 05 §7 矩阵逐场景实测，结论登记回本任务夹
3. 发现偏差：小偏差直接修+commit；口径级偏差 STOP 报用户

## 12. 禁止事项（决策）

不扩范围（05 §8.2）：不重构大池子、不动报价公式、不做跨类型防重、不新增库表、不恢复 0929 等额校验、不改退款上限 a×r；生产发布/数据操作须用户拍板。

## 13. 待确认事项（待确认）

无——口径已全部定稿（用户 2026-11-26 批准 D1 与验收范围）。

## 14. 2026-11-26 接管后补充（事实）

- 新三仓库基线及迁移影响已核对：7+3 个功能文件新旧 Git blob 逐一相同，patch-id 相同，提交未混入他人 WIP；部署仍须使用干净 `a0789c11`，避免 service 工作区 WIP 被打包。
- 旧路径本机 dev 的部分实测已完成，正向 Er+F、超收大池子、NO_PAYMENT、ZERO 等有证据；退款场景发现负 E/负 F 符号问题，新 `a0789c11` 同样存在，不能登记 §7 全通过。
- 详细证据索引与未完成项见同目录 `acceptance-review-20261126.md`。
- ChatGPT 派单因本机缺 `ego-browser` 及 `~/.agents/ego-profile.json` 按工作流 fail-closed 停止，**尚未发送**；旧路径本机服务已全部停止。
- 2026-11-26 后续：ego-browser 阻塞按用户指示换用 AIEO Standard 派单链（命名实例 `bms-erf`）解决，ChatGPT 规划复审、实施复核与独立验收均已完成并归档 reply。

## 15. 2026-11-27 S2 独立验收 REJECT 与 R4 修复——交接 codex 验收

**验收人变更（用户决策）：** 由 ChatGPT 变更为 codex。问题2 返工计数=3 触发 L-019 止损后，用户 2026-11-27 拍板：修复两处 P0 → 提交代码与文档 → 交接 codex 验收。

**当前被测（事实）：**

- worktree：`D:/YotinGarden/.worktrees/bms-change-recv-erf-service`（干净隔离 worktree，分支 `task/bms-change-recv-erf-refund`，未推送）
- 被测 commit=`8a745547eef28c7976753799a92aa13b0701c8cd`（parent=`3ac3ded3b5c5b252424c799f0496546a7589219f`；相对迁移基线 `a0789c1126b4df0258522b757a7ba842c4e7bc26` 累计仍为 9 文件 +196/−23）
- ST-01 PASS=`evidence/st01-r4-fix.json`；累计 diff=`evidence/service-refund-r4-full.diff`（sha256=`3c3f47e45d13e0611efa36459ef3c2b74658a8c37d42be6f2844cd1e939e2e1c`）
- 真实编译日志=`evidence/build-service-refund-r4.log`（mvn BUILD SUCCESS，4766 字节）；jar 指纹=`evidence/r4-jar-sha256.txt`（bim.jar 与 r3 构建相同，project.jar 为 r4 构建）
- 远端核验说明：commit 未推送（推送须用户批准），GitHub API 对本地 SHA 返回 422 属预期；请以本地 worktree/diff 为审查对象。

**上一轮独立验收（REJECT，供对照）：** reply=`D:/AIEO/phase0/logs/dispatch-2026-11-26T16-02-15/reply.txt`（sha256=`7f9bc3e5dd614cfef63f803fc9fa8b197a445eddc1e86fa25adf8f39c1bbeb11`）。六项中多笔F分摊、事务行锁、负向幂等、0.01超限无新增 PASS；业务额分离、PM实收两项 P0 REJECT（详见 `acceptance-review-20261126.md` §7）。

**R4 已修两处 P0（`ApprovalFlowServiceImpl.java`）：**

1. `getChangeBusinessAmount()`：`selectById(record.getId())`（主键误当 Flow 主键）→ 按 `object_id=record.getId()` + `object_type=ChangeOrderFlow` 查询；`selectList` 显式校验唯一性，>1 条抛异常 fail-closed；Flow 存在但 amount 为空 fail-closed；仅确实查不到 Flow（旧数据）才回退 `record.getAmount()`。
2. PM 完成条件：`payDate==null || (amount==0 && zeroCash)` → `zeroCashAmount && (payDate==null || zeroBusinessAmount)`：仅"无真实实收"按零现金直接完成；非零 payAmount 一律保留并进财务审核；`flow.getAmount()` 判空防 NPE；AsOrderFlow 同分支一并受保护。

**codex 验收范围（至少）：**

1. 源码审查 commit `8a745547`：两处 P0 修复是否满足 reply 要求（真实关联+类型过滤+唯一性+旧数据回退保留；payDate 为空不得覆盖非零实收、无实收零金额流程才可零现金完成）。
2. 补两组干净动态证据（reply 明确要求）：①干净合同基线执行多笔退款，证明合同 otherPrice 与大池子 addAmount 各只应用一次 T、后续为 0；②构造 flow.amount=0、payAmount 非零、payDate=null 的 PM 审批场景，证明真实实收不被清零。
3. 数据须知：项目 1652 的 flow 5195/5196 为历史测试数据（`evidence/r3-review-pack/r3-review-summary.md` 已标注），不得当干净合同断言；此前干净基线尝试因 Sku 3100050 存量 0 阻塞（`evidence/scenario-refund-r3-clean-prepare.json`），需先补存量或换新合同数据。
4. 可选补强（reply 证据边界）：同一负向变更单重复确认的动态日志；同项目并发双退款压力测试；0.01 超限返回 INTERNAL_SERVER_ERROR 的异常包装核查（reply 建议项，非阻断）。
5. 范围外（勿混判）：AsOrder 正向下限豁免、进度款 E/F 释放、企微凭证查重、浏览器实测、F=0/E=0/r>1 边界与 §7 全量复测不在本次 PASS 范围。

**运行环境（事实）：** 本机 dev 服务已停；dev MySQL `47.96.67.90:8306`（只读口令经 `DEV_DB_PASSWORD` 环境变量传入，禁写入任何脚本/Git）；动态回归脚本=`runtime/refund_r3_regression.py`（含 RESUME_STAGE 续跑说明）、BMS 登录/提交辅助=`runtime/bms_client.py` 等；217 部署步骤见 §11。

**结论登记：** 验收结论回写本任务夹（`acceptance-review-20261126.md`、`steps.md`、`task-brief.md` 状态表）；PASS 方可进入 S3（§7 其余场景）与 S4（ST-05 终检/delivery/decision-log）。

**禁止事项不变（§12 + §2）：** 不重构大池子、不动报价公式、不做跨类型防重、不新增库表、不恢复 0929 等额校验、不改退款上限 a×r；生产发布/数据操作/main 合并/推送远端须用户拍板；他人 WIP（`D:/YotinGarden/bms-service` 工作区 7 文件、`bms-document` stash@{0}）勿动勿提交；部署构建必须从干净 worktree/commit 出，禁止打包主仓工作区。
