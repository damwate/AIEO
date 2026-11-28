# 过程记录：b-20261127-bms-production-triage

## 规划状态

当前暂停点：P0完整验收HOLD；P1候选代码未提交且集成测试未执行；P2原始数据完整落盘，正式比对未运行。按用户2026-11-27指令，后续先阅读handoff.md并同ChatGPT复核对应方案，再分段操作，不做一次性收尾。

## S0 三问题只读诊断与基线固定

①本步骤目标：

确认三项问题的直接原因、生产实际版本和最小修复/首查边界，尤其避免把未发布的 Er+F 重构误判为本次审核阻塞原因。

②修改文件：

仅 AIEO 任务夹与决策日志；业务仓只读。生产服务器仅通过 SSH 读取日志和服务现场，无配置、数据或服务变更。

③修改内容：

#### P0：0元变更单审核按钮被隐藏

- 生产发布记录：2026-11-25 BMS UI=`1a0742d6caa1471473dd8c917543df43e282f1b5`、service=`28611b52d4f7dc5290c9a1692a88a076f468fead`；昨天 Er+F 代码未发布。
- 目标流程 `5610`：`flow_type=50`、`flow_status=12`、`amount=0.00`，状态含义为待PM审核。
- nginx 铁证：2026-11-27 14:11–14:18 多次 `GET /approval/flow/5610/get` 返回200（935字节），没有任何 `POST /approval/flow/5610/pmAudit`；同时详情后的项目信息和收支明细请求正常，排除整个弹窗加载失败。
- `ApprovalFlowController.getProjectApprovalFlow()` 调 `ApprovalFlowServiceImpl.get()`；后者在 `ApprovalFlowServiceImpl.java:668-670` 使用 `ProjectApprovalFlowDTO.from(c)`。
- `ProjectApprovalFlowDTO.java:186-197` 对单条和列表同用一个转换器，`:193-194` 设置 `flowOper/flowOperName`；因此 status=12 会得到 `pmAudit`，原“单条get漏flowOper”假设已排除。
- 实际PM弹窗为 `finance_project_other_detail3.html`。`bms-ui .../finance_project_other_detail3.html:455-460`：`flowType==50 && amount==0` 时隐藏 `#receiveCard`；`:180-191` 显示同意/驳回的 `#divBtnOper` 位于该卡片内，故按钮随卡片隐藏。
- 该逻辑来自 `084728d8`（2026-10-16），`git merge-base --is-ancestor 084728d8 1a0742d6`=true，确认在当前生产基线内；属于既有缺陷被本次0元变更单触发，不是昨天审批流变更造成。
- 运行中生产jar的内嵌HTML与`1a0742d6`同路径SHA256均为`4f80eb471d151872119e9552d96d82ed60373491db6e6097a04e91b501d32e9d`，直接证实生产产物含此逻辑。
- 本地真实浏览器组件复现（无后端、无生产请求）：0元status=12时`ready=true/errors=[]`，但`receiveCard=none`、同意/驳回均不可见，同时recordType=202、totalAmount=0已正确填值；证据=`evidence/task3-ui-baseline-zero.json`。
- 同期 access_token 发生变化，说明登录互踢与审核问题同场出现，但按钮消失可由上述DOM条件独立解释，不将互踢当作本单根因。

#### P1：ACL登录互踢

- `bms-acl/acl-server/.../UserServiceImpl.java`：`userLogin()`（约175行）和 `qywxLogin()`（约277行）均在签发新 token 前执行 `userTokenDao.deleteByMap({user_id, appId})`，删除该用户该应用所有旧 token，形成单会话互踢。
- `UserTokenServiceImpl` 已有 `deleteByToken(id)` 供 `/user/logout` 按当前 token 吊销；可作为多设备改造后的退出语义。
- 企微扫码 `qywxLogin` 当前 `expireTimeSpan=100000000` 秒；目标为token/Cookie自身到期后再登录，而非其他设备登录时失效。
- 只读影响面审计补充：现有 `getByToken` 与 ACL `AuthInterceptor` 已检查过期，但 `/user/menu/list`、`/user/config/list` 只查token存在，需要补齐同一有效期约束；token当前由用户材料+毫秒时间戳MD5生成，同毫秒并发可能撞主键，需改为兼容32位列宽的随机UUID。`logout`服务端已按token主键吊销，无需改成用户级批删。
- 实际部署库的`user_token`联合唯一索引、历史`expire_time=NULL`数量尚须只读核验；不得凭仓库无DDL就断言数据库无约束。BMS Cookie链须在BMS仓库验证，不能拿ACL-UI的2小时Cookie结论替代。

#### P2：三方价格首查

