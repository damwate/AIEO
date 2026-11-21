# C1-R2 证据绑定补齐（审查方 DEC-136 保留意见①）

- **A（agent-a）重跑现场绑定：**
  - 回执：phase0/logs/trial-p2-c1a-r2b-receipt.json = {"state": "SEND_CONFIRMED", "dispatch_dir": "dispatch-2026-11-21T04-48-44", "session_id": "6b0122e4-3254-83ec-aeff-151cd10ef892", "user_unit_key": "fallback-turn-0:0:user"}
  - 归档：phase0/logs/dispatch-2026-11-21T04-48-44/result.json
  - result.session_id = 6b0122e4-3254-83ec-aeff-151cd10ef892（与回执 session_id 一致：True）
  - artifact/reply SHA-256 = e7935a71b2365d7e21fd869350ba3bf7833018c0cbc4a66b1e86206711f7656f
  - completion_checks 全 true：True
- **B（agent-b）首跑现场绑定（与 A 并行成功的那次）：**
  - 回执：phase0/logs/trial-p2-c1b-r2-receipt.json = {"state": "SEND_CONFIRMED", "dispatch_dir": "dispatch-2026-11-21T04-43-29", "session_id": "6b0121a8-b684-83ec-946b-6363eb642717", "user_unit_key": "fallback-turn-0:0:user"}
  - 归档：D:/AIEO/phase0/logs/dispatch-2026-11-21T04-43-29/result.json
  - result.session_id = 6b0121a8-b684-83ec-946b-6363eb642717（与回执 session_id 一致：True）
  - artifact/reply SHA-256 = 9e24a9a5f48ec8f3dee7644d3722f6e9a1fb9c27ee5ec4f6fcbdac1cc4c71c7a
  - completion_checks 全 true：True
- **说明：** B 的独立回执在 C1-R2 首跑即已落盘（SUBAGENT 报告引用过），此文件把"回执↔归档"绑定显式化为审查方可直读的对应登记；A 的重跑（端口注册表锁整改后）另行绑定如上。首跑 A 的失败现场（dispatch-2026-11-20T23-56-20-582ed3fa…，注册表锁裸获取冲突）保留不改写。
