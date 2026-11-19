# 步骤清单（b-20261119-p1-906-06-concurrency）

**方案状态：** v0.6（R1 ADJUST→R2/R3/R4/R5 REJECT 逐轮整改；R5 条件谓词/扩展字段 PASS、RECOVER 复制规则整改落位；⑥仍BLOCKED，待R6复审）。

## S1 登记

①本步骤目标：登记 P1 阻塞②（906⑥ 独立验证场景设计）任务包 + ST-05 自检。

②修改文件：basic/tasks/b-20261119-p1-906-06-concurrency/{requirement.md,task-brief.md,steps.md}。

③修改内容：登记来源（P1 execution R1 reply 9a79f7cf）、⑥ 定义与历史（batch1 REWORK/batch2 未执行/v1.0 归 P1）、七维度八判据、边界。

④执行结果：任务包建妥；基线提交前登记；ST-05 待回填。

⑤测试结果：check_taskpack.py 待提交后回填。

⑥验收证据引用：本任务包 S1 提交（commit e16722f72cd458813ff54dad66062e59b1b419c5）；P1 执行任务 R1 派单现场 dispatch-2026-11-19T06-39-20，reply SHA256=`9a79f7cfc04e481ac0a0f25b3cc33aca0aa04249f2bdb588fccc1e63eaf9ed64`。

**验收结论：PASS**（登记完成；独立验收见 S2 规划协商链）

## S2 规划协商

①本步骤目标：审查会话迁移（旧 6afe9bd3 归档只读）+ 906⑥ 独立场景设计 R1 裁定（七维度/八判据/环境/即停/证据）。

②修改文件：phase0/logs/gpt-reviewer-session.json + 备份 pre-906s1.json；phase0/tools/brief_906s1_plan_r1.txt；派单现场 dispatch-2026-11-19T06-54-56；本 steps.md。

③修改内容：R1 简报（1198B，标记 `[906S1-PLAN-R1|20261119]`）；R1=**ADJUST（PASS_WITH_CONSTRAINTS）**，reply `2d84f6bd…` 11158B，无 fail-closed。裁定：①七维度/八判据方向正确但需操作化补齐（并发登记两独立task/request/幂等键、REST三方关联、DB逐任务核对、ACK带状态版本、幂等、故障三类、证据关联）；②本机真实 M1 REST+DB 环境=BLOCKED（三件套无环境证据，须实测前独立只读环境资格检查，不合格维持 BLOCKED，不以 Mock/内存DB/顺序测试替代）；③五类即停+实测另批边界 PASS_WITH_CONSTRAINTS；④证据清单/判据/时间线须补具体字段+MANIFEST。审查方给出完整可执行场景：场景A双任务真实并发（同步屏障+服务端单调时钟证明处理区间重叠）、场景B四类故障F1-F4、场景C完整性复核、五类即停、证据目录、T0-T9时间线、验收总门槛（全过才⑥PASS）。**⑥仍 BLOCKED、M1写路径不解除**。

④执行结果：R1 ADJUST 裁定落定；要求修订场景设计 v0.2 后交 R2 复审；新会话 6afe9d76-5af0-83ec-bb84-77e7c54f409e（归属校验 PASS）。

⑤测试结果：reply.txt SHA256=`2d84f6bd658acd00d3cd2ada56e29c2e3b91458983cf21d0573b4991fb90d4d0`（11158B）与 result.json.artifact_sha256 逐字一致；三件套 Git Blob SHA（requirement 4a8424ef/steps 7fc58a29/task-brief 207a7420）审查方逐项列明；发送双验 polls=2；R1=ADJUST。

⑥验收证据引用：dispatch-2026-11-19T06-54-56（request/reply/raw-units/result/截图/run.log/tab-audit），reply SHA256=`2d84f6bd658acd00d3cd2ada56e29c2e3b91458983cf21d0573b4991fb90d4d0`；指针备份 phase0/logs/gpt-reviewer-session.pre-906s1.json。

**验收结论：PASS**（R1 规划协商完成，ADJUST 裁定；独立验收见 S4）

## S3 场景设计冻结

