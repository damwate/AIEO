# delivery：b-20261115-standard-kickoff（Standard 中级版开发启动）

## 原始需求
见 requirement.md（用户 2026-11-15 原话："用初级版继续开发中级版AIEO"；作业流程=Basic 工作流 v0.3）。

## 最终实现内容
1. **规划（DEC-053）**：standard/development-plan.md v0.2——两轨 T1 治理/T2 平台；阶段 A→C0→B→C1；硬约束 H1~H12；规划 R1/R2 复审闭环（R2 明示免再轮）。
2. **S1 治理基线（PASS）**：standard/WORKFLOW.md v0.1 草案（六模块继承+差异 D1-D12+并行治理入口+附录 B 决议核对表 DEC-010~052）；parallel-governance-draft.md 升 v0.1 规范候选（待用户批准，未经批准不生效）；PHASE-STATUS v0.9/v0.10 快照+漂移校正。验收链 R1 REJECT 2 项→R2 限定复验 PASS（reply sha256=677b1b96…865）。
3. **S2 F-001 立项准备（挂起待用户拍板）**：三轮验收揭示重大事实=F-001 最小版已随 T-P1-908 落地（DEC-036），FEASIBILITY/PHASE-STATUS 为漂移记录（已校正）；立项对象重定位=GPT-03 审查真实腿最小版（docs/phase1/GPT03-REVIEW-LEG-CHARTER-DRAFT.md v0.3，I1-I7+状态机合法出边+四主体授权表+验收矩阵 A1-A6）；问题5/6 三次 REJECT 触发止损→三方会商1（reply sha256=606d7738…47f0）→**挂起待用户拍板**（会商推荐=方案甲+丙三关口；待拍板两项见下）。
4. **S3 C1 绑定核验工具（PASS）**：toolkit/check-binding.py（R1-R7 七规则/三态判定/只读/fail-closed）+18 用例测试矩阵（十场景+确定性+只读内容哈希+故障注入 2 件）+B3 实战四件（S1/S2/S2-R3 三历史申报+自核验，numstat 与验收轮机器值逐字一致）；验收链 R1 REJECT 2 项（问题7 fail-open 真缺陷+问题8 断言缺口）→R2 问题1 关闭→R3 PASS（reply sha256=796160ad…9aa1）。
5. **治理与经验**：会话迁移 1 次（前会话 CONTEXT_LIMIT_STOP 归档→新会话接棒，L-018 迁移路径）；补采 7 次全成功零重发（DEC-043 家族处置序实战）；ST-01/ST-05 前移拦截实战（状态映射/返工表格式/步骤形态多次拦截）。

## 修改文件
standard/（WORKFLOW.md 新增、development-plan.md 新增、parallel-governance-draft.md 升版、README 未动）；docs/phase1/（GPT03-REVIEW-LEG-CHARTER-DRAFT.md 新增、误定 F001 草案已删）；docs/（PHASE-STATUS.md、FEASIBILITY-REGISTER.md 校正）；toolkit/（check-binding.py、test-check-binding.py、README.md）；basic/tasks/b-20261115-standard-kickoff/（任务包+验收证据+补采驱动归档 7 件）；docs/phase1/decision-log.md（DEC-053/054）。

## 测试结果
S3：18/18 通过退出 0（B1-B5 全项，负例指名+commit 身份断言）；S1/S2 为文档步骤=检查器自检+对照判定；本任务绑定申报自 S3 起由 C1 工具机器核验（dogfooding）。

## Git commit
规划 881b905→v0.2 e9d74ef→冻结 9654914→S1 a5d0afd/83bd41d→修正 91b1646→S1 闭环 5186586→S2 615d578/3d5ef22→0eceb00/56235f0→止损 c961e3f→会商 a665d2c→S3 093cd83→c351d49→本 commit。验收链：S1 R1/R2、S2 R1/R2/R3+会商1、S3 R1/R2/R3 全程 reply SHA256 见 steps.md 返工记录表与⑥证据行。

## 未解决问题
**S2 挂起待用户拍板**（止损四级阶梯交用户环节）：①会商决议选择=方案甲+丙三关口（会商推荐，S2 收敛至草案级+深度项转会务立项评审）vs 方案乙（定向整改后 R4）vs 其他；②S2-S3 顺序（S2 挂起先推 S3 已按会商执行；后续顺序待裁定）。S2 恢复条件=用户批准降档口径。问题5/6 返工计数冻结于 3 次挂起态，不擅自续改。

## 后续建议
①用户拍板上述两项后按方案甲/丙恢复 S2（草案级复验→会务立项评审→用户确认需求原文与开工拍板）；②standard/WORKFLOW.md 与 M2 规范候选待用户批准生效（H5/H6）；③BC-06 实战样本已取得（S3 代码类任务全流程）但按 Basic DoD 签核机制处理，不自动改状态；④S4 完工六查中"所有步骤均 PASS"未满足（S2 挂起），任务保持阻塞态——本 delivery 为阶段性交付登记而非完工宣告。
