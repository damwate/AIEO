# 供应商官方契约证据（L0，零费用）

## Yuanqiao（远桥）

- 官方文档：https://docs.yuanqiaoyun.com/zh/docs/api/images
- 获取时间：2026-11-24（本地归档）
- 快照：`docs/yuanqiao-images.html`
- 快照 SHA256：`b3c0a51d9103a5ca08088c0340342e36dfa9cba9d56a01375a7c1f14db7c1413`
- 模型：文档列出 `gpt-image-2.6-sunburst`；generations 与 edits 均适用。
- size 规则：GPT Image 使用 `宽x高` 像素串；1:1 的 2K 明确为 **`2048x2048`**；不把 `1K/2K/4K` 写入 quality，也未规定 GPT Image 的 size 接受档位串 `2K`。
- 缺省：由所选模型决定；不支持尺寸返回 HTTP 400。
- 计费：按次计费，具体价格与可用分组以模型广场和当前令牌权限为准；本文档无数值价格。`BILLING_CONFIRMED` 仍需账单。
- 证据状态：**E1 官方 API 契约已取得**，支持本任务选择 `size='2048x2048'` 作为远桥 1:1 2K 请求参数。

## Wukong（悟空）

- 官方文档（用户提供）：https://wukong.support/doc/index.html#/coding/gpt-image-1
- Docsify Markdown 源：https://wukong.support/doc/coding/gpt-image-1.md
- 快照：`docs/wukong-gpt-image-1/gpt-image-1.md`；SHA256=`cba9e3fea59dd4c8dff05f7a8619da8f556cd51b05af4502f06df4b2b7c2441c`；HTML 壳 `index.html` 同目录归档。
- 该文档适用模型=`gpt-image-1`：quality 可选 high/medium/low、默认 auto；size 仅列 1024x1024/1536x1024/1024x1536/auto（默认 auto）。
- **模型边界**：当前生产为 `gpt-image-2.6-sunburst`，此文档未覆盖 2.*，不得把 gpt-image-1 的参数集合或 auto 行为直接继承给 2.6。2.6 独立官方契约仍为 **UNKNOWN**；历史实测不补契约缺口。

## vendor-d5b728b6

- 不在当前 route_plan 使用集合内；未独立取证，不继承远桥结论。

## IntelAlloc（vendor-38a26ea7）

- 本次不纳入 2K 切换，保持既有配置；其 400 问题另行诊断，不做付费探测。
