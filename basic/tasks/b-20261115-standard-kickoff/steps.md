# steps：b-20261115-standard-kickoff

> 状态：规划两轮闭环（R1 修改后同意→v0.2 修订→R2 仅两处局部修改已落实，R2 明示可冻结），**步骤清单已冻结**。生效类（WORKFLOW/M2 生效、F-001 开工）保留用户拍板；执行按 WORKFLOW 增补②节点授权推进。

## 规划阶段记录

| 项 | 内容 |
|---|---|
| 规划草案 | standard/development-plan.md v0.1，commit 881b9052aaea027e0e99cf9d76280c0661fe1138 |
| R1 派单 | phase0/logs/dispatch-2026-11-15T11-05-17（新专用会话 6af99227，简报 brief_standard_kickoff_r1.txt 840B） |
| R1 结论 | **修改后同意**（reply 12751B，sha256=e9aa9e78631359eebc097775c8ec625932a88669826b1d6d2027a47604a5fde6）：①顺序改 A→C0→B（M2=开发治理能力/F-001=平台产品能力，职责验收授权独立）；②M2 保留独立文件，WORKFLOW 集成入口原则；③C1 落位 toolkit/+矩阵补强；④增 A4/B4/B5/I1-I7/H1-H12；⑦节点授权清单在案 |
| 规划 v0.2 | 四项修改全落实，commit e9d74ef6d056c2366152d9d802f564e5c13d88c7 |
| R2 派单 | 发送双验通过但采集 fail-closed（INBOUND_WINDOW_COMPLETENESS_UNPROVEN，dispatch-2026-11-15T11-10-49，禁重发）→ 归属校验型补采成功（recoll_kickoff_r2.mjs，recoll-2026-11-15T11-14-42-556Z，七查全过） |
| R2 结论 | **仍需修改（两处局部，无不同意项）**（reply 7872B，sha256=0f77d25719b1ee06…）：H1-H12 12/12、I1-I7 7/7、A1-A4 4/4、矩阵 10/10 落实；修改=①A5（M2 文件版本化规范候选元数据）②矩阵第 10 项 BLOCKED/FAIL 禁止 PASS；两处已落实；**R2 明示可冻结 steps.md 免再轮完整复审** |
| 冻结 | 步骤清单随 commit 9654914 冻结（含 DEC-053 登记） |

## S1 阶段A治理基线

- ①本步骤目标：治理基线三件产出——standard/WORKFLOW.md 草案成文（Basic 六模块继承+中级版差异 D1-D12+并行治理入口）/M2 独立文件修订为 v0.1 规范候选/PHASE-STATUS 2026-11-15 快照。
- ②修改文件：standard/WORKFLOW.md（新增）、standard/parallel-governance-draft.md（头部状态块+§6 版本记录）、docs/PHASE-STATUS.md（§0 快照+版本行 v0.9）、本任务包。
- ③修改内容：WORKFLOW.md 按规划阶段 A 设计（差异条款逐条标注来源，附录 A=A1 映射表载体）；M2 文件状态块改"规范候选/待用户批准（未经批准不生效）"+沿革+版本记录表（A5 四要素）；PHASE-STATUS 增分级路线快照声明 §1-§5 旧基线继续有效。**本次待验收 commit=a5d0afdc8712cc38fa70663f239cb74d8d6fec0d**（单 commit 申报，基线=965491411b53102b62c08f5c5a0a6e22091ab11a，parent 核验 ✓，rev-list=1 ✓；diff=恰 3 个 S1 文件；ST-01 机器预检记录见 acceptance/review-request-s1.md）。
- ④执行结果：三文件成文；ST-05 自检拦截 steps.md 步骤小节格式缺口（## S<编号> 标题）后修正重跑。S1 独立验收 R1：**REJECT 2 项**（问题1=申报行数误用 --stat 组合列拆分≠机器 numstat，别名 P1-01；问题2=A2 缺 DEC-049~052 逐项核对，别名 P1-02）→ 修正后限定复验（见返工表）。
- ⑤测试结果：文档步骤无代码测试；ST-05 检查器自检通过（步骤小节修正后）；A1-A5 对照=R1 判定 A1/A3/A4/A5 PASS、A2 FAIL（问题2）→ 补附录 B 后复验 PASS。
- ⑥验收证据引用：S1-R1=dispatch-2026-11-15T11-22-14（fail-closed 禁重发）→recoll_kickoff_s1.mjs 补采（recoll-2026-11-15T11-25-35-834Z，七查全过，reply 5623B sha256=4c5e700a88d688ee…）=REJECT 2 项（问题1=行数申报/问题2=A2 缺 DEC-049~052 核对；待验收 a5d0afdc8712cc38fa70663f239cb74d8d6fec0d）；S1-R2 限定复验=dispatch-2026-11-15T11-29-16（reply 2139B sha256=677b1b96722a7cec701d776ea34b453e4ac8b13475b216e6c797da9595546865，被测=91b164672f0d8bb3d512b3e963e76910146cf829，问题1/问题2 逐项 PASS）。**S1 验收结论：PASS**（问题1/问题2 关闭）。

