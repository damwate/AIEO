# S2 限定复验请求：b-20261115-standard-kickoff（只复核问题3~6）

> 依据 S2-R1 裁定（reply sha256=6f53348aa924ceb8…，recoll-2026-11-15T11-41-36-943Z）："整改完成后，应针对上述四个问题提交限定复验；本轮已通过的绑定申报和防膨胀检查不需要无故扩大重审。"

## 绑定申报（ST-01，机器口径 --numstat）

- **待验收 commit（单 commit 申报）：** `0eceb006df5d0074cb29c6758141b761ed9f925a`
- **diff 基线：** `3d5ef22ceceb8a846da9d6d280cbae748ccd9a8b`（S2 首轮回填 commit，其已声明不属验收 diff 范围）
- **绑定核验（机器输出原文）：** parent=3d5ef22…（`git show -s --format='%H %P'`）✓；`git rev-list --count`=1 ✓；`git diff --numstat 基线..待验收` → **4  3  docs/FEASIBILITY-REGISTER.md／1  1  docs/PHASE-STATUS.md／0  64  docs/phase1/F001-SCHEDULER-BRIEF-DRAFT.md（删除）／87  0  docs/phase1/GPT03-REVIEW-LEG-CHARTER-DRAFT.md（新增）**（恰 4 文件 ✓）
- 本请求所在回填 commit 不属验收 diff 范围（ST-01 ④）。

## 四项整改对照

| 问题 | R1 要求 | 修正落位 |
|---|---|---|
| 问题3（P1-01）状态漂移 | 区分既有 T-P1-908 与本次立项对象；说明已具备/待工程化；同步或明确指出 F-001 登记与 PHASE-STATUS 冲突 | ①FEASIBILITY F-001 → CLOSED（最小版落地，附 DEC-034~036 全链证据+漂移声明，原文保留）；②PHASE-STATUS §0 校正（真实下一项=GPT-02~05 逐角色）；③误定文件 F001-SCHEDULER-BRIEF-DRAFT.md 移除（与定稿 F001-SCHEDULER-BRIEF.md 冲突）；④新草案 GPT03-REVIEW-LEG-CHARTER-DRAFT.md v0.2，§2=已具备/待工程化清单表 |
| 问题4（P1-02）一期边界与异常规则 | 明确审查腿一期边界；区分网页派单故障与平台执行腿故障；按错误类型划分重试/禁重试；L-018 引用范围准确 | v0.2 §4（一次审查轮/REWORK 停等人工/不阻塞既有结果）+§5 五类错误处置表（含重试规则列，平台腿"业务副作用类无幂等键确认禁自动重试"）+L-018 全文限定"ChatGPT 网页派单采集异常" |
| 问题5（P1-03）权限授权模型 | 主体—操作—授权边界表，指出 C7 具体约束来源 | v0.2 §6 四主体表（OWNER/调度引擎/执行腿/人工执行者），调度引擎"无业务凭据+禁 DB 直改+禁推断修正 M1 状态"引 T-P1-908 既有边界 |
| 问题6（P1-04）验收矩阵 | 场景/前置/动作/预期/失败判定/证据/回滚验证条件 | v0.2 §7 矩阵 A1~A6（正常审查轮/返工建议/采集 fail-closed 注入/幂等重放/重启恢复/人工退路）+回滚条件+双分支+零 mock |

## 复验范围声明

- 只复核问题3~6；R1 已通过项（ST-01 申报、防膨胀、I1/I7、六查①③⑥）不重审。
- 本步仍=仅立项准备，不含代码；开工与需求原文确认留用户（H7）。

**回执格式：** 问题3~6 逐项结论＋总结论（PASS/REJECT＋问题编号）。