- 已有 JST→BMS 单向同步入口（report_center / `POST /jst/sku/sync`）；尚无小店→JST与三方商品价格差异首查交付。
- 用户明确首操作只抓不匹配再讨论，因此本阶段禁止任何价格同步写入。
- 首查主口径=小店`skus.sale_price/100`（分转元）、JST`sale_price`、BMS`sku.stock_unit_price`；`retail_price`和成本价另列，不能混比。已知映射=BMS`unique_code`=JST`sku_id`；小店侧须先实证`out_sku_id/sku_code`等真实字段，不得用标题模糊匹配。
- 现有JST `ApiUtil.callApi()`会隐式写`jst_data`，token临期刷新会写`jst_token`；小店`sync-products`会写快照和配置文件。首查必须使用独立只读HTTP传输和数据库`READ ONLY`会话，不得调用这些现有写入入口。
- “2026年前后”暂只能以BMS `gmt_create`作候选分桶；JST查询窗口和小店sync_time都不是商品创建时间，无法确定的记录标`ERA_UNKNOWN/NEEDS_REVIEW`。

④执行结果：

P0/P1 根因已定位到具体代码；P0 具备“生产数据 + nginx动作序列 + 生产DOM条件”闭环证据。P2 进入只读数据抽取设计。尚无业务代码修改、无生产发布、无生产数据写入。

⑤测试结果：

本步为只读诊断，代码测试=NOT_APPLICABLE。生产基线祖先核验通过；接口与DOM源码链路逐项对账完成。动态修复测试留待S2/S3。

⑥验收证据引用：

验收结论：PASS（仅S0只读诊断事实，经S1-R2逐项确认生产问题、jar对应和接口证据）。证据源：`evidence/task3-production-timeline.txt`、`evidence/task3-ui-baseline-zero.json`、`evidence/task3-ui-baseline-controls.json`；dispatch目录=`phase0/logs/dispatch-2026-11-27T07-06-12`，reply SHA256=`bed87ad6b96ec246cbff8357cfda69cb65ae9ac3dab6e51a2ced24c461af84e6`。发布验收不在S0范围。

## S1 规划复审

①本步骤目标：由ChatGPT独立复核三项问题的根因证据、最小实施边界与验收矩阵，未获实施许可前不改业务代码。

②修改文件：AIEO任务夹、规划简报`phase0/tools/brief_bms_prod_triage_plan_r1.txt/r2.txt`及派单证据；业务仓保持只读。

③修改内容：按R1补齐完整SHA、生产POST对照、单文件权限边界、token精确退出/过期/并发设计、BMS Cookie独立验证及价格真实映射/只读传输约束。

④执行结果：R2明确允许P0单HTML实施、P1独立分支开发测试、P2只读核查；发布与master合并未获许可。审查中误写的“生产浏览器复现/按提供dev证据”已校正，不作为实测证据。

⑤测试结果：规划阶段业务测试=NOT_APPLICABLE；既有生产只读证据与本地基线复现作为规划输入，dev动态测试归S2。ST-05规划检查无FAIL，记录=`st05-planning.log`。

⑥验收证据引用：验收结论：PASS（仅限本地实施设计范围；发布门禁不通过且不进入发布）。dispatch目录=`phase0/logs/dispatch-2026-11-27T07-06-12`，reply SHA256=`bed87ad6b96ec246cbff8357cfda69cb65ae9ac3dab6e51a2ced24c461af84e6`；包内证据=`evidence/task3-production-timeline.txt`。

- **S1-R1=REWORK**（新审查会话 `6b0928b8-6454-83ec-a62c-eb7ff2e8e8cb`；`phase0/logs/dispatch-2026-11-27T06-51-44/reply.txt`，10271字节，SHA256=`51f64fc4343e60f4031897a1c4d5fdafb1975c49478424c874664ed7166c327f`）。整体优先级和隔离方向获认可，但要求：P0不能只恢复按钮，须补POST可达与0元真实状态流转证据；P1须明确当前token精确吊销、每次认证过期校验、缓存/并发兼容；P2只读方向通过，但须避免扩成订单退款审计。
- **R1后补证（只读）：** 生产nginx在2026-11-27 14:53:35已有另一变更单 `POST /approval/flow/5608/pmAudit` 返回200（60字节），证明生产PM审核路由实际可达；生产service基线`28611b52...`明确 `ChangeOrderFlow + pmAudited + amount=0` 直接置99并写payAmount=0。UI控制器 `ProjectApprovalFlowController.java:940-945` 接收现有路径并只用当前登录上下文`getOperator()`，本任务不新增或放宽权限。
- **范围纠偏：** P2验收对象是商品/SKU在三方的价格字段与映射，不纳入订单优惠、退款、运费的逐单对账；订单/售后只在解释具体价格来源时作为辅助证据。
- **派单故障记录：** 首次自定义实例未发即被参数/指针门禁拒绝，第二次新profile输入框超时未发送；第三次改用已验证的`bms-erf`实例发送成功。均未形成重复消息，不计验收轮次。ego链缺CLI/profile、agent-kit更新代理失败已按L-014/L-018诊断，使用Standard既有派单通道。
- R2将携带完整40位基线SHA、源码路径、上述POST/状态机证据和细化矩阵复审；通过前业务代码保持未修改。

