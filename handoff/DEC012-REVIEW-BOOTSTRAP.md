# T-P1-903 复审启动交接包：DEC-012 GitPointer 契约修订复审（r2，2026-11-14）

**用途：** 供全新、空白 GPT 审查会话独立复审，**不继承旧会话摘要，不依赖旧会话记忆**。
**性质：** 这是**契约修订文档复审**，不是模块代码审查轮次。审查对象是 `platform-contract-v1.0.md` §2.6 等修订文本的完备性与 POC 申报真实性。
**轮次沿革：** r1 审查会话因环境 GitHub 工具调用额度不足，无法完成 manifest 逐文件 SHA-256/size 实测，按入口门禁判 BLOCKED（F-805），**未进入实质审查**，其 constraints 明确 BLOCKED 不代表材料缺陷。r2 按会务建议（dispatch-2026-11-13T17-16-34/reply.txt）采用 **A+ 聚合包核验协议**（见 §2.5）：一次聚合包下载完成 95 文件全量核验 + 强制独立 GitHub 抽查，实质审查范围与判定标准与 r1 完全一致。

## 1. 你的角色

- 独立审查者：直接读取 Git 与证据文件，输出三态结论，不采信开发方自述；
- 你的前任审查会话曾对本仓库 payload 选型给出 `result=BLOCKED`，提出 **15 项 required_boundaries 与 16 项 failure_paths**（原文见 §3-1）。本次复审核心问题：**修订是否逐项响应了这 31 项要求**。

## 2. 仓库与审查对象

- 仓库：`damwate/AIEO`（公开 GitHub）；分支：`main`；
- **审查基线 commit：以派单消息给出的完整 40 位 SHA 为准**（tag `review-anchor/T-P1-903-r2` 指向该 commit；其后如有 amend 仅新增复核证据目录，输入材料 blob 不变）；
- 输入材料 manifest：`phase1/manifests/T-P1-903-input-manifest.json`（同 commit）。**必须先按 §2.5 聚合包核验协议完成入口核验（含 95 文件 SHA-256/size 全量实测）后再开展审查；任一不符 → BLOCKED**；只允许按完整 40 位 SHA 读取，禁止回退分支 HEAD 或其他版本；
- 输入聚合包：`phase1/manifests/T-P1-903-input-bundle.tar`（同 commit）；辅助索引：`phase1/manifests/T-P1-903-input-bundle.index.json`（仅辅助定位，**不是判定依据**，唯一判定基准仍是 manifest）；
- 审查对象：`docs/phase1/platform-contract-v1.0.md` §2.6（GitPointer 双向 payload 修订稿，当前标注"修订中，待复审"）及关联 §2.2/§10/§12/§13；`docs/phase1/decision-log.md` DEC-012~DEC-017。

### 2.5 聚合包核验协议（A+，r2 入口核验必做）

r1 的逐文件 GitHub 下载核验因审查环境额度不可行；r2 改为：**一次聚合包下载 + 全量本地哈希 + 强制独立抽查**。四步全部完成才可进入 §3 实质审查：

1. **包身份核验**：从审查基线 commit 的 Git tree 确认聚合包路径存在并取得其 Git blob SHA-1；下载聚合包原始字节后独立计算其 SHA-256（对原始文件字节）与 Git blob SHA-1（按 Git 对象规则 `SHA1("blob " + 字节数 + "\0" + 内容)`）——两者都必须记录，不得混用概念；聚合包由主会话以 `git archive --format=tar` 从 bundle_source_commit（见 index.json）导出，禁止以工作区打包替代核验；
2. **全量哈希核验**：解包到隔离目录；核对实际文件数 = 95、路径集合与 manifest 完全一致、无缺失/额外/重复路径；对全部 95 个文件逐一计算 SHA-256 与 size 并对照 manifest——**95/95 全部一致才通过，不得以抽查代替全量**；
3. **独立抽查（≥15，防聚合包成为唯一信任来源）**：从 GitHub 指定 commit 读取原始文件字节，与聚合包解包字节**逐字节比较**，共至少 15 个文件：(a) ≥5 个核心契约/入口文件——`contracts/v1.0/` 三份 Schema、`handoff/DEC012-REVIEW-BOOTSTRAP.md`、`docs/phase1/platform-contract-v1.0.md`，**关键 GitPointer 契约文件必须全部纳入，不得被随机规则遗漏**；(b) ≥5 个实现/测试证据文件；(c) ≥5 个由你在下载聚合包之后自行随机抽取（自选随机种子并记录在报告中，不得使用固定种子）；抽查任一文件不一致 → **直接 BLOCKED**，不得重新打包、重新抽样或忽略差异继续审查；
4. **如实记录**：报告 JSON 的 `bundle_verification` 字段（见 §4）必须填写聚合包 SHA-256、Git blob SHA-1、包内实际文件数、95/95 比对结果、抽查数量与逐字节一致数、缺失/额外/路径冲突计数。

**判定边界不变：** 聚合包下载失败、GitHub 抽查额度不足、无哈希计算环境等**环境性障碍一律判 BLOCKED**（不是 REWORK）；本协议仅为入口核验的可行替代路径，不降低 §3/§4 的任何实质审查标准。

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
  "bundle_verification": {"bundle_sha256": "", "bundle_git_blob_sha1": "", "tar_file_count": 95, "hash_match": "95/95", "spot_check_count": 15, "spot_check_identical": 15, "missing": 0, "extra": 0, "random_seed": ""},
  "findings": [],
  "constraints": [],
  "summary": ""
}
```

## 5. 环境与约束

- 公开仓库 GitHub 读取；`phase0/logs/**`、`phase1/logs/**` 为字节化证据（.gitattributes binary），以 blob 原始字节为准；
- 聚合包下载、解包、SHA-256 计算所需环境由审查方自备（§2.5）；无法完成入口核验即 BLOCKED，不得推定材料完整；
- 不要求重跑任何测试或历史 POC；浏览器环境事实不可假设；
- 1200 字节上限仅约束派单出站消息，你的 JSON 回复不受此限；
- 检测到上下文窗口上限或长期无反馈时，不在本会话重试——返回 BLOCKED 由主会话按轮换协议处理。
