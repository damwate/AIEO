# BMS 变更单收款 Er+F：迁移核对、已有验收证据与派单状态

日期：2026-11-26

## 1. 本次验收基线（唯一有效）

- `YotinGarden/bms-service`：`a0789c1126b4df0258522b757a7ba842c4e7bc26`
- `YotinGarden/bms-ui`：`342791f9a649fec84b97916ac8232fd41573ff4c`
- `YotinGarden/bms-document`：`c2ca13738464645a05dcd044dae39cd45f62a32d`
- 需求：`01_业务功能/04_变更与结算专题/05_变更收款金额控制需求文档_20261126.md` §7。
- 旧仓库 `d95e7c07` / `0188505` 仅用于历史实测参照，不再作为部署验收基线。

## 2. 迁移范围与影响核对

### 2.1 提交范围

- service 提交仅 7 个指定 Java 文件，+156/−37；UI 提交仅 3 个指定文件，+54/−18；文档迁移提交仅 05 一个文件。
- 新旧 service patch-id 均为 `8ef8cac77ab358541e971ff4326e8330e13fe397`。
- 新旧 UI patch-id 均为 `74e95c52d6effad0ee6ee19bdf3a05b4f0c8ad85`。
- 上述 7+3 个文件的新旧 Git blob SHA 逐一相同，迁移没有改写本次功能实现。
- 两提交 `git diff --check` 均通过。

### 2.2 rebase 相邻改动

- service `28611b52` 仅改 5 个 `application-prod.yml`；`4b96abd5` 改 `QuoteServiceImpl.getByScheme` 的有效报价选择及 `SchemeItem.xml`，未修改 Er+F 公式或收款分支。`getByScheme` 属共享读路径，最终回归仍应覆盖“最新有效报价读取”。
- UI `1a0742d6` 改报价预览相关 `CaseController`/VO/HTML，不触碰本次收款提交的文件。

### 2.3 工作区隔离

- `bms-service` 当前 7 个他人 WIP 文件未混入 `a0789c11`；其中 `ProjectController.java`、`ProjectServiceImpl.java` 与本次同名，**部署必须从干净 `a0789c11` worktree/archive 构建，禁止直接打包当前工作区**。
- `bms-ui` 工作区相对 `342791f9` 无改动；`bms-document` 工作区相对 `c2ca137` 无改动，`stash@{0}` 的 commission-audit WIP 保留未动。
- 旧路径启动的 8 个本机 dev JVM 已全部停止，未继续对旧基线执行写链路。

**迁移核对结论：提交内容本身未扩范围；主要部署风险是他人 WIP 混入，以及 rebase 后共享报价读取路径仍需回归。**

## 3. 已有本机 dev 实测（历史参照，不等同新基线最终验收）

测试使用旧路径但与新基线逐文件相同的实现，217 当时不可达，因此使用本机 dev 兜底。输入折扣采用现有隔离项目实际值，未伪报为矩阵示例的精确 0.9/1.2。

| 场景 | 单据/流程 | 实测结果 |
|---|---|---|
| 只读冒烟 | `bms_change_smoke_20261126_204045` | 11/11 PASS |
| 只读链路 | `bms_change_read_20261126_204055` | 5/6；唯一失败为旧用例 `data.0.id` 数据依赖，非 Er+F 断言 |
| r>1 + F、下限外拒绝 | 2158，E=560、F=2000、r=1.0389 | `changeAmount=2581.78`，下限=2560；实收 2558.99 拒绝，0 副作用 |
| 贴下限通过 | 2158 / 5188 | 实收 2559.00 通过；`amount=2581.78,totalAmount=2559,skuAmount=559` |
| r<1 整装 Er+F | 2159，r=0.9984 | T=2559.10；2558.09 拒绝，2558.10 通过；skuAmount=558.10 |
| 超收及大池子 | 2160 / 5190 | 实收 3000 最终完成；skuAmount=1000、paySkuAmount=2019.20；独立复算一致，本笔未重复入池、ratio 未截断 |
| 电商零售 Er | 2161 / 5191，r=0.9756 | T=546.34；545.33 拒绝，545.34 通过；regular=0、ecommerce=545.34 |
| 整装 NO_PAYMENT | 2162 / 5192 | `amount=559.10,totalAmount=0,skuAmount=559.10`，完成后现金流仍为 0 |
| 公司承担 ZERO | 2163 / 5193 | `changeAmount=0,totalAmount=0`，无虚假收款 |
| 退款多笔部分退款 | 2168 | **首笔 100 元即失败，未落库；R4 未通过** |

