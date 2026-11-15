# S2-R2 限定复验请求：b-20261115-gpt03-review-leg（S2-R1 六项整改后）

## 绑定申报（ST-01）

- **复验基线：** `6d39ff97ead78bf56b457f2198b9089f81c32295`（S2-R1 被测 commit）
- **整改代码 commit：** `2be8b01fc44bf0f41581ca28226404f28d9f464c`（review_leg.py +17/-7、test_review_leg.py +254/-2、两个 A5 实验脚本入档）
- **证据归档：** acceptance/evidence-s2/（103 件+MANIFEST.json 全 SHA256，见归档 commit）
- **待验收 commit=当前回填后 HEAD**（ST-01 区间核验见 steps.md ⑥；回填 commit 不属验收 diff 范围，ST-01④）
- **S2-R1 被测锚点：** `6d39ff97…`；**S2-R1 裁定 reply sha256=a5f15e6dec575232…**（经 fail-closed 补采 v4 取证，正确会话 6af9dbf2）

## 六项整改对照

| # | R1 问题 | 整改要点 | 复验核对位置 |
|---|---|---|---|
| 问题11/P1-01 | attach 放行范围扩大 | 回缩：confirmed-send 存在且键缺失→**即便 attach 也 fail-closed**；仅纯发送失败后 attach 才显式 not_applicable；反例 test_16c（场景A 拒/场景B 放行） | review_leg.py r4 交叉核验段；test_16c |
| 问题12/P1-02 | A5① 断点形态不符 | **真实现场补做**（918012/T-P1-026）：发送双验 polls=2→kill 时 reply 未落盘→resume A8 fail-closed→人工核查（run.log+CDP 页面 URL 取证会话 6af9e82c）→MANUAL_LEDGER_REPAIR 升级 CONFIRMED（备份保留）→resume **真实原会话补采**（marker 定位七查全过）→补登记→T-P1-026 推进 TEST_ACCEPTANCE，全程零重发；配套修复 NEW-01（补采驱动落盘 PHASE0_TOOLS 修 playwright 解析） | evidence-s2/ledger/rvl-918012-*；918012 账本全链 |
| 问题13/P1-03 | 证据链未归档 | 103 件入 Git（六轮账本 34+dispatch 46+recoll 18+A3 probe 4+M1 只读导出+MANIFEST） | evidence-s2/MANIFEST.json |
| 问题14/P2-01 | A3 等价性缺口 | 长会话天然现场增补第 4 组（S2 验收轮 fail-closed 同错误码→禁重发→补采恢复）；累计天然 4 组+构造双形态 | evidence-s2/a3-probe/、recoll/ |
| 问题15/P2-02 | A7 未真实进程中断 | test_17：runner 子进程 os._exit(9) 于 GIT_VALIDATE 响应后（M1 已提交、客户端死）→**全新子进程** resume 接续→task_events 同 event_id 恰 1 条→推进 | test_17 |
| 问题16/P2-03 | A5② 缺独立进程重启 | test_18：runner 采集完成后 os._exit(9)→全新子进程 resume 仅补登记（report/message 各 1）→零重派→推进 | test_18 |

## R2 期间真实审查轮增补（第六~四个落档任务）

- 918010/T-P1-023：真实 REWORK（reply 807B sha256=40b2cafdb4004d21…）
- 918011/T-P1-024：真实 PASS→TEST_ACCEPTANCE（reply 349B，dispatch-2026-11-15T16-59-57 artifact_sha256=9298921f…）
- 918012/T-P1-026：A5① 断点恢复轮，真实 PASS→TEST_ACCEPTANCE（reply 322B sha256=0f323ef28dbb689f…）

## 回归证据

- test_review_leg.py **26/26 PASS**（含新增 test_16c/test_17/test_18；34.1s）
- 未触碰红线：scheduler.py/M1-M4/M2 工具链/契约文件零修改

## 请验收方执行（限定复验范围）

①问题11：attach 回缩正确性+test_16c 反例；②问题12：A5① 现场（918012 账本+归档证据+零重发证明）；③问题13：证据归档完整性（MANIFEST 103 件 SHA256 可抽验）；④问题14：A3 四组现场+构造形态论证充分性；⑤问题15/16：test_17/18 真实进程重启语义（runner=os._exit 现场不落终态；resume=全新子进程）；⑥回归与范围（26 用例；2 文件+归档，零越界）。

**回执格式：** ①-⑥逐项+六问题逐项判定（关闭/未关闭）+总结论（PASS/REJECT+新问题编号）。
