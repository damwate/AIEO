# 步骤清单（用户拍板冻结）：b-20261114-taskpack-checker

- **拍板：** 2026-11-14 用户批准"冻结步骤开工"（两道关口第二道：代码规划→开发授权）
- **共识依据：** ChatGPT 规划协商 R1（dispatch-2026-11-14T14-44-18，"需要讨论"）→ R2 自包含简报换新会话（dispatch-2026-11-14T14-53-53，"共识达成"）；七点共识+附加实现约束
- **需求基线：** requirement.md（用户 2026-11-14 拍板确认版）
- **落位：** `basic/tool/check_taskpack.py` 单文件，Python 标准库，无第三方依赖

## 拍板方案要点（冻结，七点共识+四项附加约束）

1. **判定模型：** 单项 PASS/FAIL/N/A；整体 PASS/FAIL/IN_PROGRESS（存在未到期检查项时）。阶段读取 task-brief.md"当前状态"字段映射：待规划→PLANNING；开发中/验收中/返工/阻塞→IN_PROGRESS；完成→COMPLETED；缺失/非法=①项 FAIL，不猜阶段。
2. **两层校验：** 结构校验（文件存在/字段存在/非空/格式/占位符黑名单：待填写/TODO/TBD/待拍板后填写/暂空）+有限规则校验；不做 AI 语义判断。
3. **可追溯性：** PASS 须关联具体步骤小节，禁全局文本充数；REJECT/返工/问题编号三方关联，同编号计数依据有效返工记录，第 3 次允许通过、第 4 次及以后触发⑤ FAIL。
4. **实现：** 六项独立检查函数互不依赖执行顺序，统一字段（检查项编号/名称/状态/问题描述/关联文件/关联步骤/证据）；汇总层计算整体状态，单项不自行决定整体。
5. **证据校验：** 包内相对路径验证存在+禁 `..` 穿越+解析实际路径防符号链接绕过；SHA 查 hex 格式与规定长度（40 位 commit/64 位 reply），不宣称验证文件真实性；不自动执行测试。
6. **输出：** 文本+`--json` 共用同一结果对象（禁两套判定逻辑）；退出码 PASS=0，FAIL=1，IN_PROGRESS 也=1。
7. **测试：** 11 类异常输入入 S3（目录不存在/缺文件/空文件/编码异常/重复字段或编号/记录与步骤不对应/证据不存在/非法阶段/第 3 次返工/第 4 次返工/路径穿越）；异常输入必须产生可识别检查结果，禁未捕获异常/静默跳过/错误 PASS。

## S1 骨架：CLI+状态模型+六项检查函数桩（验收重点：结构正确）

- [x] CLI（`check_taskpack.py <task_dir>` + `--json`）与退出码约定
- [x] 状态模型：阶段映射读取 + 单项/整体状态枚举 + 汇总层
- [x] 六项检查函数桩（结构化返回，桩期 N/A）
- [x] 文本输出格式（共识样例样式）

