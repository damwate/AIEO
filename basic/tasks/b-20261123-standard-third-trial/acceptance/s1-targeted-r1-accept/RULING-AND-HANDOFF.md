# S1 补证复核裁定与交 codex 处理

## 裁定（seq12 / s1-targeted-r1）
- 实际裁定：**REJECT（维持）**——证据不足，不升 PASS；明确「不代表缓存修复无效，也不代表 8870 重发失败」。
- 完整 reply SHA256：`7592f262376dd4e3e7f5563617b01d0ebd74123d7efb06f9df493dc943ac0567`（3878 B）。
- 会话：迁移新建 `6b056690-87b8-83ee-a67a-6be774fcc829`（旧 6b050b37 达 5 条 user，超新规 4 条上限）；迁移简报 1191B 自包含。
- 采集：worker SEND_CONFIRMED 后成功采集（artifact_sha256 与 reply 一致、归属 marker 唯一定位 start_resolved_by_marker=true、assistant UUID 稳定、stability 全过）；队列收尾因 fallback 键漂移（fallback-turn-0 vs 实采 10be2074）报 "confirmed send and collected round differ" 而 BLOCKED，按 L-018 以真实采集证据 reconcile → COMPLETED，**零重发**（见 QUEUE-STATE-SEQ12.json）。
- 被测 GDC `c3154aa0fcf0a8fdddb7b1c6f14e6ea205b439fc`；首轮 seq8 REJECT 原文保留。

## 审查方认可的证据
- GDC dev 快进至 c3154aa0（版本锚点 PASS）；PR#127/PR#128 修复代码有变更证据。
- 8870 bundle 归档 `acceptance/republish-review/dep-*.js`（远端 7dfdc858 树可读）含 asset_versions、onTextureSettled/onTextureStart 特征（部分 PASS）。
- S3 已闭环不重开；DEC-010 用户拍板；不合并/发布/付费。

## 四项未通过证据（E1-E4，最小补证要求）
| 编号 | 缺失 | 最小要求 |
|---|---|---|
| S1-E1 | c3154aa0 重发执行记录 | 原始部署日志：构建版本 + 部署目标 8870 + 执行时间 + 结果 |
| S1-E2 | 用户抽测原始记录 | 原始记录：时间 + 操作步骤 + 结果 + 异常 |
| S1-E3 | 重发后测试日志 | 测试执行原始日志，对应重发后 8870 环境 |
| S1-E4 | 对照用本地构建产物 | 对应部署的构建产物 + SHA256 |

四项均需记录：Git commit SHA、文件相对路径、文件 SHA256、原始证据来源、与 8870 重发事件的关联。**不接受事后补写总结替代原始执行证据；原始记录不存在不允许编造补齐。**

## 降档条件（审查方给出）
若 E1-E4 无法完整恢复，可降档为 **S1: PARTIAL / NOT VERIFIED**：
- 允许认可：修复代码已合入指定 commit；归档 bundle 有修复特征；8870 产物有部分静态证据。
- 不允许宣称：已证明 8870 运行 c3154aa0 构建、重发后抽测通过、完成线上验收。
- 热启动缓存命中未做浏览器复测、线上产物与源码未逐字节锁定——维持原边界，不新增为本轮强制补证项。

## 交 codex 的疑难项（按用户分级规则）
网页 ChatGPT 已裁定并明确「基于证据摘要、未独立读取远端、不应伪造 SHA 绑定」，且 E1-E4 属历史原始记录核验/实际测试——按用户「网页验证不了的实际测试或疑难杂症交 codex」：
1. 能否在 GDC 仓/部署环境找回 c3154aa0→8870 的原始部署记录（E1）与重发后测试日志（E3）？
2. 能否找回 20:30 用户抽测的原始记录（E2）？若无原始载体，是否按降档 PARTIAL/NOT VERIFIED 处理？
3. 能否定位并 SHA256 绑定 c3154aa0 本地构建产物（E4）？
4. 若四项均不可得，确认采用降档结论 PARTIAL/NOT VERIFIED，S1 保持验收中、不伪造证据。

## 边界
任务保持**验收中**；不合并/发布/付费；DEC-010 用户拍板；S3 已闭环不重开；首轮 seq8 REJECT 保留。

## 本地验证不了的环境的处理（用户补充指示）

E1-E4 中若需实际线上/部署环境才能核验、而本地未安装相应环境，按用户指示推给用户，由 codex 评估**是否发布到线上验证**；用户会找时间验证。不因本地缺环境卡住、不伪造证据。发布到线上属 DEC-010 高危操作，须用户本人拍板。
