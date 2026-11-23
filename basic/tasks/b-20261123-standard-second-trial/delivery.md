# AIEO 标准版第二次多任务试运行测试报告

- 试运行ID：b-20261123-standard-second-trial
- 日期：2026-11-23（UTC 时间线；报告收口 06:35Z）
- **版本**：v1（首次成文）
- 授权：用户指令（requirement.md 原话："AIEO标准版并行解决如下问题，请详细记录过程并给出测试报告（此为标准版第二次测试）"）
- 治理依据：standard/WORKFLOW.md v0.1（生效）+ parallel-governance-draft.md v0.1（M2，DEC-063）+ Basic WORKFLOW v0.3 六模块 + AGENTS.md 节点自主推进授权（L-020）
- 基线：AIEO main=`0c573e0d1e8234f0d5154d1abc1239cafff93bb0`（开工实查）；BMS=`cf79e4c2d2b78ec6f27bbc0c76a8c274f5ca0d36`（master）；GDC=`5c9ba1558a58b29633ea731fcdb563361b4c343b`（dev）；AISVC=`0c53c963d93e33c15ebd4498742828fcf9ffc57d`（main）
- 边界：全程只读目标项目，**零代码修改**；交付=过程记录+测试报告+实施就绪方案；不立项、不授权实施（承袭首次试运行维持边界）。

## 一、试运行设计

| 要素 | 实现 |
|---|---|
| 并行模式 | M2 受控并行：任务级并行 + 派单通道 FIFO 串行（session_lock 全局互斥，default 实例）；**并行任务数=2**（首次试运行 P0-1 超限整改项） |
| 任务隔离 | 两子任务各自 task_id/任务包/本地分析文件/派单现场/回执 SHA256；独立新会话 UUID，互不复用 |
| 执行结构 | 主会话=调度+两任务本地盘点编排；2 个只读 Explore 子代理并行执行 T1/T2 本地分析（任务级并行实证）；主会话串行执行两轮派单 |
| 纪律装载 | AGENTS.md + AI-DEV-LESSONS L-014/L-017/L-018/L-020 + 环境清单 §4/§5（开工实查：系统代理 1080，Chrome 走系统代理）+ chatgpt-web-dispatch skill 已读 |
| 与首次差异 | ①并行数 2 不超限；②两任务包独立文件所有权与状态同步（首次 R2 REJECT 项）；③⑥证据引用逐步骤绑定 dispatch 目录+64 位 SHA256（L-017 逐项化） |

## 二、执行时间线（盘上证据：phase0/logs/dispatch-2026-11-23T*）

| 时刻(UTC) | 事件 |
|---|---|
| ~06:10 | 开工：读 AGENTS/handoff/首次试运行报告/两轮 BMS 裁定/AISVC 方案/GDC RCA；实查四仓基线 |
| ~06:15 | 建三任务包（母+两子）；环境清单 §4/§5 与派单 skill 装载；两子代理并行启动做本地盘点 |
| ~06:19 | 尝试用 MCP 浏览器核验 reviewer 会话 6b03c2a0 → 未登录态（登录按钮+Not Found），判定为**非上下文上限**（L-018 2026-11-23 增补 (a) 判别）；改用 gpt_dispatch 专用 profile 派单 |
| 06:28:37 | **T1 派单** → 06:31:59 COMPLETED（3m22s）；消息 907B；会话 `6b03dd4f-6e6c-83ec-8eb9-58df9b8393a6`；reply 5885B，SHA256=`b2f4914b…3ce616` |
| 06:32:05 | **T2 派单** → 06:35:06 COMPLETED（3m01s）；消息 913B；会话 `6b03de1d-ee04-83ec-8bd6-0c01824b8b2f`；reply 6371B，SHA256=`9ae55f66…563a34` |
| ~06:35- | 回执归档（SHA256 复核一致）→ 两方案 proposal.md → steps.md 回填 → ST-05 检查器迭代（S1/S2 ⑥ 补 dispatch+SHA）→ 报告成文 |

两单通道串行总耗时 6 分 23 秒，全部发送双验通过、一次采集成功、零补采零重派。派单间隔 6 秒（FIFO，无并发绕过锁）。

## 三、M2 复盘五指标（区分观察结果/机制验证/估算——首次试运行 R1 整改口径）

| 指标 | 结果 | 性质 |
|---|---|---|
| 工作区污染次数 | 0 | **观察结果**——三目标仓库只读，无污染机会，不证明隔离机制 |
| 文件与分支冲突次数 | 0 | **观察结果**——未建 worktree/任务分支（见 §四 P0-2），隔离机制**仍未被验证**（与首次试运行同） |
| 派单归属错误次数 | 0 | 观察+交叉判定：两会话 UUID 独立；T2 首行完整回显 marker，T1 仅自拟标题（同首次现象），归属=会话 UUID+时间线+简报语义三元组交叉判定 |
| 验收会话串用次数 | 0 | **成立**——两会话 UUID 互不相同且均 `--new-session` 新建，有一手派单日志证据 |
| 并行净收益 | **为正（估算，区间明确）** | 本地盘点：两子代理并行墙钟≈126s（各自 94s/100s/126s），串行估算≈320s，**节省≈190s**；派单通道串行 6m23s 为固定成本，不可并行（M2 硬约束）。合计节省>额外成本，但成本含本次治理记录开销，为估算非实测 SLA |

