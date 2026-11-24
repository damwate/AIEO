# BMS 综合报价修复：SQL 语义静态核对（按 ChatGPT DEC-137 裁定）

- 被测：bms-service `299b7262`、bms-ui `b1b85257`（均在 `task/bms-quote-price-be`，**未 push、未部署**）。
- 方法：只读核对完整 diff / 实体字段 / 枚举 / 既有同口径 SQL / 生产总账数据。本机无 MySQL、220 不可达，**未实际执行该 SQL**——不把静态核对冒充运行结果。

## 五项风险逐条核对

| 审查项 | ChatGPT 要求 | 核对结果 |
|---|---|---|
| LEFT JOIN | 明细缺失保留原记录 | **通过**：派生表 `LEFT JOIN ... p ON p.scheme_item_id=s.id`，无 quote_detail 的行 COALESCE→0，`scheme_item` 主链（JOIN model_info/model_tag）完全不动，行不会消失 |
| 聚合粒度 | 按业务唯一键聚合、不重复计价 | **通过**：派生表 `GROUP BY q.scheme_item_id`，先按每报价明细行聚合，再 1:1 挂到 scheme_item；外层 `sum()` 合并同一 model（单品用 t3.id）——与原 SQL 对 `price/qty/original_price` 的 sum 粒度一致，不存在一对多放大 |
| sku_price 分类 | 产品类取 SKU 价格 | **通过**：`purchase_type NOT IN (50,99) → sku_qty*sku_unit_price`，与同文件 `selectGroupModelListBySchemeId2`（轻搭既有口径）逐字一致 |
| artificial_price 分类 | 人工类取人工价格 | **通过**：`purchase_type IN (50,99) → sku_qty*sku_unit_price`，同上逐字一致；枚举确认 50=安装基材、99=安装人工，1/5/10/40/45/60 归产品，口径正确 |
| VO 映射 | SQL 别名 = VO 属性名/类型 | **通过**：SQL 别名 `sku_price/artificial_price/sku_original_price/artificial_original_price` 精确对应 `SchemeItemBO`/`SchemeItemDTO` 同名字段（BigDecimal），VO 新增 `skuPrice/artificialPrice` 与 `BeanUtil.copyProperties` 匹配 |

## 补充风险核对（ChatGPT 特别强调）

- **历史报价混入**：派生表 `WHERE q.scheme_item_id IN (SELECT si.id FROM scheme_item si WHERE si.scheme_id=#{id} AND si.is_deleted=0)`，与外层 `s.scheme_id=#{id} AND s.is_deleted=0` 同一方案、同一删除口径；不会混入其他方案历史报价。
- **SUM/MAX 不互换**：全程只用 `SUM`，与金额累计语义一致；没有用 MAX 掩盖重复。
- **字段存在性**：`QuoteDetail.java` 确认 `schemeItemId/skuQty/skuUnitPrice/skuOriginalPrice/purchaseType` 均存在。
- **前端不重算金额**：修复只新增两列展示值，`price` 的 templet 与导出/打印链零改动；合计仍取后端 `totalPrice`。

## 生产总账对照样本（部署后用于对账）

scheme `2125121801040719874`（合同 SO2611169704）生产 `quote/detail`：

| 字段 | 值 |
|---|---|
| retailSkuPrice（零售产品） | 52356 |
| skuPrice（整装产品） | 260 |
| laborPrice（安装人工） | 60 |
| baseMaterialPrice（安装基材） | 8.1 |
| freightPrice（运费） | 1500 |
| **totalPrice** | **54184.1** |

预期（部署后核对）：综合报价行级 `skuPrice` 汇总应覆盖产品类金额（零售 52356 + 整装 260 口径需按明细实际分布确认），`artificialPrice` 汇总应覆盖 60+8.1=68.1 的安装人工/基材；两列与 `price` 分别对应、不串位、不重复。具体逐行金额须以部署后接口实际返回与报价明细对账为准，静态核对**不宣称金额已验证**。

## 结论

五项 + 补充项静态核对全部通过；修复方向与 SQL 语义具备部署条件。**仍缺**：实际 SQL 运行结果（无本地 DB / 220 不可达）与生产页面复验。按 DEC-010 不自行发布，交接部署后补验。
