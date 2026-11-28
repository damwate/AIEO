# qywx fixture 自建自清方案（B 方案，修订版 R5）—— P1 任务1 测试代码修改计划

提交轮次：R1 审查 REWORK（P1-1/P1-2，r1-plan-review-verdict.txt）→ R2 修订 → R2 复审主体通过+
补三项异常生命周期（r2-plan-review-verdict.txt，SHA256=
`5f253f4d7e828aabd9172d6a8f6e8768c0dd81670fb3687d8d3d6d6cd3871976`）→ R3 修订 →
R3 终审 REWORK 两项（r3-plan-finalreview-verdict.txt，SHA256=
`2cb4fc175a5a9dbfefc0f3183822e048b7b4e683a0155fa22e8b5fc31106ea60`）→ R4 修订 →
R4 终审 REWORK 唯一遗留=核验与破坏性操作间 TOCTOU 竞态（r4-plan-finalreview-verdict.txt，SHA256=
`39f80914258570d2137efc92775a314c774c8647f60d47075d0ff8a5b2784ece`，要求技术论证而非直接写码）→
本 R5=**锁连接承载全部破坏性操作（会话绑定消除 TOCTOU）+ 进程级文件锁外层互斥**，其余已通过项一概不动 →
R5 终审 REWORK 两项（r5-plan-finalreview-verdict.txt，SHA256=
`3bfde7d4cd6f2ec74a7e0fc5dad1bc2e3fc949b4043a5e185bdf935acd2e208e`：P1-1 文件锁路径随工作目录变化非单机全局、
P1-2 应用层写入未证明纳入保护；并明令冻结已通过项）→
本 R6=**固定机器级文件锁路径（user.home 锚定）+ 应用层写入生命周期证明（代码实证）**，其余已通过项一概不动 →
R6 终审（r6-plan-finalreview-verdict.txt，SHA256=
`3fdfa16498b5ff0feffedf5c7e6e51ff059ef3de9678875c2dd90c8d523c5c32`）：P1-1=PASS_WITH_CONSTRAINTS
（补 JVM 属性与文件系统命名空间约束后冻结）、异步终止=PASS_WITH_CONSTRAINTS（补实施验收条件）、
保护边界区分=PASS；**P1-2=REWORK——写入清单漏列 userTokenDao.deleteByMap()**（审查方所读版本含此调用）→
本 R7=**版本绑定（被测版=工作区修改版，审查方所读=HEAD/GitHub 版；deleteByMap 的移除正是被测功能本身）
+ P1-1 约束文字补齐**，双锁设计与已冻结部分不动（终审明令）。
状态：**仅方案修订，未实施**。授权边界：通过前不改代码、不执行 INSERT、不重跑测试。
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
- **【P1-2/R5】跨进程互斥（进程级文件锁 + MySQL 命名锁 + 锁连接承载全部破坏性操作）**：@BeforeClass
  依次：①获取进程级文件锁（见下）→ ②开独立连接 L（autocommit=true）执行
  `SELECT GET_LOCK('acl_it_fixture_mutex', 0)`：
  - 返回 1 → 持锁继续；返回 0 或 NULL 或获取过程抛异常 → **fail-closed：关闭该未持锁连接并抛异常，
    本轮不扫描、不清理、不创建**。
  - 持锁连接存 static 字段，同一连接持有至清理验证完成，覆盖残留检查→创建→4 测试生命周期→清理→验证全程。
  - **【R5 核心变更·锁连接承载全部破坏性操作（回应终审 TOCTOU 问题）】**：测试自有的全部破坏性写入
    （fixture INSERT、残留逻辑清理、token 吊销、fixture 用户逻辑删除）与验证查询一律在锁连接 L 上以
    PreparedStatement 执行，不再经 MyBatis 服务。**论证：GET_LOCK 为会话级锁，语句与锁同会话后，
    "锁有效"与"语句可执行"由同一会话本体绑定——会话死亡后该连接上不可能再执行任何语句，写入要么发生在
    持锁会话存活期内、要么根本不发生；锁有效期覆盖操作执行期由 MySQL 会话构造保证，不依赖任何操作前检查
    （操作前双重核验保留，降级为快速失败诊断，不再承担安全职责）。审查方 T1-T4 场景的 T4"A 失锁后仍执行
    逻辑删除"在本设计下不可能发生。**
  - **【R5·"不改变应用持久层"评估结论】**：业务层代码零改动；变更仅在测试文件内部——测试自有写入从
    MyBatis 服务改为 L 上的等价语句：fixture INSERT 复刻 MPMetaObjectHandler 填充结果（显式
    is_deleted=0，gmt_create 走列默认 CURRENT_TIMESTAMP，列集以 user-schema.json 实测为准，
    RETURN_GENERATED_KEYS 取 userId 供 static 登记）；逻辑删除复刻 LogicSqlInjector 语句形态
    `UPDATE <表> SET is_deleted=1 WHERE id=? AND is_deleted=0` 并核验影响行数——与 @TableLogic
    deleteById 生成语句同形态，属既有逻辑删除机制的等价执行，非新语义、非物理 DELETE。
    被测业务流（login/logout/qywxOAuthLogin）仍走应用层——它们是被测系统本身，不动。
  - **【R6·进程级文件锁（外层互斥，第二道防线；R5 终审 P1-1 修订）】**：锁文件改为**固定机器级路径**，
    锚定 user.home：`Paths.get(System.getProperty("user.home"), ".acl-it", "acl-it-fixture-mutex.lock")`
    （父目录 `.acl-it` 不存在则先创建；目录创建失败、路径不可写、tryLock 截止超时均 fail-closed 抛异常）。
    R5 旧路径（测试模块 `target/`）随 checkout/worktree/runner 工作目录变化，同机不同目录各自得锁、
    互斥不闭合（终审 P1-1 场景），废止。user.home 由 OS 用户账户决定，与 checkout/worktree/工作目录
    无关：**同机所有以同一 OS 用户身份启动的测试进程必然竞争同一把锁**（同一 JVM 内重复获取触发
    OverlappingFileLockException，同样 fail-closed）。**【R6 终审 P1-1 有条件通过的冻结约束】**：
    ① runner 禁止以 `-Duser.home` 启动参数指定不同路径，运行期禁止修改该系统属性（runner
    与测试代码均不得设置）；② 纳入本轮互斥范围的所有进程必须使用同一规范化后的 user.home
    路径与同一文件系统命名空间；③ 目录创建、路径解析、文件打开、锁获取任一步失败均 fail-closed。
    如实声明的边界（扩展后）：**跨 OS 用户、跨主机、不同文件系统命名空间均不覆盖**（runner
    本机单用户本地执行，run_acl_tests.py），不宣称全覆盖。
    锁文件在 user.home 下，repo 之外，天然不入 Git。FileChannel 存 static 字段，@AfterClass finally
    中释放并关闭；JVM 进程死亡由 OS 释放（本地文件系统可靠）。**作用：A 进程存活期间 B 完全无法进入
    生命周期——即使 A 的锁会话已死，B 也拿不到文件锁**（终审 P1-1 场景 A 活跃+B 换目录得锁 被排除；
    若 A 崩溃则文件锁与 MySQL 会话同时释放，B 由预检清理残留，与既有设计一致）。
  - **【R6/R7·应用层写入生命周期证明（回应终审 P1-2；R7 版本绑定修订）】**：被测业务流经应用连接池的
    写入不受 L 会话绑定保护，其保护唯一依据=文件锁覆盖整个生命周期。**写入清单必须按源码版本绑定陈述**
    （R6 终审指出清单漏列 deleteByMap——经核实那是版本差异，不是清单遗漏于被测版）：
    - **版本绑定（acl-source-version-binding.json，R7 新增证据）**：被测源码=worktree
      `task/bms-multi-device-login`（HEAD=`07fa35463d478716c51fd5a291c82a39aaaa96fd` **+ 未提交工作区
      修改**——被测功能本身尚未提交，故以内容 SHA256 绑定：UserServiceImpl.java=
      `d83d92dcbcfa965847621e52b1a25dc1bd89a603eec0fe667287a3f9b645e1c5`（副本
      acl-userServiceImpl-tested-version.java）、MultiDeviceLoginIntegrationTest.java=
      `c070798b98aae6bad508a0977ccb5303b9638fd68cfae5e9a3f88eba70226e30`，diff 归档
      acl-userServiceImpl-tested-vs-HEAD.diff）。审查方所读=YotinGarden/bms-acl 主 checkout（HEAD
      相同、工作区干净=GitHub HEAD 版）。
    - **被测版写入清单（本轮唯一有效清单）**：userLogin 唯一业务写入=`token.insert()`
      （UserServiceImpl.java:195）；qywxLogin 唯一业务写入=`token.insert()`（:296）；**被测版不存在
      `userTokenDao.deleteByMap`**——HEAD 版 184-188/286-290 两块（物理 DELETE user_id+app_id，MP
      BaseMapper.deleteByMap，旧单设备行为）在工作区修改中已删除，grep 全仓登录路径 0 命中（仅
      ApplicationServiceImpl:47/RelationServiceImpl:54 无关表）；**删除"登录前清 token"正是被测功能
      本身（多设备/多会话并存）**。logout 唯一业务写入=`userTokenService.deleteByToken`（user_token
      逻辑删；UserController.java:670 → UserTokenServiceImpl.java:50 `this.delete`）。
      qywxOAuthLogin 手机号自动绑定分支 `userService.updateById(dbUser)`（UserController.java:633）
      **fixture 测试下不可达**：mock `getUserInfoByCode` 返回虚构 userid=`acl_it_fixture_<runid>`、
      fixture 预绑定同一值 → 控制器第 2 步 selectOne 直接命中，dbUser 永不为 null；mock 不回调真实
      API 为既有约束。三类业务流其余全部为只读查询，无其他写入。
    - **审查方所读版本（HEAD/GitHub）写入清单**：userLogin/qywxLogin=`userTokenDao.deleteByMap`
      （HEAD:188/:293，物理 DELETE）+`token.insert()`——审查方 R6 观察对该版本**正确**，该清单不适用
      于被测版，特此并列声明以闭合版本分歧。
    - **时间窗论证**：文件锁在 @BeforeClass 第一语句获取（先于一切测试代码与业务调用），于 @AfterClass
      finally 中清理与验证全部完成后释放——同步业务写入全部发生在测试方法体内，必然处于锁窗内。
    - **异步闭合论证**：并发测试 executor 为方法级局部变量；`awaitWorkersTermination` 第二阶段
      shutdownNow 后**无时限等待 `isTerminated()`**（MultiDeviceLoginIntegrationTest.java:233-240），
      任何返回路径下工作线程都已实际终止；兜底登记在终止确认后扫描——不存在"登记后仍新增 token"或
      "释放文件锁后仍有业务写入"的窗口；测试类无其他常驻线程/Timer/Scheduled（grep 实测仅此类局部 executor）。
      **【R6 终审补·实施验收条件】**：实施时必须对照实际代码验证 awaitWorkersTermination 在所有
      返回路径上确认 executor 已实际终止（不得只凭方案注释认定）；线程无法终止时只能继续等待或使
      本轮失败，**不得提前释放文件锁**——此条件列入 §5 验收。
    - **如实声明的保护边界（终审明令不得宣称全由 L 保护）**：测试自有写入（fixture INSERT/残留清理/
      token 吊销/用户逻辑删除/验证）=L 会话绑定保护（会话死=语句不可能执行）；被测业务流写入
      （上列清单）=不受 L 保护，靠**文件锁互斥窗内执行+异步终止证明**约束；A 进程在 L 失效且文件锁
      仍持有期间业务流也不再执行（测试已停止，后续破坏性入口先失败）。剩余不可覆盖面=跨 OS 用户/
      跨主机并发（上条边界声明），如实声明为约束，不宣称全覆盖。
  - **【R5·双层不变式】**：破坏性写入仅当 (a) A 进程存活（文件锁互斥排除 B 启动）且 (b) L 会话存活
    （否则语句执行前/中失败）才可能发生——两进程同时破坏性操作不存在可行交织；"检查成功"不再等同于
    "操作安全"，后者由会话绑定构造保证。测试中途 L 死亡：文件锁仍在（B 被挡），A 的下一破坏性入口即
    失败（L 不可用）→ 本轮验收失败+残留审计，B 在 A 退出后由预检清理残留（逻辑删）。
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
- **token 清理（R5 起全部走 L）**：每测试 `@After` 对登记 token 在 L 上按
  `UPDATE user_token SET is_deleted=1 WHERE id=? AND is_deleted=0` 逐条吊销（L 不可用=记录失败、
  交主异常路径）；@AfterClass 兜底吊销同通道。

