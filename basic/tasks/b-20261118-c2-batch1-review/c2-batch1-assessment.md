# 906/C2 第一批六项扩展场景只读复评报告（b-20261118-c2-batch1-review）

- **依据：** DEC-106（ChatGPT 裁定 ADJUST ①906/F-006 GO 顺序1：六项只读复审，逐项结论+证据，不改码）；被测基线 main=`7819c30`。
- **方法与边界：** 仅采集既有真实发生记录（dispatch 现场 run.log/result.json、decision-log、登记簿、测试套件、环境实测），**未新造场景、未注入故障、零代码写入**。
- **总结果：1 PASS / 1 INVALIDATED / 4 REWORK**（REWORK=无真实发生实例，非实现缺陷）。

| # | 场景 | 结论 | 关键证据 | 缺口 |
|---|---|---|---|---|
| 1 | 真实 ChatGPT 多 assistant unit | **REWORK** | 全仓 dispatch/recoll result.json 无 unit_count>1 或多 assistant 成功采集实例；解析能力已具备（`inbound_reply.mjs` 区间完整性纯函数 + inbound 24/24 负例测试；区间窗口≥2 三次实跑） | fail-closed 设计使未证完整的多 unit 回复被拦不采集（设计使然）；需受控真实多 unit 用例走通 采集→登记 全链 |
| 2 | 真实动态虚拟列表裁切恢复 | **PASS** | 真实触发实例：T1 completeness fail-closed（`phase0/logs/dispatch-2026-11-17T08-51-38/run.log` INBOUND_WINDOW_COMPLETENESS_UNPROVEN）→禁重发→recoll 补采→T1 复审 PASS（DEC-100，reply `714e2282…`）；R2.3 实测 unit 10→8 裁切（手册 §6.2 冻结）；DEC-016 判据语义（可滚动≠裁切）实战守住 | 无——恢复闭环成立 |
| 3 | 私有仓库权限 | **INVALIDATED（前提不成立）** | 仓库实为 public：未认证 GET https://github.com/damwate/AIEO 返回 200（经代理实测 2026-11-18）；DEC-017 设计即"公开仓库"口径；审查方直读实证：T4 首轮 ChatGPT 直读 77318da 后 4 项 P1 指认属实（DEC-102） | 若未来仓库转私有，场景重开（届时按 BLOCKED-1 门禁单独验收） |
| 4 | 真实网络故障注入与退避耗尽 | **REWORK** | 真实故障处置实证：DEC-103 推送受阻双轮（2497 上游 timeout/6822 死/直连不可达）按 L-014 限时排查→精确报告→挂起→恢复；T1 completeness fail-closed 禁重发；L-014/L-018 行为纪律固化并实战验证 | "退避耗尽→死页梯子 3 strikes 判死→CONVERSATION_DEAD"全链无真实实例（fail-closed 总在耗尽前挂起——符合设计，但场景未穷尽） |
| 5 | 多文件部分读取失败 | **REWORK** | 工具源码具处理路径（`git_pointer.mjs`/`m1_artifact_registry.mjs`），全仓日志无真实触发实例 | 需受控用例（部分文件 404/SHA 不符）实测 fail-closed 行为 |
| 6 | M1 REST/数据库/ACK 平台级并发 | **REWORK（局部 PASS）** | M1 层可靠性用例全绿基线 43/43（duplicate message / ack idempotent+dead letter requeue / outbox sweep retry→dead letter→requeue / restart persistence / admin rebootstrap 等，`tests/platform/`）；D1′（T-P1-905）与 F-001（T-P1-908）真实全链单任务跑通 | "完整平台级并发"（多任务并行下 REST+DB+ACK+派单真实并发）无实例——与 DEC-052 多任务移交项衔接，列入多任务实施方案的验证门 |

## 后续建议

1. **REWORK 四项列入下一批受控用例清单**（多 unit 采集用例 / 退避耗尽梯子演练 / 部分读取失败注入 / 平台级并发最小场景），逐项独立验收后**逐项**解除 DEC-017 对应限制，不批量放行；
2. **INVALIDATED 项**登记前提变更（仓库公开），转私有即重开；
3. 项 6 与 DEC-106④ 多任务实施方案的验证门合并推进，避免重复造场景。
