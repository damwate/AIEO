# 过程记录 b-20261123-standard-third-trial

## 时间线（2026-11-23）

| 时刻 | 事件 |
|---|---|
| ~18:20 | 开工：用户确认 codex 提交在 feat/standard-task-management 分支；经注册表活代理 1080 fetch（.git/config 6822 死，L-014 处置） |
| 18:25 | GDC dev ff-only 66ead431→c3154aa0（PR#127 缓存重试整合+PR#128 AI 截图门修复合入，落后 25 提交清零） |
| 18:30 | 定位 fdb5666a 图片（Temp 目录）：issue #126 截图，产品清单样式 #名称·颜色·评分·画面占比；底部"AI生图管理后台加两个东西：1.原始上传的参考图 2.物品清单、排序依据" |
| 18:35 | 任务包登记 b-20261123-standard-third-trial；开工核对 --startup 首跑 FAIL→3 轮修正后 PASS（经验表格化格式） |
| 18:38 | 搭建 worktree .worktrees/feat-standard-task-management；npm ci；拷贝 gpt-poc 登录 profile→gpt-poc-standard-queue（745M） |
| 18:40 | Explore 代理完成 GDC 生图链路勘察（5 问报告：请求体现状/供应商 410 退役/任务详情无输入/#126 缺口/assets 链路） |
| 18:42 | planning R1 派单（1194B，队列 seq1）：发送成功但采集 fail-closed BLOCKED（fallback 键漂移+assistant 回显 round marker 致归属跨角色计数） |
| 18:45 | L-018 处置：禁重发→只读补采（recoll_stdq_planning_r1.mjs）→七查全过→reconcile COMPLETED。**发现并修复 queue 缺陷**：checked_recollection 标记匹配未限定 user 角色（GPT 回显标记属常态），修复+回归测试（12 tests OK）。reply SHA256=1fe0f3a3… |
| 18:50 | R1 裁定：双写（prompt 区块+params.product_constraints），compose_prompt 冻结，契约不动；**边界：先交数据契约审议再编码** |
| 18:52 | R0' 重新发布复核：线上 8870 新 bundle（index-Bq-EEQ1b），含 asset_versions（PR#127）+onTextureSettled/onTextureStart（PR#128）特征；本地 c3154aa0 全新构建 hash 不同但特征等价（构建环境差异）；热启动场景留用户抽测。证据归档 acceptance/republish-review/ |
| 18:55 | planning R2 派单（seq2，1180B）：发送成功但采集 INBOUND_WINDOW_COMPLETENESS_UNPROVEN（虚拟列表滚动中物化集合变化，L-021 第3条场景）→ 只读补采（r2 派生脚本，前轮 reply SHA 排除）→七查全过→reconcile COMPLETED。reply SHA256=7f3def1c… |
| 18:58 | R2 裁定：有条件通过——MF-01（缺失 variant：params=null/prompt 省略颜色段）、MF-02（ROUND_HALF_UP 十进制舍入+NaN/Infinity/越界 fail-closed）落实后可编码；name 缺失 fail-closed；旧任务零改动兼容 |
| 19:00 | 实施子代理派出：R2 供应商排序（GDC 网关 PUT routing/order 白名单+审计 / AIS Vendors.vue garden proxy 放开排序编辑）+ R3 任务详情输入参数（GDC admin detail 端点+AiJobsAdmin 展开+display_name 解析），两仓功能分支不合流 |