## 3. 清理顺序固定、try/finally 释锁与结果验证（R2 复审补充要求 + R3 异常生命周期补齐）

@AfterClass 整体为 **try/finally**：

- **try（顺序固定，先 token 后用户，不先删用户再找 token）**：
  0. 【R4 补】入口锁归属核验（见 §2 两项核验）——失锁则 try 不执行任何删除，直接走失败路径（记录+验收失败+残留审计）。
  1. 若 fixture 未创建（@BeforeClass 持锁前失败）→ 跳过清理，无对象可清。
  2. 按 fixture userId 查询活跃 token → 在 L 上按 `UPDATE user_token SET is_deleted=1
     WHERE id=? AND is_deleted=0` 逐条吊销（影响行数核验）。
  3. 在 L 上按 `UPDATE user SET is_deleted=1 WHERE id=? AND is_deleted=0` 逻辑删除 fixture 用户
     （影响行数=1 核验）。
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

- 新增 `private User findOrCreateQywxFixtureUser()`（及文件锁/命名锁/预检辅助）：持双锁 →
  LEFT 前缀残留预检清理 → 自身完整名/虚构 qywx id `=` 精确唯一性预检（=0 才插入）→
  在 L 上 INSERT（复刻填充语义，RETURN_GENERATED_KEYS 取 userId 立即登记 static）→
  回读断言（id 非空 / is_deleted=0 / user_name 与 qywx_user_id 等于本 runid 预期值）；
  fixture 身份、userId、L、FileChannel 均存 static 字段。
