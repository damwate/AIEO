# 首轮独立验收 MUST-FIX 整改回交（R2）

- 依据：首轮独立验收结论（MUST-FIX）与本地复现；被测基线 GDC `0a5a4ec59b71bc3af41aa99ac82808767ffa785a`、AIS `418087c31e8765ba48fd765ab3c9a50cc21b2458`、AIEO `d77d6a1`。
- 执行方式：AIEO Standard / M1 单任务；仅修复两个阻塞项，不扩改权限、排序、尺寸、付费与生产范围。
- 证据口径：全部为本地 mock / 单元测试，未调用付费生图，未合并 main/dev，未生产发布，新提交未推送。

## 1. 阻塞项 A：带 product_constraints 的生图请求被 AIS 422 拒绝

### 根因（跨仓三处叠加）
1. AIS `/v1/images/generations` 的 `GenerationBody` 使用 `extra='forbid'`，不含 `product_constraints`；`/v1/images/edits` 的 multipart 文本字段白名单同样不含该字段，未知字段直接 422。
2. AIS `generic_params.validate_params` 对非能力参数一律 422，产品清单会被通用参数门拒绝。
3. GDC `service_client.submit` 用 `str(v)` 展开结构化 params，带图请求会把 list 编码为 Python repr，即使 AIS 放行字段也无法按 JSON 解析。

### 修复
- GDC `src/backend/app/ai/service_client.py`：list/dict 参数改为 `json.dumps(..., ensure_ascii=False)`；标量仍用 `str`。
- AIS `backend/app/ai/api_v1.py`：`GenerationBody` 增加可选 `product_constraints`；edits 白名单增加该字段并按 JSON 解析；`_build_params` 将其写入任务 `params_json`。
- AIS `backend/app/ai/generic_params.py`：新增 `METADATA_PARAMS` 审计元数据通道，独立于供应商能力参数；校验 list/每项对象/name 非空/screen_coverage 有限且 0..1，非法仍 422。

### 回归
- GDC `tests/test_external_ai_service.py::test_structured_product_constraints_are_json_encoded_for_v1`：纯文本 JSON body 与带图 multipart 字段均为合法 JSON。
- AIS `tests/test_project_auth_v1.py`：纯文本/带图两种请求 202，`params_json.product_constraints` 原样保留，worker 成功；越界占比负例 422。

## 2. 阻塞项 B：单图任务后台缺原图槽位、私有原图端点 404

### 根因
GDC scheme `submit_job` 仅在多图（主图+额外截图）时写 `input_images_json`；纯单图只写单图五列（`input_storage_key` 等），`input_images_json=None`。Worker 的 `_inputs` 有单图回落，故提交与出图正常；但 admin detail 与 `/inputs/{slot}` 只读 `input_images_json.images`，详情无槽位且手调 `/inputs/1` 返回 404。

### 修复
- GDC `src/backend/app/ai/ai_records.py`：新增 `_input_images_bundle(job)`，详情与私有原图端点共用；多图冻结清单优先，单图回落到冻结五列合成 `primary_slot=1`、`slot=1` 条目。不改 Worker 读取链、不改多图冻结语义、不增加任意 storage_key 入参。

### 回归
- `tests/test_admin_ai_job_detail.py::test_single_image_job_has_input_slot_and_readable_original`：单图任务详情出现槽位 1，`/inputs/1` 200 返回私有原图，`/inputs/2` 仍 404。

## 3. 测试结果（本地零费用）

| 仓 | 命令/范围 | 结果 |
|---|---|---|
| GDC | CODEX-HANDOFF §四 九文件目标套件 | 121 passed |
| GDC | 受影响五文件细跑 | 57 passed |
| AIS | `test_project_auth_v1.py` + `test_generic_jobs_capabilities.py` + `test_admin_api.py` | 55 passed |
| 前端 | 未改动，本轮不重复声明 | 沿用首轮结果 |

## 4. 新被测提交（完整 SHA）

| 仓 | 分支 | 新 SHA | 基线 SHA |
|---|---|---|---|
| GDC | `feature/product-constraints-auto-size-20261124` | `4f162d16dd49ff8c5f9af6cd69b82d67a52c65b2` | `0a5a4ec59b71bc3af41aa99ac82808767ffa785a` |
| AIS | `feature/garden-proxy-order-edit-20261123` | `afc4d6cb739b031dab898a2ce3a3b9ce8f2f7b5c` | `418087c31e8765ba48fd765ab3c9a50cc21b2458` |

## 5. 边界与未决

- 新提交均**未推送**，按独立复验要求回交 SHA；推送如需进行仍走 `toolkit/check-push.mjs`。
- 未复测生产、未调用真实付费供应商；参数接受≠效果/计费确认。
- AIEO ST-05 的 S1、S3 正式步骤派单/回复证据仍缺，任务状态保持**验收中**，不以本整改文件替代正式验收。
- 供应商排序权限、保存与路由回归通过结论沿用首轮，本轮未改动该路径。
