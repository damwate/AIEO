# qywx fixture 自建自清方案（B 方案，修订版 R4·最后终审轮）—— P1 任务1 测试代码修改计划

提交轮次：R1 审查 REWORK（P1-1/P1-2，r1-plan-review-verdict.txt）→ R2 修订 → R2 复审主体通过+
补三项异常生命周期（r2-plan-review-verdict.txt，SHA256=
`5f253f4d7e828aabd9172d6a8f6e8768c0dd81670fb3687d8d3d6d6cd3871976`）→ R3 修订 →
R3 终审 REWORK 仅两项（r3-plan-finalreview-verdict.txt，SHA256=
`2cb4fc175a5a9dbfefc0f3183822e048b7b4e683a0155fa22e8b5fc31106ea60`：①持锁后失锁安全边界未封闭；
②证据归档错名 r3-review-reply.txt 实为 R2 复审 reply，已按内容更名修正）→ 本 R4 仅补
**破坏性操作前锁归属核验 + 失锁禁清理 + finally 异常分离**，其余一概不动。
状态：**仅方案修订，未实施**。授权边界：最后终审通过前不改代码、不执行 INSERT、不重跑测试。
范围：仅 `MultiDeviceLoginIntegrationTest.java` 单测试文件；业务代码、生产配置、测试断言零改动；
运行方式与命令不变（`python -I runtime/run_acl_tests.py`）。

## 1. fixture 身份（虚构、唯一、最小字段）——复审五项 PASS 原样保留

| 列 | 值 | 依据 |
|---|---|---|
| user_name | `acl_it_fixture_qywx_<runid>` | UNIQUE 列（user-schema.json 实测）；逻辑删旧行仍占用 UNIQUE 索引，随机后缀保证任意轮次不冲突 |
| qywx_user_id | `acl_it_fixture_<同一runid>` | varchar(64)；虚构命名空间实测零占用；绝不含真实企业微信 userid |
| pass_word | SecureUtil.md5(随机UUID) 32hex | NOT NULL 列占位哈希；非任何真实凭证；fixture 不走密码登录路径 |
| is_admin | false（显式） | 无权限提升 |
| is_deleted | false（显式） | 防 NULL 行被 @TableLogic 查询条件过滤 |
| 其余列 | 不设（NULL/默认） | real_name 有 UNIQUE 约束故必不设；其余可空列不设；gmt_create 有 DEFAULT CURRENT_TIMESTAMP |

runid = UUID 去横线取 8 位 hex，每次运行新生成；user_name 与 qywx_user_id 用同一 runid。

## 2. 写入与清理机制（全部走应用既有持久层，零原生写 SQL）

- **创建**：`userService.insert(user)`（MyBatis-Plus 实体插入）。实测配置链：BaseEntity
  `@TableField(fill=INSERT)` + `MPMetaObjectHandler` → gmtCreate/isDeleted 自动审计；仍显式 `setDeleted(false)` 双保险。
- **用户清理**：`userService.deleteById(fixture)` —— 实测该链路为逻辑删（application.yml
  `logic-delete-value: 1` / `logic-not-delete-value: 0` / `LogicSqlInjector` + BaseEntity `@TableLogic`），
  物理 DELETE 在该链路不可能发生。
- **【P1-1 修正】命名空间匹配改严格字面前缀**：MySQL LIKE 中 `_` 是单字符通配符，
  `acl_it_fixture_%` 并非严格前缀语义且可能误匹配扩大清理范围。所有命名空间扫描（预检与审计）
  一律改为 `WHERE LEFT(<col>, ?) = ?`，两参数均 PreparedStatement 绑定（参数1=前缀长度 int，
  参数2=`acl_it_fixture_` 字面量），user_name 与 qywx_user_id 两处同样处理；全程禁用 LIKE 做命名空间匹配。
  本轮唯一性预检（自身完整名）本就用 `=` 精确匹配，不受影响。补采诊断脚本 user-schema.json 曾用
  LIKE——其语义偏宽（多匹配方向），"零占用"结论不受影响；实施版一律 LEFT 字面前缀。
