# 步骤清单（用户拍板冻结）：b-20261115-phasec-workflow-stats

- **拍板：** 2026-11-15 用户批准"同意，开工吧"（两道关口第二道：方案规划→执行授权）；同指示"明早 11 点前不参与拍板，与 ChatGPT 讨论以其结论为准"——**代授权窗口**：窗口内 S1-S4 各过程拍板以 ChatGPT 独立验收/复审结论为准；**v0.3 正式生效拍板不在代授权范围**，仍留用户（冻结方案原文"等待用户拍板生效"）
- **共识依据：** ChatGPT 规划协商 R1（dispatch-2026-11-14T18-48-54，reply sha256=38c46aa9e0831977ff50147ae01bb4adbbe07249800ac55f50467846f80420cf，"需要讨论"五点增补+四细节推荐）→ R2（dispatch-2026-11-14T18-53-09 发送双验通过后采集遇 INBOUND_WINDOW_COMPLETENESS_UNPROVEN fail-closed 正确拦截；按先例一次性补采驱动 recoll_phasec_plan_r2.mjs 静态 DOM 重读六查全过未重发，recoll-2026-11-14T18-55-44-611Z，reply sha256=d002d698cff31f7b451375b416bfda0b3d7e2575c9c7e818dc92e6e663b3c430，**"共识达成"**）
- **需求基线：** requirement.md（用户 2026-11-15 拍板确认版）
- **统计原料：** basic/tasks/b-20261114-taskpack-checker/ 全流程记录 + phase0/logs/dispatch-2026-11-14T*（归属按任务 ID 核验，S1 内正式完成）

## 拍板方案要点（冻结：五点增补全采纳+四细节按推荐+风险控制）

1. **统计维度：** 五基础（四步验收轮次/每轮问题数与 P0/P1/P2/10 项返工问题根因归类/各步往返耗时/检查器可前移拦截占比）+ 三补充（A 验收结果与阻塞分布——首验 REJECT、复验 REJECT、PASS、BLOCKED、文档修正后通过、证据环境致重复派单分别计，BLOCKED 单列；B 问题发现来源——规划期/开发自检/检查器/独立验收/完工自检；C 修复成本与预防效果——代码返工/文档返工/证据重制/重新派单/修订后可否再犯）。
2. **统计口径（冻结表）：** 验收轮次≠派单次数（发送失败/采集 fail-closed 不计轮次）；问题按独立编号计数不按 REJECT 次数；P 等级按问题级（一个问题多个发现项取问题主等级，说明内部子等级）；主根因唯一（可有次根因）；耗时=首派至最终 PASS 总历时+相邻派单间隔两口径；拦截率分母=具备明确前移拦截条件的问题数（非全部返工问题）；原始证据缺失/时间戳不完整/归属不确定项如实标注，**不得估算补齐**。
3. **拦截三分类（互斥主分类）：** 可自动拦截（现有/轻量增强检查器可确定性发现）/可模板预防（必填字段、固定格式、填写提示）/必须人工判断（语义、方案合理性、代码质量、独立性）；每问题仅归一类，辅助标签不占主分类；报告给四比例：可前移/检查器可拦截/模板可预防/必须人工，各 /10。
4. **阶段出口条件：** S1=所有数字可溯源原始记录+口径明确+报告不夹带未证实推断；S2=每处 WORKFLOW 修订有统计依据，非统计驱动的合理改进单独标注；S3=不仅查文字还查规则可执行性（四步/两道关口/止损/交付条件无内部冲突），不由执行者自宣通过；S4=检查器六项自检+文档一致性+delivery.md，检查器 PASS≠v0.3 自动合格。
5. **验收清单：** 独立文件 `basic/ACCEPTANCE-CHECKLIST.md`，七模块（A 需求登记/B 规划协商/C 开发执行/D 独立验收/E 返工管理/F 整体交付/G 安全边界）×固定六字段（编号/检查点/合格标准/检查方法/证据要求/不合格处理）+三总体规则（每项 PASS/FAIL/N/A 三态；N/A 须有明确适用条件不得绕过必检项；整体通过条件明确不以数量百分比代替）；**与检查器分工：** 检查器查结构性格式性有限规则，清单查完整工程质量（六要素存在≠真实准确）。
6. **模板边界：** templates 三件套（task-brief/acceptance-request）+docs/phase1/handoff-template.md 纳入审查按需最小必要修改；公共模板跨版本兼容、无实际冲突不修改、所有模板修改记录对应 WORKFLOW 条款；basic/tool/README.md 与 basic/tasks/README.md 纳入一致性检查非必改。原则：规范优先、模板跟随、工具只补确定性检查。
7. **风险控制：** ①归属按任务 ID/派单内容/步骤关联确认，不按时间范围；②问题编号（实体）/验收轮次（发现与处理）/修复次数（整改）/复发（恢复原编号）四层分离防重复计数；③BLOCKED 单列不混 REJECT；④ST-xx 修订追踪表（统计编号/发现/结论/修订位置/动作）；⑤v0.3 拍板前不生效（v0.2 仍有效）+生效日期+批准依据+v0.2↔v0.3 差异记录。
8. **核心原则（ChatGPT）：** 阶段 C 不把 WORKFLOW 写得更复杂，用真实数据让 Basic 更简单、更可靠、更容易复制到其他电脑。
9. **交付物冻结：** workflow-stats.md（本任务目录）/ basic/WORKFLOW.md v0.3 / basic/ACCEPTANCE-CHECKLIST.md / templates 按需修订 / delivery.md。

