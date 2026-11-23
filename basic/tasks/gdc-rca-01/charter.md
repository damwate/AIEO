# GDC-RCA-01「3D 渲染资源完整性与截图一致性治理」立项章程

- 立项：用户 2026-11-23 原话"GDC-RCA-01立项，拆任务吧，然后开始作为第二个任务与前面BMS的并驾执行"
- 来源：`b-20261122-standard-multitask-trial/rca-whiteboard.md` §四 工作定义 + ChatGPT 三阶段裁定（SHA256=259bf49281541f58…）+ 2026-11-23 实施就绪裁定（`b-20261123-aisvc-page-exception/proposal.md`，reply SHA256=9ae55f661713c93c5e4114e7bc971a40d94c00030729f59afa8010ceb9563a34）
- 主对象：`D:\Garden-Design-Calculator`@dev `5c9ba1558a58b29633ea731fcdb563361b4c343b`；下游 AISVC 仅 record-only 检测（另任务）

## 验收核心（继承工作定义）

设计白墙允许存在；未加载不许冒充最终渲染；资源失败可观测；冷/热启动截图正确；AISVC 可追溯输入渲染状态。

## 三阶段任务拆分

| 任务ID | 阶段 | 范围 | 状态 |
|---|---|---|---|
| gdc-rca-01/T1 | 阶段一·正确性基线 | 就绪门禁统一：纹理 CacheEntry 状态暴露+接入 capture gate、KTX2 转码完成信号、billboard 载前隐藏、`photo()` 补门（P0）、capture 超时、UI 失败态；**不碰** pendingGlbs 定义/缓存/nginx | 本轮实施 |
| gdc-rca-01/T2 | 阶段二·缓存与格式准入 | GLB 加载合流、纹理缓存键加 revision、nginx 版本化 immutable、格式准入；缓存命中≠加载完成判定保持独立 | 待 T1 验收后 |
| gdc-rca-01/T3 | 阶段三·端到端防复发 | `render_assets` 系统生成只读元数据进 params_json、AISVC record-only 检测对接、冷/热启动复验；`AiGenerationJob.params_json` 属独立数据模型任务 | 待 T2 后 |

## T1 新缺口归属（本轮审查方裁定）

- **修正（2026-11-23 07-04 裁定，reply SHA256=3a611ccb81ee7d41f2b14d421f5e580b36a9d733f7bb4481acd5f63aa3872205）**：入口证据补齐 → 撤销 photo() 的 AI job P0 误分类（photo() 是 download-only，不进 AI job）；保留 photo() 白图问题为**独立用户可见缺陷**（photo 执行适合下载场景的就绪检查），不与 AI job 门禁混同；AI 截图审查范围收敛为 `captureAiInput()` 唯一路径；全仓无第三条截图绕过路径。裁定"本轮不要求改码"针对该证据问询，非撤销用户 GDC-RCA-01 立项实施授权。
- 纳入 T1：唯一 AI 入口 captureAiInput() 的就绪门禁统一（GLB + 纹理 settled + billboard settled）、billboard 载前隐藏、photo() 下载就绪检查（独立缺陷，共享底层场景就绪判断）
- 纳入台账但归后续阶段：capture 无超时（P1→T2）、纹理缓存键缺 revision（→T2）、camera_snapshot 客户端自造（→T3）、AiGenerationJob 无 params_json（→独立数据模型任务）
- 硬边界：不把 pendingTextures/pendingBillboards 塞进 pendingGlbs；不改变原 GLB-only 门禁定义；不重构 AI Job 数据模型；两入口允许共享底层就绪判断但业务门禁分开。

## 验收场景（T1 必须全过）

四场景：冷启动纹理晚于 GLB=等待后截；热启动缓存命中=快速截；必要纹理 404=拒绝成功截图；设计纯白墙=不误判。
五负例：缓存命中但 GLB pending 时 photo() 必须拦住；pending→resolved 竞态第一次失败不得异步变成功；capture 超时不产伪成功；revision 缓存隔离；camera_snapshot 客户端自造不得当服务端事实（→T3）。