**总评：** 通道串行不是瓶颈（单轮 3m01s–3m22s）；两任务在证据与归属层面零事故；**本次尚未动目标项目代码，故"零冲突"仍是观察结果，M2 隔离机制（四件套）依旧未被验证，不宣告 M2 试运行正式通过**——与首次试运行维持边界一致。

## 四、首次试运行整改项复核

- **P0-1 并行任务数超限（首次：3 任务并行 > M2 §4.3 上限 2）→ 本次 PASS**：实测并行=2（T1/T2 两子代理），主会话只做调度与派单，无第三任务并行执行。
- **P0-2 一任务四件套未落实（首次：未建 worktree/任务分支）→ 本次仍 N/A（未按首次整改要求落实）**：理由=目标仓库只读且用户明示"接之前工作/先盘点"，无写入面；但 M2 §1 无只读豁免条款，审查方首次裁定"零冲突是观察结果≠机制验证"继续有效。**如实登记为未整改项**，不因只读而宣称豁免；后续任何 M2 试运行（含只读）须按四件套执行，或先走规范变更流程明确豁免条款。
- **首次 R2 残留"task-brief 当前步骤不同步"→ 本次 PASS**：两子任务 task-brief 状态表（当前状态=验收中/当前步骤=S3/最终结果）与 steps.md 同步；ST-05 检查器终检无 FAIL（2 步 PASS+1 步未到期，整体 IN_PROGRESS）。
- **首次"完整 marker 未回显"→ 本次部分改善**：T2 首行完整回显标记；T1 仍自拟标题。纪律继续有效：后续简报明确要求 reply 首行原样回显完整任务 marker。
- **首次"缩写 SHA"→ 本次 PASS**：所有简报附完整 40 位基线 SHA 与前序 reply 完整 64 位 SHA256。

## 五、两任务结论与裁定（均已核验一致）

| 任务 | 本地结论 | ChatGPT 裁定 | 方案落点 | reply SHA256 |
|---|---|---|---|---|
| T1 BMS 报价预览 R2-A | 四页签 6-9 行、pcs 22 行、含重量导出=downExcel3；skuPrice/artificialPrice 有字段无赋值；无行级整装标识；销售单位未进预览 DTO | 分层 PASS；缺数据留空 PASS（附条件）；A01-A10 待补原始清单；新增 A11-A20+三边界测试+三态门禁 | `b-20261123-bms-quote-preview/proposal.md` | `b2f4914ba523c9fa4c9665a88e6448d3d8b4f7026a4c8cbdcdf7ee42bb3ce616` |
| T2 GDC 生图异常（主对象）+AISVC（下游） | 门禁只认 pendingGlbs===0、纹理/billboard 排除、KTX2 晚到只补帧、render_assets 0 命中；新增 5 缺口（photo 无门/无超时/缓存键缺 revision/camera_snapshot 客户端自造/AiGenerationJob 无 params_json） | PASS_WITH_CONSTRAINTS（有条件收敛，非实施授权）；photo() 提升阶段一 P0；五缺口进台账但 params_json 不入本轮；新增五负例 A-E；实施前四项证据门 | `b-20261123-aisvc-page-exception/proposal.md` | `9ae55f661713c93c5e4114e7bc971a40d94c00030729f59afa8010ceb9563a34` |

## 六、过程问题登记（如实）

1. **简报字节口径误读（本次新遇，已自纠）**：初用 PowerShell `Get-Content -Raw`+UTF8 GetByteCount 得 1185/1423B 误超 1200B；改用 `[IO.File]::ReadAllText(path, UTF8)` 显式解码得 907/913B，与 gpt_dispatch 自报一致。教训=L-011.7"SHA256/字节基准"同族：**字节计量必须先锁定解码口径**，PowerShell 默认 ANSI 读 UTF-8 中文文件会把 3 字节汉字当 1 字符再按 UTF-8 重编码，虚增约 30%。压缩两轮实为不必要，但终版仍合规。
2. **marker 回显不一致**：T1 未回显完整 marker（同首次试运行），T2 完整回显。归属判定依赖交叉证据而非单一 marker。
3. **T1 审查方证据边界自述**：回执称"已核对目标 commit 变更内容，确认只调整人工服务总计金额文本拼接"——本次简报未要求其核对具体 diff，该句属审查方自行扩大，不据此认定任何代码结论；本方案仅采纳其明确裁定的三问答案。
4. **T2 审查方证据边界自述**：明示 GitHub 读取未把完整 SHA `5c9ba155…` 与源码绑定，裁定为"条件性架构裁定，不冒充独立复验"——已如实写入 proposal.md 头部；本地 file:line 证据仍以本会话静态实读为准。
5. **ST-05 迭代**：首检 S1/S2 ⑥ 缺 dispatch 目录+SHA256（检查器冻结口径要求每个到期步骤⑥均含），补齐后终检无 FAIL。与首次 R1"步骤状态不同步"同族，已按 L-017 逐项化修正。

