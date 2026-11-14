# T-P1-907 RUN-RECORD：F-003 测试执行 Worker 最小版全链记录

## 1. 执行形态声明

主会话 ZCode 腿真实开发（任务书 v0.5 §1 执行形态，不冒充独立 CLI 会话）；GPT-01 腿真实规划收发（规划证据 `phase0/logs/dispatch-2026-11-14T02-49-55/reply.txt`，19102 字节，SHA-256 `2920da047d43c6b984914a465b6e27d0cac4c928eb76f6bc716947b263b29d5d`，实现严格按其 §2 CLI/命令清单/§3 两次执行分离/§4 Ajv 两层/§5 顺序/§6 布局执行）。开工授权 DEC-028（用户拍板 2026-11-14）；本记录不构成验收结论，独立验收另行提交。

## 2. 环境事实

- 代码基线：main=`c4a9dc22319868451ebe560ebfc58a72ccdb0085`（DEC-028 登记提交）；开发分支 `feature/T-P1-907-test-worker` worktree=`runtime/t-p1-907/wt-dev`；证据分支 `feature/T-P1-907-evidence` worktree=`runtime/t-p1-907/wt-ev`（两分支同基线切出，历史不重写）。
- 运行时目录：`runtime/t-p1-907/`（gitignored，任务书 §9 F-003 专用；Worker 默认无业务凭据，全程未使用任何 service token）。
- 工具链：Python 标准库 Worker（无第三方依赖）；Ajv 复用 904 环境（`phase0/tools/node_modules/ajv` 8.20.0，未新增依赖）。

## 3. 执行清单（全部真实进程，零 mock）

| 步骤 | 内容 | 证据 |
|---|---|---|
| S1 | 任务书 v0.5 五轮会务评审无保留 PASS+用户开工拍板 | `e869d0d`/`38aa2d9a`；dispatch-2026-11-14T02-44-38；DEC-028 |
| S2 | `phase1/tools/test_worker.py` 实现并提交 dev 分支 | dev commit `b711160d374b7a0dfc3f6445b393736a4949d1f6`（py_compile 通过；argparse 六参数；硬门禁完整 SHA+worktree/toplevel+HEAD 精确比对+清单校验空清单拒绝+允许列表禁 shell 包装+超时 1..600s；逐命令 argv Popen shell=False 原始字节三件套；§5 五行穷举状态计算无人工覆盖入口；报告含 evidence_index） |
| S3 | EXEC-907001 正向执行：command-001 `bundle_gate --help`（exit 0，stderr 空）；command-002 903 夹具回归 `--commit ca3e5cfe…`（exit 0，`parts=14/14 tar_ok=true unpack=95/95`，missing/extra/mismatched=0 见二 层证据） | `EXEC-907001/`（三件套×2+test-report.json，EXECUTED_PASS/PASS，worker 退出码 0）+`bundle-gate-second-layer/`（被测程序自身机器结果，两层交叉） |
| S4 | EXEC-907002 失败采集演示：无参调用 `bundle_gate`（真实 exit 2，stderr `bundle_gate: 缺 --commit`）；**Worker 正确识别失败并写入报告** EXECUTED_FAIL/REWORK，worker 退出码 1 | `EXEC-907002/` |
| A4 套件 | EXEC-907003：TIMEOUT 真实触发（node 60s 任务 3s 超时，status=TIMEOUT exit_code=null）+失败后继续执行（command-003 exit 0）→整体 EXECUTED_FAIL/REWORK；EXEC-907004：START_ERROR 真实触发（受限 PATH 仅含 git 目录，node 不可解析，Popen 真实抛 FileNotFoundError，两命令均 START_ERROR+空 stdout/stderr 文件+异常 meta+继续执行后续） | `EXEC-907003/`、`EXEC-907004/` |
| 拒绝路径 | R1 空清单/R2 短 SHA/R3 HEAD 不一致（b711160≠c4a9dc2 指明不自动 checkout）/R4 无效 worktree/R5 shell 包装器 `sh -c` 不在允许列表/R6 超时超上限 9999——六项全部 BLOCKED exit=2、零命令执行、无输出目录产生 | `inputs-and-rejections/R1..R6.{out,err}` |
| S6 | Ajv 两层：第一层 `node phase0/tools/test_schemas.mjs` **141/141 PASS exit=0**（904 环境回归）；第二层 EXEC-907001+EXEC-907002 实际报告分别 Ajv2020 strict 校验 **均 PASS** | `schema-validation.log` |
| S7 | 双分支提交（dev=worker 代码单文件；evidence=本目录）+独立验收另行 | 本记录 |

