# delivery：b-20261116-workspace-spec（多项目、多 IDE 工作区管理规范成文）

## 1. 原始需求

用户 2026-11-16 指令：为 AIEO WORKFLOW v0.3 增加《多项目、多 IDE 工作区管理规范》，覆盖九项（职责边界／任务落点指定／多 IDE 统一执行／项目级配置／任务包交付／结果回传／审查衔接／多项目拆分防错仓／升级处理），并受六条边界约束（控制中心定位、业务项目自带仓库执行、不虚构自动化、不降 GitPointer/全 SHA/fail-closed、不改既有 DEC、提交前暂停待批准）。原话全文见 `requirement.md`（不加工照录）。

## 2. 最终实现内容

- `basic/WORKFLOW.md`：新增《多项目、多 IDE 工作区管理规范（增补④）》一节（九小节），附录尾注登记增补依据；既有 v0.3 条款零删改、附录 12 行修订表未动。
- R1 整改后口径（经 R2 复验 PASS）：第四节=「项目配置与主机运行环境分离」（项目级可移植无秘密配置可入库／凭据与主机配置禁入库／遵循所用 IDE 规则）；第六节=回传三口径（被测对象=完整 SHA、完整 Diff=可核验完整改动或 GitHub compare/GitPointer、测试=断言+退出码；numstat 仅统计）。
- `docs/phase1/decision-log.md`：DEC-068～074、DEC-076～082（**编号序列中不存在 DEC-075，未补虚构条目**；范围不连续如实表述），逐轮登记，未覆盖既有 DEC-001～067。
- `phase0/environment-inventory.md` §4：增补"派单发送双验 UNCERTAIN 的判定顺序"经验（慢链路延迟送达 vs 未送达，禁盲目重发）。
- 任务包：requirement / task-brief / steps（含返工表问题1～11）+ `acceptance/`（各轮简报、R1～R13 回复与 ST-05 三份输出、补采驱动与发送双验证据）。

## 3. 修改文件

| 文件 | 变更 |
|---|---|
| `basic/WORKFLOW.md` | +54/−1（首轮）；R1 整改 +4/−3（第四/六节口径） |
| `docs/phase1/decision-log.md` | DEC-068～074、DEC-076～082（逐轮追加，不改既有条目） |
| `phase0/environment-inventory.md` | §4 增补一条经验（+1） |
| `basic/tasks/b-20261116-workspace-spec/` | requirement/task-brief/steps/delivery + acceptance 证据包 |
| C1–C8 契约、既有 DEC-001～067、附录修订表 | 未改动 |

## 4. 测试结果

- **ST-05 最终取证（COMPLETED 态，2026-11-16）：** 命令=`python -I basic/tool/check_taskpack.py basic/tasks/b-20261116-workspace-spec`；输出=Phase COMPLETED＋①PASS ②PASS ③PASS ④PASS ⑤PASS ⑥PASS＋**Overall PASS**＋无 FAIL；退出码=**0**；完整原始输出落库 `acceptance/st05-completed.txt`（未用摘要替代）。
- 中间态留痕（如实保留，不替代最终取证）：`acceptance/st05-inprogress.txt`（S2 期：①②④⑤PASS、③⑥N/A、Overall IN_PROGRESS）、`acceptance/st05-s3gate.txt`（S3 验收前：同上口径）。

### 独立验收链（S1 阶段：规范内容，R1～R6）

| 轮次 | 现场 | reply sha256 | 结论 |
|---|---|---|---|
| R1 | `dispatch-2026-11-16T08-15-12` | `d8a1cbbfda9add20e5055a3214353c51c2a45d47801c3eca27ad4f1d6e80cf7a` | REJECT（问题1/2/3） |
| R2 | `dispatch-2026-11-16T08-22-40` | `f90078de4b55755f4d37d93f9ea18ac13c56262d43c25b5171b8ee727bf38a74` | REJECT（仅收尾：问题2/4） |
| R3 | `dispatch-2026-11-16T08-40-08` | `9c36760b4b200f80593a69b147974011da81a19456afc022bfac0c60c713d242` | REJECT（仅 P1-03） |
| R4 | `dispatch-2026-11-16T08-48-34` | `5f2da9d73f809d7b6fdbe827b5efb73d9d019061a0c3c29bbe83d4fa0f1e0a15` | REJECT（仅 P2-03） |
| R5 | `dispatch-2026-11-16T08-56-47` | `b8e092dfd0e3d468…`（当轮落盘；完整值见该目录 result.json） | REJECT（P2-03 最小必改项） |
| R6 | `dispatch-2026-11-16T09-03-07` | `95a8287f173efd2ffd83a44d23654e11ee7a46ae011dc463ac77e3388cb69d67` | **PASS**（内容通过、收尾项全部关闭） |

