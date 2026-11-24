# Codex 交接：GDC/AIS 生图链路改造验收

> 最新裁定见 [Codex R2 独立复验](acceptance/codex-r2-recheck.md)；其两项 MUST-FIX 的整改回交见 [Codex R3 整改](acceptance/codex-r3-remediation.md)。

> 日常任务与多任务管理统一在 **AIEO**。本文件是执行入口；业务代码分别在下列两个项目，不要在 AIEO 仓内查找业务实现。
> 任务 ID：`b-20261123-standard-third-trial`。详细过程与证据见同包 `delivery.md`、`steps.md`、`acceptance/`。
> **首轮独立验收 MUST-FIX 的整改回交见 `acceptance/mustfix-r2-remediation.md`**；本节被测 HEAD 已更新为该回交的 R2 提交。

## 一、本次改了哪些项目

| 项目 | 本地路径 | 分支（R3 已推送） | 被测 HEAD |
|---|---|---|---|
| Garden-Design-Calculator（GDC） | `D:\Garden-Design-Calculator` | `feature/product-constraints-auto-size-20261124` | `90ce2233b4da9d844cf1e165c43cec2ecdd3cddd` |
| AI-Image-Service（AIS） | `D:\YotinGarden\AI-Image-Service` | `feature/garden-proxy-order-edit-20261123` | `a1f55b523f90763bcd12823bf52cff9d710381a6` |
| AIEO（流程、技能、证据） | `D:\AIEO`（技能工作区 `D:\AIEO\.worktrees\feat-standard-task-management`） | `feat/standard-task-management` | 本交接提交及其前一提交 `df84557bfda0286f071bb2e6c327e5e73701640f` |

远程分支：
- GDC：https://github.com/Hulkhao/Garden-Design-Calculator/tree/feature/product-constraints-auto-size-20261124
- AIS：https://github.com/YotinGarden/AI-Image-Service/tree/feature/garden-proxy-order-edit-20261123
- AIEO：https://github.com/damwate/AIEO/tree/feat/standard-task-management

## 需求总账（原始需求与中途新增，不得漏项）

| 来源 | 用户要求 | 本次处理与验收状态 |
|---|---|---|
| 原始 R0 | 重新拉取 GDC；缓存代码此前未合 dev、现已合并 | dev ff-only 到 `c3154aa0`，确认 PR#127 缓存重试整合与 PR#128 3D 参考图缓存修复；完成 |
| 原始 R0' | 花园计算器已重新发布，复核此前未加入缓存的修改 | 线上 bundle 特征证据归档；用户热启动抽测「还行」；完成，证据在 `acceptance/republish-review/` |
| 原始 R1 | 生图请求除设计稿+提示词外，加入截图中的产品组成/占比，产品原图全部给生图服务；先与 GPT 仔细讨论 | 经 planning R1/R2 裁定后实现双写；原提示词、设计图、入选产品原图与去重链保留；代码待 codex 逐文件验收 |
| 原始 R2 | 花园计算器链接到生图后台的页面也能调整供应商优先级顺序 | GDC 写白名单+AIS Garden 代理排序编辑；待验保存后的实际路由顺序与权限 |
| 原始 R3 | 生图服务任务详情不能只显示结果，要显示客户端输入参数 | GDC 与 AIS 原生详情均补输入；原始上传设计图、产品原图、prompt、params/product_constraints 分项验收 |
| 中途新增 | AI-IMAGE-SERVICE 默认 1K 改 2K | 经官方文档与用户复核，**不定稿为固定 2048×2048**；最终为未显式传值时 auto，未来由前端按画幅选择；220/221 早前配置已回滚 |
| 中途新增 | quality/size 默认 auto，除非前端传值；设计稿不能被强制改成方图 | GDC 固定尺寸已撤销；验收不得恢复全局 2K 硬编码，也不得宣称 auto 保证同画幅 |
| 中途新增 | 后台补原始上传参考图、物品清单和排序依据 | GDC 已补私有原图端点、原始上传图与产品原图展示、selected/rejected/score/coverage/rank；待 codex 验权限与展示 |
| 中途新增 | 第三方接口必须文档先行；付费测试谨慎且有意义；工作心得写入 skill | 远桥/悟空文档归档；L-023 与 Basic/Standard skill 已提交推送；后续禁止无授权付费矩阵 |
| 流程要求 | 用 AIEO Standard 完成并给测试报告；推送分支、交接 codex | `delivery.md` 已归档，三分支已推送，本文件为 codex 验收入口 |

## 二、每个项目实际做了什么

### 1. GDC

- **R1 产品组成进入生图请求**：从 Job 冻结的 `reference_selection_json.selected` 派生产品清单，双写：
  - `resolved_prompt` 追加产品名称/颜色规格/画面占比区块；
  - AIS `params.product_constraints` 写入 name/color_variant/score/screen_coverage。
- 原提示词保留；设计截图与入选产品原图沿用既有 `_inputs` 链发送，SHA256 去重；选品、评分、占比算法未改。
- 缺颜色时 prompt 省略颜色段；百分比使用 Decimal ROUND_HALF_UP；NaN/Infinity/越界/名称缺失 fail-closed。
- **名称权威源为 `catalog()`（data/skus.csv）**，不是参考图资产文件；这是全量回归发现后修复的点。
- **R2**：GDC 网关只新增 `PUT /ai-console/routing/order` 写白名单，PlatformAdmin、服务端代持 Admin Token、上游响应与审计透传；其余写路径仍关闭。
- **R3**：生图记录详情展示完整提示词、产品清单/评分/占比/排序、未入选原因、产品参考原图，以及**原始上传设计图**。新增 PlatformAdmin 私有输入图只读端点，按冻结 slot 读取，不能传任意 storage_key。
- **尺寸**：已撤销固定 `2048x2048`；前端未显式传 size/quality 时 GDC 不硬编码，保持 AIS auto 缺省。未来尺寸选项应按设计画幅映射，不强制方图。

