# qywx fixture 自建自清方案（B 方案）—— P1 任务1 测试代码修改计划

提交轮次：R6 裁定后新审查轮（裁定会话 6b0a5e02，2026-11-28）
状态：**仅方案，未实施**。按裁定授权边界：本轮审查通过前不改代码、不执行 INSERT、不重跑测试。
范围：仅 `MultiDeviceLoginIntegrationTest.java` 单测试文件；业务代码、生产配置、测试断言零改动；
运行方式与命令不变（`python -I runtime/run_acl_tests.py`）。

## 1. fixture 身份（虚构、唯一、最小字段）

| 列 | 值 | 依据 |
|---|---|---|
| user_name | `acl_it_fixture_qywx_<runid>` | UNIQUE 列（user-schema.json 实测）；**逻辑删旧行仍占用 UNIQUE 索引**，随机后缀保证任意轮次不冲突 |
| qywx_user_id | `acl_it_fixture_<同一runid>` | varchar(64)；虚构命名空间实测零占用（fx_qywx_prefix_existing=0）；绝不含真实企业微信 userid |
| pass_word | SecureUtil.md5(随机UUID) 32hex | NOT NULL 列占位哈希；非任何真实凭证；fixture 不走密码登录路径 |
| is_admin | false（显式） | 无权限提升 |
| is_deleted | false（显式） | 防 NULL 行被 @TableLogic 查询条件过滤 |
| 其余列 | 不设（NULL/默认） | real_name 有 UNIQUE 约束故必不设；phone/mail_address/user_key/org_id/district_id/sort_index/gmt_modified 均可空；gmt_create 有 DEFAULT CURRENT_TIMESTAMP |

runid = UUID 去横线取 8 位 hex，每次运行新生成；user_name 与 qywx_user_id 用同一 runid，便于归组审计。
实测依据：user-schema.json（SHOW COLUMNS 15 列；NOT NULL 仅 id 自增 / user_name / pass_word / gmt_create 默认值）。

## 2. 写入与清理机制（全部走应用既有持久层，零原生写 SQL）

- **创建**：`userService.insert(user)`（MyBatis-Plus 实体插入）。实测配置链：BaseEntity
  `@TableField(fill=INSERT)` + `MPMetaObjectHandler`（MybatisPlusConfig @Bean）→ gmtCreate/isDeleted 自动审计；
  仍显式 `setDeleted(false)` 双保险。
- **用户清理**：`userService.deleteById(fixture)` —— 实测该链路为逻辑删：application.yml
  `logic-delete-value: 1` / `logic-not-delete-value: 0` / `sql-injector: LogicSqlInjector`（application.yml:42-44），
  加 BaseEntity `@TableLogic` 与 MybatisPlusConfig `LogicSqlInjector` @Bean → deleteById 实际执行
  `UPDATE user SET is_deleted=1`，物理 DELETE 在该链路不可能发生。
- **token 清理**：不变部分=每测试 `@After` 对登记 token `deleteByToken` 吊销（既有机制，R6 已验证生效）；
  新增兜底=`@AfterClass` 按 fixture userId 查活跃 token（@TableLogic 自动过滤已删行）全部 deleteById 逻辑吊销
  （正常情况应为零行，兜底仅防遗漏）。
- **残留预检与清理**：`@BeforeClass` 用原生只读 SELECT（dataSource 直连，与既有 querySqlMode 同款机制，
  含已删行的真实视角）查 `user_name` / `qywx_user_id` 的 `acl_it_fixture_%` 命名空间；若发现 is_deleted=0
  的活跃残留（异常中断遗留），按 id 逐行 deleteById 逻辑删除——自建命名空间自清，绝不物理 DELETE。
- **时机与异常安全**：`@BeforeClass` 创建一次、4 测试共享；`@AfterClass` 清理（JUnit4 ClassRoadie 保证
  @BeforeClass 失败仍执行 @AfterClass）；进程级崩溃残留由下轮 @BeforeClass 预检清理。两级保险均不物理 DELETE。

## 3. 测试改造点（单文件，仅调用点替换）

- 新增 `private User findOrCreateQywxFixtureUser()`：残留预检清理 → 唯一性预检（原生只读 SELECT
  user_name/qywx_user_id 全表视角 =0 才插入）→ insert → 回读断言（id 非空 / is_deleted=0 /
  user_name 与 qywx_user_id 等于本 runid 预期值）；fixture 引用存 static 字段供清理用。
- 4 处 `findQywxBoundUser()` 调用点替换（行139 qywxOAuth… / 行167 concurrent… / 行251 expired… /
  行263 persistence…）；原 `findQywxBoundUser()` 方法删除（其"dev 库无绑定用户"断言随之失效）。
- 测试体其余零改动；测试间隔离不变（每测试开头 `activeTokenIds(userId)` 快照做基线，现模式）；
  并发测试两阶段终止+兜底登记机制不变（R5/R6 已复核版本原样保留）。
- mock 链路不变：`workWechatService.getUserInfoByCode(...)` thenReturn `fixture.getQywxUserId()`
  （虚构值，不触真实企业微信 API）。

## 4. 基线与验收（沿用既有协议）

- 外部基线 pre/post：`runtime/acl_test_baseline_drive.py` 现协议 + 逐项对账；对账清单新增 fixture 维度
  （fixture 行自身 pre/post、`acl_it_fixture_%` 命名空间活跃计数 pre/post）。
- 验收目标（=R6 裁定四条）：5/5 `MultiDeviceLoginIntegrationTest` PASS；`UserTokenTest` PASS；
  全部测试 token 已吊销（is_deleted=1）；fixture 用户已逻辑删除（is_deleted=1）；
  user/user_token 现有数据无非预期变化。
- 净留痕声明：每次运行后新增 1 行 is_deleted=1 的 fixture 用户 + 本轮测试 token（均 is_deleted=1，
  前缀可识别可审计）——无物理删除、无活跃残留。

## 5. 风险与禁止事项

- 禁止物理 DELETE；禁止 @TableLogic 配置改动；禁止 deleteById 之外的任何删除通道。
- fixture 无 admin 权限（is_admin 显式 false）；不绑定真实企业微信身份；mock 不回调真实 API。
- 若插入遭遇 UNIQUE 1062（随机 8hex 后缀下预期概率≈0）：测试失败并原样报告，不自动重试、不掩盖。
- 不修改 run_acl_tests.py、不放宽任何业务断言、不动生产配置与业务代码。
