# 新审查会话启动交接包（Phase 1，2026-11-12）

**用途：** 供全新、空白 GPT 审查会话使用。**不继承旧会话摘要，不依赖旧会话记忆。**
**背景：** 旧审查会话已出现“上下文窗口已达上限”；曾尝试带摘要迁移，现放弃该路径，改由本交接包恢复必要上下文。

## 1. 仓库与当前基线【事实】

- 仓库：`damwate/AIEO`（公开 GitHub）
- 当前工作分支：`fix/AIEO-PHASE0-REVIEW-R10`
- 本交接包对应基线 commit：`81d63f71ef0c5efa65766c9da0331d4f449d06f2`
- main 未合并任何 Phase 0/Phase 1 分支。

## 2. 已完成【事实，可按下述路径核验】

1. Phase 0 技术验证及 11 轮独立审查闭环，最终 PASS：
   - `phase0/reports/phase0-final-report.md`
   - `phase0/reports/rework10-2026-11-12.md`
   - `phase0/reports/phase0-closeout.md`
2. Phase 1 治理文件五件套与交接包已提交：
   - `docs/phase1/agent-contract.md`
   - `docs/phase1/module-boundaries.md`
   - `docs/phase1/handoff-template.md`
   - `docs/phase1/review-protocol.md`
   - `docs/phase1/decision-log.md`
   - `handoff/PHASE1-HANDOFF.md`
3. 平台公共契约 v1.0 已冻结（commit `81d63f71ef0c5efa65766c9da0331d4f449d06f2`）：
   - `docs/phase1/platform-contract-v1.0.md`
   - 决策记录 DEC-011：`docs/phase1/decision-log.md`

## 3. 当前唯一待讨论项

`platform-contract-v1.0.md` §12 的 **BLOCKED-1：M2 长 payload 投递方式**。

候选建议：**Git 指针优先**。任务包/审查材料提交仓库并生成 commit；网页仅发短指令，包含 owner/repo、分支、完整 SHA、路径、验收标准与输出格式；GPT 直接读取 GitHub 实际文件核验。短消息（≤1200 UTF-8 字节）继续走已验证的 CDP 通道。仓库不可达或材料不可核验时返回 BLOCKED；不降级为反复长文本粘贴，不逆向接口，不绕过验证。附件/分块通道如确有需要，另立 POC，不默认可用。

## 4. 请新审查会话执行

1. 阅读上述仓库文件，尤其是 `platform-contract-v1.0.md` §12 与 §13、03 号协议、06 号实施计划；
2. 评估“Git 指针优先”能否解除 BLOCKED-1，列出必要边界与异常路径；
3. 只输出一个 JSON 对象：
   `{"result":"PASS|REWORK|BLOCKED","required_boundaries":["..."],"failure_paths":["..."],"summary":""}`

## 5. 会话管理约束【决策】

- 检测到“上下文窗口已达上限”或长期无反馈时，不在旧会话重试；
- 不使用“带摘要继承”作为默认迁移方式；改为生成本交接包并开启全新会话；
- 新会话首条消息必须自包含：仓库、分支、目标 commit、交接文档路径、任务、验收标准、输出 JSON 格式；
- 证据不足或无法读取 Git 内容时返回 BLOCKED，不声称已审查通过。
