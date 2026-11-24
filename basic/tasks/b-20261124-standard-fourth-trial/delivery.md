# AIEO 标准版第四次试运行测试报告

- 任务包：`b-20261124-standard-fourth-trial`
- 日期：2026-11-24
- 工作模式：`standard/WORKFLOW.md`（按用户版本词绑定规则自动读取）
- 并行模式：**M2 受控多任务**（用户「可以拆成多任务」授权按需启用；两条写入线 + 三条只读验证线）
- 版本：AIEO Standard / S3
- 边界：全程未合并主分支、未由本人做生产发布；三个业务修复分支均已 push 远端功能分支（DEC-138/139，本次仅推送 AIEO 治理文档供审查）；经用户明确授权实测**一笔**真实生图（仅 1 次成功尝试，无重复计费）；DEC-010 保持。

## 1. 任务池与并行治理

| # | 任务 | 形态 | 状态 | 隔离 |
|---|---|---|---|---|
| 1 | 摸清现场（BMS 代码/SQL 链/生产入口） | 只读 | 完成 | 主会话 |
| 2 | 任务 A：BMS 综合报价产品价格/人工价格修复 | 写入 | 完成（本地） | bms-service / bms-ui 各独立 worktree + `task/bms-quote-price-be` 分支 |
| 3 | 任务 B1：生产验证 GDC（R1/R2/R3 + auto 尺寸） | 只读 | 完成（含未决项） | 浏览器只读会话 |
| 4 | 任务 B2：生产验证 AIS（R2 排序 + R3 详情） | 只读 | 完成（含未决项） | 同一只读会话，未跨任务写入 |
| 5 | 任务 B3：生产验证 BMS 报价预览 | 只读 | **BLOCKED** | 企业微信扫码/账号密码登录，本会话无凭据 |
| 6 | 测试报告 | 文档 | 完成 | 本包 |

**M2 五指标复盘：**

| 指标 | 结果 | 说明 |
|---|---|---|
| 工作区污染 | 0 | 两处修改均在新建 worktree；bms-service master、bms-ui master 原工作区未动 |
| 文件/分支冲突 | 0 | 两仓分支互不重叠；公共资源（WORKFLOW/decision-log）本轮仅追加登记，单写者 |
| 派单归属错误 | 不适用 | 本轮未启用 ChatGPT 派单/采集，指标无样本 |
| 验收会话串用 | 0 | 浏览器会话只读，GDC/AIS 验证按页签切换，无跨任务写入 |
| 并行净收益 | 正 | Maven 编译等待期间完成 GDC/AIS 生产只读验证；两写作线互不阻塞 |

如实登记：M2 四件套对「纯只读验证任务」没有明确豁免条款（沿袭 DEC-132 P0-2 问题），本轮按「只读不写、不占用 worktree/分支」处理，建议后续补条款。

## 2. 任务 A：BMS 综合报价价格未读取——根因与修复

### 根因（两层，缺一不可）

1. **后端 SQL 没取数**：综合报价页 `loadSchemeDetail()` 调 `case/scheme/{id}/items/sortedByGroup` → `CaseController.getLatestSchemeSortedDetailByCase`（CaseController.java:2362）→ `caseService.getGroupSchemeItemsById` → bms-service `SchemeController.getGroupSchemeItemsById`（SchemeController.java:765）→ `SchemeServiceImpl.getGroupSchemeItems`（SchemeServiceImpl.java:1443）→ `SchemeItem.xml#selectGroupModelListBySchemeId`。该 SQL（原 160–195 行）**既未 select 也未计算 `sku_price/artificial_price`**；同文件 `selectGroupModelListBySchemeId2`（轻搭口径）反而有。
2. **前端 VO 丢字段**：列表行来自 `SchemeDetailTreeVO`，其父类 `SchemeDetailVO` 没有 `skuPrice/artificialPrice`；`CaseController.toTreeNode`（:4060）用 `BeanUtil.copyProperties(item, treeVO)` 拷贝 DTO→VO，没有目标字段，值在服务端就被丢掉。此前前端 R2-A 只加了展示列与「缺数据显示 —」占位，A-BE 数据流未实施。

### 修复

| 仓库 | 分支 / commit | 改动 |
|---|---|---|
| bms-service | `task/bms-quote-price-be` / `299b7262` | `SchemeItem.xml#selectGroupModelListBySchemeId`：新增按 `scheme_item_id` 聚合 `quote_detail` 的 LEFT JOIN 派生表（purchase_type 50/99 归人工、其余归产品，口径与 SchemeId2 逐字一致），外层 `sum(sku_price)/sum(artificial_price)` 等四列；保留原 LEFT JOIN 语义，不丢无明细行 |
| bms-ui | `task/bms-quote-price-be` / `b1b85257` | `SchemeDetailVO` 增 `skuPrice/artificialPrice` 字段与 getter/setter，使 `BeanUtil.copyProperties` 能把值带到前端表格 |

### 验证