①本步骤目标：按 R1 ADJUST 把 906⑥ 可执行场景设计落为 v0.2（场景A/B/C+七维度+八判据+环境前置+五类即停+证据+时间线+验收标准），交 R2 复审。

②修改文件：basic/tasks/b-20261119-p1-906-06-concurrency/scenario-design.md（新建 v0.2）；task-brief.md（v0.1→v0.2）；本 steps.md。

③修改内容：scenario-design.md 逐条落 R1 场景建议（详见该文件九节）；关键保留=同步屏障+服务端处理时间重叠证明（否则判顺序执行）、F2 区分DB已提交与客户端未收响应、环境资格检查 BLOCKED 维持、五类即停先保全现场、MANIFEST 全证据、T0-T9 时间线、全过才⑥PASS；边界=本轮只设计不实测、⑥未PASS前M1写路径不解除、实测另批授权不继承。

④执行结果：v0.2 场景设计落盘；⑥ 仍 BLOCKED（环境未证实）；待 R2 复审。

⑤测试结果：scenario-design.md 九节对照 R1 逐项核对=场景A/B/C齐、七维度表齐、八判据齐、环境前置齐、五类即停齐、证据目录齐、T0-T9齐、验收总门槛齐；零代码/不实测/不合并/不部署/不删数据。

⑥验收证据引用：dispatch-2026-11-19T06-54-56，reply SHA256=`2d84f6bd658acd00d3cd2ada56e29c2e3b91458983cf21d0573b4991fb90d4d0`（设计依据）；scenario-design.md v0.2；S3 独立验收见 S4。

**验收结论：PASS**（v0.2 场景设计按 R1 落盘；独立验收见 S4）

## S4 独立验收

①本步骤目标：R2 独立复审 v0.2（R1 ADJUST 后）三项技术 REJECT→v0.3；R3 两项技术+文档状态 REJECT→v0.4；R4 核2 REJECT→v0.5；R5 RECOVER 复制规则 REJECT→v0.6→R6。

②修改文件：scenario-design.md（v0.2→v0.3→v0.4→v0.5→v0.6）；task-brief.md（状态同步为返工）；steps.md（S4 记录+返工表）；派单现场 dispatch-2026-11-19T06-59-27（R2）/07-07-30（R3）/07-15-25（R4）/07-23-45（R5，均 fail-closed）；诊断 diag_906s1_plan_r3/r4/r5.mjs；补采驱动 recoll_906s1_plan_r2/r3/r4/r5.mjs。

