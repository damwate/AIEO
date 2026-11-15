# delivery：b-20261115-v03-activation（WORKFLOW.md v0.3 生效落地）

## 原始需求

见 `requirement.md`（三段原文一字不改：用户 2026-11-15 拍板原话"同意生效，请给我一句话交接给新的会话完成接下来的工作"+本会话开工指令+阶段 C delivery 后续建议①执行依据）。执行者理解与验收目标见 `task-brief.md`；冻结方案见 `steps.md`（用户拍板"我同意，你可以与chatgpt讨论"）。

## 最终实现内容

- **S1 文档生效（PASS，被测 52e1f298fdbc31000b781ced8d55b9591f10c38b）**：basic/WORKFLOW.md v0.3 草案态转正式生效态——标题"（草案，待用户拍板生效）"→"（已生效 2026-11-15）"；生效状态 blockquote 五要素（生效日期 2026-11-15 经用户拍板正式生效／为现行版／v0.2 保留历史对照以 Git 历史 commit 为准无独立副本／批准依据=用户拍板原话／记录位置=requirement.md+交接包 §5）；basic/ACCEPTANCE-CHECKLIST.md 头部补正式版生效声明；附录表 12 行与 ST-10/11 段历史"草案"记录保留不动。
- **S2 检查器同步与测试演进（PASS，最终待验收 ff0ab04f59bc1b9de9788812a97ee152a160b4d9）**：s4-consistency-check.py ①a/①b 断言随生效态演进（①a=已生效版本头字面+清单头部区生效声明定位；①b=blockquote 五要素精确锚定+交接包路径+§5 并负向拒绝旧草案态；检查项数 37 不变；①c 附录 12 行保持）；新增 s4-activation-state-tests.py 生效态专项回归（负向 5 注入各指名拦截+正向 2，内存副本隔离注入）；DV1/negpos 历史矩阵脚本零改动仍全过；证据包 MANIFEST 双 SHA 绑定（被测代码 ff0ab04+被测文档基线 52e1f29）+五条生成命令+IDENTICAL×5 复跑证据（S2 证据登记 67e434d3515da2d5f5a959e2fe974c8d43afe54e PASS）。
- **S3 独立验收与交付（本文件）**：R1 合并验收轮 REJECT 3 项[问题1/2/3]→整改→R2 复核问题1/2 关闭+问题3 证据版本错位澄清+问题4（范围）提出→R3 复核 PASS（问题3 关闭+问题4 范围裁定通过+S1 PASS+S2 PASS）。验收链 reply SHA256：R1=a9e3059b…（recoll-2026-11-15T04-16-08-180Z）/R2=2986a76b79190e5b55a20eca43bd31b7731577815e72e1478bd97471183be046（recoll-2026-11-15T04-33-01-640Z）/R3=2f09f5ceb5608b89dadab9ede87d85867bd8c45ebb14da70e3c4875ad638ce6e（recoll-2026-11-15T04-41-21-287Z）。
- **过程如实记录**：①R1 轮 recoll_v03act_r2.mjs 固定键补采误得 R1 旧 reply（SHA 与 R1 全同=L-018 键漂移变体），即发现即弃用，改归属校验型驱动（简报文本唯一定位+最后 user 断言+前轮 SHA 排除），误采集现场如实归档；②S2 ⑥ 登记时 R2 reply SHA 后 48 位曾误填，经磁盘重算即发现即纠正为真实值；③执行会话网络故障时未先查既有经验（L-014/L-016+environment-inventory）而手工猜端口空转 3 轮，经用户指正后按固化工具 check-push 解决并入库 L-014 第 6 条（b1bdbe6，用户直接指令并行工作，R3 裁定独立授权不计入本任务被测）。

## 修改文件

- basic/WORKFLOW.md（S1）、basic/ACCEPTANCE-CHECKLIST.md（S1）
- phase0/tools/s4-consistency-check.py（S2 整改）、phase0/tools/s4-activation-state-tests.py（S2 新增+整改）
- basic/tasks/b-20261115-v03-activation/（requirement/task-brief/steps/delivery/acceptance/ 证据包）
- phase0/tools/（brief_v03act_*.txt 派单简报、recoll_v03act_*.mjs 补采驱动、clear_composer_draft.mjs v2.1 preview+--force）与 phase0/logs/（dispatch-2026-11-15T03-31-21/03-39-03/04-12-06/04-25-05/04-37-33、recoll-2026-11-15T03-36-58-729Z/04-16-08-180Z/04-29-58-641Z/04-33-01-640Z/04-41-21-287Z）=过程审计材料
- 独立授权 commit：b1bdbe6cea77a56ab783c9ae511aff07d3f4a0c5（docs/AI-DEV-LESSONS.md L-014 第 6 条+phase0/environment-inventory.md §4，用户直接指令）
- **未改动**：b-20261115-phasec-workflow-stats 三文件（git diff 全程零改动，验收方两轮独立核验）、DV1/negpos 测试脚本、v0.2（Git 历史对照）

## 测试结果

五命令最终轮全过退出 0（归档 basic/tasks/b-20261115-v03-activation/acceptance/，MANIFEST 含 SHA256）：①一致性 37/37 ②专项回归 7/7（负向 5[NT1 标题回草案/NT2 blockquote 回旧态/NT3 清单声明删除/NT4 交接包引用删除/NT5 声明移出头部，各指名拦截]+正向 2）③DV1 6/6 ④negpos 7/7 ⑤phasec 包 taskpack Phase=COMPLETED ①-⑥ 全 PASS Overall=PASS；干净树重跑与归档字节一致（IDENTICAL×5）。ST-05 申报前自检：①②④⑤ PASS、③ N/A（2 步完整 PASS+S3 未到期）、⑥ N/A（COMPLETED 时检查）。

## Git commit

- 登记链：8095fa4（任务登记）→615174d（规划共识+拍板冻结）→52e1f29（S1）→91474c1（S2）→d7d33d5（S1/S2 登记）→b1bdbe6（lessons，独立授权）→ff0ab04（R1 整改）→67e434d（MANIFEST v2+返工表）→d495bc1（R2 登记）→d654fef（问题4 编号化）→本 commit（S3 交付登记）
- 验收裁定绑定：S1=52e1f29 PASS／S2=ff0ab04 PASS／S2 证据登记=67e434d PASS（R3 reply sha256=2f09f5ceb5608b89dadab9ede87d85867bd8c45ebb14da70e3c4875ad638ce6e）

## 未解决问题

无阻断项。备忘：①DEC-043 inbound_dom.mjs 收集器修复仍挂 backlog（本轮 DEC-043 家族#12/13/14 三次 fail-closed 均按 L-018 补采恢复，其中#14 键漂移变体催生归属校验型驱动 recoll_v03act_r2b/r3.mjs）；②gpt_dispatch 固定键补采在会话增长+reload 场景下的键漂移问题，建议后续将归属校验型定位（简报标记文本定位）沉淀为 recoll 默认策略（挂 backlog，不入本任务范围）。

## 后续建议

①v0.3 已生效（本任务交付），按交接包 §6/开工指令启动 v0.3 首个日常任务=实战验证（低风险文档类，ST-05/ST-01 申报前自检+绑定核验，结果登记回 WORKFLOW「首个真实闭环验证任务节」）；②归属校验型 recoll 定位策略沉淀（见未解决问题②）；③阶段 C 统计基线可作中级版工作流设计输入（承 phasec delivery 建议③）；④DEC-043 收集器修复挂 backlog（承 phasec delivery 建议④）。