### S1-R2 有条件通过设计，进入P0实施

- 证据：`phase0/logs/dispatch-2026-11-27T07-06-12/reply.txt`，8461字节，SHA256=`bed87ad6b96ec246cbff8357cfda69cb65ae9ac3dab6e51a2ced24c461af84e6`。
- 裁定：P0/P1=PASS WITH CONSTRAINTS，P2=PASS WITH CONSTRAINTS；整体仍标REWORK仅表示未达到发布批准条件。reply明确“批准按当前HTML单文件方案实施”，P1允许独立分支开发测试，P2允许只读核查。因此按L-020进入S2，不把该结论登记为发布PASS。
- P0约束：只调整收款卡与审核操作区耦合；不改后端状态机/权限/收款数据。正式验收须包含真实状态变化、无新增收款、重复提交与权限路径。生产5610的真实审核属于生产写操作，本任务不擅自执行，留待用户批准发布后的业务验证。
- P1约束：双登录/退出/过期/并发/企微/BMS Cookie链实测；NULL历史token语义和实际联合索引未核清前不得宣告正式验收。
- P2约束：商品/SKU映射未确认的记录不参与差异汇总；独立只读传输、保留原始数据/时间/范围，证明无写请求。
- **回复表述校正：** reply中的“生产浏览器复现”“按提供的dev证据”与实际输入不符；本任务仅已有本地浏览器复现和dev测试计划。dev实测在S2执行后登记，不能引用reply代替真实测试。

## S2 P0 0元变更单审核热修

①目标：从生产UI基线`1a0742d6caa1471473dd8c917543df43e282f1b5`单文件恢复0元待PM审核入口，同时不改变非零、终态和权限/后端路径。

②修改文件：`bms-ui src/main/resources/static/views/project/finance/finance_project_other_detail3.html`（独立worktree/分支`task/bms-zero-change-audit-hotfix`）；AIEO测试脚本与证据。

③修改内容：将`#divBtnOper`从`#receiveCard`内移到同一表单内的卡片外，使amount=0只隐藏收款信息，不再隐藏审核/驳回；99/-10原有隐藏逻辑不变。单文件diff +13/−12，`git diff --check`通过。

④执行结果：本地浏览器修复后五场景均无JS错误；0元待PM同意/驳回可见，非零和负数保持可见，99/-10保持隐藏；0元同意准确构造`POST /approval/flow/5610/pmAudit`且recordType=202/totalAmount=0，驳回构造`/reject`，均由本地fixture拦截，未请求生产。证据=`evidence/task3-ui-fixed-results.json`。

⑤测试结果：热修前后compile及最终package均PASS，完整日志=`evidence/task3-ui-package.log`（BUILD SUCCESS）。dev真实后端动态PASS：专用0元单2170/flow5198审核12→99、payAmount=0、收支记录ID不变；重复审核BAD_REQUEST且状态/记录不变；2171/flow5199驳回12→-10；匿名请求FORBIDDEN且状态不变。证据=`evidence/task3-dev-regression.log`。首次脚本误拒列表既有code=0，修正后从2170续跑，未重复造首单；首次Maven误在AIEO无POM目录执行失败，改用`-f`指定干净worktree后通过，均不作为业务缺陷。

⑥验收证据引用：被测commit=`98c71c017acde67eaafbc5f61d8607ecdb610d19`，parent=`1a0742d6caa1471473dd8c917543df43e282f1b5`，ST-01 PASS=`evidence/st01-task3-ui.json`；完整diff=`evidence/task3-ui-hotfix.diff`；组件证据=`evidence/task3-ui-baseline-zero.json`、`task3-ui-baseline-controls.json`、`task3-ui-fixed-results.json`；dev日志=`evidence/task3-dev-regression.log`。
- S2-R1b独立验收=**修复方向PASS / 完整证据链BLOCKED**：`phase0/logs/dispatch-2026-11-27T07-32-34/reply.txt`，SHA256=`3757e9ee8a07a0d3ab10c026910bb91244716734c819139234bfc7abb1ac3970`。审查方独立读取了生产基线并确认DOM修复原理，但未读未推送commit和原始包，不签发完整PASS。回复误带Er+F旧六查，本任务明确排除，不作为本P0范围。
- 附件两次均在发送前停止（Composer未知草稿/附件挂载未验证），没有重复发送；原始zip未上传。按ST-03当前解除手段需用户批准推送业务commit与脱敏证据包，不擅自push。
- S2挂起会商=**同意HOLD，P0代码无需返工**：`phase0/logs/dispatch-2026-11-27T07-38-26/reply.txt`，SHA256=`cf2eeb58f5e794002b9d81f8c15d9099d7c1a7c0959e93878f9024fd32d68cde`。挂起期间允许P1/P2继续；不得自行推送、发布或追加P0 HTML。验收结论：BLOCKED（完整验收），解除条件=用户授权推送/提交证据后独立复核通过。