- 4 处 `findQywxBoundUser()` 调用点替换（行139/167/251/263）；原方法删除。
- 测试体其余零改动；测试间隔离不变（每测试开头 `activeTokenIds(userId)` 快照基线）；
  并发测试两阶段终止+兜底登记机制不变（R5/R6 已复核版本原样保留）。
- mock 链路不变：`workWechatService.getUserInfoByCode(...)` thenReturn 虚构值。

## 5. 基线与验收（沿用既有协议）

- 外部基线 pre/post：`runtime/acl_test_baseline_drive.py` 现协议 + 逐项对账；新增 fixture 维度
  （fixture 行 pre/post、LEFT 前缀命名空间活跃计数 pre/post）。
- 验收目标（=R6 裁定四条）：5/5 PASS；UserTokenTest PASS；全部测试 token 已吊销；
  fixture 用户已逻辑删除；现有数据无非预期变化。**清理验证失败=本轮验收失败**（复审补充要求 2）。
- **【R7 新增·异步实施验收条件】**：实施版须以实际代码验证 awaitWorkersTermination 所有返回
  路径确认 executor 已实际终止；无法终止=继续等待或本轮失败，绝不提前释放文件锁（R6 终审约束）。
- 净留痕：每次运行后新增 1 行 is_deleted=1 fixture 用户 + 本轮 token（均 is_deleted=1，前缀可识别）。