**commit_sha 口径（不混淆）：** 报告内 `commit_sha`=`b711160…`（Worker 实际核验的 worktree HEAD=被测代码版本）；夹具回归参数 `--commit ca3e5cfe…`（905 历史锚定的被测材料来源，复现历史回归命令）——两个 SHA 各司其职，与 GPT-01 规划 §一 要求一致。

## 4. 验收八项对照（任务书 §11；对照≠结论，验收归独立验收）

| # | 要求 | 本记录证据 |
|---|---|---|
| A1 | 真实仓库真实 commit | dev SHA `b711160…` 完整 40 位；Worker rev-parse HEAD 精确比对通过（R3 反例证明不一致即拒绝） |
| A2 | 正向真实通过 | EXEC-907001 两命令 exit 0 + `bundle-gate-second-layer` 14/14、tar 3 match、95/95 |
| A3 | 失败真实发生 | EXEC-907002 exit 2 真实非零+失败报告 EXECUTED_FAIL/REWORK |
| A4 | Worker 异常处理正确 | TIMEOUT（907003-002）+START_ERROR（907004，Popen 真实 OSError）+继续执行（907003-003、907004-002）+六项 BLOCKED 拒绝 |
| A5 | 日志证据完整 | 四次执行全部命令三件套（原始字节+stdout/stderr 双 SHA+meta）+`SHA256SUMS` |
| A6 | 报告符合冻结契约 | 两份报告 Ajv PASS（141/141 环境回归前置）；`test-report.schema.json` Blob `1bda905c…` 未改动 |
| A7 | 安全边界 | `security-scan.txt` R1-R5 双范围 CLEAN（52 文件+git HEAD 树，0 raw）；秘密未进 Git；Worker 无凭据 |
| A8 | 工程交付完整 | 双分支+本 RUN-RECORD+独立验收（另行）；范围核对：未触碰 M1/M4/契约/F-001/调度（§8） |

## 5. 复盘（如实登记）

1. **START_ERROR 首演未触发：** EXEC-907003-001 原以 `python3` 缺失假设设计，本机 python3 实际可解析（exit 0）——如实改用受限 PATH 真实触发（EXEC-907004），Popen 真实抛 FileNotFoundError，非伪造返回值；零 mock 红线保持。
2. **退出码语义：** Worker 退出码 1=存在失败命令（预期设计，EXEC-907002/003/004 均预期内），不代表 Worker 自身故障；退出码 2 仅输入校验 BLOCKED。
3. **CONTINUE 语义边界：** EXEC-907004 两命令均 START_ERROR 证明"启动异常也留下完整执行记录且继续后续"；EXEC-907003 证明"TIMEOUT 后继续且后续可成功"。
4. **方案 B 落实：** 全程零 REST 调用、零凭据使用；报告 `artifact_id=null`。
5. **证据目录即归档直拷：** runtime 执行产物经扫描 CLEAN 后原样拷贝至本目录（原始字节未静默修改，`SHA256SUMS` 与实际归档字节一致可复核）。

## 6. 独立可验证锚点