**六要素记录（步骤完成后填写）：**
①本步骤目标：S1 骨架=CLI+状态模型+六项检查函数桩（验收重点：结构正确）
②修改文件：basic/tool/check_taskpack.py（新建，274 行）；本 steps.md 登记六要素
③修改内容（本次待验收 commit 完整 SHA）：最终待验收 `553ed2d12455e6f30a2cee22616eeafb73ecf963`（=首验 `49c82b5` 新增 basic/tool/check_taskpack.py 274 行：argparse CLI+冻结口径常量+ItemResult/PhaseInfo 数据类+read_phase 五分支映射+六项检查函数桩+summarize 汇总层+文本/--json 共用同一结果对象+异常 fail-safe；`40c66d9` 返工问题1/2 统一 build_result+render_text 消费；`553ed2d` 返工问题4 ①项阶段读取失败=FAIL——详见下方返工记录；diff=9de95cc1→553ed2d）
④执行结果：自测通过——文本模式（本任务包实测：Phase=IN_PROGRESS 映射正确，六项 N/A，Overall=IN_PROGRESS，exit=1）；--json 同数据结构；目录不存在=FAIL+exit=1；阶段映射五分支（no-brief/bad-status/empty-status→UNKNOWN+problems 不猜阶段；待规划→PLANNING；阻塞→IN_PROGRESS）
⑤测试结果：手动自测 EXECUTED_PASS；unittest 正负例+11 类异常场景全套在 S3（未测项如实标注：S3 未测）
⑥验收证据引用：待验收 commit `553ed2d12455e6f30a2cee22616eeafb73ecf963`；**验收结论：PASS（复验R4，dispatch-2026-11-14T15-51-20，新会话；reply sha256=c2d621ac507487c1abe899a31c602d180deddbba2d81fabbd1e89bc6ac69f258）**——问题4修复符合冻结口径1、六项标准①-⑥全PASS、动态证据v2 8组核验通过（B/B2 ①FAIL+可识别原因+files登记正确、C 保留S1桩语义、stderr 已存、环境如实标注 Windows 非 Linux）、三 commit 全链绑定一致（49c82b5/40c66d9/553ed2d 均仅动 check_taskpack.py，含 9dcf116 材料更新核验）；验收历史链：首验 REJECT 两项P1（15-08-02）→ 复验R1 静态PASS+BLOCKED缺动态证据（15-13-16）→ 动态证据v1 a3f5d92 → 复验R2 REJECT问题3（15-24-07）→ 修复 9ae394a → 复验R3 REJECT问题4（15-28-41）→ 修复 553ed2d+证据v2 af3e9a7 → **复验R4 PASS（15-51-20）**；首轮曾 BLOCKED（commit 未推送，15-05-29 会话），推送后按先例换新会话复验；返工记录见下表；**本步闭环，允许进入 S2**

### 返工记录（REJECT/返工/问题编号三方关联）

