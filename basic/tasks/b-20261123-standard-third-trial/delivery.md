# AIEO 标准版第三次试运行测试报告

- 任务：`b-20261123-standard-third-trial`
- 日期：2026-11-23 ～ 2026-11-24
- 版本：AIEO Standard / S3 / M1 单任务交替推进
- 目标仓库：GDC、AI-Image-Service（AIS）
- 报告状态：**本地实施与零费用验证完成；生产未发布新代码；付费业务验收未执行**

## 1. 需求与最终口径

| 项 | 最终结果 |
|---|---|
| R0 GDC 重拉与缓存合并 | dev 更新至 `c3154aa0`，PR#127/#128 合并事实确认 |
| R0' 重新发布复核 | bundle 特征证据归档，用户热启动抽测通过（「还行」） |
| R1 产品占比清单 | 本地实现：冻结 selected 同源双写 prompt 区块与 `params.product_constraints`，原图/去重链不改 |
| R2 花园入口供应商排序 | 本地实现：GDC 仅放行 `PUT /ai-console/routing/order`，AIS Garden 代理页允许排序保存，审计与权限保留 |
| R3 任务详情输入参数 | 本地实现：GDC与AIS原生admin详情均展示客户端输入；GDC原始上传设计图与产品原图可视展示，AIS显示prompt原文与params/product_constraints |
| 尺寸需求 | 经文档与用户复核，最终为：**未显式传 size/quality 时不硬编码固定尺寸，沿用 auto；未来尺寸由前端显式选择并按设计画幅映射** |

重要：最初“默认 2K”不再实现为全局 `2048x2048`。1480×1100 等设计稿不得被强制改成方图。早前写入 220/221 供应商配置的固定尺寸已从 `.bak-20261123` 全部回滚。

## 2. 被测提交（L-017 完整 SHA）

| 仓库 | 提交 | 内容 |
|---|---|---|
| GDC | `1a77baadbc2c041faaa0168963e96b0fe6f3e3c4` | R2/R3 控制台排序与任务详情 |
| GDC | `abf40b2bc77b73d0aa280e21d8568978fe83e03b` | R1 产品约束双写（其中固定尺寸随后被下一提交撤销） |
| GDC | `16555dea8d0f3cc248234225d3f6bf78fb7be6a1` | 取消尺寸硬编码，保持 auto/未来前端显式传值 |
| GDC | `021de64a0f101a9522bd75c3036786bbf8339564` | 任务详情补显原始上传设计图，闭合 issue#126 媒体缺口 |
| GDC HEAD | `0a5a4ec59b71bc3af41aa99ac82808767ffa785a` | 产品名称改用权威 catalog()，修复全量对照发现的2项回归 |
| AIS | `146ea3cfdfd2aae2b0e18c93e17c83da042d4690` | Garden 代理入口排序编辑 |
| AIS | `e442fbabe5bd3954e689faf3b256a4e2be311402` | 最终 `_post_raw` 出站参数覆盖链测试 |
| AIS HEAD | `418087c31e8765ba48fd765ab3c9a50cc21b2458` | 原生AIS任务详情展示prompt原文与params/product_constraints |

分支：GDC `feature/product-constraints-auto-size-20261124`；AIS `feature/garden-proxy-order-edit-20261123`。均**未合并 main/dev**。推送授权询问未获回答，本报告生成时按未推送处理；代码 diff 已归档 `acceptance/code-diffs/`。

## 3. 零费用测试结果

| 套件 | 结果 | 证据 |
|---|---|---|
| GDC AI 相关后端（含 R1/R2/R3、选品、外部服务、prompt） | **119 passed** | `acceptance/test-logs/gdc-ai-catalog-fix.log` |
| GDC R1+外部服务 mock | **31 passed** | 同上；三计数一致、缺省 auto、旧任务不注入、非法 422 |
| GDC product_constraints 纯单元 | **21 passed** | 正常映射、缺 variant、顺序、HALF_UP、NaN/Infinity/越界、name fail-closed |
| GDC 前端 vitest | **220 files / 3284 passed / 14 skipped** | `acceptance/test-logs/gdc-vitest-abf40b2b.log` |
| AIS 最终出站 capabilities | **16 passed** | `acceptance/test-logs/ais-capabilities-e442fba.log` |
| AIS admin API | **19 passed** | `acceptance/test-logs/ais-admin-api-418087c.log` |
| AIS JobDetail | **3 passed** | prompt与product_constraints显示 |
| AIS 前端 vitest | **42 passed** | R2 Garden 代理排序用例含在内 |
| AIS 后端全量（新增出站测试前一轮） | 571 passed / 13 failed / 1 skipped | 基线对照：admin_auth/migrations/config 等 12 项基线同挂；failover 单跑通过=flaky |
| GDC 后端全量对照 | 基线 3301 passed/194 failed/3 errors；16555dea 3336 passed/196 failed/3 errors | 仅2项新增失败，均为R1名称事实源误用；已在0a5a4ec修复并经相关119项测试验证。其余197项失败/错误基线同现 |

