# 步骤清单：b-20261117-h2-contract-findings-evolution

- 被测基线：36b9adebfe42ef14de5feda4f2947ab40d094d4b
- 方案依据：DEC-097 ChatGPT 实读拍板（#1=A/#2=A）+ DEC-096 路径 B + 用户授权细节由 ChatGPT 拍板。每步交 ChatGPT 独立验收（模块四）。
- 步骤节奏：S1 设计（含规划复审定稿三技术点）→S2 #1 v1.1 契约→S3 四腿切 v1.1→S4 #2 测试+文档→S5 交付。每项（#1/#2）独立验收——S2+S3 合并为 #1 一项验收，S4 为 #2 一项验收（ChatGPT 要求"两项均独立验收"）。

## S1 设计（PASS——规划复审定稿）

- ①本步骤目标：固化实读证据、v1.1 契约设计、四腿切换方案与三技术确认点；产出 ChatGPT 规划复审定稿。
- ②修改文件：无（设计步，产出落 acceptance/design-notes.md）。
- ③修改内容：四契约 findings 现状对照；v1.1 统一 findings 定义草案；三确认点；回归清单。
- ④执行结果：design-notes.md 成文；规划复审定稿三点=①物理共享 _defs+addSchema（稳定 $id、每实例注册一次、禁远程加载）②GPT-03 新增报告校验（保留 envelope，失败 fail-closed，不重审业务逻辑）③standards_matrix[].findings 保持 string；#2=A 四型 BLOCKER 语义。
- ⑤测试结果：不适用（设计步）。
- ⑥验收证据引用：dispatch-2026-11-17T07-54-13（规划复审，reply 1587B SHA-256=`635e60469ac3bcee3aba6a1229a80eda82db0583a28f4c3bd35cde2bec64369a`，"最终定案：#1 三项依次为前者、增加校验、保持 string；#2=A"）；**验收结论：PASS**。

## S2 #1 新增 v1.1 四契约（本地完成；独立验收待派）

- ①本步骤目标：在 contracts/v1.1/ 新增统一 findings 定义 + 四份 v1.1 结构化契约；v1.0 四文件零改。
- ②修改文件：contracts/v1.1/（新增 _defs/findings.schema.json + review-report / arch-review-report / test-acceptance-review / engineering-audit-report 四份 schema.json）。
- ③修改内容：v1.1 契约基于 v1.0 逐字段复制，仅顶层 findings 改 `$ref` 统一结构化定义（稳定 $id，物理唯一）；`standards_matrix[].findings` 保持 string（规划复审③）；`$id`/title/description 标 v1.1 历史兼容；其余字段/约束零改动。
- ④执行结果：五个 schema 文件落位，JSON 合法；v1.0 四文件 Git 字节级零 diff（验收硬指标，实查通过）。
- ⑤测试结果：新增 `test_schemas_v11.mjs` 6/6（结构化原样通过/必填与 severity 枚举负例/legacy string[] 拒绝/附加字段/v1.0 历史兼容/矩阵内 findings 保持 string）；既有 `test_schemas.mjs` 141/141 零回归。
- ⑥验收证据引用：dispatch-2026-11-17T08-36-25（#1 最终 PASS，reply SHA-256=`3b4c094c41af0b7631a4a52404519aa0e534ce12870da5b86aa43cd26c76b5d1`，"#1 PASS：v1.1 契约 6/6…新增证据补齐"；源码 commit 245108c3、证据 commit 4af23cc）；**验收结论：PASS**（经 08-22 未推送拒判→08-25 源码核验通过但缺运行证据→08-38 证据补齐三轮，返工表登记）。

## S3 #1 四腿报告校验切 v1.1（PASS，与 S2 合并为 #1 一项验收）

- ①本步骤目标：四腿 *_SCHEMA 路径与 CONTRACT_VERSION 切 v1.1；Ajv 加载统一 findings 定义（addSchema）；结构化 findings 原样传递。
- ②修改文件：phase1/tools/arch_review_leg.py / test_acceptance_leg.py / engineering_audit_leg.py / review_leg.py + 对应 test_*.py。
- ③修改内容：三腿（arch/test/eng）SCHEMA 路径 v1.0→v1.1、CONTRACT_VERSION→1.1、Ajv 脚本 `addSchema(findingsDef)`；测试 fixture findings 由 string[] 改结构化对象（test-only）；GPT-03 按规划复审定案②(C)——保留 envelope 校验，新增 `issues[]` 必须字符串数组的 fail-closed 显式校验+ledger(R4_ISSUES_VALID)，不映射 findings、不构造完整 review-report、不重审业务逻辑（经追加会商 dispatch-2026-11-17T08-06-08 ChatGPT 裁定 C）。
- ④执行结果：四腿切换完成；GPT-03 补 R4_ISSUES_VALID 校验；envelope/请求体 schema 仍 v1.0 零改。
- ⑤测试结果：四腿合跑 **118/118**（基线 116 + 新增 test_05c issues fail-closed + test_25 多项 BLOCKED）；三腿 fixture 改结构化后 Ajv v1.1 通过；lint 0。证据 acceptance/local-test-runs-legs.log。
- ⑥验收证据引用：dispatch-2026-11-17T08-36-25（reply SHA-256=`3b4c094c41af0b7631a4a52404519aa0e534ce12870da5b86aa43cd26c76b5d1`）；ChatGPT 源码核验确认"三腿 addSchema、GPT-03 R4_ISSUES_VALID 符合最终裁定 C、四份 v1.0 schema 与基线 SHA 一致"；**验收结论：PASS**（#1 一项，与 S2 合并验收）。

