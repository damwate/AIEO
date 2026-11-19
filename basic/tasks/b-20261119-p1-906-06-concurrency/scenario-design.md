# 906⑥ M1 平台级并发独立验证场景设计 v0.3（R1 ADJUST→R2 REJECT 三项技术整改落位，待 R3 复审）

> 来源：R1 裁定 reply `2d84f6bd658acd00d3cd2ada56e29c2e3b91458983cf21d0573b4991fb90d4d0`（11158B，会话 6afe9d76，commit e16722f）→ R2 裁定 reply `cf078bc249319e66d79e1414756c12e8074290c001110a6e2ace137f83518ecb`（6358B，补采）。v0.3 针对 R2 三项技术 REJECT（跨实例单调时钟可比性/事件关联字段/DB-ACK失败判定）整改，场景 A/B/C 结构不变。**本轮只设计不实测；⑥ 仍 BLOCKED**。
>
> 红线：batch1 局部 PASS 不推导平台级并发 PASS；batch2 ⑥未执行不作证据；两只读任务 PASS 不替代⑥；⑥未独立 PASS 前 M1 写路径限制不解除；不以 Mock/内存DB/顺序测试替代并发证明。

## 一、场景总结构（1 正常并发主场景 + 4 故障 + 完整性复核）

### 场景 A：双任务真实并发
- 实例 A = `task-A`/`request-A`/`idempotency-A`；实例 B = `task-B`/`request-B`/`idempotency-B`；各有独立执行上下文（禁共享可变任务上下文）。
- 同步屏障同时释放两请求进入真实 M1 REST 处理路径；记录服务端单调时钟的接收/处理开始/处理结束时间，**证明两请求处理区间实际重叠**（否则判顺序执行，⑥不通过）。
- **跨实例时钟域可比性（v0.3 / R2 REJECT-01 整改）：** 采用以下二选一，须在 environment/clock-domain.txt 记录选定方式：①两实例在**同一主机、同一单调时钟域**（同一 CLOCK_MONOTONIC），处理区间数值可直接比较；②若跨主机，采用有明确误差上界 ε 的统一时间基准或集中事件采集（所有事件由单一采集进程打戳），**只有扣除 ε 后仍满足重叠条件才判并发**。判定公式：`max(A_start, B_start) < min(A_end, B_end)`（跨主机时以 `max(A_start−ε, B_start−ε) < min(A_end−ε, B_end−ε)` 或集中采集校正后值判定）。不满足则判顺序执行、⑥不通过。禁止用两台机器各自 CLOCK_MONOTONIC 的原始数值直接比较。
- 真实路径：M1 REST → DB 事务 → ACK；A、B 分别完成登记/状态推进/持久化/确认，分别核对 REST 响应、DB 记录、ACK。
- 最终 DB 状态须与各请求预期一致；重复提交 A 原始请求验幂等且不影响 B。

### 场景 B：四类故障验证（F1-F4）
| 编号 | 注入位置 | 预期结果 |
|---|---|---|
| F1 | DB 提交前失败 | 不产生错误成功 ACK，不留半完成状态 |
| F2 | DB 已提交、REST 响应丢失 | 重试识别原请求，不重复推进（须区分 DB 已提交与客户端未收响应，不能仅凭 HTTP 超时认定事务失败） |
| F3 | ACK 发送失败/超时 | 不把未确认任务伪装为已确认 |
| F4 | 单任务中断、另一继续 | 故障任务状态可追溯，另一任务不被错误覆盖 |

每个故障记录注入时间/故障位置/实际结果/恢复结果/两任务最终状态。

### 场景 C：完整性复核
核对两任务全部生命周期事件；查重复登记/重复推进、丢失记录/错误ACK/交叉ACK、失败任务静默成功；DB 实际记录与 REST/ACK 证据一致。

## 二、七维度操作化（R1 要求补齐）
| 维度 | 可执行判据 |
|---|---|
| 并发登记 | 两独立 task_id/request_id/幂等键，禁共享可变上下文 |
| REST 归属 | 请求/响应/任务ID 三方关联，响应不串单 |
| DB 无覆盖 | 并发提交后逐任务核对最终状态/版本/记录数/事务结果 |
| ACK 不交叉 | ACK 携带任务标识+状态版本，逐任务核对 |
| 幂等 | 同请求重复提交不重复创建/推进/ACK |
| 故障 fail-closed | 覆盖提交前失败/响应丢失/ACK失败三类 |
| 证据关联 | 全链路关联ID+统一时间线+原始证据+SHA256清单 |

### 二·补 事件关联字段规范（v0.3 / R2 REJECT-02 整改）
每条原始事件记录（进入 MANIFEST 的 rest/request、rest/response、db、ack、timeline 记录）至少包含下列字段；不要求每种事件填满全部字段，但**必须在 scenario-design 冻结时定义各 event_type 的必填/可选规则**，不得在采集时临时决定。字段：
| 字段 | 用途 |
|---|---|
| event_id | 唯一事件身份 |
| task_id | 任务归属 |
| request_id | 请求归属 |
| instance_id | 实例归属（A/B） |
| idempotency_key | 幂等核验 |
| trace_id | 全链路追踪 |
| event_type | 事件类型（REST_REQ/REST_RESP/DB_TXN_BEGIN/DB_TXN_COMMIT/ACK_SEND/ACK_CONFIRM/FAULT_INJECT/RECOVER…） |
| monotonic_timestamp | 单调时钟时间（带 clock_domain） |
| clock_domain | 时钟所属域（对应一·补选定的时钟域方案） |
| db_transaction_id | DB 事务关联 |
| ack_id | ACK 唯一身份 |
| state_version | 状态版本 |
适用规则：REST_REQ/RESP 必填 event_id/task_id/request_id/instance_id/trace_id/monotonic_timestamp/clock_domain；DB_TXN_* 必填 db_transaction_id/task_id/state_version；ACK_* 必填 ack_id/task_id/state_version；FAULT_INJECT/RECOVER 必填 event_id/instance_id/monotonic_timestamp/clock_domain。每事件可关联到 task_id+request_id+实例身份。

