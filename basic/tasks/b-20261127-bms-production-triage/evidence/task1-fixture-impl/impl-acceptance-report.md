# qywx fixture 实施验收报告（b-20261127-bms-production-triage / P1）

- 日期：2026-11-28
- 授权：实施授权裁定 AUTHORIZED（reply SHA256=`7ca5ce962a0aff7e0e645718f3ccd86069568ac63d8e2c82f2600ea54cce0e20`，
  存档 `../task1-fixture-plan/impl-authorization-verdict.txt`）；授权基线=`5f1bfe817ae74824352339d9f6f081dcb99b3cb0`
  （分支 handoff/20261128-bms-prod-triage-p1-r4）；设计基线=fixture-plan.md（R9 终审 PASS，reply `f230f10a…`）
- 被测 worktree：`D:\YotinGarden\.worktrees\bms-multi-device-login-acl`（HEAD=07fa3546 + 未提交工作区修改，同冻结方案版本绑定）

## 一、八项交付材料

| # | 交付项 | 证据 |
|---|---|---|
| 1 | 修改前后文件及 SHA256 | 前（被审版）=`../task1-fixture-plan/acl-multiDeviceLoginIntegrationTest-tested-version.java` SHA256=`c070798b98aae6bad508a0977ccb5303b9638fd68cfae5e9a3f88eba70226e30`（18793B）；后（实施版）=`acl-multiDeviceLoginIntegrationTest-impl-version.java` SHA256=`223f0565c88570b19293115a987e6ac0337420863eba0e947cba0c72997b5b42`（49344B，与 worktree 实际文件逐字节一致） |
| 2 | 完整 diff 证明仅修改授权文件 | `acl-multiDeviceLoginIntegrationTest-impl-diff.diff`（673 行，前后全量 diff）+ `impl-change-scope.txt`（实施后 git status/diff --stat：已跟踪修改仍=冻结方案归档的 5 文件（pom/UserController/UserToken/AuthInterceptor/UserServiceImpl），未跟踪=acl-server/src/test/（授权文件+UserTokenTest），业务代码/生产配置零触碰） |
| 3 | 双锁获取、持有、释放证据 | `fixture-lock-lifecycle.log`（33 行 [FIXTURE-LOCK]，SHA256=`c29f13340e3a295e0f746a1522ea2f5093d1d2470dd6e597e04b62ff5c98a871`）：文件锁获取（`C:\Users\youting\.acl-it\acl-it-fixture-mutex.lock`）→连接 L 建立（autocommit=true）→`GET_LOCK('acl_it_fixture_mutex',0)` 获取→runId=28ee9487 登记→残留预检→创建（user_id=204）→各测试 @After 吊销→@AfterClass 清理验证→`RELEASE_LOCK` 返回 1 核验→连接关闭→文件锁释放，15 项生命周期事件完整 |
| 4 | 异步线程终止证据 | awaitWorkersTermination 为冻结方案复核版本原样保留（两阶段：宽限期自然终止→shutdownNow 后**无时限等待 isTerminated()**，测试文件 awaitWorkersTermination 方法；实施版未触碰该方法与并发测试体）——实际代码待审查方按 PASS_WITH_CONSTRAINTS 条款独立核验；运行证据=并发测试 concurrentQywxLoginsKeepTwoDistinctValidTokens PASS（5/5 含此项），且文件锁在 @AfterClass（全部测试终止后）才释放 |
| 5 | 测试运行完整日志和退出码 | `test-run.log`（670 行，SHA256=`74155cf98ea981ac…`）；退出码=0；`Tests run: 6, Failures: 0, Errors: 0, Skipped: 0`（集成 5/5 + UserTokenTest 1/1）；surefire 逐类报告已归档（com.ecog.acl.MultiDeviceLoginIntegrationTest.txt / com.ecog.acl.entity.UserTokenTest.txt）；`FAIL-EVIDENCE` 行数=0 |
| 6 | 数据库 pre/post 对账 | `baseline-pre.json` / `baseline-post.json`（SSH 只读采集，凭证仅经 stdin）+ `baseline-reconciliation.json`（逐维度判定全 PASS）：admin 活跃 token 1→1；user_token 全表活跃 23→23；admin token 行新增恰 2（均 is_deleted=1，gmt_create=2026-11-28 14:50:36 本轮测试内）／移除 0／既有行状态变化 0；既有活跃 token（7956e5cd…）前后同 id 未动 |
| 7 | Fixture、Token 清理结果 | fixture 行 post=`{id:204, user_name:acl_it_fixture_qywx_28ee9487, qywx_user_id:acl_it_fixture_28ee9487, is_deleted:1}`（行存在=无物理 DELETE，已逻辑删）；fixture 名下活跃 token pre/post 均 0；本轮登记 7 条 token 全部经 L `UPDATE user_token SET is_deleted=1 WHERE id=? AND is_deleted=0` 吊销（@After 5 次共 1/2/2/0/2 条） |
| 8 | 最终实施验收结论 | 见下节：**实施方自检 8/8 PASS，提交审查方独立复核** |