## 返工记录表（S1-R1 首次 REJECT 建表）

| 问题编号 | 轮次来源 | 问题描述 | 整改内容 | 修复 commit | 验证 |
|---|---|---|---|---|---|
| 问题1 | S1-R1 REJECT P1-01（reply sha256=4c5e700a…88ee） | 绑定申报逐文件增删行数"+16 -4/+12 -1"与机器结果不符——根因=误读 git diff --stat 组合列自行拆分申报 | 申报口径改 git diff --numstat 逐文件增删分离，机器输出原文入复验请求 | 91b164672f0d8bb3d512b3e963e76910146cf829 | S1-R2 复验 PASS 关闭（reply sha256=677b1b96722a7cec701d776ea34b453e4ac8b13475b216e6c797da9595546865，dispatch-2026-11-15T11-29-16） |
| 问题2 | S1-R1 REJECT P1-02（同上） | A2 决议红线核对缺 DEC-049~052 完整逐项映射 | standard/WORKFLOW.md 增附录 B《决议核对表》DEC-010~052 逐项，版本记录移附录 C | 91b164672f0d8bb3d512b3e963e76910146cf829 | S1-R2 复验 PASS 关闭（同上） |
| 问题3 | S2-R1 REJECT P1-01（reply sha256=6f53348aa924ceb8…） | 立项对象前提错误：F-001 状态漂移（T-P1-908 已落地而 FEASIBILITY/PHASE-STATUS 未同步） | FEASIBILITY F-001 校正 CLOSED+PHASE-STATUS 校正+误定文件移除+对象重定位 GPT-03 审查腿 | 0eceb006df5d0074cb29c6758141b761ed9f925a | R1 未关→R3 复验 PASS 关闭（文件头 v0.10 同步；reply sha256=f74d3f5886af46dd…） |
| 问题4 | S2-R1 REJECT P1-02（同上） | I3 审查腿一期边界不明+I4 异常规则缺分类+L-018 引用范围不准 | v0.2 §4 一期边界+§5 五类错误处置表+L-018 限定网页派单范围 | 0eceb006df5d0074cb29c6758141b761ed9f925a | S2-R2 复验 PASS 关闭（reply sha256=2de7fd0f91aa46dc…） |
| 问题5 | S2-R1 REJECT P1-03（同上） | I5 缺权限与授权模型 | v0.2 §6 四主体表→R2 缺 C7 身份对应→v0.3 §6 凭据三类+C7 §8.5/8.6/8.7 落实 | 0eceb006df5d0074cb29c6758141b761ed9f925a；R3 补订=56235f0639974827b654b6680bf47ac2b3d1c578 | R1/R2/R3 三次 REJECT→触发止损→会商1 挂起（待用户裁定；L-019） |
| 问题6 | S2-R1 REJECT P1-04（同上） | I6 验收矩阵不可执行 | v0.2 §7 矩阵 A1~A6→R2 缺状态预期/注入点/幂等键/断点/回滚分支→v0.3 §4 状态路径=state_machine.py:33-37 合法出边+§7 六场景逐步可执行化 | 0eceb006df5d0074cb29c6758141b761ed9f925a；R3 补订=56235f0639974827b654b6680bf47ac2b3d1c578 | R1/R2/R3 三次 REJECT→触发止损→会商1 挂起（待用户裁定；L-019） |
| 问题7 | S3-R1 REJECT P1-01（reply sha256=59ae93368215b7f9…） | R4/numstat git 命令非零退出被当空列表放行（fail-open，可错误输出 PASS） | R4 rev-list 与 numstat diff 非零退出改 raise GitCmdError→RX BLOCKED；故障注入测试 b5d/b5e（失败→BLOCKED 退出 2、无 R4 PASS） | 76f9abfe44e78e1f30078841ebb3fbd05a0f2b8b | S3-R2 复验 PASS 关闭（reply sha256=865db50acb5fc05def09b6d38a438247aa28cc1f25bec27a8ded6810b9ade5a0，dispatch-2026-11-15T12-36-04 新会话接棒，前会话 6af99227 CONTEXT_LIMIT_STOP 归档 L-018 迁移） |
| 问题8 | S3-R1 REJECT P1-02（同上） | B2 负例未完整断言被拦截 commit 身份与 R7 原因 | test_03/04/06/08/09 补 commits 断言+test_10a/b/c 补 R7 id 断言+b5c 升级内容 SHA256；R2 复验=仅剩 test_10a/b 缺 R7 原因断言→最小修复补两行 assertIn | 76f9abfe44e78e1f30078841ebb3fbd05a0f2b8b；R3 最小修复=c351d49ed6d29e354c0636237863c041987fad83 | S3-R3 复验 PASS 关闭（reply sha256=796160adec85d5ce440000b604ad8a90aecf991c0b4ab474b0397e9e90aa9aa1，dispatch-2026-11-15T12-43-11） |

