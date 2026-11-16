# delivery：b-20261116-workspace-spec（多项目、多 IDE 工作区管理规范成文）

## 1. 原始需求

用户 2026-11-16 指令：为 AIEO WORKFLOW v0.3 增加《多项目、多 IDE 工作区管理规范》，覆盖九项（职责边界／任务落点指定／多 IDE 统一执行／项目级配置／任务包交付／结果回传／审查衔接／多项目拆分防错仓／升级处理），并受六条边界约束（控制中心定位、业务项目自带仓库执行、不虚构自动化、不降 GitPointer/全 SHA/fail-closed、不改既有 DEC、提交前暂停待批准）。原话全文见 `requirement.md`（不加工照录）。

## 2. 最终实现内容

- `basic/WORKFLOW.md`：新增《多项目、多 IDE 工作区管理规范（增补④）》一节（九小节），附录尾注登记增补依据；既有 v0.3 条款零删改、附录 12 行修订表未动。
- R1 整改后口径（经 R2 复验 PASS）：第四节=「项目配置与主机运行环境分离」（项目级可移植无秘密配置可入库／凭据与主机配置禁入库／遵循所用 IDE 规则）；第六节=回传三口径（被测对象=完整 SHA、完整 Diff=可核验完整改动或 GitHub compare/GitPointer、测试=断言+退出码；numstat 仅统计）。
- `docs/phase1/decision-log.md`：DEC-068（成文登记）～DEC-077（S3-R8 交付索引修正），逐轮如实登记，未覆盖既有 DEC-001~067。
- `phase0/environment-inventory.md` §4：增补"派单发送双验 UNCERTAIN 的判定顺序"经验（慢链路延迟送达 vs 未送达，禁盲目重发）。
- 任务包：requirement / task-brief / steps（含返工表问题1~7）+ `acceptance/`（各轮简报、R1~R8 回复与 ST-05 输出、补采驱动与发送双验证据）。

## 3. 修改文件

| 文件 | 变更 |
|---|---|
| `basic/WORKFLOW.md` | +54/−1（首轮）；R1 整改 +4/−3（第四/六节口径） |
| `docs/phase1/decision-log.md` | DEC-068~077（逐轮追加，不改既有条目） |
| `phase0/environment-inventory.md` | §4 增补一条经验（+1） |
| `basic/tasks/b-20261116-workspace-spec/` | requirement/task-brief/steps/delivery + acceptance 证据包 |
| C1–C8 契约、既有 DEC-001~067、附录修订表 | 未改动 |

## 4. 测试结果

- ST-05 检查器：`python -I basic/tool/check_taskpack.py basic/tasks/b-20261116-workspace-spec`。**实际输出（据原始落库，S3 验收前）**：①PASS ②PASS **③N/A**（提示"2 步记录完整 PASS；未到期 S3"）④PASS ⑤PASS **⑥N/A**（阶段=IN_PROGRESS，交付记录未到期），Overall=IN_PROGRESS，FAIL=0。原始输出：`acceptance/st05-inprogress.txt`（S2 期）、`acceptance/st05-s3gate.txt`（S3 验收前）。S3 完成态（COMPLETED）需在 S3 验收通过、阶段转完成后重跑并另存新输出。
- 独立验收链（ChatGPT 会话 `6afabbd3-ddec-83e8-afca-8a61cf91694c`）：R1 REJECT（问题1/2/3）→ R2 REJECT（仅收尾：问题2 待追认、问题4 ST-05 落库）→ R3 REJECT（仅 P1-03）→ R4 REJECT（仅 P2-03）→ R5 REJECT（P2-03 最小必改项）→ **R6 PASS（P2-03 关闭，明确无需 R7）**；各轮现场目录与 reply SHA256 见 steps.md ⑥。
- 纯文档任务：无代码单测项（如实标注不适用）。

## 5. Git commit

- 基线：`d563a2a5fa2e518a6da7f041d36218b89a2ad12a`
- S1-R1 首轮被测：`72ee196c1ede434b7ddfb72a2450834505e1d2c4`
- **S1-R2~R6 被测对象（内容最终定型）：`9efb14bbcc74d397e15558dc720706fc054ac627`**
- 其后均为证据登记 commit（不属被测 diff）：`72ee196`→`9efb14b`（整改）→`bf96e00`/`80f4928`（返工表）→`06d72bb`（R2 登记+ST-05 落库）→`c92cb0e`（问题1/3 关闭+问题4 行）→`09dbb64`（降档收口 DEC-071）→`0e65d9c`（P1-03+DEC-072+经验固化）→`f9905a8`（R4 简报）→`e32bda9`（P2-03 结构性修正 DEC-073）→`fa2f26b`（问题5 行）→`8c68f54`（R4 归档+R5 简报）→`d190ed0`（R5 最小必改项 DEC-074）→交付登记 commit（本条）
- **交付登记 commit：`cc29fc51b23426b8f581416a82eed521117f74fd`**（父提交=`d190ed0e6b902c5fc4659297aed95bf94bc8139c`；内容=delivery.md+steps/task-brief 更新+ST-05 输出+验收请求；**不属被测 diff**）。
- **S3-R7 交付记录整改 commit：`bb8e6958895ed4f54a75e30ebc39d4d4182e69b8`**（父提交=`cc29fc51…`；内容=delivery §4 按实表述、§5 SHA 写全、steps S3 六要素补齐、DEC-076；**属交付记录整改，不属 R2 被测 diff**）。其后的交付索引修正 commit 见 steps 返工表问题7 行。
- 审查分支：`review/b-20261116-workspace-spec`（远程同名分支，供按 SHA 读取）。**远程 main 仍指向基线 `d563a2a5…`（本次复核经 GitHub 核验）；本地 main 领先属执行侧现场记录**，尚未推送/合并（待用户明文授权）。

## 6. 未解决问题

- **本地 main 领先远程 main 若干 commit，尚未推送/合并**——依用户第六节约束"不得直接推送远程 main，除非另行获得明确授权"，待用户明文授权后执行（DEC-010 高危红线不代为拍板）。
- `72ee196c` 的授权手续：已按用户指示降档收口为"不予追认+流程偏差登记+新增 commit 前明文批准约束"（DEC-071），无遗留动作。

## 7. 后续建议

- 将"Git commit 前须用户明文批准"（DEC-071）评估上升为 WORKFLOW 通用条款（需用户拍板，不在本任务范围）。
- 审查会话已历 R1-R6 六轮，后续新任务按 L-018 第 6 条主动迁移新会话，简报自包含（≤1200B）+材料走 GitHub。
- 派单链在慢链路下的发送判定已固化于 environment-inventory §4，建议后续任务直接照用，避免重复诊断。