## S3 P1 ACL多设备登录与30天统一生命周期

①本步骤目标：解除账密/企微登录互踢，允许多设备多场景长期并存；新会话token与BMS主Cookie统一30天，所有认证入口共用同一有效期规则，logout只影响当前token。

②修改文件：ACL仅`UserServiceImpl.java`、`UserToken.java`、`UserController.java`、`AuthInterceptor.java`及必要测试；BMS仅`FrameCookieUtils.java`、`MobileOAuthController.java`及必要测试。P0 HTML不修改。

③修改内容：删除两处user+app旧token批删；token改`UUID.randomUUID()`安全随机32位；`UserToken.isValid(Date now)`纯函数定义为`expireTime!=null && now!=null && expireTime.after(now)`，即NULL/恰等于当前/过期均无效；getByToken/menu/config/AuthInterceptor统一调用。Date保存绝对时间毫秒，不做秒/毫秒或时区转换；测试传固定Date覆盖到期前/等于/之后。UserController两条签发路径和BMS Cookie统一2592000秒，历史token不改期不删除。

④执行结果：R4有条件PASS，允许实施；R4两个REWORK细节已按上述纯函数时间和同一30天契约落实为编码约束。生产预检无NULL历史、无user+app唯一索引，token主键查询走PRIMARY；证据=`evidence/task1-db-preflight.txt`、`evidence/task1-bms-cookie-preflight.md`。候选代码已写入隔离worktree但未提交，集成测试未实际执行；按用户最新指令已暂停，后续先复核diff/测试方案再运行。

⑤测试结果：BMS两文件compile PASS；ACL完整test-compile/动态集成测试未执行（Maven旧Nexus依赖阻断，详见handoff.md），不得登记P1通过。须交真实并发、账号/qywxLogin、双浏览器、退出隔离、过期/NULL/吊销、menu/config、Cookie Max-Age/安全属性及同名Cookie证据。真实企微外部OAuth不调用凭证，qywxLogin服务行为在dev集成测试；不以其冒充真实扫码。

⑥验收证据引用：规划R4=`phase0/logs/dispatch-2026-11-27T07-43-10/reply.txt`，SHA256=`3267b1cea3513ecb77a2a843bb3bd534d5ea88542136e607b84c217df3157f09`；最终代码SHA、diff、测试与独立验收结论待实施后登记。

### S3 实施复核R1与R2材料准备