## S2 阶段C0-F001立项准备

- ①本步骤目标：F-001 中央调度最小版立项任务书草案（I1-I7 完整性；防范围膨胀）。
- ②修改文件：docs/phase1/F001-SCHEDULER-BRIEF-DRAFT.md（新增）、本任务包。
- ③修改内容：任务书草案 v0.1——§1 需求原文拟定稿（待用户确认，I1 目标/非目标/防膨胀）+§2 背景（F-001 OPEN/DEC-026 决议二/D1′ 先例/既有资产四模块+test_worker）+§3 架构边界（职责=状态机驱动器复用执行腿；归属方案 A=M1 内模块推荐 vs B=独立模块，留评审拍板）+§4 最小闭环流程+§5 异常处理（L-018 沿用/停等人工）+§6 安全审计（无业务凭据/幂等/审计）+§7 验收回滚（零 mock/双分支/人工编排退路）+§8 授权红线（用户确认需求原文+拍板开工）+§9 不在范围清单。**本次待验收 commit=615d5787cecf39a32b43776cf92ef3633c406d19**（单 commit 申报，基线=51865860f0321317f94650a954a2a81b186be814，parent ✓，rev-list=1 ✓，numstat=64/0 恰 1 新文件；ST-01 机器预检见 acceptance/review-request-s2.md）。
S2 验收链：R1 REJECT 4 项→v0.2 整改→R2 限定复验（reply sha256=2de7fd0f91aa46dc…，recoll-2026-11-15T11-52-35-084Z，派单现场 dispatch-2026-11-15T11-50-01 fail-closed 禁重发）=问题4 关闭、问题3/5/6 未关闭→v0.3 整改（原记录：草案 v0.1 成文；S2 独立验收 R1=**REJECT 4 项**（问题3=F-001 状态依据漂移——T-P1-908 已落地 F-001 最小版而 FEASIBILITY/PHASE-STATUS 未同步，立项对象错误；问题4=I3/I4 审查腿一期边界不明+L-018 引用范围不准；问题5=I5 缺主体—操作—授权边界表；问题6=I6 验收矩阵不可执行）→ 对象重定位重写 v0.2+状态校正后限定复验（见返工表）。
- ⑤测试结果：文档步骤无代码测试；ST-05 自检通过；Gate 1 验收口径=会商1 草案级六项（I1-I7 完整性/防膨胀/授权链闭合/状态路径合法出边/矩阵场景齐备/已过项继承），深度项（白名单端点表/A5 账本字段/A6 完整恢复设计/回滚分支精化）转 Gate 2 会务立项评审。
- ⑥验收证据引用：S2-R1=dispatch-2026-11-15T11-36-33→补采 recoll-2026-11-15T11-41-36-943Z（reply sha256=6f53348aa924ceb8f5748479754c5a7f1bc63635c96b3e92fa420eff15164418，REJECT 4 项）；S2-R2=dispatch-2026-11-15T11-50-01→recoll-2026-11-15T11-52-35-084Z（sha256=2de7fd0f91aa46dcd50255538cb2e4a17531c7dfcf0a0d96b7ab2b2e69ef2a76，问题4 关闭）；S2-R3=dispatch-2026-11-15T11-57-53→recoll-2026-11-15T12-01-12-103Z（sha256=f74d3f5886af46dd74c0e9c6704d710a3a0704fcf5e8b1c11713a207494ebb14，问题3 关闭）；会商1=dispatch-2026-11-15T12-04-41→recoll-2026-11-15T12-07-26-386Z（sha256=606d7738b9bd47f0617298ce75c8647c322134daf3339983b4b8a4e7374af34d，方案甲+丙推荐）；用户拍板=2026-11-15 批准甲+丙+维持现状。**S2 验收结论：（Gate 1 降档验证轮待回填）**

