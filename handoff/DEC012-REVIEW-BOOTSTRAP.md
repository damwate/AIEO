# T-P1-903 复审启动交接包：DEC-012 GitPointer 契约修订复审（r6，2026-11-14）

**用途：** 供全新、空白 GPT 审查会话独立复审，**不继承旧会话摘要，不依赖旧会话记忆**。
**性质：** 这是**契约修订文档复审**，不是模块代码审查轮次。审查对象是 `platform-contract-v1.0.md` §2.6 等修订文本的完备性与 POC 申报真实性。
**轮次沿革：** r1 因审查环境 GitHub 工具调用额度不足无法逐文件实测，判 BLOCKED（F-805）；r2 采用 A+ 聚合包协议，环境对二进制 TAR 返回空正文，BLOCKED；r3 按 128KiB 分片 base64 传输，审查者取得 14/14 分片 tree blob SHA-1 与分片索引一致，但实测环境**无本地字节处理与密码学计算能力**，判 BLOCKED——前三轮均 BLOCKED_NOT_MATERIAL_DEFECT，未进实质审查。r4 经会务决议（`phase0/logs/dispatch-2026-11-13T17-57-41/reply.txt`）并经用户拍板批准，采用**方案 A：对象身份门禁 + 双层保证**（见 §2.5）。r5 首次按新协议复审：**OBJECT_IDENTITY_GATE 本体通过**（递归 tree 一次调用，manifest 95/95 git_blob_sha1+size 一致、14/14 分片一致、TAR+双索引 3/3），但两处主会话准备缺陷判 BLOCKED——I3 误写 bundle_source_commit 与派单基线一致（两阶段设计下该字段指向材料 commit，基线为聚合包 commit，必然不一致）、BYTE_INTEGRITY 记录在 tag 后 commit 中基线不可见（404）（`phase0/logs/dispatch-2026-11-13T18-12-56/reply.txt`）；r6 修正经会务确认（`phase0/logs/dispatch-2026-11-13T18-19-28/reply.txt`）：派单区分 material_commit 与 bundle_baseline_commit 两个 SHA、I3 改为与材料 commit 常量一致、证据 amend 进基线，r5 保持 BLOCKED 历史，本引导包为 r6 版。

## 1. 你的角色

- 独立审查者：直接读取 Git 与证据文件，输出三态结论，不采信开发方自述；
- 你的前任审查会话曾对本仓库 payload 选型给出 `result=BLOCKED`，提出 **15 项 required_boundaries 与 16 项 failure_paths**（原文见 §3-1）。本次复审核心问题：**修订是否逐项响应了这 31 项要求**。

## 2. 仓库与审查对象

- 仓库：`damwate/AIEO`（公开 GitHub）；分支：`main`；
- **审查基线（bundle_baseline_commit）：以派单消息给出的完整 40 位 SHA 为准**（tag `review-anchor/T-P1-903-r6` 指向该 commit）；派单同时给出 **material_commit**（聚合包导出源材料 commit）。两阶段关系：material_commit 经 `git archive` 导出聚合包，聚合包/分片/索引/BYTE_INTEGRITY 证据在其后的 bundle_baseline_commit 上追加，**两 commit 的 manifest 95 路径 blob 完全相同**；只允许按完整 40 位 SHA 读取，禁止回退分支 HEAD 或其他版本；审查过程中基线固定，不得静默替换；
- 输入材料 manifest：`phase1/manifests/T-P1-903-input-manifest.json`（同 commit，95 文件，**每文件含 git_blob_sha1 字段**）。**必须先按 §2.5 对象身份门禁完成入口核验后再开展审查；任一不符 → BLOCKED**；
- 辅助材料（身份核验用，非判定依据）：聚合包本体 `phase1/manifests/T-P1-903-input-bundle.tar`、分片 `phase1/manifests/bundle-parts/part-00.b64 … part-13.b64`、分片索引 `bundle-parts.index.json`、主索引 `T-P1-903-input-bundle.index.json`——唯一判定基准仍是 manifest；
- 审查对象：`docs/phase1/platform-contract-v1.0.md` §2.6（GitPointer 双向 payload 修订稿，当前标注"修订中，待复审"）及关联 §2.2/§10/§12/§13；`docs/phase1/decision-log.md` DEC-012~DEC-020。