## S1 统计报告：workflow-stats.md（验收重点：数据可溯源+口径冻结）

- [x] 归属核验：2026-11-14 全部 91 个 dispatch 目录逐一定位（首任务 27/本任务 2/并行 5/早期 57），非统计原料剔出并单列
- [x] 五基础维度统计 + 三补充维度统计（口径按冻结表）
- [x] 10 项返工问题逐项登记（编号实体/轮次/修复次数/根因主次/发现来源/修复成本/拦截分类）
- [x] 证据索引 + 可信度说明
- [x] ST-xx 追踪表预留（ST-01~ST-12 建立）

**六要素记录（步骤完成后填写）：**
①本步骤目标：按冻结口径（五基础+三补充维度/口径冻结表/三类互斥拦截分类四比例）产出首任务 b-20261114-taskpack-checker 四步全流程统计报告 workflow-stats.md，含归属核验、证据索引、可信度说明、ST-xx 修订追踪表、S1 出口条件自查。
②修改文件：basic/tasks/b-20261115-phasec-workflow-stats/workflow-stats.md（新建，十四节统计报告）；本 steps.md（S1 勾选+本记录）。
③修改内容（本次待验收 commit 完整 SHA）：30b56de1928b39d90a1291c38fa0f20c7bac9597（S1 整改 commit；diff=0dc3115→30b56de 单 commit，已核验 rev-list=1+parent=0dc3115；本栏与返工表、acceptance/s1-acceptance-request.md v2 的回填 commit 不属验收 diff 范围，承首任务 S4 先例 43cd5da→afecef5）
④执行结果：91 个 dispatch 目录全量归属核验完成（首任务 27/本任务 2/并行 5/早期 57）；五基础+三补充维度统计完成；验收轮按磁盘证据重计为 16（交接包记 15 且分步枚举自相矛盾，差异如实列 ST-02）；10 问题逐项登记（问题级 P0=1/P1=7/未标注=2，发现项级 P0=1/P1=10/P2=1，等级缺证不估算）；拦截三分类 1 可自动/1 可模板/8 须人工；ST-01~ST-12 追踪表建立（ST-01 绑定申报同型复发×3 为最强修订信号）；S1 出口条件自查三项全过（报告§十四）。R1 独立验收 **REJECT 4 项**（问题1-4，登记见返工记录表），按验收方最小范围边界指令整改：问题1→§八一次过率改双口径（步骤一次通过率 1/4 与最终 PASS 轮次 4/16 分母不混用）；问题2→§六补齐 17 段相邻间隔（13 阶段内+4 阶段间）+时间闭合说明；问题3→§一补 57 目录 14 组逐目录归属表（识别依据=派单内容首行标题）；问题4→§四补问题级 P2=0 对照说明。已核实正确的统计数字未改动，原始证据未动，无口径重定义。
⑤测试结果：统计数字抽核 EXECUTED_PASS——①关键轮次 reply SHA256 与首任务 steps.md ⑥ 记录交叉核对一致（S1-R4=c2d621ac…/S2-R3c=355e35e1…/S3-R3=1c323ace…/S4=fcf86d1d…）；②耗时差值复算抽核**发现并修正一处均值误差**（有结论轮均值 3.4→3.5 分钟，纯验收 16 轮 3.6 分钟，逐轮秒级复算）；③轮次计数与目录存在性比对（16 有结论轮+9 失败派单+2 规划失败计 27 目录吻合）。整改后复算核验：17 段间隔逐段复算与原始 run.log 一致；闭合恒等式 9319.9+4114.0=13433.9 秒成立；18 轮总耗时 3779.719 秒、均值 3.4997/3.5932 分钟复算不变；57 目录分组逐目录与 request.txt 首行标题比对一致。无代码交付，unittest 不适用（如实标注：本步无自动化测试，验证方式=数字溯源抽核）。
⑥验收证据引用：R1 独立验收 **REJECT 4 项**（dispatch-2026-11-14T19-19-26，reply sha256=d98e442e16e45d599592919fae227e80693ca9c0490cbe36dc392f9be0b2fe09；Git 绑定/统计维度/口径/原始执行抽核/证据可核查五项通过，六查①③⑤⑥ PASS、② 部分通过、④ REJECT；P1-1 一次过率分母错误=P1 **问题1**、P1-2 相邻间隔缺 5 段+缺闭合说明=P1 **问题2**、P1-3 早期 57 目录归属证据不足=P1 **问题3**、P1-4 问题级 P2 展示缺失=P2 **问题4**；边界指令：最小范围统计整改，不得修改原始历史证据、不得重定义口径、不得修改已核实数字）→ 修复见返工记录表；首版验收请求 acceptance/s1-acceptance-request.md（绑定 f36743c，R1 已用）；复验请求 v2 随回填 commit 更新。R2 复验 **PASS，S1 闭环**（验收结论：PASS；dispatch-2026-11-14T19-36-06 发送双验通过后采集遇 INBOUND_WINDOW_COMPLETENESS_UNPROVEN=DEC-043 家族，按先例 recoll_phasec_s1_r2.mjs 静态 DOM 补采恢复 recoll-2026-11-14T19-41-46-705Z 六查全过未重发，reply sha256=9998ebbbff9d2c295b2ff00e021d6e82a2f6d6e620b4820de2b2d1381ab8ced1；四项整改 4/4 PASS——17 段间隔与闭合独立复算一致、57/57 目录逐目录核对相符、原有数字与原始证据保护核查通过、返工记录完整性 PASS；验收方非阻断整洁性建议=删除 v2 尾部旧版正文残留，已执行；裁定原文"S1 正式闭环，允许进入 S2：WORKFLOW v0.3、验收清单与模板修订"，边界重申=S2 按 ST-01~12 修订、不借机扩大流程复杂度）。