| 问题编号 | 问题 | 根因 | 修复 commit | 复验 |
|---|---|---|---|---|
| 问题1 | 文本输出遗漏 phase_problems（UNKNOWN 无可识别原因） | render_text 独立传参未接收 PhaseInfo.problems | `40c66d9b17696f548603bb847e45190204a09674`（文本输出"阶段读取: <原因>"） | 复验R1静态PASS（15-13-16）；复验R2维持（15-24-07） |
| 问题2 | 文本与 JSON 未真正共用完整结果对象（正常/目录不存在两路径各自拼装、schema 不一致） | main() 三处分别构造数据 | `40c66d9b17696f548603bb847e45190204a09674`（统一 build_result，render_text(data) 消费同一对象） | 复验R1静态PASS；复验R2维持 |
| 问题3 | 验收请求文档代码绑定过时（返工后待验收 commit 仍写 49c82b5，动态证据绑定 40c66d9，两份代码混合认定风险） | 返工提交后未同步更新 acceptance/s1-acceptance-request.md 的绑定字段 | `9ae394a12d5e261adeb272aa22050d92c5abb423`（文档更新：绑定=40c66d9，diff=9de95cc→40c66d9，附验收历史证据链） | 复验R3维持（15-28-41，R3未再指出绑定问题，另发现问题4） |
| 问题4 | 冻结口径1"阶段读取失败=①项FAIL"实现却返回N/A（复验R3 dispatch-15-28-41 REJECT；执行者"桩期语义"辩护不成立，验收方正确） | check_requirement 依赖 read_phase 结果但未将 UNKNOWN 转为该项 FAIL，S1 骨架桩语义覆盖了冻结口径语义 | `553ed2d12455e6f30a2cee22616eeafb73ecf963`（check_requirement 内读阶段：UNKNOWN=FAIL+可识别原因+files登记task-brief.md；阶段正常仍N/A桩；整体FAIL优先不变；六项独立函数保持） | **复验R4 PASS**（dispatch-15-51-20，问题4修复符合冻结口径，六项标准全过） |
| 问题5 | S2首验P0：验收请求申报"diff=553ed2d→3add8da单commit"，实际该区间含9个commit（混入check-push整改/交接包等并行任务），绑定范围与实际不符（dispatch-16-40-38） | 申报时把"待验收commit自身改动"与"区间范围"混写，未核实 rev-list 区间数 | `e664e76b49be268739070b08aded9066e4b4908c`（S2返工commit：diff=955ffaa→该commit单commit，仅S2工具/fixtures/证据；另附验收请求重绑定声明） | **复验R2 PASS**（16-57-13，GitHub compare 核实 ahead_by=1 无混入） |
| 问题6 | S2首验P1-1：③先评记录后判到期，PLANNING/未到期步骤预填完整PASS记录会被判PASS而非N/A（dispatch-16-40-38） | 实现顺序与冻结口径"未到期N/A"相反：先pass_steps后due分支 | `e664e76b49be268739070b08aded9066e4b4908c`（check_step_acceptance 重排：先阶段/到期判定，未到期一律N/A不评估记录；COMPLETED全到期） | **复验R2 PASS**（16-57-13，静态+F/G动态核验） |
| 问题7 | S2首验P1-2/P1-3：④仅查"有REJECT+表有有效行"未核编号级关联，无关行可替代；⑤直接计全部有效行未限定已关联行（dispatch-16-40-38） | 三方关联实现停留在"存在性"层，未做"编号级"关联与交叉引用 | `e664e76b49be268739070b08aded9066e4b4908c`（④编号级关联：REJECT所在要素值+⑥提取编号，逐编号要求有效行+返工行须被步骤小节引用；⑤仅计已关联行） | **复验R2 部分通过**（16-57-13，④编号级关联成立/H组检出正确）；遗留无编号判定范围缺陷→问题8 |
| 问题8 | S2复验R2遗留P1：④"REJECT无编号引用"判定查整个步骤小节body，而编号提取用REJECT所在要素值+⑥，判定与提取范围不一致——其他无关要素提及编号可致REJECT无编号时④误PASS（dispatch-16-57-13） | 无编号判定沿用body引用源，未与reject_nums提取源对齐 | `3a8975ac5d8e797be9c90309bcc56ceba3356d99`（判定范围统一：step_reject_nums=REJECT要素值∪⑥，为空即FAIL；反例fixture reject-element-no-number：④REJECT无编号+⑤提及问题1+表有问题1有效行→④FAIL，旧实现漏判） | **复验R3c PASS**（17-27-15，验收方沙箱独立动态执行30/30 SHA256校验+七组退出码全符，反例行为正确） |
| 问题9 | S3首验P1-1/P1-2：拍板异常类"重复字段或编号"未被真正验证——工具对重复字段无检测（重复任务ID行输出与无重复基线完全一致，测试仅断言exit=1被IN_PROGRESS未到期项掩盖=错误容忍）；工具对重复步骤编号静默接受（两个S1小节"2步记录完整PASS"），与拍板口径"不允许重复编号被静默接受"不符；另P2-1 JSON第三场景（目录不存在）未做文本对照（dispatch-2026-11-14T17-39-59） | 测试编写只验证exit=1与宽松文本，未断言具体项FAIL与原因；被测工具S2版确无重复检测——新增测试实际发现其行为缺陷，按验收方允许条款（"不需要修改S2被测工具，除非新增测试实际发现其行为存在缺陷"）修复工具而非仅改断言 | `941ee8843b54a8d2685d6fe6cc07e564e6275ca4`（①count_brief_field_rows表格行+行内键逐字段计数>1次FAIL"重复出现N次不允许静默接受"；②Counter按sid计数>1个FAIL"S1出现2个小节"；测试断言加强：①FAIL+含"重复""任务ID"/②FAIL+含"重复""S1"+Overall非PASS+exit=1；test_json_missing_dir走assert_json_matches_text补第三场景六项状态+Overall+退出码对照；unittest 32用例OK(skipped=1)保留清单不退化；具体FAIL输出与三场景对照见phase0/tools/s3-rework-r1-materials.txt） | **复验R1 部分确认**（dispatch-2026-11-14T17-54-36，reply sha256=2da8c284a8ee3439c2cf4a4544a72bbd50094d7a9bedac08a4d22d3efc8ad0bb）：三项整改成果确认保留（两项重复检测FAIL原因明确/JSON三场景对照/保留清单不退化）；新发现P1-1计数覆盖缺口（标题形式漏计→问题10）+P1-2绑定申报错误（区间实为2commits/5文件→问题10同批整改）；⑤于复验R2 经附件通道独立执行通过（33/33 OK） |
| 问题10 | S3复验R1两项P1：①P1-1重复字段计数覆盖缺口——count_brief_field_rows只统计表格行+行内键，而extract_brief_field支持表格/行内/标题三种书写形式，同一字段以表格行+标题形式各出现一次时计数=1漏判（验收方点名"重复计数覆盖工具支持的全部字段书写形式"+跨格式反例）；②P1-2绑定申报错误——941ee88申报"diff=4818399→941ee88单commit"，GitHub Compare实际ahead_by=2/5文件（941ee88 parent=3191a34，4818399→941ee88含3191a34+941ee88两个commit），申报凭记忆写基线未核实parent与rev-list区间数，与问题5同型教训（dispatch-2026-11-14T17-54-36） | ①计数函数实现时只对照了本轮测试场景（表格重复）未对照提取函数全形态清单；②绑定申报流程缺陷：未执行git rev-list --count与parent核验即写"单commit"——整改动作固化核查步骤（申报前必跑rev-list count+parent） | `b1bd307ffe574b785814e47527f0f91423a54190`（①count_brief_field_rows扩为三形式计数（标题regex=extract_brief_field标题形态口径），新增test_duplicate_brief_field_cross_format跨格式反例（表格行+标题形式无行内，旧计数1漏判→新计数2①FAIL+重复原因+Overall非PASS+exit=1）；②绑定修正：本commit parent=3e61af1，diff=3e61af1→b1bd307单commit仅2文件（工具+测试），申报前rev-list核实；Ran 33 tests OK(skipped=1)；跨格式FAIL输出见phase0/tools/s3-rework-r2-materials.txt） | **复验R2 PASS+复验R3 PASS**（R2 dispatch-18-04-51：P1-1 三形式计数与跨格式反例核实、P1-2 绑定 parent/compare/文件清单一致、动态执行附件SHA256逐字一致+33/33 OK；R3 dispatch-18-13-02 终态PASS） |

