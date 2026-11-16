# steps：b-20261116-workspace-spec（多项目、多 IDE 工作区管理规范成文）

- 拍板记录：用户 2026-11-16 任务指令（requirement.md 全文）即开工拍板，指令自带九项覆盖要求+六条边界约束；按 L-020 节点自主推进授权执行
- 冻结方案要点：
  - WORKFLOW.md 新增独立一节（放在"派单工具链"节之后、附录之前），标题带"增补④，2026-11-16，用户指令增补，非统计驱动"，不改动任何既有条款与附录修订表
  - 九项覆盖逐条落位：职责边界/落点指定/多 IDE 统一执行/项目级配置原则/任务包交付/结果回传/审查衔接/多项目拆分与防错仓/升级处理
  - 红线落实：不虚构未实现自动化（全节为人工执行规范）；不降低 GitPointer/全 SHA/fail-closed 要求；不改 C1-C8 冻结文本；不改既有 DEC 决策（并行治理沿 DEC-052 既有裁定引用，不另设规则）
  - 仅修改必需文件：basic/WORKFLOW.md、docs/phase1/decision-log.md、本任务包三件套

## S1 规范成文（WORKFLOW 增补④）

- ①本步骤目标：basic/WORKFLOW.md 新增《多项目、多 IDE 工作区管理规范》节，九项覆盖要求逐条落位；附录增补④注记登记变更依据
- ②修改文件：basic/WORKFLOW.md、docs/phase1/decision-log.md、本任务包三件套
- ③修改内容：新增一节"多项目、多 IDE 工作区管理规范（增补④，2026-11-16，用户指令增补，非统计驱动）"，含定位引言（边界红线声明）+九个小节；附录尾注追加增补④登记句；decision-log 追加 DEC-068。既有条款零删改，附录 12 行修订表不动。**S1-R1 被测 commit 完整 SHA=72ee196c1ede434b7ddfb72a2450834505e1d2c4**（parent=d563a2a5fa2e518a6da7f041d36218b89a2ad12a 基线，单 commit 已核）；R1 整改后被测对象=本整改轮 commit（完整 SHA 见 R2 申报记录，不属本行范围）
- ④执行结果：首轮成文完成（九项覆盖齐备）；S1-R1 验收结论 REJECT（问题1/2/3，见⑥）→按整改要求修订 WORKFLOW 第四、六节（P2-01 配置作用域分离、P1-01 完整 Diff 与 numstat 口径区分）+任务包与 DEC 状态如实化（P1-02）；未改动 v0.3 既有正文与 C1-C8/既有 DEC
- ⑤测试结果：ST-05 检查器自检——首轮 IN_PROGRESS（①②PASS，余开发期 N/A，无 FAIL）；整改后复跑结果见返工表"验证"列与 R2 申报记录；纯文档任务无代码单测项（如实标注不适用）
- ⑥验收证据引用：S1-R1 独立验收=审查会话 6afabbd3-ddec-83e8-afca-8a61cf91694c，现场 dispatch-2026-11-16T08-15-12，reply sha256=d8a1cbbfda9add20e5055a3214353c51c2a45d47801c3eca27ad4f1d6e80cf7a，**结论 REJECT**（问题1=Diff 回传口径缺完整 Diff/问题2=commit 前批准状态与实际提交矛盾/问题3=Skills/MCP 一律归主机级不准确）；首派尝试 goto 超时未发送（不产生投递，按 ST-08 不计验收轮次），重派成功采集；**S1-R2 限定复验**=现场 dispatch-2026-11-16T08-22-40（发送双验 polls=1，user_unit_key=fallback-turn-1:0:user；采集 fail-closed INBOUND_WINDOW_COMPLETENESS_UNPROVEN→按 L-018 禁重发、派生 recoll_workspace_spec_r2.mjs 归属校验型补采七查全过，产物 recoll/reply.txt 5092B，reply sha256=f90078de4b55755f4d37d93f9ea18ac13c56262d43c25b5171b8ee727bf38a74），结论 REJECT：问题1/问题3 关闭、回归 PASS，剩余问题2（待用户追认 72ee196c）+问题4（ST-05 实际输出未落库，见返工表）；其后收尾轮 R3-R6 逐项关闭（明细见 S2⑥ 与返工表）→**最终：验收结论：PASS**（内容于 R2 达标 + 收尾项于 R6 全部关闭；R6 现场 dispatch-2026-11-16T09-03-07，reply sha256=95a8287f173efd2ffd83a44d23654e11ee7a46ae011dc463ac77e3388cb69d67）

## S2 登记与自检（DEC-069+ST-05）

