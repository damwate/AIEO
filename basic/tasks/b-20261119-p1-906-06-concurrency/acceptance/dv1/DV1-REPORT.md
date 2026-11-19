# DV1 降档验证报告（906⑥ 事件契约机器可校验重构）

- 来源：L-019 止损会商 reply SHA256 `afb0bd2006b4da8924d0d91a2bde18ad9bfda3c694aa05cd17de550527801223`（被测 commit `ca1f4d877e06a9832934eb86657f1ecbd0e077ca`）；会商裁定停止 R 轮、同意 DV1 一次性验证、门槛冻结；会商不计返工，R1–R6 历史不改写。
- 产物：`event-contract.schema.json`（8 类 event_type、基线/类型必填、枚举、扩展字段、字段级 `n/a_reason` 映射、标准 JSON Schema 2020-12 结构 + `x-*` 语义约束）；`semantic-validator.mjs`（结构/类型/闭合性 + 条件必填 + RECOVER 复制语义 + schema 自检）；`test-cases.json`（正例 9 / 反例 14）；`run-tests.mjs`（机器可读结果）；`test-results.json`；`MANIFEST.sha256`。
- 实测：运行 `node run-tests.mjs` → schema self-consistency `consistent=true`；23/23 用例与预期一致（正例全过、反例全拒），`all_ok=true`，退出码 0。
- 门槛映射：DV1-01 事件类型覆盖=P01–P09 覆盖 8 类 event_type；DV1-02 字段约束/条件必填=P07/P08/N03/N13；DV1-03 每 N/A 字段唯一原因=P08/P09/N05/N06；DV1-04 封闭原因枚举=N07/N12；DV1-05 闭合性=N01/N14；RECOVER 三情形=P09/N11/N12，非法目标=N08/N09/N10；一次性验证=可重复运行 + 文件 SHA256 绑定。
- 边界：本协议只验证事件字段契约，**不是**⑥并发实测；⑥仍 BLOCKED；M1 写路径不解除；环境资格检查与实测须另批授权；DV1 若 REJECT 不恢复 R 轮，走下一级止损。
