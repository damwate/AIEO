# S2-R4 限定复验请求：b-20261115-gpt03-review-leg（S2-R3 四限定项整改后）

## 绑定申报（ST-01）

- **复验基线：** `6d39ff97ead78bf56b457f2198b9089f81c32295`（不变）；**待验收=当前回填后 HEAD**
- **区间=6 commit（至 030c947）+本轮 2 commit（afc1ee1 整改/归档+回填）**——ST-01 区间核验=6d39ff9..HEAD count=8；整改代码 commit=fdba15c/0c5642d/afc1ee1，回填 commit 不属验收 diff（ST-01④）
- **S2-R3 裁定 reply sha256=f1ab60a927592f23…**（经 fail-closed 补采 recoll-2026-11-15T18-37-33-989Z）

## 四项限定整改对照

| # | R3 问题 | 整改要点 | 核对位置 |
|---|---|---|---|
| NEW-P1-03（问题19） | 账本修复证据未入树 | 归档补齐 4 件：918012 修复版主账本（原始 INTENT 保留+MANUAL_LEDGER_SUPERSEDE 追加=追加式纪律恢复）+污染版快照+人工修复前备份+918013 孤儿 run 账本（同口径追加式补账） | evidence-s2/ledger/rvl-918012-*（修复版/polluted/bak 三件）+rvl-918013-ledger.jsonl |
| NEW-P2-01（问题20） | 归档校验未绑定 Git blob | MANIFEST 全量 108 条按 **git-blob 字节**重算 bytes+SHA256（sha_basis=git-blob-bytes post-commit normalization；CRLF/LF 差异消除）+新增 29/29 运行记录 | evidence-s2/MANIFEST.json（blob_bound=true 全量） |
| NEW-P2-02（问题21） | 区间 count=3 与 Compare 6 不一致 | steps 问题21 行修正=**6d39ff9..申报HEAD 共 8 commit**（含本轮 2）；逐 commit 列举+整改代码/回填分类说明；R3 申报即已改 6d39ff9 基线（Compare 6 一致获认可） | steps.md 返工表问题21 行；本申报 ST-01 段 |
| NEW-P2-03（新） | INTENT+FAILED 真实序列被误判不确定 | intent_only 判定排除 failed_send_exists（先判失败终态）；反例 test_16e（INTENT→FAILED 并存+attach→显式 not_applicable 放行） | review_leg.py r4 交叉核验段；test_16e |

## 回归证据

- test_review_leg.py **29/29 PASS**（新增 test_16e；test-run-s2r3b.txt 全文归档）
- 零越界：scheduler.py/M1-M4/M2 工具链/契约文件零修改

## 请验收方执行（限定复验范围）

①NEW-P1-03：四件账本证据在树+追加式纪律对应（原始保留/追加 supersede/污染快照）；②NEW-P2-01：MANIFEST blob 绑定（抽验 SHA256+bytes=git blob）；③NEW-P2-02：区间口径终版确认（6+2 逐 commit 分类）；④NEW-P2-03：INTENT+FAILED 放行修复+test_16e 反例；⑤回归 29/29+范围零越界。

**回执格式：** ①-⑤逐项+四问题逐项判定（关闭/未关闭）+总结论（PASS/REJECT+新问题编号）。
