# 新审查会话启动交接包（Phase 1，2026-11-12）

**用途：** 供全新、空白 GPT 审查会话使用。**不继承旧会话摘要，不依赖旧会话记忆。**
**背景：** 旧审查会话已出现“上下文窗口已达上限”；曾尝试带摘要迁移，现放弃该路径，改由本交接包恢复必要上下文。

## 1. 仓库与当前基线【事实】

- 仓库：`damwate/AIEO`（公开 GitHub）
- 当前工作分支：`fix/AIEO-PHASE0-REVIEW-R10`
- 本交接包对应基线 commit：`b48696437c1b5b317d2bf105b947a0a03a8e4667`
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

## 3. 当前待讨论项：范围拆分（不是要求放宽证据）

`platform-contract-v1.0.md` §12 的 BLOCKED-1 已历经多轮实现与复审。最新代码与证据见 §2.6.6–§2.6.13、DEC-012–DEC-016。

### 已验证核心路径【有仓库证据】

- 短指令网页收发与生成完成判定；单 assistant unit 长回复（>1200 字节）提取、两次完整读取、artifact/hash 回读。
- 公开 GitHub 仓库指定完整 SHA 的 manifest 与多文件回读：`phase0/logs/git-pointer-remote-poc.md`。
- GitPointer 三份机器 Schema 与 Ajv 测试、JSON/Schema/三 ID 绑定。
- M1 最小本地登记幂等、首次失败补登记且不重新发送 GPT、OS 句柄锁多进程并发。
- 真实 Chrome 虚拟列表仿真（明确不是 ChatGPT 多 unit）：`phase0/logs/browser-virtual-list-2026-11-12T05-14-59/`。
- 全量回归 10/10：`phase0/logs/third-round-regression-2026-11-12T05-33-03/result.json`。

### 尚未验证扩展场景【不得当作已测】

- 真实 ChatGPT 多 assistant unit、真实动态虚拟列表裁切恢复；
- 私有仓库权限、真实网络故障注入与退避耗尽、真实多文件部分读取失败；
- M1 REST、数据库持久化与 ACK 完整服务闭环。

### 请新会话评估

是否允许以 **PASS_WITH_CONSTRAINTS** 解除 Phase 1 开工阻塞：只在已验证场景运行；遇集合变化、无法证明完整、权限不足或登记异常均 fail-closed/BLOCKED；扩展场景列为后续验收门禁，不宣称当前已测。请给出必须写入上线约束的清单，只输出：

`{"result":"PASS|REWORK|BLOCKED","constraints":["..."],"summary":""}`

## 5. 会话管理约束【决策】

- 检测到“上下文窗口已达上限”或长期无反馈时，不在旧会话重试；
- 不使用“带摘要继承”作为默认迁移方式；改为生成本交接包并开启全新会话；
- 新会话首条消息必须自包含：仓库、分支、目标 commit、交接文档路径、任务、验收标准、输出 JSON 格式；
- 证据不足或无法读取 Git 内容时返回 BLOCKED，不声称已审查通过。
