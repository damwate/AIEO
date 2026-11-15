# steps：b-20261115-basic-dod（Basic 产品级完成标准 DoD 固化）

- 方案冻结记录：规划协商 R1 裁定"修改后同意"（reply sha256=b01107a3a234acfecf7a96a12a25982f78fc3a607a7ed18d5df1fd9b905b5612），要点全采纳：四要素结构+状态定义表（PASS/FAIL/BLOCKED/未验证）/BC-03=BLOCKED 标 G5 未验证不包装/BC-06=FAIL（零代码类实战）/BC-12=BLOCKED+独立六步签核流程/双口径统计（历史实战 7 包 vs 当前目录 8 包，统计截止点规则）/12 条主体不增不减+逐条定向修订/三处落位（dod 文件+review-request 修正+decision-log 澄清）；"修改后同意"不是预验收，文档成文后仍需 ChatGPT 复审；**DoD 文档验收 PASS≠Basic 整体完成**
- 规划协商证据：dispatch-2026-11-15T09-47-02（fail-closed）→recoll_dod_plan.mjs 补采 recoll-2026-11-15T09-49-56-724Z（reply sha256=b01107a3…b5612）。规划材料绑定 commit=61fe67b

## S1 DoD 文档成文与统计口径修正

- ①本步骤目标：docs/phase1/basic-completion-dod.md 成文（12 条四要素+状态定义+双口径统计+BC-12 签核流程）；review-request 计数修正；decision-log 澄清
- ②修改文件：docs/phase1/basic-completion-dod.md（新增）、docs/phase1/basic-completion-review-request.md（计数修正）、basic/tasks/b-20261115-basic-dod/
- ③修改内容：DoD 文件成文（12 条四要素+四态状态定义+双口径统计头部+BC-12 六步签核流程+完成路径表；BC-03=BLOCKED/BC-06=FAIL/BC-12=BLOCKED 如实标注）；review-request 计数修正（双口径）；DEC-051 澄清条目登记。**待验收 commit 完整 SHA：7141e81294926e728bb39ff44fa4f1512d52f238（S1 DoD 成文+统计口径修正，内容定格）**
- ④执行结果：三处增补/成文完成；验收链 3 轮闭环（见⑥）
- ⑤测试结果：四命令全过退出 0（37/37+DV1 6/6+negpos 7/7+专项 7/7，检查器零修改）
- ⑥验收证据引用：R1 验收=dispatch-2026-11-15T10-14-32（reply sha256=971ca1f5826e18e04ae2d07db1822caac143c7af9c10efa452978b141406278b，REJECT 2 项[问题1=BC-10 状态未更新/问题2=recoll 脚本越界]）→R2 复验=dispatch-2026-11-15T10-26-18（reply 5ccdc8f9…ade80a1，P1-01 关闭，P1-02 驱动归档未完成）→归档 a81a8f8→R3 复验=dispatch-2026-11-15T10-31-11（reply sha256=ecc57a9b85452d356e06c1b26a41c1b6b5348015619f31812fa9b320f4450ca7，**S1 验收结论：PASS**，问题1/问题2 关闭，回执 sha256=f256c4fa…cd33）

## 返工记录表（首次 REJECT 时建表）

| 问题编号 | 轮次来源 | 问题描述 | 整改内容 | 修复 commit | 验证 |
|---|---|---|---|---|---|
| 问题1 | R1 验收 REJECT P1-01 | BC-10"当前状态"仍为 FAIL，但三项统计口径修正已随本次交付落地（状态与实际交付不一致） | BC-10 改"PASS（初判，统计口径修正已落位）"，历史笔误保留于判定说明 | b4962722c8be214502afe38e15c42e94fe3181c2 | R2 复验关闭确认（reply 5ccdc8f9…） |
| 问题2 | R1 验收 REJECT P1-02 | phase0/tools/recoll_dod_plan.mjs 新增工具脚本越界（冻结"不动工具代码"）；R2 复验进一步指出本任务补采驱动 recoll_dod_acc.mjs 也留工具目录 | recoll_dod_plan.mjs git rm 剥离（历史可溯 64e9988）+recoll_dod_acc.mjs git mv 归档至任务包 acceptance/（a81a8f8）；纪律=今后一次性补采驱动一律归档各任务包 acceptance/ | b4962722c8be214502afe38e15c42e94fe3181c2+a81a8f80cf58b26430944f74198f20eecc61a0ce | R3 复验关闭确认（reply ecc57a9b…） |

## S2 独立验收与交付

- ①本步骤目标：交付登记（S1 验收已 PASS）
- ②修改文件：本任务包 delivery.md、task-brief（完成态）、steps（本登记与返工表）
- ③修改内容：delivery.md 七要素成文；task-brief 转完成态；返工表与证据链登记
- ④执行结果：任务 COMPLETED（BC-01~12 DoD 成文+双口径统计修正交付；BC-03/06/12 硬约束如实保留）
- ⑤测试结果：四命令全过（同 S1）
- ⑥验收证据引用：验收派单链=phase0/logs/dispatch-2026-11-15T10-14-32（R1）+phase0/logs/dispatch-2026-11-15T10-26-18（R2）+phase0/logs/dispatch-2026-11-15T10-31-11（R3）；**S1 验收结论：PASS**（R3 reply sha256=ecc57a9b85452d356e06c1b26a41c1b6b5348015619f31812fa9b320f4450ca7，问题1/问题2 关闭）；交付登记 commit=本 commit
