# steps：b-20261115-v03-activation（WORKFLOW.md v0.3 生效落地）

- 拍板记录：用户 2026-11-15 拍板原话："我同意，你可以与chatgpt讨论"
- 冻结方案要点（规划协商 2 轮达共识后冻结；R1 裁定=修改已全采纳，R2 裁定=同意冻结）：
  - S1 文档生效：WORKFLOW.md 标题去草案注记改已生效；生效状态 blockquote 五要素（生效日期 2026-11-15／v0.3 现行／v0.2 历史对照／批准依据=用户拍板原话／记录位置=requirement.md+交接包 §5）；ACCEPTANCE-CHECKLIST.md 头部补正式生效声明；**不清除**附录历史"草案"记录
  - S2 检查器同步：①a 扩展=标题已生效字面+清单头正式生效声明；①b 精确锚生效状态 blockquote 五要素并负向拒绝旧草案态；①c 保持（附录 12 行）；检查项总数 37 不变；新增 phase0/tools/s4-activation-state-tests.py（负向 3 注入于隔离临时副本+各断言指名拦截：标题回草案／blockquote 回 v0.2 现行／清单声明删除；正向=生效实态全过+附录历史保留仍过）；DV1 6/6 与 negpos 7/7 历史矩阵原样不动；四命令重跑（一致性 37/37＋dv1 6/6＋negpos 7/7＋COMPLETED 包 taskpack Phase=COMPLETED ①-⑥ 全 PASS Overall=PASS）新态输出归档本任务 acceptance/，不覆盖 phase0/tools/s4-*-output.txt 历史存档
  - S3 独立验收交付：ChatGPT 派单独立验收；三文件零修改以 git diff 对照基线核验；ST-01 绑定申报（申报引用从最终归档取值并锁定被测 commit）
- 边界（冻结）：禁改 b-20261115-phasec-workflow-stats 三文件（已 COMPLETED 历史裁定）；DEC-043 inbound_dom.mjs 收集器修复挂 backlog 不动；v0.2 以 Git 历史 commit 为对照（仓库无独立副本，如实表述不虚构）；v0.3 首个日常任务另立独立任务，不混入本任务验收；S1 动工前重核当时 main HEAD/git status/最近提交
- 规划协商证据链：dispatch-2026-11-15T03-31-21（发送双验通过 polls=1，采集 fail-closed=INBOUND_WINDOW_COMPLETENESS_UNPROVEN，DEC-043 家族第 12 次，禁重发）→ recoll_v03act_plan_r1.mjs 静态 DOM 补采 recoll-2026-11-15T03-36-58-729Z（六查全过，reply sha256=14a48dc982f42fa4ab1054c2d59726897714d179406f973bb38b0f8512f1c7ec，6039B，裁定=修改）→ dispatch-2026-11-15T03-39-03（reply sha256=d1fc718c23734e1e42eae1712175ac350e7b292d5acdfb7ee6f72306d53fc046，裁定=同意冻结）。规划材料绑定 commit=8095fa436b047302f2f195a4d563026781086e0d（仅本轮规划绑定）

## S1 文档生效

- ①本步骤目标：WORKFLOW.md 与 ACCEPTANCE-CHECKLIST.md 由草案态转正式生效态（标题+生效状态 blockquote 五要素+清单生效声明），附录历史记录不动
- ②修改文件：basic/WORKFLOW.md、basic/ACCEPTANCE-CHECKLIST.md
- ③修改内容：WORKFLOW.md 标题"（草案，待用户拍板生效）"→"（已生效 2026-11-15）"；生效状态 blockquote 整行改写为五要素（生效日期 2026-11-15 经用户拍板正式生效／为**现行版**／v0.2 保留为历史对照以 Git 历史 commit 为准无独立副本／批准依据=用户拍板原话"同意生效，请给我一句话交接给新的会话完成接下来的工作"／记录位置=tasks/b-20261115-v03-activation/requirement.md+handoff/BASIC-PHASE-C-V03-ACTIVATION-HANDOFF.md §5）；ACCEPTANCE-CHECKLIST.md 头部补生效状态（正式版）blockquote；附录表 12 行与 ST-10/11 段历史"草案"记录保留不动（全文"草案"计数=2 均为历史区）。**待验收 commit 完整 SHA：52e1f298fdbc31000b781ced8d55b9591f10c38b**
- ④执行结果：三处编辑完成；Python 逐项核验（标题含已生效无草案/blockquote 五要素全 True/blockquote 自身无草案态/清单声明/附录历史保留=2）全过；phasec 任务包三文件 diff=0
- ⑤测试结果：一致性检查器①a①b 断言此际仍为草案态（S1→S2 既定中间态，S2 commit 91474c1 后消除，四命令于 S2 全过）
- ⑥验收证据引用：待验收派单后登记

## S2 检查器同步与测试演进

- ①本步骤目标：s4-consistency-check.py ①a/①b 断言随生效态演进（37 项不变），新增 s4-activation-state-tests.py 专项回归，五命令重跑全过并存档
- ②修改文件：phase0/tools/s4-consistency-check.py、phase0/tools/s4-activation-state-tests.py（新增）、basic/tasks/b-20261115-v03-activation/acceptance/（6 个文件新增）
- ③修改内容：①a 改为"v0.3 已生效版本头字面+清单正式生效声明"双断言（标题行精确锚定且无草案字样）；①b 改为生效状态 blockquote 五要素精确锚定并负向拒绝旧草案态（"草案"/"仍为现行版"在 blockquote 行回流即 FAIL）；①c 附录 12 行保持；检查项总数 37 不变。新增专项回归：负向 3 注入（标题回草案→①a 拦截／blockquote 回 v0.2 现行→①b 拦截／清单声明删除→①a 拦截）各指名断言+正向 2（生效实态 37/37／历史草案记录保留仍 37/37），全部注入只作用于内存副本。**待验收 commit 完整 SHA：91474c15e45c51ce87e0c44e3ffe2900b50cea0c**
- ④执行结果：五命令全过退出 0 并归档本任务 acceptance/（一致性 37/37+专项 5/5+DV1 6/6+negpos 7/7+phasec 包 taskpack Phase=COMPLETED ①-⑥ 全 PASS Overall=PASS）；历史存档 phase0/tools/s4-*-output.txt 未覆盖；MANIFEST 首版被测 commit 误取生成时 HEAD（52e1f29），已修正绑定 91474c1 并注明语义，干净树重跑五命令与归档字节一致（IDENTICAL×5）
- ⑤测试结果：同④五命令全过（dv1/negpos 历史矩阵脚本零改动仍全过，验证其断言面=len(ok)==37 与 ⑧ 系列编号不锚 wf 字面）
- ⑥验收证据引用：待验收派单后登记

## S3 独立验收与交付

- ①本步骤目标：ChatGPT 独立验收通过，三文件零修改 git diff 核验，登记交付
- 修改文件：本任务包 delivery.md、handoff.md（交付时）
- ②修改内容：待执行后登记
- ③执行结果：待登记
- ④测试结果：待登记
- ⑤验收证据引用：待验收派单后登记