### 2. AIS

- **R2**：Garden 代理入口 `Vendors.vue` 放开供应商上移/下移/保存顺序；走 `/ai-console/routing/order`，不带 CSRF（由 GDC 代持管理凭证）。其他供应商字段编辑仍按原权限限制。
- **最终出站测试**：证明任务 params 显式 size 覆盖供应商配置，未传时回落 auto；测试截获最终 `_post_raw`，不调用供应商。
- **R3 原生 AIS 后台**：`/admin/jobs/{job_id}` 增加 `prompt` 原文（保留 `prompt_length` 兼容）；JobDetail 页显示客户端提示词、`params_json/product_constraints` 和输入参考图计数。

### 3. AIEO

- `2d5c754`：Basic/Standard skill 与 L-023 固化第三方接口工作方式：官方文档找到并归档、禁止黑盒、用文档校准需求、真实付费需授权、最终 Transport Mock、按业务影响测试。
- `48cc9ab`：queue 补采归因只匹配 user 单元，修复 assistant 回显 round marker 导致误判；12 项回归通过。
- `df84557`：第三次 Standard 试运行报告、派单、文档和测试证据归档。
- 本交接文件用于 codex 后续逐文件验收与整改追踪。

## 三、请 codex 重点验收什么

### A. GDC R1 请求契约

1. 同一冻结 selected 同源产生 prompt 与 params，顺序、名称、颜色、score、coverage 一致；不发生二次选品/重算。
2. 原提示词主体、设计截图、产品原图、回退和去重行为无回归；不是只加文字而未送原图。
3. 缺 variant、HALF_UP 边界、NaN/Infinity/越界、缺 name 均符合契约；name 必须来自 `catalog()`。
4. 旧任务无 selection 时不注入产品字段；重试读取同一冻结数据。
5. 双写失败不能形成半个任务或静默降级；相关异常路径请逐文件确认。

### B. R2 排序与权限

1. GDC 仅放行指定 PUT，PlatformAdmin 与非白名单路径拒绝、上游 409 透传、审计完整。
2. AIS Garden 代理可排序保存，其他编辑权限未意外放开；请求不带 CSRF，也不暴露 Admin Token。
3. 排序保存写回全局路由，不是单纯前端排序或 SQL 排序。

### C. R3 输入参数与原图

1. GDC 详情同时有原始需求/解析提示词、输入参数、产品组成与排序依据、原始上传图、产品原图。
2. 私有输入图端点必须鉴权并按 Job 冻结 slot 取图，不能越权读取任意文件。
3. AIS 原生详情也有 prompt 原文与 params/product_constraints；历史缺字段任务不补造数据。

### D. auto 尺寸与文档边界

1. 不得恢复全局固定 2048x2048 或把 2K 写成所有设计稿的统一方图。
2. 未显式传 size/quality 时保持缺省 auto；若新增前端选项，必须按画幅映射并冻结显式值。
3. 不宣称 auto 一定匹配参考图比例；悟空 gpt-image-1 文档不能外推到 2.6 sunburst。

## 四、测试与既有结果

### GDC

```bash
cd /d/Garden-Design-Calculator/src/backend
PYTHONPATH=.. python -m pytest -q -p no:cacheprovider \
  tests/test_admin_ai_job_detail.py tests/test_external_ai_service.py \
  tests/test_ai_prompt_config.py tests/test_d1_ai_people_prompt.py \
  tests/test_b10_ai_reference.py tests/test_l2w3_ai_reference_selection.py \
  tests/test_l2w1_ai_multiimage.py tests/test_product_constraints.py \
  tests/test_domain_reset_w5_job_media_binding.py
# 当前相关套件：119 passed

cd /d/Garden-Design-Calculator/src/frontend
npm test -- --run
# 已有全量结果：3284 passed / 14 skipped
```

全量后端对照已跑：基线 `c3154aa0`=3301 passed/194 failed/3 errors；分支 16555dea 仅新增 2 项失败，均为 R1 名称源误用，已在 `0a5a4ec` 修复。其余 197 项失败/错误在基线同现，**不要掩盖，也不要把无关历史失败算到本需求**。

### AIS

```bash
cd /d/YotinGarden/AI-Image-Service/backend
python -m pytest -q tests/test_generic_jobs_capabilities.py  # 16 passed
python -m pytest -q tests/test_admin_api.py                  # 19 passed

cd /d/YotinGarden/AI-Image-Service/frontend
npx vitest run tests/job-detail.spec.ts                      # 3 passed
npm test -- --run                                            # 既有 42 passed
```

所有新增验证均为 mock/单元测试，未再次调用真实付费生图。

## 五、明确未做与交付要求

- 未合并 main/dev，未生产发布；DEC-010 仍须用户本人拍板。
- 未做真实付费业务效果验收；请求字段正确不等于最终生图外观/占比达标。
- 220/221 早前固定尺寸配置已回滚；本次代码尚未部署到生产。
- 请按完整 SHA 逐文件审查，输出 `PASS` 或带文件路径/复现条件的 `MUST-FIX`。若需整改，在同一 feature 分支追加提交并运行相关测试，再把结论与 SHA 回写到本 AIEO 任务包。
- 不记录或提交密码、API key、Admin Token。
