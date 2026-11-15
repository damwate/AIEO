# steps：b-20261115-v03-activation（WORKFLOW.md v0.3 生效落地）

- 拍板记录：用户 2026-11-15 拍板原话："我同意，你可以与chatgpt讨论"
- 冻结方案要点（规划协商 2 轮达共识后冻结；R1 裁定=修改已全采纳，R2 裁定=同意冻结）：
  - S1 文档生效：WORKFLOW.md 标题去草案注记改已生效；生效状态 blockquote 五要素（生效日期 2026-11-15／v0.3 现行／v0.2 历史对照／批准依据=用户拍板原话／记录位置=requirement.md+交接包 §5）；ACCEPTANCE-CHECKLIST.md 头部补正式生效声明；**不清除**附录历史"草案"记录
  - S2 检查器同步：①a 扩展=标题已生效字面+清单头正式生效声明；①b 精确锚生效状态 blockquote 五要素并负向拒绝旧草案态；①c 保持（附录 12 行）；检查项总数 37 不变；新增 phase0/tools/s4-activation-state-tests.py（负向 3 注入于隔离临时副本+各断言指名拦截：标题回草案／blockquote 回 v0.2 现行／清单声明删除；正向=生效实态全过+附录历史保留仍过）；DV1 6/6 与 negpos 7/7 历史矩阵原样不动；四命令重跑（一致性 37/37＋dv1 6/6＋negpos 7/7＋COMPLETED 包 taskpack Phase=COMPLETED ①-⑥ 全 PASS Overall=PASS）新态输出归档本任务 acceptance/，不覆盖 phase0/tools/s4-*-output.txt 历史存档
  - S3 独立验收交付：ChatGPT 派单独立验收；三文件零修改以 git diff 对照基线核验；ST-01 绑定申报（申报引用从最终归档取值并锁定被测 commit）
- 边界（冻结）：禁改 b-20261115-phasec-workflow-stats 三文件（已 COMPLETED 历史裁定）；DEC-043 inbound_dom.mjs 收集器修复挂 backlog 不动；v0.2 以 Git 历史 commit 为对照（仓库无独立副本，如实表述不虚构）；v0.3 首个日常任务另立独立任务，不混入本任务验收；S1 动工前重核当时 main HEAD/git status/最近提交
- **范围授权说明（R2 复核提出的越界项处置，2026-11-15）**：commit b1bdbe6（docs/AI-DEV-LESSONS.md L-014 第 6 条+phase0/environment-inventory.md §4 补记）**不属于本任务冻结范围，系用户 2026-11-15 本会话直接指令的并行工作**——用户原话："你看看开发经验吧，不要每次都找代理问题，找到方法之后写入记忆，不然每次新开会话或者换zcode登录账号之后都要重新找链接方案，以后所有的开发都会涉及到代理链接github和chatgpt"。该 commit 由用户指令直接触发、独立于 S1/S2 整改，因时间窗口重叠被计入 91474c1..ff0ab04 验收 diff 区间；申请验收方将其视为独立授权 commit 不计入本任务被测 diff。phase0/tools 简报与 recoll 驱动、phase0/logs 派单证据=过程审计材料，与代码整改范围区分登记（不属被测逻辑）。
- 规划协商证据链：dispatch-2026-11-15T03-31-21（发送双验通过 polls=1，采集 fail-closed=INBOUND_WINDOW_COMPLETENESS_UNPROVEN，DEC-043 家族第 12 次，禁重发）→ recoll_v03act_plan_r1.mjs 静态 DOM 补采 recoll-2026-11-15T03-36-58-729Z（六查全过，reply sha256=14a48dc982f42fa4ab1054c2d59726897714d179406f973bb38b0f8512f1c7ec，6039B，裁定=修改）→ dispatch-2026-11-15T03-39-03（reply sha256=d1fc718c23734e1e42eae1712175ac350e7b292d5acdfb7ee6f72306d53fc046，裁定=同意冻结）。规划材料绑定 commit=8095fa436b047302f2f195a4d563026781086e0d（仅本轮规划绑定）

## S1 文档生效

