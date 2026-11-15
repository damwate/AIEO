# 任务书：Chrome tab 泄漏清理（tab-cleanup）v0.2

- 任务ID：b-20261116-tab-cleanup
- 日期：2026-11-16
- 沿革：v0.1 规划协商 R1 REWORK（5 P1+3 P2，reply 归档 dispatch-2026-11-15T21-5x）→本版逐项整改（§0 对照表）
- **版本选型：**
  - 选定版本：Basic
  - 任务等级：S2（纪要 §五：工具链代码类；Basic/Standard 边界按风险定）
  - 选型理由：M2 派单工具链小步修复（tab 生命周期卫生），无平台契约/状态机变更，无外部行为语义变更；风险=改坏派单链（以零语义变更约束+测试矩阵对冲），Basic 足够
  - 批准人/日期：用户 2026-11-16 开工指令明列"Chrome tab 泄漏小任务"（DEC-063 处置②），L-020 节点授权推进

## 需求原文

见 `requirement.md`（delivery 后续建议①＋DEC-060 pending-issues＋用户开工指令，原文存档）。

## §0 R1 意见逐项整改对照（v0.1→v0.2）

| 项 | 意见实质 | 本版整改落点 |
|---|---|---|
| P1-01 | 行号勘误+recoll newPage 语义澄清 | 源码实读核验：gpt_dispatch.mjs attachPage()=124 行、选页行=127 行；review_leg_recoll_template.mjs 选页=112 行、newPage=114 行（审查方 119/105-108 与源码不符，以 grep 实读为准登记）。recoll newPage 语义=仅 CONV_UUID 未命中时创建——本任务不改此语义，只补"命中多页取末位"与运行后清理 |
| P1-02 | "最近活跃"不可执行 | 全部选择规则改为**数组序=创建序**（playwright ctx.pages()/CDP /json 均创建序返回）：指定会话多命中取末位（最近创建），并列按 index 大者；**不引入"活跃度"判定**；无法判定/零命中→null（调用方按既有规则 newPage）fail-closed。派单侧"空闲页"概念删除——新会话派单复用页必先 goto CHATGPT_HOME（gpt_dispatch.mjs:301 实读），无落错会话风险，选页保持既有语义（首个 chatgpt 页） |
| P1-03 | 清理状态边界 | 清理只允许三类时点：①发送前失败（确认无 SEND_STARTED/无发送证据——自建页可关）；②回复完整落盘且 result.json 六查通过后（成功路径）；③维护模式显式 --close 且全部安全门槛过（§3）。**禁止 finally 无差别关闭**：发送后 UNCERTAIN、生成中、采集失败、契约校验失败一律保留现场不关页（L-018 禁重发语义依赖现场） |
| P1-04 | 维护模式安全门槛 | `tab_cleanup.mjs` 默认 dry-run（只报告候选清单+分组依据）；关闭须显式 `--close`，且逐页满足：非本次运行仍在生成中的页（停止按钮可见判定）不关；无法确认归属安全不关；主页无 CONV 保留最新一页；陈旧阈值=可选 `--stale-minutes`（缺省不启用，不按时间自动关） |
| P1-05 | 自建页显式归属 | 每次运行维护 created-pages 注册表：attach 前记录既有页身份集合（CDP targetId/URL），运行中新建页逐页登记；清理仅针对注册表内页，`page.close()` 显式关闭；不依赖 `browser.close()` 做清理（connectOverCDP 下其语义=断开连接，非关闭浏览器/页面——以 page.close() 为唯一关闭手段） |
| P2-01 | 零语义变更审计清单 | 红线扩为可核对清单：发送次数、Enter 触发一次、生成等待/确认窗、双读稳定性、证据落盘顺序、退出码、CLI 参数、result.json 字段——全部不变；清理失败不得吞掉原始错误、不得改变成功判定（清理异常仅追加日志，向上抛原错误） |
| P2-02 | 测试矩阵扩容 | test_tab_hygiene.mjs 增：多候选并列无法判定→null/末位显式规则、生成中页不进 dedupe 关闭计划（报告标注）、UNCERTAIN 现场保留（状态机级断言）、close 失败→错误向上抛且不伪造成功、维护模式误关保护（非 chatgpt/生成中页）、created 注册表归属隔离。现有 13 例保留 |
| P2-03 | 冒烟证据形态 | S3 证据=运行前后页身份清单（targetId+URL+CONV_UUID 对照表）+既有值守页零关闭证明+本次自建页处置记录+回复/result.json 完整性；**优先搭真实补采链承载**（下一次自然补采轮顺带取证），不为验证清理额外触发真实消息发送 |

## 执行者理解（与原文分开，便于对账）

1. **缺陷事实（两处，源码实读核验）：**
   - `phase0/tools/gpt_dispatch.mjs:124-127`——attachPage() 选页 `ctx.pages().find(chatgpt) || pages[0] || newPage`：无消歧落档、运行结束不关自建页（DEC-060 实测 4 tab 积累来源之一）。
   - `phase1/tools/review_leg_recoll_template.mjs:112-114`——按 CONV_UUID 选页，未命中即 newPage；补采结束不关自建页（重复补采残留同会话多 tab 来源）。
2. **修复目标（零语义变更红线，P2-01 审计清单为准）：**
   - **消歧落档**：recoll 指定会话多命中取末位（创建序）+选择结果（命中/未命中/新建）写入运行记录可审计；派单侧选页语义不变，仅显式化。
   - **清理**：仅 §0 P1-03 三类时点；自建页注册表（P1-05）为唯一关闭对象；`page.close()` 显式关闭。
   - **维护模式**：`phase0/tools/tab_cleanup.mjs` dry-run 默认，`--close` 显式开启+安全门槛（P1-04）。
   - **不变量**：发送双验/禁重发/归属校验/fail-closed 语义零变更；CLI/result.json/退出码契约零变更；review_leg.py 本体零修改。
3. **实现载体：** `phase0/tools/tab_hygiene.mjs`（纯函数：describePages/pickChatGptPage/dedupePlan，已初版 13/13 过）+两处调用点接入+`tab_cleanup.mjs` 维护脚本+`test_tab_hygiene.mjs` 扩容（P2-02）。
4. **边界：** 不改 gpt_dispatch 发送/采集逻辑；不碰 review_leg.py；Chrome profile/登录态零接触；不引入自动重试/重派。
5. **流程：** Basic WORKFLOW v0.3：规划协商双向至共识→步骤清单冻结→执行→独立验收；ST-05/ST-01 照用。

## 验收目标（R2 共识后冻结）

- test_tab_hygiene.mjs 全过（含 P2-02 扩容例），正反例对应本任务书条款；
- gpt_dispatch.mjs/recoll 模板 diff 仅限 tab 生命周期相关行；P2-01 审计清单逐项 diff 核对通过；
- S3 冒烟证据按 P2-03 形态落档（真实补采链承载）；
- 既有测试矩阵回归（test_dispatch_options.mjs 等）全过。
