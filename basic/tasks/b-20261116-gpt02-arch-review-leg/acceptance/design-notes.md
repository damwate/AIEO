# S1 设计记录：公共件复用方案与 arch_review_leg 编排结构

- 任务：b-20261116-gpt02-arch-review-leg
- 日期：2026-11-16
- 决策点：charter §3「抽公共 runner 或按同构复制——二选一，推荐抽公共件防双头维护」

## 裁定：最小参数化复用（方案 C+）

在「抽公共件」与「同构复制」之间裁定**最小参数化复用**：框架件（M1 客户端/账本/补采派生器）单点维护（防双头目标达成），同时把 review_leg.py 改动压到最小（保 29 用例回归与 GPT-03 已验收行为零变化）。

### review_leg.py 唯一修改（向后兼容参数化）

`EngineM1Client` 白名单参数化：

```python
def __init__(self, base_url, token, whitelist=None, event_whitelist=None, event_forbidden=None):
    self.whitelist = whitelist or ENGINE_WHITELIST          # 默认=现常量（GPT-03 行为不变）
    self.event_whitelist = event_whitelist or ENGINE_EVENT_WHITELIST
    self.event_forbidden = event_forbidden or ENGINE_EVENT_FORBIDDEN
```

- `check_event` 由 staticmethod 改实例方法（默认参数路径行为等价；arch_review_leg 传入自己的白名单）。
- 其余（ReviewLedger/derive_recoll_driver/utc_now_iso/常量）零改动，arch_review_leg 直接 import。
- 回归门槛：test_review_leg.py 29 用例全绿（白名单守卫/幂等/全流程/恢复/账本各断言不受影响）。

### arch_review_leg.py 结构（新增，预计 ~800 行）

| 段 | 内容 | 复用来源 |
|---|---|---|
| 常量区 | GPT02_WHITELIST（A-1 表 6 实用端点）/EVENT_WHITELIST={PASS,REWORK}/EVENT_FORBIDDEN（含 GIT_VALIDATE——无 Git 校验步，charter §6）/RESULT_DOMAIN={PASS,REWORK,BLOCKED} | 新定义 |
| ArchReviewLeg | A0 前置核查（status==ARCH_REVIEW+allowed_events 校验）→A1 简报组装（四组输入+绑定字段，≤1200B）→A2 派单（subprocess gpt_dispatch，--new-session，三态账本，发送/采集失败分类）→A3 采集+Ajv 契约校验（arch-review-report.schema.json）→A4 登记（artifacts+messages 路线 B）→A5 事件推进（PASS→READY/REWORK→REWORK；BLOCKED 仅登记+腿级停止） | 编排模式同构 ReviewLeg R0-R6 |
| resume | A-3 九行矩阵（含路线 B 专属行：报告已登记但事件推进失败→原 event_id 幂等续推） | 附录 D 模式改写 |
| attach-reply | 人工退路（同契约同幂等键） | A6 |
| setup-agents | GPT-02 reviewer agent+ENGINE-02 服务身份注册（bootstrap 一次性，非运行期路径） | 同构 GPT-03 |

### GPT-03→GPT-02 差异清单（实现对照表）

| 维度 | GPT-03（review_leg） | GPT-02（arch_review_leg） |
|---|---|---|
| 落点状态 | DEV_REPORTED→GIT_VALIDATING→CODE_REVIEW | ARCH_REVIEW（进出：PASS→READY／REWORK→REWORK） |
| Git 校验步 | GIT_VALIDATE 事件+git_verify | 无（charter §6：架构审核无 Git 校验步） |
| 报告登记 | POST /reports/review（附录 E 同事务） | artifacts+messages 路线 B（A-2 裁定；/reports/review 绑定 CODE_REVIEW 不承载） |
| 结论域 | PASS/REWORK（报告层） | PASS/REWORK/BLOCKED（BLOCKED=登记+腿级停止，M1 状态不动） |
| 身份 | GPT-03/ENGINE-01 | GPT-02/ENGINE-02 |
| 简报输入 | diff artifact+AC | 四组输入（任务身份/审核范围/依赖信息/审核材料 GitHub 指针+固定 commit）+绑定字段 |
| 幂等键 | <run>-review-round-1 | <run>-arch-review-round-1 |
| runtime | runtime/review-leg/rvl-<run> | runtime/arch-review-leg/arl-<run> |
| marker | [GPT03-R1\|<run>\|<task>] | [GPT02-R1\|<run>\|<task>] |

### 白名单口径（A-1 定稿粒度）

实用端点 6 个：GET tasks/{id}、GET tasks/{id}/dependencies、GET artifacts/{id}、POST artifacts、POST messages、POST tasks/{id}/events。POST /reports/review **不入白名单**（charter 标注"不使用"——越权防御原则下白名单只含实际使用端点）。GET /board 不入（GPT-03 用、GPT-02 轮询单任务不需要）。

### 风险与回归门槛

1. review_leg.py 改动仅 EngineM1Client.__init__/check_event（默认参数=现行为）；29 用例回归全绿为 S2 完成硬门槛。
2. Ajv 校验：沿用 run_ajv_validation 模式（ajv CLI 不在则 python jsonschema 兜底？——**不引入新依赖**：与 review_leg 相同的 Ajv 调用路径，环境一致性由同一仓库保证）。
3. BLOCKED 结论：报告登记成功后腿级停止，**不提交任何 M1 事件**（A-1 拒绝清单+A-3 BLOCKED 行）。