## 七、待用户拍板（不自动立项、不授权改码）

1. **T1**：是否批准 R2-A 按 A-FE（前端文案/可见表）与 A-BE（后端数据流）两条独立流实施？A11-A20 是否并入验收基线？后端三项数据补证未完成前，前端展示位保持 MISSING（留空不伪造）是否接受？
2. **T2**：GDC-RCA-01 是否立项、是否按三阶段拆任务？五项新缺口中 `AiGenerationJob.params_json` 是否独立数据模型任务（不与 RCA 混）？五负例 A-E 是否并入验收基线？阶段一 photo() 提升 P0 是否确认？
3. **M2 治理**：四件套（worktree/任务分支/独立开发会话/独立验收会话）是否对只读任务给出规范豁免条款，或后续试运行一律落实？并行数是否维持 ≤2？
4. 两项实施任务与首次三方案（GDC 格式治理/缓存定点移植/AISVC 检测）的实施顺序。

## 八、完工自查

①两子任务 S1-S3 步骤记录齐、状态同步（task-brief 验收中/S3/PASS）；②整体测试=不适用（只读盘点+方案，无被测代码变更，如实标注）；③无遗留 REJECT（本轮两轮派单均一次 COMPLETED，零返工）；④工作区仅含本批新增（三任务包+两简报+报告+两 stdout）；⑤待 commit（见 Git commit 节）；⑥本报告 v1 即完工总结。

## 九、Git commit

本批文档 commit 以实际提交为准（报告成文时未预写自引用 SHA，遵守 L-0.3.8）。push 一律走 `node toolkit/check-push.mjs --push --yes`（L-014 第 6 条），不手工猜端口。

## 十、原始需求

见 requirement.md（用户原话不加工）；T1/T2 片段分别见各子任务包 requirement.md。

## 十一、最终实现内容

过程记录 + 本测试报告 + 两子任务实施就绪方案（T1 proposal.md / T2 proposal.md）+ 两轮 ChatGPT 裁定原文归档（SHA256 绑定）；目标项目代码零修改。

## 十二、修改文件

`basic/tasks/b-20261123-standard-second-trial/{requirement.md,task-brief.md,delivery.md}`；`basic/tasks/b-20261123-bms-quote-preview/{requirement.md,task-brief.md,steps.md,analysis.md,proposal.md,acceptance/{request-r1.txt,reply-r1.txt}}`；`basic/tasks/b-20261123-aisvc-page-exception/{requirement.md,task-brief.md,steps.md,analysis-gdc.md,analysis-aisvc.md,proposal.md,acceptance/{request-r1.txt,reply-r1.txt}}`；`phase0/tools/brief_bms_r2a_r1.txt`、`brief_gdc_rca_impl_r1.txt`；`phase0/logs/dispatch-2026-11-23T06-28-37/`、`dispatch-2026-11-23T06-32-05/`（原始现场不可改写）；`phase0/logs/dispatch-secondtrial-t1-stdout.txt`、`dispatch-secondtrial-t2-stdout.txt`。

## 十三、测试结果

ST-05：两子任务包终检均无 FAIL（①PASS②PASS③N/A 2 步完整 PASS 1 步未到期④⑤N/A⑥N/A，整体 IN_PROGRESS=验收中）；派单：2/2 一次采集成功，零补采零重发，reply SHA256 与 artifact_sha256 逐字节一致；目标项目代码测试=NOT_APPLICABLE（无代码变更）。

## 十四、未解决问题

见 §七（4 组待拍板项）+ §四 P0-2 四件套未整改 + §六过程问题 1-5 的后续纪律固化。

## 十五、后续建议

1. 用户拍板 T1 的 A-FE/A-BE 拆分与 A11-A20 基线后，另立实施任务（不改金额/不改导出打印第一阶段）；
2. 用户拍板 T2 的 GDC-RCA-01 立项与三阶段拆分后，另立实施任务；`params_json` 单独数据模型任务；
3. M2 四件套豁免条款走规范变更流程（standard/parallel-governance-draft.md），或后续试运行一律落实四件套再复验隔离机制；
4. 简报模板固化"reply 首行原样回显完整 marker"与"UTF-8 显式解码计字节"两条纪律；
5. 本报告与两方案交 ChatGPT 独立核验（可选，须新会话+完整 SHA 绑定），核验结论另记 decision-log。