## 止损触发登记（S2，2026-11-15，WORKFLOW 模块五/L-019）

- **触发：** 问题5（P1-03 授权边界）与问题6（P1-04 验收矩阵）各第 3 次 REJECT（R1 创建→R2 复验未关闭→R3 复验未关闭，R3=reply sha256=f74d3f5886af46dd…，recoll-2026-11-15T12-01-12-103Z，派单现场 dispatch-2026-11-15T11-57-53 fail-closed 禁重发补采）→ 停止常规整改循环。
- **止损执行序：** 停止→三方会商（本节登记后即派单，会商轮不占返工计数）→会商有结论后交用户拍板。
- **根因定性（执行者提案，待会商）：** 标准演进/沟通损耗类——S2 验收口径未定义"立项草案级 vs 定稿级"深度；908 先例中任务书精化由会务立项评审轮承载（v0.1 起草→会务评审→v0.3 定稿），验收方以定稿级可执行标准审草案。
- **会商方案选项：** 甲（推荐·降档验证）=S2 验收收敛至 I1-I7 完整性+防膨胀+授权链闭合+状态路径合法性（R3 已过项保留），残留深度项（白名单端点化/A5 发送账本证据/A6 两种 BLOCKED 语义/回滚 BLOCKED 分支）转入会务立项评审阶段；乙（定向收尾·降档验证轮）=会商批准一轮定向整改后 R4 限定复验。两案均提议：S2 挂起，先做 S3（C1 工具，无依赖）。

## 止损会商1结论与 S2 挂起登记（2026-11-15，会商轮不占返工计数）

- **会商1（reply sha256=606d7738b9bd47f0…，recoll-2026-11-15T12-07-26-386Z，派单现场 dispatch-2026-11-15T12-04-41 fail-closed 禁重发补采）：** 根因定性=主因"阶段深度错配（草案级 vs 定稿级验收口径未定义）"+次因"待决设计项未标记为待评审"；**方案甲推荐（S2 收敛至草案级）**+**方案丙推荐为落地形态（三关口：S2 草案级降档验证→会务立项评审→用户确认与开工拍板）**；方案乙不推荐；R1/R2/R3 历史 REJECT 保留不改写；**降档口径本身须用户批准后执行**。
- **A6 底线（会商明确不可降档放松）：** 草案必须区分两种 BLOCKED——engine/内部 BLOCKED（审查腿内部停止，M1 任务保持 CODE_REVIEW 由人工接管）vs M1 task.status=BLOCKED（真实任务状态，无推进审查结论的合法出边，不得假设人工可直接恢复 CODE_REVIEW）。
- **S2 挂起登记（挂起与并行条款，会商原则同意）：** 当前状态=阻塞（挂起待用户裁定）；挂起原因=问题5/6 第 3 次 REJECT 触发止损，等待降档方案拍板；禁止事项=不再进行问题5/6 常规整改、不得擅自宣布 S2 PASS；恢复条件=用户确认方案甲/丙及 S2 降档验收口径（或裁定乙/其他）；后续=S3 C1 独立推进。
- **待用户拍板两项（止损执行序"会商有结论后交用户"）：** ①会商决议选择=甲/丙（推荐）or 乙 or 其他；②S2-S3 顺序=挂起先推 S3（会商支持）or 暂不。

## S3 阶段B-C1绑定核验工具

