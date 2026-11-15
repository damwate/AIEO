# S2 限定复验请求 R3：b-20261115-standard-kickoff（只复核问题3/5/6 残留）

> 依据 S2-R2 裁定（reply sha256=2de7fd0f91aa46dc…，recoll-2026-11-15T11-52-35-084Z）：问题4 关闭；问题3 未关闭点=PHASE-STATUS 文件头残留；问题5/6 未关闭点见 R2 回执。本轮只复核三项残留整改。

## 绑定申报（ST-01，机器口径）

- **待验收 commit（单 commit 申报）：** `56235f0639974827b654b6680bf47ac2b3d1c578`
- **diff 基线：** `4095981`（前次回填链尾 commit）
- **绑定核验（机器输出原文）：** parent=409598115a136f4f07a5dbd7e255f0b25e6cf644（=`git show -s --format='%H %P'` 输出，=基线 4095981 系其短 SHA）✓；`git rev-list --count`=1 ✓；`git diff --numstat 基线..待验收` → **2／1 docs/PHASE-STATUS.md；22／18 docs/phase1/GPT03-REVIEW-LEG-CHARTER-DRAFT.md**（恰 2 文件）
- 本请求所在回填 commit 不属验收 diff 范围（ST-01 ④）。

## 三项整改对照

| 问题 | R2 未关闭点 | 修正落位 |
|---|---|---|
| 问题3 残留 | PHASE-STATUS 文件头版本行仍写"下一项=F-001 立项准备" | 文件头版本行升级 v0.10：F-001 已落地（T-P1-908/DEC-036）+下一项=GPT-02~05 逐角色真实腿接入+首项立项准备=GPT-03 审查腿草案待评审与用户确认；v0.9 残留明示校正；版本表增 v0.10 行 |
| 问题5 | 授权表缺 engine C7 身份类型/白名单/凭据三类/§8.5-8.7 落实 | GPT03 草案 v0.3 §6 重写：①凭据三类边界段（OWNER 凭据 §8.5／本机服务身份凭据 §8.6／外部执行端凭据）；②四主体表增"C7 身份类型"列（engine=§8.6 独立本机服务身份）与"禁止操作"列（engine 禁 DB 直改/白名单外端点/MERGE_TO_MAIN、RELEASE、DEAD_LETTER_REQUEUE、CONTRACT_CHANGE 类审批 target/自行推断修正 M1 状态）；③审计行落 §8.7（audit_logs） |
| 问题6 | A1 状态预期不明/A3 注入点与禁重发证明缺/A4 幂等键未定义/A5 断点未分类/A6 人工判定缺/回滚假设未验证转换 | v0.3：§4 状态路径=M1 既有合法出边（state_machine.py:33-37：DEV_REPORTED→GIT_VALIDATING→CODE_REVIEW→TEST_ACCEPTANCE/REWORK/BLOCKED）；§7 A1 状态逐步预期＋A3 注入点=采集层只读构造虚拟化窗口（不改工具代码）＋禁重发双证明（账本单次 SEND_STARTED+user unit 计数一致）＋A4 幂等键=`run键+review-round-1`（908 模式）＋A5 两类断点（已发送未采集→补采；已采集未登记→仅补登记）分别测＋A6 人工登记判定（同契约校验+同幂等键+三项登记齐+状态一致）＋回滚改"不改变既有 M1 状态停等人工"（不假设未验证的状态回退转换） |

## 复验范围声明

- 只复核问题3/5/6 残留；问题4 与 R1/R2 已过项不重审。仅立项准备，不含代码；开工留用户拍板（H7）。

**回执格式：** 问题3/5/6 逐项结论＋总结论（PASS/REJECT＋问题编号）。
