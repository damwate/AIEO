import io
p = "D:/AIEO/docs/phase1/decision-log.md"
t = io.open(p, encoding="utf-8").read()
assert "### DEC-131" not in t, "DEC-131 already present"
entry = """

### DEC-131 用户批准 fix/session-ctx-mgmt 合并 main（DEC-010 拍板，会话上下文预算令牌管理）（2026-11-23）

- **拍板依据：** 用户 2026-11-23 指令原话"同意合并"——批准 fix/session-ctx-mgmt 合入 main；属 DEC-010 高危红线（main 合并须用户本人拍板），AI 不自行决策。
- **独立验收前置：** CTX-CODE-R8 编码验收 3/3 PASS（被测代码锚点 `353e190b230abb1080964f68577c5a1cf00a080a`，补证 commit `4fe07fa3407ec22f561976ad2e879d09e0d3fdef`；首轮 reply SHA 10b759fc… 2PASS/1FAIL=证据不足非代码缺陷，recheck2 reply SHA 55cd8a65… 3/3 PASS）；agent-kit core 23/23 exit0 @6d9aad05、AIEO hooks 9/9 exit0 @353e190 真实重跑留证。任务登记 DEV-20261123-001，steps.md S4 结论 PASS。
- **范围终核：** git diff main..分支 共 16 commit / 186 文件（+3007/-2），全部落在 b-20261122-session-ctx-mgmt（任务包/证据）、phase0/logs（派单/补采/诊断现场）、phase0/tools（gpt_dispatch.mjs、dispatch_options.mjs、ctx_budget_hooks.mjs 等 R1–R8 整改对象）、docs/AI-DEV-LESSONS.md；无无关文件混入；main 无独有提交（merge-base=main HEAD=86a5bc4）。
- **合并方式：** fast-forward（git merge --ff-only），main 86a5bc4 → 630b1b2e7413e951a9585c666d7a553ff9a27c8e，零冲突；随后在 main 上追加本决策登记 commit。
- **如实登记（权限边界）：** agent-kit 分支 fix/session-budget 对 damwate GitHub 403 无推送权，未绕过（不改账号/不换仓库/不复制冒充）；核心源码经 session-budget-code.zip 入 AIEO 仓供核验。审查会话因目标重定向至根路径（实测非上下文上限，账本 6 轮 7268B）由 6b02a805 迁移至 6b03aea8，指针已更新、旧指针留档。
- **边界：** 无生产发布、无数据删除；本合并不解除 DEC-017 任何扩展场景门禁；fix/parallel-stage2 等其他分支不在本次授权范围。
"""
io.open(p, "w", encoding="utf-8", newline="").write(t.rstrip() + entry)
print("DEC-131 appended ok")
