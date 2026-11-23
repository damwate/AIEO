# 本地盘点：GDC（生图输入源头，本任务主对象）

- 时间：2026-11-23
- 仓库：`D:\Garden-Design-Calculator`，分支 `dev`，HEAD `5c9ba1558a58b29633ea731fcdb563361b4c343b`（只读，来自 `.git/HEAD`+`refs/heads/dev` 实读）
- 方法：静态代码检索（read-only），所有结论绑定 file:line；未改目标仓库任何文件。

## 1. 截图与就绪门禁（RCA 核心）

- 渲染器 `ThreeView.tsx:231` `new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true})`；KTX2 支持门 `:235-236`；相机 `:237` `PerspectiveCamera(FOV_NORMAL,...)`；`FOV_NORMAL=45` `threeCamera.ts:12`；默认 `sunTime=9` `ThreeView.tsx:148`，capture 取 `sunHourRef.current` `:721`。
- `camera_snapshot` 构造 `ThreeView.tsx:730-732` → `buildCameraSnapshot(... fov:cam.fov ...)`；载荷形状 `project/aiGeneration.ts:126-132`。
- 截图入口两条：①`photo()` 本地下载 `ThreeView.tsx:684-691`（`renderFinalFrame`→`toDataURL('image/png')`）——**无任何就绪门**；②AI capture `ThreeView.tsx:706-741`（`getRegisteredCaptureSource()`:719-720 → `performAtomicCapture()`:737，不可用返回 null:738）。
- 就绪门禁定义 `aiReference/threeCapture.ts:526-529` `isAssetReady()`（注释"本代 GLB 全部加载完成（挂起计数=0）才允许 capture"）；实现 `ThreeView.tsx:544` `isAssetReady:()=>handle.current?handle.current.pendingGlbs===0:false`；计数初值 `:255`，增减 `:328,348,373`。
- 三个 capture 消费点：`threeCapture.ts:666-671` beauty（不满足 return null）、`:678-682` analysis（不满足抛错）、`:818-824` atomic（不满足 return null）。
- **纹理/billboard 明确排除**：`ThreeView.tsx:400` 注释"纹理不计 pendingGlbs、isAssetReady 语义只认 GLB"；`:420-421` billboard 同。
- **无超时**：`threeCapture.ts` 无 `timeout|AbortController|race(` 匹配。

**结论：RCA"门禁只等 GLB、纹理明确排除"=CONFIRMED；"fov=45/sunTime=9"是默认值非不可变。**

## 2. 资源加载与状态

- GLB：`GLTFLoader` `ThreeView.tsx:325`；加载+pending++ `:348`；失败 `--` 且报错 `:328-329`；场景/目录变化整批重载 `:324-325`。
- KTX2：`three/ktx2.ts:12` transcoder `/basis/`；检测 `:25-28`；URL 改写 `:34-37`；包装器 `:64-93`——**先返回占位 `CompressedTexture([],1,1)`:73**，异步到了才 copy+needsUpdate `:74-85`，billboard 出错回退原 webp `:86-89`。
- 纹理状态**本地存在但未暴露给门禁**：`threeMaterials.ts:63-91` `CacheEntry={texture,loaded,failed,onLoads,onErrors}`；`:78` load 完成置 loaded/failed；`:88-90` 已载 entry 同步回调。材质 `:95-109`——初始 `MeshStandardMaterial({color:basecolor}):98`，纹理到了 `material.color.set('#ffffff');material.map=t`:102，失败仅转发 onTextureError `:103,108`。`ThreeView.tsx:308-314` 晚到纹理只 `loop.invalidate()` 补帧；404 只 warn 保持纯色 `:341,389`。
- Billboard：`planting/billboard.ts:100-167` 有 `refs/failed` 状态，但 mesh `:174-187` **创建即可见**（无 `visible=false` 等待）；KTX2 出错回退由 ktx2.ts 处理。
- `render_assets`/`render_assets_ready` 全仓 0 匹配。

**结论：状态在 `threeMaterials.CacheEntry`/`PlantMaterialCache` 内部存在，但没有连到 capture 门禁；KTX2 晚到只补帧=CONFIRMED。**

