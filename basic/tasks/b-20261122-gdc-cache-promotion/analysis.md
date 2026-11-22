# 任务3 本地分析：花园计算器 3D 页缓存机制推广可行性

基线：GDC dev `5c9ba1558a58b29633ea731fcdb563361b4c343b`（2026-11-22 pull 后）；执行方式=独立 Explore 子代理只读扫描（93 次工具调用），报告全文落本文件（略作编辑）。

## 0. 重大前置发现：推广蓝本已存在但未合入 dev

- `docs/web-demo-cache-plan` 分支：`docs/WEB_DEMO_CACHE_PLAN.md`（473 行方案）+ 技术注记
- `feat/web-demo-asset-cache-20261119` 分支（merge-base 验证 NOT-IN-DEV）：资产内容版本化缓存**已实现**（后端 `asset_cache.py` + 前端 `assetVersionResolver.ts` 等 31 文件 1666 行，含 301 行测试）；dev 上无这些文件
- ⇒ 推广的最大成本项（方案设计+实现+测试）已被前人完成，主要工作是**合流**

## 1. 现状全景（谁有/没有缓存）

**有缓存：**
- 3D 页 5 层进程内存缓存：材质纹理全局 Map（`threeMaterials.ts:63-92`，永不清、无 LRU）、billboard 引用计数缓存（`planting/billboard.ts:107-167`）、HDR 双层（`threeEnv.ts:88-120`）、KTX2 转码链（`three/ktx2.ts`）、件号 Sprite（`threeScene.ts:235-239`）
- 前端内存：顶视预览位图 LRU 48 条/48MB（`previewCache.ts:3-29`，键含 `assetsSig`）、Scene JSON LRU 32 条、报价/提交槽位/二维码 Map
- 后端 HTTP：私有媒体 ETag(sha256)+`private max-age=3600`（`media_storage.py:596-609`）、输入缩略 ETag+LRU（`ai_generation.py:777-816`）、`?max=` 缩略 public 1h（`asset_thumbs.py:130-140`）
- nginx：仅 Vite hash 产物 immutable（`frontend/nginx.conf:19-23`）

**没有缓存（关键缺口）：**
1. **公开客户分享页 `no-store`**（`publication.py:973`）——客户手机每次全量重下，最痛带宽点
2. **nginx 把 `/assets/**` 全部压成 no-cache**（`nginx.conf:30-35,48-53` `proxy_hide_header` + `add_header no-cache`）——产品图/KTX2/HDR/GLB 每次回源，3D 页次日开机约 80MB 全量重拉
3. 2D 页 `Plan.tsx:281-287` 每次挂载 new Image() 重载全部 catalog 图（24MB 级）
4. 全仓无 Service Worker/CacheStorage/IndexedDB（零持久化前端缓存）

## 2. "只有 3D 页做了缓存"核实结论

用户记忆**准确**。3D 页缓存全部是进程内存级（刷新即失）；跨会话只剩浏览器 HTTP 缓存且被 nginx 掐死。

## 3. 白板成因的机制级解释（与任务1/2 因果链闭环）

- 3D 截图有两道门禁：GLB 在途计数 `pendingGlbs`（`ThreeView.tsx:326-348,544`）+ blob 基本校验 `assertCaptureUsable`（`aiGeneration.ts:138-145`）
- **缺口：纹理不在门禁内**——PO-W2-2 裁决"植物不进测量域——纹理不计 pendingGlbs"（`ThreeView.tsx:400`）；材质贴图晚到只补帧不阻塞（L308-314）
- ⇒ GLB 已到但 KTX2/材质图未到时截图 → 模型呈 basecolor 纯色/白帧 → 上传"半成品画面" → AI 瞎编
- 用户描述的"首次加载服务器原图没加载完"对应此机制（全仓无"先 fetch 服务器图再上传"链路，参考图由服务端读盘）——**是纹理未就绪截图，不是网络半包**
- 最短闭环：`threeMaterials.ts` CacheEntry 的 `loaded` 字段（L63,78 现成）聚合成"本代纹理均 settled"信号并入 capture 守卫——缓存层字段已有，无需新探测；历史任务文档早有此要求未闭环（`GOAL_PAD_IA_C397_NEXT_20261007.md:250`）

## 4. 推广分级建议（提交 ChatGPT 讨论的雏形）

| 级 | 项 | 理由 |
|---|---|---|
| P0-A | `/assets` 内容版本化缓存（**合流 feat/web-demo-asset-cache-20261119**） | 方案/代码/测试全齐，边际成本最低；省 80MB/次全量重拉 |
| P0-B | AI 结果图 `/api/media` 升级内容寻址 immutable（URL 带 sha256） | MediaAsset.sha256 现成（db.py:395）；收益/成本比最高；需处理 hidden 资产 1h 延迟语义 |
| P0-C | 公开分享页去 no-store（按 publication 快照版本化，快照不可变） | 客户弱网场景最痛；风险极低 |
| P1 | 2D 预载门推广（P1-A）、Plan.tsx 模块级缓存（P1-B）、预览位图持久化 IndexedDB（P1-C） | 随 P0-A 做；注意 assetsSig 与 `?v=` 键漂移需统一口径 |
| P2 | catalog/报价 JSON 缓存、Job 轮询缓存 | 明确不做（V045 A7 红线/实时性要求/PO 既定方向） |

风险总注：scheme_revision/site_revision 不可变版本机制使"带 revision_id+scene_content_hash 的键"天然免失效；真正要小心的是按路径缓存的"同名替换"与 KTX2 派生文件（分支 MUST-FIX #2/#3 已踩平）。

## 5. 待 ChatGPT 讨论的问题

1. 未合入分支直接合流 vs 按新方案重做——分支已漂移面（asset_thumbs ?max=、KTX2 回退、build_catalog --check）合流成本评估？
2. P0-B hidden 资产缓存延迟语义（接受 1h vs 降级 no-cache）？
3. 三项 P0 的实施顺序与验收门（本次不改代码，方案冻结后另立实施任务）？