## 待办
- R1 编码（compose_prompt 区块+params 双写+MF-01/MF-02+测试）——等实施子代理释放 GDC 仓后动码
- 子代理交付后核验：跑两仓测试、证据归档
- GPT test-acceptance 派单（R1 实施复审）
- 测试报告 delivery.md + decision-log
| 19:40 | 2K 验证深挖：用户澄清「1K/2K/4K 是供应商那边参数，不是图片实际大小参数」→ 配置值应改为档位值 "2K"；代码侧确认 generations/edits/edits-json 三通道都透传 cfg.size，但 responses 通道不带 size（次要）；旧值原备份为 1024x1024 |
| 19:45 | 220 网络变更：192.168.0.220 直连超时，改经 yotin.com.cn（权威 DNS 尚无 A 记录，后台循环等待生效中）；R2/R3 实施子代理仍在运行 |
| 20:10 | 220 公网不可达（share.yotin.com.cn:22 拒绝，昨日密钥 yotin_share_ed25519 佐证 22 端口既往可用），用户决策：不连 220，稍后公司电脑连内网。2K 问题转入「方案就绪待执行」：根因定档=供应商认 1K/2K/4K 档位参数（2048x2048 非档位值，服务烟测 1448×1086/1312×1199 为证）；修正包落 acceptance/ais-2k-default/（RUNBOOK+apply-2k.sh+verify-2k.py，幂等、保原备份、含回滚） |
| 20:30 | R0' 用户热启动抽测：用户亲自看过重新发布的花园计算器，「还行」→ 重新发布复核全项闭环（特征证据+人工抽测双证） |
| 20:32 | 2K 补派 planning R3（seq3，831B）：用户质疑未与GPT讨论即改配置——如实承认第一阶段直改2048x2048系误判，档位语义补走裁定；worker 后台执行中 |
| 11-24 00:00 | planning R3 闭环：补采 reconcile COMPLETED（七查全过，reply SHA256=4bb41bc0…）。裁定：**不批准统一切换 "2K"**——档位参数≠请求参数≠输出像素，远桥云文档明确 size 用像素串，"2K" 是否被各家识别未证实；MUST-FIX 四条门禁（分供应商证据矩阵/成对留证/计费档位/脚本安全门）落 R3-RULING.md，apply-2k.sh 挂门禁。教训登记：供应商参数语义必须先 planning 裁定（本次首轮直改已被证伪取值） |
| 11-24 00:20 | 用户决定：2K 默认项与 220 强相关，**暂时关闭挂起**。挂起状态：220 生产配置现为第一版取值 2048x2048（已被 R3 裁定证非档位值；烟测出图正常但尺寸为内容自适应）——维持/应用/回滚三种处置都需 220 可达，故整体挂起。恢复条件：220 内网可达→按 R3-RULING.md MF-01~04 证据矩阵执行→修订 apply-2k.sh→烟测闭环。证据包（RUNBOOK/R3-RULING/apply-2k.sh/verify-2k.py）已备，恢复时零重建成本 |
| 11-24 00:30 | **用户指令：都停止**。已停 R2/R3 实施子代理（测试中骤停）。当前现场快照：GDC 1a77baad / AIS 146ea3c 两提交均在各自 feature 分支（未合流、未 push？——以仓库实况为准）；R1 未动码；2K 已挂起；queue 派单三轮 COMPLETED 证据齐。恢复入口：从「R2/R3 独立复核」节点继续 |
| 11-24 11:20 | R2/R3 独立复核（1/2）：AIS 仓 PASS——pytest 572 通过，13 失败全部定性为环境预存/抖动（基线 0c53c96 对照实证：admin_auth 9 项+migrations+config 路径 12 项基线同样挂；failover 项单跑通过=flaky）；vitest 42/42 绿（含子代理 vendors.spec.ts）。提交范围核对无超界 |
| 11-24 11:45 | 用户成本纪律：费用相关验证先查官方文档，禁止黑盒/生产冒烟反复试错；立即停止真实供应商探针，后续本地 mock，生产最小验收须先确认。固化 L-023，并登记为长期偏好 |
| 11-24 11:55 | 用户要求与 ChatGPT 讨论付费接口测试方法，并指出 codex 惯例=先文档、真实数据须授权。派 planning R4（seq4，805B，仅方法不调用接口）；会话第4条 user 消息迁移评估：前三轮总上下文量小、无 CONTEXT_LIMIT 征兆，暂不迁移，后续每增2条重评 |
| 11-24 12:05 | R4 COMPLETED（补采七查全过，reply SHA256=74ca76a1…）：四阶段门禁+三证据分态。按用户补充修正执行口径：接口初建可授权全量业务验收，后续按影响面做有意义目标测试，不做简单参数矩阵。L0 远桥官方文档归档（GPT Image 1:1 2K=2048x2048）；悟空契约 UNKNOWN。L2 新增 AIS 最终 _post_raw 出站覆盖链测试（16/16 PASS），GDC R1/2K mock 31/31 PASS |
| 11-24 12:20 | 用户强化长期纪律：第三方接口官方文档必须找到并归档，禁止黑盒测试，历史调用结果不得补契约缺口。已固化到 L-023+长期记忆；悟空官方 size 契约 UNKNOWN，因而其生产2K启用保持阻塞 |
| 11-24 12:35 | 用户提供悟空官方 gpt-image-1 edits 文档并归档 Markdown SHA256=cba9e3fe…：quality/size 默认 auto；size仅1024x1024/1536x1024/1024x1536/auto。模型边界=不覆盖当前2.6 sunburst。用户新口径：2.* edits应按前端设计参考图自动画幅，quality/size默认auto除非前端显式传值；GDC硬编码2048未发布待R5裁定 |
| 11-24 12:45 | 用户拍板撤销尺寸硬编码：设计稿1480×1100不应强制2048×2048；前端未传size/quality则由AIS落auto。GDC跟进提交16555dea（params恢复{'n':1}，R1不变），31项mock PASS。R5仍请GPT确认auto画幅证据边界 |
| 11-24 12:50 | 用户流程批评固化：第三方接口需求先以官方文档校准用户直觉，不机械执行/硬编码早期假设；本次尺寸弯路根因=开工未读文档。已纳入长期工作方式 |
| 11-24 12:20 | test-acceptance R1补采 COMPLETED（reply SHA256=a58d9a5b…）：GPT仅按描述审，未取到代码diff，暂不通过；T1-T10中部分为误解（R2非SQL排序、R3非可编辑参数），待提交推送后第二轮逐文件审。尺寸硬编码已随后被用户撤销，下一轮以16555dea为准 |
| 11-24 12:25 | R5首次seq6因手工Chrome端口归属NOT_SENT（确认未发送），清理该实例后以round6/seq7重派；test-acceptance seq5先完成reconcile解除single-inflight阻塞 |
| 11-24 12:30 | R5/R6裁定 COMPLETED（reply SHA256=147044d8…）：取消固定尺寸通过；auto可自动选尺寸但保证匹配参考图画幅=UNKNOWN；未来2K按设计稿比例显式映射。落实16555dea，AIS现有auto缺省链不扩大改写；分支更名feature/product-constraints-auto-size-20261124 |
| 11-24 12:55 | 按auto最终裁定回滚早前生产配置误改：220与221均从.bak-20261123恢复三家供应商1024x1024、intelalloc auto；热加载无需重启、零生图调用。固定2048不再残留于供应商配置 |