③修改内容：S4-R2=**REJECT**，reply 补采 `cf078bc249319e66d79e1414756c12e8074290c001110a6e2ace137f83518ecb`（6358B）。场景 A/B/C、八判据、环境资格(BLOCKED)、五类即停、实测另批边界、T0-T9 均 PASS；三项技术 REJECT=问题1（跨实例单调时钟可比性：未定义两实例是否同一时钟域，各自 CLOCK_MONOTONIC 数值不可直接比较，需重叠公式 max(A_start,B_start)<min(A_end,B_end)）；问题2（事件关联字段不完整：MANIFEST 原始事件缺 event_id/request_id/instance_id/idempotency_key/trace_id/event_type/monotonic_timestamp/clock_domain/db_transaction_id/ack_id/state_version 规范及适用规则）；问题3（DB/ACK 失败判定不精确：F1 半完成事务定义、F3 DB已提交ACK失败中间状态、重试ACK同一逻辑身份未明确）；附文档状态未同步。整改=scenario-design.md v0.3 落三补段（一·补时钟域+重叠公式、二·补事件字段规范、六·补DB/ACK状态转换系列），场景结构不变；⑥仍BLOCKED/M1写路径不解除。派单发送双验通过后采集 fail-closed `INBOUND_WINDOW_COMPLETENESS_UNPROVEN`→按 L-018 禁重发+静态DOM补采（recoll 四参数全换 grep 核对、归属三件套全过）。S4-R3=**REJECT**（reply 补采 `947f41ee8154e8e378661c011a6dfcfbe370241dbdda2adbf0ad887cfb88cc51`，5618B，被测 commit `f4d0e1ed64b77334f3bb831c74cedf4f0493ded5`）：R2-03 DB/ACK 判定 PASS 不重复改写；剩余 REJECT=问题4（跨主机误差公式无效：四个时间值同减 ε 属纯平移，须改为 max(A_start+ε,B_start+ε)<min(A_end−ε,B_end−ε)，ε 须定义为单端点上界或换算，集中采集须冻结观测点+δ）；问题5（event_type 字段矩阵未闭合：每类事件缺必填/条件必填/可选规则，基线须含 event_id/event_type/monotonic_timestamp/clock_domain）；问题6（文档状态语义冲突：当前状态滞留待规划、S4 结论把 R2 REJECT 记为 PASS）。v0.4 定向整改三项，场景结构不变；⑥仍BLOCKED/M1写路径不解除。R3 派单发送双验通过后采集 fail-closed→diag_906s1_plan_r3.mjs 三步诊断 virtualization_inferred=true→静态DOM补采（四参数 grep 核对+七查全过，禁重发）。S4-R4=**REJECT**（reply 补采 `6e10731e8de118dc8ccfb5456e758124d22a04a7cfaf3b660dfb379c8a728784`，4656B，被测 commit `f4d6daa04382e95ca2b678085de6430242d726e5`）：核1 跨主机时钟 PASS（保守边界+ε单端点定义+δ）、核3 文档状态 PASS（返工/S4 REWORK/历史保留）、R2-03 不回退；仅核2 事件字段矩阵 REJECT=问题7（①"可关联时/可定位时"条件未冻结为可判定规则；②"每条事件关联 task/request/instance"与 FAULT_INJECT/RECOVER 条件缺省矛盾；③http_status/commit_result/confirm_result/recover_result 扩展字段未纳入词汇表）。v0.5 仅整改问题7，把条件改为枚举/谓词、GLOBAL 作用域用显式 N/A+n/a_reason+trace 根标识、扩展字段单列；场景结构不变；⑥仍BLOCKED/M1写路径不解除。R4 派单发送双验通过后采集 fail-closed→diag_906s1_plan_r4.mjs 三步诊断（virtualization_inferred=false，marker_hits=1）→静态DOM补采（四参数 grep 核对+七查全过，禁重发）；会话第4条 user 按 L-018 评估暂不迁移（终局定向复审+简报自包含），第6条重评。S4-R5=**REJECT**（reply 补采 `c0ce863fc3694d63643ef4a2f647311d39122c50a7117f21159912281284401c`，3910B，被测 commit `d22a444f300165b6907a207b73c7e343849fa467`）：条件必填谓词 PASS、扩展字段词汇表 PASS、R4 核1/核3 沿用 PASS；唯一 REJECT=问题8（GLOBAL 关联项下 RECOVER 对目标事件字段缺失未定义处理：目标字段不存在≠N/A，REST_REQ 无 db_transaction_id/ack_id、DB_TXN_BEGIN 无 ack_id 时无法判定省略/N-A/证据无效；且目标不存在/重复/类型不允许无处置）。v0.6 补三情形复制契约（存在→原值；显式 N/A→复制并继承 n/a_reason；字段不存在→N/A+固定 reason `TARGET_EVENT_FIELD_NOT_APPLICABLE`）+非法目标判证据失效触发即停⑤；其余不回退；⑥仍BLOCKED/M1写路径不解除。R5 派单发送双验通过后采集 fail-closed→diag_906s1_plan_r5.mjs 三步诊断 virtualization_inferred=true→静态DOM补采（四参数 grep 核对+七查全过，禁重发）；会话第6条 user 重评：仅剩单点整改、终局定向复审、简报自包含，暂不迁移，第8条重评。