## 6. 风险与禁止事项（复审补充要求 3：1062 处理保持原样）

- 禁止物理 DELETE；禁止 @TableLogic 配置改动；禁止 deleteById 之外的删除通道；禁用 LIKE 做命名空间匹配。
- fixture 无 admin 权限；不绑定真实企业微信身份；mock 不回调真实 API。
- UNIQUE 1062：原样报告、不换身份偷偷重试、不改现有数据、不把失败包装为通过（复审认可保持）。
- 不修改 run_acl_tests.py、不放宽任何业务断言、不动生产配置与业务代码。

## 7. 证据归档说明（R4 修正错名，零历史丢失）

| 文件 | 内容 | SHA256 | 字节 |
|---|---|---|---|
| fixture-plan.md | 本方案（R6） | 本 commit | — |
| user-schema.json | dev 库 user 表 15 列 SHOW COLUMNS 实测 + fixture 命名空间零占用预检 | commit 内 | 1721 |
| r1-plan-review-verdict.txt | R1 方案审查裁定（REWORK：P1-1/P1-2） | `ca47ba09934dec14a3fcdf22d568fc6116f43288a915630b1708156c6b070572` | 6510 |
| r2-plan-review-verdict.txt | R2 方案复审裁定（主体通过+补三项异常生命周期） | `5f253f4d7e828aabd9172d6a8f6e8768c0dd81670fb3687d8d3d6d6cd3871976` | 5295 |
| r3-plan-finalreview-verdict.txt | R3 方案终审裁定（REWORK：锁失效边界+归档修正） | `2cb4fc175a5a9dbfefc0f3183822e048b7b4e683a0155fa22e8b5fc31106ea60` | 7483 |
| r4-plan-finalreview-verdict.txt | R4 方案终审裁定（REWORK：核验与破坏性操作间 TOCTOU） | `39f80914258570d2137efc92775a314c774c8647f60d47075d0ff8a5b2784ece` | 3753 |
| r5-plan-finalreview-verdict.txt | R5 方案终审裁定（REWORK：文件锁路径非单机全局+应用层写入未证明纳入保护） | `3bfde7d4cd6f2ec74a7e0fc5dad1bc2e3fc949b4043a5e185bdf935acd2e208e` | 5169 |
| r6-plan-finalreview-verdict.txt | R6 方案终审裁定（P1-2 REWORK：漏列 deleteByMap=版本分歧；P1-1 有条件通过） | `3fdfa16498b5ff0feffedf5c7e6e51ff059ef3de9678875c2dd90c8d523c5c32` | 4754 |
| acl-userServiceImpl-tested-version.java | 被测版 UserServiceImpl 工作区副本（raw=d83d92dc…645e1c5；repo blob LF=1d91da09…83875a，仅行尾差异） | binding.json | 12595 |
| acl-multiDeviceLoginIntegrationTest-tested-version.java | 被测版测试文件工作区副本（raw=blob=c070798b…226e30） | 同左 | 18793 |
| acl-userServiceImpl-tested-vs-HEAD.diff | 被测版 vs HEAD（07fa3546）diff——deleteByMap 移除即被测功能 | commit 内 | 见文件 |
| acl-source-version-binding.json | 版本绑定：分支/HEAD/两版清单/SHA256/grep 结论 | commit 内 | 见文件 |

