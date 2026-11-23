# 本地盘点：BMS 报价预览（R2-A 第一步"页面/接口/字段/导出入口盘点"）

- 时间：2026-11-23
- 仓库：`D:\YotinGarden\bms-ui`，master，基线 `cf79e4c2d2b78ec6f27bbc0c76a8c274f5ca0d36`（只读）
- 主文件：`src/main/resources/static/views/saleOrder/scheme_detail_preview_v2.html`（下称 v2）
- 方法：静态代码检索（read-only），所有结论绑定 file:line；未改目标仓库任何文件。

## 1. 页面入口/页签现状（对应 R2-A ① 三个核心入口）

v2 四个页签（line 5 `id="tabList"`，line 371-386 `element.on('tab(quote_order_detail_preview)'`）：

| 序 | 当前标签 | 行 | 面板/加载器 | R2-A 目标 |
|---|---|---|---|---|
| 1 | 轻搭报价 | 6 | `#qingDaList` 23 / `loadQingDaTb()` 371-375 | 保留不动 |
| 2 | 项目报价 | 7 | `#caseGroupTable` 32 / `loadSchemeDetail()` 376-378, 595-715 | → 综合报价 |
| 3 | 产品清单 | 8 | `#skuList` 71 / `loadCaseGroupBimDetail()` 379-381, 716-746 | → 零售报价（保留含重量导出） |
| 4 | 人工服务清单 | 9 | `#artificialListTable` 85 / `loadArtificialList()` 382-384 | → 人工服务报价（业务逻辑不动） |

关键结论：无 `:contains`/按标签文本选页签的逻辑，`#tabList` 只在 line 5 出现一次。**仅改 4 个 `<li>` 文本不会破坏任何 handler**；但导出/打印标题与文件名是硬编码字面量（见 §4），R2-A 明令不改。

## 2. 整装识别与价格字段（对应 R2-A ② 整装价格拆分）

- `SchemeItemDTO` 定义 `d:/YotinGarden/bms-ui/src/main/java/com/ecog/web/bms/service/dto/SchemeItemDTO.java:13-464`：`spec`:96、`modelUnit`:112、`unitPrice`:116、`skuPrice`:124、`artificialPrice`:132、`pcsQty`:157，getter/setter 163-185。
- **全仓无任何 `SchemeItemDTO.setSkuPrice(...)` / `setArtificialPrice(...)` 调用点**（仅 setter 声明 167/183）；`CaseController.java:2052-2199` 创建 SchemeItemDTO 行只 set name/qty/unitPrice/price 等，不 set 这两个字段。本仓无 `*ServiceImpl.java`（服务层在远端），无法从本仓证明行级赋值成立。
- **无行级"整装"标识**：DTO 无 type/整装 boolean/purchase-type；仅有合同层 `ContractTypeEnum.GardenDesignAndInstall(1,"整装合同（特殊情况）")` `service/enums/ContractTypeEnum.java:9`，用于 `ProjectController.java:465,500-516`（合同/项目层，非行层）。行样式前缀 `'S'`（v2:1579-1583,1604-1608）是分组/合计标记，不是整装。
- 合计层 `regularSkuPrice` 在 `service/param/project/ProjectInfoParam.java:135`、`dto/project/ProjectInfoDTO.java`(~303)，报表列"整装产品额"在 `views/report/finance/designer_month_cost_report.html:209,221`。

**裁定**：R2-A 若要展示整装行 skuPrice/artificialPrice，**前置条件是后端在行级 DTO 暴露这两个字段并给出整装行标识**；本仓不具备，不能靠前端猜。与 R1"先 S1 代码核查再定前后端范围"、R2"先盘点再动 HTML"完全一致。

## 3. 规格与销售单位（对应 R2-A ③ 规格可读化 ④ 单位）

- 规格渲染：`buildSpecRemark` v2:503-511（`item.spec` 原样拼接）、单元格模板 545/584（`(opts.spec||'')`）、轻搭 803、零售产品卡 830 `escapeHtml(d.skuSpecs||'')`、项目报价树表 1366/1406 `field:'spec'`、隐藏导出表 1496-1508/1528-1540。
- Java：`SchemeItemDTO.spec`:96（String）、`SchemeDetailVO.spec`:29；`skuSpecs` 在 `WarehouseBomItemVO:18` 等均为 String。**预览相关 DTO 中无结构化 length/width/thickness 或 40mm 语义字段**；结构化 `length/width/height` 只在 `SchemeParam:220-222`、`SkuExportParam:91-99`、`SkuCodeImportPreviewRow:18-22` 等导入导出参数中，辅助 `SkuCodeSpecUtil.buildSpec(...)`:151。
- 销售单位存在但不在预览 DTO：`ModelItemDTO.saleUnit`:26-36、`BomItemDTO.saleUnit`:23/`weight`:97、`QuoteDetailDTO.skuSaleUnit`:34-36、`ModelItemParam.saleUnit`:24-26。产品卡用 `d.unit`（v2:829，导出 1729/1762），未映射到 `skuSaleUnit`。仓库内无 `*.sql`，无法核验 DB 字段。

