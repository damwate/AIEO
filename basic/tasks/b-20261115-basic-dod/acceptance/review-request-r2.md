# 验收复验请求：b-20261115-basic-dod S1（新会话专用，一次说清）

## 背景（30 秒版）

- 任务：Basic 产品级 DoD 固化（BC-01~BC-12 成文）。
- 方案冻结：规划 R1 裁定"修改后同意"（reply sha256=b01107a3a234acfecf7a96a12a25982f78fc3a607a7ed18d5df1fd9b905b5612），节点自主推进授权（WORKFLOW 增补②）。
- S1 被测 commit=7141e81294926e728bb39ff44fa4f1512d52f238（DoD 文档+统计口径修正）。
- R1 验收裁定=REJECT 2 项（reply sha256=971ca1f5826e18e04ae2d07db1822caac143c7af9c10efa452978b141406278b）：P1-01 BC-10 状态未更新／P1-02 recoll 脚本越界。其余全部 PASS（BC-03/06/12 状态正确、双口径、六步签核、57:57 测试、31 项清单未改）。
- 整改 commit=**b4962722c8be214502afe38e15c42e94fe3181c2**（P1-01；首轮复验 reply sha256=5ccdc8f9ae65fad100a51dc3815902be5b4f3cbf2e7b003beabbd5e07ade80a1 确认 P1-01 关闭）。
- **P1-02 追加整改**：首轮复验（reply sha256=5ccdc8f9…ade80a1）指出本任务补采驱动 recoll_dod_acc.mjs 仍在工具目录——已按"归档至任务包 acceptance/"纪律 git mv（归档 commit=**a81a8f80cf58b26430944f74198f20eecc61a0ce**，本轮复验对象）。

## 本轮复验范围（只此两处）

1. **P1-01**：`docs/phase1/basic-completion-dod.md` BC-10 条"当前状态"已由 FAIL 改为 **PASS（初判，统计口径修正已落位）**——三项修正（双口径头部规则／review-request 计数修正／DEC-051 澄清）均已随本次交付落地；历史笔误保留于判定说明。
2. **P1-02**：`phase0/tools/recoll_dod_plan.mjs` 已 **git rm 剥离**（脚本历史可溯 commit 64e9988）；本任务补采驱动 recoll_dod_acc.mjs 亦已归档至本目录（a81a8f8）——工具目录不再承载本任务任何驱动（纪律=今后一次性补采驱动一律归档各任务包 acceptance/）。

## 复验材料（按 commit b4962722c8be214502afe38e15c42e94fe3181c2 读）

- `docs/phase1/basic-completion-dod.md`（BC-10 条）
- `git log --diff-filter=D` 或 `git show b496272 --stat`（确认脚本剥离）

## 请求结论

三态：**PASS**（两项关闭+S1 文档固化验收结论）／REJECT（列具体项）／BLOCKED。回执请附结论表与 reply SHA256。
边界提醒：即使 S1 PASS，也只代表 DoD 文档固化验收通过，不代表 Basic 初级版整体完成（BC-03/06/12 硬约束继续有效）。