- ①本步骤目标：申报绑定自动核验工具落 toolkit/（Python 标准库/只读 Git/fail-closed）+10 场景测试矩阵+四工程要求（B1-B5）。
- ②修改文件：toolkit/check-binding.py（新增）、toolkit/test-check-binding.py（新增）、toolkit/README.md（工具清单增条目）、acceptance/b3-practice/（B3 实战输出 3 件）、本任务包。
- ③修改内容：R1 区间数/R2 线性链逐条 parent/R3 merge 禁止+改报提示/R4 最终性（后代未声明 FAIL）/R5 回填声明识别/R6 对象存在/R7 空区间 BLOCKED 禁止 PASS；判定三态 PASS/FAIL/BLOCKED 退出码 0/1/2；只读承诺（GIT_OPTIONAL_LOCKS=0+仅四只读命令+git 异常 BLOCKED）；16 用例测试矩阵（十场景+B4 确定性+B5 只读快照/坏仓库/非法 SHA）；负例逐条断言命中规则与 commit（L-017）。**本次待验收 commit=093cd832eb1f9e0bd5f89ed8c5aa4f77fd8082d3**（单 commit 申报，基线=a665d2cf3ed7a01c683bb2ba68b102248d2957ad，自核验工具输出=机器证据见 acceptance/b3-practice/s3-self-binding.json PASS）。
- ④执行结果：工具+测试成文；开发期 3 轮自纠（GBK 解码致测试壳读线程崩溃→补 encoding；merge 测试构造含同文件冲突→side 分支改独立文件；仓库探针区分环境不可用 BLOCKED vs 对象不存在 FAIL）均属测试壳/工具自身缺陷即发现即改；B3 实战三条申报全 PASS。
- ⑤测试结果：18/18 通过退出 0（B1 矩阵全场景+B2 负例指名+commit 身份断言+B4 确定性+B5 只读内容哈希/坏仓库 BLOCKED/非法 SHA FAIL/故障注入 2 件→BLOCKED）；B3 实战=S1/S2 首轮/S2-R3 三条真实申报核验 PASS（acceptance/b3-practice/*.json），工具 numstat 与验收轮机器值逐字一致（S1: 11/1+62/0+13/3；S2: 64/0；S2-R3: 2/1+22/18）——若 S1 时已有本工具，问题1（P1-01 申报行数错误）会被机器拦截。工具不能判定的边界如实记录：①不核对申报文本原文与传入参数的一致性（调用方责任）②不验证回填 commit 内容是否与声明相符（只验声明存在与线性性）。
- ⑥验收证据引用：S3-R1=dispatch-2026-11-15T12-24-38（fail-closed 禁重发）→recoll_kickoff_s3.mjs 补采（recoll-2026-11-15T12-28-22-485Z，七查全过，reply 8313B sha256=59ae93368215b7f9…）=REJECT 2 项（问题7/问题8；待验收 093cd832eb1f9e0bd5f89ed8c5aa4f77fd8082d3）；S3-R2=dispatch-2026-11-15T12-36-04（新会话 6af99f6a 接棒，前会话 6af99227 上下文上限归档 L-018 迁移；reply 3960B sha256=865db50acb5fc05def09b6d38a438247aa28cc1f25bec27a8ded6810b9ade5a0，被测=76f9abfe44e78e1f30078841ebb3fbd05a0f2b8b）=问题7 PASS 关闭、问题8 仅剩 test_10a/b 原因断言→最小修复 c351d49ed6d29e354c0636237863c041987fad83（18/18 复跑 OK）。S3-R3 限定复验=dispatch-2026-11-15T12-43-11（reply 1325B sha256=796160adec85d5ce440000b604ad8a90aecf991c0b4ab474b0397e9e90aa9aa1，被测=c351d49ed6d29e354c0636237863c041987fad83）=问题2 PASS 关闭。**S3 验收结论：PASS**（问题7/问题8 关闭）。

## S4 交付与登记

- ①本步骤目标：delivery.md 七要素+decision-log 收尾登记+工作区复核（完工六查）。
- ②修改文件：（待填）
- ③修改内容：（待填）
- ④执行结果：（待填）
- ⑤测试结果：（待填）
- ⑥验收证据引用：S4=阶段性交付登记（S2 挂起致任务保持阻塞态，完工六查"所有步骤 PASS"未满足不宣告完工；delivery.md 七要素+DEC-054 登记；补采驱动 7 件归档本任务 acceptance/）

