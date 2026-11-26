# 任务书：BMS 变更单收款重构（Er+F）迁移核对、退款返工与独立验收

- 任务ID：b-20261126-bms-change-recv-erf
- 日期：2026-11-26
- **版本选型：**
  - 选定版本：Standard（用户 2026-11-26 明确指示由 Basic 换轨）
  - 任务等级：S3（跨三仓基线核验、动态 dev 数据返工、独立 ChatGPT 验收与证据恢复）
  - 选型理由：需要 Standard 的 ST-01 绑定自动核验、ST-05 申报前检查、返工/止损和既有派单恢复资产；单任务 M1 交替推进，不启用 M2。
  - 批准人/日期：用户，2026-11-26（requirement.md 第三条原话）

## 需求原文（用户原话，不加工）

见 requirement.md。

## 执行者理解（与原文分开，便于对账）

- 唯一代码验收基线为 YotinGarden GitHub 新仓：service `a0789c1126b4df0258522b757a7ba842c4e7bc26`、UI `342791f9a649fec84b97916ac8232fd41573ff4c`、文档 `c2ca13738464645a05dcd044dae39cd45f62a32d`。
- 目标仓库/远程/工作目录：
  - `D:/YotinGarden/bms-service` / `https://github.com/YotinGarden/bms-service.git` / 从干净 commit 建隔离 worktree，master 上他人 WIP 不动。
  - `D:/YotinGarden/bms-ui` / `https://github.com/YotinGarden/bms-ui.git` / 原仓只读核验。
  - `D:/YotinGarden/bms-document` / `https://github.com/YotinGarden/bms-document.git` / 原仓只读核验，stash 不动。
  - AIEO 控制层仅登记任务、SHA、证据与派单，不承载业务代码。
- 先完成迁移影响与历史证据对账，再由 ChatGPT 复核退款负 E/负 F 符号问题及最小修正；获批后才在新 service 仓实施。
- 不扩范围：不重构大池子、不动报价公式、不做跨类型防重、不新增库表、不恢复 0929 等额校验、不改退款上限 a×r；生产发布/数据删除/main 合并须用户拍板。

## 验收目标（拍板时冻结；可观察结果）

- 三仓提交范围、parent/线性链和最终 SHA 经 ST-01 核验，功能文件迁移前后一致，他人 WIP 未混入。
- ChatGPT 对退款负 E/负 F 问题及候选修正给出可核查规划复审；获批修正仅落在变更收款实现文件。
- 修正后的退款首笔、多笔累计、超限拒绝、负 F 产品额和 regular/ecommerce 拆分均有真实 dev 请求/响应及 DB 只读证据；原已通过的正向边界不倒退。
- 每步经 ChatGPT 独立六查并绑定完整 commit、完整 diff 和测试证据；未完成 §7 项明确 BLOCKED，不伪报全量通过。
- 派单失败按 L-018 禁重发并补采；所有 reply 原始字节与 SHA256 归档，ST-05 自检及交付状态回写本任务夹。

## 优先级：高

## 任务状态（随进度更新）

| 字段 | 值 |
|---|---|
| 当前状态 | 验收中 |
| 当前步骤 | S2 R4：S2 独立验收 REJECT（问题2第3次，触发 L-019 止损）后两处 P0 已修复并提交 `8a745547eef28c7976753799a92aa13b0701c8cd`（parent=`3ac3ded3b5c5b252424c799f0496546a7589219f`，ST-01 PASS），待 codex 独立验收 |
| 最终结果 |  |

## 步骤清单（规划协商拍板后填写并冻结，未拍板留空不得动工）

1. S0 迁移范围、历史证据和 ST-01 绑定核验（已完成事实整理，待独立复核）。
2. S1 ChatGPT 规划复审退款负 E/负 F 问题与最小修正边界。
3. S2 获批后在新 service 干净 worktree 实施最小修正，编译并执行退款及正向动态回归。
4. S3 ChatGPT 独立验收；按结论返工或继续 §7 未完成的 AsOrder、进度款、凭证查重和前端场景。
5. S4 ST-05 终检、证据包/MANIFEST、delivery 与 decision-log 登记。

## 开工核对与经验防错

| 经验 | 本任务动作 |
|---|---|
| L-014 | 连接故障先查环境档案并跑 check-env/check-push，不再手工猜代理端口；受阻项挂起，其他核验继续 |
| L-017 | 申报锁定完整 40 位被测 SHA、完整 diff 与最终归档证据，ST-01 必跑 |
| L-018 | 派单发送与采集分离；采集 fail-closed 禁重发，按归属三件套静态补采 |
| L-019 | 同一问题累计返工；接近第三轮即停止常规整改，先三方会商再交用户 |
| ST-05 | 每次申报前运行 check_taskpack 并保存实际输出；缺口未处理不派单 |
| ST-03 | GitHub 不可读时采用 raw/附件 zip+MANIFEST，BLOCKED 不进入下一步 |