## 三、八项关键判据（全部满足才允许⑥ PASS）
1. 至少两真正独立任务实例（明确独立性证明）；2. 真实 M1 REST+DB 路径；3. 证明实际并发非顺序（时间重叠）；4. 每任务登记/状态/ACK 独立追溯（完整关联字段）；5. 故障无错误成功/串单/丢失（逐故障判定）；6. 原始证据+SHA256 完整 MANIFEST；7. 独立审查与执行者分离；8. 任一判据未过则⑥不得 PASS。

## 四、真实 M1 REST+DB 环境前置（当前 BLOCKED，未证实具备）
实测批次前须独立只读环境资格检查：M1 服务（实际运行实例+版本）/REST（源码契约确认真实接口非模拟）/DB（真实连接目标+事务边界+测试隔离）/ACK（真实产生消费路径）/隔离（专用测试数据空间不碰生产）/双实例（可同时运行）/故障注入（本机受控可恢复）。任一不具备→⑥维持 BLOCKED，不擅自启 M1 写路径，另提环境准备方案及授权。

## 五、五类即停（任一触发立即停，先保全现场再处置）
①安全边界（误连生产库/越权写入）→停保留现场；②身份隔离（task/request/实例身份混淆）→停并发查串单；③数据完整性（DB覆盖/丢失/重复推进/事务不明）→停写留DB证据；④故障失控（超时状态不明/错误成功/交叉ACK）→停注入留现场；⑤证据失效（原始响应缺失/时间线不关联/SHA不符/采集不全）→停判定不补造证据。停止≠清理；恢复/重试/清理另记，不覆盖首次失败证据。

## 六、证据目录与 SHA256
```
906-06-acceptance/
├── environment/{m1-version.txt,rest-contract.txt,db-target.txt,isolation-check.txt}
├── scenario-a/{instance-a.json,instance-b.json,rest-requests/,rest-responses/,db-before/,db-after/,ack-events/,concurrency-timeline.json}
├── scenario-b/{F1/,F2/,F3/,F4/}
├── analysis/{task-a-trace.json,task-b-trace.json,cross-check.md}
└── MANIFEST.sha256
```
要求：保留原始响应/日志非仅截图；统一时区+单调时钟值；每事件关联 task_id/request_id/实例身份；MANIFEST 覆盖全部原始证据+最终报告；生成后复验 SHA256 不一致不得通过；独立审查者直读原始材料不采信执行者自述。

## 七、时间线关联（T0-T9）
T0 身份+测试数据初始化 → T1 两请求进屏障 → T2 屏障释放服务端分别接收 → T3 处理区间重叠 → T4 各自DB事务提交 → T5 各自ACK产生确认 → T6 幂等重复请求 → T7 故障注入恢复 → T8 DB/REST/ACK 最终交叉核验 → T9 证据 SHA256 固化。所有事件可还原实际顺序，不依赖客户端打印时间。

### 六·补 DB/ACK 失败判定精确化（v0.3 / R2 REJECT-03 整改）
- **预期状态转换序列（每任务）：** `DRAFT → RECEIVED → PROCESSING → DB_COMMITTED → ACKED`。DB 提交前状态=DRAFT/RECEIVED/PROCESSING（无 DB_COMMITTED）；提交后=DB_COMMITTED；ACK 确认后=ACKED。DB_TXN_COMMIT 事件存在→状态至少 DB_COMMITTED；无 COMMIT→不得标记 DB_COMMITTED。
- **F1（DB 提交前失败）：** 无 DB_TXN_COMMIT 事件、状态停留 PROCESSING 或明确 FAIL，无 ACK_SEND/ACKED；"无半完成事务"=不存在 DB_COMMITTED 却无对应 REST 响应/无 ACK 的孤儿状态，且 DB 记录数与事务结果一致（场景 C 核对）。
- **F3（DB 已提交但 ACK 失败）：** 明确中间状态=`DB_COMMITTED_UNACKED`（已提交未确认），**不得等同回滚、也不得标记为 ACKED**。DB_TXN_COMMIT 存在但无 ACK_CONFIRM。重试 ACK 必须复用同一 `ack_id`（同一逻辑确认身份），判"同一 ACK 重发"而非"重复确认"；不得生成新 ack_id 制造错误成功或交叉确认。
- **F2（DB 已提交响应丢失）：** 以 DB_TXN_COMMIT 事件判定事务已提交，不以 HTTP 超时推断回滚；重试命中同一 idempotency_key 不得重复创建/推进。
- 场景 C 按上述预期状态序列逐任务对照实际 DB 记录；任何"ACK 发送失败=事务回滚"的推断均判设计错误。

## 八、最终验收标准（总门槛：全部满足）
双实例/真实路径/并发证明(服务端处理时间重叠)/无串单覆盖丢失/ACK分别正确/幂等不重复/F1-F4符合预期且失败可追溯/证据完整SHA一致/独立审查逐项PASS。任一关键项 BLOCKED 或 REWORK → ⑥不得 PASS。

## 九、执行阶段与授权边界
当前 S2 设计 → S3 v0.2 修订+冻结+独立R2复审 → 后续另批环境资格检查（不合格 BLOCKED）→ 后续另批⑥实测（须独立实测授权，不继承本规划授权）→ S4 独立验收 → S5 收口。**⑥独立 PASS 后才讨论是否解除 M1 写路径限制。**
