# S1-R5 限定复验请求：b-20261115-gpt03-review-leg（S1-R4 唯一残留 P2-01 整改后）

## 绑定申报（ST-01，机器预检已过）

- **复验基线：** `50ab1cf53994ff8257332ddce4bf441053c194bd`（S1-R4 派单时 HEAD）
- **待验收 commit（单 commit 申报）：** `bfb779715eb9b81032cb1610e630abe48decac95`
- **绑定核验：** verdict=PASS；R1 区间数=1；R2 线性链首 parent=基线；R4 无后代；numstat=review_leg.py **+32/-9**、test_review_leg.py **+20/0**（整改 diff 恰 2 文件）
- **R4 被测：** `0fed73ad4f9ee69db9364febb09825f257211a1e`；**本请求所在回填 commit 不属验收 diff 范围**（ST-01④）

## R4 裁定与整改对照（严格按 R4"只剩 P2-01 的缺键处置"）

| # | R4 残留 | R5 整改要点 | 核对位置（bfb7797） |
|---|---|---|---|
| 1 | P2-01：缺键时 target_matches_sent_key 非布尔（None）且无 fail-closed 证明 | ①自动路径（run/resume）：无发送锚点或采集定位键缺失→**OrchestrationError(4) fail-closed**（None 绝不视为已完成交叉核验）；②attach-reply 人工路径（本腿未发送）→显式登记字符串状态 `not_applicable_no_leg_send_anchor (manual attach path)`；③target_matches_sent_key 取值域=布尔或显式状态串，**绝无 None**；④resume 重读源改账本 R4_REPLY_CAPTURED.source_dir（原采集现场快照在位，保证自动路径交叉核验可执行）；⑤**反例 test_16b**：自动路径无锚点→拒（fail-closed），attach 路径→放行且入账 not_applicable | review_leg.py `r4_capture_and_validate`/`_resume_register`/`attach_reply`；test_16b |

## 回归证据

- test_review_leg.py **23/23 PASS**（33.6s；新增 test_16b；08c/09/09b 等恢复链回归通过——其 resume 现经 source_dir 原现场重读，交叉核验真实执行）
- 未触碰红线：scheduler.py/M1-M4/M2 工具链/契约文件零修改（diff 恰 2 文件佐证）；此前已关闭项（P1-01/P1-02/NEW-P1-01/NEW-P1-02/P2-02/P2-03）证据保留未动

## 请验收方执行（限定复验范围）

①P2-01 关闭核验：缺键 fail-closed 路径、not_applicable 显式登记、取值域无 None；②test_16b 反例有效性；③resume source_dir 重读不引入新缺陷（23 用例含恢复链回归）；④范围复核（2 文件零越界）。

**回执格式：** ①-④逐项+P2-01 判定（关闭/未关闭）+总结论（PASS/REJECT+新问题编号）。