错名修正说明：原 `r3-review-reply.txt` 实际内容为 R2 复审 reply，终审（R3 裁定二·C）指出后已按内容
更名为 `r2-plan-review-verdict.txt` 并新增真正的 R3 终审 reply `r3-plan-finalreview-verdict.txt`；
原文件内容未覆盖、未丢失，仅名称归位。采集脚本（acl_user_schema_{remote,drive}.py）为只读诊断通道副本。

## 8. R4 终审 TOCTOU 问题与 R5 回答（终审要求的技术论证，本文 §2 为设计落地）

- 终审问题：操作前核验（SELECT 1 + CONNECTION_ID() + IS_USED_LOCK）与实际破坏性操作非原子，
  且 MyBatis 服务走连接池连接、与锁连接不同会话——锁会话死亡后操作仍可能在无互斥保护下执行；
  增加核验次数不能消除 TOCTOU。
- R5 回答：**锁有效期覆盖操作执行期改为由"会话绑定"构造保证**——全部测试自有破坏性写入移到锁连接 L
  同一 MySQL 会话执行（§2 核心变更），会话死=语句不可能执行；"操作前核验"降级为快速失败诊断。
  另加进程级文件锁外层互斥（A 进程存活期 B 无法进入生命周期），审查方 T1-T4 场景的 T2/T3/T4 三步
  全部不可行。终审方向一"锁与实际破坏性数据库操作同一连接生命周期"采纳并已评估持久层影响（§2 等价语句）；
  终审"数据库端强制保护"与"如实报告约束冲突"两条分支因此无需启用。

## 9. R5 终审两项 REWORK 与 R6 回答（终审明令冻结已通过项，本轮只补这两项）

- R5 终审裁定（r5-plan-finalreview-verdict.txt，SHA256=
  `3bfde7d4cd6f2ec74a7e0fc5dad1bc2e3fc949b4043a5e185bdf935acd2e208e`）：L 会话执行测试自有
  INSERT/逻辑清理/token 吊销=PASS_WITH_CONSTRAINTS（对实际在 L 上执行的 SQL 成立）；文件锁
  外层互斥=REWORK（`target/` 路径非单机全局）；被测业务流走应用层=REWORK（写入未证明纳入
  保护）；失锁 fail-closed=PASS_WITH_CONSTRAINTS；历史归档与单文件范围=PASS。已通过项
  （fixture 字段/前缀匹配/清理顺序/异常分离/归档）冻结不动。
