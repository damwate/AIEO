# RELEASE-RECORD：v0.1.0-standard-alpha（独立发布记录）

> 依据 MULTITASK-IMPLEMENTATION-PLAN.md §7 v0.4（R3⑤ 修正：tag 对象 SHA 不写入自身 message，创建后于此独立记录登记映射）。

## 三者映射（tag 创建后登记）

| 项 | 值 |
|---|---|
| tag 名 | `v0.1.0-standard-alpha`（annotated，不可变） |
| tag 对象 SHA | `fe2bda368d29a25ac0e3d546dd3bf94d5893bfb9` |
| 被测 commit SHA（tag 指向） | `65d482fa46d6677242fd5f406877891040d51e8d` |
| 回滚目标（被测 commit^） | `6ba1b92e2912e291c28f2e1f7b723d5a56dfee10` |
| 创建时间 | 2026-11-18（本地） |
| 推送确认 | `git ls-remote origin refs/tags/v0.1.0-standard-alpha` → tag 对象+^{} 解皮双值核对一致（2026-11-18 实查） |

## 打版前置核验（DEC-106 条件逐项）

| 条件（DEC-106） | 结果 | 证据 |
|---|---|---|
| 上述两项完成 | ✅ | ①906/C2 第一批复审交付闭环（b-20261118-c2-batch1-review COMPLETED，R2 PASS reply `16a723c6…`）；④多任务方案 P0 设计评审 PASS（R4 四轮收敛，reply `a463a29f…`，plan v0.4） |
| 验收通过 | ✅ | 同上（两轮独立复核均经审查方直读 GitHub 证据 commit） |
| 测试全绿 | ✅ | 本目录四模块回归：M1 43/43、M2 65/65、M3 54/54（基线 53+1 演进）、M4 24/24，exit 全 0；SHA256SUMS 覆盖 |
| 版本边界及回滚方案明确 | ✅ | plan §7 v0.4（包含/不包含清单；回滚目标=tag^；tag 不移动不删） |

## 边界重申（不夸大）

- **仅打版，不部署生产**——tag 为只读标记，无任何运行态发布动作；
- 本 PASS/打版不构成：实施授权（P1-P3 逐级独立批准）、写操作授权（M4 封闭）、906⑥ 绕过、DEC-010 红线解除；
- 审查方 caveat：R4 PASS 仅代表 P0 设计通过（R4 reply `a463a29f…` conditions 第 4 条原文登记）。