（问题1、2 相互独立各第 1 次返工；问题5/6/7 为 S2 首验 REJECT 三项相互独立各第 1 次返工，修复均为 e664e76；问题8 为复验R2 遗留 P1（属问题7 同项④的判定范围缺陷，第 1 次返工），修复 3a8975a；问题9 为 S3 首验 REJECT 三项（P1-1/P1-2 同属拍板异常类"重复字段或编号"验证不足+工具行为缺陷、P2-1 JSON 对照缺失，相互独立同批整改，第 1 次返工），修复 941ee88；问题10 为 S3 复验R1 两项 P1（计数覆盖缺口+绑定申报错误，相互独立同批整改，第 1 次返工），修复 b1bd307——其中绑定申报错误与问题5 同型（未核实区间数），教训固化：申报绑定前必跑 git rev-list --count 与 parent 核验；问题3、问题4 各与之独立，均第 1 次；采集器跳位致结论原文不可恢复按 DEC-043 先例换会话，属采集缺陷不计入本任务返工；另：af3e9a7 提交信息声称"steps.md登记问题4"但该提交 diff 实际未含 steps.md，问题4 登记在本 commit 补上）

## S2 六项检查规则实现（验收重点：规则逐项通过）

- [x] ①需求记录（requirement.md 原文非空 + task-brief.md 9 必备字段非空非占位符）
- [x] ②步骤清单（steps.md 有效步骤编号与名称）
- [x] ③步骤验收记录（每步骤小节六要素+PASS 结论+证据引用，关联具体小节）
- [x] ④REJECT 返工记录（REJECT/返工/问题编号三方关联）
- [x] ⑤返工次数（同编号有效返工记录计数，第 4 次及以后 FAIL）
- [x] ⑥交付记录（任务完成时 delivery.md 七要素）

