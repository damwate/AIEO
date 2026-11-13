# T-P1-903 复审启动交接包：DEC-012 GitPointer 契约修订复审（r3，2026-11-14）

**用途：** 供全新、空白 GPT 审查会话独立复审，**不继承旧会话摘要，不依赖旧会话记忆**。
**性质：** 这是**契约修订文档复审**，不是模块代码审查轮次。审查对象是 `platform-contract-v1.0.md` §2.6 等修订文本的完备性与 POC 申报真实性。
**轮次沿革：** r1 因审查环境 GitHub 工具调用额度不足无法逐文件实测，按入口门禁判 BLOCKED（F-805），未进实质审查；r2 采用 A+ 聚合包协议，审查者已独立核验聚合包 Git blob SHA-1，但环境对二进制 TAR 返回空正文，再次 BLOCKED（不代表材料缺陷）；能力探测 v2 实测审查环境仅能完整读取 ≤200KB 级文本。r3 按会务确认方案（dispatch-2026-11-13T17-39-07/reply.txt）将传输层改为**分片 base64**（见 §2.5，含 A1-A7 强制约束），A+ 全部约束与实质审查标准不变。

## 1. 你的角色

- 独立审查者：直接读取 Git 与证据文件，输出三态结论，不采信开发方自述；
- 你的前任审查会话曾对本仓库 payload 选型给出 `result=BLOCKED`，提出 **15 项 required_boundaries 与 16 项 failure_paths**（原文见 §3-1）。本次复审核心问题：**修订是否逐项响应了这 31 项要求**。

## 2. 仓库与审查对象

- 仓库：`damwate/AIEO`（公开 GitHub）；分支：`main`；
- **审查基线 commit：以派单消息给出的完整 40 位 SHA 为准**（tag `review-anchor/T-P1-903-r2` 指向该 commit；其后如有 amend 仅新增复核证据目录，输入材料 blob 不变）；
- 输入材料 manifest：`phase1/manifests/T-P1-903-input-manifest.json`（同 commit）。**必须先按 §2.5 分片核验协议完成入口核验（含 95 文件 SHA-256/size 全量实测）后再开展审查；任一不符 → BLOCKED**；只允许按完整 40 位 SHA 读取，禁止回退分支 HEAD 或其他版本；
- 输入聚合包分片：`phase1/manifests/bundle-parts/part-00.b64 … part-13.b64`（同 commit）；分片索引：`phase1/manifests/bundle-parts.index.json`；聚合包本体：`phase1/manifests/T-P1-903-input-bundle.tar`；主索引：`phase1/manifests/T-P1-903-input-bundle.index.json`——索引仅辅助定位，**不是判定依据**，唯一判定基准仍是 manifest；
- 审查对象：`docs/phase1/platform-contract-v1.0.md` §2.6（GitPointer 双向 payload 修订稿，当前标注"修订中，待复审"）及关联 §2.2/§10/§12/§13；`docs/phase1/decision-log.md` DEC-012~DEC-017。

### 2.5 聚合包分片核验协议（A+ 分片版，r3 入口核验必做，会务确认 A1-A7）

**背景：** 审查环境实测仅能完整读取 ≤200KB 级文本（2.31MB 文本定位成功但正文 0 字符、二进制正文不可读）；r3 将聚合包按 128KiB 原始字节分片、base64 编码入库。**传输层改变不改变 A+ 任何约束与 §3/§4 实质审查标准。**

**材料（全部位于审查基线 commit）：** 分片 `phase1/manifests/bundle-parts/part-00.b64 … part-13.b64`；分片索引 `bundle-parts.index.json`（片序/片文件字节数/片 SHA-256/片 blob SHA-1/b64 字符数/解码后原始字节数/原始字节 SHA-256/总片数/TAR 总字节数+SHA-256+blob SHA-1）；聚合包本体 `T-P1-903-input-bundle.tar`；主索引 `T-P1-903-input-bundle.index.json`（bundle_source_commit 等）；判定基准 `T-P1-903-input-manifest.json`。

入口核验步骤（全部完成才可进入 §3）：

1. **(A1) 逐片核验**：从 commit tree 取每片的 Git blob SHA-1；fetch 片正文后核验 b64 字符数、解码后原始字节数、原始字节 SHA-256——对照分片索引逐项比对，任一不符 → **直接 BLOCKED**；
2. **(A2+A3) 拼接与总包核验**：严格按索引片序拼接（不得依赖目录排序），去换行后 base64 解码；TAR 总字节数、总 SHA-256、总 Git blob SHA-1 三项全部一致才可解包；聚合包本体在 tree 中的 blob SHA-1 亦须与解包重建结果交叉核验；
3. **(A4) 全量清单核验**：解包到隔离目录；95/95 数量、路径集合、size、SHA-256 逐文件对照 manifest——**二进制文件同样必须完成 SHA-256 核验，不得因正文不可读而跳过**；缺失/额外/重复路径任一非零 → BLOCKED；
4. **(A5) 独立抽查 ≥15**：必须为独立文件，覆盖核心契约文本、JSON 配置、源码、测试/证据文件、PNG 等二进制、不同模块目录；文本文件与 GitHub 指定 commit 原始字节逐字节比对；二进制文件 GitHub 正文不可读，改用其 tree 中 Git blob SHA-1 与本地 `SHA1("blob " + len + "\0" + 内容)` 比对作**等效身份核验**——blob SHA-1 仅为对象身份核验，不代表内容已被直接读取，不得扩大解释；随机样本由你在 fetch 分片后自行选种子抽取并记录种子；抽查任一文件身份不一致 → **直接 BLOCKED**；
5. **索引自身保护**：`bundle-parts.index.json` 与 `T-P1-903-input-bundle.index.json` 也须按其在 commit tree 中的 blob SHA-1 做身份核验，防分片清单被单独替换；
6. **(A6+A7) 边界不变**：传输核验通过只代表材料可用、可进入实质审查，不代表材料质量合格；§3/§4 实质审查一项不少；PASS/REWORK/BLOCKED 语义不变——传输、读取、环境条件不足一律 **BLOCKED**，既不推导材料缺陷，也不推导 PASS。

**如实记录：** 报告 JSON 的 `bundle_verification` 字段（见 §4）必须填写 TAR 总字节数/SHA-256/blob SHA-1、片数与 14/14 核验结果、95/95 比对、抽查数量与一致数（含二进制 blob 身份核验数）、缺失/额外/随机种子。

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
  "bundle_verification": {"tar_total_bytes": 1710080, "tar_sha256": "", "tar_git_blob_sha1": "", "chunk_count": 14, "chunks_verified": "14/14", "hash_match": "95/95", "spot_check_count": 15, "spot_check_identical": 15, "spot_check_binary_blob_identity": 0, "missing": 0, "extra": 0, "random_seed": ""},
  "findings": [],
  "constraints": [],
  "summary": ""
}
```

## 5. 环境与约束

- 公开仓库 GitHub 读取；`phase0/logs/**`、`phase1/logs/**` 为字节化证据（.gitattributes binary），以 blob 原始字节为准；
- 分片 fetch、base64 解码、SHA-256/SHA-1 计算、解包所需环境由审查方自备（§2.5）；无法完成入口核验即 BLOCKED，不得推定材料完整；
- 不要求重跑任何测试或历史 POC；浏览器环境事实不可假设；
- 1200 字节上限仅约束派单出站消息，你的 JSON 回复不受此限；
- 检测到上下文窗口上限或长期无反馈时，不在本会话重试——返回 BLOCKED 由主会话按轮换协议处理。
