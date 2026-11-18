# 完工总结（七要素）——b-20261119-aisvc-f3-rework

## 1. 原始需求

用户（2026-11-19）："codebuddy已经下线了，你把活接过来把，后面交给chatgpt终审"。上下文：AI-Image-Service F1-F4 修复的上轮 ChatGPT 终审裁定 REWORK（F3 FAIL 四项 required_fix + F2/F4 约束），CodeBuddy 下线，由本会话承接整改并走 ChatGPT 复审至关闭。

## 2. 最终实现内容

- **F3a 增量证明去循环等待**：时间界证明替代 gate 循环——服务端先发 200B（≥limit=64）再停 8s 才发余量；全量缓冲后检查的实现必须等满 8s，实测 <5s 即抛本地超限 = 中途消费。
- **F3b 真实 connect stall**：10.255.255.1 SYN 黑洞 + 探测守卫（无法构造 stall 时如实 skip）；elapsed<4s 断言 + transport_code==28；并按 R2 复审 required 新增 5s 兜底对照测试（非 low_speed 同一黑洞，4s<elapsed<8s）——两档实测共同证明时间界能区分 2s 连接预算与 5s 兜底机制。
- **F3c 总时限双测**：非 low_speed 滴流 2B/s 超 2s 必败（28）+ 0.83B/s 慢流 7.2s<10s 完整成功（不误杀）。
- **F3d 分类强断言**：低速/停滞/总时限 transport_code==28 必查（28 为三路实证后冻结）。
- **F2 真缺陷修复（整改中新发现）**：超限/截断早退后，同步 `response.close()` 会等 stream_task 到传输终止才放行（本地已判定的异常被扣住，停滞场景等到超时）——修复=就地武装 quit_now（qput 回调见即 CURL_WRITEFUNC_ERROR 中止 perform，剩余体不入队，内存界保住）+ close 挪守护线程（异常立即上抛）。
- **F4 强化**：0009 测试补主键字段名逐一比对 ORM + 索引名称/列/唯一性全集合等价（双侧排除 autoindex）。
- **F2 语义注记**：16KiB/25MiB=保留/累计精确上限，线上粒度由 curl 内部缓冲决定（0.17.0 忽略 chunk_size），≤1 内部块。

## 3. 修改文件（全部在 AI-Image-Service 仓库，分支 fix/yuanqiao-http1-20261117）

- backend/tests/test_real_stream_transport.py（重写：7 用例→10 用例）
- backend/tests/test_migrations_baseline.py（0009 比对强化）
- backend/app/ai/http_transport.py（中止 teardown + 语义注记）
- commits：59319e6（主整改）→ 6e38cde（F3b-01 R1 整改）→ d50ce91（F3b-01 R2 整改=5s 对照，**PASS 绑定此 SHA**）→ 0c53c96（reviewer 非阻断建议 docstring 修正）。均已推送。

## 4. 测试结果

- 实跑（Windows 本机，venv pytest）：test_real_stream_transport.py 10 passed；test_migrations_baseline.py 4 passed；test_http_transport+test_supplier_http_version+test_any_error_failover 63 passed；全量 **584 passed/11 failed**（11 失败与预修复 commit b5efcac 复现集逐条一致=基线存量，零回归）。
- ChatGPT 复审三轮：R1 REWORK（余 F3b-01）→ R2 REWORK（F3b-01 语义指正）→ R3 **PASS**（F3b-01 关闭；全部 conditions PASS）。artifact SHA 链见 steps.md S2⑥。
- 同一问题 F3b-01 返工 2 轮后关闭，未触及三轮止损线。

## 5. Git commit

- AI-Image-Service：59319e6 / 6e38cde / d50ce91（PASS 绑定）/ 0c53c96，均推送远端 fix 分支。
- AIEO（控制层）：aaabb4a（任务冻结）+ 本交付 commit；本地 main，未推送（G-2 待用户确认）。

## 6. 未解决问题

- **计划外推送披露**：承接任务初期误把 AIEO 专用推送工具（check-push.mjs 以脚本自身位置解析仓库）用于 AI-Image-Service，实际把 AIEO main 的 ahead=2（本日两个任务登记 commit）推送到了 damwate/AIEO——内容无秘密（任务登记+裁定证据），但属计划外动作，如实登记。
- R3 PASS 绑定 d50ce91；其后 0c53c96 为 reviewer 本人提出的非阻断说明修正（docstring，无行为变更）——严格口径下如需重新绑定可再派一轮一句话确认。
- 上一任务（b-20261119-aisvc-gpt-accept）遗留的 3 条历史回复仍未正式归档（内容已被补强简报引用消费）。
- 全量 11 个基线失败（admin auth 域）仍未排查——与本次修复无关，建议另立任务。
- 审查会话（新会话 4296b1d7-…）已用 3 条 user 消息，按 L-018.6 阈值 4 条进入迁移评估窗口。

## 7. 后续建议

1. F1-F4 修复链全条件 PASS，可进入发版决策（发版红线仍按 DEC-010 由用户拍板）。
2. AIEO 本地 commit 待用户确认后经 check-push 推送（AIEO 仓库专用工具，勿再跨仓库使用）。
3. admin auth 基线失败排查 + 3 条历史回复归档建议各另立任务。