## S2 修订草案：WORKFLOW.md v0.3+验收清单+模板按需修订+追踪表（验收重点：修订依据明确+规范模板一致）

- [x] basic/WORKFLOW.md v0.2→v0.3（每处修订标注统计依据 ST-xx；非统计驱动改进单独标注）
- [x] basic/ACCEPTANCE-CHECKLIST.md 新建（七模块六字段三态+三总体规则）
- [x] templates 三件套+handoff-template 核对，按需最小修改（无冲突不改，修改对应 WORKFLOW 条款）
- [x] tool/README 与 tasks/README 一致性核对
- [x] v0.2↔v0.3 差异记录

**六要素记录（步骤完成后填写）：**
①本步骤目标：按 S2 出口条件完成修订——WORKFLOW v0.2→v0.3 每处修订有统计依据（ST-01~ST-12 映射），非统计驱动的合理改进单独标注；新建 basic/ACCEPTANCE-CHECKLIST.md（七模块×六字段×三态+三总体规则+与检查器分工）；templates 与两 README 按需最小修改/一致性核对；v0.2↔v0.3 差异记录成文。核心原则：不把 WORKFLOW 写得更复杂。
②修改文件：basic/WORKFLOW.md（v0.3：版本头注记+模块三两条新增+模块四五条新增+派单工具链双路径+首个真实闭环验证任务节状态更新+文末附录差异记录）；basic/ACCEPTANCE-CHECKLIST.md（新建）；basic/templates/acceptance-request.md（代码绑定节增 ST-01 申报核验条款，唯一模板修改）；本 steps.md（S2 勾选+本记录）；task-brief.md（状态更新）。**核对后未修改（无冲突不改）：** templates/task-brief.md、templates/handoff-package.md（9 行指针文件，引用不复制）、docs/phase1/handoff-template.md、basic/tool/README.md、basic/tasks/README.md。
③修改内容（本次待验收 commit 完整 SHA）：0604231fa2002cfb45845943cd797cec796fbfe3（S2 第 2 轮补正唯一 commit；diff=2db7ebd→0604231 单 commit，已核验 rev-list=1+parent=2db7ebd；验收历史：首版 0da7d1e R1 REJECT 问题5→整改 03b6ed2 R2 REJECT 问题5 第 2 轮（task-brief 12 行未落地）→本轮补正 0604231；已通过项不因整改失效；本栏与返工表、acceptance/s2-acceptance-request.md v3 的回填 commit 不属验收 diff 范围，承首任务 S4 先例 43cd5da→afecef5）
④执行结果：R1 独立验收 **REJECT 1 项**（问题5，登记见返工记录表）——按验收方最小整改边界指令执行：P1-1 文档数量口径未统一（同一根因计 1 问题）：task-brief「差异记录 11 条」→12 行、steps.md S2⑤「30 个条目」→31 个条目、WORKFLOW 附录末两行重号 11→末行改 12；复数三处与实际（附录 12 行=清单 31 项）已程序核验一致。根因如实记录：steps.md ⑤ 此前批量替换目标编号写错（①写成②）静默未中——根因=文档数量更新不同步+替换后未逐处复查。R2 复验 **REJECT（问题5 第 2 轮，不新增编号）**：整改①③落地 PASS、② 落地 PASS，唯 task-brief 状态行在返工改写时把已修好的「差异记录 12 行」字样整行删失（全行 replace 未保留整改数量，同根因复发）——按验收方精确文本补正：当前步骤改写并显式载明「附录差异记录 12 行、验收清单 31 项」。R3 复验 **PASS，问题5 闭环**（第 2 次返工通过，未触发第 3 次止损；五项核查全过=绑定/task-brief 数量补正/steps 流程登记/整改范围/已通过内容保护）。已核实内容未改动，未扩范围。检查器自检实战拦截 1 处记录格式缺陷并当场整改——S1 ⑥ 缺检查器要求的字面「验收结论：PASS」标记（此前自检 ③ 为 N/A 系「当前步骤」写作 S1 致同号未到期，本次步骤推进写 S2 后 S1 到期暴露；已补字面标记，语义未变）——ST-05 前移价值再次实测。WORKFLOW v0.3 修订 12 条（含自检补充：附录增 ST-07 行→清单 C-3 测试断言+D-2 六查逐项结论，D-2 补 [ST-07] 标签）（附录差异记录表 12 行：10 条统计驱动=ST-01 绑定申报核验/ST-02 轮次口径/ST-03 BLOCKED 解除路径/ST-04 混合结论/ST-05 申报前自检/ST-06 工具缺陷处理/ST-07 清单 C-3+D-2/ST-08+09 派单故障双路径/ST-12 证据包结构；1 条拍板需求=验收清单成文；1 条非统计驱动单独标注=首个真实闭环验证任务节事实状态更新）；ST-10/11 未触发修订维持实测基线并显式声明；未修订模块列明（模块一/二/五/六、会话管理、代码抽取、不做清单、部署边界统计无信号保持原文）；ACCEPTANCE-CHECKLIST 七模块 31 项（A4/B4/C5/D5/E4/F5/G4）全六字段+三总体规则+分工声明；验收请求模板唯一修改=绑定节增"申报前核验（ST-01，必跑）"。
⑤测试结果：检查器自检 EXECUTED（见下）+一致性程序核验 EXECUTED_PASS——①清单结构核验：七模块小节齐备、31 个条目行×6 字段列数一致（程序核验 0 错列）、三总体规则与分工声明在文件头；②WORKFLOW 附录↔正文一致性：附录 12 行与正文新增条款/清单条目逐条对应（模块三 2+模块四 5+派单工具链 1+清单条目 ST-07 1+状态更新 1+清单提及 1+版本注记 1）；③README 核对：tool/README 检查器用法命令与 ST-05 条款一致、tasks/README 目录约定与 v0.3 无冲突；④检查器自检 EXECUTED：①②④⑤ PASS、③ N/A（S1 记录完整 PASS；S2-S4 未到期）、⑥ N/A，Overall=IN_PROGRESS exit=1（任务进行中预期态）；自检拦截并当场整改 1 处记录格式缺陷（见④）。
⑥验收证据引用：R1 独立验收 **REJECT 1 项**（dispatch-2026-11-14T19-55-39，reply sha256=4f11e099ba2edb40ed3bf1a0b185c94d014ca259d8af5cc4ccedf518c2feed6f；六查①②③⑤⑥ PASS、④ REJECT=P1 **问题5** 文档数量口径未统一——task-brief 11 条/steps⑤ 30 条目/附录末行重号 11，实际=附录 12 行+清单 31 项，同一根因计 1 问题，第 1 次 REJECT；边界指令=最小整改不扩范围不重设计；验收方同时确认：附录 12 行 ST 依据逐行 PASS、新条款与两道关口/止损/独立验收无实质冲突、未借机修改已核实统计数字、v0.3 草案状态未变）→ 修复见返工记录表；首版验收请求 acceptance/s2-acceptance-request.md（绑定 0da7d1e，R1 已用）；复验请求 v2 随回填 commit 更新。R2 复验 **REJECT（问题5 第 2 轮，不新增编号）**（dispatch-2026-11-14T20-01-39 发送双验通过后采集遇 INBOUND_WINDOW_COMPLETENESS_UNPROVEN=DEC-043 家族，按先例 recoll_phasec_s2_r2.mjs 静态 DOM 补采恢复 recoll-2026-11-14T20-04-58-780Z 六查全过未重发，reply sha256=746178a98c977ad455aa86a7e29d0bbbb2da97f22a72b8f047c0d2d064ff3fae；五项 PASS=绑定/附录编号/清单 31 项/整改范围/已通过内容保护，唯 task-brief 状态行 12 行字样未落地）→ 第 2 轮补正见返工记录表。R3 复验 **PASS，S2 正式闭环**（dispatch-2026-11-14T20-07-36，reply sha256=703c16ad6afdc922d41cff3a8bc93f31fa775c7cd5efcbe211dfb10ce43ead53；验收结论：PASS；五项核查全过，裁定原文"S2 正式闭环，允许进入 S3 独立复审。此前已通过的内容不需要重复修改或重新验收"；返工计数=问题5 第 2 次返工通过，未触发止损条件）。