**六要素记录（步骤完成后填写）：**
①本步骤目标：按 steps.md S2 冻结清单实现六项检查规则（替换 S1 桩），保持六项独立函数+统一结果对象+两层校验（结构+有限规则，不做 AI 语义判断）。
②修改文件：basic/tool/check_taskpack.py（六项函数实装+解析辅助）；basic/tasks/b-20261114-taskpack-checker/steps.md（S2 勾选+本记录+问题3修复 commit 补全 40 位）；acceptance/s2-fixtures/（六个验证用 fixture 任务包：三原始+复验新增 phase-boundary×2+reject-wrong-number）+acceptance/s2-runtime-evidence/（首验版五组）+acceptance/s2-runtime-evidence-v2/（返工后八组 A-H 留档）。
③修改内容（本次待验收 commit 完整 SHA）：见 s2-acceptance-request.md 绑定字段（待验收 commit 及 diff 范围以该文件为准）。要点：①requirement.md 非空非占位符+task-brief 9 必备字段（按冻结清单"9 必备字段"；当前状态走阶段映射专门校验、最终结果设计上完成前暂空，均不入占位符检查表），字段提取支持表格行/行内/`## 字段`标题三形态；②`## S<编号> <名称>` 小节解析；③六要素提取（标记+（说明）后缀+冒号）+阶段规则（COMPLETED 全须 PASS/IN_PROGRESS 编号<当前须 PASS/PLANNING 全 N/A/当前步骤解析不出=FAIL 不猜）+PASS 结论+dispatch 目录+reply SHA256(64hex)+包内证据路径校验（相对/禁../禁符号链接出界/存在性）；④REJECT 与返工表三方关联（REJECT 须有含「问题编号+修复 commit 40位SHA」的有效行）；⑤同编号计数第 4 次及以后 FAIL；⑥COMPLETED 时 delivery.md 七要素，其余 N/A；④⑤在 COMPLETED 且无返工时空满足 PASS（保证整体 PASS 可达）；阶段读取失败=③FAIL 不猜。
④执行结果：六项规则实装完成；对自身任务包运行：①②④⑤ PASS、③⑥ N/A 未到期、Overall IN_PROGRESS exit=1（符合冻结口径 6）；三 fixture 场景与 JSON 一致性全部符合预期（见⑥证据）。自测中抓出并修正三处：自身返工表问题3修复列为短 SHA（补全 9ae394a1…）；①误按 11 字段检查致「最终结果」占位符永久误报（改按冻结清单 9 字段）；④在 COMPLETED 无返工时误 N/A 卡死整体 PASS（改空满足）。
⑤测试结果：自测 5 场景+JSON 一致性全过（A 自身包 IN_PROGRESS exit1/B good-completed 全 PASS exit0/C rework4 ⑤FAIL exit1/D reject-no-table ③④FAIL exit1/E JSON schema 与文本判定一致）；11 类异常场景 unittest 归 S3（本步骤未做，如实标注）；未跑独立验收（本记录即为派单前置材料）。
⑥验收证据引用：验收历史：首验 REJECT（dispatch-2026-11-14T16-40-38，reply sha256=757db8ce1ee5de5f5229837d3acd2a51373ac0f813827a94dba59deeb88764c5）：①②⑥ PASS；问题5（P0 绑定范围申报与实际不符，区间 9 commits）+问题6（P1-1 ③先评记录后判到期）+问题7（P1-2/P1-3 ④⑤缺编号级三方关联）；整改 commit e664e76（diff=955ffaa→e664e76 单 commit）+证据 v2 八组。**复验R2 REJECT（dispatch-2026-11-14T16-57-13，reply sha256=495ede70f2b2d374cf44813fd8b9dd8bffe0cb7719f1fcf5d786fa2c7727ad22）**：问题5/问题6 PASS、问题7 部分通过（④编号级关联成立），遗留④"REJECT 无编号"判定范围缺陷（登记问题8）；整改 commit 3a8975a（diff=7cd06cf→3a8975a 单 commit：判定范围统一为 REJECT 所在要素值+⑥）+反例 fixture reject-element-no-number+证据升级 v3 九组。**当前结论：PASS（复验R3c，dispatch-2026-11-14T17-27-15，新会话；reply sha256=355e35e1b41626b49f4061e12257c47e518c89c56118007686d9f0446c7a6bf1）**——R3b 静态审查全过（A-H 八组证据+I 组逻辑+提交范围 compare 核验）后其环境无法 clone（DNS 失败）判 BLOCKED，R3c 以附件通道投递 s2-dynamic-acceptance-3a8975a.zip（30 文件+MANIFEST，全部 git show 从 3a8975a blob 逐字节提取），验收方在其 Python 沙箱独立解压执行七组命令：30/30 SHA256 校验 PASS、预期/实际退出码全符、R2 遗留反例行为正确（④FAIL ⑤PASS），无 GitHub 网络依赖；验收方沙箱执行记录 s2-dynamic-execution-record.txt 未随回复导出，动态执行证据以 reply 七组结果表+退出码为准（reply 留档 phase0/logs/dispatch-17-27-15）；验收历史链：首验 REJECT 三项（16-40-38）→ e664e76 → 复验R2 REJECT 遗留④判定范围（16-57-13）→ 3a8975a → 复验R3 BLOCKED（17-11-41，证据404）→ 补入口 R3b BLOCKED（17-21-21，静态全过+环境受限）→ 附件动态执行 **R3c PASS（17-27-15）**；**本步闭环，允许进入 S3**动态证据 acceptance/s2-runtime-evidence-v3/（A 自身包①②④⑤PASS ③⑥N/A / B good-completed 全PASS exit0 / C rework4 问题1×4 ⑤FAIL / D reject-no-table ③④FAIL / E JSON 一致性 / F phase-boundary-inprogress ③"1步PASS+2未到期N/A" / G phase-boundary-planning ③全N/A / H reject-wrong-number ④双问题FAIL / I reject-element-no-number ④FAIL"REJECT所在要素值与⑥均未引用问题编号"⑤PASS）九组留档，fixtures 七场景可复跑。

