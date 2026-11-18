# 步骤清单（用户拍板冻结）

**用户拍板原文（2026-11-19）：** "codebuddy已经下线了，你把活接过来把，后面交给chatgpt终审"

**冻结方案要点：** 承接 CodeBuddy 完成 AI-Image-Service 上轮终审 REWORK（reply SHA=b786a75e…）全部 findings 整改：F3 四项 required_fix + F2/F4 约束项；完成后新会话派 ChatGPT 复审直至关闭。拍板依据=用户直接指令+上轮终审 required_fix（reviewer 自己的处方）。

## S1 整改实现与本地验证

①本步骤目标：F3a-F3d、F2 teardown/语义、F4 PK/索引全比对全部落实并本地实测通过；整改 commit 推送远端。

②修改文件：backend/tests/test_real_stream_transport.py（重写）、backend/tests/test_migrations_baseline.py（强化）、backend/app/ai/http_transport.py（中止teardown+语义注记）。

③修改内容：F3a 增量证明改时间界（服务端先发≥limit再停8s才发余量，全量缓冲必等满8s，实测<5s即抛=中途消费）；F3b 连接超时改真实SYN黑洞stall+探测skip守卫+28强断言；F3c 新增总时限触发(2B/s滴流超2s必败,断言28)+未误杀(0.83B/s慢流7.2s<10s成功)双测；F3d 低速/停滞/总时限 transport_code==28 强断言；F2 超限/截断早退武装 quit_now（下一块 CURL_WRITEFUNC_ERROR 中止 perform，剩余体不入队）+close 后台化（修复同步 close 把已判定异常扣到传输终止才放行的真缺陷）；F4 PK 字段名逐一比对 ORM+索引名称/列/唯一性全集合等价（双侧排除 autoindex）；上限保留语义注记。本次待验收 commit=59319e6c9f47906f6d151898c0adf802fe3fb2c0（+R2 6e38cde/d50ce91、docstring 0c53c96，见 S2）。

④执行结果：目标测试 14→10 文件内全绿（新增2+重写全过）；全量 **582 passed/11 failed**，11 个失败与预修复 commit b5efcac 复现集逐条一致（基线存量，零回归）；提交 59319e6 推送成功（47f2ecc..59319e6）。

⑤测试结果：pytest 实跑——tests/test_real_stream_transport.py 10 passed（含 2s/5s 两档连接对照）、tests/test_migrations_baseline.py 4 passed、test_http_transport.py+test_supplier_http_version.py+test_any_error_failover.py 63 passed、全量 582 passed/11 failed（108.95s，Windows 本机，实跑日志留存会话）；transport_code==28 系实证后冻结的断言（低速/停滞/总时限三路实测均为 28）。

⑥验收证据引用：验收结论：PASS（S1 实现+本地验证闭环；独立验收=S2 ChatGPT 复审链）；dispatch 目录=phase0/logs/dispatch-2026-11-18T17-36-04（R1 复审）、17-40-56（R2 复审）、17-45-46（R3 PASS）；reply SHA256=ddf605d5d6bf4771b480aada4e178e277e89dd3d6568233c50a19a65846655b3（R3 终局 PASS，1848B）；包内证据=acceptance/MANIFEST.txt（三轮 brief+raw+解析件 SHA256 清单）。

**验收结论：PASS**（整改全部落地且经 reviewer 三轮复审关闭；返工轮次=R1 REWORK→整改 6e38cde→R2 REWORK(语义指正)→整改 d50ce91→R3 PASS，同一问题 F3b-01 计 2 轮未触及三轮止损线）

## S2 新会话派复审与裁定归档

①本步骤目标：新会话（L-018.6 迁移：旧审查会话 6afdc528 上下文超阈值，转只读归档，指针已备份 gpt-reviewer-session.backup-before-f3rereview.json）派复审简报并采回裁定至关闭。

②修改文件：新增本任务 acceptance/ 证据与三份简报文件；派生无（复审用 gpt_dispatch 主链）。

③修改内容：三份冻结简报（R1=1197B 自包含；R2=967B；R3=1197B，均≤1200B 上限，字节数实测）；本次待验收 commit=R1 审 59319e6→R2 审 6e38cde→R3 审 d50ce91（PASS 绑定），终局后 docstring 建议 0c53c96（非阻断，reviewer 本人建议，无行为变更）。

④执行结果：R1 派单发送双验通过、采集一次成功（新会话无虚拟列表问题）裁定 REWORK（余 F3b-01：elapsed<7 无法区分 5s 总超时反实现）；R2 整改 6e38cde 后派单裁定 REWORK（语义指正：low_speed 模式下 timeout=5 映射 LOW_SPEED_TIME 而非 TIMEOUT_MS，对照未真正建立，required=构造 5 秒对照）；R3 按 required 新增 5s 对照测试（同一黑洞非 low_speed，4s<elapsed<8s+28）后派单裁定 **PASS**（F3b-01 关闭；非阻断建议=修正对照用例说明，已以 0c53c96 落实并推送）。R2 期间直连推送被重置一次，按 L-014 发现序切注册表代理 8514 一轮恢复。

⑤测试结果：未测（派单执行类；被测对象测试证据见 S1 ⑤）。

⑥验收证据引用：验收结论：PASS（复审闭环至 PASS）；dispatch 目录=phase0/logs/dispatch-2026-11-18T17-36-04（R1 REWORK artifact=4268f4bfe2e32950d00324c8322d092882ec3cffc90bc02c24ff88bd711ab899 3377B）、phase0/logs/dispatch-2026-11-18T17-40-56（R2 REWORK artifact=d61332f1cf4555dd1e47a07b21e7ab98a4111c1f4550a0eeea3fb6ee49a8f2f8 2630B）、phase0/logs/dispatch-2026-11-18T17-45-46（R3 终局 PASS artifact=ddf605d5d6bf4771b480aada4e178e277e89dd3d6568233c50a19a65846655b3 1848B）；包内证据=acceptance/reply-r1.json、acceptance/reply-r2.json、acceptance/reply-r3.json、acceptance/MANIFEST.txt。

**验收结论：PASS**（三轮收敛至 PASS，证据归档完整）