- R1=REWORK（`phase0/logs/dispatch-2026-11-27T08-29-36/reply.txt`，SHA256=`a5a7bf48e8c7234de295f348a53f3d76c458bec3e736c6ca4e17b3326dce19c0`）：要求明确logout闭环、数据库双token归属与集合断言、独立并发事务、NULL单元/集成边界、保存失败及实际Cookie行为。
- 已修订候选测试：第一次登录前读取基线；账号/企微/并发均验证原集合+恰好两个新token、user/app归属、A退出B保留；无外层测试事务；NULL仅固定Date单测；补保存失败不返回token。生产字段补证expire_time NOT NULL、id char(32)、app_id char(6)。
- 完整R2包=`evidence/task1-r2-review.zip`，20文件，SHA256=`25c709449bdb8ae2c15e4c98fdc8ce5cfa49387f3387e888edfb4d787198d49a`，含当前完整源码/测试/diff/逐项回复/生产预检。测试仍未运行、代码未提交；R2需通过可读通道提交完整包，不以摘要冒充源码验收。
- **R2=REWORK（附件通道实测打通）**（`phase0/logs/dispatch-2026-11-28T02-50-56/reply.txt`，11185字节，SHA256=`09032b433a05fc7d74c72e1b1558152498c3e783c1b4f781b786f904bf36f7b9`，会话`6b093fa6-b4bc-83ec-83da-4f284d068df3`续派）。附件zip经审查方独立验证SHA256一致+MANIFEST 19/19全对+源码实际审读，明确"不是摘要审查"。裁定：token随机生成/30天签发/单token logout方向/并发事务设计/NULL边界=PASS，不需重新设计；六项REWORK=①账号登录30天断言时间顺序错误（before取在login之后）+DATETIME秒级精度容差；②并发测试finally仅shutdownNow无awaitTermination，异常路径下@After清理竞态可能遗留token；③保存失败测试捕获任意RuntimeException=假阳性，须验dev SQL_MODE+断言具体持久化失败+证明无遗留；④FrameCookieUtils通用4参重载默认寿命36000→2592000，须全仓审计调用点或仅改登录Cookie显式调用；⑤补BaseEntity/MyBatis-Plus逻辑删除配置证据；⑥UI基线不一致说明（R1写98c71c01、R2预检材料写1a0742d6）。R3通过前仍禁测试/提交/推送/发布，P0保持HOLD。
- **R3修订与六项结果**：R3-1 beforeA移到login前+assertThirtyDays两侧1秒容差；R3-2 finally改为shutdown+awaitTermination(60s)→shutdownNow+30s；R3-3 保存失败测试重写（测试内查@@sql_mode须含STRICT_TRANS_TABLES、isMysqlDataTooLong沿cause链只认MySQL 1406、三口径清理+无遗留断言）；R3-4 全仓Cookie调用审计（`evidence/task1-r3-review/evidence-cookie-audit.md`，选项A）；R3-5 逻辑删除配置证据（BaseEntity @TableLogic+yml全局+LogicSqlInjector+is_deleted列）；R3-6 基线澄清（UI基线98c71c01=P0热修commit，parent=1a0742d6生产基线）。另如实登记test-compile暴露的3处测试既有类型错误已修（仅测试代码）。R3包29文件SHA256=`96785ba89d12e45ec6c984deb6760591e4340b6052bdf436c32c02d1bc25cafb`。
- **R3=REWORK（五项PASS+一项代码阻断）**（`phase0/logs/dispatch-2026-11-28T03-17-09/reply.txt`，7851字节，SHA256=`876bff9439077f48a81dd2c624f299269d94d2a6e9aac6c984a783db9410efef`，同会话续派，附件29/29验证通过且实际审读）。R3-1/3/4/5/6全部PASS；R3-2唯一阻断=InterruptedException分支只shutdownNow不等待实际终止+第二次awaitTermination失败断言会跳过兜底登记；另要求补`UserTokenServiceImpl.deleteByUserId`全仓调用审计（只读，保留方法）。
- **R4修订完成（待派）**：①finally重构=抽出`awaitWorkersTermination`助手（中断路径1s循环等待实际终止、再中断仅记录继续、返回前恢复中断位；助手零断言返回boolean）；finally顺序=等待终止→登记新增非基线token→之后才fail（终止状态与清理状态分离，断言不打断兜底登记）。②`evidence/task1-r4-review/evidence-deletebyuserid-audit.md`=全仓grep仅声明+实现2命中、调用者0、token服务使用点=getById×4+deleteByToken:670、登录路径无token删除、方法原样保留。R4包8文件（完整测试源码×2+两仓diff+审计+说明+test-compile日志+MANIFEST），SHA256=`ad02b949990858fb8ad0481c6573691ade32f1c9f03a813ed41cc32732bdaf9d`；test-compile BUILD SUCCESS（`evidence/task1-r4-testcompile.log`）；业务代码零改动；ST-05=`st05-p1-impl-r4.log` IN_PROGRESS无FAIL。
- **R4派单被环境阻断（附件配额）**：两次派单均fail-closed"附件挂载未验证"且send-state=NOT_SENT（无重复投递风险）。6轮DOM诊断（`phase0/logs/diag-r4-attach-01..06-*`）定位根因=**ChatGPT账号附件配额用尽**（页面明示"已达到文件附件数量限制…11月29日10:55后重试"），input被app禁用+隐藏、setInputFiles/paste均被拒；R3 03:17成功挂载恰为窗口内末次配额。处置二选一待用户拍板：A=证据包走GitHub交接分支+简报给仓库+分支+SHA（skill既定"文件走GitHub"主通道，推送须批准）；B=等待2026-11-29 10:55配额重置后重发附件派单。会话ctx-budget=WARN（31584B/49152B），R4完成后按L-018第6条评估迁移。

