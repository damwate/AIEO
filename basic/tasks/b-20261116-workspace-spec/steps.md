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
- ⑥验收证据引用：S1-R1 独立验收=审查会话 6afabbd3-ddec-83e8-afca-8a61cf91694c，现场 dispatch-2026-11-16T08-15-12，reply sha256=d8a1cbbfda9add20e5055a3214353c51c2a45d47801c3eca27ad4f1d6e80cf7a，**结论 REJECT**（问题1=Diff 回传口径缺完整 Diff/问题2=commit 前批准状态与实际提交矛盾/问题3=Skills/MCP 一律归主机级不准确）；首派尝试 goto 超时未发送（不产生投递，按 ST-08 不计验收轮次），重派成功采集；**S1-R2 限定复验**=现场 dispatch-2026-11-16T08-22-40（发送双验 polls=1，user_unit_key=fallback-turn-1:0:user；采集 fail-closed INBOUND_WINDOW_COMPLETENESS_UNPROVEN→按 L-018 禁重发、派生 recoll_workspace_spec_r2.mjs 归属校验型补采七查全过，产物 recoll/reply.txt 5092B，reply sha256=f90078de4b55755f4d37d93f9ea18ac13c56262d43c25b5171b8ee727bf38a74），结论 REJECT：问题1/问题3 关闭、回归 PASS，剩余问题2（待用户追认 72ee196c）+问题4（ST-05 实际输出未落库，见返工表）

## S2 登记与自检（DEC-069+ST-05）

- ①本步骤目标：decision-log 登记 R1 结论与整改（DEC-069）；ST-05 检查器复检并处理缺口
- ②修改文件：docs/phase1/decision-log.md、本任务包
- ③修改内容：DEC-068 状态行修正为真实时间线；追加 DEC-069（问题1/问题2/问题3 逐项整改登记+被测对象+过程）
- ④执行结果：DEC-069 成文；ST-05 复检执行（结果见⑤）
- ⑤测试结果（实际执行输出，P2-02/问题4 整改）：命令=`python -I basic/tool/check_taskpack.py basic/tasks/b-20261116-workspace-spec`；实际输出=Phase IN_PROGRESS＋①PASS ②PASS ③N/A（3 步未到期）④PASS ⑤PASS ⑥N/A（交付未到期）＋Overall IN_PROGRESS；FAIL 项数=0；退出码=1（开发期未完成验收的既定语义，非失败）；原始输出落库 `acceptance/st05-inprogress.txt`（同命令可复跑复现）
- ⑥验收证据引用：S1-R2 复验=dispatch-2026-11-16T08-22-40（发送双验+归属校验型补采，recoll/reply.txt 5092B，reply sha256=f90078de4b55755f4d37d93f9ea18ac13c56262d43c25b5171b8ee727bf38a74），结论 REJECT——问题1/问题3 关闭、回归 PASS；剩余问题2（待用户追认）与问题4（ST-05 实际输出落库，见返工表）。**S1-R3 收尾确认**=现场 dispatch-2026-11-16T08-40-08（发送通道异常：两次派单发送双验 UNCERTAIN→只读诊断确认草稿未发出→点击发送键兜底，单条送达 fallback-turn-2:0:user 无重复；回复经 recoll 归属校验型补采七查全过，reply 3606B，sha256=9c36760b4b200f80593a69b147974011da81a19456afc022bfac0c60c713d242），结论 REJECT 仅 P1-03（问题2 状态未同步）→本条与问题2 行已同步（DEC-072 登记过程）

## S3 独立验收与交付

- ①本步骤目标：S1-R2 复验 PASS 后登记交付与最终 commit
- ②修改文件：本任务包 delivery.md（交付时）
- ③修改内容：验收结论回填；delivery.md 七要素成文；task-brief 转完成态
- ④执行结果：待验收
- ⑤测试结果：未测（未到期）
- ⑥验收证据引用：待派单（验收后回填 dispatch 目录+reply SHA256）

## 返工记录表（首次 REJECT 时建表；按"同一问题"计数）

| 问题编号 | 轮次来源 | 问题描述 | 整改内容 | 修复 commit | 验证 |
|---|---|---|---|---|---|
| 问题1 | S1-R1 REJECT P1-01 | 第六节 diff 回传只写 numstat，缺完整 Diff 证据要求 | 第六节改三口径：被测对象=完整 SHA／完整 Diff 证据=可核验完整改动（diff 全文或 GitHub compare/GitPointer）／测试结果=断言+退出码；numstat 降为统计口径并明示"不替代完整 Diff" | 9efb14bbcc74d397e15558dc720706fc054ac627 | R2 复验 PASS 关闭（未降低 L-021/ST-01 要求） |
| 问题2 | S1-R1 REJECT P1-02 | commit 前批准状态与实际提交矛盾（requirement/task-brief/steps/DEC-068 四处不一致） | task-brief 增"Git 操作批准记录"表如实登记推定授权与时间线；steps③ 回填首轮被测 SHA；DEC-068 状态行修正；DEC-069 登记；用户追认事项明列（不伪造批准）；**收口（降档，L-019）**：按用户 2026-11-16 指示走审查方给定替代路径——如实登记不予追认、新增"commit 前须用户明文批准"硬约束（DEC-071） | 9efb14bbcc74d397e15558dc720706fc054ac627 | R2 确认四处状态已一致、无伪造（**R2 历史结论保留**）；**R3 最终处置：不予追认、按流程偏差如实登记（推定授权、无逐条明文批准，同根因计 1 次）、历史提交保留不重写、新增硬约束见 DEC-071——R3 复验已成立，本条关闭** |
| 问题3 | S1-R1 REJECT P2-01 | 第四节把 Skills/MCP 一律归主机级不准确 | 第四节改"项目配置与主机运行环境分离"：项目级可移植无秘密配置可入目标仓库版本控制；凭据/账号 profile/机器专属配置禁入库（C6）；作用域遵循所用 IDE 规则 | 9efb14bbcc74d397e15558dc720706fc054ac627 | R2 复验 PASS 关闭（未见对 C6 的削弱） |
| 问题4 | S1-R2 REJECT P2-02 | steps S2⑤ 写"以实际输出为准"属预期描述，ST-05 实际输出未落库 | S2⑤ 改为实际执行输出（命令/输出摘要/FAIL=0/退出码=1/证据路径）；原始输出落库 acceptance/st05-inprogress.txt；S1⑥ 回填 R2 结论 | 06d72bb83deea9ce3bccfa6bd71ec47ec670a364 | 已补齐：S2⑤ 实际输出+acceptance/st05-inprogress.txt+退出码；ST-05 复检④⑤PASS 无 FAIL；待收尾确认轮（S1-R3）复核 |
