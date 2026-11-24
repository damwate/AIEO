# seq11 实发简报字节核对 + 核对 SHA 更正（回应 codex 第 2/3 点）

## 1. 986 字节实测（codex 指出「986 字节仅按执行者报告」）
在 HEAD 树中实测，三者逐字吻合：
- `briefs/s3-targeted-r2.txt`（正文） = 948 字节
- 自动 marker = `[AIEO-ROUND:7f5677e366cb3ea4a3e98097]`（37 字节）+ `\n`（1 字节）= 38 字节
- 拼接后 = 986 字节 = `acceptance/s3-targeted-r2-accept/request.txt`（实发简报归档，986 字节）
- `request.txt` 内容 == `marker + "\n" + body.strip()`（逐字比对 True）
- ≤1200B 合规（`playwright_queue.py:98-100` 的 submit 校验已通过，seq11 submit 返回 state=QUEUED）

## 2. 核对 SHA 更正（关键）
codex 按我先前提供的 `7cc4fc1` 查不到 seq11 证据——**是我给的 SHA 错了**：
- `7cc4fc1` = 第一次推送的补证提交（仅含 `s3-supplement/` 等），确实不含 seq11 证据；
- seq11 证据在**其后的提交** `ee91c180`（裁定/补采/REVIEW-SCOPE）→ `e412346`（ST-05 格式修正/开工核对）→ `5c6f72d`（能力整理）；
- 本轮最终核对 SHA 应为 HEAD（本次补证提交后给出）。

## 3. 本轮补齐归档（codex 点名的缺项）
| codex 指出 | 补齐文件 |
|---|---|
| 授权原文/放宽轮次上限出处 | `USER-AUTHORIZATIONS.md`（6 条 user 消息 + AskUserQuestion「授权 push + 复核」选择，逐字+时间戳） |
| check-push 代理路径仍是报告 | `CHECK-PUSH-EXECUTION.md`（三次真实 push 的工具输出逐字转录，1080 代理、ahead=0） |
| 实发简报 986B | `BRIEF-BYTES-AND-SHA-CORRECTION.md`（本文件，实测逐字） |
| 发送/补采记录 | 已在 HEAD 树：`send-state.json`、`dispatch-run.log`、`recoll-result.json`、`units-diag.json`、`run.log`、`diag-report.json`、`reply.txt` |
| 原始裁定 + 完整 reply SHA256 | `reply.txt` + `result.json`（SHA256=`da668776dfe9da79c77782f662debd4d4aa2535ceab0674d5dde1c85e15714ca`，逐字核验一致） |
| seq10 ⑥ 口径应保留 PASS_WITH_CONSTRAINTS | `REVIEW-SCOPE-FOR-CODEX.md` §3 已修正 |
