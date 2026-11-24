# 生产只读验证原始观察（2026-11-24）

> 本文件只记可核对的页面观察与坐标，不含任何口令/凭据。

## 环境

- GDC：`http://share.yotin.com.cn:8870`，admin 登录成功，进入工作台。
- AIS 控制台：`http://share.yotin.com.cn:8870/ai-console/`，顶栏显示「只读查询」「API 正常」。
- BMS：`https://bms.ecog.com.cn/`，HTTP 200，落到 `#/user/login`，要求「企业微信扫码登录」或「账号密码登录」；本会话无凭据，未登录。

## AIS 任务详情（R3 / R1 可见性）

- URL：`/ai-console/#/jobs/e3c27ba6-5403-4294-9f16-03e975faa38f`（11/24 11:28:19 创建，playground 发起，wukong 成功）。
- 页面有独立区块「客户端输入参数」，下含「提示词原文」「生成参数（含产品组成/占比约束）」。
- 该任务生成参数原文：`{ "n": 1 }`；输入参考图 0 张。无 size 字段、无 product_constraints 字段。
- 冻结路由计划：`in → wukong → yuanqiao`；失败后顺序切换到 wukong 并交付。

- URL：`/ai-console/#/jobs/c4264331-4a69-464f-821b-4414c6aad2b9`（11/23 19:13:46 创建，garden-design-calculator 发起，wukong 成功）。
- 生成参数原文：`{ "n": 1 }`；输入参考图 2 张。同样无 product_constraints / size。
- 结论：AIS 侧「显示客户端输入参数」的界面已上线；但现有任务均未携带 product_constraints，R1 请求契约无法从历史任务验证。

## AIS 供应商排序（R2）

- URL：`/ai-console/#/vendors`。
- 页面文案：「当前为 Garden 查询入口。排序编辑已开放：保存将写回全局路由（经 Garden 网关代持管理凭证并留审计）；供应商参数与模型能力仍请直连独立生图控制台。」
- 全局供应商调用顺序：`in → 悟空 → 远桥云`；每项有「上移/下移」按钮，首项上移与末项下移禁用；「保存顺序」按钮在未改动时 disabled。
- 全局默认路由策略：安全故障切换(failover,顺序)，顺序 `in → 悟空 → 远桥云`。
- 另有 12 条项目级 `priority_only` 策略。
- 结论：排序编辑 UI 与权限说明已上线；未点击上移/下移/保存，未验证写回生产全局路由（避免生产写入）。

## GDC 生图记录详情（R3）

- URL：`/admin/?tab=aiJobs`，时间段切到「最近 7 天」。
- 任务 `7da05774-3a9c-4fd6-975c-8846e933d0b6`（11/23 19:13:46，Garden 夜景，wukong，76.8 秒）。
- 「输入参数」列展开后含：
  - 提示词（服务端解析全文，约 8982 字符）；
  - 「原始上传设计图」`#1 ai-input/.../7da05774-...png · a61d6167`；
  - 「产品参考清单（排序依据：score 降序，即 rank 次序）」：`#1 deck 柚木色 · 评分 0.21 · 画面占比 4.8%`、`#2 自由花坛9090 柚木色 · 评分 0.07 · 画面占比 0.4%`；
  - 「未入选参考」含 beyond_budget / below_min_screen_coverage 原因与画面占比；
  - 「机位快照」JSON（camera position/target/fov、preset、sunTime）。
- 结论：GDC 侧任务详情的输入参数/原图/产品排序依据已上线。

## BMS 报价预览（用户已登录后的补充验证，2026-11-24 21:05 后）

- 路径：项目列表 → 合同 `SO2611169704`（项目编号 1756 / case 2401）→ 查看报价 → 项目报价 → 报价预览 → 综合报价。
- API：`GET /case/scheme/2125121801040719874/items/sortedByGroup`。
- 页面可见表头含「产品价格」「人工价格」，但 21 个行节点两列全部显示 `—`。
- 直接 fetch 该 API 并展开 children 后共 21 个节点，`skuPrice`/`artificialPrice` **两个 key 均不存在**（不是值为 null，而是 JSON 里根本没输出）；节点 key 列表示例：`id,parentId,editable,sortIndex,...,children,parent`。
- 结论：生产现场精确复现本地定位的根因 #2（VO 无字段导致 copyProperties 丢字段）；修复已提交在 `task/bms-quote-price-be`，待 codex 部署后复验两列是否出值。
- 截图：`bms-quote-preview-comprehensive.png`。

## R1 产品占比契约（本地自测，不触发付费）

- GDC：`cd /d/Garden-Design-Calculator/src/backend && PYTHONPATH=.. python -m pytest -q -p no:cacheprovider tests/test_product_constraints.py tests/test_external_ai_service.py` → **33 passed**（8.46s）。
- AIS：`cd /d/YotinGarden/AI-Image-Service/backend && python -m pytest -q -p no:cacheprovider tests/test_generic_jobs_capabilities.py` → **16 passed**（2.09s）。
- GDC 覆盖：冻结 selected 同源派生 prompt 与 params、`json.loads(post.content)['product_constraints'] == constraints`、edits multipart 含 `name="product_constraints"` 与 JSON 字符串、未传 size 时 `captured['params'] == {'n': 1}` 且无 product_constraints、名称权威源 catalog()、HALF_UP、缺颜色省略、fail-closed、重试稳定性。
- AIS 覆盖：接受 product_constraints 元数据、非法 shape 返回 422、params 显式 size 覆盖供应商配置、未传回落 auto。
- 均未调用真实供应商；production 请求内容仍需一次授权真实生图才能端到端确认（随后已按用户授权补测，见下节）。

## R1 生产真实请求实测（用户授权「测试一笔」，2026-11-24 21:11–21:14）

- 先查生产 103 笔任务（2026-11-01 起）：`product_constraints` 命中 0 笔；64 笔 `size:auto/quality:auto`，确认无现成样本，故实测一笔。
- 入口：东海岸方案7 `b60402ed-fc4a-45f5-b47a-b95831b8d565 / c8bbcd17-ba0e-4d7d-aa9c-74036be4b9c6` → 3D → AI 照片 → **夜景照（只点一次）**。
- 新任务 ID：`8c472c6c-5806-400f-a12d-8ae7fbe48184`，created `2026-11-24T13:11:47.904Z`（21:11:47 本地），source=`garden-design-calculator`。
- 请求参数（生产 AIS 详情原文）：

```json
{
  "n": 1,
  "product_constraints": [
    {"name": "deck", "color_variant": "柚木色", "score": 0.1396073824626025, "screen_coverage": 0.019513413242009132},
    {"name": "大号长花箱", "color_variant": "星芒灰", "score": 0.060158444012892935, "screen_coverage": 0.0038794948630136985}
  ]
}
```

- 无 `size`/`quality` 字段；结果图 **1918×820**（非 2048 方图），SHA256 `0cb9f5feabfd34757ae74c5833942a7cc6f29e0fd30ca6e66b24c15c90f693b6`。
- 执行：仅 1 次尝试，首个供应商 `vendor-38a26ea7…` HTTP 200 deliver，`status=succeeded`、执行一次成功、无故障切换、无重复计费尝试。
- 证据：`prod-r1-live-job.json`（完整任务对象）、`prod-r1-live-job-detail.png`（控制台详情）。
- 结论：R1 产品占比随真实 GDC 请求进入生产 AIS；auto 尺寸保留设计画幅（非硬编码 2K）；生产端到端 PASS。