## 3. 缓存机制

- 无 IndexedDB/service-worker 3D 缓存（仅 `AiQuickPhotoPanel.tsx:3` 注释"No IndexedDB/offline guarantees"）。
- 纹理缓存=进程内 Map `threeMaterials.ts:65`；键 `:68` `${materialVersionId}|${repeatU}x${repeatV}|${rotation}|${role}`——**无 revision/generation 成分**。
- billboard 缓存按 viewer generation `billboard.ts:107-114`。
- HTTP：`src/frontend/nginx.conf`——hash 化 Vite 资产 immutable `:19-23,:82-86`；可变 assets `@backend_assets` no-cache `:30-35,:93-98`；通用 `/assets/` no-cache `:48-53,:111-116`。后端 `main.py:636` 提供 `/assets`；`asset_thumbs.py:14-19` `Cache-Control public max-age=3600` 被 nginx 覆盖。
- 对照：2D 预览缓存键有 revision `project/previewCache.ts:31-35`（`['v1',wsId,revisionId,sceneHash,...]`）。

**结论："缓存命中≠加载完成"在 `cachedTexture` 成立（pending entry 回占位）；"旧 revision 缓存冒充新 revision 就绪"因纹理键缺 revision 是真实结构风险。"80MB 冷载"是运行时证据，代码只能证明全量重载+no-cache。**

## 4. 上传链与像素校验（零检测确认）

- 前端 `project/aiGeneration.ts:210-213` `POST /api/schemes/${schemeId}/ai-generations`；FormData `:153-172`（`camera_snapshot` JSON:165、`file`:166、`file_2/file_3`:167-170、`visibility_manifest`:171-172）。
- 本地 preflight `aiGeneration.ts:134-144` `assertCaptureUsable`：仅 blob 存在/非零/`image/*`/正尺寸——**无像素语义**。
- GDC 后端 `ai/ai_generation.py:482-560` 解析 multipart `:505-543`；快照 JSON `:529-533`；提交 `:554-558`（`submit_job`:335-360,387-405，`:399,:405` `write_job_input`）。
- 输入写校验 `backend/app/media_storage.py:273-300`→`:296-300`：魔数 MIME 白名单 `:178-184`、大小 `:285-286`、`image_dims`:287、SHA-256:292——**无白块/留白检测**。
- `visibility_manifest` 校验 `ai_generation.py:211-224` 仅 schema/range。
- `camera_snapshot` 后端用途 `ai_output_frame.py:23-29` 只取 `captureFrame.ratio` 影响 prompt，无就绪语义。
- AISVC 交接 `external_jobs.py:22-44` 读取输入截图+验 SHA；`:47-58` `submit_external`——`params={'n':1}`:54，`service_client.submit(...)`:58；`service_client.py:44-53` POST `/v1/images/edits`（multipart `image`，字段 `prompt/external_ref/params`，`Idempotency-Key: job_id`）。

**结论：GDC 上传链零像素/内容检测=CONFIRMED；AISVC record-only 检测不在本仓。**

## 5. 对 RCA 三阶段裁定的代码级核对

| 阶段 | 裁定动作 | 代码落点 | 状态 |
|---|---|---|---|
| 一 | capture 门禁纳入纹理 settled（pending/loaded/failed/timeout） | `threeMaterials.ts:63-109`、`threeCapture.ts:526-529,666-682,818-824`、`ThreeView.tsx:544` | **缺失**：状态在 material 内部，门禁只认 GLB |
| 一 | billboard 未加载不显示 | `billboard.ts:174-187` | **缺失**：创建即可见 |
| 一 | photo() 补门 | `ThreeView.tsx:684-691` | **缺失**：完全无门 |
| 一 | 超时拒绝成功截图 | `threeCapture.ts` 全域 | **缺失**：无超时，永不 settle 会永久卡住 |
| 二 | 缓存合流消冷载 | `ThreeView.tsx:324-379`（每次变更多批重载）、`nginx.conf:30-116`（no-cache） | **部分**：no-cache 确认；合流机制缺失 |
| 二 | 格式准入；缓存命中≠加载完成 | `ktx2.ts:34-37,64-93`、`threeMaterials.ts:73-91` | **部分**：KTX2 路径存在；准入/版本化缺失 |
| 三 | render_assets 系统生成只读元数据进 params_json | `aiGeneration.ts:126-132,153-172`（客户端构造快照/表单）、`db.py:449-483`（AiGenerationJob 无 params_json）、`db.py:544`（GenericImageJob 有）、`external_jobs.py:54`（params 仅 n） | **缺失**：需新增字段/通道 |
| 三 | AISVC record-only 检测 | 本仓 `service_client.py:44-65` 只有提交/查询/结果/取消 | **下游缺失**（另见 analysis-aisvc.md） |

