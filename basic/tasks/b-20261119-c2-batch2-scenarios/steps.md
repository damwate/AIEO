# 步骤清单（b-20261119-c2-batch2-scenarios）

**方案状态：** v0.3 已冻结（R3 终局拍板 PASS，2026-11-19；拍板依据=用户委托 ChatGPT 渠道）——S3 执行授权 GO

**方案轮次与冻结依据：**

| 轮 | 结论 | 修订 | 复核 |
|---|---|---|---|
| R1（v0.1→v0.2） | ADJUST（reply baef39e5…11496B，dispatch-2026-11-18T18-53-11） | ④拆④-A/④-B/④-C核验门/④-D提案+①两道独立判断+⑤事务级+逐项一轮+即停具体化→v0.2（f5c6c8c） | R2 PASS |
| R2（v0.2→v0.3） | **PASS**（reply 820ca44b…7395B，采集 fail-closed→L-018 补采七查全过，现场 recoll-c2batch2-r2-2026-11-18T19-04-54-726Z） | 冻结前五项文字性补充（①备用触发条件/④-D1网络耗尽+④-D2 HTTP耗尽本机受控端点禁外注/退避墙钟实测区间/契约SHA绑定/④-C不参与整体）→v0.3（5599cc7） | R3 PASS 终局 |
| R3（终局拍板） | **PASS**（reply 552a463a…4981B，采集 fail-closed→同法补采七查全过，现场 recoll-c2batch2-r3-2026-11-18T19-09-41-988Z；三件套 blob SHA 直读复核 task-brief d67ec2e5…/requirement 77ff9242…/steps fa556427…） | 批准④-D独立新增/接受④-C BLOCKED_IMPLEMENTATION_OUT_OF_SCOPE/**批准冻结v0.3+S3执行授权GO** | （终局） |

**验收轮次（ST-02 口径）：** R1/R2/R3 各计 1 轮（R2/R3 发送成功采集 fail-closed，补采取得结论计轮）；方案共识问题 R1 计 1 轮 REWORK，未触三轮止损线。**S3 执行顺序（R3 冻结）：①→④-A→④-B→④-D1→④-D2→⑤，逐项独立派单/独立 SHA/独立证据目录/独立结论；GO≠DEC-017 解除（逐项签核）。**

## S1 开工登记

①本步骤目标：建立任务包三件套，登记依据链（DEC-107/batch1 后续建议/AGENTS.md 节点授权）与四项场景草案、边界红线。

②修改文件：basic/tasks/b-20261119-c2-batch2-scenarios/{requirement.md,task-brief.md,steps.md}。

③修改内容：登记用户原话（"请你继续推进标准版开发"）、执行者理解（①④⑤受控验证+⑥并入多任务门）、四项场景草案、落点登记、边界红线、状态表。

④执行结果：任务包建妥；ST-05 自检首轮 FAIL 两处格式缺口（task-brief 缺「当前状态」状态表行+steps 缺 `## S<n>` 小节），按 aisvc 金标准格式修正后复检。

⑤测试结果：python -I basic/tool/check_taskpack.py basic/tasks/b-20261119-c2-batch2-scenarios —— 复检 Overall=IN_PROGRESS（Phase=PLANNING，①需求记录 PASS/②步骤清单 PASS，③-⑥ N/A 未到期，PLANNING 期合法态，退出码语义符合工具头部约定）。

⑥验收证据引用：本任务包 commit SHA（推送后登记于规划协商派单简报，避免 batch1 R1"证据未推送即派单"缺陷复现）。

**验收结论：PASS**（开工登记完成；独立验收=S2 规划协商链）

## S2 规划协商（ChatGPT 复审→共识→用户拍板→冻结）

①本步骤目标：方案草案经 ChatGPT 逐项复审（R1-Rn）至共识，报用户拍板后冻结场景执行方案与 steps 细化。

②修改文件：task-brief.md（R1 后修订为冻结候选 v0.2）、steps.md、简报 phase0/tools/brief_c2batch2_plan_r1.txt（1093B）。

③修改内容：R1 裁定 ADJUST 后按裁定逐项修订——④拆④-A/④-B/④-C/④-D 四层验收对象、①两道独立判断+次数上限、⑤五断言+事务级 fail-closed、轮次改逐项一轮、即停线具体化+四操作约束、五件套留证清单、DEC-017 逐项解除规则。

④执行结果：R1 完成=**ADJUST**（已认可①⑤⑥方向与逐项解除原则；冻结前须修改五项=④层次区分/④-C 实现入口核验条件/④-A④-B 独立验收条件/轮次逐项一轮/网络恢复与会话归属清理检查——已全部落进 v0.2 修订）。会话迁移已执行：旧审查会话 6afde23c（F3 三轮）换题迁出，指针备份 gpt-reviewer-session.pre-c2batch2.json，新会话 6afdf44d-8d54-83ec-9fca-1bbde1ba1654 `--new-session` 首派即活。中断首跑现场 dispatch-2026-11-18T18-51-36（发送前中止未发送，原位如实归档）。④-C 核验门已完成：AIEO 仓零梯子实现（grep 证据），git_pointer.mjs:374-417 有契约退避真实现→④-D 新增提案。

⑤测试结果：ST-05 自检 PLANNING 合法态（①② PASS）；v0.2 修订后复检=IN_PROGRESS 合法态；v0.3 修订后复检见提交前记录。

⑥验收证据引用：R1 dispatch=phase0/logs/dispatch-2026-11-18T18-53-11，reply SHA256=baef39e5d077307cde33a04c405e99fa0a1df0c111c8c5111049b1f15d778275（11496B，**ADJUST**）。R2 dispatch=phase0/logs/dispatch-2026-11-18T19-01-01（发送双验通过后采集 fail-closed=INBOUND_WINDOW_COMPLETENESS_UNPROVEN，禁重发，浏览器现场保留）→按 L-018 静态 DOM 补采：驱动 recoll_c2batch2_r2.mjs（派生自 recoll_f2f3f4_final.mjs，三参数+前轮 SHA 全换，grep 核对），现场 recoll-c2batch2-r2-2026-11-18T19-04-54-726Z 七查全过（marked_user_unique/last_user_assertion/adjacent_assistant_tail/stable_static_dom_read/final_stop_button_not_visible/not_prev_reply_sha/response_length_plausible 全 true），reply SHA256=820ca44b3bea3dda…（7395B，**PASS**，④-D 附条件纳入拆 D1/D2+冻结前五项文字性补充）。审查会话 6afdf44d；R3 终局拍板待派（用户委托 ChatGPT 渠道）。

## S3 受控场景执行（①→④-A→④-B→④-D1→④-D2→⑤ 逐项）

①本步骤目标：按 v0.3 冻结方案逐项执行受控场景，逐项独立证据目录+独立 SHA，逐项形成 PASS/REWORK/BLOCKED 预结论（GO≠DEC-017 解除）。

②修改文件：以冻结方案为准（预期仅 phase0/logs/ 现场与临时产物+phase0/tools/ 场景驱动）。

③修改内容：逐项执行记录见④（随进度追加）。

④执行结果（随进度登记）：

- **S3-① 多 assistant unit 采集全链——终态 BLOCKED（模型侧无法触发，非采集器失败）：**
  - 主尝试（一次真实尝试）：专用测试会话 6afdf8eb-4acc-83ec-923d-7f38ab2e9f14 `--new-session` 派单（brief_c2batch2_s3_01.txt 637B，显式请求拆 3 条独立消息）→ dispatch-2026-11-18T19-12-57 发送双验通过+COMPLETED，但 **unit_count=1**（模型把三段文本合并进一个 assistant 气泡，104B，六查全过，artifact_sha256=9d11a5889a4224e8…）——不构成有效多 unit 实例；
  - 备用触发（仅此一次，冻结预案）：更强显式指令（brief_c2batch2_s3_01_backup.txt，要求三个分开的消息气泡+做不到即答"无法拆分"）→ dispatch-2026-11-18T19-15-44 发送双验通过后完成判定未通过（composer_empty:false）→禁重发→多 unit 感知补采驱动 recoll_c2batch2_s3_01.mjs（标记 user 后全部 unit+索引连续性扩展）→ 现场 recoll-c2batch2-s3-01-2026-11-18T19-19-12-464Z：**模型终答=单 assistant unit"无法拆分"**（units-diag 四 unit 结构完整：2 user+2 assistant，备用回复 len=16B）；
  - 结论：按冻结方案特殊裁定登记 **BLOCKED（模型侧无法触发）**——模型在标准聊天界面无法于单轮产生多独立 assistant 气泡；采集器能力旁证=区间完整性纯函数+负例 24/24+本批 R2/R3/① 三次静态 DOM 补采实战全过；DEC-017 对应限制保留不解除；
  - 边界动作登记：测试派单覆盖了审查指针（gpt_dispatch 每轮保存会话），已恢复至 6afdf44d（恢复前备份 gpt-reviewer-session.pre-s3-restore.json）；测试会话 6afdf8eb 留待 S3 完成后清理（清理记录随 ④-A 清理登记）；
  - 迁移评估（L-018.6）：审查会话 6afdf44d 现有 3 条 user 消息（R1/R2/R3），S3 场景尝试均用专用会话未再消耗；S4 逐项验收前**迁新会话**（达 4 条评估阈值的前置处置，换阶段迁移）。
- **S3-④-A 死会话派单层闭环——终态 PASS（预结论，待 S4 独立验收）：**
  - 阶段一 既有会话清单（操作约束#1）：c2batch2-s3-04a-inventory-2026-11-18T19-21-18-445Z（15 条会话链接快照，含审查会话 6afdf44d/①测试会话 6afdf8eb；侧边栏可视区口径已注明）；
  - 阶段二 一次性会话创建：dispatch-2026-11-18T19-21-37（brief_c2batch2_s3_04a_create.txt 364B，`--new-session`）→ 会话 **6afdfaf1-afcc-83ec-b377-8d560fcfcc90** 创建成功（"一次性测试会话已就绪"）；
  - 阶段三 删除+死态验证：c2batch2-s3-04a-delete-2026-11-18T19-24-26-208Z——API 变体实测（DELETE→405/POST delete→404/**PATCH is_visible:false→200**），GET 验证→**404**，UI 直载 convUnits=0，侧边栏无该会话→**DEAD=true**；
  - 阶段四 死会话派单：dispatch-2026-11-18T19-24-59（brief_c2batch2_s3_04a_dead.txt 300B）——死页通过壳层就绪检查（bodyLen 281<600 但会话就绪判定过=**发现壳层就绪检查不拦死页**），基线尾部 null，发送双验机械通过（polls=1）后 ChatGPT 把发送**重定向进副作用新会话 6afdfbba-a6f8-83ec-b1a9-e7f8e6fdabe4**（模型按简报指令回复"错误成功：死会话收到消息"，52B）→ **SESSION_ATTRIBUTION_FAIL 当场拦截**（捕获会话≠目标）→ fail-closed 拒写指针/拒写成功结果/无 result.json/现场留存——**派单层安全失败断言全部成立**：无错误成功登记✓、无误更新审查会话指针✓（失败运行未动指针）、无重复发送✓、错误现场留存✓、纵深防御实证（就绪层不拦死页、归属层拦住错误成功）；
  - 阶段五 清理+恢复+核验：c2batch2-s3-04a-cleanup-2026-11-18T19-27-57-583Z——副作用会话先存证后删除（2 units 全量快照）+①测试会话删除，双验证 GET 404；指针恢复 6afdf44d（备份链 pre-s3-04a.json）；审查会话核验完好（6 units，尾 assistant SHA=552a463a…=R3 终局裁定）；
  - 附加发现（如实登记）：死 URL+composer 发送会触发 ChatGPT 新建会话承接（平台行为），归属校验层是拦住错误成功的**决定性防线**——建议后续把"死会话"识别前置到就绪层（不在本批范围，留作工具链演进建议）；
  - DEC-017 对应限制（派单层死会话处理）解除建议=本项 S4 签核后逐项解除。

⑤测试结果：S3-① 派单发送双验 2/2 通过；补采驱动语法检查+实跑（上）；主尝试采集 COMPLETED（单 unit）；备用尝试完成判定 fail-closed 后补采成立。

⑥验收证据引用：主尝试 dispatch-2026-11-18T19-12-57（artifact_sha256=9d11a5889a4224e8b7c822d7c964767c26e2b3414e92cf37274a92afadee9563）；备用 dispatch-2026-11-18T19-15-44+补采现场 recoll-c2batch2-s3-01-2026-11-18T19-19-12-464Z（units-diag.json 四 unit 全量诊断）；驱动 phase0/tools/recoll_c2batch2_s3_01.mjs。逐项独立验收=S4（审查方按冻结方案直读证据签核）。

**S3-① 预结论：BLOCKED（模型侧无法触发；独立验收待 S4）**

## S4 独立验收派单（审查腿）

①本步骤目标：证据包推送后派 ChatGPT 直读复核，逐项签核。

②修改文件：无（证据 commit+派单）。

③修改内容：待 S3 后细化。

④执行结果：未开工。

⑤测试结果：未测（未开工）。

⑥验收证据引用：待登记。

## S5 交付收口（delivery.md）

①本步骤目标：七要素完工总结+DEC 登记+逐项解除建议提交用户。

②修改文件：delivery.md、docs/phase1/decision-log.md（新 DEC 条目）。

③修改内容：待 S4 后细化。

④执行结果：未开工。

⑤测试结果：未测（未开工）。

⑥验收证据引用：待登记。
