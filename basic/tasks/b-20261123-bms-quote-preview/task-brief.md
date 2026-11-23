# 任务书：BMS 报价预览优化（Standard 第二次试运行 T1）

- 任务ID：b-20261123-bms-quote-preview
- 日期：2026-11-23
- **版本选型：**
  - 选定版本：Standard
  - 任务等级：S2
  - 选型理由：承接 2026-11-20 BMS-QUOTE-PREVIEW-R1/R2 两轮 ChatGPT 裁定（方案级 PASS，未授权实施）；本轮为真实页面代码盘点+方案落地核对，只读分析风险可控；M2 受控并行 T1（2 任务上限内）。
  - 批准人/日期：用户指令（2026-11-23 原话见 requirement.md）

## 需求原文

见 requirement.md（不加工）。

## 执行者理解（与原文分开，便于对账）

1. "接之前的工作"=接 R1/R2 两轮裁定：R2-A（页面展示层，导出打印不动）为本轮核对重点；R2-B（导出打印统一改造）不在本轮范围。
2. 本地分析对象=`D:\YotinGarden\bms-ui` 的 `src/main/resources/static/views/saleOrder/scheme_detail_preview_v2.html` 及关联 DTO/接口/导出入口；核对 R1 S1（字段来源表/页面入口表/是否需后端改动）是否落地。
3. 本轮不改目标项目代码；产出=代码级现状证据 + 对 R1/R2 裁定的落地符合性核对 + 实施就绪方案（含验收点 A01–A10/B01–B06）。

## 验收目标

- 四个业务区域/三个报价入口的页面证据（文件:行号）；
- 整装行 skuPrice/artificialPrice 的 DTO 定义与赋值证据；spec/skuSpecs 与 pcs 的全部出现位置；
- 打印/导出/含重量导出的入口与模板清单，确认 R2-A"导出打印不动"的边界；
- ChatGPT 讨论 reply 归档（原始字节+SHA256），方案与裁定一致性核对结论。

## 分析对象与基线

- 目标仓库：`D:\YotinGarden\bms-ui`（master），基线 `cf79e4c2d2b78ec6f27bbc0c76a8c274f5ca0d36`（只读，2026-11-23 实查）。
- 页面：`src/main/resources/static/views/saleOrder/scheme_detail_preview_v2.html`（105.9 KB）。
- 前序裁定：`phase0/logs/dispatch-2026-11-20T04-20-30/reply.txt`、`dispatch-2026-11-20T05-49-11/reply.txt`。

## M2 并行登记

- 并行模式：M2 受控并行（任务级并行 + 派单通道 FIFO 串行）；T1/T2 两仓独立、互不依赖。
- 基线 SHA：BMS=`cf79e4c2d2b78ec6f27bbc0c76a8c274f5ca0d36`（只读）。
- 文件所有权：只写 `basic/tasks/b-20261123-bms-quote-preview/` 与自身派单目录；公共文件单写者=主会话。

## 当前状态

| 字段 | 值 |
|---|---|
| 优先级 | 普通 |
| 当前状态 | 验收中 |
| 当前步骤 | S3 |
| 最终结果 | PASS（三步骤 S1-S3 完成：盘点→派单→方案；本任务交付=结论+方案，非代码） |
