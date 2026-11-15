# delivery：b-20261115-v03-lessons-recoll（L-018 键漂移变体与归属校验型补采经验入库，v0.3 首个日常任务）

## 原始需求

见 `requirement.md`（2026-11-15 用户拍板"同意"确认版，一字不改存档）。冻结方案见 `steps.md`（规划协商一轮共识 reply sha256=7aecb6c4…+用户拍板"同意"）。

## 最终实现内容

- **L-018 新增第 4 条**「键漂移与归属校验型定位：reload 后禁止仅凭固定键补采，必须验证本轮归属」：故障现象（reload 后物化键重排，同名字符串指向旧 user）/失败案例（R2 补采采得与 R1 SHA256 全同旧 reply）/修正机制三件套（简报标记文本唯一定位+最后 user 断言+前轮 reply SHA 排除）/验证证据（recoll_v03act_r2b/r3.mjs 七查含 not_prev_reply_sha）；两纪律（定位成功≠归属正确；SHA 全同=归属冲突排除条件）；适用边界（仅限本派单流程实证，不推导为通用规则）。原第 4/5 条顺延为 5/6，外部引用 1 处同步，验证结果行补 2026-11-15 实测。
- **L-014 第 6 条补强**：实战对照表（手工猜端口 3 轮 300s 空转未完成 vs check-push 40s 定位 3260 推送成功 ahead=4→0）+结论句（价值=固化为可重复第一动作；40 秒是实测非 SLA）。
- **WORKFLOW 回填**：「首个真实闭环验证任务节」末尾追加「v0.3 生效后首个日常任务」小段（不覆盖 b-20261114-taskpack-checker 历史；结果与验收行按 R2 复核建议文案回填正式结论）；附录 12 行未动。
- **v0.3 新条款实战（任务核心目的）**：ST-05 每阶段申报前自检（PLANNING/开发/返工/COMPLETED 全程留存输出）；ST-01 绑定申报（被测 commit=240ace69f7a0b3af5ff438a4ec834bcf0f040bd9 明文登记+MANIFEST 五输出 SHA256+生成命令）。

## 修改文件

- docs/AI-DEV-LESSONS.md、basic/WORKFLOW.md、basic/tasks/b-20261115-v03-lessons-recoll/（requirement/task-brief/steps/delivery/acceptance/）
- 过程审计：phase0/tools/（brief_v03ls_*.txt、recoll_v03ls_plan.mjs/recoll_v03ls_r2.mjs）与 phase0/logs/（dispatch-2026-11-15T04-49-05/05-06-08/05-15-02、recoll-2026-11-15T04-52-53-905Z/05-19-14-511Z[误导向现场]/05-20-17-574Z）
- **未改动**：检查器与测试脚本（冻结方案"优先零修改"实测成立）、三个 COMPLETED 任务包、采集工具源码

## 测试结果

四命令最终轮全过退出 0：一致性 37/37+专项 7/7+DV1 6/6+negpos 7/7（归档 acceptance/+ls-MANIFEST.txt，被测 commit=240ace6 绑定）；本任务 taskpack 终检 Phase=COMPLETED（交付 commit 后终检态见 acceptance/ls-taskpack-self.txt 历史+本 commit 后实态）。

## Git commit

- 链：c753084（登记）→43a4692（冻结）→240ace6（S1 被测）→926f7ec（WORKFLOW 用户指令增补①，独立授权）→9eaed62（问题1 补正）→eca034a（返工表）→bcc475f（⑥ 证据链）→本 commit（S2 交付登记）
- 验收绑定：被测=240ace6；R1 reply sha256=071f26de65c8da07661b037e29cf0276d2babc95d92d36b396aecc1c11ed86fb（REJECT 唯一 P1 问题1）；R2 reply sha256=1cf73ed767f049c6d9dd670bf6b443de77a6339544388871103e8ad9f06df557（问题1 关闭+S1 整体 PASS）；审查会话=6af93e42-91e8-83ec-943f-8e312e1b50a0（自 6af90e6f CONTEXT_LIMIT_STOP 迁移接棒）

## 未解决问题

无阻断项。过程如实记录两项：①R2 补采首派漏换 CONV_UUID 指旧会话（L-018 第 3 条检查单+units-diag 当场发现即纠正，recoll 无发送副作用，误导向现场如实归档）——三参数检查单在会话迁移场景仍需人工纪律，策略沉淀挂 backlog；②本任务 ST-05 自检两次出现"先 commit 后自检"顺序颠倒（④ 拦截即修），已作为教训随本交付记录。

## 后续建议

①归属校验型定位（简报标记文本+最后 user 断言+前轮 SHA 排除）沉淀为 recoll 默认策略（挂 backlog，需用户批准范围）；②v0.3 首个日常任务实战验证完成（ST-05/ST-01 走通），后续日常任务按既定流程执行；③DEC-043 收集器修复挂 backlog 不变。
