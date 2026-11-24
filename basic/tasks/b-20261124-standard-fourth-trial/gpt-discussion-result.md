# ChatGPT 三问题讨论结果（2026-11-24）

## 派单证据

- 简报：`brief-gpt-noattach.txt`（1015B，含 `[TAG|STD5-3ISSUES]`）；详细现场稿 `gpt-discussion-input.md`（附件因 form 未出文件名 chip 未挂成功，NOT_SENT，未重发）。
- 成功派单：`phase0/logs/dispatch-2026-11-24T13-32-26/`（instance=standard-queue / port 9300 / profile `gpt-poc-standard-queue`，target session `6b056690-87b8-83ee-a67a-6be774fcc829`；SEND_CONFIRMED，user_unit_key=`fallback-turn-0:0:user`）。
- 采集 fail-closed：`INBOUND_WINDOW_COMPLETENESS_UNPROVEN`（虚拟化）→ 禁重发 → 静态 DOM 全量物化补采；驱动 `phase0/tools/recoll_std5_three_issues.mjs`（三参数全换：CONV_UUID/SENT_USER_UNIT_KEY/FAILED_DIR，MARKER=`[TAG|STD5-3ISSUES]`，PREV_REPLY_SHA 排除 seq12）。
- 补采目录：`phase0/logs/recoll-std5-three-issues-2026-11-24T13-37-18-585Z/`，reply 14493B，**SHA256=`411fee632a0595e7…`**（完整值见 result.json），归属七查全过（标记唯一 1、最后 user 断言、尾部 assistant、双读稳定、停止键不可见、非前轮 SHA、长度合理）。

## 三项裁定（摘要）

| 问题 | ChatGPT 裁定 | 主要风险 | 最小下一步 |
|---|---|---|---|
| ① AIS 任务详情 | **有条件认可**：信息展示缺失与白字是两件事；不能拿当前 main 的 JobDetail.vue 当生产源码（该版本无 `<pre>` 节点），故不断言 CSS 根因 | 私有输入媒体泄露、信息缺失 | 锁定实际生产源码版本；修 pre 前景/背景对比；后端明确设计稿 vs 参考图角色；前端按角色展示鉴权缩略图（只返回媒体 ID/类型/角色，不暴露永久私有存储地址，Blob URL 卸载即撤销） |
| ② BMS 综合报价 | **有条件认可修复方向，SQL 语义未 PASS**：根因链成立，但两个 commit 不能替代 SQL 实际结果验证 | JOIN 重复计价、价格分类错误 | 只读核对 `299b7262` 完整 SQL diff / 表结构 / 数据样本；确认聚合键、报价有效性、分类字段（purchase_type 50/99）、金额与明细对账；部署后用同一 scheme 做 6 类样本对照，不能只看页面不再是 `—` |
| ③ GDC 3D 白块 | **现有门禁不予通过**：GLB Ready ≠ 视觉资源就绪；三类竞态（贴图晚到、wallFade 中间帧、renderFinalFrame 早于纹理就绪）均未闭环；场景 generation 隔离开销亦需确认 | 白块/未就绪参考图进入真实生图，出图不合理 | 在 `sceneReady.ts` 上补资源生命周期（pending→ready/failed、`discoverySealed`、generation/token、必需 vs 非必需失败、`renderFinalFrame` 作最终屏障）；补 G1–G11 mock（含 G11 图片实际内容检查）；最后才做浏览器延迟加载复测。不要推翻 ThreeView 渲染架构 |

## ChatGPT 的独立验收原则

- AIS 要证明**信息正确展示且私有数据没有越权**；
- BMS 要证明**价格计算正确，而不只是页面有数字**；
- GDC 要证明**截图实际内容已就绪，而不只是代码认为资源就绪**。

三项不能用同一套 PASS 标准；Mock 通过不得宣称为生产通过。

## 本轮边界

ChatGPT 被要求只审查、不改码、不部署、不付费；其回复中的"不允许"是给我方本轮讨论的范围约束，不替代用户对实际修复/发布的拍板。DEC-010（main 合并 / 生产发布 / 数据删除须用户本人拍板）与 L-023（真实付费需授权）继续有效。