- ①本步骤目标：decision-log 登记 R1 结论与整改（DEC-069）；ST-05 检查器复检并处理缺口
- ②修改文件：docs/phase1/decision-log.md、本任务包
- ③修改内容：DEC-068 状态行修正为真实时间线；追加 DEC-069（问题1/问题2/问题3 逐项整改登记+被测对象+过程）；后续收尾轮追加 DEC-070（R2）/DEC-071（降档收口）/DEC-072（R3+发送异常）/DEC-073（R4+结构性修正）/DEC-074（R5 最小必改项）/DEC-076（R7 交付证据整改）/DEC-077（R8 索引修正）/DEC-078（R9 父 SHA 补全）/DEC-079（R10 四组整改+编号勘误；**DEC-075 不存在**，编号跳过未补），均不覆盖既有记录
- ④执行结果：DEC-069～074、DEC-076～079 均已成文（**无 DEC-075，编号跳过未补**）；ST-05 复检执行（结果见⑤）；S2 各项产出已被 R3-R6 逐项核验（DEC 与发送异常记录 PASS、ST-05 实际输出落库 PASS、任务书状态一致性 PASS）
- ⑤测试结果（实际执行输出，P2-02/问题4 整改）：命令=`python -I basic/tool/check_taskpack.py basic/tasks/b-20261116-workspace-spec`；实际输出=Phase IN_PROGRESS＋①PASS ②PASS ③N/A（3 步未到期）④PASS ⑤PASS ⑥N/A（交付未到期）＋Overall IN_PROGRESS；FAIL 项数=0；退出码=1（开发期未完成验收的既定语义，非失败）；原始输出落库 `acceptance/st05-inprogress.txt`（同命令可复跑复现）
- ⑥验收证据引用：S1-R2 复验=dispatch-2026-11-16T08-22-40（发送双验+归属校验型补采，recoll/reply.txt 5092B，reply sha256=f90078de4b55755f4d37d93f9ea18ac13c56262d43c25b5171b8ee727bf38a74），结论 REJECT——问题1/问题3 关闭、回归 PASS；剩余问题2（待用户追认）与问题4（ST-05 实际输出落库，见返工表）。**S1-R3 收尾确认**=现场 dispatch-2026-11-16T08-40-08（发送通道异常：两次派单发送双验 UNCERTAIN→只读诊断确认草稿未发出→点击发送键兜底，单条送达 fallback-turn-2:0:user 无重复；回复经 recoll 归属校验型补采七查全过，reply 3606B，sha256=9c36760b4b200f80593a69b147974011da81a19456afc022bfac0c60c713d242），结论 REJECT 仅 P1-03（问题2 状态未同步）→本条与问题2 行已同步（DEC-072 登记过程）。**S1-R4 限定复核**=现场 dispatch-2026-11-16T08-48-34（发送双验 polls=1，key=fallback-turn-3:0:user；采集 fail-closed→补采先遇虚拟化窗口不完整→按 L-021 第 3 条前置视口拉高 1920×20000 全量物化（2→8 units）后七查全过，reply 2520B，sha256=5f2da9d73f809d7b…全文见 recoll/reply.txt），结论 REJECT 仅 P2-03（task-brief 轮次状态滞后）→按结构性修正消除该类不一致（问题5，见返工表；DEC-073）。**S1-R5 收尾确认**=现场 dispatch-2026-11-16T08-56-47（派单 UNCERTAIN→按 DEC-072 判定为未送达→点击发送兜底→延迟送达单条，turn-4 user+assistant；含视口前置升级补采七查全过，reply 2203B，sha256=b8e092dfd0e3d468…），结论 REJECT 仅 P2-03 最小必改项（任务书当前步骤仍含"最近=R4…"动态尾巴）→已改为完全固定表述（DEC-074）。**S1-R6 限定复核=最终验收结论：PASS**（P2-03 关闭、明确无需 R7；内容于 R2 达标 + R3-R6 收尾项逐项关闭），依据 dispatch-2026-11-16T09-03-07，reply sha256=95a8287f173efd2ffd83a44d23654e11ee7a46ae011dc463ac77e3388cb69d67

## S3 独立验收与交付

