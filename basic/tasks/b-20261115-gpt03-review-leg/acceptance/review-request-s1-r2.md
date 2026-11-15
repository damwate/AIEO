# S1-R2 限定复验请求：b-20261115-gpt03-review-leg（S1-R1 REJECT 六项整改后）

## 绑定申报（ST-01，机器预检已过）

- **复验基线：** `4c888334db9f2a5b38d46f86a531ec7d87af8749`（S1-R1 申报回填态 HEAD）
- **待验收 commit（单 commit 申报）：** `6cf9147e6f49d2f43ef2e0b37753b3ca5e351402`
- **绑定核验：** verdict=PASS；R1 区间数=1；R2 线性链首 parent=基线；R4 无后代；numstat=review_leg.py **+227/-57**、test_review_leg.py **+93/-38**（整改 diff 恰 2 文件）
- **上一轮被测：** `512f9c5a7142e23678e5d1972050ee5674d605aa`（S1-R1 REJECT 对象；本复验=6cf9147 相对 512f9c5 的整改 diff+回归全量）
- **本请求所在回填 commit 不属验收 diff 范围**（ST-01④：steps.md 返工表/⑥回填+本请求文件）

## S1-R1 裁定与整改对照（六项逐项）

| # | R1 问题 | 整改要点 | 复验核对位置（6cf9147） |
|---|---|---|---|
| P1-01 | 409 幂等命中判定过宽 | 双证核验=响应键指认+账本请求指纹，缺一 fail-closed；artifact 无 409 命中路径（M1 语义：同路径同 SHA=201 duplicate:true） | review_leg.py `_register_step`/`_req_sha`；R5 三步调用点 |
| P1-02 | 部分登记恢复重跑全量 | `_ledger_verified` 逐项只读核实（artifact=白名单 GET 实读；message/report=账本指纹链）→ `r5_register(skip=)` 只补缺项，R5_SKIP_VERIFIED 入账 | review_leg.py `_ledger_verified`/`r5_register`/`_resume_register` |
| P1-03 | 采集失败记录无法补采 | COLLECT_FAILED 落账会话证据（conversation_uuid/sent_user_unit_key/unit 快照/现场 SHA）；resume 发送锚点双记录统一 | review_leg.py `r3_dispatch` 失败分支/`resume` CODE_REVIEW 分支/`_resume_collect` |
| P2-01 | 账本八字段组不完整 | R0/R3/R4/R5 记录补齐（轮次与幂等键/会话标识与归属/发送 unit 快照/请求响应 SHA 对） | 各 ledger.append 记录字段 |
| P2-02 | A9 替身越界 M1 客户端 | 服务端故障注入（测试 DB 触发器使 messages INSERT ABORT→500），客户端全真实 REST 零替换 | test_review_leg.py `test_09` |
| P2-03 | A8 双重故障测试不充分 | test_08a（发送成立→账本截断仅剩 INTENT→禁重发 BLOCKED→账本修复续跑只补登记零发送）+test_08b（账本痕迹 vs M1=DEV_REPORTED 矛盾 fail-closed） | test_review_leg.py `test_08a`/`test_08b` |

## 回归证据

- test_review_leg.py **19/19 PASS**（42.8s；原 18 用例经 R1 整改重构为 19：08 拆 08a/08b；全部其余用例回归通过）
- 未触碰红线：scheduler.py/M1-M4/M2 工具链/契约文件零修改（diff 恰 2 文件佐证）

## 请验收方执行（限定复验范围）

①P1-01/P1-02/P1-03 三项 P1 逐项关闭核验（对照上表核对位置）；②P2-01/P2-02/P2-03 三项 P2 逐项关闭核验；③整改是否引入新缺陷（19 用例矩阵真实性+替身边界仍仅 ChatGPT）；④修改范围复核（diff=2 文件，numstat 机器值如上）；⑤标准 1-7 维持性复核（R1 认可项未被整改破坏）。

**回执格式：** ①-⑤逐项结论+六问题逐项判定（关闭/未关闭）+总结论（PASS/REJECT+新问题编号）。
