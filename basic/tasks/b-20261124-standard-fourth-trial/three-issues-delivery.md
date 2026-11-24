# 三问题并行修复交付（2026-11-24）

> 用户纠正：1（AIS 详情）与 3（GDC 白块）**并未改好**，要求 1/2/3 并行处理。本文件汇总三任务最终状态。所有修复均在独立 worktree/分支，未合并主分支、未自行生产发布（DEC-010）。

## 总览

| # | 问题 | 分支 | commit | 验证 | 状态 |
|---|---|---|---|---|---|
| 1 | AIS 任务详情白字 + 缺设计稿/参考图 | `task/jobdetail-input-display` | `559a195` | 前端 3/3、后端 20/20 | 本地完成，待部署 |
| 2 | BMS 综合报价价格空 | `task/bms-quote-price-be`（service/ui） | `299b7262` / `b1b85257` | **生产 MySQL 实跑对账 PASS** | 本地完成，已推分支，待部署复验 |
| 3 | GDC 3D 白块/参考图未就绪 | `task/gdc-scene-ready-hardening` | `e52b10a6` | 前端 60/60（含 sceneReady/capture） | 本地完成，待部署 |

## 任务 1：AIS 任务详情

**根因坐实**（浏览器 computed style）：`.input-prompt` 文字色 `rgb(232,234,238)`（来自全局 `--text:#e8eaee` 暗色主题）叠在浅背景 `#f8fafc` 上，对比度≈0。ChatGPT 裁定：白字与信息缺失是两件事，不能拿当前 main 源码断言生产 CSS 根因——本轮用生产页面 computed style 实证补上了这个缺口。

**修复**：
- 前端 `.input-prompt` 显式 `color:#1e293b`（浅底配深字）。
- 新增输入参考图区：后端新增鉴权端点 `GET /jobs/{job_id}/inputs/{slot}`，**只按任务冻结 slot 取图，不接受任意 storage_key**（防越权）；前端按 slot 取 Blob 展示缩略图，不暴露私有存储地址；重载/轮询/卸载统一 revoke Blob URL（防串图与泄漏）。
- 文案同步（结果图区不再说"仅计数"），测试断言更新。

**验证**：`tests/job-detail.spec.ts` 3/3；`tests/test_admin_api.py` 20/20（新增：冻结 slot 可取、未冻结 slot 404、错 token 403、不存在任务 404）。

## 任务 2：BMS 综合报价价格（按用户提示用部署文件连生产库实跑）

**连接方式**：按 `/d/youting/BMS相关/00_系统基础/01_系统架构与部署规范.md`，生产库实际走 `172.25.62.153:3306/ecog_bim`（非配置里的 RDS 域名，该域名在跳板机无法解析）；经白名单跳板 `47.97.16.242` 用 Python+pymysql 只读查询。凭据不记入本文件。

**实跑结果**（从 mapper 提取修复后 SQL 原文、替换参数后执行，一字不差）：

| 项 | 值 |
|---|---|
| 返回行 | 13（全部有 sku/artificial 值，不再缺 key） |
| `SUM price` | **54184.1** |
| `SUM sku_price` | **54116.0** |
| `SUM artificial_price` | **68.1** |
| 明细分类汇总 | 产品类 54116.0（purchase_type 1:260 + 5:52356 + 60:1500运费）、人工类 68.1（50:8.1基材 + 99:60人工） |
| 关键行"产品及安装" | price=328.1 → sku=260.0 + artificial=68.1（分类正确） |
| 生产 `quote/detail.totalPrice` | **54184.1**（与 SUM price 完全一致） |

**结论**：54116.0 + 68.1 = 54184.1，与生产总账严格对账通过；50/99 分类、运费归属、无重复计价均实证正确。任务 2 从"静态核对"升级为**生产实跑 PASS**（详见 `bms-sql-review.md` 的静态核对 + 本节实跑）。仍待 codex 部署后做页面四层复验。

## 任务 3：GDC 3D 白块就绪门补强

**现状核对**：T1 门 `sceneReady.ts` 已判 pendingGlbs/贴图/billboard；但缺 ChatGPT 指出的两点——①资源发现未封口（pending=0 时可能还有异步贴图未注册）；②最终渲染窗口内贴图 settle 仍可能用旧帧。场景 generation 隔离（`gen!==generation.current`）ThreeView 已有。

**修复**（最小侵入，不推翻 ThreeView 渲染架构）：
- `evaluateSceneReady` 新增可选 `discoverySealed`，未封口时即使 pending 全零也拒绝（缺省 true 兼容旧调用）。
- ThreeView 新增 `discoverySealedRef`：本代 effect 开头复位 false，`buildScene`/plantCache 同步登记完成后置 true（资源发现封口）。
- `sceneRenderReady()` 带上 `discoverySealed`。
- `captureAiInput` 加最终渲染屏障：`renderFinalFrame` 后二次验门，渲染窗口内若有贴图 settle 导致未就绪则拒绝本次捕获。

**验证**：`sceneReady.test.ts`（8，含 G3 发现未封口、G10 封口后放行）、`sceneReady.wiring.test.ts`（3，锁定封口接线与渲染屏障顺序）、`threeCapture.test.ts`（49）——合计 60/60。

**未覆盖（如实登记，不夸大）**：ChatGPT G1–G11 中的 G5（wallFade 中间帧动画结束判定）、G7（旧场景回调污染——ThreeView 已有 generation 检查但无专门 mock）、G8（同一资源重复 settle 结算一次）、G9（多 GLB 失败策略）、G11（图片实际内容像素级检查，而非只看计数）。这些属更深改造，建议后续单独立项，本次不宣称已闭环。

## 边界

- 三分支均只 push 功能分支，未合并 main/master/dev；DEC-010 保持。
- 未自行生产发布；部署须用户/codex 按流程执行。
- 本轮新增一笔真实生图（DEC-136）已授权；本次三任务未再触发付费测试。
- 静态/生产 SQL 查询均只读，未修改生产数据。
