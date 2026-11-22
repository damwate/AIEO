# 白板成因 RCA（两案实证）：为什么参考图没加载全

- 日期：2026-11-22；归属：b-20261122-standard-multitask-trial 增补（用户指令"分析下那两张图为啥没能加载全…避免下次再现"）
- 两案=AI 任务 09b64995（项目 fff，morning）与 e7e30335（项目 日日日日日日，morning）的输入截图

## 一、实证证据

| 证据 | case 1（09b64995） | case 2（e7e30335） |
|---|---|---|
| 输入图尺寸 | 1988×1091 png | 2490×1256 png |
| camera_snapshot | Three.js 相机 position/target/fov45°/sunTime=9（生产库 ai_generation_jobs） | 同结构 |
| site_revision 创建时间 | 2026-11-22T04:06:17 | 2026-10-26（方案已存在一月） |
| 截图上传时间 | 04:08:21（**建站后 2 分 04 秒**） | 04:36:33（当天新开页面首次截图） |
| 白块内容 | 白墙×2、白色占位板 | 白顶棚、白立柱、白色背景板 |
| 同图已加载纹理 | 灰砖墙、木地板、木坐面、黑色金属栏杆 | 灰砖墙、木坐面、黑框玻璃护栏 |

**判定：两张图都是 GDC 3D 页的画布截图**（camera_snapshot+尺寸+morning preset 三证），白块=**材质贴图未就绪的建筑面片呈现 basecolor 纯色**（白/浅灰），与同图已就绪纹理并存——纹理竞态的实拍。

## 二、因果链（每环有代码/证据）

1. **冷加载放大**：nginx 把 /assets 全部压 no-cache（nginx.conf:30-35,48-53）→ 每次新开页全量重拉 GLB+KTX2+HDR≈80MB；case 1 首建 2 分钟内即截图（首次生成必冷载）；case 2 当天新开页同样冷载。
2. **门禁缺口**：capture gate 只等 GLB（`ThreeView.tsx:544 pendingGlbs===0`；PO-W2-2 裁决纹理不计 pendingGlbs，`ThreeView.tsx:400`）→ GLB 先到即放行。
3. **纹理晚到窗口**：KTX2 转码 worker 链（`three/ktx2.ts`）+ 材质纹理异步解码（`threeMaterials.ts:70-92`）晚于 GLB；晚到只补帧不阻塞（`ThreeView.tsx:308-314`）。
4. **白色来源**：材质未挂 map 时=basecolor 纯色（`threeMaterials.ts:98`）；建筑材质 basecolor 白/浅灰 → 白块；billboard 未挂 map=纯白面片（`billboard.ts:122` brightness=1）。
5. **上传无门**：`assertCaptureUsable` 只验 blob 非空/mime/尺寸（`aiGeneration.ts:139-145`），零像素校验 → 白帧原样上传。
6. **服务端无内容检测**（任务1 结论）：AISVC 输入链零内容级校验。
7. **AI 行为**：prompt 要求"真实场地照片"→ AI 把白块区域当未施工/留白自行脑补 → 用户所见"瞎编"。

## 三、防复发组合（与 T1/T2/T3 裁定对齐的"最小闭环"）

| 序 | 措施 | 层 | 消除哪环 | 来源裁定 |
|---|---|---|---|---|
| 1 | capture gate 扩展：材质纹理/billboard settled 并入 isAssetReady（复用 CacheEntry.loaded 聚合信号）+photo() 补门 | GDC P0 | 环 2/3 | T2-R1 裁定 |
| 2 | billboard 未加载不显示面片 | GDC P0 | 环 4 | T2-R1 裁定 |
| 3 | /assets 内容版本化缓存合流（蓝本分支） | GDC P0 | 环 1（把冷载 80MB 消掉，竞态窗口从必现压到罕见） | T3-R1 裁定 |
| 4 | 随 job 提交 `render_assets_ready` 元数据 | GDC→AISVC | 环 5/6 可关联判断 | T1-R1 建议 |
| 5 | AISVC 输入分块白块检测 record-only | AISVC P1 | 环 6（兜底） | T1-R1 裁定 |

**一句话**：白板不是"图片下载了一半"，是 **3D 场景纹理没渲染完就截图**；缓存缺失让"首次加载"必然撞上最大竞态窗口，门禁缺口让它畅通无阻上传。

## 四、ChatGPT 续判裁定（recoll 补采 reply SHA256=259bf49281541f58…，全值见 acceptance/rca-r1-reply.txt；会话 6b02857c 续 T2 任务上下文）

- **Q1 修改后同意（交叉验证）**：三方证据判定矩阵——revision 材质配置（设计预期）× 实际 map/mapUrl（运行时绑定）× CacheEntry.loaded（加载完成）；注意 loaded=true≠材质正确（URL 须对应 revision、防旧缓存命中、解码成功、GPU 上传完成）；证据记录=revision+materialId+mapUrl+CacheEntry 状态+截图时间；photo 路径不能默认已修。
- **Q2 修改后同意（三阶段）**：第一阶段=正确性闭环（capture gate 纳入 CacheEntry 状态、settled 语义 pending/loaded/failed/timeout、billboard 未载不显示、photo 补门、超时/失败拒绝成功截图）→ 第二阶段=缓存合流与格式准入**并行**（缓存不作为正确性前置——缓存命中≠加载完成判定）→ 第三阶段=端到端防复发（元数据+record-only 检测+冷/热启动复验）。
- **Q3 修改后同意**：render_assets 元数据=**系统生成只读、进 params_json 不进用户表单**；布尔不足，建议结构 {status,revision,required_total,loaded,failed,timeout,captured_at,evidence_version}；AISVC 不盲信该字段（record-only 独立检测）；用户上传参考图不适用。
- **新增验收要求（审查方追加）**：四实测场景（冷启动纹理晚于 GLB=等待后截/热启动缓存命中=快速截/必要纹理 404=不得白块成功/设计纯白墙=不误判）+ 负例（旧 revision 纹理缓存命中不得认定新 revision 就绪）。
- **工作定义：GDC-RCA-01「3D 渲染资源完整性与截图一致性治理」**；验收核心=设计白墙允许存在/未加载不许冒充最终渲染/资源失败可观测/冷热启动截图正确/AISVC 可追溯输入渲染状态。