- ①本步骤目标：S1/S2 通过后完成交付记录（delivery.md 七要素）、任务书状态推进与交付登记 commit，并接受 S3 独立验收
- ②修改文件：本任务包 delivery.md、steps.md、task-brief.md、acceptance/（ST-05 输出与 S3 验收请求）
- ③修改内容：delivery.md 七要素成文，ST-05 结果按**实际输出**录入（①②④⑤ PASS、③⑥ N/A、Overall IN_PROGRESS）；交付登记 commit 与远程 main 事实边界写明（远程 main 仍指基线，本地领先属执行侧现场记录）；task-brief 状态=验收中、当前步骤=S3 交付；S3 验收请求 acceptance/review-request-s3.txt
- ④执行结果：交付登记 commit=`cc29fc51b23426b8f581416a82eed521117f74fd`（父=d190ed0e…）；S3-R7 独立验收=**REJECT**（问题6：ST-05 表述失实"③PASS"、交付登记 SHA 缺失、S3 六要素未闭环）→已按最小整改要求修正；待 S3-R8 复核
- ⑤测试结果：ST-05 实测（S3 验收前）=①②④⑤ PASS、③⑥ N/A、Overall IN_PROGRESS、FAIL=0（原始输出 acceptance/st05-s3gate.txt）；**S3 复核通过、阶段转完成后须重跑 ST-05 并另存 COMPLETED 态输出**（①~⑥ 全 PASS 方视为交付门通过），不以 IN_PROGRESS 输出冒充交付通过
- ⑥验收证据引用：S3-R7 现场 dispatch-2026-11-16T09-07-41（发送+归属校验型补采，含视口前置升级 1920×20000），reply sha256=330c9861f958d5e8ca376c2ff5f843439a205879699d20378fe34bf9b217aad9，结论 REJECT（登记为问题6，见返工表）；**S3-R8 交付复核**=现场 dispatch-2026-11-16T09-13-55（补采含视口前置升级），reply 2681B，sha256=04c7115ddc53b6a9189a39c442db736f8af6a320efd055249d9880f55298bfe3，结论 REJECT 仅问题7（delivery 内部索引滞后：DEC~075/问题1~5/§5 未列 R7 整改 SHA）→已四处修正（DEC-077）；**S3-R9 交付复核**=现场 dispatch-2026-11-16T09-18-49（指定核验对象=787c2b5…，明确 58e7943 仅为简报归档提交不替代核验对象），结论 REJECT 仅一处：§5 R7 整改 commit 的父提交仍为缩写 →已改为完整 SHA（问题8；DEC-078）；**S3-R10 交付复核**=现场 dispatch-2026-11-16T09-22-48/recoll（核验对象 ab6ad23806d9be05be29b11d2150ea702bbf6ed5；带视口升级补采，reply 5418B，sha256=39b37f6723059945500b75b32e2abd548b32b7767a366b2b4796bcd8468f4c99），结论 REJECT 四组交付索引/证据链问题（登记为问题9：DEC 范围不可连续表述/§4 缺 S3 轮次/§5 缩写 SHA 与缺 R8R9 提交/§7 阶段归属）→已按"一次整体同步"重写 delivery（DEC-079）；**S3-R11 限定复核**（旧会话触 CONTEXT_LIMIT_STOP 未投递→按 L-018 第6条迁移新会话 6aface14-4f10-83e8-a5d0-e8a5de64c1e2，简报 1094B 自包含首派即通；现场 dispatch-2026-11-16T09-32-48，当轮 reply_sha256 缺失如实标注）=REJECT 两项：①§5 提交链缺 R10 整改 commit（问题9 修复 commit 未收录，证据链未闭合）②S2④ "DEC-069~075" 与 S2③ 矛盾 →两项已整改（问题10；DEC-080）；验收结论：待 S3-R12 限定复核回填 PASS

## 返工记录表（首次 REJECT 时建表；按"同一问题"计数）