### 独立验收链（S3 阶段：交付记录，R7～R13）

| 轮次 | 现场 | reply sha256 | 结论 |
|---|---|---|---|
| R7 | `dispatch-2026-11-16T09-07-41` | `330c9861f958d5e8ca376c2ff5f843439a205879699d20378fe34bf9b217aad9` | REJECT（问题6：交付证据未闭环） |
| R8 | `dispatch-2026-11-16T09-13-55` | `04c7115ddc53b6a9189a39c442db736f8af6a320efd055249d9880f55298bfe3` | REJECT（仅问题7：索引滞后） |
| R9 | `dispatch-2026-11-16T09-18-49` | **当轮 result.json 的 reply_sha256 缺失（如实登记）**，回复全文见该目录 `reply.txt` | REJECT（仅问题8：父提交 SHA 缩写） |
| R10 | `dispatch-2026-11-16T09-22-48/recoll` | `39b37f6723059945500b75b32e2abd548b32b7767a366b2b4796bcd8468f4c99` | REJECT（问题9：4 组交付索引/证据链问题，已按"一次整体同步"整改） |
| R11（旧会话 CONTEXT_LIMIT_STOP 后迁移至新会话 `6aface14-4f10-83e8-a5d0-e8a5de64c1e2`，首派即通） | `dispatch-2026-11-16T09-32-48` | **当轮 result.json 的 reply_sha256 缺失（如实登记）**，回复全文见该目录 `reply.txt` | REJECT（问题10：§5 提交链缺 R10 整改 commit；steps S2④ DEC 范围表述错误） |
| R12 | `dispatch-2026-11-16T09-41-47` | **当轮 result.json 的 reply_sha256 缺失（如实登记）**，回复全文见该目录 `reply.txt` | REJECT（仅 P1-3：§4 标题 R7～R10 未随表内 R11 同步） |
| R13 | `dispatch-2026-11-16T09-44-18/recoll` | `9a0b3fadd67479c179e6406ee27639c36f503b2b83de690f73af988e0ea6927d` | **PASS**（P1-3 关闭；S3 文档交付复核通过） |

- 纯文档任务：无代码单测项（如实标注不适用）。

## 5. Git commit（完整 SHA＋父提交）

基线：`d563a2a5fa2e518a6da7f041d36218b89a2ad12a`

**被测对象**

| 用途 | commit | 父提交 |
|---|---|---|
| S1-R1 首轮被测 | `72ee196c1ede434b7ddfb72a2450834505e1d2c4` | `d563a2a5fa2e518a6da7f041d36218b89a2ad12a` |
| S1-R2～R6 被测（内容最终定型） | `9efb14bbcc74d397e15558dc720706fc054ac627` | `72ee196c1ede434b7ddfb72a2450834505e1d2c4` |

**证据登记 / 交付记录 commit（均不属被测 diff）**