### 2.5 入口核验协议：对象身份门禁 + 双层保证（r4 会务决议 + 用户批准，r5 生效）

**背景：** 三轮实测确认审查环境可读 ≤200KB 级文本、可取任意文件 tree/blob SHA-1，但无本地字节处理与密码学计算能力。r4 决议将保证责任重划分（**不是降低实质审查标准，而是验证责任重新分配**）：

**双层保证原则：** 材料完整性由主会话本地受控环境证明（BYTE_INTEGRITY_GATE，机器核验记录入库）；审查对象身份由独立审查者证明（OBJECT_IDENTITY_GATE，见下）；实质质量由独立审查者判断。两门禁分开记录，不得互相替代，不得合并成笼统 PASS。

**你的入口门禁（OBJECT_IDENTITY_GATE，零计算，全部为字符串/集合比对）：**

1. **(I1) 全量对象身份**：对审查基线 commit 执行**一次** tree 获取（如 GitHub API `GET /repos/damwate/AIEO/git/trees/<40位SHA>?recursive=1`），取得全部路径的 blob SHA-1 与 size；
2. **(I2) manifest 逐项比对**：manifest 95 个文件路径逐项比对 tree——blob SHA-1 与 manifest `git_blob_sha1` 一致、size 与 `size_bytes` 一致、无缺失/无重复/无额外声明路径；任一不符 → **直接 BLOCKED**；
3. **(I3) 辅助材料身份**：14 个分片 + TAR 本体 + 两个索引文件共 17 个路径，其 tree blob SHA-1 与分片索引声明逐项比对（防索引清单被单独替换）；主索引/分片索引 `bundle_source_commit` 与派单声明的 **material_commit** 一致（两阶段设计，见 §2，不得要求其等于 bundle_baseline_commit）；可选增强核验：对 material_commit 再取一次 tree，核对其 95 个 manifest 路径的 blob SHA-1 与 manifest 声明一致（不作强制门禁）；
4. **(I4) 如实登记**：报告 JSON `object_identity_gate` 字段记录 tree 获取方式、95/95 文件比对结果、14/14 分片、缺失/额外计数；不得把身份核验解释为已读取或已解码任何内容。**身份门禁与证据完整性分离登记**：身份核验通过不代表 BYTE_INTEGRITY 证据完整，两者各自记录。

**字节级完整性（不由你执行）：** 主会话本地 `manifest_tool.mjs`（recheck：commit blob SHA-256 全量重比 + tree blob SHA-1 身份；verify：磁盘字节 SHA-256）与 `bundle_gate.mjs`（分片逐项核验→按序拼接→解码→TAR 三项总哈希→解包→95/95 SHA-256/size）已执行并入库（路径见 §4 `byte_integrity_gate_reference`），记录的 `commit_sha256_anchored` 绑定 **amend 前聚合包 commit**（派单消息给出该 40 位 SHA 常量）；其与审查基线的差异仅为追加的证据目录，**输入材料 blob 完全相同**（可用 tree 比对自行验证，可选不强制）；原始门禁记录在生成后不被修改，以保持真实时间顺序。你在报告中以 `byte_integrity_gate_reference` 引用这些记录路径与结论，**不重算、不背书其正确性**；若记录缺失或自相矛盾 → BLOCKED。

**不得扩大解释（r3 会话确认，继续有效）：** Git blob SHA-1 仅为 Git 对象身份标识——不等价于 SHA-256 字节级完整性证明；不表示内容已被直接读取；不表示二进制内容已审查；不表示已排除碰撞或供应链攻击。

**门禁通过后** 直接进入 §3 实质审查：按需直接读取审查对象原始文本文件（审查对象均为文本，实测可整取；单个文件 ≤200KB 级）。二进制证据文件（PNG 等）只做身份核验，报告其"身份已核验、内容未读取"，不得声称已完成二进制内容审查。

**边界不变（A6/A7 延续）：** 身份门禁通过只代表材料可进入实质审查，不代表材料质量合格；§3/§4 实质审查一项不少；PASS/REWORK/BLOCKED 语义不变——门禁失败、环境读取受限、证据不足一律 **BLOCKED**，既不推导材料缺陷，也不推导 PASS。**升级条款：** 未来审查环境具备本地计算能力后，可重新评估恢复 A+ 全哈希独立核验；本协议是当前环境条件下的正式执行协议，不是永久降级。