- **R4-R6经GitHub交接分支收敛（用户批准推送）**：分支`handoff/20261128-bms-prod-triage-p1-r4`（R4=1fea425/R5=334dd76/R6=c3f6257/run1=55b3cbe/run2=16e0997），推送走SakuraCat代理14979（L-016）。R4裁定=REWORK仅R4-1时间边界（`dispatch-2026-11-28T04-09-24/reply.txt` SHA256=`2c278196…49c146`）；R5修订=审查方供给的逐轮remaining(NANOSECONDS)终版修法（期内终止=true、期满shutdownNow后不限时等isTerminated()才=false）；R5裁定=REWORK仅时间边界残余（`dispatch-2026-11-28T04-23-11/reply.txt` SHA256=`2af9631d…06e10`）；R6裁定=PASS+授权测试（`dispatch-2026-11-28T04-28-19/reply.txt` SHA256=`f8d18445…a2afc`）。旧审查会话6b093fa6达40197B近HARD，R5起迁移新会话（--new-session，L-018第6条）；裁定B起再迁移（第4条消息阈值）→会话6b0a5e02。
- **两轮授权测试**：run1=装配级失败（NONE无ServletContext→上下文未起、被测逻辑零执行、基线逐字段零污染），审查批复"R6测试装配处置：PASS，授权实施最小修复并重跑"仅授权NONE→MOCK一词（`dispatch-2026-11-28T04-41-39/reply.txt` SHA256=`c5766d4f…8ac65`）；run2=上下文成功、`accountTokensCoexistAndLogoutOnlyRevokesCurrentToken`端到端PASS、UserTokenTest PASS、4项qywx卡`findQywxBoundUser`前置（dev库180用户qywx绑定数=0）；+2 token逐项对账（均is_deleted=1、现有行零变化）。证据=evidence/task1-test-run{,2}。
- **R6裁定=fixture选B**（`dispatch-2026-11-28T04-51-29/reply.txt` SHA256=`72b537eb…cd8fa6`）：4项qywx=BLOCKED（非业务FAIL非PASS）；拒绝A一次性INSERT（不可重复、生命周期分离易遗留）；本轮仅授权提交方案。方案=`evidence/task1-fixture-plan/fixture-plan.md`（+user表15列SHOW COLUMNS实测+命名空间零占用预检）；要点=虚构命名空间`acl_it_fixture_<runid8hex>`（user_name UNIQUE逻辑删旧行仍占名→随机防冲突）、最小字段、is_admin显式false、MP @TableLogic链deleteById实为UPDATE逻辑删、@AfterClass token兜底+下轮预检清残留、4处findQywxBoundUser调用点替换、测试体/断言/并发清理零改动、验收=R6裁定四条+5/5。

- **fixture方案R1审查=REWORK（主体保留）→R2修订已提交待复审**：方案简报续派采集fail-closed（INBOUND_START_UNIT_MISSING，send-state=SEND_CONFIRMED）→按L-018派生`recoll_fixtureplan_r1.mjs`补采（三参数核对+reload先行+归属校验七查全过，未重发），reply 6510B SHA256=`ca47ba09…070572`。裁定：九项PASS（含虚构身份/唯一性/最小字段/逻辑删链/调用点替换），两项必改——**P1-1** LIKE中`_`为通配符须改`LEFT(col,CHAR_LENGTH(%s))=%s`参数绑定严格字面前缀（user_name/qywx_user_id两处）；**P1-2** 双进程并发互删风险须MySQL GET_LOCK跨进程互斥（覆盖预检→创建→测试→清理、连接保持、异常/退出释放、fail-closed）。补充：清理顺序固定（先token后用户再释锁）、清理结果验证失败=验收失败、1062不重试保持。修订版=evidence/task1-fixture-plan/fixture-plan.md（R2：§2 P1-1/P1-2落地、§3五步顺序+三项验证）；授权边界=允许提交修订、暂不允许实施。