| 内容 | commit | 父提交 |
|---|---|---|
| 返工表问题1~3 登记 | `bf96e0061489cd218e1260d670704cc3bd10e00a` | `9efb14bbcc74d397e15558dc720706fc054ac627` |
| S2 引用改问题编号（ST-05 拦截） | `80f49287190f0dea910bd87ece6fa4bf6b88648d` | `bf96e0061489cd218e1260d670704cc3bd10e00a` |
| R2 登记+ST-05 实际输出落库 | `06d72bb83deea9ce3bccfa6bd71ec47ec670a364` | `80f49287190f0dea910bd87ece6fa4bf6b88648d` |
| 问题1/3 关闭+问题4 建行 | `c92cb0eaf7e3c1dbaa4c0fb9199cdadbdf87885e` | `06d72bb83deea9ce3bccfa6bd71ec47ec670a364` |
| 降档收口 DEC-071 | `09dbb646531476569adf9a64b518bb0652a4374c` | `c92cb0eaf7e3c1dbaa4c0fb9199cdadbdf87885e` |
| P1-03+DEC-072+慢链路经验固化 | `0e65d9c3753aef5532a83545c24a84125eadd529` | `09dbb646531476569adf9a64b518bb0652a4374c` |
| R4 简报归档 | `f9905a8875775fce124eab7f56bfb816d171e85a` | `0e65d9c3753aef5532a83545c24a84125eadd529` |
| P2-03 结构性修正 DEC-073 | `e32bda9145cc172b87151a44fb6ae5b30bd14da2` | `f9905a8875775fce124eab7f56bfb816d171e85a` |
| 问题5 建行 | `fa2f26b44186f0b483296ffe896c2dc45f863a84` | `e32bda9145cc172b87151a44fb6ae5b30bd14da2` |
| R4 证据归档+R5 简报 | `8c68f54ad9f7d915c15ecfe61f6257b763c78d31` | `fa2f26b44186f0b483296ffe896c2dc45f863a84` |
| R5 最小必改项 DEC-074 | `d190ed0e6b902c5fc4659297aed95bf94bc8139c` | `8c68f54ad9f7d915c15ecfe61f6257b763c78d31` |
| 交付登记（delivery 初稿+ST-05 输出） | `cc29fc51b23426b8f581416a82eed521117f74fd` | `d190ed0e6b902c5fc4659297aed95bf94bc8139c` |
| S3-R7 交付证据整改 DEC-076 | `bb8e6958895ed4f54a75e30ebc39d4d4182e69b8` | `cc29fc51b23426b8f581416a82eed521117f74fd` |
| 问题6 建行 | `b4ccc0ff900de083f76c391f2bab2d46be7072be` | `bb8e6958895ed4f54a75e30ebc39d4d4182e69b8` |
| S3-R8 索引修正 DEC-077 | `c032185740dcfcac3c11b158b14f7ed4d8d7824b` | `b4ccc0ff900de083f76c391f2bab2d46be7072be` |
| 问题7 建行+索引同步 | `787c2b58902c8de6769bac6820d0740f02504285` | `c032185740dcfcac3c11b158b14f7ed4d8d7824b` |
| R9 简报归档 | `58e7943d7f4a7f0dedd07e66c3389bbf6d6c94f7` | `787c2b58902c8de6769bac6820d0740f02504285` |
| S3-R9 父提交 SHA 补全 DEC-078 | `c8ddb06b851f91c8e11e2b641249fd82d2ba3926` | `58e7943d7f4a7f0dedd07e66c3389bbf6d6c94f7` |
| 问题8 建行+R10 简报 | `ab6ad23806d9be05be29b11d2150ea702bbf6ed5` | `c8ddb06b851f91c8e11e2b641249fd82d2ba3926` |
| S3-R10 四组整体同步+DEC-079 | `c8eb7087d47bd06524161edbee911ed060c9c61f` | `ab6ad23806d9be05be29b11d2150ea702bbf6ed5` |

- 交付索引修正 commit 对应关系：问题7＝`c032185740dcfcac3c11b158b14f7ed4d8d7824b`/`787c2b58902c8de6769bac6820d0740f02504285`，问题8＝`c8ddb06b851f91c8e11e2b641249fd82d2ba3926`/`ab6ad23806d9be05be29b11d2150ea702bbf6ed5`，问题9＝`c8eb7087d47bd06524161edbee911ed060c9c61f`（整体同步，见返工表问题9 行），问题10＝R11 整改 commit（见返工表问题10 行）。
- **本表收录口径（避免自引用循环）：** 收录基线→R10 整改（`c8eb708…`）的交付/证据类提交为止；此后（R11 及其后）同样属**证据登记**性质的提交，以 steps.md 返工表对应问题行的"修复 commit"为唯一权威登记（含完整 SHA），不在本表逐条追加。
- 审查分支：`review/b-20261116-workspace-spec`（远程同名分支，供按 SHA 读取）。**远程 main 仍指向基线 `d563a2a5…`**；本地 main 领先属执行侧现场记录，尚未推送/合并（待用户明文授权，DEC-010）。

## 6. 未解决问题

- **本地 main 领先远程 main 21+ commit，尚未推送/合并**——依用户第六节约束"不得直接推送远程 main，除非另行获得明确授权"，待用户明文授权（DEC-010 高危红线不代为拍板）。
- `72ee196c` 授权手续：已按用户指示降档收口为"不予追认+流程偏差登记+新增 commit 前明文批准约束"（DEC-071），无遗留动作。
- **编号勘误（如实登记）：** decision-log 无 DEC-075（登记时跳过），相关引用已在 DEC-079 勘误说明中澄清，未虚构补号。

## 7. 后续建议

- **阶段归属澄清：** S1 阶段（规范内容）验收轮次=R1～R6；S3 阶段（交付记录）验收轮次=R7～R13（R13 为 PASS，S3 交付复核通过），后续仅剩"最终记录一致性复核"轮次。两类轮次不混计：问题计数按"同一问题"口径统计于返工表，跨阶段不重复计数。
- 将"Git commit 前须用户明文批准"（DEC-071）评估上升为 WORKFLOW 通用条款（需用户拍板，不在本任务范围）。
- 审查会话已历 10 轮，后续新任务按 L-018 第 6 条主动迁移新会话，简报自包含（≤1200B）+材料走 GitHub。
- 派单链在慢链路下的发送判定已固化于 environment-inventory §4，后续任务直接照用。