④执行结果：v0.3→R3 REJECT→v0.4→R4 REJECT→v0.5→R5 REJECT（仅 RECOVER 复制规则）→v0.6 问题8整改落盘；待 R6 复审。被测 commit `e16722f`（R1）/`a598dcd`（R2）/`f4d0e1ed64b77334f3bb831c74cedf4f0493ded5`（R3）/`f4d6daa04382e95ca2b678085de6430242d726e5`（R4）/`d22a444f300165b6907a207b73c7e343849fa467`（R5）；R2 整改 `5114356a9c982d45104f57903747e7c3203acd36`，R3 整改 `24ce25f5f3487e6ee03b3d684fcdaad3562ff7b7`，R4 整改 `a0f994e5b8610c47a41feb213837fbb4bec30a45`（问题7）；R5 整改 `d4ce634851e741be274a278b877c3d2b59358c58`（问题8）；v0.6 待 R6 复审。

⑤测试结果：S4-R2 reply 补采 6358B SHA=`cf078bc249319e66d79e1414756c12e8074290c001110a6e2ace137f83518ecb`；S4-R3 reply 补采 5618B SHA=`947f41ee8154e8e378661c011a6dfcfbe370241dbdda2adbf0ad887cfb88cc51`；S4-R4 reply 补采 4656B SHA=`6e10731e8de118dc8ccfb5456e758124d22a04a7cfaf3b660dfb379c8a728784`；S4-R5 reply 补采 3910B SHA=`c0ce863fc3694d63643ef4a2f647311d39122c50a7117f21159912281284401c`；四次 recoll checks 均全 true（标记唯一+最后user+尾部assistant+静态稳定+停止按钮不可见+非前轮SHA+长度合理）；R2/R3/R4/R5 REJECT 逐项核对整改段存在；ST-05 当前状态改返工后零 FAIL。

⑥验收证据引用：dispatch-2026-11-19T06-59-27（S4-R2 派单现场），补采 phase0/tools/phase0/logs/recoll-906s1-plan-r2-2026-11-19T07-02-10-460Z，reply SHA256=`cf078bc249319e66d79e1414756c12e8074290c001110a6e2ace137f83518ecb`；dispatch-2026-11-19T07-07-30（S4-R3 派单现场），诊断 phase0/logs/diag-906s1-plan-r3-2026-11-19T07-11-02-816Z/report.json，补采 phase0/logs/recoll-906s1-plan-r3-2026-11-19T07-11-43-950Z，reply SHA256=`947f41ee8154e8e378661c011a6dfcfbe370241dbdda2adbf0ad887cfb88cc51`；dispatch-2026-11-19T07-15-25（S4-R4 派单现场），诊断 phase0/logs/diag-906s1-plan-r4-2026-11-19T07-21-31-239Z/report.json，补采 phase0/logs/recoll-906s1-plan-r4-2026-11-19T07-22-00-843Z，reply SHA256=`6e10731e8de118dc8ccfb5456e758124d22a04a7cfaf3b660dfb379c8a728784`（首轮诊断/补采的 FAILED_DIR 元数据误记为 07-15-26，已按实际目录 07-15-25 重跑只读诊断与补采；reply 字节数/SHA 不变，旧目录保留不删）；dispatch-2026-11-19T07-23-45（S4-R5 派单现场），诊断 phase0/logs/diag-906s1-plan-r5-2026-11-19T07-26-35-912Z/report.json，补采 phase0/logs/recoll-906s1-plan-r5-2026-11-19T07-27-01-724Z，reply SHA256=`c0ce863fc3694d63643ef4a2f647311d39122c50a7117f21159912281284401c`；问题1/4 修复见「一·补」，问题2/5/7/8 见「二·补」，问题3 见「六·补」，问题6 见 task-brief.md 状态表与本 S4 结论。

**验收结论：REWORK**（R2 三项→v0.3；R3 三项→v0.4；R4 一项→v0.5；R5 一项→v0.6；独立验收待 R6，S5 未到期）