所有本轮新增/修改测试均为本地 mock 或纯单元测试，**未调用真实供应商生成接口**。Mock 覆盖 GDC→AIS 请求参数与 AIS→Provider 最终 `_post_raw` 出站 size 覆盖链。

## 4. 官方文档与参数结论

- 远桥官方 Images API 文档已归档：`acceptance/ais-2k-default/docs/yuanqiao-images.html`，SHA256=`b3c0a51d9103a5ca08088c0340342e36dfa9cba9d56a01375a7c1f14db7c1413`。文档列出 `gpt-image-2.6-sunburst`，GPT Image size 使用像素 `宽x高`，1:1 的 2K=`2048x2048`；这不是强制所有设计稿为方图的依据。
- 悟空官方 `gpt-image-1` edits 文档已归档：`docs/wukong-gpt-image-1/gpt-image-1.md`，SHA256=`cba9e3fea59dd4c8dff05f7a8619da8f556cd51b05af4502f06df4b2b7c2441c`。quality/size 默认 auto，但该文档不覆盖当前 2.6 sunburst，2.6 独立契约仍为 UNKNOWN。
- `auto` 可让模型自动选择尺寸；“保证与设计参考图完全同画幅”未获官方承诺，不宣称该能力。
- 参数接受、输出符合、实际计费三态独立；本报告不宣称 `BILLING_CONFIRMED`。

## 5. ChatGPT 派单与裁定证据

| 轮次 | 结果 | reply SHA256（前缀） |
|---|---|---|
| planning R1 | 产品约束方案裁定 | `1fe0f3a3…` |
| planning R2 | MF-01/MF-02 契约裁定 | `7f3def1c…` |
| planning R3 | 2K 档位裁定，不批准无证据统一切换 | `4bb41bc0…` |
| planning R4 | 付费接口四阶段测试门禁 | `74ca76a1…` |
| test-acceptance R1 | 仅描述审查，代码 diff 不可读，暂不通过 | `a58d9a5b…` |
| planning R5/R6 | 取消固定尺寸、auto 与画幅证据边界 | `147044d8…` |

均归档于 `acceptance/recoll-*/reply.txt` 与 queue 证据。已发送轮次零重发；fail-closed 均按 L-018 只读补采、七查与 reconcile 闭环。R5 首次 `NOT_SENT` 由端口归属失败引起，确认未发送后才换新 round。

## 6. AIEO Standard 试运行评估

### 有效点

1. 任务包、开工核对、简报字节计量、queue 唯一入口、reply SHA 绑定和证据归档均可执行。
2. GPT 裁定实质改变实现：MF-01 缺失颜色、MF-02 HALF_UP、付费测试分层、auto 参数来源均被前置约束。
3. 首跑发现 queue 归因缺陷：assistant 回显 round marker 被跨角色误计，已限定 user 单元并加回归测试（12 tests OK）。
4. 用户纠偏能被固化：L-023 文档先行、禁止黑盒、真实付费需授权、按业务影响测试、需求先以文档校准。

### 不足与改进

1. 开工未先读第三方文档，导致尺寸需求多次返工，并产生不必要的真实调用费用；这是本任务最主要流程失误。
2. queue 采集多次遇虚拟列表/键漂移，六轮成功回复均需要补采，采集稳定性仍需改进。
3. GPT 在无法读取代码时只能做描述级审查，R2 曾被误解为 SQL 排序、R3 被误解为可编辑参数；这些不适用项未据此扩改代码，需逐文件复审才能最终关闭。
4. M1 单任务流程成立；本任务未启用 M2，不宣称并行指标。

## 7. 限制、未决项与发布边界

- **生产发布：未执行。** main/dev 未合并，DEC-010 保持。
- **付费业务验收：未执行。** R4 后无真实生成调用；后续须按官方文档、业务影响和用户授权进行，不再做参数矩阵式扣费探测。
- **ChatGPT 逐文件复审：未完成。** 第一轮无法读取本地 SHA；功能分支推送需授权，未获回答不擅自建立 upstream。
- **GDC 全量后端：环境并非全绿。** 早期失败需继续逐项基线对照，不能把“目标套件全绿”包装成“全仓全绿”。
- 221 AIS 容器栈处于停止状态，本次仅恢复配置；未做启动验证。
- 临时 220 口令辅助文件已删除；报告与证据不记录密码、API key 或 admin token。

## 8. 后续最小动作

1. 用户决定是否推送两个 feature 分支；推送后让 ChatGPT 按完整 diff 做第二轮逐文件验收。
2. 完成 GDC 全量失败的基线分类，只修复与本改动相关的回归，不顺手处理无关历史问题。
3. 若开发前端尺寸选项：按设计画幅和供应商文档计算唯一 size，冻结 OMIT/EXPLICIT 语义，不在后端另造固定默认。
4. 真实业务验收另行提交目的、范围、次数与成本上限，经用户明确同意后执行。
