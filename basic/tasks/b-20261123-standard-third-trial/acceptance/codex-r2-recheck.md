# Codex R2 独立复验

裁定 **MUST-FIX**。本轮原始 422 和 404 场景均已修复。R1 的非法输入处理和产品名称快照一致性仍需整改，R3 单图原件通过。

| 仓库 | 功能分支远端与独立检出 SHA |
|---|---|
| GDC | `4f162d16dd49ff8c5f9af6cd69b82d67a52c65b2` |
| AIS | `afc4d6cb739b031dab898a2ce3a3b9ce8f2f7b5c` |
| AIEO | `88b79acce777d9198ea5f377cd418b462d80150d` |

## 通过项

- **合法产品清单。** 用 GDC 实际 `service_client.submit` 经本地 transport 接到 AIS FastAPI 的真实入口。两张合成 PNG 的编辑请求和无图生成请求均初次 202、同键重放 200、同一任务只执行一次。省略清单的旧请求仍返回 202。Worker 测试桩收到完整 prompt、按序图片原字节，AIS 管理详情返回 200 并回读相同提示词与结构化清单。
- **供应商参数隔离。** 实际 OpenAI-compatible 编辑适配器的最终 `_post_raw` mock 收到完整 prompt、按序图片字节和 `size=auto`、`quality=auto`。请求体无 `product_constraints`，审计清单保存在 AIS Job 中。
- **单图原件。** 通过 GDC 正常业务入口上传一张 PNG。业务提交 202，数据库仍通过既有单图五列保存，详情 200 展示槽位 1。平台超管取原图 200，返回字节与上传一致。不存在的槽位返回 404，普通成员取图返回 403。现有多图用例通过。

## R1 保留阻断

### MF-01a · 无效产品清单可返回 500

- AIS `backend/app/ai/api_v1.py:138` 解析 multipart JSON 后，在异常处理范围外手动构造 `GenerationBody`。真实编辑接口对对象 `{}` 和含非对象的数组 `["x"]` 返回 500，非法 JSON 语法与占比 2 返回 422。复验要求这些无效结构都稳定返回 422，并验证超长列表、无效项和原有请求兼容。
- AIS `backend/app/ai/generic_params.py:35` 在比较范围之前调用 `math.isfinite`。真实生成接口带一个超出浮点表示范围的大整数占比时返回 500。该值应按越界返回 422。现有负例只断言生成接口的占比 2，未覆盖这两类路径。

### MF-01b · 目录发布窗口内，提示词和审计清单可出现两个名称

GDC `src/backend/app/ai/ai_generation.py:290` 在保存提示词时读取目录，`src/backend/app/ai/external_jobs.py:63` 在出站时再次读取。两次读取之间有数据库提交与媒体落盘。产品管理发布会写入 `skus.csv` 并清理同一个目录缓存（`src/backend/app/product_admin.py:1586`）。

使用同一冻结 selected，并模拟上述窗口切换目录快照，复现 prompt 为「旧花盆」而 `params.product_constraints` 为「新花盆」。整改需把实际提交的结构化清单与提示词从同一份已解析快照生成，覆盖目录改名和旧任务兼容。回交测试要断言两处产品名称及对应字段一致。

## 重跑记录

| 检查 | 实测结果 |
|---|---|
| GDC 10 个后端目标文件，含网关 | 143 passed，2 skipped。跳过项依赖两仓打包产物运行浏览器门禁 |
| AIS 四个后端目标文件，含 governance audit | 67 passed |
| AIEO 队列单测 | 12 passed |
| AIEO ST-05 | 开工核对 PASS，S1、S3 的正式 dispatch 引用、完整 reply SHA 和 PASS 结论仍缺，任务保持验收中 |

独立探针与上述项目套件分别执行。两仓本轮只有后端变化，沿用首轮前端测试结果。本轮通过本地测试凭证、临时数据库和 mock 复验，未访问生产或调用真实供应商。派单状态按已有归档记录，未另发网页派单。