| 问题编号 | 轮次来源 | 问题描述 | 整改内容 | 修复 commit | 验证 |
|---|---|---|---|---|---|
| 问题1 | S1-R1 REJECT P1-01 | 第六节 diff 回传只写 numstat，缺完整 Diff 证据要求 | 第六节改三口径：被测对象=完整 SHA／完整 Diff 证据=可核验完整改动（diff 全文或 GitHub compare/GitPointer）／测试结果=断言+退出码；numstat 降为统计口径并明示"不替代完整 Diff" | 9efb14bbcc74d397e15558dc720706fc054ac627 | R2 复验 PASS 关闭（未降低 L-021/ST-01 要求） |
| 问题2 | S1-R1 REJECT P1-02 | commit 前批准状态与实际提交矛盾（requirement/task-brief/steps/DEC-068 四处不一致） | task-brief 增"Git 操作批准记录"表如实登记推定授权与时间线；steps③ 回填首轮被测 SHA；DEC-068 状态行修正；DEC-069 登记；用户追认事项明列（不伪造批准）；**收口（降档，L-019）**：按用户 2026-11-16 指示走审查方给定替代路径——如实登记不予追认、新增"commit 前须用户明文批准"硬约束（DEC-071） | 9efb14bbcc74d397e15558dc720706fc054ac627 | R2 确认四处状态已一致、无伪造（**R2 历史结论保留**）；**R3 最终处置：不予追认、按流程偏差如实登记（推定授权、无逐条明文批准，同根因计 1 次）、历史提交保留不重写、新增硬约束见 DEC-071——R3 复验已成立，本条关闭** |
| 问题3 | S1-R1 REJECT P2-01 | 第四节把 Skills/MCP 一律归主机级不准确 | 第四节改"项目配置与主机运行环境分离"：项目级可移植无秘密配置可入目标仓库版本控制；凭据/账号 profile/机器专属配置禁入库（C6）；作用域遵循所用 IDE 规则 | 9efb14bbcc74d397e15558dc720706fc054ac627 | R2 复验 PASS 关闭（未见对 C6 的削弱） |
| 问题4 | S1-R2 REJECT P2-02 | steps S2⑤ 写"以实际输出为准"属预期描述，ST-05 实际输出未落库 | S2⑤ 改为实际执行输出（命令/输出摘要/FAIL=0/退出码=1/证据路径）；原始输出落库 acceptance/st05-inprogress.txt；S1⑥ 回填 R2 结论 | 06d72bb83deea9ce3bccfa6bd71ec47ec670a364 | 已补齐：S2⑤ 实际输出+acceptance/st05-inprogress.txt+退出码；ST-05 复检④⑤PASS 无 FAIL；R3 复核成立、R4 复核 PASS |
| 问题5 | S1-R4 REJECT P2-03 | task-brief 当前步骤仍写"待 R4 限定复核"，与实际已进入 R4 轮次不同步（记录滞后类） | task-brief 当前步骤改为与轮次解耦表述（轮次与结论一律以 steps.md 返工记录表为准）；DEC-073 登记并声明止损（同类再现即交用户） | e32bda9145cc172b87151a44fb6ae5b30bd14da2 | R5 复核：结构性方向成立、任务书尾部仍带轮次耦合→最小必改项已落实（当前步骤改为完全固定表述，不含轮次/结论/DEC 编号）；**R6 复核 PASS 关闭（任务书表述与返工记录、DEC-074 三者一致，范围约束未被突破）** |
| 问题6 | S3-R7 REJECT | 交付证据未闭环：delivery 把 ST-05 的 ③⑥ N/A/IN_PROGRESS 表述为"③PASS"（失实）；交付登记 commit 未写完整 SHA；steps S3 ④⑤⑥ 仍为占位 | delivery §4 按实测输出改写并声明 COMPLETED 态须重跑另存；§5 写全交付登记 SHA 并区分被测/交付/远程 main 边界；S3 六要素补齐（含"不以 IN_PROGRESS 冒充交付通过"约束）；DEC-076 登记教训 | bb8e6958895ed4f54a75e30ebc39d4d4182e69b8 | R8 复核三项整改 PASS；随附发现文档索引滞后→见问题7 |
| 问题7 | S3-R8 REJECT | delivery.md 内部版本索引滞后于自身内容（DEC~075 实为~076、问题1~5 实为~6、§5 未列 R7 整改 commit SHA） | 四处索引同步（DEC-068~077、问题1~7、R1~R8、§5 增列 bb8e695 完整 SHA 与归属）；DEC-077 登记教训（同类第 2 次，再发即止损交用户） | c032185740dcfcac3c11b158b14f7ed4d8d7824b | R9 复核：DEC 索引/问题行数/轮次范围/问题7 SHA/修改范围 PASS；父提交缩写另计问题8 |
| 问题8 | S3-R9 REJECT | delivery §5 中 R7 整改 commit 的父提交写成缩写 `cc29fc51…`（违反完整 SHA 证据要求） | 改为完整 SHA `cc29fc51b23426b8f581416a82eed521117f74fd`；同 commit 同步交付索引（DEC~078/问题1~8/R1~R9）避免再生不一致；DEC-078 登记教训并声明同族第 3 次达 L-019 阈值 | c8ddb06b851f91c8e11e2b641249fd82d2ba3926 | R10 复核：§5 父提交完整/问题1~8/问题8 SHA/R2 被测 PASS；余四组索引问题另计问题9 |
| 问题9 | S3-R10 REJECT | 交付索引/证据链四组问题：DEC 范围不可连续表述（实为 068~074、076~078，无 075）／§4 缺 S3-R7~R9 轮次／§5 有缩写 SHA 且缺 R8、R9 与归档提交登记／§7 未澄清 R1~R6 与 R7~R9 阶段归属 | delivery 整体重写：非连续 DEC 范围+DEC-079 勘误；§4 拆 S1/S3 两条验收链（逐轮现场+reply sha，R9 缺 sha 如实标注）；§5 全链完整 SHA+父提交双列表（基线→ab6ad23）并写明问题7/8/9 对应 commit；§7 阶段归属与计数口径澄清 | c8eb7087d47bd06524161edbee911ed060c9c61f | 待 S3-R11 复核 |
