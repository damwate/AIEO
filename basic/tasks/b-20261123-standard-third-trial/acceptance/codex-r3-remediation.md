# Codex R2 复验 MUST-FIX 整改回交（R3）

- 依据：`acceptance/codex-r2-recheck.md`（R2 裁定 MUST-FIX）。合法产品清单与单图原件已通过复验，本轮只整改 R1 两项保留阻断。
- 执行方式：AIEO Standard / M1 单任务；不扩改供应商排序、尺寸、生产与付费范围。
- 证据口径：全部本地 mock / 单元测试，未访问生产、未调用真实供应商。

## 1. MF-01a · 无效产品清单返回 500 → 422

### 根因
1. AIS `backend/app/ai/api_v1.py` 编辑接口在 JSON 解析后手工构造 `GenerationBody`，该调用不在异常转换范围内：`{}`（对象）与 `["x"]`（数组含非对象）触发 Pydantic `ValidationError`，被 FastAPI 当未处理异常上升为 500。
2. `backend/app/ai/generic_params.py` 对 `screen_coverage` 先调用 `math.isfinite` 再判断范围；极大整数（如 `10**400`）转 float 抛 `OverflowError`，生成接口返回 500。

### 修复（机制变化：错误归一化 + 数值先范围后有限性）
- `api_v1.py`：捕获 `ValidationError`，统一转 `HTTPException(422, validation_error)`；生成接口由 FastAPI 请求模型天然 422，路径保持不动。
- `generic_params.py`：先做类型/范围判断（`0 <= coverage <= 1`），再做 `math.isfinite`；NaN/Inf/越界/极大整数均在进入有限性判断前收敛为 422。

### 回归
- `tests/test_project_auth_v1.py` 新增 6 类非法形状 × generations/edits 两入口 = 12 项：对象、非对象数组、空名称、占比越界、极大整数、超长列表（65 项），全部断言 422。

## 2. MF-01b · 提示词与审计清单共用同一份名称快照

### 根因
GDC 提交时 `ai_generation.compose_prompt` 现场读一次 catalog，出站时 `external_jobs.submit_external` 再读一次；产品后台发布会写 `skus.csv` 并清 `catalog()` 的 lru_cache。两次读取之间发生发布，同一冻结 selected 的 prompt 保留旧名、AIS 清单使用新名。

### 修复（机制变化：现场重算 → 提交时冻结，出站只读冻结值）
- `app/db.py`：`AiGenerationJob` 新增 `product_constraints_json`（JSON, nullable）。
- `migrations/versions/r2_product_constraints_snapshot.py`：幂等 add column，`down_revision='cs1_generation_workspace'`，旧任务 NULL 语义保留。
- `app/ai/ai_generation.py`：提交时在已有目录快照 `c` 上只派生一次产品清单；冻结列写入该清单，`compose_prompt(..., constraints=...)` 用同一清单格式化 prompt，不再二次读目录。
- `app/ai/external_jobs.py`：出站优先读冻结列；仅旧任务 NULL 时回落原现场派生链，历史行为兼容。

### 回归
- `tests/test_l2w3_ai_reference_selection.py::test_product_constraints_snapshot_survives_catalog_rename`：目录在提交与出站之间改名，断言 Job 冻结列、prompt 与出站 params 三处均为旧名，且新名不出现。
- `tests/test_external_ai_service.py::test_legacy_job_without_frozen_constraints_falls_back_to_catalog`：冻结列 NULL 的旧任务仍按目录现场派生。

## 3. 测试结果（本地零费用）

| 仓 | 范围 | 结果 |
|---|---|---|
| GDC | 10 个后端目标文件（含网关、迁移模型对照） | 145 passed / 2 skipped |
| AIS | `test_project_auth_v1` + capabilities + admin API + governance audit | 78 passed |
| AIEO | 队列单测未改动，沿用 R2 结果 | 12 passed |
| 生产/付费 | 本轮未执行 | 不适用 |

## 4. 新被测提交（完整 SHA，已推送并复核远端一致）

| 仓 | 分支 | 基线 SHA | 新 SHA |
|---|---|---|---|
| GDC | `feature/product-constraints-auto-size-20261124` | `4f162d16dd49ff8c5f9af6cd69b82d67a52c65b2` | `90ce2233b4da9d844cf1e165c43cec2ecdd3cddd` |
| AIS | `feature/garden-proxy-order-edit-20261123` | `afc4d6cb739b031dab898a2ce3a3b9ce8f2f7b5c` | `a1f55b523f90763bcd12823bf52cff9d710381a6` |

> 两仓均按 L-014 走 `toolkit/check-push.mjs --push --yes` 推送；GDC 直连失败后用注册表活代理 `127.0.0.1:1080`，AIS 直连成功。`git ls-remote` 复核远端 SHA 与本地一致。

## 5. 边界与未决

- 这是 R1 同一验收缺口的**第二次** MUST-FIX；两方案机制与上一轮不同（AIS 从字段放行改为错误归一化与数值判断顺序，GDC 从出站重算改为提交冻结），按 L-019 记录，未进入第三次返工循环。
- ST-05 的 S1、S3 正式派单引用、完整 reply SHA 与 PASS 结论仍缺，任务保持**验收中**；本文件不是正式步骤验收证据。
- 未合并 main/dev、未生产发布、未调用付费供应商；参数接受不等于效果或计费确认。