原始请求/响应、DB 只读核对、构建日志和 Eureka 证据保存在本任务夹 `evidence/` 与 `runtime/logs/`。

## 4. 新基线仍存在的重点问题（须优先复核）

新 `a0789c11` 的 `ChangeOrderServiceImpl.java` 仍包含以下实现：

1. `:459` 负 F 未取绝对值，部分退款时实收产品额符号/金额错误。
2. `:463` 负 E 使 `refundProductLimit=a×r` 为负数，累计正数必然超过负数上限，首笔退款即失败。
3. `:538` 仅在 E>0 时做 regular/ecommerce 拆分，负 E 被错误归入“E=0”分支。

旧 worktree 中留有仅用于诊断的 3 行候选修正（`nonProductAmount.abs()`、`refundProductLimit.abs()`、拆分条件 `!=0`），**未提交、未带入新仓库、未作为验收通过依据**。应由 ChatGPT 先独立复核业务口径和边界，再决定是否形成新仓库修复提交。

> **2026-11-26/27 处置（已闭环至待验收）：** 上述三处符号问题已经 S1 规划复审（R3 PASS）→ S2 实施修复（`3ac3ded3`）→ ChatGPT 独立验收（REJECT 两 P0）→ R4 修复（`8a745547`）处置完毕，待 codex 验收（handoff §15）。本节保留为问题发现时点的历史记录；候选 3 行修正从未提交，实际实施以独立验收后的 9 文件 diff 为准（见 §7/§8）。

## 5. 尚未完成的 §7 场景

- AsOrder 正向下限豁免。
- 后续进度款 E/F 释放。
- 企微凭证查重及本笔重复计入的完整链路。
- 前端实际浏览器提示、预校验和企微比对行。
- 新仓库干净 SHA 的部署及全套复测。

因此当前不能登记“§7 全部通过”或“可发布”。

## 6. ChatGPT 派单状态

**未发送，环境阻塞。**

- 已读取 chatgpt-web-dispatch skill 和完整 EGO-LITE-HANDBOOK。
- agent-kit 位于 `D:/CommonProjects/agent-kit`，开工更新时先遇 `127.0.0.1:6822` 代理连接失败；直连后当前分支无 upstream，随后 fetch 又出现 `Recv failure: Connection was reset`，未能完成更新，故未运行 deploy.ps1。
- 本机未找到 `ego-browser` 可执行文件。
- 本机缺少 `C:/Users/youting/.agents/ego-profile.json`，无法执行账号钉扎。按 skill 的 `ACCOUNT_CONFIG_MISSING_STOP` 规则停止，不猜账号、不改走非授权通道。

恢复条件：安装/恢复 ego-browser，并按本机真实 ChatGPT Plus profile 配置 `ego-profile.json` 的 `defaultProfileId/defaultAccount` 后，再执行 `ego-browser skill`、账号校验、GitHub handoff、`send-new` 与受管 `watch`。

> **2026-11-26 更新：** §6 所述 ego-browser 阻塞已按用户指示换用 AIEO Standard 派单链解决——命名实例 `bms-erf`（独立 profile `gpt-poc-bms-erf` / 端口 9303）。S1-R3 规划、S2-R3 实施与 16-02-15 独立验收均经 `phase0/tools/gpt_dispatch.mjs --instance bms-erf` 发送并归档 reply；§6 保留作历史记录。

## 7. S2 独立验收裁定（2026-11-26，整体 REJECT）

