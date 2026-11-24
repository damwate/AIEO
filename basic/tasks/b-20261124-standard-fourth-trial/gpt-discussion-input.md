# 给 ChatGPT 的讨论材料：三个生产问题（2026-11-24）

> 背景：AIEO 标准版第四轮试运行。生产 GDC=`http://share.yotin.com.cn:8870`，AIS 控制台同域 `/ai-console/`，BMS=`https://bms.ecog.com.cn`。
> 本轮已生产实测一笔真实生图：任务 `8c472c6c-5806-400f-a12d-8ae7fbe48184`，请求含 2 条 `product_constraints`，结果 1918×820（auto 画幅），成功。以下三问题请**只给裁定与方案，不要改代码、不要建议付费测试**。

## 问题 1：AIS 任务详情参数文本框白字 + 缺设计稿/参考图

- 代码：`D:\YotinGarden\AI-Image-Service\frontend\src\views\JobDetail.vue:143-148`，两处 `<pre class="input-prompt">`；样式在 `:239` 附近 `.input-prompt { background:#f8fafc; border:1px solid #e2e8f0; ... }`，未显式设置 `color`。
- 生产现象：用户看到参数框内文字为白色，几乎看不清；页面只显示「输入参考图：N 张；原始图片请在业务方系统查看」，没有设计稿/参考图本身。
- 后端已有能力：`backend/app/ai/admin_api.py:408-419` 私有输入媒体读取端点；`:518` 详情返回 `'inputs': (j.input_images_json or {}).get('images', [])`。
- 请裁定：①白字根因（全局样式继承？scoped CSS？生产构建差异？）与最小修复；②是否在任务详情展示输入图缩略图，若展示，鉴权与越权边界怎么定；③若不应展示，给出替代核查路径。

## 问题 2：BMS 报价预览「综合报价」产品价格/人工价格为空

- 生产复现：合同 `SO2611169704`（scheme `2125121801040719874`）→ 查看报价 → 项目报价 → 报价预览 → 综合报价；21 个行节点两列全是 `—`。直接 fetch `GET /case/scheme/2125121801040719874/items/sortedByGroup`，展开 children 共 21 节点，JSON 中 `skuPrice`/`artificialPrice` 两个 key **根本不存在**。
- 根因两层：① `bms-service` `SchemeItem.xml#selectGroupModelListBySchemeId` 未取/未算 `sku_price/artificial_price`（同文件 `selectGroupModelListBySchemeId2` 有）；② `bms-ui` `SchemeDetailVO` 无这两个字段，`CaseController.toTreeNode:4060` 的 `BeanUtil.copyProperties` 丢字段。
- 已修（本地，未部署）：bms-service 分支 `task/bms-quote-price-be` commit `299b7262`（新增按 `scheme_item_id` 聚合 `quote_detail` 的 LEFT JOIN 派生表，`purchase_type` 50/99 归人工、其余归产品，外层 `sum()`，保留原 LEFT JOIN 语义）；bms-ui 同分支 commit `b1b85257`（VO 补字段）。两仓 `mvn -DskipTests compile` exit 0，XML 结构校验通过。
- 请裁定：①SQL 口径是否与 SchemeId2 一致、LEFT JOIN 是否引入行数/金额偏差风险（尤其「单品」合并行与无 quote_detail 行）；②部署后复验口径（同一 scheme、看哪些字段值、如何证明金额未重算）；③是否还需补运行时测试。

## 问题 3：3D 页面点「生成 AI 图片」有几率闪一下，出现白块参考图

- 用户反馈：点生成 AI 图片时页面有几率闪一下，导致 3D 图出现白块；生图服务拿到白块/未加载完的参考图，最终成果图不合理。
- 代码现状：`Garden-Design-Calculator` 当前功能分支 `feature/product-constraints-auto-size-20261124` 已含 T1 正确性基线门：`src/frontend/src/sceneReady.ts` 的 `evaluateSceneReady()` 判 `pendingGlbs`/`failedGlbs`/`textures.pending|failed`/`billboards.pending|failed`；`ThreeView.tsx:697` 定义 `sceneRenderReady()`，`:743` 的 `captureAiInput()` 在采集前调用该门；`:699` 的 `photo()` 也有独立门。`threeCapture.source.isAssetReady()` 仍严格 GLB-only（未改语义）。
- 请裁定：①在「贴图晚到 / wallFade 隐墙再恢复 / renderFinalFrame 补帧 / 按需渲染失效窗口」这些路径下，现有门是否仍有竞态可让白块图进入 AI 请求；②若有，最小修复应加在哪一层（采集前再等一帧？纹理 load 计数闭环？截图后像素级白块检测？）；③给出可离线/mock 验证的验收点（不触发真实付费生图）。

## 边界

- 三项均不授权改生产数据、不授权付费测试、不解除 DEC-010（main 合并/生产发布/数据删除须用户本人拍板）。
- 请按问题编号给「裁定 + 风险 + 下一步最小动作」，并指出我本地方案是否有遗漏。