## 6. RCA 声明核验

**CONFIRMED（代码级）**：Three.js preserveDrawingBuffer；fov/sunTime 默认值；门禁只认 pendingGlbs===0；纹理/billboard 明确排除；KTX2 异步晚到只补帧；材质未载时用 basecolor、载后 set 白+map；404 只 warn 保持纯色；billboard 载前可见；无 render_assets；上传链零像素校验；nginx no-cache；场景变更整批重载 GLB；缓存命中≠加载完成。

**NOT FOUND / 需运行时证据**："白块=纹理未渲染完截图"的因果归属；"建站后 2m04s/冷载/80MB"；"白块恰落白墙/顶棚/立柱"视觉证据；"未挂贴图材质呈纯色白"（代码起点是 catalog basecolor 如 `#e5e4db`/`#d9ddd5` `src/assets/catalog.json:883,1130`，纯 `#ffffff` 只在 map 加载后 `threeMaterials.ts:102` 赋值）；"AI 把白块当留白瞎编"（下游行为）；"AISVC record-only"。

**NEW 缺口（RCA 未列，本次发现）**：
1. `photo()`（`ThreeView.tsx:684-691`）完全绕过 `threeCapture`，无就绪门——RCA 三阶段未点名。
2. capture 无超时：永不 settle 的 GLB 会永久阻塞且无类型化结果。
3. `threeMaterials` 缓存键无 revision/generation（`threeMaterials.ts:68`）：旧 loaded 纹理可满足新 generation。
4. `camera_snapshot` 由客户端生成、仅按 JSON 大小/形状校验（`aiGeneration.ts:165`、`ai_generation.py:367-370,529-533`），不是服务端权威的就绪事实。
5. `AiGenerationJob` 无 `params_json`（`db.py:449-483`），而 `GenericImageJob` 有（`:544`）——阶段三元数据需显式 schema/transport 决策。
6. 后端缩略图 `Cache-Control public max-age=3600`（`asset_thumbs.py:17-19`）被 nginx no-cache 覆盖（`:50-52,:113-115`）——缓存策略名实不符。

## 7. 实施就绪判定（回应"GDC-RCA-01 何时立项"）

第一阶段纯前端可独立做：`threeMaterials.ts`（暴露注册表）、`ktx2.ts`（转码完成接入）、`billboard.ts`（载前隐藏）、`ThreeView.tsx`（扩展 handle/换 GLB-only 计数/photo 补门/UI 错误态）、`threeCapture.ts`（isAssetReady 契约+超时）。
第二阶段需前后端协同：GLB 缓存键版本化（`ThreeView.tsx:324-379`）、纹理键加 revision（`threeMaterials.ts:68`）、nginx 版本化 immutable（`:19-35,82-116`）。
第三阶段需跨仓：GDC 后端 `db.py:449-483`+`external_jobs.py:47-58` 生成只读元数据，AISVC 侧 record-only 检测（另仓）。
验收五场景：冷启动 pending 拦截/loaded 放行；热启动 cache-hit-but-pending 仍拦截；必要纹理 404→failed 拒绝；设计纯白墙不误判；旧 revision 缓存不满足新 revision。
本轮不擅改码（上轮维持边界）；立项与三方案实施顺序待用户拍板。