### 返工记录表（问题1-3=R2 REJECT；问题4-6=R3 REJECT；问题7=R4 REJECT；问题8=R5 REJECT）
| 问题编号 | 根因 | 整改内容 | 修复 commit |
|---|---|---|---|
| 问题1 | v0.2 未定义两实例单调时钟是否同一域，数值不可直接比较 | scenario-design.md「一·补」明确二选一时钟域方案+重叠公式 max(A_start,B_start)<min(A_end,B_end)，跨主机须扣误差 ε | 5114356a9c982d45104f57903747e7c3203acd36 |
| 问题2 | MANIFEST 原始事件缺完整关联字段规范 | 「二·补」定义 12 字段+各 event_type 必填规则 | 5114356a9c982d45104f57903747e7c3203acd36 |
| 问题3 | F1/F3 半完成事务与 ACK 中间状态判定不精确 | 「六·补」定义状态转换序列+F3=DB_COMMITTED_UNACKED+重试复用同一 ack_id | 5114356a9c982d45104f57903747e7c3203acd36 |
| 问题4 | v0.3 跨主机公式四值同减 ε 属纯平移，未真正扣误差 | 「一·补」改为 max(A_start+ε,B_start+ε)<min(A_end−ε,B_end−ε)，定义单端点 ε 与集中采集观测点+δ | 24ce25f5f3487e6ee03b3d684fcdaad3562ff7b7 |
| 问题5 | v0.3 事件字段缺逐 event_type 必填/条件必填/可选矩阵 | 「二·补」冻结 8 类 event_type 矩阵，基线必填 event_id/event_type/monotonic_timestamp/clock_domain | 24ce25f5f3487e6ee03b3d684fcdaad3562ff7b7 |
| 问题6 | 任务书当前状态滞留待规划、S4 结论把 R2 REJECT 记为 PASS | task-brief.md 当前状态=返工/当前步骤=S4；S4 结论=REWORK，保留 R2/R3 历史裁定不覆盖 | 24ce25f5f3487e6ee03b3d684fcdaad3562ff7b7 |
| 问题7 | R4 核2：条件必填谓词不可机械判定、全局关联规则与 FAULT_INJECT/RECOVER 缺省矛盾、扩展字段未入词汇表 | 「二·补」改为枚举/谓词（fault_scope/injection_point/recover_target_event_id）、GLOBAL 用显式 N/A+n/a_reason+trace 根、扩展字段单列表 | a0f994e5b8610c47a41feb213837fbb4bec30a45 |
| 问题8 | R5：RECOVER 目标字段"不存在"与"N/A"未区分，非法目标无处置 | 「二·补」新增 RECOVER 字段复制契约三情形（存在→原值/N-A→继承 reason/不存在→N/A+TARGET_EVENT_FIELD_NOT_APPLICABLE）+目标不存在/重复/类型不允许判证据失效触发即停⑤ | d4ce634851e741be274a278b877c3d2b59358c58 |

### S4-止损会商（L-019；非 R 轮，不占返工计数）
①目标：R2–R6 连续五次 REJECT 且每次暴露同一事件契约域新缺口，触发 WORKFLOW 模块五三轮止损；停止叙述式逐轮补洞，三方会商定性根因并裁定降档路径。
②落点：`phase0/tools/brief_906s1_stop_20261119.txt`；派单现场 `dispatch-2026-11-19T07-34-22`；诊断 `phase0/logs/diag-906s1-stop-2026-11-19T07-37-06-239Z/report.json`（virtualization_inferred=true）；补采 `phase0/logs/recoll-906s1-stop-2026-11-19T07-37-27-842Z`，reply 8329B SHA256=`afb0bd2006b4da8924d0d91a2bde18ad9bfda3c694aa05cd17de550527801223`（七查全过，禁重发）；被测 commit `ca1f4d877e06a9832934eb86657f1ecbd0e077ca`。
③裁定：四项全 PASS——①根因定性=交付缺陷为主因（叙述式事件契约未一次冻结字段/条件/异常语义）、验证机制缺陷为重要次因（无机器校验与正反例）；②停止 R 轮、同意 DV1=机器可校验字段级契约（JSON Schema + 字段到 N/A 原因映射 + 正反例矩阵 + 语义校验器）；③DV1 单次验收门槛冻结（8 类 event_type 全覆盖/字段约束可机器校验/每个 N/A 字段唯一原因且封闭枚举/未知字段类型原因不放行/RECOVER 三情形与非法目标即停⑤/正例全过反例全拒/结果可重复+文件 SHA256）；④R1–R6 历史裁定保留不改写，会商不占返工计数，DV1 未预置 PASS。
④边界：⑥仍 BLOCKED；M1 写路径不解除；不实测；环境检查与⑥实测另批授权；DV1 若 REJECT 则不恢复无上限 R 轮，直接下一级止损。
⑤验收结论：会商 PASS（非返工轮）；DV1 产物 BLOCKED（尚未实施）。