## S3 独立复审：ChatGPT 复审统计+修订+清单（验收重点：独立复审通过，不由执行者自宣）

- [x] 复审请求（新会话，自包含简报+绑定 commit）
- [x] 复审问题整改（如有，按"同一问题"计数规则）
- [x] 复审通过结论

**六要素记录（步骤完成后填写）：**
①本步骤目标：按 S3 出口条件完成整体独立复审——不仅查文字还查规则可执行性（四步流程/两道关口/止损/交付条件无内部冲突），不由执行者自宣通过；复审对象=统计报告+WORKFLOW v0.3+验收清单+模板（均前步验收闭环）。
②修改文件：acceptance/s3-review-request.md（新建）；acceptance/s3-evidence-v1.zip（BLOCKED 解除证据包）；basic/WORKFLOW.md（ST-01 条款细化+附录 ST-10/11 对齐统计）；basic/templates/acceptance-request.md（申报前核验细则）；basic/ACCEPTANCE-CHECKLIST.md（增 BLOCKED 边界总体规则）；phase0/tools/ 诊断脚本×4+补采驱动 recoll_phasec_s3_r2.mjs+派单简报×3；本 steps.md；task-brief.md。
③修改内容（本次待验收 commit 完整 SHA）：09e7797c565fd1bfef9cf4151e4b14c0fbd6a786（S3 问题6 第 2 次整改唯一 commit=最终待验收对象；diff=a74db98→09e7797 单 commit 4 文件，申报前核验已跑：rev-list --count a74db98..09e7797=1+parent=a74db98，符合 ST-01 细则单 commit 分支；多 commit 分支命令已实测演示=rev-list --reverse --parents 9a2935c..a74db98 四条线性全过；历史：355a9b1 第 1 次整改（R2 三项）R3 复验唯问题6 遗留；其后的 v3 复验请求/证据归档回填 commit 不属验收 diff 范围，承 S2 先例 43cd5da→afecef5）
④执行结果：R1 BLOCKED（GitHub 读取失败，验收方请求 ZIP）→附件通道排查=诊断链 4 步（setInputFiles/paste/drop 三路径全静默失败）→**根因确认=账号级附件配额耗尽**（form 告警「你已达到文件附件数量限制…11月16日 1:29 后重试」，非工具故障，如实报告验收方）→ST-03 替代通道=精确 raw URL 直读→**R2 复审实际完成：NEEDS RECTIFICATION 3 项**（按独立问题分别登记=问题6/7/8，见返工记录表；同时五模块中版本完整性与独立结论两项 PASS、v0.3 结构/31 项清单结构/四步两道关口止损无冲突等已通过项免重复整改）→按验收方整改边界（只改三问题/不重写 WORKFLOW/不改 31 项结构/不改统计数字/不改 v0.2 现行状态）执行三项整改：问题6→WORKFLOW ST-01 条款+模板增 parent 核验细则（git show -s --format='%H %P'，单 commit parent=基线/多 commit 无 merge）；问题7→清单增 BLOCKED 边界总体规则（任务级阻断≠第四种项目判定，阻断时不得标 N/A/PASS）；问题8→附录 ST-10/11 对齐统计 §十三原文（ST-10=止损未触发维持，ST-11=规划效率维持，六查观察不属 ST 条目）。R3 复验 **NEEDS RECTIFICATION（唯问题6 遗留，不新增编号）**：问题7/8 复验 PASS（BLOCKED 边界规则三要点准确/ST-10/11 对齐一致，且已通过项保护复核八项全过）；问题6 仍未闭环——git show -s 仅见首末 parent、rev-list --count 仅核数量，均不能证明多 commit 区间逐条线性无 merge，缺可复跑命令与逐项判定条件 → 第 2 次整改按验收方最小方案：多 commit 增 `git rev-list --reverse --parents <基线>..<待验收commit>` 逐条核链+通过条件四则（首条唯一 parent=基线/后续每条唯一 parent=上一条 SHA/末条=待验收 commit/任一条多 parent=merge 须改报 diff 基线单独说明）+acceptance-request 模板同步。问题6 返工计数=第 2 次（同问题最大 2 次：若本轮复验再不过即触发 ST-10 止损，停止循环开会交用户）。
⑤测试结果：整改一致性程序核验 EXECUTED_PASS——①ST-01 细则命令可复跑（本任务历史核验均符合新细则：单 commit 申报 parent=基线实跑成立）；②清单 31 项×6 字段复验 0 错列+新增 BLOCKED 边界规则落位文件头；③附录 ST-10/11 与 workflow-stats.md §十三 第 235/236 行逐字对照一致；④检查器自检见下；⑤R3 轮自测=rev-list --reverse --parents 命令语义实测（线性链 9a2935c..a74db98 四条全满足新通过条件=首条唯一 parent=基线/逐条 parent=上一条/末条=待验收；merge commit 以多 parent 行出现规则可判定）。
⑥验收证据引用：R1 BLOCKED（dispatch-2026-11-14T20-12-51，reply sha256=f88bfb1794bb06dfa411c214a43e326cf83608d84b056faa9f69c37255feaef4）→附件派单 fail-closed（dispatch-2026-11-14T20-16-46，附件挂载未验证 STOP 未发送）→诊断脚本 diag_attach_mount/-2/-3/-notice.mjs（配额根因确认）→通道说明派单（dispatch-2026-11-14T20-22-24 发送双验通过后采集 fail-closed→recoll_phasec_s3_r2.mjs 补采 recoll-2026-11-14T20-26-14-410Z 六查全过未重发，reply sha256=14a603837fe7487848c9373965a9858a6536f36262b820fe3091728b29700b98）→R2 NEEDS RECTIFICATION 3 项（问题6/7/8）→整改 355a9b1 → R3 复验（dispatch-2026-11-14T20-36-58 发送双验通过→采集 fail-closed→recoll_phasec_s3_r3.mjs 补采 recoll-2026-11-14T20-40-03-680Z 六查全过未重发，reply sha256=47c9cce7cfecbf504748ea84073a90c21e601e8d0921c1409cc701eebd9fe064）：问题7/8 PASS、问题6 未闭环 → 第 2 次整改 09e7797 → R4 复验（dispatch-2026-11-14T20-45-16 发送双验通过→采集 fail-closed→recoll_phasec_s3_r4.mjs 补采 recoll-2026-11-14T20-47-47-462Z 六查全过未重发，reply sha256=1d6d365ac546302b32574976ede34be1b82c28620d2b060df147d77464b6da47）：**S3 正式闭环**（验收结论：PASS；问题6 第 2 次整改通过（问题6 第 2 次整改通过；问题7/8 沿用 R3；绑定核验=a74db98→09e7797 唯一 commit 4 文件+回填 89c0471 不属验收 diff；已通过项保护复核七项全过=31 项结构/统计数字/v0.2 现行/12 行编号/v0.3 草案状态均未修改；裁定原文"S1 PASS/S2 PASS/S3 PASS，允许进入 S4；检查器 PASS 不替代文档和交付物的独立验收"；v0.3 生效仍须用户拍板）。

