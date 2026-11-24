# Codex 交接：BMS 综合报价价格修复部署

**一句话（给 codex）：** 请部署 `bms-service` 分支 `task/bms-quote-price-be` @ `299b72629a586fd108be1a3d8a3d3d32c45d69c5` 与 `bms-ui` 同分支 @ `b1b852572df0f15eccaa8ade57547f68689344e7` 到生产，并回告部署时间与版本指纹。

## 核对指针

- SQL 静态语义核对：`bms-sql-review.md`（五项风险 + 补充项逐条通过；ChatGPT 裁定见 `gpt-discussion-result.md` / DEC-137）。
- 生产基线样本：合同 `SO2611169704` / scheme `2125121801040719874`，综合报价 21 行价格列全 `—`，接口 `items/sortedByGroup` 无 `skuPrice/artificialPrice` key。
- 总账：retailSkuPrice=52356、skuPrice=260、laborPrice=60、baseMaterialPrice=8.1、freightPrice=1500、totalPrice=54184.1。

## 部署后请回告

1. 部署时间、两仓生产版本指纹（bundle/镜像/commit）。
2. 我在同一样本上复验接口四层（SQL→VO→API→页面）与 6 类金额对照（产品类/50/99/无明细/多明细/混合）。

## 边界

- 未合并 main/master，本次仅功能分支部署；DEC-010 仍须用户拍板才能合并或做其他生产发布。
- 静态核对不替代运行结果；部署后以实际接口与页面对账为最终结论。