- ①本步骤目标：WORKFLOW.md 与 ACCEPTANCE-CHECKLIST.md 由草案态转正式生效态（标题+生效状态 blockquote 五要素+清单生效声明），附录历史记录不动
- ②修改文件：basic/WORKFLOW.md、basic/ACCEPTANCE-CHECKLIST.md
- ③修改内容：WORKFLOW.md 标题"（草案，待用户拍板生效）"→"（已生效 2026-11-15）"；生效状态 blockquote 整行改写为五要素（生效日期 2026-11-15 经用户拍板正式生效／为**现行版**／v0.2 保留为历史对照以 Git 历史 commit 为准无独立副本／批准依据=用户拍板原话"同意生效，请给我一句话交接给新的会话完成接下来的工作"／记录位置=tasks/b-20261115-v03-activation/requirement.md+handoff/BASIC-PHASE-C-V03-ACTIVATION-HANDOFF.md §5）；ACCEPTANCE-CHECKLIST.md 头部补生效状态（正式版）blockquote；附录表 12 行与 ST-10/11 段历史"草案"记录保留不动（全文"草案"计数=2 均为历史区）。**待验收 commit 完整 SHA：52e1f298fdbc31000b781ced8d55b9591f10c38b**
- ④执行结果：三处编辑完成；Python 逐项核验（标题含已生效无草案/blockquote 五要素全 True/blockquote 自身无草案态/清单声明/附录历史保留=2）全过；phasec 任务包三文件 diff=0
- ⑤测试结果：一致性检查器①a①b 断言此际仍为草案态（S1→S2 既定中间态，S2 commit 91474c1 后消除，四命令于 S2 全过）
- ⑥验收证据引用：合并验收轮 R1=dispatch-2026-11-15T04-12-06→recoll-2026-11-15T04-16-08-180Z（reply sha256=a9e3059b…162f，S1 五要素/范围/边界点通过，随 S2 整改退回）；R3 复核=recoll-2026-11-15T04-41-21-287Z（reply sha256=2f09f5ceb5608b89dadab9ede87d85867bd8c45ebb14da70e3c4875ad638ce6e，S1 文档生效[被测 52e1f298fdbc31000b781ced8d55b9591f10c38b]验收结论：PASS）

## S2 检查器同步与测试演进

- ①本步骤目标：s4-consistency-check.py ①a/①b 断言随生效态演进（37 项不变），新增 s4-activation-state-tests.py 专项回归，五命令重跑全过并存档
- ②修改文件：phase0/tools/s4-consistency-check.py、phase0/tools/s4-activation-state-tests.py（新增）、basic/tasks/b-20261115-v03-activation/acceptance/（存档）
- ③修改内容：①a 改为"v0.3 已生效版本头字面+清单正式生效声明"双断言（标题行精确锚定且无草案字样）；①b 改为生效状态 blockquote 五要素精确锚定并负向拒绝旧草案态（"草案"/"仍为现行版"在 blockquote 行回流即 FAIL）；①c 附录 12 行保持；检查项总数 37 不变。新增专项回归：负向 3 注入+正向 2，全部注入只作用于内存副本。**待验收 commit 完整 SHA：91474c15e45c51ce87e0c44e3ffe2900b50cea0c（R1 验收对象）→ ff0ab04f59bc1b9de9788812a97ee152a160b4d9（R1 REJECT[问题1/2/3]整改后最终待验收版本，R2 复核问题1/2 关闭确认；R2 复核 reply sha256=2986a76b79190e5b…）**
- ④执行结果：五命令全过退出 0 并归档；MANIFEST 首版被测 commit 误取生成时 HEAD（52e1f29），登记轮修正为 91474c1。R1 独立验收（dispatch-2026-11-15T04-12-06→recoll-2026-11-15T04-16-08-180Z 补采，reply sha256=a9e3059b535bbc7e9e0cbcceef56982bb9f42f92b0385ee8fe60594c6456162f）裁定 **REJECT 3 项[问题1=①b 未核验完整记录位置（P1-1）/问题2=①a 全文包含偏弱（P2）/问题3=MANIFEST 被测 commit 绑定不完整（P1-2）]**，整改见返工表。已确认通过部分保留：S1 生效内容/37 项不变/DV1/negpos 零改动/变更范围/阶段 C 零修改/DEC-043 未动
- ⑤测试结果：整改后重跑=一致性 37/37+专项 7/7（负向扩至 5：NT4 交接包引用删除→①b 拦截、NT5 声明移出头部→①a 拦截；NT5 首跑 6/7 暴露 ①a 全文扫描漏检，收紧 ①a 至清单头部区[首个二级标题前]后 7/7）+DV1 6/6+negpos 7/7+phasec 包 taskpack COMPLETED 全 PASS，退出码全 0，归档刷新
- ⑥验收证据引用：R1=dispatch-2026-11-15T04-12-06（发送双验通过，采集 fail-closed DEC-043#13 禁重发）→recoll_v03act_acc.mjs 补采 recoll-2026-11-15T04-16-08-180Z（六查全过，reply sha256=a9e3059b535bbc7e9e0cbcceef56982bb9f42f92b0385ee8fe60594c6456162f，REJECT 3 项[问题1/问题2/问题3]）；R2 复核=recoll-2026-11-15T04-33-01-640Z（归属校验型补采 recoll_v03act_r2b.mjs 七查全过，reply sha256=2986a76b79190e5b55a20eca43bd31b7731577815e72e1478bd97471183be046，问题1/问题2 关闭确认；R1 误采集现场 recoll-2026-11-15T04-29-58-641Z 如实归档）；R3 复核=recoll-2026-11-15T04-41-21-287Z（recoll_v03act_r3.mjs 七查全过，reply sha256=2f09f5ceb5608b89dadab9ede87d85867bd8c45ebb14da70e3c4875ad638ce6e）：问题3 关闭确认（MANIFEST v2@67e434d 全核验）+问题4 范围裁定通过（b1bdbe6=独立授权 commit）+**S2 检查器与测试[最终待验收 ff0ab04f59bc1b9de9788812a97ee152a160b4d9]验收结论：PASS；S2 证据登记[67e434d3515da2d5f5a959e2fe974c8d43afe54e]验收结论：PASS**

