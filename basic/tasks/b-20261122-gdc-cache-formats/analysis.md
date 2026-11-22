# 任务2 本地分析：花园计算器缓存机制漏网图片格式排查

基线：GDC dev `5c9ba1558a58b29633ea731fcdb563361b4c343b`；执行=独立 Explore 子代理只读扫描（89 次工具调用），全文落本文件。

## 1. 缓存机制本体（四层，全站无 SW/IndexedDB/localStorage 图片缓存）

- **A. 3D 纹理缓存**：模块级全局 Map（`threeMaterials.ts:63-68`），键 `materialVersionId|ru x rv|rotation|role`（:68）——**键不含 mapUrl**（换图不失效，GOAL 文档"现实约束5"确认）；无驱逐无失效。KTX2 包装（`three/ktx2.ts:64-93`）同步返回 1×1 空占位、转码完成后搬入同对象；billboard 前缀 404 回退原图，材质路径**无回退**（失败=永久纯色，:55-59 事故记录）。billboard `PlantMaterialCache` 引用计数、每代重建（`ThreeView.tsx:402-406,476`）。HDR 进程级+每代 PMREM（`threeEnv.ts:103-106`）。
- **B. 2D 预览位图 LRU**：48 条/48MB（`previewCache.ts:3-28`），键含 `assetsSig`（图源路径集签名）；头注明示"同路径覆盖内容不失效=接受"。
- **C. Plan.tsx images**：仅组件挂载期（:246,:281-287），无跨挂载缓存。
- **D. HTTP 层**：nginx 对全部业务素材强制 no-cache（`nginx.conf` 两个 server block 的 `/assets/` 与 `@backend_assets`）；仅 Vite hash 产物 immutable。后端缩略 LRU + `?max=` public 1h；私有媒体 private 1h。
- 未合入分支 `feat/web-demo-asset-cache-20261119`（3ffcb65e）=内容哈希版本 URL 方案（同任务3蓝本）。

## 2. 格式覆盖矩阵（缓存路径命运）

| 格式 | 3D 材质路径 | 3D billboard 路径 | 上传门 | `?max=` 缩放 | AI 参考图 |
|---|---|---|---|---|---|
| png/jpg/jpeg/webp | ✅改写 .ktx2（`ktx2.ts:34-37`正则） | ✅回退原图 | ✅accept+魔数（`product_admin.py:68`） | ✅（`asset_thumbs.py:38`） | ✅（`reference_assets.py:26`） |
| .ktx2 | ✅直达 | ✅404 回退 | —（服务端资产） | — | — |
| **svg** | ❌正则不匹配→KTX2Loader 必败→**永久纯色** | ✅浏览器可解码 | ❌415 | ❌不缩放走原文件 | ❌octet-stream |
| **gif/bmp/avif/heic/ico** | ❌同上 | ✅回退可解 | ❌415 | ❌ | ❌octet-stream |
| data URL | 不进纹理路径 | — | — | 刻意放过（`quote.ts:33-40`） | 不进输入 |
| blob URL | 不进 | — | — | — | 不进输入 |

**结构性漏网点（现网数据未踩、机制在）：**
1. **catalog 手工种入非白名单扩展名的 `ai_reference_image`** → Worker 按扩展名查不到 mime → `application/octet-stream` 直发 AI 服务（`external_jobs.py:47`）——AI 供应商侧参考图异常的数据侧入口
2. svg 用于材质贴图 → 纯色（材质路径无回退）
3. `?max=` 对 svg/gif 不缩放（原文件直出，大文件风险）
4. 现网资产实况：textures=webp17+jpg4、planting=webp24、scene_props=webp8、images=webp47/jpg40/png15/svg2（仅 logo）——当前全在白名单内，**漏网是结构性的，靠数据端不踩雷**

## 3. 白板直接成因（与任务1/3 因果链闭环）

- **billboard 未加载 = 纯白大面片**：`billboard.ts:122-126` `MeshLambertMaterial color setScalar(brightness)`，白天 brightness=1 → **纯白**；map 仅 load 回调挂（:127-131）；面片尺寸=资产宽高 mm——一株未加载的树就是一整块白矩形
- 产品贴图未到 = basecolor 纯色（`threeMaterials.ts:98`），浅色款成片发白；.ktx2 404 则永久纯色
- **截图门只等 GLB**：`isAssetReady=pendingGlbs===0`（`ThreeView.tsx:544`）+ `threeCapture.ts:681,824`——纹理/billboard/HDR 全不在门内（PO 裁决 `ThreeView.tsx:400`）
- **`photo()` 拍照下载零门禁**（`ThreeView.tsx:684-691`）
- 上传前唯一校验 `assertCaptureUsable`（`aiGeneration.ts:139-145`）只验 blob 非空/mime/尺寸——零像素级校验
- 对照范本：2D 预览管线 fail-closed 全等待（`previewRenderer.tsx:51-88`，失败不入缓存）
- CORS：全链同源，无 canvas 污染风险；`toBlob` 依赖 `preserveDrawingBuffer:true`（`ThreeView.tsx:231`）

## 4. 待 ChatGPT 讨论的问题

Q1 结构性漏网的封堵策略：mime 推断表兜底改 415 拒绝 vs 扩白名单？catalog 数据校验加在 build_catalog？
Q2 billboard 白面片的最小修复：未加载改非白底色/隐藏 vs 纳入 capture 等待门（与任务3 的 settled 信号方案合并）？
Q3 材质路径 .ktx2 404 无回退（永久纯色）是否加回退？
