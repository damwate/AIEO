# R1 实施方案（GPT R1+R2 两轮裁定后定稿，任务 b-20261123-standard-third-trial）

## 裁定要点
- 双写：prompt 文本区块（模型可读）+ params.product_constraints（可校验审计），单一事实源=Job 冻结 reference_selection_json。
- compose_prompt 路径冻结进 resolved_prompt（重试可复现）；worker 组装 params 同源派生。
- ReferenceSelection 冻结契约/选品算法/占比计算/原图回退去重/前端槽位：一律不动。
- 旧任务（无冻结选品）：零改动兼容，不补造数据。

## MF-01 缺失 variant 序列化
- variant 非空 → color_variant=原值，prompt 输出「颜色规格：{v}」。
- variant 为 null/空串 → params color_variant=null；prompt **省略**颜色规格段（禁止字面量 None/null/占位符；禁止解释成默认颜色）。

## MF-02 数值序列化
- 内部值 0..1；params 保留原始 float；prompt=(x*100) 一位小数百分数（无空格，如 18.2%）。
- 统一 Decimal ROUND_HALF_UP（Python round() ties-to-even 禁止作为跨语言契约）。
- fail-closed 校验：NaN/Infinity/越界(不在[0,1])/name 缺失 → 422，不静默降级；placement 域 name 必须 catalog.products[id].name 非空，其他域 subject_id 必须非空。

## golden 区块样例（写入测试）
【产品选择与画面占比约束】以下产品均为本次设计必须参考的产品，请使用对应产品原图作为外观、颜色和材质依据。
1. 产品：{name} 颜色规格：{variant} 画面占比：{coverage%}
2. 产品：{name} 画面占比：{coverage%}   ← 无颜色时省略颜色段
…共计{n}项。请保持产品外观与参考原图一致，并尽可能遵循上述画面占比。

## 改动点（GDC，feature 分支 feature/admin-console-order-and-job-input-20261123 或独立分支）
1. 新纯逻辑模块 `src/backend/app/ai/product_constraints.py`：
   - `validate_coverage(x)`：finite 且 0..1，否则 ValueError（422 由调用层转）。
   - `build_product_constraints(selection, assets)` → [{'name','color_variant','score','screen_coverage'}]；name 解析 fail-closed；顺序=selected 原序。
   - `format_constraint_block(items)` → golden 文本；Decimal ROUND_HALF_UP。
2. `ai_generation.py`：compose_prompt 包装函数增 `selection=None` 参；非空且 selected 非空时拼区块入 resolved_prompt（:429 调用点传入 selection）；旧调用默认 None 行为不变。
3. `external_jobs.py` submit_external：params={'n':1,'product_constraints':build_product_constraints(job.reference_selection_json, load_assets_cached())}（scheme 类且 selection 存在时；否则原 {'n':1}）；原图/去重不动。
4. 测试：
   - pytest 新 test_product_constraints.py：正常 6 项映射/缺失 variant（params null+prompt 省略）/顺序一致/回退不变/去重不变/重试一致（同 Job 两次 build 相同）/旧任务（selection None→无区块无 params 键）/数值边界（0、1、0.05→0.1% HALF_UP 用例：0.15→? 用 Decimal 断言）/NaN/Infinity/越界 fail-closed/name 缺失 fail-closed。
   - golden 两组：legacy_prompt（旧路径输出不变断言）+ selection_prompt（区块精确文本）。
   - worker 集成：同一 job 的 prompt 产品数=params 条数=selected 数+逐项映射（扩展 test_external_ai_service.py）。
   - 既有全量 pytest 回归 + 前端 vitest 回归（前端无改动也应全绿）。
5. 交付物：最终请求契约、字段映射表、golden、测试结果、被测 commit SHA（L-017 锁定）。

## 验收证据
- worker 实际请求快照（mock service_client 捕获 prompt/params/images 三件套对账）。
- 原图发送与去重未回归证据（既有 external 测试全绿+新增断言）。