- dev 分支完整 SHA：`b711160d374b7a0dfc3f6445b393736a4949d1f6`（base `c4a9dc22319868451ebe560ebfc58a72ccdb0085`）
- 证据分支：`feature/T-P1-907-evidence`（同 base，本提交）
- 任务书：v0.5，`e869d0d5160ac94e92c02351b054ccaeb5670932` blob `38aa2d9a…`（定稿后未改动）
- 规划：19102B SHA `2920da04…`（02-49-55）
- Schema：`contracts/v1.0/test-report.schema.json` blob `1bda905cfbfc5c223c86dfe7b421848b79ba6d2e`
- Ajv 回归：141/141；两报告独立 PASS（`schema-validation.log`）
- 扫描：`security-scan.txt`（自录 SHA 于 `security-scan.sha256`），result CLEAN
- 被测夹具锚：`ca3e5cfe7d56a4951a74e1663443310c4455dc4a`（905 S7 同源）

## 7. 交付物

`phase1/tools/test_worker.py`（dev 分支 `b711160…`）+ 本证据目录 55 文件（4 执行目录 28 文件+输入与拒绝 19+二层 2+schema 日志 1+baseline 1+SHA256SUMS 1+RUN-RECORD 1+扫描 2）+ 双分支推送+独立验收。

**计数修正（首轮验收 A8 REWORK，如实登记）：** 本节初稿写 53/输入与拒绝 17，系主会话漏计 `commands-a4starterr.json` 与 `commands-a4suite.json` 所致；独立验收实查 git compare 为 55/19（验收报告 dispatch-2026-11-14T03-06-25）。已按实际改正如上，计数沿革 53→55 保留不掩盖。Worker 功能与四组真实执行证据无需重跑。

## 9. 独立验收记录

- **首轮（dispatch-2026-11-14T03-06-25，新空白会话，reply 5448B SHA-256 `637d80186d157d459e142b78306b73fd6d0d12329f59e50e59b99e4bb028ef3d`，验收基线 c4a9dc2）：** A1~A7 七项全 PASS（含源码 Blob `0e4d7ab9` 193 行初审、四组运行证据、Ajv 141/141+两报告、扫描 CLEAN、方案 B 核实），A8 REWORK 唯一项=本 §7 计数错误（53→55、17→19）；BLOCKED 0 项；会务意见"核心实现和真实执行证据质量良好，不需要推翻 Worker 实现，只需完成 A8 文档修订和限定复核"。规划 reply 原文因未入库致 404 读取限制——本修订提交已将规划证据（02-49-55）与验收证据（03-06-25）及两份派单简报随证据分支入库，供限定复核按 SHA 读取。
- **A8 限定复核（dispatch-2026-11-14T03-24-12，新空白会话，reply 4893B SHA-256 `f46f3b8592e479321d982240645f3857d89e623a5f3258b74976c3f046f653be`，复核对象=本修订提交 `f44bbca`）：** A8 PASS（A8-1 计数修正准确 53→55/17→19 且两份漏计文件实读有独立 Blob；A8-2 §9 准确保留首轮 REWORK 沿革；A8-3 规划证据 19102B SHA `2920da04` 读取成功、404 限制解除；A8-4 验收证据+两份派单简报入库形成完整证据链）+Git compare 核验未重写历史、dev 分支 `b711160` 未动、main 未被修改。**最终三态：8 PASS / 0 REWORK / 0 BLOCKED——T-P1-907 八项验收全部具备 PASS 结论。** 会务边界重申：不构成合并授权（DEC-010）、DEC-017 不解除、F-003 处置另行登记、不要求重跑四组真实执行。

## 8. 边界声明

本任务未修改 M1/M4/冻结契约/decision-log 既有条目；未实现调度/批次/并发/重试/REST 登记（F-001 范围）；DEC-017 未解除；完成后的独立验收通过不因开工授权自动获得——合并/发布需用户另行批准（DEC-010）；FEASIBILITY F-003 关闭或降级待验收后登记。