- **R6 对 P1-1 的回答**：锁文件路径从随目录变化的 `target/` 改为 user.home 锚定的固定机器级
  路径（§2 R6·进程级文件锁）——同机同 OS 用户的全部 checkout/worktree/工作目录必然竞争同一
  把锁；终审 P1-1 场景（A 活跃持锁、L 已死，B 换目录取锁）下 B 拿不到文件锁，被排除。路径
  不可用/创建失败/超时一律 fail-closed；跨 OS 用户与跨主机并发如实声明为边界约束。
- **R6 对 P1-2 的回答**：按终审要求列出业务流全部数据库写入（代码实证清单，§2 R6·应用层写入
  生命周期证明）——userLogin/qywxLogin 仅 token INSERT、logout 仅 token 逻辑删、qywxOAuthLogin
  自动绑定分支在 fixture 测试下不可达（预绑定+mock 虚构 userid，逐条注明行号）；这些写入均处于
  文件锁窗内（@BeforeClass 第一语句获取→@AfterClass finally 释放），异步侧以
  awaitWorkersTermination 第二阶段无时限等待 isTerminated() 证明任何返回路径下工作线程都已
  实际终止，锁释放前不存在在途业务写入。保护边界如实区分（测试自有写入=L 会话绑定；业务流
  写入=文件锁窗+异步终止证明），未宣称全部破坏性操作都由 L 保护；未增加任何操作前核验次数
  （终审明令禁止以加核验替代证明）。

## 10. R6 终审裁定与 R7 回答（终审明令：只处理 P1-2 + P1-1 约束文字，双锁设计与冻结部分不动）

- R6 终审裁定（r6-plan-finalreview-verdict.txt，SHA256=
  `3fdfa16498b5ff0feffedf5c7e6e51ff059ef3de9678875c2dd90c8d523c5c32`）：P1-1 user.home 固定锁路径
  =PASS_WITH_CONSTRAINTS（补 JVM 属性与文件系统命名空间约束后可冻结，不必再换锁机制）；异步线程
  终止=PASS_WITH_CONSTRAINTS（实施必须保留"线程实际终止后才能释放文件锁"，按实际代码验证）；
  保护边界区分=PASS；**P1-2=REWORK——写入清单漏列 userTokenDao.deleteByMap()**。
- **R7 对 P1-2 的回答（版本绑定闭合分歧）**：审查方观察属实但适用对象不同——其读取的
  YotinGarden/bms-acl 主 checkout=HEAD `07fa3546`（GitHub 版，工作区干净），该版 userLogin/qywxLogin
  确在 token.insert() 前执行 `userTokenDao.deleteByMap(mapper)`（HEAD:188/:293，MP BaseMapper
  deleteByMap=物理 DELETE user_id+app_id，旧单设备行为）。**被测源码=worktree task/bms-multi-device-login
  工作区（同 HEAD+未提交修改），该两块已删除，grep 登录路径 0 命中**——删除"登录前清 token"正是
  被测功能本身（多设备/多会话并存）。被测版以内容 SHA256 绑定（UserServiceImpl=d83d92dc…、
  测试文件=c070798b…）并归档源码副本+diff+binding.json（§7）。两版清单在 §2 并列陈述，被测版
  清单不变：userLogin/qywxLogin 仅 token.insert()（:195/:296）、logout 仅 deleteByToken 逻辑删
  （:670）、绑定分支 :633 不可达。
- **R7 对 P1-1 的回答**：按终审三条冻结约束补齐 §2 文字——①runner 禁止 `-Duser.home` 覆盖与
  运行期修改该属性；②互斥范围内所有进程必须使用同一规范化 user.home 与同一文件系统命名空间；
  ③目录创建/路径解析/文件打开/锁获取任一步失败 fail-closed；边界扩展声明=跨 OS 用户/跨主机/
  不同文件系统命名空间均不覆盖。锁机制不再更换。
- **异步实施验收条件**已写入 §2/§5：实施时以实际代码验证 awaitWorkersTermination 所有返回路径
  确认 executor 实际终止；无法终止=继续等待或本轮失败，绝不提前释放文件锁。