## S3 unittest 正负例+边界测试+JSON 输出（验收重点：异常场景全部覆盖）

- [x] 正例：完整任务包样例输出 PASS
- [x] 11 类异常输入逐项断言（含目录不存在/路径穿越/符号链接）
- [x] `--json` 输出结构与文本判定一致性
- [x] 异常输入产生可识别结果（无未捕获异常/静默跳过/错误 PASS）

**六要素记录（步骤完成后填写）：**
①本步骤目标：按 steps.md S3 拍板口径实现 unittest——正例完整任务包输出 PASS、11 类异常输入逐项断言（含目录不存在/路径穿越/符号链接）、`--json` 输出结构与文本判定一致性、异常输入产生可识别结果（无未捕获异常/静默跳过/错误 PASS）。
②修改文件：basic/tool/test_check_taskpack.py（新增，最终 33 用例=首版 32 用例+复验R1 整改新增跨格式反例 test_duplicate_brief_field_cross_format：黑盒 subprocess 走 CLI 真实退出码+validate_pack_path 三规则单元直调）；basic/tool/check_taskpack.py（复验R1 整改：count_brief_field_rows 计数扩三形式）；basic/tasks/b-20261114-taskpack-checker/steps.md（S3 勾选+本记录）。
③修改内容（本次待验收 commit 完整 SHA）：`b1bd307ffe574b785814e47527f0f91423a54190`（diff=3e61af1→b1bd307 单 commit 仅 2 文件：check_taskpack.py+test_check_taskpack.py；首验整改 941ee88 parent=3191a34、复验R1 整改 b1bd307 parent=3e61af1，两轮申报均按 parent→commit 口径——首验轮申报曾错写基线 4818399 致区间虚增，已在问题10 修正，待验收绑定详见 s3-acceptance-request.md）。要点：临时目录动态构造任务包（不依赖仓库 fixtures，自包含）；按拍板 11 类异常一一映射测试（目录不存在/缺文件×3/空文件/编码异常/重复字段+重复编号/记录与步骤不对应×2/证据不存在/非法阶段/第 3 次返工/第 4 次返工/路径穿越）；符号链接出界以 os.symlink 权限探测，无权限 skipTest 如实标注（validate_pack_path 的 resolve+is_relative_to 口径由单元级 test_unit_symlink_escape_rejected 与相对/穿越/绝对路径三规则共同覆盖）；JSON 一致性断言 items 状态序列+overall↔exit 对应（COMPLETED 全 PASS/rework4/目录不存在三场景）；可识别结果批量断言 6 异常场景 exit=1+含 FAIL+无 Traceback。
④执行结果（按轮次区分）：首版（4818399）历史结果：Ran 32 tests OK (skipped=1：test_unit_symlink_escape_rejected 因 Windows 环境无符号链接创建权限按设计跳过，环境允许时自动执行——历史环境说明保留，不改为 Linux 结果)；全部异常场景无未捕获异常（每用例断言无 Traceback）。首验 REJECT（dispatch-2026-11-14T17-39-59，问题9：P1-1/P1-2 测试暴露被测工具"重复字段或编号"行为缺陷+断言不足、P2-1 JSON 第三场景缺文本对照）→ 返工：工具补重复字段/重复编号检测+测试断言加强+第三场景对照；复跑 Ran 32 tests OK (skipped=1)，保留清单（第3次PASS/第4次FAIL/S2反例④FAIL⑤PASS/P1-1边界/路径三规则/符号链接skipTest）全部不退化。复验R1 REJECT（dispatch-2026-11-14T17-54-36，问题10：P1-1 计数漏标题形式+P1-2 绑定申报错误，同型问题5 教训固化申报前必核 parent/区间数）→ 二次整改 b1bd307：计数扩为三形式+跨格式反例。**最终结果（R2）：Ran 33 tests OK (skipped=1)**；复验R2 验收方 Linux 沙箱附件独立执行 33/33 OK（失败 0 跳过 0——其环境具备符号链接权限故 skipped=0，环境差异如实注明）。
⑤测试结果（最终，R2 版 33 项）：python -I -m unittest discover -s basic/tool -p "test_check_taskpack.py" → **Ran 33 tests OK (skipped=1)**（历史：首版与 941ee88 轮均为 32 项 OK skipped=1；b1bd307 起为 33 项）；python -I basic/tool/test_check_taskpack.py 直跑等价。独立验收：复验R2 验收方沙箱附件解压独立执行通过（见④）。
⑥验收证据引用：验收历史：首验 REJECT（dispatch-2026-11-14T17-39-59，reply sha256=a741d1bc0568dacd2e99466c077f3f9bf63b129c75e46c2685479c71266bf28a）：①③⑥ PASS、② FAIL（P1-1/P1-2 两项实质性测试缺陷）、④ 部分通过、⑤ 待独立复跑——登记问题9；整改 commit 941ee88（问题9 行含工具修复依据与复跑结果）。验收历史链：首验 REJECT（17-39-59，问题9）→ 941ee88 → 复验R1 REJECT（17-54-36，reply sha256=2da8c284a8ee3439c2cf4a4544a72bbd50094d7a9bedac08a4d22d3efc8ad0bb：三项整改成果确认保留；新问题10）→ b1bd307 → **复验R2（dispatch-2026-11-14T18-04-51，reply sha256=82fc2fb2488ecf11c4dc314ace57f7fcc535cfcc43cfb25b7a93f7591cbce3f9）：六查实质项全 PASS（绑定 P1-2 核实 parent/compare/文件清单一致；动态执行 PASS——附件两文件 SHA256 与 MANIFEST 逐字一致，独立执行 Ran 33 tests OK 失败0跳过0，跨格式反例/重复编号/JSON三场景/返工边界/路径符号链接全过，Linux 环境 skipped=0 属环境差异；历史保留项无退化）；唯一遗留=S3 六要素②④⑤未同步 33 项（验收记录准确性问题，非代码缺陷）→ 本 commit 文档修正**。**最终结论：PASS（复验R3，dispatch-2026-11-14T18-13-02，新会话；reply sha256=1c323ace506a36e0698b5e9747d6cb38d831c928debac70e28f28ac500833658）**——文档修正通过（提交范围 78c6cc8 parent=86e5310 ahead_by=1 仅 2 文件无代码改动、六要素逐项核查全 PASS、两轮 REJECT 问题与整改关系完整、绑定范围/parent/commit 数/文件清单无混混、无新 P1/P2）；完整验收链：首验 REJECT（17-39-59，问题9）→ 941ee88 → 复验R1 REJECT（17-54-36，问题10）→ b1bd307 → 复验R2 六查实质全 PASS+动态执行 PASS（18-04-51，唯一遗留文档②④⑤未同步 33 项）→ 78c6cc8 文档修正 → **复验R3 PASS（18-13-02）**；**本步闭环，允许进入 S4**。测试文件在待验收 commit 内可复跑；整改材料 phase0/tools/s3-rework-r1-materials.txt（r1：两项 FAIL 输出+JSON 三场景对照）与 s3-rework-r2-materials.txt（r2：跨格式反例 FAIL 输出+33 项完整执行结果）已入库；仓库 fixtures 七场景（S2 留档）与 S2 证据 v3 九组可交叉核对。

## S4 文档与交付（验收重点：可独立运行）

- [ ] 使用说明（toolkit 或 basic/tool 内 README 约定落位）
- [ ] 完工总结 delivery.md 七要素

**六要素记录（步骤完成后填写）：**
①本步骤目标：②修改文件：③修改内容（本次待验收 commit 完整 SHA）：④执行结果：⑤测试结果：⑥验收证据引用：
