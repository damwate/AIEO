# GDC dev PR 合入前补验结果（2026-11-24）

> 依据用户 2026-11-24 指示：先补 GDC/AIS 浏览器联调与隔离 PostgreSQL 迁移，通过后再提交 GDC dev PR；AIS main 合入单独审批。本文件记录补验结果，不推送/不合并 dev/main（DEC-010 用户拍板）。

## 1. 分支关系（codex 已核，执行侧复核）
| 对象 | SHA | 关系 |
|---|---|---|
| GDC dev | `c3154aa0fcf0a8fdddb7b1c6f14e6ea205b439fc` | 当前集成目标 |
| GDC 功能分支（初始） | `90ce2233b4da9d844cf1e165c43cec2ecdd3cddd` | 基于 c3154aa0，双方无分叉 |
| GDC 功能分支（补验后最终） | `2ceefe2b3318ab89318094e82a6cb1aa0e89b734` | 新增 1 个测试修复提交，已推远端，ahead=0/behind=0 |
| AIS 功能分支 | `a1f55b523f90763bcd12823bf52cff9d710381a6` | 远端只有 main，无 dev |
| AIEO | `75affaa` → 本轮补验记录 | 任务包证据 |

## 2. GDC 合入前补验：跨仓浏览器门禁 ✅
- 原缺口：目标套件 145 passed / **2 skipped**，skip 原因 `tests/test_ai_console_gateway.py:225: set AI_CONSOLE_DIST to run the cross-repo browser gate`（需打包产物）。
- 补验动作：重建 AIS 前端 dist（`npm run build`，与 a1f55b5 被测版本一致）→ 设 `AI_CONSOLE_DIST` → 运行 `test_real_garden_entry_to_built_console[False/True]`。
- 发现并修复测试工具缺陷（ST-06）：`getByRole('link',{name:'详情',exact:true})` 在 50 行分页下触发 Playwright 严格模式 violation → 加 `.first()` 消歧义。提交 `2ceefe2b`（仅测试脚本 1 行，不改产品代码）。
- **最终目标套件（绑定 2ceefe2b，含跨仓门禁）：147 passed，0 skipped，21 warnings（均为既有 deprecation）**。
- 门禁覆盖：真实 Garden 登录、本地历史保留、控制台入口无 token、多项目分页、图片、刷新、会话过期——has_touch False/True 两态全过。

## 3. SQLite 迁移演练（本地可执行代理）✅（沿用 R3 已验证）
- codex R3 独立复验已记录：从 `cs1_generation_workspace` 升级实际迁移链，历史行保留且新列 NULL；模拟列已存在且有冻结数据、版本停在前一版本，再 upgrade head 后数据原样保留、版本推进到 `r2_product_constraints_snapshot`；SQLite 迁移 PASS。
- 本轮未重复执行（结论有效）；被测提交新增的测试修复不涉及迁移逻辑。

## 4. PostgreSQL 迁移 ⚠️ 本地环境不具备，交 codex/用户评估
- 本机无 PG 服务（无 pg_ctl/postgres/initdb）、无 PG 驱动（psycopg2/pg8000 未装）、无 docker、无 DATABASE_URL。
- 220 上 PG 属生产组件，不用于隔离迁移演练。
- 按用户分级规则推给用户：由 codex 评估是否在隔离环境演练 PostgreSQL 迁移；不因本地缺环境卡住，也不伪造。**这是 GDC dev PR 前唯一 remaining 环境项**。

## 5. AIS 合入前置提示
- AIS 远端只有 main、无 dev；GDC 新代码发送旧版 AIS 拒绝的字段（`product_constraints` 经 afc4d6c/a1f55b5 才接受）。
- 集成/发布时须确保 **AIS 兼容版本先就绪**；AIS main 合入属独立审批（DEC-010），本轮不推动。

## 6. 状态与边界
- GDC dev PR：**材料就绪**（最终被测 2ceefe2b、147 passed/0 skipped、无分叉），待 PG 迁移评估通过后由用户拍板提交 PR。
- 不合并 dev/main、不生产发布、不付费；S1 PARTIAL/NOT VERIFIED、S3 PASS_WITH_CONSTRAINTS 沿用；任务包保持验收中。
- 推荐算法 #130 等近期分支不在本轮范围。
