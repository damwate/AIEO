# GDC-RCA-01 / T1（阶段一·正确性基线）实施记录

- 授权：用户 2026-11-23 "GDC-RCA-01立项，拆任务吧，然后开始作为第二个任务与前面BMS的并驾执行"
- 隔离：独立 worktree `D:\GDC-rca01-t1-worktree`，任务分支 `task/gdc-rca-01-t1-gate`，父 commit=`5c9ba1558a58b29633ea731fcdb563361b4c343b`；主 worktree `D:\Garden-Design-Calculator`@dev 全程未动。
- 子 agent：code-explorer 子会话产出手术级补丁设计（含"PlantingEditor 第二消费者"关键发现）；补丁由主会话在隔离 worktree 内逐条落地并实查验收（如实登记，子 agent 工具集只读）。
- 前置证据：入口证据派单 dispatch-2026-11-23T07-04-13（reply SHA256=`3a611ccb81ee7d41f2b14d421f5e580b36a9d733f7bb4481acd5f63aa3872205`）——撤销 photo() 的 AI job P0 误分类（download-only），AI 入口收敛为 captureAiInput() 唯一路径，全仓无第三绕过路径。

## 改动（6 文件，+152/-7）

| 文件 | 改动 |
|---|---|
| `src/frontend/src/sceneReady.ts`（新） | 纯函数 `evaluateSceneReady()`：hasHandle / pendingGlbs / textures{pending,failed} / billboards{pending,failed} 四源组合；四态只判 pending/loaded/failed，timeout 归 T2 |
| `src/frontend/src/planting/billboard.ts` | CacheEntry 加 `loaded`/`meshes`；新增 `isReady()`/`loadState()`/`registerMesh()`；贴图到达→loaded=true 且面片 visible=true，失败→failed=true 且 visible=false；refcount/dispose 语义零变化 |
| `src/frontend/src/ThreeView.tsx` | ①引入 sceneReady 原语；②`texLoadRef` 计数（generation 整代清零，texWatch 订阅前 pending++，同步回放 onLoad/onError 配平）；③scene-prop 面片 registerMesh；④新增 `sceneRenderReady()` 共享原语；⑤`photo()` 下载门（setError 提示）；⑥`captureAiInput()` AI 附加门（fail-closed return null，先于 performAtomicCapture） |
| `sceneReady.test.ts`（新）/`sceneReady.wiring.test.ts`（新） | 5 个纯逻辑用例 + 2 个源码接线锁定（sceneRenderReady 调用数=3、isAssetReady 逐字 GLB-only、门先于 capture/render） |
| `planting/billboard.test.ts` | +3 用例（在途/失败计数、未加载不显示→到达自动显示） |

## 不变量核验（实查）

- `isAssetReady:()=>handle.current?handle.current.pendingGlbs===0:false` 逐字保留（ThreeView.tsx:567）；`threeCapture.ts` 无 `pendingTextures`/`pendingBillboards`；GLB-only 语义未变。
- `pendingGlbs` 未被塞入任何贴图/billboard 计数；AI Job 数据模型、`params_json`、`camera_snapshot`、缓存键、nginx 均未触碰；timeout 未实现（T2）。
- `renderFinalFrame`/`toDataURL`/`toBlob`/`performAtomicCapture` 调用数未变（接线测试锁定）。
- photo() 不进 AI flow（仅 setError + return），AI 门与下载门共享低层原语但业务分离。

## 测试结果

- 聚焦 4 文件：84/84 PASS。
- 全量前端（`vitest run src`，与 package.json `npm test` 同范围）：**217 files / 3256 passed / 14 skipped / 0 failed**，Duration 28.79s。日志：`phase0/logs/gdc-t1-vitest-full-src.log`。
- `tsc -b --noEmit`：exit 0。
- 说明：首次全量漏写 `src` 范围误收 205 个 Playwright e2e spec（非回归），改用正确范围后全绿；日志 `gdc-t1-vitest-full.log` 保留该误报证据。

## 提交

- 任务分支 commit=`b6ac457b2bdd6f41b996df93dc880d359054862f`，parent=`5c9ba1558a58b29633ea731fcdb563361b4c343b`。
- **未合并 dev、未 push**（DEC-010 红线，待用户拍板）。
- 回滚：`git -C D:\GDC-rca01-t1-worktree reset --hard 5c9ba1558a58b29633ea731fcdb563361b4c343b`。

## 待用户拍板 / 后续

1. T1 是否合入 dev（须用户拍板 main/dev 合并红线）；合入前建议补 E2E 四场景+负例 A/B/C（浏览器实测纹理竞态）。
2. T2（阶段二）：capture 超时（P1）、纹理缓存键加 revision、GLB 加载合流、nginx 版本化 immutable。
3. T3（阶段三）：render_assets 只读元数据进 params_json、AISVC record-only 检测；`AiGenerationJob.params_json` 独立数据模型任务。
4. photo() 下载白图问题已作为独立缺陷修复（本 T1 内共享原语），不进 AI job 门禁——与审查方入口证据修正裁定一致。