- 两仓 `mvn -q -DskipTests compile` 均 exit 0。
- MyBatis XML 通过 `minidom.parse` 结构校验；diff 仅 1 文件（service 14+/1-，ui 24+）。
- **运行时 DB 验证（DEC-139 已升级为生产实跑 PASS）**：初次报告时本机无对应 MySQL/生产库、未做运行时验证；2026-11-24 按用户提示经白名单跳板连生产库只读实跑修复后 SQL——13 行全部有价格值，`SUM sku + SUM artificial = SUM price = 54184.1 = 生产 totalPrice`，分类与关键行均正确。页面四层复验仍待 codex 部署后执行。详见 `three-issues-delivery.md`。
- 回滚：两 worktree 分别 `git reset --hard <父提交>`（service `b13d18cf`、ui `63ac9b17`）。

## 3. 任务 B：生产验证（codex 已发布今日代码）

原始观察见 `evidence/prod-verification-notes.md`，截图见 `evidence/*.png`。

| 编号 | 验证项 | 结果 | 依据 / 限制 |
|---|---|---|---|
| A1 | AIS 任务详情显示客户端输入参数（R3） | **PASS** | 任务 `e3c27ba6…` 有「客户端输入参数/提示词原文/生成参数（含产品组成/占比约束）」区块 |
| A2 | AIS Garden 入口供应商排序可编辑（R2） | **PASS（UI/文案层）** | `/ai-console/#/vendors` 有上移/下移/保存顺序，文案说明经 Garden 网关代持凭证并留审计；顺序 in→悟空→远桥云 |
| A3 | 排序保存写回生产全局路由 | **NOT VERIFIED** | 需点击保存产生生产写入，本轮未授权，不做写操作 |
| A4 | GDC 生图记录详情输入参数/原图（R3） | **PASS** | 任务 `7da05774…` 展开后有提示词全文、原始上传设计图、产品参考清单（score/rank/占比）、未入选原因、机位快照 |
| A5 | 产品占比进入 AIS 请求（R1） | **生产端到端 PASS** | 用户授权实测一笔：任务 `8c472c6c-5806-400f-a12d-8ae7fbe48184`，生产 AIS 详情 `params_json` 含 2 条 `product_constraints`（deck/柚木色、大号长花箱/星芒灰，含 score 与 screen_coverage）；本地 33+16 契约测试亦全过 |
| A6 | size 缺省 auto | **PASS（本笔实测）** | 新任务 `params` 无 `size/quality`，结果图 **1918×820** 非方图、非 2048 硬编码，符合设计画幅；不宣称 auto 一定匹配参考图比例 |
| A7 | BMS 综合报价价格列线上取值 | **问题复现 PASS（修复待部署）** | 用户已登录后实测：综合报价 21 个行节点两列全显示 `—`；直接 fetch API 确认 JSON 中 `skuPrice/artificialPrice` 两个 key 根本不存在，精确复现根因 #2。本地修复已提交两仓分支，待 codex 部署后复验出值 |
| A8 | S1 缓存热启动截图门 | 沿用既有结论 | 11-24 既有复测为 PARTIAL / NOT VERIFIED（仅刷新后渲染+菜单可展开），本轮不扩范围、不改历史裁定 |

## 4. AIEO Standard 试运行评估

**有效点：**
1. 版本词→WORKFLOW.md 的绑定规则生效，开工口径明确；多任务拆池后两项写入任务与三项只读验证互不阻塞。
2. 根因定位穿透两层：没有停在「前端加占位列」，而是追到 MyBatis SQL 没取数 + VO 拷贝丢字段，修复最小化（两文件、合计 39 行）。
3. 只读验证坚持不写生产：排序保存未点；付费生图只在用户明确授权后实测一笔，且只点一次预设、成功后立即停手。

**不足与改进：**
1. BMS 生产登录阻塞已由用户消除；线上问题已精确复现（API 无 key + 前端全 `—`），但本地修复未部署，仍不能宣称线上已修好。
2. R1 与 auto 尺寸起初因无现成样本（生产 103 笔中 0 笔带 product_constraints）零成本不可达；先本地契约自测（33+16 passed），后按用户授权补一笔生产实测，现已闭环。教训：应先查生产历史请求再判断是否需要付费实测。
3. M2 四件套对只读验证任务无豁免条款（DEC-132 P0-2 重现），建议补一条明确「只读验证不占 worktree/分支，但须登记会话与页签」。
4. 本轮无 ChatGPT 派单，Standard 的派单/采集/SHA 绑定能力未被测试，不能据此宣称该环节可用。

## 5. 未决项与最小后续动作

1. codex 部署 bms-service `299b7262` + bms-ui `b1b85257` 后，复验合同 `SO2611169704` 同一报价页综合报价两列是否出值并回写本包（SQL 层已由生产实跑对账 PASS，待验页面/VO/API 三层）。
2. ~~用户授权一次真实 GDC 生图~~ 已完成：任务 `8c472c6c-5806-400f-a12d-8ae7fbe48184` 生产 PASS（product_constraints + auto 尺寸 + 非方图结果），无需再付费实测。
4. 排序写回验证需在明确授权的生产写入窗口进行，避免影响全局路由。
5. PostgreSQL 隔离迁移演练仍缺环境（沿用 `DEV-PR-READINESS.md`），本轮未重复。