## 二、验收标准逐项（授权裁定"三、最终验收标准"八项）

| 验收项 | 通过条件 | 结果 | 依据 |
|---|---|---|---|
| 集成测试 | 5/5 PASS | **PASS** | `Tests run: 5, Failures: 0, Errors: 0` |
| 单元测试 | UserTokenTest PASS | **PASS** | `Tests run: 1, Failures: 0, Errors: 0` |
| Token | 本轮产生的 token 全部吊销 | **PASS** | @After 登记吊销 7 条 + @AfterClass 兜底吊销（user_id=204 活跃=0）+ 基线对账（新增 2 行均 is_deleted=1） |
| Fixture | 用户存在且 is_deleted=1 | **PASS** | post 基线 fixture 行 is_deleted=1（id=204） |
| 原有数据 | 无非预期变化 | **PASS** | 全表活跃 23→23；既有 token 行 0 移除 0 状态变化；admin 活跃 token 前后同 id |
| 锁机制 | 全生命周期有效，正常释锁 | **PASS** | 33 行生命周期证据；RELEASE_LOCK=1 核验通过；文件锁释放；FAIL-EVIDENCE=0 |
| 异步线程 | 所有工作线程实际终止 | **PASS** | 并发测试 PASS + awaitWorkersTermination 冻结版未触碰（实际代码待独立核验） |
| 清理验证 | 全部通过，无未解释残留 | **PASS** | `[FIXTURE-LOCK] fixture清理与验证全部通过：user_id=204`（验证 a/b/c 在测试内执行）+ 基线对账零意外 |

## 三、实施披露（重要，非静默变更）

1. **双锁获取钩子：@BeforeClass→@Before**。冻结 §2 以 @BeforeClass 描述获取时序，JUnit4+SpringRunner 下静态方法无法访问实例注入的 DataSource（实例注入发生在类级 setup 之后），故按 §2 原顺序（①文件锁→②连接 L→③GET_LOCK）移入 @Before 实例方法：类级静态守卫保证整轮仅获取一次、任一测试执行前完成；获取时序、fail-closed 语义不变；锁窗口覆盖全部测试+清理+验证全程（强于冻结窗口且不弱化互斥）。此为 JUnit 生命周期适配，非机制变更；冻结的"锁未持有则清理整体跳过""@AfterClass 即使获取失败仍执行"语义均保留。
2. **@After 吊销通道**：由 `userTokenService.deleteByToken`（应用层）改为锁连接 L 的 `UPDATE user_token SET is_deleted=1 WHERE id=? AND is_deleted=0`（§2"token 清理 R5 起全部走 L"冻结条款）；已在本测试体内经 logout 逻辑删的 token 影响行数=0 属幂等清理，仅记录不判败。
3. **破坏性操作入口核验**：R4 冻结的 SELECT 1 探活 + CONNECTION_ID()==IS_USED_LOCK() 比对实施于三处入口（残留扫描前、INSERT 前、@AfterClass 清理前）+ @After 吊销前（加严）。
4. **基线脚本补充**：`runtime/acl_db_baseline_remote.py` 增 fixture 维度（LEFT 前缀活跃计数，禁 LIKE）；`runtime/acl_test_baseline_drive.py` 修复 stdin 双用途陷阱（`python3 -` 吃掉 JSON stdin——按 acl_user_schema_drive.py 头注教训改为 scp 上传+`PYTHONPATH=/tmp/pylib python3 /tmp/acl_db_baseline.py`）。两脚本为 AIEO 任务侧工具，非 BMS 代码；均为只读采集，无业务写入。

## 四、约束遵守自检

- 仅修改 MultiDeviceLoginIntegrationTest.java（worktree 变更范围证明=impl-change-scope.txt，与冻结归档一致）；
- 业务代码/生产配置零改动；业务断言原样保留（5 个 @Test 方法体除 4 处调用点替换外零改动）；
- 零物理 DELETE（全部破坏性写入=INSERT/`UPDATE … SET is_deleted=1 WHERE … AND is_deleted=0`，L 上 PreparedStatement）；
- 1062 未发生也未配置重试（唯一性预检=0 后插入，runId=28ee9487 无冲突）；
- main 合并/生产发布未执行（本报告仅为实施验收材料提交）。

## 五、结论

实施按冻结方案（fixture-plan.md §1-§5，R9 PASS）完成，运行与对账全绿，实施方自检 **8/8 PASS**。
按授权裁定提交审查方（会话 6b0a741f-0ffc-83e9-938c-25058f8f7406）独立复核；验收通过亦不自动获得
main 合并或生产发布权限（DEC-010 红线不变）。
