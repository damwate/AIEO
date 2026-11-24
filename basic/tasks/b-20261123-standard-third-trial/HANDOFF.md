# 交接包：b-20261123-standard-third-trial（历史交接，已由 2026-11-24 delivery.md 接替）

> **最新状态请看 `delivery.md`**：本地实施与零费用验证完成，尺寸最终为 auto，220/221 固定尺寸已回滚；未发布、未付费验收。以下内容是 2026-11-24 00:40 叫停时的历史快照，仅作过程证据。
> 本包自包含：新会话只需读本文件 + 原 requirement.md，无需翻完整会话历史。
> 过程明细见 steps.md；本文件是**恢复操作的唯一入口**。

## 一、任务是什么

用户原话（requirement.md）：用 AIEO 标准版处理四项——R0 GDC 重拉+重发复核；R1 生图请求加产品占比清单（带原图，**须先与 GPT 仔细讨论**）；R2 花园计算器链接的生图后台页可调供应商顺序；R3 生图任务详情补显客户端输入参数。外加中插三项：GDC 确认在分支、**默认 1K→2K**（用户指出须用供应商档位参数）、220 账号口令。

## 二、已完成（有证据，勿重做）

| 项 | 结果 | 证据 |
|---|---|---|
| R0 代码重拉 | GDC dev=c3154aa0，ff-only 完成 | steps.md 18:25 |
| R0' 重发复核 | 特征证据+**用户热启动抽测通过**（11-23 20:30 用户亲验「还行」） | acceptance/republish-review/ |
| 任务登记+开工核对 | PASS | task-brief.md |
| planning 三轮 GPT 派单 | R1/R2/R3 全 COMPLETED，零重发 | acceptance/recoll-planning-r{1,2,3}/（reply.txt+SHA256+七查记录） |
| R1 实施方案 | 冻结定稿（MF-01/MF-02 已落实） | acceptance/r1-impl-plan.md |
| queue 归因缺陷 | 发现并修复（assistant 回显 marker 误判重复）+12 项回归 | AIEO worktree `phase0/tools/playwright_queue.py`（**未提交**，在工作区） |
| 2K 问题定档 | 根因=供应商档位参数语义；R3 裁定不批准统一切换，MF-01~04 门禁 | acceptance/ais-2k-default/（RUNBOOK+R3-RULING+apply-2k.sh+verify-2k.py） |

## 三、冻结现场（明早从这里继续）

1. **R2/R3 代码已提交未验证**：GDC `1a77baad`（feature/admin-console-order-and-job-input-20261123）、AIS `146ea3c`（feature/garden-proxy-order-edit-20261123），**均仅本地未 push**。子代理在跑测试时被叫停。
   → 恢复第一步：独立复核——跑 GDC pytest+vitest、AIS pytest，核对提交范围符合 R2/R3，通过后由我本人或新子代理收尾。
2. **R1 未动码**：GDC 仓已释放。按 acceptance/r1-impl-plan.md 实施（新模块 product_constraints.py 等 5 个改动点+测试清单）。
3. **GPT test-acceptance 派单**（R1 复审）：审查会话已有 3 条 user 消息（R1/R2/R3），第 4 条前须按 L-018 第 6 条评估迁移；简报 ≤1200B Python 计量。
4. **2K 挂起**（用户拍板）：恢复=220 可达→R3 证据矩阵→修订 apply-2k.sh→烟测。220 现状：公网 share.yotin.com.cn:22 拒绝、内网超时，待用户公司电脑接内网。**当前 220 生产挂着第一版取值 2048x2048**（出图正常但尺寸内容自适应），处置权留给恢复时。

## 四、关键坐标（新会话免重查）

- 仓库：GDC=D:\Garden-Design-Calculator；AIS=D:\YotinGarden\AI-Image-Service；AIEO 主仓 D:\AIEO（分支 feat/standard-task-management），queue 服务 worktree=D:\AIEO\.worktrees\feat-standard-task-management
- GPT 审查会话：6b0418af-0fcc-83ec-aff0-dad2dd269864；queue sqlite 三条 COMPLETED 记录；Chrome standard-queue 实例 9300 端口（登录态，如已关闭重启 worker 即可）
- 220 凭据：SSH 走 askpass 模式，口令由用户当面提供（/tmp/askpass220.sh 已随停用失效，勿引用文件本身）；生产 AIS 容器 ai-image-service-api-1/worker-1/db-1，DB 用户 ai_service/ai_image_service
- 纪律红线：DEC-010（main 合并/生产发布/数据删除）必须用户本人拍板；派单禁重发；push 走 `node toolkit/check-push.mjs --push --yes`
- 教训（本任务特有）：**供应商接口语义必须先 planning 裁定再动手**——2K 首轮直改被用户纠正、二轮取值被 R3 拦下，是反面教材

## 五、交付物清单（收尾时产出）

delivery.md（测试报告：M2 指标、queue 缺陷发现、2K 三折过程、标准版执行评估）+ decision-log 登记 + 两仓 push（经 check-push）+ R2/R3/R1 测试证据归档。
