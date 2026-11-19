# 需求原文（P1-02 AISVC 后验变更及合并血缘审计）

- **任务 ID：** b-20261119-p1-aisvc-postpass-lineage-audit（P1-02）
- **来源与授权：**
  - 用户 2026-11-20 指令原话："来自codebuddy的交接文档已就绪，看看哪些能处理，然后跟chatgpt讨论，以chatgpt的观点为准我不参与细节讨论，不用我拍板，按照你们讨论的建议来就行"。
  - ChatGPT P1HANDOFF-R1 处置裁定（2026-11-20，reply SHA256 `fedb72e25bac2dd46e56a00b261d8634a9ae23de2b79720ebb311c00a36ee2dc`，会话 `6aff4117-76dc-83ec-b743-10b00ce73195`）：S1 建 P1-01/P1-02 两独立审计任务包=允许执行；S5=P1-01 验收释放通道后 FIFO 派发。
  - 身份冻结依据：资格审查 R1（reply SHA256 `04410b05b134663fa82e0aacd0d9fb2ecdf473855703c4e6a6f8ca1bd110c722`，绑定基线 `2794352ac02b4cc88a373ed0abe2c1c278fa27b9`）；登记 DEC-113/116。

## 被测对象（冻结，完整 SHA 明文）

| 项 | 值 |
|---|---|
| 来源候选任务 | b-20261119-aisvc-f3-rework |
| 被审计仓库 | github.com/YotinGarden/AI-Image-Service（本地 D:\YotinGarden\AI-Image-Service） |
| 被测 commit（R3 后说明修正及 main 最终） | `0c53c963d93e33c15ebd4498742828fcf9ffc57d` |
| 对照基准（R3 已验收 commit） | `d50ce915cb047537640a8393e08882e922443d47` |
| R3 历史 PASS artifact SHA256 | `ddf605d5d6bf4771b480aada4e178e277e89dd3d6568233c50a19a65846655b3` |

## 只读复核问题（资格审查 R1 逐字冻结）

1. `0c53c963` 相对 `d50ce915` 是否严格属于说明性修改。
2. 是否存在实际生产行为、测试逻辑或其他代码变化。
3. fast-forward 合并到 main 是否完整保留已验收代码。
4. 分支清理是否存在遗漏提交、误删有效内容或意外变更。
5. R3 历史验收 SHA 与最终 main SHA 是否正确衔接。

## 明确排除（冻结）

- 不重复 F3a-F3d 功能验收；不重跑 pytest；不重新评价历史 R3 PASS；不执行任何分支清理。

## 强制约束（资格审查 R1 §三 共同约束 + P1HANDOFF-R1）

- 历史 PASS 不能作为本任务 PASS；R3 PASS 仍绑定 `d50ce915…`，不能自动延伸到 `0c53c963…`。
- 禁止重跑 C2 batch2 ⑥、禁止将⑥未执行冒充 PASS、禁止重复计算历史 PASS。
- 本任务独立 task_id + 独立审查会话 UUID + 独立证据目录（不得与 P1-01 共用会话冒充独立审查）。
- 零代码修改、不启 M1 写路径、不触 DEC-010 红线（main 合并/生产发布/数据删除）。
- 前置：P1-01 完成验收并释放审查通道后 FIFO 派发（P1HANDOFF-R1 S4→S5）。
