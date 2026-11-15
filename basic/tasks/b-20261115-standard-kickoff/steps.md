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
| 问题1 | S1-R1 REJECT P1-01（reply sha256=4c5e700a…88ee） | 绑定申报逐文件增删行数"+16 -4/+12 -1"与机器结果不符（GitHub compare/numstat=13/3、11/1）——根因=误读 `git diff --stat` 组合列（16=13+3 总变更数）自行拆分申报 | 申报口径改 `git diff --numstat` 逐文件增删分离，机器输出原文入复验请求 review-request-s1-r2.md | 91b164672f0d8bb3d512b3e963e76910146cf829（申报口径修正随复验请求 2b56cec457a444f5847e28ce9066bd27be363370 落盘） | S1-R2 复验关闭确认（reply sha256=677b1b96…865，dispatch-2026-11-15T11-29-16） |
| 问题2 | S1-R1 REJECT P1-02（同上） | A2 决议红线核对缺 DEC-049~052 完整逐项映射（DEC-050/051 无落位说明） | standard/WORKFLOW.md 增附录 B《决议核对表》DEC-010~052 逐项（要点/红线检查/落位），版本记录移附录 C | 91b164672f0d8bb3d512b3e963e76910146cf829 | S1-R2 复验关闭确认（同上） |
| 问题3 | S2-R1 REJECT P1-01（reply sha256=6f53348a…eb8） | 立项对象前提错误：FEASIBILITY F-001"OPEN"与 PHASE-STATUS"下一项=F-001 立项"系 T-P1-908 闭合（DEC-036：scheduler.py 已合并 main+七轮验收+复核 ACCEPT）后未同步的漂移，v0.1 草案误对已落地能力立项 | FEASIBILITY F-001 状态校正 CLOSED（最小版落地+全链证据+漂移声明）+PHASE-STATUS §0 校正（真实下一项=GPT-02~05 逐角色）；立项对象重定位=GPT-03 审查真实腿最小版（GPT03-REVIEW-LEG-CHARTER-DRAFT.md v0.2），误定文件 F001-SCHEDULER-BRIEF-DRAFT.md 移除 | 0eceb006df5d0074cb29c6758141b761ed9f925a | （待复验） |
| 问题4 | S2-R1 REJECT P1-02（同上） | I3 审查腿一期边界不明（自动触发 vs 停等人工）；I4 禁重发/outbox 重试缺适用场景界定；L-018 被泛化为平台腿通用规则（实为网页派单采集异常经验） | v0.2 §4 明确一期边界（一次审查轮/REWORK 停等人工）；§5 按错误类别五分类处置表（网页发送失败/采集 fail-closed/契约校验失败/平台腿故障/状态非法）+重试规则列；L-018 引用限定范围 | 0eceb006df5d0074cb29c6758141b761ed9f925a | （待复验） |
| 问题5 | S2-R1 REJECT P1-03（同上） | I5 缺权限与授权模型（谁能启动/暂停/恢复/批准；engine 身份边界） | v0.2 §6 主体—操作—授权边界表（OWNER/调度引擎/执行腿/人工执行者四主体，引用 C7/C6 与 T-P1-908 既有边界） | 0eceb006df5d0074cb29c6758141b761ed9f925a | （待复验） |
| 问题6 | S2-R1 REJECT P1-04（同上） | I6 验收标准为概括清单，缺可执行场景/预期/失败判定/证据要求 | v0.2 §7 可执行验收矩阵 A1~A6（前置/动作/预期/失败判定/必留证据）+回滚条件+人工退路验证 | 0eceb006df5d0074cb29c6758141b761ed9f925a | （待复验） |

## S2 阶段C0-F001立项准备

- ①本步骤目标：F-001 中央调度最小版立项任务书草案（I1-I7 完整性；防范围膨胀）。
- ②修改文件：docs/phase1/F001-SCHEDULER-BRIEF-DRAFT.md（新增）、本任务包。
- ③修改内容：任务书草案 v0.1——§1 需求原文拟定稿（待用户确认，I1 目标/非目标/防膨胀）+§2 背景（F-001 OPEN/DEC-026 决议二/D1′ 先例/既有资产四模块+test_worker）+§3 架构边界（职责=状态机驱动器复用执行腿；归属方案 A=M1 内模块推荐 vs B=独立模块，留评审拍板）+§4 最小闭环流程+§5 异常处理（L-018 沿用/停等人工）+§6 安全审计（无业务凭据/幂等/审计）+§7 验收回滚（零 mock/双分支/人工编排退路）+§8 授权红线（用户确认需求原文+拍板开工）+§9 不在范围清单。**本次待验收 commit=615d5787cecf39a32b43776cf92ef3633c406d19**（单 commit 申报，基线=51865860f0321317f94650a954a2a81b186be814，parent ✓，rev-list=1 ✓，numstat=64/0 恰 1 新文件；ST-01 机器预检见 acceptance/review-request-s2.md）。
- ④执行结果：草案 v0.1 成文；S2 独立验收 R1=**REJECT 4 项**（问题3=F-001 状态依据漂移——T-P1-908 已落地 F-001 最小版而 FEASIBILITY/PHASE-STATUS 未同步，立项对象错误；问题4=I3/I4 审查腿一期边界不明+L-018 引用范围不准；问题5=I5 缺主体—操作—授权边界表；问题6=I6 验收矩阵不可执行）→ 对象重定位重写 v0.2+状态校正后限定复验（见返工表）。
- ⑤测试结果：文档步骤无代码测试；ST-05 自检通过；R1 判定=ST-01 全过+防膨胀 PASS+I1/I7 PASS+I2/I3/I4 PARTIAL+I5/I6 REJECT（问题4~6）→ v0.2 修正后待复验。
- ⑥验收证据引用：S2-R1=dispatch-2026-11-15T11-36-33（fail-closed 禁重发）→recoll_kickoff_s2.mjs 补采（recoll-2026-11-15T11-41-36-943Z，七查全过，reply 8037B sha256=6f53348aa924ceb8…）=REJECT 4 项（问题3/4/5/6；首轮待验收 615d5787cecf39a32b43776cf92ef3633c406d19）；S2-R2 限定复验待验收=0eceb006df5d0074cb29c6758141b761ed9f925a（基线 3d5ef22ceceb8a846da9d6d280cbae748ccd9a8b）。**S2 验收结论：（待复验回填）**

## S3 阶段B-C1绑定核验工具

- ①本步骤目标：申报绑定自动核验工具落 toolkit/（Python 标准库/只读 Git/fail-closed）+10 场景测试矩阵+四工程要求。
- ②修改文件：（待填）
- ③修改内容：（待填）
- ④执行结果：（待填）
- ⑤测试结果：（待填）
- ⑥验收证据引用：（待填）

## S4 交付与登记

- ①本步骤目标：delivery.md 七要素+decision-log 收尾登记+工作区复核（完工六查）。
- ②修改文件：（待填）
- ③修改内容：（待填）
- ④执行结果：（待填）
- ⑤测试结果：（待填）
- ⑥验收证据引用：（待填）