## 3. 必做核对（逐项）

1. **前任要求逐项核对：** 读 `phase0/logs/payload-choice-inherited-reply.txt`（前任审查原始 JSON，含 15 required_boundaries + 16 failure_paths）。对 31 项逐项判定修订文本 `ADDRESSED`（给出条款位置与覆盖方式）或 `GAP`（说明缺口）。
2. **POC 真实范围核对：** §2.6.9–§2.6.13 申报的证据是否支撑其声明、有无 overclaim。证据路径：`phase0/logs/dispatch-2026-11-12T04-00-43/`、`dispatch-2026-11-12T04-41-46/`、`dispatch-2026-11-12T05-45-15/`、`git-pointer-remote-poc.md`、`git-pointer-remote-read-result.json`、`schema-tests.log`、`rework-inbound-tests.{log,json}`、`m1-registry-tests.{log,json}`、`m1-recovery-retry.json`、`m1-recovery-duplicate.json`、`m1-concurrency-evidence/`、`browser-virtual-list-2026-11-12T05-14-59/`、`third-round-regression-2026-11-12T05-33-03/`、`dispatch-binding-tests.{log,json}`。
3. **文本自洽核对：** §2.6.1–§2.6.8（1200 字节出站边界/manifest Schema/reviewed_commit 分离/权限与秘密/发布读取时序/配置/入站完整性/失败降级边界）内部自洽，且与 `contracts/v1.0/` 三份 GitPointer 相关 Schema 一致。

## 4. 判定规则与输出

- **PASS：** 31 项全部 ADDRESSED、POC 申报无 overclaim、文本自洽；MINOR 问题逐条列出但可复验；
- **REWORK：** 存在 MAJOR 缺口（boundary 未响应 / overclaim / 自相矛盾）；findings 编号**从 F-805 起**（历史 F-001~F-804 已用）；
- **BLOCKED：** 无法读取仓库、身份门禁失败、byte_integrity_gate 记录缺失/矛盾或证据不足——证据不足判 BLOCKED 而非 PASS；
- **PASS 效果边界：** 仅解除 §2.6"修订中，待复审"标注使其生效为契约文本，并授权主会话推进 §10 机器 Schema/契约测试落地；**不解除任何扩展场景限制**（DEC-017 门禁清单仍逐项待验收），不授权合并或发布动作。

**只输出一个 JSON（无其他包裹文本）：**

```json
{
  "result": "PASS|REWORK|BLOCKED",
  "reviewed_commit": "<40 位完整 SHA>",
  "input_material_commit": "<40 位完整 SHA>",
  "input_material_manifest_path": "phase1/manifests/T-P1-903-input-manifest.json",
  "input_material_manifest_sha256": "",
  "object_identity_gate": {"tree_call": "GET /repos/damwate/AIEO/git/trees/<sha>?recursive=1", "files_matched": "95/95", "sizes_matched": "95/95", "parts_matched": "14/14", "tar_and_indexes_matched": "3/3", "missing": 0, "extra": 0},
  "byte_integrity_gate_reference": {"recheck": "phase0/logs/blob-recheck-T-P1-903-r6/recheck-result.json", "bundle_gate": "phase0/logs/bundle-gate-T-P1-903-r6/bundle-gate-result.json", "records_present_and_consistent": true, "note": "引用不背书：主会话本地机器核验，审查者不重算；记录绑定 amend 前聚合包 commit（派单常量）"},
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
- 基线固定：审查引用的 commit/tag/manifest 在审查过程中不得静默替换（禁止隐式基线漂移）；
- tree 获取方式不限（GitHub API / 网页连接器均可），但必须覆盖基线 commit 全量路径且记录获取方式；无需任何本地解码/哈希/解包能力；
- 不要求重跑任何测试或历史 POC；浏览器环境事实不可假设；
- 1200 字节上限仅约束派单出站消息，你的 JSON 回复不受此限；
- 检测到上下文窗口上限或长期无反馈时，不在本会话重试——返回 BLOCKED 由主会话按轮换协议处理。
