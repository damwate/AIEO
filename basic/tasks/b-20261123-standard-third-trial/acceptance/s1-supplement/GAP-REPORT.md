# S1 针对性补证复核 · 历史记录核查与缺项报告

> 依据用户 2026-11-24 指令：对照 S1 原回复（seq8/`s1-formal`，reply SHA256=`87b19055d5d8c15487cd3c7759ea8bacb4fdfdba1b7f838cb6ae7b3208a97a39`）提交「可核查的重拉与发布记录、8870 部署产物和 c3154aa0 的对应证据、用户抽测原始记录及对应测试日志」；**若历史记录找不到，先回报具体缺项**；现有 bundle 特征核验、未做的浏览器复测、未锁定的逐字节对应关系按原边界登记。
> 本文件只登记真实可核查项与确实找不到的项，不补造日志、不把二手转述冒充原始记录（L-018 增补 (c)：证据不足 FAIL 与代码缺陷 FAIL 分开处置，不伪造历史日志）。

## 0. 口径前提（S1 原回复的路径错位）

S1 原回复第⑥项写「指定 EVIDENCE.md、steps.md 尚未能从该 SHA 读取」，并「在被测 SHA 下均未成功取得文件内容」。这里的「被测 SHA」指 **GDC `c3154aa0fcf0a8fdddb7b1c6f14e6ea205b439fc`**（业务代码仓）。但 `EVIDENCE.md` / `steps.md` / `dep-*.js` 是 **AIEO 流程仓**的文件，不在 GDC 树中。S3 轮裁定已确立正确口径：AIEO 证据按 **AIEO 提交树**读取（它已能从 `7dfdc858…` 读出 AIEO 文件的 Git Blob SHA）。因此 S1 补证的第一要务是把每项证据标明**所属仓 + 可核查的提交/产物**，而非继续从 GDC SHA 找 AIEO 文件。

## 1. 已找到、可核查的记录

| # | 用户要求的证据 | 实际可核查载体 | 归属 / 绑定 |
|---|---|---|---|
| A | 重拉（re-pull）记录 | GDC 仓 `git reflog`：`c3154aa0 refs/heads/dev@{0}: merge origin/dev: Fast-forward`、`HEAD@{11}: merge origin/dev: Fast-forward`、`refs/remotes/origin/dev@{0}: fetch --all --prune: fast-forward`；`git branch -a --contains c3154aa0` 命中 dev + origin/dev | 本地 GDC reflog；`c3154aa0` = `Merge pull request #128`（2026-11-23 17:55:17 +0800） |
| B | 8870 部署产物 | `acceptance/republish-review/dep-{index,admin,bill,three}.js` 四份线上 bundle 副本（AIEO 提交 `7dfdc858…` 树中，Blob SHA 分别 `cbb198b4…`/`ed9e621e…`/`eebe1602…`/`259f7f2d…`） | AIEO 仓补证归档 `7dfdc858891d4319088c8744618fb48d7db65f4a` |
| C | c3154aa0 对应证据 | GDC 提交对象本身（Merge PR #128）+ 上述 reflog fast-forward；`EVIDENCE.md`（Blob `1e713d48…`）记录线上 bundle 的 `asset_versions`(PR#127)、`onTextureSettled/onTextureStart`(PR#128)、渲染就绪门特征，以及「本地 dev@c3154aa0 全新构建特征等价、hash 不同」 | GDC `c3154aa0…` + AIEO `7dfdc858…` |
| D | 操作时间线 | `steps.md` 18:25（ff-only 66ead431→c3154aa0）、18:52（R0' 重新发布复核）、20:30（用户热启动抽测「还行」）；`delivery.md` / `HANDOFF.md` / `CODEX-HANDOFF.md` 同一转述 | AIEO 仓 `7dfdc858…` 树 |

## 2. 确实找不到的具体缺项（按用户指令先回报，不派 S1 单）

| # | 用户要求 | 缺项 | 检索范围与结论 |
|---|---|---|---|
| G1 | 可核查的**发布／重新发布记录**（c3154aa0 对应的 8870 重发动作） | **未找到 c3154aa0 的重新发布执行记录** | `phase0/tools/gdc-{build,swap,up,health,verify-deployed}-66ead431.sh` 全部是 **66ead431** 部署脚本（build/swap/up/health/verify），镜像与 `src-66ead431.tar.gz` 同属 66ead431；`.git` reflog 显示 66ead431 是 dev 的上一状态。无任何脚本/日志记载「把 c3154aa0 构建发布到 8870」的命令、时间、操作者、结果。`EVIDENCE.md` 只描述「线上 8870 已是新 bundle」的**特征核验**，不是发布动作记录 |
| G2 | **用户抽测原始记录** | **未找到原始记录** | 「还行」仅见于 `steps.md` 20:30、`delivery.md`、`HANDOFF.md`、`CODEX-HANDOFF.md` 的**二手转述**；无带时间戳的会话原文、截图、录屏或独立载体。`.codebuddy` 会话日志仅存当前会话（2026-11-24），11-23 会话日志未保留；`.playwright-mcp/console-2026-11-23T08-52…` 是 8870 页面 console（401/502），非抽测原始记录。原回复第④项「用户抽测原始记录未能核实」成立 |
| G3 | **对应测试日志**（R0' 重发复核） | **未找到对应测试执行日志** | `phase0/logs/gdc-t1-browser-e2e-20261123.md` 是 **66ead431 部署期 T1 浏览器 E2E**（场景 2「热启动缓存命中应放行」FAIL 真 bug），不是 c3154aa0 重发复核的测试日志；`acceptance/test-logs/` 内无 republish/8870/c3154aa0/warm/spot 相关日志。原回复第⑤项「代码中有测试，但不能据此证明本轮测试实际执行」成立 |
| G4 | c3154aa0 本地构建的**逐字节对应** | 本地 `dist`（`index-XNfZ5k4u.js` / `ThreeView-CRvc29_m.js`）产物**未归档** | `EVIDENCE.md` 仅文字说明「本地全新构建 hash 不同但特征等价」，无产物文件、无 hash 清单；这正是残留项②「线上 bundle 与源码树未逐字节锁定」 |

## 3. 按原边界登记（不扩大表述，保持原状）

1. **bundle 特征核验**：`EVIDENCE.md` 已有的 `asset_versions` / `onTextureSettled/onTextureStart` / 渲染就绪门特征核验保留，仅作为「特征等价」证据，**不升级为逐字节一致或完整行为复验**。
2. **未做的浏览器复测**：残留项①「热启动缓存命中放行（上次 E2E FAIL 场景）未做浏览器复测」保留，**明确保留为未执行**，不写成 PASS。
3. **未锁定的逐字节对应关系**：残留项②「线上 bundle 与源码树的可复现构建未逐字节锁定」保留。

## 4. 处置结论

- S1 存在 4 类历史记录缺项（G1 发布记录、G2 抽测原始记录、G3 对应测试日志、G4 本地构建产物）。按用户「若历史记录找不到，先回报具体缺项」与「S1 补齐再发」，**本轮不发起 S1 派单**，先回报缺项，等用户决定如何处置（补采 / 降档 / 按边界登记后仅澄清）。
- 不补造历史日志、不把二手转述冒充原始记录、不改已 PASS 源码（L-018 增补 (c)）。
- 发布边界维持：不合并 main/dev、不生产发布、不付费验收；任务保持**验收中**。