- 派单：dispatch-2026-11-26T16-02-15，附件 `r3-review-pack.zip`（sha256=`128c1f0c29b013c1e387aadd7cd71ca749e6c238cd0c99b67b4b12e5b1606fdf`），被测 commit=`3ac3ded3b5c5b252424c799f0496546a7589219f`。
- reply 原文：`D:/AIEO/phase0/logs/dispatch-2026-11-26T16-02-15/reply.txt`（sha256=`7f9bc3e5dd614cfef63f803fc9fa8b197a445eddc1e86fa25adf8f39c1bbeb11`，与派单日志 artifact_sha256 一致）。
- 六项裁定：
  - 多笔 F 分摊 **PASS**：实际顺序 100→600→292.67→600 与 F=-500、产品退款上限 1092.67 的分摊吻合，产品退款累计 0→200→492.67→1092.67。
  - 事务行锁 **PASS**（边界）：`@Transactional` + `SELECT id FROM project_info WHERE id=? FOR UPDATE` 结构正确，锁内无远程调用；并发压力测试与同数据源证明未覆盖。
  - 负向幂等 **PASS**（源码）：Confirmed+负额即返回，位于报价检查后、原状态校验前；缺重复调用动态日志。
  - 业务额分离 **REJECT（P0）**：写入分离正确，但 `getChangeBusinessAmount()` 用 `selectById(record.getId())` 把 costRecord 主键当 Flow 主键（实测 8234→5194 两 ID 不同；真实关联为 `object_id`+`object_type`）。后续部分退款回退完整 T 会再次累计，破坏 R3 去重；还可能误读同 ID 其他业务 Flow。
  - PM 实收保持 **REJECT（P0）**：`payDate==null` 为独立 OR，flow.amount=0 + payAmount 非零 + payDate=null 仍会把真实实收清零；5197 动态样本通过不能证明所有实收安全。
  - 0.01 超限无新增 **PASS**；附带建议：超限返回 INTERNAL_SERVER_ERROR 而非业务参数错误，建议核查 BIM 异常包装（非阻断）。
- 证据边界：`build-new-service-refund-r3.log` 0 字节不能作编译证据；commit 未推送（GitHub API 422）无法远端核验——*该两项为验收时点事实，r4 已补真实编译日志且分支已推送（§8）*；项目 1652 混合数据（含 5195 旧流程 T 与 5196 旧 PM 数据）不能证明 otherPrice 从干净基线只应用一次 T。

## 8. R4 修复与 codex 交接（2026-11-27）

- 两处 P0 已修复并提交 `8a745547eef28c7976753799a92aa13b0701c8cd`（parent=`3ac3ded3b5c5b252424c799f0496546a7589219f`，仅 `ApprovalFlowServiceImpl.java` 1 文件 +13/−3，ST-01 PASS=`evidence/st01-r4-fix.json`）；修改明细见 steps.md「S2 R4」。
- 编译证据补齐：`evidence/build-service-refund-r4.log`（4766 字节，mvn BUILD SUCCESS，Reactor Summary 可核）；jar 指纹=`evidence/r4-jar-sha256.txt`（bim.jar 与 r3 相同，project.jar r4 构建）。
- 问题2 返工计数=3，触发 L-019 止损；停止对 ChatGPT 的常规返工循环、修复后提交、验收人变更为 codex，均为用户 2026-11-27 拍板。
- codex 验收须补两组干净动态证据（reply 明确要求）：①干净合同基线多笔退款，证明 otherPrice 与大池子 addAmount 各只应用一次 T、后续为 0；②flow.amount=0、payAmount 非零、payDate=null 的 PM 场景，证明真实实收不被清零。须知：5195/5196 为历史测试数据（r3-review-summary 已标注）不得当干净断言；此前干净基线尝试因 Sku 3100050 存量 0 阻塞（`evidence/scenario-refund-r3-clean-prepare.json`），需先补存量或换新合同数据。
- 其余 §7 场景（AsOrder、进度款释放、企微凭证查重、浏览器实测、F=0/E=0/r>1）仍不在本次 PASS 范围。