## 返工记录表（首次 REJECT 时建表；按"同一问题"计数）

| 问题编号 | 轮次来源 | 问题描述 | 整改内容 | 修复 commit | 验证 |
|---|---|---|---|---|---|
| 问题1 | R1 验收 REJECT P1-1 | ①b 断言未核验完整记录位置（交接包路径+§5 缺失，引用被误删仍可过） | ①b 增补 `handoff/BASIC-PHASE-C-V03-ACTIVATION-HANDOFF.md`+`§5` 精确断言；专项测试新增 NT4（blockquote 删交接包引用→①b 指名拦截） | ff0ab04f59bc1b9de9788812a97ee152a160b4d9 | 重跑专项 7/7 含 NT4 PASS；R2 复核关闭确认（reply 2986a76b…） |
| 问题2 | R1 验收 REJECT P2 | ①a 清单声明为全文包含检查，声明移出头部仍可过（弱位置约束） | ①a 收紧=定位清单头部区（首个二级标题前）声明行核验三要素；专项测试新增 NT5（声明移出头部→①a 指名拦截）；NT5 首跑暴露实现仍全文扫描（6/7），收紧后 7/7 | ff0ab04f59bc1b9de9788812a97ee152a160b4d9 | 重跑专项 7/7 含 NT5 PASS；R2 复核关闭确认（reply 2986a76b…） |
| 问题3 | R1 验收 REJECT P1-2 | MANIFEST 被测 commit 绑定不完整（验收 diff 内版本仍指 52e1f29，无法追溯 S2 测试代码版本；缺双 SHA 与生成命令） | MANIFEST 重写：被测代码 SHA+被测文档基线 SHA 双绑定+五输出 SHA256+生成命令+五输出由最终被测代码版本重新生成归档（五输出重生成与归档刷新在修复 commit 完成，MANIFEST 登记于其后 commit，不属被测 diff） | ff0ab04f59bc1b9de9788812a97ee152a160b4d9 | 五输出与被测代码 commit 树重跑一致（IDENTICAL×5）；R2 复核=验收方读取 d7d33d5 旧版 MANIFEST（v2 位于 67e434d 含双 SHA/五命令/7/7 新 SHA 未被读取），待下一轮对 67e434d 关闭确认 |
| 问题4 | R2 复核新增越界改动（范围问题） | b1bdbe6（AI-DEV-LESSONS.md+environment-inventory.md）出现在验收 diff 区间，非本任务内容，系用户 2026-11-15 直接指令的并行工作（原话存档于头部范围授权说明段） | 申请验收方确认为独立授权 commit，不计入本任务被测 diff | b1bdbe6cea77a56ab783c9ae511aff07d3f4a0c5 | R3 复核范围裁定通过（问题4 关闭） |

## S3 独立验收与交付

- ①本步骤目标：ChatGPT 独立验收通过，三文件零修改 git diff 核验，登记交付
- ②修改文件：basic/tasks/b-20261115-v03-activation/delivery.md、task-brief.md（完成态）、steps.md（本登记）、acceptance/（终检归档刷新）
- ③修改内容：R1 合并验收轮→R2 复核（问题1/2 关闭+问题3 澄清+问题4 提出）→R3 复核 PASS 全闭环；delivery.md 七要素成文（含过程如实记录三项：误采集弃用/SHA 误填纠正/网络排查绕行教训）；task-brief 转完成态；五命令最终轮归档刷新
- ④执行结果：R3 裁定 S1 PASS（52e1f29）+S2 PASS（ff0ab04）+S2 证据登记 PASS（67e434d），问题1-4 全关闭；phasec 三文件零修改经验收方 R1/R2 两轮独立核验确认；本任务 taskpack 终检 ①②④⑤⑥ PASS（③ N/A=2 步完整 PASS+S3 登记）
- ⑤测试结果：最终轮五命令全过退出 0：一致性 37/37+专项 7/7+DV1 6/6+negpos 7/7+phasec 包 COMPLETED 全 PASS
- ⑥验收证据引用：R3 复核=recoll-2026-11-15T04-41-21-287Z（recoll_v03act_r3.mjs 七查全过，reply sha256=2f09f5ceb5608b89dadab9ede87d85867bd8c45ebb14da70e3c4875ad638ce6e）；验收派单链=phase0/logs/dispatch-2026-11-15T04-12-06（R1）+dispatch-2026-11-15T04-25-05（R2）+dispatch-2026-11-15T04-37-33（R3）；**验收结论：PASS**（S1 文档生效 52e1f29 PASS+S2 检查器与测试 ff0ab04 PASS+S2 证据登记 67e434d PASS，问题1-4 全关闭）；终检归档=acceptance/ 五输出+MANIFEST