- **fixture方案审查循环R2→R6（经GitHub交接分支收敛，见DEC-144~DEC-148）**：R2复审=主体通过+补三项异常生命周期（try/finally释锁核验、部分初始化static立即登记、锁连接三态，SHA256=`5f253f4d…3871976`）→R3修订→R3终审=REWORK两项（失锁边界未封闭+归档错名，SHA256=`2cb4fc17…06ea60`；错名已按内容git mv更正r1/r2/r3系列零丢失）→R4修订（破坏性操作前锁归属核验+失锁fail-closed+finally异常分离）→R4终审=REWORK唯一遗留TOCTOU（SHA256=`39f80914…784ece`，要求技术论证）→R5论证=锁连接承载全部破坏性操作（会话绑定消除TOCTOU）+进程级FileLock外层互斥+双层不变式→R5终审=REWORK两项（SHA256=`3bfde7d4…2e208e`：文件锁target/路径随目录变化非单机全局、业务流写入未证明纳入保护；已通过项冻结）→R6修订=锁文件改user.home锚定固定机器级路径（同机同OS用户必争同一把锁，跨OS用户/跨主机如实声明边界）+业务流写入清单代码实证（token.insert仅UserServiceImpl:195/:296、logout逻辑删UserController:670、自动绑定分支UserController:633在fixture测试下不可达）+时间窗+awaitWorkersTermination无时限等isTerminated()异步闭合证明（测试文件:233-240），未增加核验次数。授权边界不变=仅方案；实施/INSERT/重跑未授权。
- **fixture方案R6终审=P1-2 REWORK（实为版本分歧）→R7版本绑定修订已提交待终审**：R6简报正常送达，reply 4754B SHA256=`3fdfa164…5c5c32`。裁定=P1-1有条件通过（补约束后冻结）、异步终止有条件通过（补实施验收条件）、边界区分PASS、P1-2=REWORK（称清单漏列deleteByMap）。核实=审查方读主checkout HEAD版（07fa3546，工作区干净）：userLogin/qywxLogin确有`userTokenDao.deleteByMap`（HEAD:188/:293，MP物理DELETE user_id+app_id旧单设备行为）——观察对该版正确；**被测版=worktree工作区（同HEAD+未提交修改），两块已删，grep登录路径0命中，删除该调用正是被测功能（多会话并存）本身**。R7=§2写入清单改版本绑定陈述（被测版内容SHA256绑定：UserServiceImpl=`d83d92dc…`、测试文件=`c070798b…`，源码副本+diff+binding.json归档）+P1-1三约束文字（禁-Duser.home覆盖/同规范化路径+同文件系统命名空间/四步fail-closed，边界扩展跨OS用户/跨主机/不同命名空间）+§5异步实施验收条件。新增§10。授权边界不变=仅方案。
- **fixture方案R7终审=P1-1 PASS冻结+异步终止PASS；R8仅补工作区变更范围**：reply 5112B SHA256=`6f8ab339…1765`。P1-1三约束+边界声明核对通过=冻结；异步终止=PASS_WITH_CONSTRAINTS（审查方实测归档测试源码awaitWorkersTermination确认实际终止才返回，实施须按实际代码验收）；双锁设计冻结；P1-2=REWORK仅一项=缺worktree完整变更清单（版本分歧本身已确认成立：HEAD两处deleteByMap/被测版两处已删/token.insert行号195/296均核对一致）。R8=归档acl-worktree-change-scope.txt（5修改+2新增；UserTokenServiceImpl未修改=HEAD一致）+全量diff+UserController副本（raw=`155743a5…`/blob=`0cb4f096…`），§2补范围闭环，新增§11。授权不变=仅方案终审。
- **fixture方案R8终审=主体证据全过，仅差UserTokenTest归档→R9最后补证**：reply 2845B SHA256=`cf1f02e3…63b7bf`。已闭合=5修改文件逐一复核一致（UserController副本:633/:670属实、UserTokenServiceImpl未修改=HEAD证据有效、自动绑定分支不可达维持）；唯一缺口=UserTokenTest.java源码归档（git diff不含未跟踪文件）+"单测试文件"表述澄清。R9=归档副本（raw=blob=`88907d17…`，32行纯内存单元测试无DB无写入）+§2闭环+"单测试文件=fixture改造范围、UserTokenTest=独立既有功能单元测试（§5验收本体）互不影响"澄清，新增§12。授权不变=仅方案终审。
- **fixture方案R9终审=PASS，方案终审结束（R1→R9九轮收敛）**：reply 2601B SHA256=`f230f10a…408b0`（采集fail-closed→recoll_fixtureplan_r9.mjs补采七查全过未重发）。五项全PASS（源码归档/内容完整/无DB无写入/范围不介入fixture链/单测试文件表述）。**最终状态：P1-1=PASS冻结、P1-2=PASS冻结、R9=PASS、异步终止=PASS_WITH_CONSTRAINTS（冻结实施验收条件）、双锁清理机制维持冻结；整体方案PASS_WITH_CONSTRAINTS。授权边界=方案终审≠实施授权**：改BMS代码/INSERT或清理/重跑测试/擅改冻结机制仍禁止，实施须另行授权且验收须核对实际代码（异步终止/锁释放/清理结果）。标识澄清=内容SHA256与Git blob SHA-1两类摘要勿混称（UserTokenTest blob=`2026606c…`实测一致），binding.json已补git_blob_sha1。新增§13，§7补r9行。

## S4 P2 三方商品价格正式比对与业务清单

①本步骤目标：使用已抓全的BMS/小店/JST原始数据生成可复算、可回链的差异清单，供用户讨论；零同步写入。

②修改文件：AIEO任务夹`runtime/compare_three_way_prices.py`、`validate_price_comparison.py`、`build_price_workbook.py`；`evidence/price-comparison-final-*`；`deliverables/BMS三方商品价格差异首查_20261127.md/.xlsx`。业务仓零修改。

③修改内容：严格编码映射、Decimal分转元与差额方向；多店逐行、JST按原始JSON去重；冲突/多版本、老数据、时间缺失、缺映射、无效字段均单列并退出新数据差异汇总；2026+权威候选需唯一有效匹配。工作簿含汇总/有效差异/待处理/缺编码/全量/复核六页。

④执行结果：正式候选1541行；2026+可比较157行，其中差异7、一致150；排除1384；待处理758；缺编码70；JST1950原始→1086编码、重复移除864、冲突0；BMS逻辑删除937另行排除。正式文件已生成，样本冒烟数字未复用。业务报告只列事实与待讨论项，不生成修复价。

