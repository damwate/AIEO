# v0.1.0-standard-alpha 打版前置回归证据（2026-11-18）

- 命令与基线对照（handoff §10 / merge-proposal.md 口径）：M1 `python -m pytest tests/platform/ app/platform/tests/ -q`（基线 43）/ M2 `node --test`（app/gpt_controller，基线 65）/ M3 `node --test`（app/zcode_bridge，基线 53）/ M4 `python -m pytest app/git_worker/tests/ -q`（基线 24）。
- 实跑结果：M1 43 passed exit=0；M2 65 pass/0 fail exit=0；M3 54 pass/0 fail exit=0（基线 53，+1 系 M3 测试正常演进，如实注记）；M4 24 passed exit=0。
- 文件完整性：SHA256SUMS 覆盖本目录全部回归日志；RELEASE-RECORD.md 于 tag 创建后登记映射。