- **【P1-2 新增】跨进程互斥（MySQL 命名锁）**：@BeforeClass 第一步（先于残留检查）用 dataSource
  独立连接（autocommit=true，仅用于锁，不承载业务 SQL）执行 `SELECT GET_LOCK('acl_it_fixture_mutex', 0)`：
  - 返回 1 → 持锁继续；返回 0 或 NULL 或获取过程抛异常 → **fail-closed：关闭该未持锁连接并抛异常，
    本轮不扫描、不清理、不创建**。
  - 持锁连接存 static 字段，同一连接持有至清理验证完成，覆盖残留检查→创建→4 测试生命周期→清理→验证全程。
  - **【R4 补·破坏性操作前锁归属核验】**：每个破坏性操作入口（残留命名空间扫描及残留逻辑清理、
    fixture 创建、@AfterClass token 与用户清理）之前，**均在原持锁连接上**执行核验，两项都过才继续：
    ① 连接探活（原连接执行 `SELECT 1`，异常即失锁）；
    ② 锁归属核验：`SELECT CONNECTION_ID()`（原连接）与 `SELECT IS_USED_LOCK('acl_it_fixture_mutex')`
    比对——IS_USED_LOCK 返回持锁会话连接 id，必须等于本连接 id；NULL（锁已释放）或等于其他 id（他人持锁）
    均判失锁。**仅"连接对象非 null"或"此前 GET_LOCK 曾返回 1"不算数**。
    核验与操作之间仍可能中断——因此任何连接异常一经检测立即停止，不允许回退到其他连接继续执行。
  - **【R4 补·失锁行为（fail-closed）】**：一旦检测到持锁连接失效或锁归属丢失：立即终止后续测试及
    破坏性清理；不换连接继续；不重新获取锁补做本轮清理；记录失锁与清理未完成情况；本轮验收失败并输出
    残留审计；未完成残留留给后续获得锁的轮次按其预检处理。**@AfterClass 即使执行，失锁后也不执行任何删除**。
  - 释放：@AfterClass 清理与验证全部完成后 `SELECT RELEASE_LOCK(...)` 再关连接（try/finally 结构见 §3）。
  - 异常/进程退出安全：@AfterClass 即使 @BeforeClass 失败仍执行（JUnit4 ClassRoadie）；锁未持有则
    清理逻辑整体跳过（无对象可清）；进程崩溃时 MySQL 会话断开、GET_LOCK 自动释放——三个退出路径均不依赖文档声明。
  - 锁仅用于测试进程互斥，不做任何生产业务逻辑。
- **token 清理**：每测试 `@After` 对登记 token `deleteByToken` 吊销（既有机制）；
  @AfterClass 按 fixture userId 兜底吊销剩余活跃 token。

## 3. 清理顺序固定、try/finally 释锁与结果验证（R2 复审补充要求 + R3 异常生命周期补齐）

@AfterClass 整体为 **try/finally**：

- **try（顺序固定，先 token 后用户，不先删用户再找 token）**：
  0. 【R4 补】入口锁归属核验（见 §2 两项核验）——失锁则 try 不执行任何删除，直接走失败路径（记录+验收失败+残留审计）。
  1. 若 fixture 未创建（@BeforeClass 持锁前失败）→ 跳过清理，无对象可清。
  2. 按 fixture userId 查询活跃 token → 全部 deleteById 逻辑吊销（user_token 同为 @TableLogic 链路）。
  3. `userService.deleteById(fixture)` 逻辑删除用户。
  4. **清理结果验证（jdbc 只读，任一失败即抛异常使本轮验收失败并输出残留行审计信息
     id/user_name/计数，不含敏感值）**：
     a) fixture 用户行存在且 is_deleted=1（行仍在=未发生物理 DELETE）；
     b) fixture userId 名下全部 token is_deleted=1（无活跃残留）；
     c) LEFT 前缀命名空间（user_name 与 qywx_user_id 两列）无 is_deleted=0 非预期活跃记录。
- **finally（无论 try 中 token 清理、用户逻辑删除或验证是否抛异常都执行）**：
  - 若曾持锁：`SELECT RELEASE_LOCK('acl_it_fixture_mutex')` 并**核验返回值=1**；
    释放失败必须记录并使本轮验收失败，不静默忽略。
  - 关闭持锁连接（连接已死则按已关闭处理并记录）。
  - **【R4 补·异常分离】**try 主异常与 finally 释放异常分别记录、统一判定失败，
    释放异常不得覆盖或掩盖 try 主异常——两类异常证据均保留。