## S4 #2 矩阵 BLOCKER 语义测试+文档（PASS）

- ①本步骤目标：补 engineering-audit 矩阵×批次 BLOCKER 四型边界测试+文档钉死既有语义（零契约改动）。
- ②修改文件：phase1/tools/test_engineering_audit_leg.py、acceptance/blocker-semantics.md。
- ③修改内容：新增 test_25 多项 BLOCKED→批次 BLOCKED/DO_NOT_SUBMIT（单项 test_09 / 无 BLOCKED test_09 / 矛盾 test_10/11/24 既有覆盖）；blocker-semantics.md 钉死 8 条既有规则+四型测试映射表+范围声明（零契约字段/版本变更）。
- ④执行结果：四型覆盖齐全（单项/多项/无/矛盾）；语义文档落位。
- ⑤测试结果：engineering_audit_leg **25/25**（基线 24 + test_25）；合跑 118/118；契约零改动（v1.0/v1.1 均未为 #2 增字段）。
- ⑥验收证据引用：dispatch-2026-11-17T08-36-25（#2 最终 PASS，reply SHA-256=`3b4c094c41af0b7631a4a52404519aa0e534ce12870da5b86aa43cd26c76b5d1`，"#2 PASS：BLOCKER 四型语义及测试已核验，独立工程审计 25/25 通过；lint/AST 证据补齐"）；**验收结论：PASS**。

## S5 交付（待验收）

- ①本步骤目标：合跑+交付登记+C1 绑定+两项独立验收收口。
- ②修改文件：delivery.md、task-brief.md、acceptance/。
- ③修改内容：交付七要素；被测 commit；后续建议（等级 B 试运行 Charter）。
- ④执行结果：delivery.md 成文（七要素+C1 绑定）；task-brief 状态=完成/最终结果=PASS。
- ⑤测试结果：四腿 118/118 + v1.1 契约 6/6 + v1.0 契约 141/141 + 工程审计 25/25 + lint/AST 0。
- ⑥验收证据引用：dispatch-2026-11-17T08-36-25（reply SHA-256=`3b4c094c41af0b7631a4a52404519aa0e534ce12870da5b86aa43cd26c76b5d1`，"#1 PASS #2 PASS 可交付"）；**验收结论：PASS**。被测 commit 245108c379335453abe250131908cfe747bb9d3a（证据 commit 4af23cc86b9927fcc8e0e8236ddccc22250801e5）。

## 返工记录表

| 轮次 | 发现 | 处理 | 结果 |
|---|---|---|---|
| 验收①08:24（dispatch-08-22-13） | 被测 commit 245108c3 提交后**未推送**，GitHub 422/404，审查方拒把提交方测试汇总当独立证据 | 流程缺口（漏 push）→check-push.mjs 推送，SHA 不变 | FAIL（流程，非代码） |
| 验收②08:25（dispatch-08-25-03） | 重派发送成功但采集 INBOUND_WINDOW_COMPLETENESS_UNPROVEN →禁重发→L-018 补采（锚定最后 user+标记/前轮拒判 SHA 排除七查全过）得 reply 711B | 补采得审查方结果：commit 仍未可读（推送传播延迟/审查方缓存）→FAIL 仍属证据不可核验 | FAIL（证据不可核验） |
| 验收③08:34（dispatch-08-32 复核） | 审查方成功读取 commit 245108c3：源码核验全通过（统一_defs/四契约$ref/三腿addSchema/GPT-03 C/v1.0 SHA一致/141/141/118/118），但缺 v1.1 6/6 实际输出、lint0、独立 25/25 运行记录三项 | 三项证据落 acceptance/evidence/（v11-schema-run.log/eng-audit-25-run.log/lint-evidence.log），commit+push 到 4af23cc（源码 commit 不变） | FAIL（仅证据缺口，非实现缺陷） |
| 验收④08:38（dispatch-08-36-25） | 审查方读取证据 commit 4af23cc，三项缺口补齐 | #1 PASS #2 PASS"可交付"，reply 462B SHA-256=`3b4c094c…76b5d1` | **PASS（最终）** |

- 全程被测源码 commit 恒为 245108c379335453abe250131908cfe747bb9d3a（返工均为流程/证据补齐，非代码缺陷，未改源码）。
- 会话消息数提示：审查会话 6afc054f 本任务累计已发送 6+ 条 user 消息（超 DEC-084 4 条阈值）——因处任务中段（独立验收闭环中）、迁移会打断证据链与 attribution，按 DEC-084"暂不迁须记录理由"，本任务收口后再评估迁移。