⑤测试结果：内置FINAL断言通过（输入2203/1266、66/143/70、1950、eligible+excluded=all、冲突零差额、Decimal总额重算）。独立验证器重新解析CSV并回链原始ID：1541行、758待处理、BMS1266、小店143、JST1086及7差异全部PASS，输入SHA一致，证据=`evidence/price-comparison-independent-validation.json`。工作簿recalc 8公式0错误、audit0、scan0、validate0；日志=`evidence/workbook-recalc.log`、`workbook-audit.log`、`workbook-scan.log`、`workbook-validate.log`。首次验证器把CSV"0"当真导致KeyError，修正数值判断后全过；工作簿首次30s重算超时，180s成功；扫描跨表区间4项经改整列公式后归零，未忽略问题。

⑥验收证据引用：算法复核=`phase0/logs/dispatch-2026-11-27T08-34-47/reply.txt`，SHA256=`458aa2031db38a44f01bb581e47cb72037827a9f81a984b7bde13d9a0f4345d2`，PASS_WITH_CONSTRAINTS；正式验收=`phase0/logs/dispatch-2026-11-27T09-01-50/reply.txt`，SHA256=`da60b664b4ec669449e44e0e3e0da96f019a6ad15ffe436e30750180e702a8a1`。验收结论：PASS（正式只读比对成果的算法、分类、独立验证和工作簿质量；对端未直接读取原始价格，未声称亲自复算原始业务数据）。历史JST全集限制保留；价格纠正、同步、token刷新、生产写入均未授权。原始业务数据未外传。

⑦用户两处纠错与导出v2（2026-11-28）：①"BMS逻辑删除的不要列，然后BMS的product库是有规格表的"——原BMS页列了937行is_deleted=1且未列规格。v2：过滤is_deleted（BMS页2203→1266行），联`sku_spec/specification/spec_value`实测规格表（只读双查询→`evidence/bms-sku-full.json`：2203 SKU+3939规格行），规格列=颜色/尺寸/规格/备注聚合+长宽高数值回填，编码+价格100%。②"聚水潭的商品不是有商品编码么，你这边怎么没导出来呢【小香松-1100】"——原编码列误用sku_code（商家编码，1950中仅148覆盖）。v2：编码=sku_id（商品编码，1950/1950全覆盖，小香松-1100→xxs1100验证通过），sku_code另列"商家编码"。`runtime/export_raw_data_excel.py`修订重跑，`deliverables/各库原始数据导出_20261128.xlsx`已更新。

## 返工记录

暂无 REJECT；REWORK 全部收敛，逐轮见 decision-log：

- R2=REWORK（2026-11-28，六项）→R3修订全落实（DEC-141）。
- R3=REWORK（2026-11-28，唯一代码阻断R3-2中断不等待实际终止）→R4修订落实（DEC-142）。
- R4=REWORK（2026-11-28，仅R4-1两阶段清理时间边界）→R5修订落实（DEC-143）。
- R5=REWORK（2026-11-28，固定1s等待轮越deadline残余）→R6按审查方终版修法落实（DEC-143）。
- R6=PASS（2026-11-28）→授权两轮测试执行；4项qywx=BLOCKED转fixture方案审查轮（DEC-143）。
- fixture方案R1=REWORK（2026-11-28，LIKE通配符+跨进程互斥）→R2修订落实（DEC-144）。
- fixture方案R2复审=主体通过+三项补齐（2026-11-28）→R3修订落实（DEC-145）。
- fixture方案R3终审=REWORK（2026-11-28，失锁边界+归档错名）→R4修订落实（DEC-146）。
- fixture方案R4终审=REWORK（2026-11-28，核验与操作间TOCTOU）→R5会话绑定论证落实（DEC-147）。
- fixture方案R5终审=REWORK（2026-11-28，文件锁路径非单机全局+应用层写入未证明）→R6修订落实（DEC-148）。
- fixture方案R6终审=P1-2 REWORK（2026-11-28，漏列deleteByMap=版本分歧：被测版无此调用，审查方读的是HEAD版）→R7版本绑定修订落实（DEC-149）。
- fixture方案R7终审=P1-2 REWORK（2026-11-28，仅差工作区完整变更范围证明；P1-1已PASS冻结）→R8最小补证落实（DEC-150）。
- fixture方案R8终审=P1-2 REWORK（2026-11-28，仅差UserTokenTest.java归档闭环）→R9补证落实（DEC-151）。
- fixture方案R9终审=PASS（2026-11-28，P1-2正式闭环，方案终审结束；九轮REWORK全部收敛无REJECT）→待单独实施授权（DEC-152）。
