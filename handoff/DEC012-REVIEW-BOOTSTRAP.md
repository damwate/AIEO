# T-P1-903 复审启动交接包：DEC-012 GitPointer 契约修订复审（r1，2026-11-14）

**用途：** 供全新、空白 GPT 审查会话独立复审，**不继承旧会话摘要，不依赖旧会话记忆**。
**性质：** 这是**契约修订文档复审**，不是模块代码审查轮次。审查对象是 `platform-contract-v1.0.md` §2.6 等修订文本的完备性与 POC 申报真实性。

## 1. 你的角色

- 独立审查者：直接读取 Git 与证据文件，输出三态结论，不采信开发方自述；
- 你的前任审查会话曾对本仓库 payload 选型给出 `result=BLOCKED`，提出 **15 项 required_boundaries 与 16 项 failure_paths**（原文见 §3-1）。本次复审核心问题：**修订是否逐项响应了这 31 项要求**。

## 2. 仓库与审查对象

- 仓库：`damwate/AIEO`（公开 GitHub）；分支：`main`；
- **审查基线 commit：以派单消息给出的完整 40 位 SHA 为准**（tag `review-anchor/T-P1-903-r1` 指向该 commit；其后如有 amend 仅新增复核证据目录，输入材料 blob 不变）；
- 输入材料 manifest：`phase1/manifests/T-P1-903-input-manifest.json`（同 commit）。**必须先读取 manifest 并逐文件核验 SHA-256/size 后再开展审查；任一不符 → BLOCKED**；只允许按完整 40 位 SHA 读取，禁止回退分支 HEAD 或其他版本；
- 审查对象：`docs/phase1/platform-contract-v1.0.md` §2.6（GitPointer 双向 payload 修订稿，当前标注"修订中，待复审"）及关联 §2.2/§10/§12/§13；`docs/phase1/decision-log.md` DEC-012~DEC-017。

## 3. 必做核对（逐项）

1. **前任要求逐项核对：** 读 `phase0/logs/payload-choice-inherited-reply.txt`（前任审查原始 JSON，含 15 required_boundaries + 16 failure_paths）。对 31 项逐项判定修订文本 `ADDRESSED`（给出条款位置与覆盖方式）或 `GAP`（说明缺口）。
2. **POC 真实范围核对：** §2.6.9–§2.6.13 申报的证据是否支撑其声明、有无 overclaim。证据路径：`phase0/logs/dispatch-2026-11-12T04-00-43/`、`dispatch-2026-11-12T04-41-46/`、`dispatch-2026-11-12T05-45-15/`、`git-pointer-remote-poc.md`、`git-pointer-remote-read-result.json`、`schema-tests.log`、`rework-inbound-tests.{log,json}`、`m1-registry-tests.{log,json}`、`m1-recovery-retry.json`、`m1-recovery-duplicate.json`、`m1-concurrency-evidence/`、`browser-virtual-list-2026-11-12T05-14-59/`、`third-round-regression-2026-11-12T05-33-03/`、`dispatch-binding-tests.{log,json}`。
3. **文本自洽核对：** §2.6.1–§2.6.8（1200 字节出站边界/manifest Schema/reviewed_commit 分离/权限与秘密/发布读取时序/配置/入站完整性/失败降级边界）内部自洽，且与 `contracts/v1.0/` 三份 GitPointer 相关 Schema 一致。

## 4. 判定规则与输出

- **PASS：** 31 项全部 ADDRESSED、POC 申报无 overclaim、文本自洽；MINOR 问题逐条列出但可复验；
- **REWORK：** 存在 MAJOR 缺口（boundary 未响应 / overclaim / 自相矛盾）；findings 编号**从 F-805 起**（历史 F-001~F-804 已用）；
- **BLOCKED：** 无法读取仓库、manifest 核验失败或证据不足——证据不足判 BLOCKED 而非 PASS；
- **PASS 效果边界：** 仅解除 §2.6"修订中，待复审"标注使其生效为契约文本，并授权主会话推进 §10 机器 Schema/契约测试落地；**不解除任何扩展场景限制**（DEC-017 门禁清单仍逐项待验收），不授权合并或发布动作。

**只输出一个 JSON（无其他包裹文本）：**

```json
{
  "result": "PASS|REWORK|BLOCKED",
  "reviewed_commit": "<40 位完整 SHA>",
  "input_material_commit": "<40 位完整 SHA>",
  "input_material_manifest_path": "phase1/manifests/T-P1-903-input-manifest.json",
  "input_material_manifest_sha256": "<64 位实测>",
  "required_boundaries_check": [{"id": 1, "status": "ADDRESSED|GAP", "note": ""}],
  "failure_paths_check": [{"id": 1, "status": "ADDRESSED|GAP", "note": ""}],
  "poc_scope_check": {"all_claims_verified": true, "overclaims": []},
  "findings": [],
  "constraints": [],
  "summary": ""
}
```

## 5. 环境与约束

- 公开仓库 GitHub 读取；`phase0/logs/**`、`phase1/logs/**` 为字节化证据（.gitattributes binary），以 blob 原始字节为准；
- 不要求重跑任何测试或历史 POC；浏览器环境事实不可假设；
- 1200 字节上限仅约束派单出站消息，你的 JSON 回复不受此限；
- 检测到上下文窗口上限或长期无反馈时，不在本会话重试——返回 BLOCKED 由主会话按轮换协议处理。
