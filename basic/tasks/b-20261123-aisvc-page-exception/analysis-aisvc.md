# 补充盘点：AISVC 下游消费方（生图异常处理接收端）

- 时间：2026-11-23
- 仓库：`D:\YotinGarden\AI-Image-Service`，main，HEAD `0c53c963d93e33c15ebd4498742828fcf9ffc57d`（只读）
- 定位：GDC 是生图输入源头（主对象，见 analysis-gdc.md），AISVC 是接收端；本文件只核验"异常处理"在下游的落地现状。

## 1. 页面与错误可见性

- 本仓**不含生图页面**：`frontend/src/router.ts:7-11` 仅 5 条管理台路由（Overview/jobs/job detail/alerts/vendors），无 `type="file"`、无 `/v1/images/*` 提交调用。对外生图页由外部 UI 消费（契约 `docs/integration/01_API_CONTRACT.md:17-33`）。
- 管理台错误展示点：`frontend/src/views/JobDetail.vue:123-125`（`job.error_message`）、`:166-203`（逐次尝试、`failed_phase` 中文映射 `:64-76`、`error_detail_safe`:192、actionMap:198-200）、`:223-224`（poll.error）；`Jobs.vue:88,94-96,209`；`api.ts:51-86`（网络/登录/HTTP/图片读取失败）。
- 现状：可展示 `error_message`/阶段/HTTP，但**无质量告警、无区域坐标字段**——阶段三 AISVC record-only 检测结果没有 UI 承载位。

## 2. 输入校验（逐处，确认/修正前序结论）

- 前序"零内容检测"需精确化：结构层**有**校验——魔数/MIME 白名单 `storage.py:258-263`（415 `仅支持 png/jpg/webp 图片`）、声明 MIME 一致性 `:313-317`、头解析 `:266-273`（422 损坏/8192px 超限）、20MB 上限 `:313-317`、sha256 比对 `job_spec.py:113-114`、槽位连续 `:116-117`、张数/字节预算 `ai_generic_jobs.py:113-131`。
- 但**像素语义检测确实为零**：全仓 `quality_warning|render_assets_ready|INPUT_ASSET_INCOMPLETE|white_block|blank_detect` 0 命中；唯一相关 `_validity` `evaluation.py:235-250` 用整图 `convert('L').getextrema()`、`hi-lo<8` 判纯色空白，**仅在评测任务** `_auto_scores:223-232` 调用，不进 worker 生图链；整体极差抓不住局部白块。
- 尺寸：`generic_params.py:9-15` `size:'auto'`，`job_spec.py:128-131` 配置覆盖，`ai_provider.py:267` 供应商配置——**无"最低1K"下限逻辑**（校正用户记忆）。

## 3. 异常链与终态（已实现部分）

- 提交期 422/413/409/429 文案齐全（`ai_generic_jobs.py:84,91-150,171,218`、`api_v1.py:75-126,158-187,239`）。
- Provider 错误分类 `provider_outcome.py:6-10,289-326,342-372,395-431`（522/523/524→stop_unknown；result_invalid→stop；billable 5xx 默认 stop_unknown）；`ai_provider_openai.py:207-259`（401/4xx/超时分类）；RightAPI `ai_provider_rightapi.py:123-151`（未知结果禁重投）。
- 重试：`ai_worker.py:93-94` MAX_AUTO_RETRIES=2 / 5s；`:596-614` 失败终态；`:321-330` `_finalize_failed` 唯一出口（status='failed'、error_code/message、释放额度）。无 DEAD 态（`storage.py:42` 终态= succeeded/failed/cancelled）。
- 输出校验：`image_download.py:87-118`（HTTP 状态/大小/格式/`image.verify()`），内联 b64 `ai_provider_openai.py:502-517`——**只校验格式/尺寸，无白块/内容质量/交付前分级**。

## 4. 缺口与落地优先级（映射上周末 AISVC 方案）

| 缺口 | 证据 | 上周末方案对应 | 状态 |
|---|---|---|---|
| 局部白块/未渲染纹理输入无检测 | `storage.py:305-324`、`job_spec.py:94-118` 只格式/尺寸/sha256 | P1 record-only 分块多指标 | 缺失 |
| 检测记录载体 | `job_timeline.py:56-79` 无 quality_warning；`db.py:70-81` 无列但 attempt/timeline JSON 可承载 | 算法版本/区域坐标/指标/决策 | 缺失（可用 JSON 免改表） |
| L0-L3 分级 | `evaluation.py:248-250` 只有 0/1 整体极差 | 分级 | 缺失 |
| 结构性留白 vs 加载白块区分 | `evaluation.py:235-250` 无区域/结构 | +GDC `render_assets` 元数据 | 缺失 |
| 条件性 422 INPUT_ASSET_INCOMPLETE | `ai_generic_jobs.py:87-131` 无此码 | P2（阶段一不启用） | 缺失 |
| 输出侧质量评价 | `image_download.py:95-106` 直落盘 | P2 record-only | 缺失 |
| 进程/传输异常 | `ai_worker.py:321-330,596-614`、`routing.py:256-324` | — | **已实现**（与内容异常无关） |

## 5. 实施就绪判定

前端-only 只能消费后端字段：在 `frontend/src/types.ts` 增检测记录类型、`JobDetail.vue:186-193` 展示告警/等级/区域、`:214-218` 结果图旁标注、`Jobs.vue:197-210` 增列、StatusBadge 增非终态质量徽标。
后端改动：输入检测落 `job_spec.py:94-118` 读图后 / `ai_generic_jobs.py:190-194` 写输入前；记录写 attempt/timeline JSON（免改表）；分级独立模块；422 门仅阶段二启用；输出侧评价在 `write_success` 前或下载后仅写 JSON。
测试点：局部白块命中 L1/L2 且整体极差仍大（反证 evaluation.py:245-249）；设计纯白墙不误判；四种加载场景；白图上传仍落盘但产生记录；输出空白交付成功且记告警不自动拒绝；回归 522/523/524→stop_unknown、result_invalid→stop、MAX_AUTO_RETRIES=2、10 分钟硬顶。
本轮不擅改码（上轮维持边界）；与 GDC-RCA-01 的实施顺序待用户拍板。
