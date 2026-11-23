# BMS R2-A 前端流（A-FE）实施记录

- 授权：用户 2026-11-23 "BMS的修改方案我认可，你可以先建立子agent改BMS页面吧"
- 实施时间：2026-11-23
- 隔离：独立 worktree `D:\YotinGarden\bms-ui-r2a-worktree`，任务分支 `task/bms-quote-r2a-fe`，父 commit=`cf79e4c2d2b78ec6f27bbc0c76a8c274f5ca0d36`；主 worktree `D:\YotinGarden\bms-ui` 全程未动（master 仍 `cf79e4c2`）。
- 子 agent：code-explorer 子会话产出手术级补丁方案；因该子 agent 工具集为只读，补丁由主会话在隔离 worktree 内按其方案逐条落地并实查验收（如实登记，不冒充子 agent 写码）。

## 改动（仅 1 文件，24 插入 8 删除）

`src/main/resources/static/views/saleOrder/scheme_detail_preview_v2.html`：
1. 页签文案 6-9 行：项目报价→综合报价、产品清单→零售报价、人工服务清单→人工服务报价；轻搭报价不变；`<li class="layui-this">` 与 tab dispatch（原 371-386）未动。
2. `buildSpecRemark`（~503-511）新增 `formatBareThickness`：仅当整个 spec 是纯厚度 `40mm` 时格式化为 `厚度：40mm`；`600×600`/`草皮 40mm`/`长度:2m` 等一律原样；不推断长宽。
3. `loadCaseGroupSchemeDetail` 的可见表 cols1（原 1363-1406）与 cols2（原 1407-1421）：`购买pcs`→`购买数量`、`每pcs单价`→`单件价格`，templet 计算逻辑逐字不变；各新增两列 `skuPrice`→产品价格、`artificialPrice`→人工价格，缺数据（undefined/null/空串）显示 `—`，不重算金额。
4. 导出表（原 1455+）、`downExcel`/`downExcel3`/`downExcel4`、所有 print 函数、pcs 的 Excel 表头（原 1673-1674）全部未动。

## 验收（主会话实查）

- `git diff`：24 插入 8 删除，仅该文件，4 处 hunk 与上表一一对应。
- grep：剩余 `购买pcs`/`每pcs单价` 仅在导出区 1478/1488/1532/1542 与 Excel 表头 1673-1674（+一条注释 520），可见表 1363-1434 内已清零；新增展示列仅在可见表 1407/1410/1431/1434。
- 页签：6-9 行为 轻搭报价/综合报价/零售报价/人工服务报价。
- read_lints：0 diagnostics。
- `node --check` 内联 script：修改版与基线版同样 3 个 block 报模板语法（`{{# if(...) }}` 与 `<div>` 混排，layui 模板非纯 JS，既有误报）——**零新增回归**。
- 运行时数据展示：未测（本仓无可执行前端服务；且后端 skuPrice/artificialPrice 无赋值，A-BE 未实施，运行时两列预期显示 `—`）。

## 提交

- 任务分支 commit=`63ac9b17b5bf9de20301afb34ee0c79045cf30a3`，parent=`cf79e4c2d2b78ec6f27bbc0c76a8c274f5ca0d36`。
- **未合并 master、未 push**——按 DEC-010 红线与用户授权边界，合并/发布须用户另行拍板。
- 回滚：`git -C D:\YotinGarden\bms-ui-r2a-worktree reset --hard cf79e4c2d2b78ec6f27bbc0c76a8c274f5ca0d36`。

## 遗留

- A-BE 后端数据流（行级 skuPrice/artificialPrice 赋值、行级整装标识、销售单位/草皮规格映射）未实施，两列当前只会显示 `—`；按裁定先并行补证再启用。
- A11-A20 验收基线待用户确认；合入主分支前须补运行时截图回归（含重量导出、金额不重算、人工/轻搭不回归）。