- **部分初始化必须可清理（R3 补齐）**：fixture INSERT 成功后**立即**将 user_name / qywx_user_id /
  生成的 userId 写入 static 字段（先于回读断言）；即使后续回读或断言失败，@AfterClass 仍按 static
  字段定位并清理该 fixture——不因创建方法未完整返回而跳过清理。
- 每测试 `@After` 吊销登记 token 的既有顺序不变；两级清理均不物理 DELETE。

## 4. 测试改造点（单文件，仅调用点替换）——复审 PASS 原样保留

- 新增 `private User findOrCreateQywxFixtureUser()`（及锁与预检辅助）：持锁 → LEFT 前缀残留预检清理
  → 自身完整名/虚构 qywx id `=` 精确唯一性预检（=0 才插入）→ insert → 回读断言（id 非空 / is_deleted=0 /
  user_name 与 qywx_user_id 等于本 runid 预期值）；fixture 引用与持锁连接存 static 字段。
- 4 处 `findQywxBoundUser()` 调用点替换（行139/167/251/263）；原方法删除。
- 测试体其余零改动；测试间隔离不变（每测试开头 `activeTokenIds(userId)` 快照基线）；
  并发测试两阶段终止+兜底登记机制不变（R5/R6 已复核版本原样保留）。
- mock 链路不变：`workWechatService.getUserInfoByCode(...)` thenReturn 虚构值。

## 5. 基线与验收（沿用既有协议）

- 外部基线 pre/post：`runtime/acl_test_baseline_drive.py` 现协议 + 逐项对账；新增 fixture 维度
  （fixture 行 pre/post、LEFT 前缀命名空间活跃计数 pre/post）。
- 验收目标（=R6 裁定四条）：5/5 PASS；UserTokenTest PASS；全部测试 token 已吊销；
  fixture 用户已逻辑删除；现有数据无非预期变化。**清理验证失败=本轮验收失败**（复审补充要求 2）。
- 净留痕：每次运行后新增 1 行 is_deleted=1 fixture 用户 + 本轮 token（均 is_deleted=1，前缀可识别）。

## 6. 风险与禁止事项（复审补充要求 3：1062 处理保持原样）

- 禁止物理 DELETE；禁止 @TableLogic 配置改动；禁止 deleteById 之外的删除通道；禁用 LIKE 做命名空间匹配。
- fixture 无 admin 权限；不绑定真实企业微信身份；mock 不回调真实 API。
- UNIQUE 1062：原样报告、不换身份偷偷重试、不改现有数据、不把失败包装为通过（复审认可保持）。
- 不修改 run_acl_tests.py、不放宽任何业务断言、不动生产配置与业务代码。

## 7. 证据归档说明（R4 修正错名，零历史丢失）

| 文件 | 内容 | SHA256 | 字节 |
|---|---|---|---|
| fixture-plan.md | 本方案（R4） | 本 commit | — |
| user-schema.json | dev 库 user 表 15 列 SHOW COLUMNS 实测 + fixture 命名空间零占用预检 | commit 内 | 1721 |
| r1-plan-review-verdict.txt | R1 方案审查裁定（REWORK：P1-1/P1-2） | `ca47ba09934dec14a3fcdf22d568fc6116f43288a915630b1708156c6b070572` | 6510 |
| r2-plan-review-verdict.txt | R2 方案复审裁定（主体通过+补三项异常生命周期） | `5f253f4d7e828aabd9172d6a8f6e8768c0dd81670fb3687d8d3d6d6cd3871976` | 5295 |
| r3-plan-finalreview-verdict.txt | R3 方案终审裁定（REWORK：锁失效边界+归档修正） | `2cb4fc175a5a9dbfefc0f3183822e048b7b4e683a0155fa22e8b5fc31106ea60` | 7483 |

错名修正说明：原 `r3-review-reply.txt` 实际内容为 R2 复审 reply，终审（R3 裁定二·C）指出后已按内容
更名为 `r2-plan-review-verdict.txt` 并新增真正的 R3 终审 reply `r3-plan-finalreview-verdict.txt`；
原文件内容未覆盖、未丢失，仅名称归位。采集脚本（acl_user_schema_{remote,drive}.py）为只读诊断通道副本。