**裁定**：规格"草皮长宽/40mm厚度"源数据治理=后端数据侧工作；前端只能对已有字符串做可读化，不能臆造。单位替换同理：先补 DTO 映射+源数据核验，再换文案。

## 4. pcs 与导出/打印入口（对应 R2-A ⑤ pcs 与 A07/A10 冻结边界）

- v2 中 `pcs` 共 22 行：可见表列 `购买pcs`/`每pcs单价` 在 1369-1373/1379-1384/1409-1413/1419，隐藏导出表 1462-1466/1472-1477/1516-1520/1526，计算 516-518，`downExcel` 1623-1628，Excel 头 1642/1657-1658。
- 关联 v1 页 `scheme_detail_preview.html` 22 行（624-625…1237-1238）、`sale_order_scheme_edit.html` 3 行（786-796）、`sale_order_quote_edit.html` 6 行（303-311…1062）；四文件合计 53 行。

导出/打印入口（v2）：

| 按钮 | 行 | handler | 实现 | R2-A 处置 |
|---|---|---|---|---|
| 打印轻搭报价单 | 25-26 | 422-427 | `printQingDaTb` 875-899 | 不动 |
| 导出报价单(综合) | 63-64 | 390-394 | `downExcel` 1615-1671 | 不动 |
| 打印报价单(综合) | 65-66 | 395-399 | `print('caseGroupTableExport')` 1780-1834 | 不动 |
| 打印产品报价 | 74-75 | 407-411 | `printTable` 1835-1859 | 不动 |
| **导出产品清单(含重量)** | 76-77 | 412-414 | `downExcel3` 1718-1746（`weight:'weight'`:1731，`重量`:1741，排除 purchaseType===60/SP_MEASURE_FEE:1719-1722） | **必须保留** A07 |
| 导出产品报价单 | 78-79 | 415-417 | `downExcel4` 1747-1779（重算 totalPrice 1754-1756） | 不动（R2-B 再改） |
| 导出人工服务清单 | 89-90 | 431-433 | `exportArtificialList` 1246-1360（标题 1295） | 不动 |
| 打印人工服务清单 | 91-92 | 434-436 | `printArtificialList` 1217-1228 → 1860-1881（标题 1210-1215） | 不动 |

标题/文件名硬编码：1215、1262、1295、1664/1716/1745/1778（部分取 `$('#spanTitle').html()`）。**改 `<li>` 标签文本不影响导出 handler；但改这些字面量就会改导出打印输出——R2-A 禁止。**

## 5. R2-A 实施就绪判定（本轮结论）

前端可独立安全改（第一阶段）：
- 页签/入口文案（line 6-9），三个报价入口显眼化（A01）；
- 综合报价可见表 `cols1/cols2` 1363-1421 增列展示产品价/人工价/综合金额（A02）——**但字段值依赖后端，见下**；
- 可见表 pcs 文案替换 1369/1379/1409/1419（A04），隐藏导出表与 `downExcel` 保持；
- 规格字符串可读化仅作用于已有 spec（A05），不推断。

必须后端先行（阻塞项）：
1. 行级 `skuPrice`/`artificialPrice` 暴露 + 整装行标识（否则 A02/A04 无法真实展示）；
2. 销售单位字段映射到预览 DTO（否则 A04"优先实际销售单位"无数据源）；
3. 草皮长宽/厚度的源数据（否则 A05 无真实值可显）。

**最终建议（回应"是否按 R2-A 开始"）**：可以按 R2-A 开始，但严格按 ChatGPT 建议"先代码盘点→再实施"，且实施必须拆成两条并行子流：前端流（页签/文案/可见表展示/规格可读化，不动导出打印）+ 后端数据流（行级 skuPrice/artificialPrice + 整装标识 + 销售单位 + 草皮规格）。前端流若无后端数据，展示位只能留空/显示"—"，不得伪造金额或单位。本轮不擅自改码，待用户明确授权实施范围后另立实施任务。
