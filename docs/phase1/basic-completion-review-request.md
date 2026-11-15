# Basic（初级版）整体完成度验收请求（用户指令：交给 ChatGPT 验收"初级版本算完成了吗"）

- 请求方：执行者（ZCode 会话，2026-11-15）｜判定基准与材料全在仓库，按本文件指针读取
- 请求性质：**治理级节点判定**（非单任务验收）——请按 DEC-045 共识定义判定 Basic 初级版是否"完成"，并给出剩余必办项

## 一、判定基准（按 SHA 读 docs/phase1/decision-log.md）

- **DEC-045 五项共识**：D1 Basic=独立轻量版，复制到新电脑即用；D2 六模块首期文档优先、少量脚本、人工可跑；D3 抽取能力不抽取整套架构；D4 首个真实闭环验证任务=任务包完整性检查工具；D5 开发纪律=四步流程/独立验收/三轮止损。长期原则=Basic 独立可用初级产品，禁止反向依赖。
- **实施顺序**：阶段 A 流程文档→阶段 B 抽取与检查工具→阶段 C 真实任务闭环验证+修订。

## 二、执行方自报现状（请逐项独立核验，不轻信自报）

| 项 | 自报状态 | 核验指针 |
|---|---|---|
| WORKFLOW v0.3 | 正式生效（2026-11-15 用户拍板；S1=52e1f29/S2=ff0ab04 R3 PASS） | basic/WORKFLOW.md 头部生效状态 blockquote |
| 验收清单 | 31 项正式版随 v0.3 生效 | basic/ACCEPTANCE-CHECKLIST.md |
| templates 三件套 | acceptance-request/handoff-package/task-brief | basic/templates/ |
| 任务包检查器 | check_taskpack.py（ST-05 条款），两任务实战+终检全 PASS | basic/tool/check_taskpack.py |
| 推送/环境工具 | check-push.mjs（端口漂移实战 3 次）、check-env.mjs+SETUP-CHECKLIST（D1 演练验证） | toolkit/ |
| 任务实战 | **历史实战任务 7 个全闭环**（统计截止 commit 3119ef6；原"5 任务"系数量笔误，实列 7 名）：taskpack-checker（v0.2 时代）→phasec-workflow-stats（阶段 C）→v03-activation→lessons-recoll→standard-design-input→basic-replication-verify→replication-gaps-fix（后 4 个含 v0.3 下 3 个）；目录盘点口径另计（basic/tasks/ 全部登记包，DoD 成文时点 8 个） | basic/tasks/ 各包 task-brief 最终结果+decision-log |
| 设计输入 | standard/WORKFLOW-DESIGN-INPUT.md（P2，S1 PASS） | standard/ |
| 会话管理 | L-015 协议+L-018 迁移路径（今日实战迁移 3 次均成功但均为被动触发） | docs/AI-DEV-LESSONS.md |

## 三、执行方自报的未完成项（如实）

1. **G5 跨电脑实测未做**（D1 的最终确认只有本机模拟；无第二台设备）；
2. **代码类任务在 v0.3 流程下零实战**（v0.3 后 3 个任务均文档类；历史上代码返工 8/10 是最大风险面）；
3. **backlog 两项挂起**：DEC-043 收集器修复、归属校验型定位沉淀 recoll 默认策略（重启条件在案）；
4. **会话管理主动性不足**：审查会话 3 次打满才迁移（L-015 触发点纪律执行不到位）；
5. **"初级版完成"无成文 checklist**（完成标准本身未定义）。

## 四、请求判定

1. **三态判定**：Basic 初级版按 DEC-045 定义是否"完成"（PASS=完成／REJECT=未完成列剩余必办项／BLOCKED）；
2. 若未完成：给出**"初级版完成"成文标准**（checklist 条目建议）与剩余必办项优先级；
3. 若完成：说明 G5/backlog/代码类实战哪些属于"完成后持续运营"哪些是"完成前必办"；
4. 回执：结论表+判定依据+reply SHA256。

## 五、核验起点（最新 HEAD）

github.com/damwate/AIEO@main 全部已推；本文件所在 commit 即为请求版本。关键证据：basic/tasks/b-20261115-replication-gaps-fix/（最新闭环含返工表与复验 PASS 链）。