## S1 R0 代码与重新发布复核
①本步骤目标：重拉 GDC、确认缓存合并并复核重新发布版本。
②修改文件：acceptance/republish-review/（证据）；steps.md。
③修改内容：dev ff-only 至 c3154aa0，PR#127/#128 特征与线上 bundle 核验，用户热启动抽测。
④执行结果：R0/R0' 闭环，用户抽测通过。
⑤测试结果：特征证据+人工抽测通过。
⑥验收证据引用：验收结论：IN_PROGRESS（功能复核已完成：本地基线 commit=c3154aa0、用户热启动抽测通过；正式步骤验收未单独派单）。证据包内路径 acceptance/republish-review/EVIDENCE.md。

## S2 规划协商与契约裁定
①本步骤目标：完成 R1/R2/R3、付费测试及 auto 尺寸方案的 ChatGPT 裁定。
②修改文件：briefs/、acceptance/recoll-planning-*/、acceptance/ais-2k-default/。
③修改内容：六轮成功回复均完成归属三件套与 SHA256 绑定，零确认后重发。
④执行结果：R1 双写、MF-01/MF-02、付费四阶段、auto 尺寸均有裁定。
⑤测试结果：queue 六轮 COMPLETED；fail-closed 均只读补采并 reconcile。
⑥验收证据引用：验收结论：PASS（dispatch-2026-11-24T04-19-39，reply sha256=147044d8864903038a8b3f207e361c5b84c9d3ccfe285c55c9e1efb1e8b08ce6）。证据包内路径 acceptance/recoll-planning-r6/reply.txt。

## S3 R1/R2/R3 与 auto 尺寸本地实施
①本步骤目标：完成两仓功能实施及零费用测试。
②修改文件：GDC ai/product_constraints.py、ai_generation.py、external_jobs.py、AiJobsAdmin、网关；AIS Vendors.vue 与出站测试。
③修改内容：GDC HEAD=0a5a4ec59b71bc3af41aa99ac82808767ffa785a；AIS HEAD=418087c31e8765ba48fd765ab3c9a50cc21b2458；尺寸不硬编码。
④执行结果：本地提交完成，未合并、未发布；220/221 配置已回滚。
⑤测试结果：GDC AI 112 passed、前端 3284 passed；AIS capabilities 16 passed、前端 42 passed；全程 mock。
⑥验收证据引用：验收结论：IN_PROGRESS（被测 commit=0a5a4ec59b71bc3af41aa99ac82808767ffa785a，本地 mock 已通过；正式逐文件验收待代码可读）。证据包内路径 acceptance/test-logs/gdc-ai-catalog-fix.log。

