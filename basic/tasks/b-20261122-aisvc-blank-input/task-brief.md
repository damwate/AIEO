# 任务书：AI-Image-Service 白图/未加载完输入识别能力分析（任务1/3，多任务并行试运行）

- 任务ID：b-20261122-aisvc-blank-input
- 日期：2026-11-22
- **版本选型：**
  - 选定版本：Standard
  - 任务等级：S2
  - 选型理由：用户点名"用刚做好的AIEO标准版试试多任务处理能力"；本任务为只读代码分析+派单讨论，无代码修改，风险可控；流程基座=Basic v0.3 六模块（standard/WORKFLOW.md 继承声明）。
  - 批准人/日期：用户指令（2026-11-22 原话见 requirement.md）

## 需求原文

见 requirement.md（不加工）。

## 执行者理解（与原文分开，便于对账）

1. 核对生图服务传给供应商的参数——用户记忆"最低1K"（尺寸下限），确认现状即可（用户明示"这个倒是没啥"）。
2. 重点：**未加载完成/白图（大块白色占位区域）的输入图片，服务端当前能否识别/拦截？** 背景因果：Garden 计算器上传参考素材时原图未加载完，白板区域进入生图输入，AI 对白板区域瞎编。
3. 本次**不改任何代码**，产出=本地分析结论 → ChatGPT 讨论 → 改进方案（文字方案）。

## 验收目标

- 供应商请求参数现状有代码级证据（文件:行号）；
- 输入图片校验链全貌（上传→存储→领取→发供应商）每一环的检测能力有证据；白图/未加载完图片是否可被识别有明确结论；
- ChatGPT 讨论 reply 归档（原始字节+SHA256）；结合 reply 形成文字方案（不改代码）。

## 分析对象与基线

- 目标仓库：`D:\YotinGarden\AI-Image-Service`（github.com/YotinGarden/AI-Image-Service）
- 分析基线 commit：`0c53c963d93e33c15ebd4498742828fcf9ffc57d`（本地 HEAD，2026-11-22）
- 服务器实况参照（share.yotin.com.cn 生产）：容器 ai-image-service-api-1，generic_image_jobs 表 09b64995/e7e30335 两任务的 prompt+input_images_json 已采证于 `C:\Users\youting\AppData\Local\Temp\yotin-aijobs\`（jobs.json+两张输入 PNG）

## M2 并行登记（standard/parallel-governance-draft.md v0.1）

- 并行模式：M2 受控并行（任务级并行+通道级串行）；本批 3 任务互不依赖、目标仓库全部只读
- 基线 SHA：AISVC=`0c53c963…c57d`（只读不建 worktree——零写入，无需代码隔离面）
- 执行会话：本 ZCode 会话（调度）+ 本任务独立子代理上下文；派单会话=审查会话 6b009b70（全局唯一，FIFO 串行）
- 文件所有权：本任务只写 `basic/tasks/b-20261122-aisvc-blank-input/` 与 `phase0/logs/dispatch-<ts>/`；公共文件（decision-log/PHASE-STATUS/测试报告）单写者=主会话

## 当前状态

| 字段 | 值 |
|---|---|
| 优先级 | 普通 |
| 当前状态 | 验收中 |
| 当前步骤 | S2 本地分析已完成，S3 ChatGPT 讨论待执行 |
| 最终结果 | （完成时填写 PASS/REJECT；本任务交付=结论+方案，非代码） |
