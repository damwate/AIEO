# S2-R3 限定复验请求：b-20261115-gpt03-review-leg（S2-R2 五项新问题整改+会商裁定执行）

## 会商裁定（本轮依据，会商轮不占返工计数）

- **会商现场**：dispatch-2026-11-15T18-03-38 → 补采 recoll-2026-11-15T18-06-17-932Z（reply 6356B sha256=659141690aef684f25c497be66b3dbfd7c4a0f2c4146e0705fb31b6043cd428a）
- **裁定**：乙方案采用（A5① 组合证据验收，停止消耗真实派单）+丙口径修正（组合证据不得表述为一次真实派单现场完整捕获）；甲不采用
- NEW-P1-02 按组合证据整改复验；NEW-P1-03 进入限定复验（不自动关闭）；NEW-P1-01 按原范围处理；已关闭项不重开

## 绑定申报（ST-01）

- **复验基线：** `6d39ff97…`（S2 整改区间统一基线=6d39ff97ead78bf56b457f2198b9089f81c32295，NEW-P2-02 口径修正后）
- **待验收 commit=当前回填后 HEAD**；整改代码 commit=fdba15c2f9f3d8fb70092766778d34d6d114d542（NEW-P1-01+反例）+0c5642d9152012a2fc9f6c3196ba393efbc58a4c（test_19+公共件+归档）
- 本请求所在回填 commit 不属验收 diff 范围（ST-01④）

## 五项新问题整改对照

| # | R2 新问题 | 整改要点 | 核对位置 |
|---|---|---|---|
| NEW-P1-01（问题17） | INTENT-only+attach 绕过 | INTENT-only（无 confirmed 无 FAILED 终态）→**即便 attach 也 fail-closed**（"send state uncertain"）；反例 test_16d | review_leg.py r4 交叉核验段；test_16d |
| NEW-P1-02（问题18） | A5① 进程终止证明缺失 | **会商乙方案组合证据**：test_19=runner 独立进程于发送确认后采集前（账本状态事件 CONFIRMED 有/R4 无）os._exit→tasklist 独立死亡验证（runner 自报 PID）→**全新子进程** resume 走补采→补登记→推进（零重派）；丙口径=组合证据声明写入断言注释与快照 | test_19；test_runner_common.py |
| NEW-P1-03（问题19） | 918012 账本改写 | 追加式审计修复：主账本恢复备份原样+尾部追加 MANUAL_LEDGER_SUPERSEDE；污染版快照归档；918013 孤儿 run 同口径 | evidence-s2/ledger/rvl-918012-* |
| NEW-P2-01（问题20） | 测试运行记录缺 | 双份完整运行输出归档（test-run-s2r3.txt+confirm.txt，28/28×2）+MANIFEST 登记 | evidence-s2/test-run-* |
| NEW-P2-02（问题21） | 区间口径混乱 | 统一=6d39ff9..HEAD（count=3）；bfb7797 系 S1-R5 锚点非本区间基线；本申报即按修正口径 | 本申报+steps.md ⑥ |

## 回归证据

- test_review_leg.py **28/28 PASS ×2 次运行**（test-run 双份归档；新增 test_16d/test_19）
- 未触碰红线：scheduler.py/M1-M4/M2 工具链/契约文件零修改；test_runner_common.py=测试公共件（替身边界不变：仅 ChatGPT 收发/采集两侧）
- 真实审查轮累计七任务落档（017 REWORK/018/022/024/026 PASS/023/027 REWORK，零重发）

## 请验收方执行（限定复验范围）

①NEW-P1-01：INTENT-only fail-closed+test_16d；②NEW-P1-02：按会商乙方案验收组合证据（test_19 三要素=状态事件断点/tasklist 死亡验证/新进程补采补登记零重派+丙口径声明）；③NEW-P1-03：追加式修复材料（备份/污染快照/supersede 三件）；④NEW-P2-01：双份运行记录；⑤NEW-P2-02：口径修正确认；⑥回归与范围（28 用例；代码变更=review_leg.py+test 件+test_runner_common.py 新增，零越界）。

**回执格式：** ①-⑥逐项+五问题逐项判定（关闭/未关闭）+总结论（PASS/REJECT+新问题编号）。