## S4 验收、测试报告与发布边界
①本步骤目标：归档测试报告并明确未决项。
②修改文件：delivery.md、acceptance/code-diffs/、decision-log。
③修改内容：报告记录测试证据、文档证据、流程缺陷、生产/付费/推送边界。
④执行结果：delivery.md 已成文；ChatGPT 逐文件复审与分支推送未决，不宣称生产完成。
⑤测试结果：任务包检查器与目标测试证据归档；GDC 全量失败继续基线分类。
⑥验收证据引用：验收结论：IN_PROGRESS（test-acceptance 描述级回复 dispatch-2026-11-24T03-56-47，reply sha256=a58d9a5b408c0f911c1ba4a5cd69abd06e4bc41482fcedcd8051ee34beabfe98；逐文件代码复审待推送授权）。证据包内路径 delivery.md。
| 11-24 13:00 | ST-05 全检：①②⑥开工 PASS；③ FAIL——S1/S3为本地功能完成但缺独立dispatch+reply SHA正式验收，S4代码复审未闭环。保持IN_PROGRESS，不伪造派单证据/不标完成 |
| 11-24 13:30 | 用户截图对账发现R3缺口：原始上传设计图此前仅sha清单未显示图片。补PlatformAdmin私有输入媒体端点+前端原图展示，GDC 021de64a；后端详情6项、前端26项、最终AI 113项PASS。R1原提示词+产品组成+设计稿/产品原图发送链不变 |
| 11-24 13:45 | 全量基线对照完成：base=3301/194+3，16555=3336/196+3；仅2项新增（media_binding），根因=R1误用load_assets_cached查产品name。改权威catalog()后相关回归+AI/媒体119项PASS，修复commit=0a5a4ec5；其余197项失败/错误基线同现 |
| 11-24 14:05 | 三分支已推送并核对远端SHA一致。交接前补AIS原生R3：prompt原文+params/product_constraints展示，AIS 418087c（admin API 19、JobDetail 3 PASS）。CODEX-HANDOFF.md落AIEO任务包，明确三项目与验收清单 |
| 11-24 复验轮 | 首轮独立验收 MUST-FIX 两项整改：AIS /v1 接受并校验 product_constraints（GenerationBody+edits 白名单+元数据参数门），GDC multipart 结构化参数改 JSON 编码；GDC 单图任务详情/原图端点按冻结五列合成 slot 1。GDC=4f162d16、AIS=afc4d6c（已推送并复核远端一致），GDC 9 文件目标套件 121 passed、AIS 相关 55 passed，全程 mock。证据 acceptance/mustfix-r2-remediation.md；ST-05 S1/S3 正式证据仍缺，保持验收中 |

## Codex R2 独立复验

原 422 启动阻断与单图 404 已复验通过。整体仍为 MUST-FIX，AIS 无效清单 500 和 GDC 产品名称快照一致性待整改。完整被测 SHA、实测结果和复验条件见 [R2 独立复验](acceptance/codex-r2-recheck.md)。

## R3 整改回交（第二次 MUST-FIX）

AIS 将编辑接口 Pydantic 校验异常归一化为 422，并把占比数值判断改为先范围后有限性，消除对象/非对象数组与极大整数引发的 500；GDC 新增 `product_constraints_json` 冻结列与幂等迁移，提交时用同一目录快照派生 prompt 与清单，出站优先读冻结值、旧任务 NULL 回落。机制与上一轮不同（错误归一化、现场重算→提交冻结），按 L-019 记为第二次返工。GDC 10 文件目标套件 145 passed/2 skipped，AIS 4 文件 78 passed；GDC=90ce2233、AIS=a1f55b52，均已推送并复核远端一致。详见 [R3 整改](acceptance/codex-r3-remediation.md)。ST-05 S1/S3 正式证据仍缺，保持验收中。
