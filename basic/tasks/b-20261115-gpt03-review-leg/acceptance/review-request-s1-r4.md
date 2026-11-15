# S1-R4 限定复验请求：b-20261115-gpt03-review-leg（S1-R3 REJECT 两项整改后）

## 绑定申报（ST-01，机器预检已过）

- **复验基线：** `56b18f79aeabcd33875be5d06901108b5f315955`（S1-R3 派单时 HEAD）
- **待验收 commit（单 commit 申报）：** `0fed73ad4f9ee69db9364febb09825f257211a1e`
- **绑定核验：** verdict=PASS；R1 区间数=1；R2 线性链首 parent=基线；R4 无后代；numstat=review_leg.py **+24/-7**、test_review_leg.py **+23/0**（整改 diff 恰 2 文件）
- **R3 被测：** `c081086ee4a98d430632566ca066b565ec4eac83`；**本请求所在回填 commit 不属验收 diff 范围**（ST-01④）

## R3 裁定与整改对照（严格按 R3"下一轮仍限定上述两项"，无范围扩大）

| # | R3 未关闭项 | R4 整改要点 | 核对位置（0fed73a） |
|---|---|---|---|
| 1 | NEW-P1-02：report 409 正则捕获组未与本方 reviewed_commit 比较 | `_report_key_evidence` 改实例方法：捕获组 == self.reviewed_commit[:12] **精确相等**，不匹配 fail-closed；**反例 test_16**：错 commit 前缀拒/错 execution 拒/正例放行 | review_leg.py `_report_key_evidence`；test_16 |
| 2 | P2-01 残留：三时点计数证据分级与键交叉未落实 | ①evidence_class 如实分级：pre_send=`presumed`（new-session 构造性，注明 no pre-read）/at_send=`presumed-pinned`（单发+双验锚定键，注明 count not read at send time）/at_capture=`materialized`（实读）；②`target_matches_sent_key` 实做：R4 落账时从账本发送锚点（SEND_CONFIRMED/COLLECT_FAILED）取 sent_key 与 located_key 实比，布尔入账；③source 改指实际计数文件（materialized_source=units-diag.json/raw-units.json） | R3/R4 记录字段；test_08c 断言强化 |

P1-01（409 双证）随 NEW-P1-02 修复闭合（R3 已确认结构化匹配方向正确，唯捕获组比对缺失）。

## 回归证据

- test_review_leg.py **22/22 PASS**（27.5s；新增 test_16 反例，08c 断言强化，其余回归通过）
- 未触碰红线：scheduler.py/M1-M4/M2 工具链/契约文件零修改（diff 恰 2 文件佐证）；P2-02/P2-03/P1-02/NEW-P1-01 通过证据保留未动

## 请验收方执行（限定复验范围）

①NEW-P1-02 关闭核验（捕获组精确比对+反例 test_16）；②P1-01 409 双证整体重验（R3 已认可方向+本轮补全）；③P2-01 关闭核验（分级如实/键交叉实做/source 指认正确）；④整改未引入新缺陷（22 用例）；⑤范围复核（2 文件零越界）。

**回执格式：** ①-⑤逐项+两项逐项判定（关闭/未关闭）+总结论（PASS/REJECT+新问题编号）。
