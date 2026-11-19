# 需求原文（P1-01 派单可靠性原始证据独立审计）

- **任务 ID：** b-20261119-p1-dispatch-evidence-audit（P1-01）
- **来源与授权：**
  - 用户 2026-11-20 指令原话："来自codebuddy的交接文档已就绪，看看哪些能处理，然后跟chatgpt讨论，以chatgpt的观点为准我不参与细节讨论，不用我拍板，按照你们讨论的建议来就行"。
  - ChatGPT P1HANDOFF-R1 处置裁定（2026-11-20，reply SHA256 `fedb72e25bac2dd46e56a00b261d8634a9ae23de2b79720ebb311c00a36ee2dc`，会话 `6aff4117-76dc-83ec-b743-10b00ce73195`）：S1 建 P1-01/P1-02 两独立审计任务包=允许执行。
  - 身份冻结依据：资格审查 R1（reply SHA256 `04410b05b134663fa82e0aacd0d9fb2ecdf473855703c4e6a6f8ca1bd110c722`，绑定基线 `2794352ac02b4cc88a373ed0abe2c1c278fa27b9`）；登记 DEC-113/116。

## 被测对象（冻结，完整 SHA 明文）

| 项 | 值 |
|---|---|
| 来源候选任务 | b-20261117-dispatch-reliability-fix |
| 被测 commit | `7f7830b80bdaa6a5c48510c74a621319bf32e419` |
| 历史验收 artifact SHA256 | `a5d099d62e6881c3d625c3bf1c08454f49fe62c098a0eb9bf25fa18cb036a631` |

## 只读复核问题（资格审查 R1 逐字冻结）

1. #7 mtime 容差、brief_bytes、RunKeyLock 的测试证据是否完整。
2. #4 指针保护、会话归属校验是否有对应测试和现场证据。
3. #3 标记定位、歧义 fail-closed 是否有对应测试和现场证据。
4. 原始 run.log、result.json、reply artifact SHA256、测试日志之间是否相互吻合。
5. 是否存在交付记录未披露、证据缺失或测试数量不一致。

## 明确排除（冻结）

- 不重跑测试；不重新验收三项历史功能；不重新计算历史 PASS。

## 强制约束（资格审查 R1 §三 共同约束 + P1HANDOFF-R1）

- 历史 PASS 不能作为本任务 PASS；本任务审计独立判定。
- 禁止重跑 C2 batch2 ⑥、禁止将⑥未执行冒充 PASS、禁止重复计算历史 PASS。
- 本任务独立 task_id + 独立审查会话 UUID + 独立证据目录（不得与其他审计任务共用会话冒充独立审查）。
- 零代码修改、不启 M1 写路径、不触 DEC-010 红线（main 合并/生产发布/数据删除）。
- 前置：P1HANDOFF-R1 七项开跑前置核验全部 PASS 后方可派单（S3 派单门槛）。
