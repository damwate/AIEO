# 方案：GDC-RCA-01 实施就绪方案（本轮只评审不改码）

- 依据：`analysis-gdc.md`（GDC 主对象盘点）+ `analysis-aisvc.md`（下游补充）+ ChatGPT 裁定 `phase0/logs/dispatch-2026-11-23T06-32-05/reply.txt`（SHA256=`9ae55f661713c93c5e4114e7bc971a40d94c00030729f59afa8010ceb9563a34`，6371B，会话 `6b03de1d-ee04-83ec-8bd6-0c01824b8b2f`）；前序 RCA=`basic/tasks/b-20261122-standard-multitask-trial/rca-whiteboard.md`。
- 裁定结果：**PASS_WITH_CONSTRAINTS**（有条件通过方案收敛，不等于允许直接实施）。审查方明示：GitHub 读取未把完整 SHA `5c9ba155…` 与源码绑定，本轮为条件性架构裁定，不冒充独立复验。

## 一、五项新缺口的归属裁定

| 新缺口 | 裁定 | 理由 |
|---|---|---|
| photo() 无门（ThreeView.tsx:684-691） | **纳入，P0** | 同一业务操作两个就绪标准，绕过主入口门禁 |
| capture 无超时 | 纳入，P1 | 异步无限等待，影响恢复与释放 |
| 纹理缓存键缺 revision（threeMaterials.ts:68） | 纳入，P1 | 跨版本复用旧纹理，破坏版本隔离 |
| camera_snapshot 客户端自造 | 纳入，P1 | 客户端声明≠服务端事实 |
| AiGenerationJob 缺 params_json（db.py:449-483） | 纳入 RCA 台账，**暂不纳入本轮修复** | 涉及 Job 参数持久化契约，需独立数据模型变更 |

硬边界：GDC-RCA-01 只解决"渲染就绪状态与生成入口之间的门禁一致性"；不得借 RCA 演变成完整 AI Job 数据模型重构。

## 二、三阶段顺序（保留一→二→三，阶段一 P0 调整）

- **阶段一**：统一就绪门禁、阻断不完整场景提交；**photo() 提升为 P0 前置修复**；capture 超时、纹理 revision 隔离仍在阶段二。
- **阶段二**：capture 生命周期、纹理版本隔离（原计划保持，capture 无超时/缓存键 revision 归此阶段）。
- **阶段三**：服务端事实（render_assets 只读元数据）、Job 参数持久化、完整链路验证；AiGenerationJob params_json 改造属此阶段且需独立数据模型任务。

阶段一四条不变量：①所有提交 AI 输入的入口共享同一就绪判定；②就绪状态不由单个入口自行推断；③门禁失败不得触发 capture/上传/Job 创建；④纹理与 billboard 既定排除语义不变。
**明确禁止**：不得把 pendingTextures/pendingBillboards 简单塞进 pendingGlbs（会改变原门禁定义，须独立需求+证据）。

## 三、验收矩阵（五场景 + 五负例，审查方裁定）

保留原五场景：冷加载 pending 禁提交 / 热加载 loaded 放行 / 404 不得误判成功 / 设计纯白墙不因无纹理误判 / 旧 revision 不污染新版本。

必须新增五个负例：
- **A 缓存命中但 pending（P0 最重要）**：纹理缓存有资源但 GLB pending + billboard 可能未完 → photo() 必须被阻止，不 capture/不上传/不建 Job。缓存命中不能替代 GLB 就绪证明。
- **B pending→resolved 竞态**：pending 时 photo() 拒绝；加载完成后再次触发才放行；第一次失败请求不得在异步结束后自动变成功。
- **C capture 超时**：人为阻塞，到阈值必须结束等待，不生成伪成功，后续重拍不受前次失败污染。
- **D revision 缓存隔离**：R1 载入纹理入缓存→切 R2；R2 不得复用 R1 纹理，R1 迟到响应不得覆盖 R2。
- **E camera_snapshot 事实边界**：客户端伪造/过期快照，服务端不得当权威事实；服务端事实须与 Job/Revision 关联。

## 四、实施前置四项证据（审查方要求，进入阶段一前补齐）

1. 范围证据：GDC-RCA-01 区分门禁/异步生命周期/Job 数据契约三类问题；
2. 入口证据：找出全部 capture/photo 生产入口，证明无第三条绕过路径；
3. 状态证据：明确 pendingGlbs===0 的生命周期及加载失败/取消/组件卸载处理；
4. 版本证据：确认 revision 是纹理缓存键必要维度 + 迟到响应失效策略。

阶段一完成后须先证明所有生产入口共享门禁，才允许进入阶段二——不得因主入口通过测试就宣布全系统闭环。

## 五、边界与待决

- 本轮不授权实施（审查方明确"本轮直接进入实施=FAIL/暂不授权"）。
- 待用户拍板：GDC-RCA-01 是否立项、是否按三阶段拆任务、五项新缺口中 params_json 是否独立立项、A-E 五负例是否并入验收基线。
- 维持上轮边界：不扩大并行数、不宣告 M2 试运行正式通过、三方案不自动立项、不授权改码。
