# 会话上下文事故分析与根治设计（b-20261122-session-ctx-mgmt S2）

## 一、三次事故清单（同类错误）

| 会话 | 事故 | 发现方式 | 处置 | 登记依据 |
|---|---|---|---|---|
| 6afe8e59 | 审查会话承载 5 条 user 超阈值 | 人工复盘发现 | 迁移 | L-018§6 起源/L-006 |
| 6aff4117 | 接棒后继续在旧会话派单（应迁未迁） | 用户批评"没遵守开发经验" | 迁移 6b009b70 | DEC-125 |
| 6b009b70 | **上下文窗口达上限**（横幅持久显示），发送不落地 | **用户看 UI 发现**；工具侧仅表现为 UNCERTAIN（草稿留存+unit 无增长） | 迁移 6b02952e | DEC-130 |

共性问题：**三次都是"人发现了，程序没发现"**——与 VPN 代理端口漂移事故同构（L-014 起源），后者已用固化工具（check-push.mjs 候选序探测）根治。

## 二、根因（为什么 4 条消息规则没拦住）

1. **规则按数计不按量计**：L-018§6 触发线=4 条 user 消息（评估迁移）。6b009b70 撞上限时 user 消息仅 ~8 条——但每轮 reply 是大表格+长分析（R1 核验 reply≈10KB、R2≈6KB），**token 消耗由内容量决定**，条数是坏代理指标。
2. **工具无上限态检测**：上限态的 DOM 签名是**持久横幅**「上下文窗口已达上限」+「开启新聊天，并带入自动生成的当前对话摘要；或升级套餐…」（本次 --diagnose 实拍；composer 仍 contenteditable=true 可输入→发送端不拦、双验看不到明确拒绝）。工具从未读这个信号。
3. **迁移靠人**：无账本、无预检，迁移时机完全依赖人工复盘/用户发现。
4. **UNCERTAIN 诊断不找根因**：07-02-42 轮 UNCERTAIN 后诊断只判"未送达"，没扫上限横幅——根因信号已在页面上却没进诊断输出。

## 三、实测签名（2026-11-22 check_conv_units --diagnose @ 6b009b70）

```json
{"bannerKeywordHits": ["上下文窗口已达上限", "开启新聊天，并带入自动生成的当前对话摘要；或升级套餐，继续当前对话，让每次聊天都能容纳更多上下文。"],
 "composerContentEditable": "true", "composerDisabled": null, "sendButtonFound": false}
```

要点：横幅是**持久 DOM 文本**（非瞬时 toast）；composer 不禁用；关键词扫描是可靠检测面。

## 四、根治设计（v1，提交 ChatGPT 裁定）

| # | 组件 | 内容 | 落点 |
|---|---|---|---|
| 1 | **会话用量账本** | phase0/logs/session-usage/<uuid>.json：{turns,in_bytes,out_bytes,first_at,last_at}；每次 send/collect 成功后累加（数据源=result.json 的 message_bytes+reply 字节数，现成） | gpt_dispatch.mjs |
| 2 | **发送前预检门** | 发送前读目标会话账本：累计>WARN(默认24KB)→打印告警+建议 --new-session（继续需 --allow-near-limit）；>HARD(默认48KB)→拒发 SESSION_BUDGET_EXCEEDED；阈值 --ctx-warn-bytes/--ctx-hard-bytes 可配置 | gpt_dispatch.mjs send 路径 |
| 3 | **上限态检测并入诊断** | UNCERTAIN/"未送达"分支+发送前预检：横幅关键词扫描（check_conv_units --diagnose 同款逻辑）→命中即输出 CONTEXT_LIMIT_BANNER_SUSPECTED+建议迁移 | gpt_dispatch.mjs/inbound_dom.mjs 诊断路径 |
| 4 | **L-018§6 修订** | 增补：字节预算规则（账本+阈值）与消息数规则并行；登记本次案例；声明阈值首版为估计值 | docs/AI-DEV-LESSONS.md |
| 5 | **check_conv_units --diagnose 固化** | 本次侦察用的只读诊断旗标转正（横幅扫描+控件态） | check_conv_units.mjs（已实现） |

## 五、诚实边界

- ChatGPT 对话窗口 token 上限非公开；本例 ~8 轮即达上限，估算累计文本 30-50KB 量级 → 首版阈值 warn=24KB/hard=48KB（in+out 累计）为**估计值**，登记为待校准；账本数据积累后按真实案例回归调整。
- 横幅关键词是当前 UI 的观察签名（§11.9 UI 漂移边界）：命中=强信号，不命中≠安全（阈值门兜底）。
- 账本只覆盖经 gpt_dispatch 的流量；用户手工在网页上的输入不计入（如实登记局限）。