## S4 整体校验交付（验收重点：交付完整，等待用户拍板生效）

- [x] 检查器六项自检（本任务包；检查器 PASS≠v0.3 自动合格，另做文档一致性与交付完整性核查）
- [x] 全部交付物文件一致性检查
- [x] delivery.md 七要素

**六要素记录（步骤完成后填写）：**
①本步骤目标：按冻结方案完成整体校验交付——检查器六项自检（本任务包）+全部交付物文件一致性检查（程序核验）+delivery.md 七要素成文；声明 v0.3 生效拍板留用户（代授权范围外），S4 验收通过≠v0.3 生效。
②修改文件：basic/tasks/b-20261115-phasec-workflow-stats/delivery.md（新建，七要素）；本 steps.md（S4 登记）；task-brief.md（状态更新）。
③修改内容（本次待验收 commit 完整 SHA）：S4 交付内容 commit=5580d4aacfc34d89e4ea674cdea0204a7b1d25ac（diff=6cf01df→5580d4a 单 commit 3 文件=delivery.md 新建+本 steps.md S4 登记+task-brief 状态；申报前核验已跑：rev-list --count 6cf01df..5580d4a=1+parent=6cf01df）。S4 绑定完整链（多 commit 逐条核链，随 S4 复验请求申报）：6cf01df（S3 闭环基点）→5580d4a（S4 交付内容）→cc030ff（验收请求回填）→S4 整改 commit（本记录所在，SHA 由 S4 复验请求绑定节申报，经 git rev-parse HEAD 对照核验）。Git 自引用限制如实声明：任一 commit 无法将自身 SHA 写入自身文件——本 ③ 按 S4 R1 验收方问题9 指令改为"内容 commit 完整 SHA+完整绑定链+本 commit SHA 由复验请求申报对照"的完整可追溯记录（与验收请求一致；链上每条 commit 的 rev-list --reverse --parents 输出随复验请求逐条列出）。
④执行结果：检查器六项自检 EXECUTED（①②④⑤ PASS、③=S1-S3 3 步记录完整 PASS/S4 未到期、⑥ N/A、Overall=IN_PROGRESS=S4 进行中预期态）；全部交付物一致性程序核验 21/21 PASS，八组检查=①WORKFLOW v0.3 草案版本头+v0.2 现行 blockquote+附录差异记录 12 行无重号；②清单 31 项×6 字段 0 错列+BLOCKED 边界第 4 条规则在位；③ST-01 核链命令（rev-list --reverse --parents）WORKFLOW 与模板两处同步在位；④附录 ST-10/11 与统计 §十三 关键句对齐（止损未触发/规划 2 轮 12 分钟收敛/六查不属 ST 条目）；⑤workflow-stats.md 最后修改=30b56de（=S1 R2 PASS 验收对象，S2/S3 全程未动统计）；⑥返工表 8 行全 40 位 SHA 无占位符残留；⑦S1/S2/S3 六要素各含字面「验收结论：PASS」；⑧task-brief↔steps 状态一致。如实记录一处核验脚本断言口径修正：⑤组初版断言写"最后修改=976ada1"系我写错（S1 闭环回填 commit 本就不碰统计文件），甄别为断言口径错误非交付物缺陷，修正为 30b56de 后全过；delivery.md 七要素成文（复刻首任务格式）。S4 R1 独立验收 **REJECT 3 项**（dispatch-2026-11-14T20-54-23，reply sha256=8cfaf2139314a52b9ca673201c3826b449c1a994f8381013ff42c91967b6811c；Git 绑定核验/需求四项交付物/历史结论/版本边界/清单结构均 PASS）→ 问题9/10/11 登记见返工表：问题9=③ 绑定记录当时在回填 commit（cc030ff）而待验收 commit（5580d4a）内仍为占位——整改=③ 重写为完整绑定链记录（见③，Git 自引用限制如实声明）；问题10=返工表问题7/8 复验列未随 S3 R3/R4 同步（状态同步遗漏，S3 闭环时只更新了问题6 行）——已更新两行复验列；问题11=验收方判附录缺编号 11——经三方程序核验为读取偏差（本地工作区/git 对象 5580d4a/GitHub raw 三方 sha256 逐字节一致=df5d1f21968ce01c1634709ce2adc2901a1bcc2f60ffaefe66920ed0424114cc，编号序列 1-12 全在；验收方自报其网络 DNS 失败），原始证据不动，三方核验证据随复验请求提交复核，若复验方维持原判再按其读取通道排查。
⑤测试结果：一致性核验输出 20 PASS+1 FAIL→FAIL 甄别=断言口径错误（见④）→修正重跑 21/21 PASS；检查器自检输出留证（S4 commit 前后各跑一次，COMPLETED 前后 ③⑥ 到期行为正确）。S4 R1 后证据完整化（按验收方"21/21 未获可独立复跑证据"指令）：一致性核验脚本存档 phase0/tools/s4-consistency-check.py（正则锚定收紧至附录表区域+⑤ 断言修正为 30b56de 口径）+完整输出存档 phase0/tools/s4-consistency-check-output.txt；检查器实际运行输出存档 phase0/tools/s4-checker-output.txt；三方比对命令可复跑（git show 5580d4a:basic/WORKFLOW.md / curl raw / 工作区逐字节 sha256）。
⑥验收证据引用：S4 R1 独立验收 **REJECT 3 项**（dispatch-2026-11-14T20-54-23，reply sha256=8cfaf2139314a52b9ca673201c3826b449c1a994f8381013ff42c91967b6811c）→ 整改 commit 见返工记录表问题9/10/11；S4 复验结论待回填。

