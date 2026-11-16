# 交付记录：b-20261116-gpt02-arch-review-leg

## 1. 交付概览

| 项 | 值 |
|---|---|
| 立项链 | DEC-026 → charter v0.3（DEC-067 Gate1+Gate2 闭环）→ Gate3 用户拍板（DEC-087：确认原文+批准开工，2026-11-16） |
| 立项契约 | contracts/v1.0/arch-review-report.schema.json（Gate3 后落位冻结，与草案逐字段一致 PASS；草案文件保留为立项历史） |
| 交付物 | phase1/tools/arch_review_leg.py（新增 1226 行）+review_leg.py 参数化（唯一修改点，+14/-7）+test_arch_review_leg.py（723 行 25 用例）+test_review_leg.py 适配（3 行，语义不变） |
| 验收模式 | A1~A7 验收矩阵（charter §7）+零 mock 实战+独立验收派单链 |
| 授权边界 | 开工授权≠合并授权（DEC-010）；M1-M4 零修改；H2 契约冻结（既有文件零修改） |
| 绑定申报 | C1 工具机器核验 **PASS**（R2 线性链/R4 终态；baseline=5b2cc461f990680c64e00d7c4950b2bdcbf42870，target=77318daba69eb9065ccf36f0b02d23f74e7bb005，报告 acceptance/binding-report.json） |

## 2. 阶段验收链（S1-S3+实战+整改，步骤级记录见 steps.md）

- **S1 设计（PASS）：** charter §3 决策点裁定=最小参数化复用（方案 C+，acceptance/design-notes.md 含 GPT-03→GPT-02 差异对照表/白名单口径/风险清单）。
- **S2 实施（PASS）：** A0-A5 编排+A-3 九行恢复+attach 人工退路+setup-agents bootstrap；红线核对（M1-M4/scheduler/冻结契约零修改、1200B、秘密不入 Git）。
- **S3 测试与实战（PASS）：** 25 用例矩阵（A1~A7+负例+问题14 整改证明 test_17~20）+29 用例 GPT-03 回归，双矩阵合跑 54/54 OK（acceptance/test-run.txt）；零 mock 实战全链（见 §3 实战）。
- **实战+整改（REWORK→已修）：** GPT-02 真实审核四条 P1（返工表问题14）→整改 commit 77318daba69eb9065ccf36f0b02d23f74e7bb005。

## 3. 证据路径索引（事实）

- **立项：** charter=docs/phase1/GPT02-ARCH-REVIEW-LEG-CHARTER-DRAFT.md v0.3（77ff794）；Gate 复审现场 dispatch-2026-11-15T22-*；Gate3 拍板=DEC-087。
- **契约：** contracts/v1.0/arch-review-report.schema.json（本轮落位）。
- **测试：** acceptance/test-run.txt（54/54，2026-11-17 实测 exit=0）；test_arch_review_leg.py 25 用例清单=A1 正常轮/A2 REWORK/A3 采集失败恢复+禁重发计数/A4 幂等重放/A5 路线 B 续推+A-3 终态/A6 attach 三态/A7 BLOCKED 仅登记/白名单越权/契约失败/简报超限/材料锚定/INTENT-only/确认缺键/发送失败限一次/setup 幂等/问题14 证明×4。
- **零 mock 实战（921001/T-P1-001）：** 真实 M1 8001（独立 DB runtime/arch-leg-20261117/，秘密 gitignored）；真实派单 dispatch-2026-11-16T16-32-20（简报 918B、材料锚定 d0eb87ecb1d00f190d9d2129ae78db250837b35c=GitHub 已推送、会话 6afb304c-37d8-83ee-8d7f-09a1471c7547、回复 4633B）；GPT-02 真实结论 **REWORK**（四条 P1=返工表问题14）；契约校验 fail-closed 真拦截（findings 格式错位，raw 保留）；A6 人工退路内容保真规整（loss=NONE）→artifacts×2+message 登记→REWORK 推进；**M1 终态=REWORK**；账本 14 条+report.json（brief_sha256=a74fb9b2…/manifest=116a39bb…）随 runtime 归档，账本复制件见任务包后续验收登记。
- **整改：** 整改 commit=77318daba69eb9065ccf36f0b02d23f74e7bb005（P1-01 归属强制断言/P1-02 OS 级字节锁+现场精确定位/P1-03 artifact 409 特化+201 duplicate 自然恢复/P1-04 事件独立双证核验）；证明用例 test_17~20。
- **测试替身事故（如实登记）：** 首轮/二轮测试期夹具 BUG（BLOCKED 事件字段 422）致 resume 漏真实派单 2 次（dispatch-2026-11-16T16-08-26/16-11-53，回复均 BLOCKED 无敏感信息）→整改=全局零 mock 守卫+夹具修复（d0eb87e）。
- **绑定核验：** acceptance/binding-report.json（C1 PASS）。

## 4. ST-05 自检记录

- IN_PROGRESS 期：多轮自检（含返工表三方关联修正），终态前无 FAIL 缺口。
- COMPLETED 态：验收链 PASS 后重跑取证（另行落盘 acceptance/st05-completed.txt）。

## 5. 范围与授权边界

- 未修改：app/（M1-M4）、contracts/ 既有冻结文件、phase1/tools/scheduler.py、review_leg.py 已验收行为（29 用例回归全绿为硬门槛，实测三次）。
- 遗留登记：①契约演进待办=arch-review-report findings 结构化（Gate2 定稿与角色规范真实输出错位，本轮人工保真规整过渡，正式演进走 H2 流程）②review_leg.py 的同类并发锁缺口（问题14 P1-02 同族）登记为后续待办，本任务不扩大范围。

## 6. 交付索引（§3 对账）

| 提交 | 内容 | 归属 |
|---|---|---|
| 0e37ccf020adb4456bf77df3fce58c399f2ab2bd | 开工登记（DEC-086/087+契约落位+四件套） | 立项与开工 |
| 5f1d1586cb1f915639743620556be8dc08f9c754 | S1-S3（实现+测试矩阵+事故整改） | 实施 |
| d0eb87ecb1d00f190d9d2129ae78db250837b35c | 零 mock 守卫整改（漏派事故） | 测试纪律 |
| 7377cec77359a932f62405b579df6219f9fbaaa4 | 零 mock 实战全链登记 | 实战 |
| 77318daba69eb9065ccf36f0b02d23f74e7bb005 | 问题14 四条 P1 整改+证明用例 | 整改（被测对象=arch_review_leg.py 最终态） |
| （本轮验收登记提交） | delivery 回填+验收简报归档 | 交付闭环 |

**被测对象（ST-01 绑定申报）=77318daba69eb9065ccf36f0b02d23f74e7bb005**（C1 机器核验 PASS）。