### S4-DV1 降档验证（第三级调整验证链；非 R 轮，不占返工计数）
①目标：按会商门槛对机器可校验事件契约做一次性验收；产物落 `acceptance/dv1/`（schema/语义校验器/正反例/执行器/结果/MANIFEST/报告）。
②DV1 首次验收=**REJECT**，reply SHA256=`d555d4d787c8866ef6b44bc6d98e358788abcbea32d7e8e73d629feeec1060fe`（派单 dispatch-2026-11-19T07-41-19，诊断 diag-906s1-dv1-2026-11-19T07-44-39-597Z，补采 recoll-906s1-dv1-2026-11-19T07-45-00-998Z，七查全过）。两项实质缺陷：RJ-01=RECOVER 上下文目标事件未先做自身结构校验（存在绕过路径）；RJ-02=标准 JSON Schema 缺 event_type/n/a_reason 值 enum，自检未强制其存在。独立复跑 BLOCKED（审查环境无法本地执行），不伪装为通过。
③DV2 调整验证：`validateEvent()` 先校验全部 context 事件；新增 N15「目标类型允许但结构非法」反例；Schema 补标准 enum 且自检强制存在；重跑 24/24 all_ok=true（9 正例/15 反例）。按会商约定不启 R7，原 R1–R6 与 DV1 记录不改写。
④DV2 独立验收=**BLOCKED**，reply SHA256=`ed0539b8fcee526975d0c5049d124e8ccccd46c7def4f4559976debe79c24252`：RJ-01/RJ-02 静态复核全 PASS，唯一缺口=审查环境无法取得六文件本地复跑，不启 R7、不改判 REJECT。DV2b 补单文件自包含验证器 `dv1-standalone.mjs`（内联 schema+校验器+24 用例+runner，随派单附件交付），独立运行 `node dv1-standalone.mjs` 即可复现 24/24 all_ok。
⑤DV2b 补证受阻：两次以 `--attach dv1-standalone.mjs` 派单均在挂载校验阶段 STOP（form 内无文件名 chip），**未发送消息、无重发风险**；现场 dispatch-2026-11-19T07-52-20 / dispatch-2026-11-19T07-53-05。结论：DV2 维持 **BLOCKED**（唯一缺口=审查端独立复跑），不冒充 PASS、不改判 REJECT、不启 R7。
⑥落点：`acceptance/dv1/DV1-REPORT.md` + MANIFEST.sha256；验收结论：DV2 BLOCKED（独立复跑待具环境），⑥仍 BLOCKED/M1 写路径不解除/不实测。

## S5 收口交付（待 DV2 独立验收后回填）
（待回填）

---

## ST-05 自检记录
- S1：PASS（PLANNING 合法态；R3 返工态到期后证据已补 dispatch-2026-11-19T06-39-20+SHA）。
- S3 提交前：PASS。
- R4 派单前（返工态）：PASS①/②/④/⑤，③三步到期记录完整 PASS、S4/S5 未到期 N/A、⑥未到期 N/A；Overall=IN_PROGRESS（N/A 项非 FAIL），零 FAIL。
- R5 派单前（返工态）：PASS①/②/④/⑤，③三步到期记录完整 PASS、S4/S5 未到期 N/A、⑥未到期 N/A；Overall=IN_PROGRESS（N/A 项非 FAIL），零 FAIL。
- R6 派单前（返工态）：PASS①/②/④/⑤，③三步到期记录完整 PASS、S4/S5 未到期 N/A、⑥未到期 N/A；Overall=IN_PROGRESS（N/A 项非 FAIL），零 FAIL。
- S5 终检（COMPLETED 态）：待 R6 后回填。
