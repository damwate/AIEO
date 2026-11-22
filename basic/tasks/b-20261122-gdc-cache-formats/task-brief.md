# 任务书：花园计算器缓存机制漏网图片格式排查（任务2/3，多任务并行试运行）

- 任务ID：b-20261122-gdc-cache-formats
- 日期：2026-11-22
- **版本选型：**
  - 选定版本：Standard
  - 任务等级：S2
  - 选型理由：用户点名"用刚做好的AIEO标准版试试多任务处理能力"；只读代码分析+派单讨论，无代码修改，风险可控；流程基座=Basic v0.3 六模块。
  - 批准人/日期：用户指令（2026-11-22 原话见 requirement.md）

## 需求原文

见 requirement.md（不加工）。

## 执行者理解（与原文分开，便于对账）

1. Garden-Design-Calculator 已有图片缓存机制（用户称 3D 页面做了缓存）；排查该机制的图片格式覆盖面。
2. 找"漏网"：实际会出现的图片格式（svg/webp/avif/gif/bmp/tiff/heic/data URL/blob URL 等）中哪些未被缓存机制覆盖，逐项给代码级证据（文件:行号）。
3. 背景：参考素材加载不完全→白板上传→AI 瞎编；缓存与加载完成度同为本批因果链环节。
4. 本次**不改任何代码**，产出=结论 → ChatGPT 讨论 → 方案。

## 验收目标

- 缓存机制现状有代码级证据（机制、入口、覆盖格式清单）；
- 漏网格式逐项判定（覆盖/不覆盖+证据），给出完整格式矩阵；
- ChatGPT 讨论 reply 归档（原始字节+SHA256）；结合 reply 形成文字方案（不改代码）。

## 分析对象与基线

- 目标仓库：`D:\Garden-Design-Calculator`（github.com/Hulkhao/Garden-Design-Calculator），dev 分支
- 分析基线 commit：`5c9ba1558a58b29633ea731fcdb563361b4c343b`（2026-11-22 git pull 后 HEAD）

## M2 并行登记（standard/parallel-governance-draft.md v0.1）

- 并行模式：M2 受控并行（任务级并行+通道级串行）；本批 3 任务互不依赖、目标仓库全部只读
- 基线 SHA：GDC=`5c9ba155…343b`（只读不建 worktree——零写入）
- 执行会话：本 ZCode 会话（调度）+ 本任务独立子代理上下文；派单会话=审查会话 6b009b70（全局唯一，FIFO 串行）
- 文件所有权：本任务只写 `basic/tasks/b-20261122-gdc-cache-formats/` 与 `phase0/logs/dispatch-<ts>/`；公共文件单写者=主会话

## 当前状态

| 字段 | 值 |
|---|---|
| 优先级 | 普通 |
| 当前状态 | 验收中 |
| 当前步骤 | S2 本地分析进行中（Explore 子代理） |
| 最终结果 | （完成时填写 PASS/REJECT；本任务交付=结论+方案，非代码） |
