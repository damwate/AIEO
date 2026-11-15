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
- ④执行结果：三文件成文；ST-05 自检拦截 steps.md 步骤小节格式缺口（## S<编号> 标题）后修正重跑。S1 独立验收 R1：**REJECT 2 项**（P1-01 申报行数误用 --stat 组合列拆分≠机器 numstat；P1-02 A2 缺 DEC-049~052 逐项核对）→ 修正后限定复验（见返工表）。
- ⑤测试结果：文档步骤无代码测试；ST-05 检查器自检通过（步骤小节修正后）；A1-A5 对照=R1 判定 A1/A3/A4/A5 PASS、A2 FAIL（P1-02）→ 补附录 B 后待复验。
- ⑥验收证据引用：S1-R1=dispatch-2026-11-15T11-22-14（fail-closed 禁重发）→recoll_kickoff_s1.mjs 补采（recoll-2026-11-15T11-25-35-834Z，七查全过，reply 5623B sha256=4c5e700a88d688ee…）=**REJECT（P1-01/P1-02，待验收 a5d0afdc8712cc38fa70663f239cb74d8d6fec0d）**；S1-R2 限定复验=dispatch-2026-11-15T11-29-16（reply 2139B sha256=677b1b96722a7cec701d776ea34b453e4ac8b13475b216e6c797da9595546865，被测=91b164672f0d8bb3d512b3e963e76910146cf829）=**PASS，P1-01/P1-02 关闭，S1 终态 PASS**。

## 返工表（S1-R1 首次 REJECT 建表）

| 问题编号 | 首次发现 | 问题 | 返工记录 |
|---|---|---|---|
| P1-01 | S1-R1（reply sha256=4c5e700a…88ee） | 绑定申报逐文件增删行数申报"+16 -4/+12 -1"与机器结果不符（GitHub compare/numstat=13/3、11/1）——根因=误读 `git diff --stat` 组合列（16=13+3 总变更数）自行拆分申报 | R1 修正：申报口径改 `git diff --numstat` 逐文件增删分离，机器输出原文入验收请求；R2 复验 PASS 关闭（91b1646） |
| P1-02 | S1-R1（同上） | A2 决议红线核对缺 DEC-049~052 完整逐项映射（DEC-050/051 无落位说明） | R1 修正：standard/WORKFLOW.md 增附录 B《决议核对表》DEC-010~052 逐项（要点/红线检查/落位），版本记录移附录 C；R2 复验 PASS 关闭（91b1646） |

## S2 阶段C0-F001立项准备

- ①本步骤目标：F-001 中央调度最小版立项任务书草案（I1-I7 完整性；防范围膨胀）。
- ②修改文件：（待填）
- ③修改内容：（待填）
- ④执行结果：（待填）
- ⑤测试结果：（待填）
- ⑥验收证据引用：（待填）

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