## 返工记录（REJECT/返工/问题编号三方关联）

| 问题编号 | 问题 | 根因 | 修复 commit | 复验 |
|---|---|---|---|---|
| 问题1 | R1 REJECT P1-1：一次过率分母错误（1/16=6.25%，统计对象=步骤时正确分母为 4） | 统计对象混淆——比例对象（步骤）与分母（轮次）未对齐，比例定义未在报告中成文先行 | 30b56de1928b39d90a1291c38fa0f20c7bac9597 | R2 PASS（recoll-19-41-46-705Z，reply 9998ebbb…ced1，4/4 整改通过） |
| 问题2 | R1 REJECT P1-2：相邻间隔仅列 12 段（完整 17 段），缺 5 段且无阶段间/阶段内分层与时间闭合说明 | 维度覆盖缺口——"相邻间隔"自限于返工阶段内部，遗漏规划回合内间隔与跨步骤间隔；闭合恒等式未自查 | 30b56de1928b39d90a1291c38fa0f20c7bac9597 | R2 PASS（recoll-19-41-46-705Z，reply 9998ebbb…ced1，4/4 整改通过） |
| 问题3 | R1 REJECT P1-3：早期 57 目录归属证据不足（仅"00-47-28 至 14-23-49 各轮"，不满足逐目录追溯） | 归属核验已按内容执行但证据展示未留痕——核验动作与可核查证据未分离 | 30b56de1928b39d90a1291c38fa0f20c7bac9597 | R2 PASS（recoll-19-41-46-705Z，reply 9998ebbb…ced1，4/4 整改通过） |
| 问题4 | R1 REJECT P2-1：问题级 P2=0 未明示，与发现项级 P2=1 存在混淆风险 | 展示细节遗漏——两级等级对照未成文 | 30b56de1928b39d90a1291c38fa0f20c7bac9597 | R2 PASS（recoll-19-41-46-705Z，reply 9998ebbb…ced1，4/4 整改通过） |
| 问题5 | S2 R1 REJECT P1-1：文档数量口径未统一（task-brief 差异记录 11 条/steps.md S2⑤ 30 个条目/WORKFLOW 附录末两行重号 11，实际=附录 12 行+清单 31 项） | 文档数量更新不同步+批量替换目标编号写错（①写成②）后未逐处复查（三处同根因，按模块五计 1 问题） | 03b6ed28277f56aa3094a6bbefebf5f0d3dcf944（R1 整改）+0604231fa2002cfb45845943cd797cec796fbfe3（R2 补正） | R3 PASS（dispatch-20-07-36，reply 703c16ad…d53，五项全过问题5 闭环，未触发止损） |
| 问题6 | S3 R2 P1：ST-01 parent 核验规则不够明确（未定义"怎么算核验通过"：parent 获取方式/单 commit 是否须等于基线/多 commit 链核对/merge 判定） | 条款成文时只写"必跑"未写"通过条件"——可执行性缺口（S3 出口条件正查此点）；第 1 次整改仍缺多 commit 逐条链核验命令（git show -s 仅见首末 parent、rev-list --count 仅核数量） | 355a9b146e6e2fabc7de37f90a6174ae438e749e（第 1 次）+09e7797c565fd1bfef9cf4151e4b14c0fbd6a786（第 2 次） | R3 复验：问题7/8 PASS，问题6 未闭环 → 第 2 次整改（rev-list --reverse --parents 四通过条件）→ R4 复验 PASS（recoll-20-47-47-462Z，reply 47c9cce7…e064，问题6 闭环未触发止损） |
| 问题7 | S3 R2 P1：清单三态与 WORKFLOW BLOCKED 状态衔接缺规则（环境阻断时无判定指引，可能误标 N/A） | 三态规则制定时未与模块四 BLOCKED 状态对齐——两文件横向一致性缺口 | 355a9b146e6e2fabc7de37f90a6174ae438e749e | R3 复验 PASS（dispatch-20-36-58 复验轮，reply 47c9cce7…e064，BLOCKED 边界规则三要点准确；S3 R4 沿用确认） |
| 问题8 | S3 R2 P1：WORKFLOW 附录 ST-11 写成"六查有效性"与统计 §十三（ST-11=规划 2 轮 12 分钟收敛效率良好）不一致 | 附录撰写时凭记忆未逐条回对统计原文——映射错误 | 355a9b146e6e2fabc7de37f90a6174ae438e749e | R3 复验 PASS（dispatch-20-36-58 复验轮，reply 47c9cce7…e064，ST-10/11 对齐一致；S3 R4 沿用确认） |
| 问题9 | S4 R1 P1：S4 六要素③绑定记录在回填 commit（cc030ff）而待验收 commit（5580d4a）内为占位——验收请求声称与 commit 实态不一致 | Git 自引用结构性限制（SHA 无法写入自身 commit）+沿用首任务回填先例未在 ③ 原文显式声明 | S4_FIX_PLACEHOLDER_9 | 待 S4 复验 |
| 问题10 | S4 R1 P1：返工表问题7/8 复验列未随 S3 R3/R4 结果同步（仍写"待 S3 复验"） | S3 闭环回填时只更新了问题6 行——多行返工闭环时缺逐行同步核查动作 | S4_FIX_PLACEHOLDER_10 | 待 S4 复验 |
| 问题11 | S4 R1 P1：验收方判 WORKFLOW 附录缺编号 11（实际 11 条）与 12 行声明不符 | 经三方程序核验=验收方读取偏差（三方 sha256 逐字节一致 df5d1f21…+编号 1-12 全在；验收方自报 DNS 失败）——非交付物缺陷，证据随复验请求提交复核 | 不适用（原始证据不动） | 待 S4 复验复核三方证据 |
